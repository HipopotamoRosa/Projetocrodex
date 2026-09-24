// Camada de acesso ao corretor ortografico PT-BR.
//
// O dicionario (hunspell em WebAssembly) roda num Web Worker montado a partir de
// um blob, com os arquivos buscados pela thread principal. Isso e necessario
// porque a pagina roda num iframe cujo <base> aponta para perchance.org, e
// workers nao podem ser criados a partir de outra origem.
//
// Alem de manter o worker vivo, este modulo cuida do dicionario pessoal, das
// palavras ignoradas e dos nomes do universo (para que personagens e lugares do
// arquivo nunca aparecam como erro).
//
// Se o worker nao puder ser criado (navegador antigo, sem DecompressionStream,
// etc.), `spell.state` vira "error" e o editor cai no corretor nativo do navegador.

import { store } from "../store.js";
import { kvFolder } from "../universe.js";

const BOOK_FOLDER = "livro";
const PREFS_KEY = "ortografia";

// Palavras do proprio aplicativo: nao entram no dicionario pessoal do usuario,
// mas evitam que o nome do app apareca sublinhado como erro.
const BUILTIN_WORDS = ["Codex"];

const INIT_TIMEOUT = 180000;
const CHECK_TIMEOUT = 45000;
const SUGGEST_TIMEOUT = 20000;
const SHORT_TIMEOUT = 15000;

// Igual ao TOKEN_SOURCE do worker.
export const TOKEN_SOURCE = "[\\p{L}\\p{M}]+(?:['\u2019\\-][\\p{L}\\p{M}]+)*";
const TOKEN_RE = new RegExp(TOKEN_SOURCE, "gu");

