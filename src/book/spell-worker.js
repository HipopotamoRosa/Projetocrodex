// Corretor ortografico PT-BR.
//
// Roda o hunspell compilado para WebAssembly (ver ../dict/) dentro de um Web Worker
// dedicado, para que a inicializacao (~1.5s) e a analise de textos longos nunca
// travem a interface.
//
// Dicionario: VERO 3.2 pt-BR, de Raimundo Santos Moura (LGPLv3 / MPL), distribuido
// via wooorm/dictionaries (pasta "pt"). Os arquivos .aff/.dic ficam comprimidos em
// ../dict/ e sao lidos pelo proprio worker (mesma origem).

const INJECTED = self.__BK__ || {};

// A thread principal busca os arquivos (workers nao enxergam o service worker do
// editor, que so serve requisicoes da pagina) e envia aqui. Este caminho direto
// fica como reserva para quando o gerador ja esta publicado.
const GLUE_URL = INJECTED.glue || new URL("../dict/hunspell-wasm.js", import.meta.url).href;
const AFF_URL = new URL("../dict/pt_BR.aff.gz", import.meta.url).href;
const DIC_URL = new URL("../dict/pt_BR.dic.gz", import.meta.url).href;

// O glue do emscripten so entra no caminho "worker" se `importScripts` existir.
// Workers de modulo nao tem essa funcao, entao fornecemos um stub inofensivo.
if (typeof self.importScripts !== "function") self.importScripts = function () {};

// Mesmo padrao de tokenizacao usado no editor (src/book/editor.js).
export const TOKEN_SOURCE = "[\\p{L}\\p{M}]+(?:['\u2019\\-][\\p{L}\\p{M}]+)*";
const TOKEN_RE = new RegExp(TOKEN_SOURCE, "gu");

const MAX_SUGGESTIONS = 8;
const INIT_TIMEOUT = 90000;

let state = "idle";
let booting = null;
let lastHint = null;

let wasm = null;
let hunspell = 0;
let fnSpell = null;
let fnSuggest = null;
let fnFreeList = null;
let fnAdd = null;
let fnRemove = null;
let sugPtr = 0;

const verdicts = new Map();
const learned = new Set();
const ignored = new Set();

function post(msg, transfer) {
  if (transfer && transfer.length) self.postMessage(msg, transfer);
  else self.postMessage(msg);
}

function fetchGz(url, onProgress) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status + " ao buscar " + url);
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body || !total || typeof res.body.getReader !== "function") return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    return (function pump() {
      return reader.read().then((r) => {
        if (r.done) {
          const out = new Uint8Array(got);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          return out.buffer;
        }
        chunks.push(r.value);
        got += r.value.length;
        if (onProgress) onProgress(got / total);
        return pump();
      });
    })();
  });
}

async function gunzipText(buf) {
  if (typeof DecompressionStream !== "function") throw new Error("Este navegador nao suporta DecompressionStream");
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

async function start(hint) {
  if (state === "ready") return;
  if (booting) return booting;
  hint = hint || {};
  lastHint = hint;
  booting = (async () => {
    state = "loading";
    post({ t: "progress", stage: "wasm", pct: 0 });
    // O glue chega como texto e vira um blob aqui dentro: importar um blob da
    // propria thread e permitido, enquanto `fetch`/`import` de src/ nao e.
    let glueUrl = GLUE_URL;
    if (hint.glueText) {
      glueUrl = URL.createObjectURL(new Blob([hint.glueText], { type: "text/javascript" }));
    }
    let mod;
    try {
      mod = await import(glueUrl);
    } finally {
      if (hint.glueText) { try { URL.revokeObjectURL(glueUrl); } catch (e) {} }
    }
    const box = {};
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("tempo esgotado ao iniciar o wasm")), INIT_TIMEOUT);
      // O modulo do emscripten e um "thenable": nao pode ser resolvido direto
      // dentro de um Promise (daria deadlock), por isso o box.
      box.m = mod.default({ locateFile: (p) => p, print() {}, printErr() {} });
      box.m.then(() => { clearTimeout(timer); resolve(); });
    });
    wasm = box.m;
    post({ t: "progress", stage: "wasm", pct: 1 });

    post({ t: "progress", stage: "dict", pct: 0 });
    const affBuf = hint.aff || await fetchGz(AFF_URL, (p) => post({ t: "progress", stage: "dict", pct: p * 0.08 }));
    const dicBuf = hint.dic || await fetchGz(DIC_URL, (p) => post({ t: "progress", stage: "dict", pct: 0.08 + p * 0.62 }));
    const aff = await gunzipText(affBuf);
    post({ t: "progress", stage: "dict", pct: 0.74 });
    const dic = await gunzipText(dicBuf);
    post({ t: "progress", stage: "dict", pct: 0.88 });

    wasm.FS.mkdir("/d");
    wasm.FS.writeFile("/d/pt.aff", aff);
    wasm.FS.writeFile("/d/pt.dic", dic);
    const create = wasm.cwrap("Hunspell_create", "number", ["string", "string"]);
    hunspell = create("/d/pt.aff", "/d/pt.dic");
    if (!hunspell) throw new Error("nao consegui carregar o dicionario pt-BR");
    fnSpell = wasm.cwrap("Hunspell_spell", "number", ["number", "string"]);
    fnSuggest = wasm.cwrap("Hunspell_suggest", "number", ["number", "number", "string"]);
    fnFreeList = wasm.cwrap("Hunspell_free_list", "number", ["number", "number", "number"]);
    fnAdd = wasm.cwrap("Hunspell_add", "number", ["number", "string"]);
    fnRemove = wasm.cwrap("Hunspell_remove", "number", ["number", "string"]);
    sugPtr = wasm._malloc(4);

    state = "ready";
    post({ t: "progress", stage: "ready", pct: 1 });
    post({ t: "ready" });
  })();
  try {
    await booting;
  } catch (err) {
    booting = null;
    state = "error";
    post({ t: "fatal", message: String((err && err.message) || err) });
    throw err;
  }
}

