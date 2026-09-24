import { q, el, toast, openModal, confirmDialog } from "./ui/dom.js";
import { esc, copyText } from "./util.js";

const JSZIP_URL = "https://esm.sh/jszip@3.10.1";
const BACKUP_FOLDER = "codex_sitebackups";
const KEEP_BACKUPS = 3;

export const SITE_FILES = [
  "src/ai.js",
  "src/backupZip.js",
  "src/codeBackup.js",
  "src/data.js",
  "src/emitter.js",
  "src/github.js",
  "src/graph.js",
  "src/main.js",
  "src/sample.js",
  "src/store.js",
  "src/universe.js",
  "src/util.js",
  "src/view.js",
  "src/style.css",
  "src/README.md",
  "src/SPEC.md",
  "src/TODO.md",
  "src/book/editor.js",
  "src/book/richtext.js",
  "src/book/spell-worker.js",
  "src/book/spell.js",
  "src/book/store.js",
  "src/book/view.js",
  "src/competencia/panel.js",
  "src/competencia/render.js",
  "src/competencia/store.js",
  "src/competencia/view.js",
  "src/dict/hunspell-wasm.js",
  "src/dict/pt_BR.aff.gz",
  "src/dict/pt_BR.dic.gz",
  "src/present/view.js",
  "src/timeline/store.js",
  "src/timeline/view.js",
  "src/tools/build-standalone.mjs",
  "src/tools/standalone-storage-shim.js",
  "src/ui/aipanels.js",
  "src/ui/browse.js",
  "src/ui/detail.js",
  "src/ui/dom.js",
  "src/ui/entityPicker.js",
  "src/ui/graphview.js",
  "src/ui/lightbox.js",
  "src/ui/media.js",
  "src/ui/relations.js",
  "src/ui/settings.js",
  "src/ui/state.js",
  "src/ui/universes.js",
  "src/ui/wordlink.js",
];

let zipLib = null;

async function getZip() {
  if (zipLib) return zipLib;
  const mod = await import(JSZIP_URL);
  zipLib = mod.default || mod.JSZip || mod;
  return zipLib;
}

function siteFolder() {
  return root.kv[BACKUP_FOLDER];
}