export function tokenize(text) {
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

// Candidatos de URL: o caminho usado pelos modulos (perchance.org/src/...) e o
// caminho do proprio iframe (funciona no editor, servido pelo service worker).
function candidates(rel) {
  const out = [];
  const push = (u) => { if (u && out.indexOf(u) < 0) out.push(u); };
  try { push(new URL(rel, import.meta.url).href); } catch (e) {}
  try { push(new URL("src/book/" + rel.replace(/^\.\.\//, "../").replace(/^\.\//, ""), location.href).href); } catch (e) {}
  try { push(new URL(rel.replace(/^\.\.\//, "src/").replace(/^\.\//, "src/book/"), location.origin + "/").href); } catch (e) {}
  return out;
}

const URLS = {
  glue: candidates("../dict/hunspell-wasm.js"),
  aff: candidates("../dict/pt_BR.aff.gz"),
  dic: candidates("../dict/pt_BR.dic.gz"),
};

// O worker precisa ser servido pela propria origem do iframe: um blob nao
// consegue enxergar o service worker do editor e um worker de outra origem e
// bloqueado pelo navegador.
function workerUrl() {
  return new URL("src/book/spell-worker.js", location.origin + "/").href;
}

async function fetchAny(urls, kind) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error("HTTP " + res.status + " em " + url); continue; }
      return kind === "text" ? await res.text() : await res.arrayBuffer();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("nao consegui baixar os arquivos do corretor");
}

let assets = null;
async function loadAssets(onProgress) {
  if (assets) return assets;
  const glueText = await fetchAny(URLS.glue, "text");
  onProgress && onProgress(0.42);
  const aff = await fetchAny(URLS.aff, "buf");
  onProgress && onProgress(0.6);
  const dic = await fetchAny(URLS.dic, "buf");
  onProgress && onProgress(0.8);
  assets = { glueText, aff, dic };
  return assets;
}

let worker = null;
let broken = false;
let state = "idle";
let stage = "";
let progress = 0;
let failure = "";
let seq = 0;
let bootPromise = null;
let readyWait = null;
let errorCount = 0;

const pending = new Map();
const listeners = new Set();
const extras = { words: [], ignored: [] };
let extrasLoaded = false;
let universeSignature = "";
let checkSeq = 0;

function info() {
  return { state, stage, progress, failure };
}

function notify() {
  const snapshot = info();
  for (const cb of [...listeners]) { try { cb(snapshot); } catch (e) { console.error(e); } }
}

function onStatus(cb) {
  listeners.add(cb);
  cb(info());
  return () => listeners.delete(cb);
}

function rejectAll(reason) {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(reason);
  }
  pending.clear();
}

function teardown() {
  try { if (worker) worker.terminate(); } catch (e) {}
  worker = null;
}

function disable(message) {
  broken = true;
  errorCount = 0;
  state = "error";
  failure = message || "corretor indisponivel";
  console.warn("[corretor pt-BR]", failure);
  if (readyWait) { clearTimeout(readyWait.timer); readyWait.reject(new Error(failure)); readyWait = null; }
  rejectAll(new Error(failure));
  teardown();
  notify();
}

function spawn() {
  const url = workerUrl();
  let w;
  try {
    w = new Worker(url, { type: "module" });
  } catch (e) {
    throw e;
  }
  w.onmessage = (ev) => {
    const msg = ev.data || {};
    if (msg.t === "progress") {
      stage = msg.stage || stage;
      if (typeof msg.pct === "number") {
        const pct = Math.max(0, Math.min(1, msg.pct));
        const base = stage === "wasm" ? 0.8 : 0.85;
        const span = stage === "wasm" ? 0.05 : 0.14;
        progress = Math.max(progress, base + pct * span);
      }
      if (state === "loading") notify();
      return;
    }
    if (msg.t === "ready") {
      if (readyWait) { clearTimeout(readyWait.timer); const r = readyWait; readyWait = null; r.resolve(); }
      return;
    }
    if (msg.t === "fatal") {
      if (readyWait) { clearTimeout(readyWait.timer); const r = readyWait; readyWait = null; r.reject(new Error(msg.message || "falha ao iniciar")); }
      else { state = "error"; failure = msg.message || "falha ao iniciar"; notify(); }
      rejectAll(new Error(msg.message || "falha ao iniciar"));
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve(msg);
  };
  w.onerror = (err) => {
    const text = (err && err.message) || "erro no worker do corretor";
    errorCount++;
    if (state !== "ready" || errorCount > 3) disable(text);
    else if (err && err.preventDefault) err.preventDefault();
  };
  worker = w;
  return w;
}

function call(msg, timeout, transfer) {
  if (!worker) return Promise.reject(new Error("corretor indisponivel"));
  const id = ++seq;
  msg.id = id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("tempo esgotado (" + msg.t + ")"));
    }, timeout || CHECK_TIMEOUT);
    pending.set(id, { resolve, reject, timer, type: msg.t });
    try {
      if (transfer && transfer.length) worker.postMessage(msg, transfer);
      else worker.postMessage(msg);
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e);
    }
  });
}

async function loadExtras() {
  if (extrasLoaded) return;
  extrasLoaded = true;
  try {
    const saved = await kvFolder(BOOK_FOLDER).get(PREFS_KEY);
    if (saved && typeof saved === "object") {
      if (Array.isArray(saved.words)) extras.words = saved.words.filter((w) => typeof w === "string");
      if (Array.isArray(saved.ignored)) extras.ignored = saved.ignored.filter((w) => typeof w === "string");
    }
  } catch (e) { /* primeira vez: nada salvo ainda */ }
}

function saveExtras() {
  kvFolder(BOOK_FOLDER).set(PREFS_KEY, { words: extras.words.slice(-4000), ignored: extras.ignored.slice(-4000) }).catch(() => {});
}

function universeWords() {
  const out = [];
  for (const name of store.mentionNames()) {
    for (const piece of String(name).split(/[^\p{L}\p{M}]+/u)) {
      if (piece.length >= 2) out.push(piece);
    }
  }
  return [...new Set(out)];
}

async function syncUniverse(force) {
  const words = universeWords();
  const sig = words.length + "|" + words.join(",");
  if (!force && sig === universeSignature) return;
  universeSignature = sig;
  if (!words.length) return;
  try { await call({ t: "learn", words }, SHORT_TIMEOUT); } catch (e) {}
}

async function prepare() {
  if (state === "ready") return true;
  if (state === "error") return false;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    state = "loading";
    stage = "baixando";
    progress = 0.02;
    notify();
    try {
      await loadAssets((p) => { progress = p; stage = "baixando"; notify(); });
      stage = "iniciando";
      notify();
      const w = spawn();
      await new Promise((resolve, reject) => {
        readyWait = { resolve, reject };
        readyWait.timer = setTimeout(() => {
          readyWait = null;
          reject(new Error("tempo esgotado ao carregar o dicionario"));
        }, INIT_TIMEOUT);
        w.postMessage({ t: "init", glueText: assets.glueText, aff: assets.aff, dic: assets.dic });
      });
    } catch (e) {
      teardown();
      state = "error";
      failure = String((e && e.message) || e);
      console.warn("[corretor pt-BR]", failure);
      notify();
      return false;
    }
    state = "ready";
    progress = 1;
    stage = "ready";
    errorCount = 0;
    notify();
    await loadExtras();
    try { await call({ t: "learn", words: BUILTIN_WORDS }, SHORT_TIMEOUT); } catch (e) {}
    if (extras.words.length) { try { await call({ t: "learn", words: extras.words }, SHORT_TIMEOUT); } catch (e) {} }
    if (extras.ignored.length) { try { await call({ t: "ignore", words: extras.ignored }, SHORT_TIMEOUT); } catch (e) {} }
    await syncUniverse(true);
    return true;
  })();
  const ok = await bootPromise;
  if (!ok) bootPromise = null;
  return ok;
}