function spellRaw(word) {
  try {
    return fnSpell(hunspell, word) === 1;
  } catch (e) {
    return false;
  }
}

function spellOne(word) {
  if (learned.has(word)) return true;
  if (ignored.has(word)) return true;
  const cached = verdicts.get(word);
  if (cached !== undefined) return cached === 1;
  let ok = spellRaw(word);
  const lower = word.toLowerCase();
  if (!ok && lower !== word && (learned.has(lower) || ignored.has(lower) || spellRaw(lower))) ok = true;
  verdicts.set(word, ok ? 1 : 0);
  return ok;
}

function isCorrect(word) {
  if (spellOne(word)) return true;
  if (word.indexOf("-") > 0) {
    const parts = word.split("-").filter(Boolean);
    if (parts.length > 1 && parts.every(spellOne)) return true;
  }
  return false;
}

function tokenize(text) {
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) out.push(m[0]);
  return out;
}

function handleCheck(msg) {
  const text = String(msg.text || "");
  const tokens = tokenize(text);
  const bad = [];
  const seen = new Set();
  for (const w of tokens) {
    if (isCorrect(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    bad.push(w);
  }
  post({ t: "checked", id: msg.id, words: tokens.length, bad });
}

function handleSuggest(msg) {
  const word = String(msg.word || "");
  const list = [];
  if (state === "ready" && word && fnSuggest) {
    const n = fnSuggest(hunspell, sugPtr, word);
    if (n > 0) {
      const arrPtr = wasm.HEAP32[sugPtr >> 2];
      const lim = Math.min(n, msg.limit || MAX_SUGGESTIONS);
      for (let i = 0; i < lim; i++) list.push(wasm.UTF8ToString(wasm.HEAP32[(arrPtr >> 2) + i]));
      fnFreeList(hunspell, sugPtr, n);
    }
  }
  post({ t: "suggestions", id: msg.id, word, list });
}

function variants(word) {
  const out = [word];
  const lower = word.toLowerCase();
  if (lower !== word) out.push(lower);
  return out;
}

function invalidate(word) {
  for (const v of variants(word)) verdicts.delete(v);
}

function handleLearn(msg) {
  const words = Array.isArray(msg.words) ? msg.words : [];
  for (const raw of words) {
    const w = String(raw == null ? "" : raw).trim();
    if (!w || w.length > 60) continue;
    for (const v of variants(w)) {
      learned.add(v);
      ignored.delete(v);
      verdicts.delete(v);
      if (state === "ready" && fnAdd) { try { fnAdd(hunspell, v); } catch (e) {} }
    }
  }
  post({ t: "learned", id: msg.id, count: words.length });
}

function handleIgnore(msg) {
  const words = Array.isArray(msg.words) ? msg.words : [];
  for (const raw of words) {
    const w = String(raw == null ? "" : raw).trim();
    if (!w) continue;
    for (const v of variants(w)) { ignored.add(v); verdicts.delete(v); }
  }
  post({ t: "ignored", id: msg.id, count: words.length });
}

function handleForget(msg) {
  const words = Array.isArray(msg.words) ? msg.words : [];
  for (const raw of words) {
    const w = String(raw == null ? "" : raw).trim();
    if (!w) continue;
    for (const v of variants(w)) {
      learned.delete(v);
      ignored.delete(v);
      verdicts.delete(v);
      if (state === "ready" && fnRemove) { try { fnRemove(hunspell, v); } catch (e) {} }
    }
  }
  post({ t: "forgotten", id: msg.id, count: words.length });
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  const type = msg.t;
  if (type === "init") {
    start(msg).then(
      () => {},
      (err) => post({ t: "fatal", id: msg.id, message: String((err && err.message) || err) })
    );
    return;
  }
  if (type === "check") {
    if (state !== "ready") { post({ t: "checked", id: msg.id, words: 0, bad: [], deferred: true }); start(lastHint).catch(() => {}); return; }
    handleCheck(msg);
    return;
  }
  if (type === "suggest") { handleSuggest(msg); return; }
  if (type === "learn") { handleLearn(msg); return; }
  if (type === "ignore") { handleIgnore(msg); return; }
  if (type === "forget") { handleForget(msg); return; }
  if (type === "ping") { post({ t: "pong", id: msg.id, state }); }
};
