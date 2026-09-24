// "Somente leitura": ver um Codex publicado por outra pessoa.
//
// Como funciona: o autor publica um instantâneo JSON do Codex (o mesmo formato
// do export de um universo: `kind: "codex-universe"`) num arquivo de texto
// público do upload-plugin, com um nome aleatório longo. O link que ele reparte é
//
//   https://perchance.org/<gerador>#ver=<nome-do-arquivo>
//
// Quem abre esse link cai neste modo: o instantâneo é baixado e guardado apenas
// na MEMÓRIA da aba (nenhuma pasta do kv/IndexedDB é tocada) e a interface
// esconde tudo o que escreve. O arquivo publicado só pode ser reescrito por quem
// tem a `editKey`, que fica no navegador do autor — quem vê, só vê.
//
// O `?ver=` também funciona: a plataforma copia a query string e o hash da página
// de cima para o iframe do gerador.

import { esc, copyText } from "./util.js";
import { toast } from "./ui/dom.js";

export const VIEW = {
  active: false,      // estamos no modo somente leitura?
  id: null,           // nome do arquivo publicado
  ready: null,        // promessa do download + validação
  error: null,        // "notfound" | "retired" | "formato" | "rede"
  payload: null,
  meta: null,
  publicadoEm: null,
};

// Pastas que formam um Codex (as mesmas de `UNIVERSE_FOLDERS`).
const FOLDERS = ["codex", "codex_images", "livro", "livro_img", "timeline", "competencia"];

// O instantâneo vive só aqui: pasta -> Map(chave -> valor).
const MEM = new Map();

// ------------------------------------------------------------------ endereços

const ID_RE = /^[a-z0-9-]{6,200}$/;

export function viewIdFromUrl() {
  const hash = String(location.hash || "").replace(/^#/, "");
  for (const part of hash.split("&")) {
    if (part.startsWith("ver=")) {
      const id = part.slice(4);
      if (ID_RE.test(id)) return id;
    }
  }
  const m = String(location.search || "").match(/[?&]ver=([a-z0-9-]{6,200})/);
  return m ? m[1] : null;
}

export function shareUrl(id) {
  const name = window.generatorName || "";
  return "https://perchance.org/" + name + "#ver=" + (id || VIEW.id || "");
}

// O arquivo público em si (o `?v=` derruba a cópia velha do CDN depois de uma
// atualização — quem publica vê o próprio texto novo antes de todo mundo).
export function snapshotUrl(id, bust) {
  const name = window.generatorName || "";
  return "https://editable.uploads.dev/file/" + name + "/" + (id || VIEW.id || "")
    + (bust ? "?v=" + Date.now() : "");
}

export function novoShareId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let buf = new Uint8Array(26);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  let out = "codex-";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

// ------------------------------------------------------------------ pastas

function clone(value) {
  if (value === undefined || value === null) return value;
  try { return structuredClone(value); } catch (err) { return value; }
}

function mapOf(name) {
  if (!MEM.has(name)) MEM.set(name, new Map());
  return MEM.get(name);
}

// Pasta com a mesma cara das pastas do kv-plugin, mas só na memória.
function memoryFolder(name) {
  const map = mapOf(name);
  return {
    __somenteLeitura: true,
    async get(key) { return map.has(key) ? clone(map.get(key)) : undefined; },
    async getMany(keys) { return (keys || []).map((k) => (map.has(k) ? clone(map.get(k)) : undefined)); },
    async set(key, value) { map.set(key, clone(value)); },
    async setMany(pairs) { for (const p of pairs || []) if (Array.isArray(p) && p.length === 2) map.set(p[0], clone(p[1])); },
    async delete(key) { map.delete(key); },
    async deleteMany(keys) { for (const k of keys || []) map.delete(k); },
    async keys() { return [...map.keys()]; },
    async values() { return [...map.values()].map(clone); },
    async entries() { return [...map.entries()].map(([k, v]) => [k, clone(v)]); },
    async clear() { map.clear(); },
    async update(key, fn) { map.set(key, clone(fn(map.has(key) ? clone(map.get(key)) : undefined))); },
  };
}

// Usada pelo `kvFolder()` de universe.js quando o modo somente leitura está ligado.
export function viewFolder(name) {
  return memoryFolder(String(name || "").replace(/^u_[a-z0-9_]+_/, ""));
}

// ------------------------------------------------------------------ download

function seed(docs) {
  MEM.clear();
  for (const name of FOLDERS) MEM.set(name, new Map());
  for (const [name, entries] of Object.entries(docs || {})) {
    const map = mapOf(name);
    if (Array.isArray(entries)) {
      for (const pair of entries) if (Array.isArray(pair) && pair.length === 2) map.set(pair[0], pair[1]);
    } else if (entries && typeof entries === "object") {
      for (const [k, v] of Object.entries(entries)) map.set(k, v);
    }
  }
}

async function load(id) {
  let res;
  try {
    res = await fetch(snapshotUrl(id, true), { cache: "no-store" });
  } catch (err) {
    throw new Error("rede");
  }
  if (!res.ok) throw new Error(res.status === 404 ? "notfound" : "rede");
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error("formato");
  }
  if (!payload || payload.kind !== "codex-universe") throw new Error("formato");
  if (payload.retired) throw new Error("retired");
  if (!payload.docs) throw new Error("formato");
  VIEW.payload = payload;
  VIEW.meta = payload.meta || {};
  VIEW.publicadoEm = payload.publishedAt || payload.exportedAt || null;
  seed(payload.docs);
}

