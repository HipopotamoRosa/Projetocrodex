import { universes } from "./universe.js";

let zipLib = null;

async function getZip() {
  if (zipLib) return zipLib;
  const mod = await import("https://esm.sh/jszip@3.10.1");
  zipLib = mod.default || mod.JSZip || mod;
  return zipLib;
}

function slug(text) {
  return (
    String(text || "codex")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "codex"
  );
}

function stampDate() {
  return new Date().toISOString().slice(0, 10);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportFullZip() {
  const JSZip = await getZip();
  const zip = new JSZip();
  const list = universes.list.slice();
  const manifest = {
    app: "codex",
    kind: "codex-full-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    generator: window.generatorName || "",
    count: list.length,
    universes: [],
  };
  for (const u of list) {
    const payload = await universes.exportOne(u.id);
    const fname = "codex-" + slug(u.nome) + "-" + String(u.id).slice(-6) + ".json";
    zip.file(fname, JSON.stringify(payload));
    manifest.universes.push({ id: u.id, nome: u.nome, emoji: u.emoji, file: fname });
  }
  zip.file("backup.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const name = "codex-backup-total-" + stampDate() + ".zip";
  saveBlob(blob, name);
  return { file: name, count: list.length, bytes: blob.size };
}

export async function exportSingleZip(id) {
  const u = universes.byId(id);
  if (!u) throw new Error("Codex não encontrado");
  const JSZip = await getZip();
  const zip = new JSZip();
  const payload = await universes.exportOne(id);
  const inner = "codex-" + slug(u.nome) + ".json";
  zip.file(inner, JSON.stringify(payload));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const name = "codex-" + slug(u.nome) + ".zip";
  saveBlob(blob, name);
  return { file: name, bytes: blob.size };
}

function isSiteCodeZip(names) {
  const lower = names.map((n) => n.toLowerCase());
  const hasMain = lower.some((n) => n === "main.pjs" || n.endsWith("/main.pjs"));
  const hasHtml = lower.some((n) => n === "index.html" || n.endsWith("/index.html"));
  const hasSrc = lower.some((n) => n === "src/main.js" || n.endsWith("/src/main.js"));
  if (hasMain && hasHtml && hasSrc) return true;
  return lower.some((n) => n === "main.pjs" || n === "index.html" || n.startsWith("src/") || n.includes("/src/"));
}

function looksLikeCodexPayload(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.kind === "codex-universe" && obj.docs) return true;
  if (obj.kind === "codex-full-backup") return true;
  if (Array.isArray(obj.entities)) return true;
  return false;
}

export async function importBackupFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".json")) {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload.kind === "codex-full-backup" && Array.isArray(payload.universes)) {
      const out = [];
      for (const inner of payload.universes) {
        if (looksLikeCodexPayload(inner)) out.push(await universes.importFile(inner));
      }
      if (!out.length) throw new Error("Este ZIP/JSON não tem nenhum Codex dentro");
      return out;
    }
    return [await universes.importFile(payload)];
  }
  const JSZip = await getZip();
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (!names.length) throw new Error("ZIP vazio");
  if (isSiteCodeZip(names)) {
    const err = new Error("Este ZIP é o código do site (main.pjs/index.html/src). Use ⋯ → Arquivo → Código do site (.zip) → Importar código — ou importe por lá. Se você usou o botão errado, basta repetir a importação no botão de código.");
    err.code = "SITE_CODE";
    throw err;
  }
  const jsonNames = names.filter((n) => n.toLowerCase().endsWith(".json"));
  if (!jsonNames.length) throw new Error("Este ZIP não tem nenhum .json de Codex dentro");
  jsonNames.sort((a, b) => (a === "backup.json" ? 1 : b === "backup.json" ? -1 : a.localeCompare(b)));
  const imported = [];
  const errors = [];
  for (const n of jsonNames) {
    if (n === "backup.json") continue;
    try {
      const text = await zip.files[n].async("string");
      const payload = JSON.parse(text);
      if (!looksLikeCodexPayload(payload)) continue;
      imported.push(await universes.importFile(payload, { nome: undefined }));
    } catch (err) {
      errors.push(n + ": " + (err.message || "inválido"));
    }
  }
  if (!imported.length) {
    throw new Error(errors.length ? "Nada importado. " + errors[0] : "Nenhum Codex válido neste ZIP");
  }
  return imported;
}
