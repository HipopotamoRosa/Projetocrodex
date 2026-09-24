export function uid(prefix) {
  return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = levenshtein(x, y);
  let score = 1 - d / Math.max(x.length, y.length);
  if (x.includes(y) || y.includes(x)) score = Math.max(score, 0.82);
  const xt = x.split(" "), yt = y.split(" ");
  if (xt.length > 1 || yt.length > 1) {
    const shared = xt.filter((t) => t.length > 2 && yt.includes(t)).length;
    if (shared) score = Math.max(score, 0.6 + 0.1 * shared);
    if (xt[0] === yt[0] && xt[0].length > 2) score = Math.max(score, 0.86);
  }
  return score;
}

export function bestMatch(query, items, getName, getNameList) {
  const q = String(query || "").trim();
  if (!q) return null;
  let best = null;
  for (const item of items) {
    const names = getNameList ? getNameList(item) : [getName(item)];
    let s = 0;
    for (const n of names) {
      if (!n) continue;
      s = Math.max(s, similarity(q, n));
      if (norm(q) === norm(n)) s = 1.2;
    }
    if (!best || s > best.score) best = { item, score: s };
  }
  return best;
}

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hashString(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function colorFor(seed, sat, light) {
  const h = hashString(seed) % 360;
  return `hsl(${h} ${sat == null ? 55 : sat}% ${light == null ? 58 : light}%)`;
}

export function splitList(str) {
  return String(str || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60000) return "agora";
  if (diff < 3600000) return Math.round(diff / 60000) + " min atrás";
  if (diff < 86400000) return Math.round(diff / 3600000) + " h atrás";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (err) { console.warn(err); }
  ta.remove();
}

export function download(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (err) {
    console.warn(err);
    return false;
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export async function shrinkImage(source, maxDim, quality) {
  maxDim = maxDim || 1024;
  quality = quality || 0.86;
  let bitmap = null;
  try {
    if (typeof source === "string") {
      const res = await fetch(source, { mode: "cors" });
      if (!res.ok) throw new Error("fetch " + res.status);
      const blob = await res.blob();
      bitmap = await createImageBitmap(blob);
    } else if (source instanceof Blob) {
      bitmap = await createImageBitmap(source);
    } else if (source && source.naturalWidth) {
      bitmap = source;
    }
  } catch (err) {
    return null;
  }
  if (!bitmap) return null;
  const w = bitmap.naturalWidth || bitmap.width;
  const h = bitmap.naturalHeight || bitmap.height;
  if (!w || !h) return null;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  let out = canvas.toDataURL("image/webp", quality);
  if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
  return out;
}

const TOKEN_OPEN = "\u0000";
const TOKEN_CLOSE = "\u0001";

export function inlineMarkup(str) {
  let s = str;
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s;
}

export function buildNameRegex(names) {
  const clean = (names || [])
    .filter((n) => n && n.length >= 3 && n.length <= 48)
    .map((n) => esc(n))
    .filter((n) => !/^\d+$/.test(n));
  if (!clean.length) return null;
  clean.sort((a, b) => b.length - a.length);
  const limited = clean.slice(0, 600);
  try {
    return new RegExp("(?<![\\w\\u00c0-\\u024f])(" + limited.map(escapeRe).join("|") + ")(?![\\w\\u00c0-\\u024f])", "gi");
  } catch (err) {
    return null;
  }
}

export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderRich(text, opts) {
  opts = opts || {};
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return TOKEN_OPEN + (tokens.length - 1) + TOKEN_CLOSE;
  };
  // [[palavra|Nome da ficha]] anexa "palavra" a ficha "Nome" — a palavra
  // aparece sozinha, na cor de vinculo. [[Nome]] continua valendo.
  const chip = (payload) => {
    const bar = payload.indexOf("|");
    const label = (bar >= 0 ? payload.slice(0, bar) : payload).trim();
    const target = (bar >= 0 ? payload.slice(bar + 1) : payload).trim();
    const resolved = opts.resolveName && target ? opts.resolveName(target) : null;
    const shown = label || (resolved ? resolved.name : target);
    if (resolved) {
      const title = opts.refTitle ? opts.refTitle(resolved) : resolved.name;
      return `<a class="mdRef wordRef" href="#/ficha/${encodeURIComponent(resolved.id)}" data-entity-link="${esc(resolved.id)}" title="${esc(title)}">${esc(shown)}</a>`;
    }
    return `<span class="mdRef mdRefMissing" title="Nenhuma ficha chamada “${esc(target)}” ainda">${esc(shown)}</span>`;
  };
  let s = esc(text);
  s = s.replace(/\[\[([^\[\]]+)\]\]/g, (m, n) => stash(chip(n.trim())));
  if (opts.mentionRegex && opts.mentionExclude !== undefined) {
    const excludeId = opts.mentionExclude;
    s = s.replace(opts.mentionRegex, (m) => {
      const resolved = opts.resolveName ? opts.resolveName(m) : null;
      if (!resolved || resolved.id === excludeId) return m;
      return stash(`<a class="mdMention" href="#/ficha/${encodeURIComponent(resolved.id)}" data-entity-link="${esc(resolved.id)}">${m}</a>`);
    });
  }
  const lines = s.split(/\n/);
  const out = [];
  let listOpen = false;
  let quoteOpen = false;
  const closeBlocks = () => {
    if (listOpen) { out.push("</ul>"); listOpen = false; }
    if (quoteOpen) { out.push("</blockquote>"); quoteOpen = false; }
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    const bq = line.match(/^>\s?(.*)$/);
    if (!line.trim()) { closeBlocks(); continue; }
    if (h) {
      closeBlocks();
      const level = Math.min(4, h[1].length + 1);
      out.push(`<h${level}>${inlineMarkup(h[2])}</h${level}>`);
    } else if (li) {
      if (quoteOpen) { out.push("</blockquote>"); quoteOpen = false; }
      if (!listOpen) { out.push("<ul>"); listOpen = true; }
      out.push(`<li>${inlineMarkup(li[1])}</li>`);
    } else if (bq) {
      if (listOpen) { out.push("</ul>"); listOpen = false; }
      if (!quoteOpen) { out.push("<blockquote>"); quoteOpen = true; }
      out.push(`<p>${inlineMarkup(bq[1])}</p>`);
    } else {
      closeBlocks();
      out.push(`<p>${inlineMarkup(line)}</p>`);
    }
  }
  closeBlocks();
  let html = out.join("\n");
  html = html.replace(new RegExp(TOKEN_OPEN + "(\\d+)" + TOKEN_CLOSE, "g"), (m, i) => tokens[Number(i)] || "");
  return html;
}

export function mdToPlain(text) {
  return String(text || "")
    .replace(/\[\[([^\[\]]*)\]\]/g, (m, payload) => {
      const bar = payload.indexOf("|");
      return bar >= 0 ? payload.slice(0, bar).trim() : payload;
    })
    .replace(/[*_~`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(str, n) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