// Liga o modo somente leitura (se o endereço pedir). Chamado no começo do boot.
export function startView() {
  const id = viewIdFromUrl();
  if (!id) return false;
  VIEW.active = true;
  VIEW.id = id;
  VIEW.ready = load(id).catch((err) => { VIEW.error = err && err.message ? err.message : "rede"; });
  return true;
}

export function viewErrorHtml() {
  const msg = VIEW.error === "notfound"
    ? "Não encontrei este Codex publicado. O link pode estar errado, ou o autor despublicou."
    : VIEW.error === "retired"
      ? "O autor despublicou este Codex."
      : VIEW.error === "formato"
        ? "O arquivo publicado não é um Codex deste app."
        : "Não consegui baixar o Codex publicado. Confira a sua conexão e recarregue a página.";
  const self = "https://perchance.org/" + (window.generatorName || "");
  return `<div class="loadBox roError">
    <div class="roErrorIcon">👁️</div>
    <h2>Somente leitura</h2>
    <p>${esc(msg)}</p>
    <p><a class="btn" href="${esc(self)}">Abrir o meu Codex</a></p>
  </div>`;
}

export function bloqueado() {
  toast("Somente leitura — este Codex é publicado, ninguém pode alterá-lo", "info", 3200);
}

// ------------------------------------------------------------------ publicar

const SHARE_KEY = "codex:viewShare";

export function shares() {
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" ? data : {};
  } catch (err) {
    return {};
  }
}

function saveShares(map) {
  try { localStorage.setItem(SHARE_KEY, JSON.stringify(map)); } catch (err) { /* sem localStorage, sem registro */ }
}

export function shareFor(universeId) {
  return shares()[universeId] || null;
}

// Teto do arquivo editável é 5 MiB; publicamos com folga.
const LIMITE = 4.6 * 1024 * 1024;

function imageRefs(node, out) {
  if (!node) return out;
  if (typeof node === "string") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) imageRefs(item, out);
    return out;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && value.startsWith("data:image/") && value.length > 4096) out.push({ parent: node, key });
      else imageRefs(value, out);
    }
  }
  return out;
}

function fileToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("imagem"));
    reader.readAsDataURL(blob);
  });
}

async function encolherImagem(dataUrl, maxPx, quality) {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const out = await canvas.convertToBlob({ type: "image/webp", quality });
  const url = await fileToDataUrl(out);
  return url.length < dataUrl.length ? url : dataUrl;
}

// Apara o instantâneo até caber no arquivo publicado: encolhe primeiro as
// imagens maiores, e só então parte para uma segunda passada mais dura.
async function aparaTexto(payload, onFase) {
  let text = JSON.stringify(payload);
  if (text.length <= LIMITE) return { text, enxuto: false };
  if (onFase) onFase("encolhendo as imagens");
  const refs = imageRefs(payload, []);
  refs.sort((a, b) => String(b.parent[b.key]).length - String(a.parent[a.key]).length);
  for (const pass of [{ maxPx: 900, quality: 0.78, min: 24 * 1024 }, { maxPx: 480, quality: 0.6, min: 8 * 1024 }]) {
    for (const ref of refs) {
      const atual = ref.parent[ref.key];
      if (typeof atual !== "string" || !atual.startsWith("data:image/") || atual.length < pass.min) continue;
      try {
        ref.parent[ref.key] = await encolherImagem(atual, pass.maxPx, pass.quality);
      } catch (err) { /* imagem estranha: fica como está */ }
      text = JSON.stringify(payload);
      if (text.length <= LIMITE) return { text, enxuto: true };
    }
  }
  return { text, enxuto: true };
}