async function check(text) {
  const mine = ++checkSeq;
  const ok = await prepare();
  if (!ok) return { ok: false, bad: [], words: 0 };
  try {
    await syncUniverse();
    const res = await call({ t: "check", text }, CHECK_TIMEOUT);
    if (mine !== checkSeq) return { ok: false, bad: [], words: 0, stale: true };
    return { ok: true, bad: res.bad || [], words: res.words || 0 };
  } catch (e) {
    return { ok: false, bad: [], words: 0, error: String((e && e.message) || e) };
  }
}

async function suggest(word, limit) {
  if (state !== "ready") return { ok: false, list: [] };
  try {
    const res = await call({ t: "suggest", word, limit }, SUGGEST_TIMEOUT);
    return { ok: true, list: res.list || [] };
  } catch (e) {
    return { ok: false, list: [] };
  }
}

async function learn(words, persist) {
  const list = (words || []).map((w) => String(w || "").trim()).filter(Boolean);
  if (!list.length) return false;
  if (state === "ready") { try { await call({ t: "learn", words: list }, SHORT_TIMEOUT); } catch (e) { return false; } }
  if (persist !== false) {
    const set = new Set(extras.words);
    for (const w of list) { set.add(w); set.add(w.toLowerCase()); }
    extras.words = [...set];
    saveExtras();
  }
  return true;
}

async function ignore(words, persist) {
  const list = (words || []).map((w) => String(w || "").trim()).filter(Boolean);
  if (!list.length) return false;
  if (state === "ready") { try { await call({ t: "ignore", words: list }, SHORT_TIMEOUT); } catch (e) { return false; } }
  if (persist !== false) {
    const set = new Set(extras.ignored);
    for (const w of list) { set.add(w); set.add(w.toLowerCase()); }
    extras.ignored = [...set];
    saveExtras();
  }
  return true;
}

async function forget(words) {
  const list = (words || []).map((w) => String(w || "").trim()).filter(Boolean);
  if (!list.length) return false;
  const low = new Set(list.flatMap((w) => [w, w.toLowerCase()]));
  extras.words = extras.words.filter((w) => !low.has(w));
  extras.ignored = extras.ignored.filter((w) => !low.has(w));
  saveExtras();
  if (state === "ready") { try { await call({ t: "forget", words: list }, SHORT_TIMEOUT); } catch (e) { return false; } }
  return true;
}

export const spell = {
  get state() { return state; },
  get failure() { return failure; },
  get ready() { return state === "ready"; },
  get loading() { return state === "loading"; },
  get available() { return state !== "error"; },
  get progress() { return progress; },
  get stage() { return stage; },
  get personalWords() { return extras.words.slice(); },
  get ignoredWords() { return extras.ignored.slice(); },
  prepare,
  check,
  suggest,
  learn,
  ignore,
  forget,
  onStatus,
  syncUniverse,
  tokenize,
  async reload() {
    teardown();
    broken = false;
    state = "idle";
    bootPromise = null;
    failure = "";
    errorCount = 0;
    progress = 0;
    rejectAll(new Error("corretor reiniciado"));
    notify();
    return prepare();
  },
};
