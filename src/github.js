import { SITE_FILES } from "./codeBackup.js";

const enc = new TextEncoder();

function cfgFolder() {
  return root.kv["codex_github_config"];
}

export async function getGithubCfg() {
  try {
    const v = await cfgFolder().get("cfg");
    if (v && typeof v === "object") return v;
  } catch (e) {}
  return {};
}

export async function setGithubCfg(patch) {
  let cur = {};
  try {
    const v = await cfgFolder().get("cfg");
    if (v && typeof v === "object") cur = v;
  } catch (e) {}
  const next = Object.assign({}, cur, patch);
  try { await cfgFolder().set("cfg", next); } catch (e) {}
  return next;
}

export async function clearGithubToken() {
  const cfg = await getGithubCfg();
  delete cfg.token;
  try { await cfgFolder().set("cfg", cfg); } catch (e) {}
  return cfg;
}

function b64encode(u8) {
  let s = "";
  const CH = 8192;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}

async function savedText(kind) {
  const name = window.generatorName || "";
  if (kind === "lists") {
    const r = await fetch("https://perchance.org/api/getGeneratorsAndDependencies?generatorNames=" + encodeURIComponent(name));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const g = j.generators && j.generators[name];
    if (!g || typeof g.code !== "string") throw new Error("resposta sem codigo");
    return g.code;
  }
  if (!root.superFetch) throw new Error("busca indisponivel");
  const r = await root.superFetch("https://perchance.org/api/getGeneratorHtml?generatorName=" + encodeURIComponent(name));
  const t = await r.text();
  if (!t || t.length < 50) throw new Error("resposta vazia");
  return t;
}

async function fetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export async function collectSiteFiles() {
  const files = [];
  files.push({ path: "main.pjs", bytes: enc.encode(await savedText("lists")) });
  files.push({ path: "index.html", bytes: enc.encode(await savedText("html")) });
  for (const p of SITE_FILES) {
    try {
      files.push({ path: p, bytes: await fetchBytes(p) });
    } catch (e) {}
  }
  if (!files.length) throw new Error("nenhum arquivo do site pode ser lido");
  return files;
}

async function ghFetch(cfg, path, opts) {
  opts = opts || {};
  const headers = Object.assign(
    { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token },
    opts.headers || {}
  );
  const r = await fetch("https://api.github.com" + path, Object.assign({}, opts, { headers }));
  return r;
}

async function ghError(r) {
  try {
    const j = await r.clone().json();
    if (j && j.message) return j.message;
  } catch (e) {}
  return "erro " + r.status;
}

export async function testGithubConnection(cfg) {
  cfg = cfg || await getGithubCfg();
  if (!cfg.token) throw new Error("Cole o token primeiro.");
  if (!cfg.owner || !cfg.repo) throw new Error("Preencha dono e repositorio.");
  const r = await ghFetch(cfg, "/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo), {});
  if (!r.ok) throw new Error("GitHub recusou: " + await ghError(r));
  const j = await r.json();
  return { fullName: j.full_name, defaultBranch: j.default_branch, private: !!j.private };
}

export async function pushSiteToGithub(onProgress) {
  const cfg = await getGithubCfg();
  if (!cfg.token) throw new Error("Cole o token do GitHub primeiro.");
  if (!cfg.owner || !cfg.repo) throw new Error("Preencha dono e repositorio (formato dono/repo ou campos separados).");
  const branch = (cfg.branch || "").trim();
  const files = await collectSiteFiles();
  const total = files.length;
  let ok = 0;
  const errors = [];
  const msg = "Atualizar site pelo Codex (" + new Date().toISOString().slice(0, 16).replace("T", " ") + ")";
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      if (onProgress) onProgress(i + 1, total, f.path);
      const url = "/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + "/contents/" + f.path;
      let sha = null;
      try {
        const g = await ghFetch(cfg, url + (branch ? "?ref=" + encodeURIComponent(branch) : ""), {});
        if (g.ok) {
          const gj = await g.json();
          if (gj && gj.sha && !gj.truncated) sha = gj.sha;
        }
      } catch (e) {}
      const body = { message: msg, content: b64encode(f.bytes) };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      const p = await ghFetch(cfg, url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!p.ok) throw new Error(f.path + ": " + await ghError(p));
      ok++;
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }
  const next = Object.assign({}, cfg, { lastPush: Date.now(), lastFiles: total, lastOk: ok });
  try { await cfgFolder().set("cfg", next); } catch (e) {}
  if (!ok) throw new Error(errors[0] || "Nenhum arquivo foi enviado.");
  const err = new Error(ok + " de " + total + " arquivos enviados." + (errors.length ? " Falhas: " + errors.slice(0, 3).join(" | ") : ""));
  err.pushed = ok;
  err.total = total;
  err.errors = errors;
  err.partial = errors.length > 0;
  throw err;
}