export const ERROS_PUBLICACAO = {
  editable_requires_saved_generator: "Salve o gerador primeiro (botão de salvar no editor do Perchance) e publique de novo — o arquivo publicado mora no servidor.",
  over_daily_allowance: "Você publicou muitas vezes hoje. Espere um pouco, ou publique amanhã.",
  file_too_big: "Este Codex é grande demais para publicar. Tire algumas imagens e tente de novo.",
  invalid_filetype: "O servidor recusou o arquivo publicado.",
};

export async function publicar(universeId, payload, onFase) {
  const { text, enxuto } = await aparaTexto(payload, onFase);
  const mapa = shares();
  const atual = mapa[universeId] || null;
  const id = atual && atual.id ? atual.id : novoShareId();
  const editKey = atual && atual.editKey ? atual.editKey : null;
  const res = await root.uploadPlugin.editable.set(id, text, editKey ? { editKey } : undefined);
  if (!res || res.error) {
    const msg = res && res.error ? (ERROS_PUBLICACAO[res.error] || "Não consegui publicar (" + res.error + ")") : "Não consegui publicar este Codex";
    throw new Error(msg);
  }
  if (res.superseded) throw new Error("A publicação anterior ainda estava sendo gravada — tente de novo em alguns segundos.");
  const entry = {
    id,
    editKey: res.editKey || editKey,
    publicadoEm: Date.now(),
    bytes: text.length,
    enxuto: !!enxuto,
    nome: (payload.meta && payload.meta.nome) || "Codex",
    despublicado: false,
  };
  mapa[universeId] = entry;
  saveShares(mapa);
  return entry;
}

export async function despublicar(universeId) {
  const mapa = shares();
  const atual = mapa[universeId];
  if (!atual) return null;
  if (!atual.editKey) {
    delete mapa[universeId];
    saveShares(mapa);
    return null;
  }
  const payload = JSON.stringify({ app: "codex", kind: "codex-universe", version: 1, retired: true, exportedAt: new Date().toISOString() });
  const res = await root.uploadPlugin.editable.set(atual.id, payload, { editKey: atual.editKey });
  if (!res || res.error) throw new Error("Não consegui despublicar agora");
  atual.despublicado = true;
  atual.bytes = payload.length;
  mapa[universeId] = atual;
  saveShares(mapa);
  return atual;
}

// ------------------------------------------------------------------ interface

function fmtData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// Faixa fixa na parte de baixo: diz que é somente leitura e dá o link de volta.
export function installReadonlyChrome() {
  document.documentElement.dataset.readonly = "1";

  const nome = (VIEW.meta && VIEW.meta.nome) || "Codex publicado";
  const quando = fmtData(VIEW.publicadoEm);
  const self = "https://perchance.org/" + (window.generatorName || "");
  const banner = document.createElement("div");
  banner.id = "roBanner";
  banner.className = "roBanner";
  banner.innerHTML = `<span class="roEye">👁️</span>
    <span class="roText"><span class="roLong"><strong>Somente leitura</strong> — você está vendo <b>${esc(nome)}</b>, um Codex publicado${quando ? " em " + esc(quando) : ""}. Nada aqui pode ser alterado.</span><span class="roShort"><strong>Somente leitura</strong> — nada aqui pode ser alterado.</span></span>
    <button class="roBtn" id="roCopyBtn" title="Copiar o link deste Codex">⧉ Copiar link</button>
    <a class="roBtn" href="${esc(self)}" title="Abrir o Codex deste navegador">Abrir o meu Codex</a>`;
  document.body.appendChild(banner);
  const copyBtn = banner.querySelector("#roCopyBtn");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await copyText(shareUrl(VIEW.id));
      toast("Link copiado — mande para quem quiser mostrar", "success");
    };
  }

  const uniBtn = document.getElementById("uniBtn");
  if (uniBtn) {
    uniBtn.title = "Você está vendo um Codex publicado (somente leitura)";
    uniBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); bloqueado(); };
  }
}