export function hashBytes(u8) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) {
    h1 ^= u8[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return ("0000000" + (h1 >>> 0).toString(16)).slice(-8);
}

export function isSiteCodeZip(names) {
  const lower = names.map((n) => String(n).toLowerCase());
  const hasMain = lower.some((n) => n === "main.pjs" || n.endsWith("/main.pjs"));
  const hasHtml = lower.some((n) => n === "index.html" || n.endsWith("/index.html"));
  const hasSrc = lower.some((n) => n === "src/main.js" || n.endsWith("/src/main.js"));
  return hasMain && hasHtml && hasSrc;
}

function normalizeSitePath(n) {
  const low = String(n).toLowerCase();
  const keys = ["main.pjs", "index.html", "src/"];
  let cut = -1;
  for (const k of keys) {
    const i = low.lastIndexOf(k);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut > 0) return String(n).slice(cut);
  return String(n).replace(/^\/+/, "");
}

async function fetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function savedText(kind) {
  const name = window.generatorName || "";
  if (kind === "lists") {
    const r = await fetch("https://perchance.org/api/getGeneratorsAndDependencies?generatorNames=" + encodeURIComponent(name));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const g = j.generators && j.generators[name];
    if (!g || typeof g.code !== "string") throw new Error("resposta sem código");
    return g.code;
  }
  if (!root.superFetch) throw new Error("busca indisponível");
  const r = await root.superFetch("https://perchance.org/api/getGeneratorHtml?generatorName=" + encodeURIComponent(name));
  const t = await r.text();
  if (!t || t.length < 50) throw new Error("resposta vazia");
  return t;
}

const enc = new TextEncoder();

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export async function exportCodeZip() {
  const JSZip = await getZip();
  const zip = new JSZip();
  const missing = [];
  const encFile = (text) => enc.encode(text);
  try {
    zip.file("main.pjs", encFile(await savedText("lists")));
  } catch (err) {
    missing.push("main.pjs");
  }
  try {
    zip.file("index.html", encFile(await savedText("html")));
  } catch (err) {
    missing.push("index.html");
  }
  for (const path of SITE_FILES) {
    try {
      zip.file(path, await fetchBytes(path));
    } catch (err) {
      missing.push(path);
    }
  }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (!names.length) throw new Error("nenhum arquivo do site pôde ser lido");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const name = (window.generatorName || "codex") + "-site-" + stamp() + ".zip";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { file: name, count: names.length, bytes: blob.size, missing };
}

export async function exportIndexHtml() {
  const text = await savedText("html");
  const blob = new Blob([text], { type: "text/html" });
  const name = "index.html";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { file: name, bytes: blob.size, chars: text.length };
}

export function openIndexHtmlSummary(name, text, host) {
  const body = el(`<div class="settingsPanel">
    <div class="setRow"><span>Arquivo</span><strong>${esc(name || "index.html")}</strong></div>
    <div class="setRow"><span>Tamanho</span><strong>${esc(fmtSize(enc.encode(text).length))} · ${Number(text.length).toLocaleString("pt-BR")} caracteres</strong></div>
    <p class="fieldHint">Conteúdo do arquivo — dá para ler, copiar e guardar uma cópia neste navegador. Para <strong>aplicar</strong> no site, cole/extraia no editor do Perchance e salve — o site em execução não troca o próprio código sozinho.</p>
    <textarea class="input code" rows="22" readonly style="width:100%;white-space:pre"></textarea>
  </div>`);
  q("textarea", body).value = text;
  openModal({
    title: "📄 index.html",
    size: "lg",
    body,
    actions: [
      { label: "Fechar", onClick: ({ close }) => close() },
      {
        label: "⧉ Copiar",
        onClick: async () => {
          await copyText(text);
          toast("index.html copiado", "success", 3000);
        },
      },
      {
        label: "⬇ Baixar",
        onClick: () => {
          const blob = new Blob([text], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name || "index.html";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        },
      },
      {
        label: "Guardar neste navegador",
        kind: "primary",
        onClick: async ({ close }) => {
          await siteBackups.save(name || "index.html", enc.encode(text));
          close();
          toast("index.html guardado neste navegador", "success", 3600);
          if (host) refreshSiteBackupList(host);
        },
      },
    ],
  });
}
export async function readCodeZip(file) {
  return readCodeZipFromBytes(file, (file && file.name) || "backup.zip");
}

export async function readCodeZipFromBytes(data, fallbackName) {
  const JSZip = await getZip();
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (!isSiteCodeZip(names)) throw new Error("Este ZIP não é código do site (faltam main.pjs, index.html ou src/main.js)");
  const files = [];
  for (const n of names) {
    const u8 = new Uint8Array(await zip.files[n].async("uint8array"));
    files.push({ path: normalizeSitePath(n), size: u8.length, hash: hashBytes(u8), bytes: u8 });
  }
  let title = "";
  const main = files.find((f) => f.path.toLowerCase() === "main.pjs");
  if (main) {
    const text = new TextDecoder().decode(main.bytes.slice(0, 800));
    const m = text.match(/title\s*=\s*([^\n]+)/);
    if (m) title = m[1].trim();
  }
  return { files, title, totalBytes: files.reduce((s, f) => s + f.size, 0) };
}

export async function diffCodeZip(files) {
  const same = [];
  const diff = [];
  const onlyZip = [];
  const liveMissing = [];
  const seen = new Set(files.map((f) => f.path));
  for (const f of files) {
    let live = null;
    try {
      if (f.path === "main.pjs") live = enc.encode(await savedText("lists"));
      else if (f.path === "index.html") live = enc.encode(await savedText("html"));
      else live = await fetchBytes(f.path);
    } catch (err) {
      liveMissing.push(f.path);
      continue;
    }
    if (hashBytes(live) === f.hash) same.push(f.path);
    else diff.push(f.path);
  }
  for (const p of SITE_FILES) if (!seen.has(p)) onlyZip.push(p);
  return { same, diff, onlyZip, liveMissing };
}

export const siteBackups = {
  async list() {
    try {
      const entries = await siteFolder().entries();
      return entries
        .map((p) => p[1])
        .filter((v) => v && v.id)
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    } catch (err) {
      return [];
    }
  },
  async save(name, bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const item = {
      id: "sb_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
      name,
      kind: /\.html?$/i.test(name || "") ? "html" : "zip",
      savedAt: Date.now(),
      size: u8.length,
      bytes: u8,
    };
    await siteFolder().set(item.id, item);
    const all = await this.list();
    for (const extra of all.slice(KEEP_BACKUPS)) {
      try {
        await siteFolder().delete(extra.id);
      } catch (err) { /* ignora */ }
    }
    return item;
  },
  async remove(id) {
    await siteFolder().delete(id);
  },
  download(item) {
    const blob = new Blob([item.bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

function fmtSize(n) {
  if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export async function refreshSiteBackupList(host) {
  const box = q("#siteBackupList", host);
  if (!box) return;
  const items = await siteBackups.list();
  if (!items.length) {
    box.innerHTML = `<p class="fieldHint">Nenhum código guardado neste navegador ainda.</p>`;
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `<div class="setRow"><span>📦 ${esc(it.name)}<br><em class="fieldHint">${esc(fmtDate(it.savedAt))} · ${esc(fmtSize(it.size))}</em></span>
        <span class="btnRow"><button class="btn" data-open="${esc(it.id)}">👁 Abrir</button><button class="btn" data-dl="${esc(it.id)}">⬇ Baixar</button><button class="btn danger" data-del="${esc(it.id)}">Apagar</button></span></div>`
    )
    .join("");
  for (const b of box.querySelectorAll("[data-open]")) {
    b.onclick = async () => {
      const it = items.find((x) => x.id === b.dataset.open);
      if (!it) return;
      b.disabled = true;
      try {
        if ((it.kind || (/\.html?$/i.test(it.name || "") ? "html" : "zip")) === "html") {
          openIndexHtmlSummary(it.name, new TextDecoder().decode(it.bytes), host);
        } else {
          toast("Abrindo o backup…", "info", 2200);
          const bundle = await readCodeZipFromBytes(it.bytes, it.name);
          bundle.diff = await diffCodeZip(bundle.files);
          openCodeImportSummary(bundle, new File([it.bytes], it.name, { type: "application/zip" }), host);
        }
      } catch (err) {
        toast("Não consegui abrir: " + (err && err.message ? err.message : "backup inválido"), "error", 5000);
      } finally {
        b.disabled = false;
      }
    };
  }
  for (const b of box.querySelectorAll("[data-dl]")) {
    b.onclick = () => {
      const it = items.find((x) => x.id === b.dataset.dl);
      if (it) siteBackups.download(it);
    };
  }
  for (const b of box.querySelectorAll("[data-del]")) {
    b.onclick = async () => {
      const it = items.find((x) => x.id === b.dataset.del);
      if (!it) return;
      const ok = await confirmDialog({ title: "Apagar backup?", message: "Apagar “" + it.name + "” deste navegador? (O site continua igual; só a cópia guardada sai.)", confirmLabel: "Apagar", danger: true });
      if (!ok) return;
      await siteBackups.remove(it.id);
      refreshSiteBackupList(host);
    };
  }
}

function isTextSiteFile(path) {
  return /\.(pjs|html|js|mjs|cjs|css|json|md|txt|xml|svg)$/i.test(String(path || ""));
}

function downloadSiteFile(path, bytes) {
  const base = String(path || "arquivo").split("/").pop() || "arquivo";
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = base;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function openSiteFileViewer(path, bytes) {
  const size = bytes ? bytes.length : 0;
  const text = isTextSiteFile(path);
  const body = el(`<div class="settingsPanel">
    <div class="setRow"><span>Arquivo</span><strong>${esc(path)}</strong></div>
    <div class="setRow"><span>Tamanho</span><strong>${esc(fmtSize(size))}</strong></div>
    ${text ? `<textarea class="input code" rows="22" readonly style="width:100%;white-space:pre"></textarea>` : `<p class="fieldHint">Arquivo binário (imagem, dicionário ou wasm). Baixe para usar fora do navegador.</p>`}
  </div>`);
  if (text) {
    try {
      q("textarea", body).value = new TextDecoder().decode(bytes);
    } catch (err) {
      q("textarea", body).value = "[não consegui ler como texto]";
    }
  }
  openModal({
    title: "📄 " + String(path).split("/").pop(),
    size: "lg",
    body,
    actions: [
      { label: "Fechar", onClick: ({ close }) => close() },
      { label: "⬇ Baixar", kind: "primary", onClick: () => downloadSiteFile(path, bytes) },
    ],
  });
}

export function openCodeImportSummary(bundle, file, host) {
  const sameSet = new Set(bundle.diff.same || []);
  const diffSet = new Set(bundle.diff.diff || []);
  const statusOf = (p) => (sameSet.has(p) ? "igual" : diffSet.has(p) ? "mudou" : "só no ZIP");
  const rows = bundle.diff.diff.slice(0, 60).map((p) => `<li>${esc(p)}</li>`).join("");
  const moreDiff = bundle.diff.diff.length > 60 ? `<li>…e mais ${bundle.diff.diff.length - 60}</li>` : "";
  const missing = bundle.diff.liveMissing.slice(0, 20).map((p) => `<li>${esc(p)}</li>`).join("");
  const sorted = bundle.files.slice().sort((a, b) => a.path.localeCompare(b.path));
  const fileRows = sorted
    .map(
      (f, i) => `<div class="setRow"><span title="${esc(f.path)}">📄 ${esc(f.path)}<br><em class="fieldHint">${esc(fmtSize(f.size))} · ${esc(statusOf(f.path))}</em></span>
        <span class="btnRow"><button class="btn" data-view="${i}">👁 Abrir</button><button class="btn" data-save="${i}">⬇</button></span></div>`
    )
    .join("");
  const body = el(`<div class="settingsPanel">
    <div class="setRow"><span>Arquivo</span><strong>${esc((file && file.name) || "backup.zip")}</strong></div>
    <div class="setRow"><span>Conteúdo</span><strong>${bundle.files.length} arquivos · ${esc(fmtSize(bundle.totalBytes))}</strong></div>
    ${bundle.title ? `<div class="setRow"><span>Título</span><strong>${esc(bundle.title)}</strong></div>` : ""}
    <div class="setRow"><span>Iguais ao site atual</span><strong>${bundle.diff.same.length}</strong></div>
    <div class="setRow"><span>Diferentes do site atual</span><strong>${bundle.diff.diff.length}</strong></div>
    ${rows ? `<p class="fieldHint">Arquivos diferentes:</p><div class="diffList"><ul>${rows}${moreDiff}</ul></div>` : ""}
    ${missing ? `<p class="fieldHint">Arquivos que o site não conseguiu carregar agora (podem estar perdidos):</p><div class="diffList"><ul>${missing}</ul></div>` : ""}
    ${bundle.diff.onlyZip.length ? `<p class="fieldHint">${bundle.diff.onlyZip.length} arquivo(s) do site não estão neste ZIP (o ZIP pode ser mais antigo).</p>` : ""}
    <p class="fieldHint"><strong>Arquivos dentro do ZIP</strong> — clique em 👁 para ler o conteúdo aqui mesmo, ou ⬇ para baixar um arquivo sozinho:</p>
    <div class="diffList"><div>${fileRows}</div></div>
    <p class="fieldHint">Guardar mantém uma cópia deste ZIP neste navegador (até ${KEEP_BACKUPS} cópias, botão 👁 Abrir para reler depois). Para <strong>aplicar</strong> o código, extraia o ZIP no editor do Perchance e salve — o site em execução não troca o próprio código sozinho.</p>
  </div>`);
  for (const b of body.querySelectorAll("[data-view]")) {
    b.onclick = () => {
      const f = sorted[Number(b.dataset.view)];
      if (f) openSiteFileViewer(f.path, f.bytes);
    };
  }
  for (const b of body.querySelectorAll("[data-save]")) {
    b.onclick = () => {
      const f = sorted[Number(b.dataset.save)];
      if (f) downloadSiteFile(f.path, f.bytes);
    };
  }
  openModal({
    title: "📦 Código do site",
    size: "md",
    body,
    actions: [
      { label: "Fechar", onClick: ({ close }) => close() },
      {
        label: "Guardar neste navegador",
        kind: "primary",
        onClick: async ({ close }) => {
          const raw = new Uint8Array(await file.arrayBuffer());
          await siteBackups.save(file.name || "site-backup.zip", raw);
          close();
          toast("Código guardado neste navegador", "success", 3600);
          if (host) refreshSiteBackupList(host);
        },
      },
    ],
  });
}
