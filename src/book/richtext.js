// Utilitarios de texto rico do Livro.
//
// O editor guarda HTML (contenteditable). Aqui ficam:
//  - serializeText / domTextMap: convertem o conteudo em texto puro mantendo as
//    quebras de linha entre blocos (usado para contar caracteres, buscar e
//    localizar palavras do corretor);
//  - htmlToText / textToHtml: conversao para capitulos antigos (que guardavam
//    texto puro) e para importacao;
//  - sanitizeHtml: limpeza do HTML colado, mantendo apenas as marcas que o
//    editor produz.

import { esc } from "../util.js";

export const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "UL", "OL",
  "PRE", "HR", "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE",
]);

const ALLOWED = new Set([
  "P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL",
  "H1", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "LI", "HR", "IMG", "SPAN",
  "A", "FONT", "SUB", "SUP", "FIGURE", "FIGCAPTION",
]);

const ATTRS = {
  IMG: ["data-img", "src", "alt", "title", "class", "width"],
  A: ["href", "data-ref", "class", "title"],
  SPAN: ["class", "data-ref", "style", "title"],
  FONT: ["size"],
  FIGCAPTION: ["class"],
};

function walk(node, parts) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) { parts.push(child.data); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName;
    if (tag === "BR") { parts.push("\n"); continue; }
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push("\n");
    if (tag === "LI") parts.push("• ");
    walk(child, parts);
    if (block) parts.push("\n");
  }
}

export function normalizeText(s) {
  return String(s == null ? "" : s)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function serializeText(root) {
  const parts = [];
  walk(root, parts);
  return parts.join("");
}

// Mapa do texto do editor: texto puro + faixas de cada no de texto, para
// converter entre deslocamento de caractere e posicao no DOM.
export function domTextMap(root) {
  const nodes = [];
  let text = "";
  const visit = (node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        if (child.data) {
          nodes.push({ node: child, start: text.length, end: text.length + child.data.length });
          text += child.data;
        }
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === "BR") { text += "\n"; continue; }
      const block = BLOCK_TAGS.has(tag);
      if (block && text && !text.endsWith("\n")) text += "\n";
      visit(child);
      if (block && text && !text.endsWith("\n")) text += "\n";
    }
  };
  visit(root);
  return { text, nodes };
}

export function htmlToText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html == null ? "" : html);
  return normalizeText(serializeText(holder));
}

export function textToHtml(text) {
  const s = String(text == null ? "" : text).replace(/\r\n?/g, "\n").trim();
  if (!s) return "";
  return s.split(/\n{2,}/).map((p) => "<p>" + p.split("\n").map(esc).join("<br>") + "</p>").join("");
}

export function isEmptyHtml(html) {
  return htmlToText(html) === "";
}

function locate(map, off) {
  const nodes = map.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (off >= n.start && off <= n.end) return { node: n.node, off: Math.min(off - n.start, n.node.data.length) };
  }
  if (nodes.length) {
    const last = nodes[nodes.length - 1];
    return { node: last.node, off: last.node.data.length };
  }
  return null;
}

export function rangeFromOffsets(map, start, end) {
  const a = locate(map, start);
  const b = locate(map, end);
  if (!a || !b) return null;
  const r = document.createRange();
  try {
    r.setStart(a.node, a.off);
    r.setEnd(b.node, b.off);
  } catch (e) {
    return null;
  }
  return r;
}

export function globalOffsetOf(map, node, off) {
  const nodes = map.nodes;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].node === node) return nodes[i].start + Math.min(off, node.data.length);
  }
  return -1;
}

function sanitizeAttrs(node) {
  const tag = node.tagName;
  const allowed = ATTRS[tag] || [];
  for (const attr of [...node.attributes]) {
    const name = attr.name.toLowerCase();
    if (!allowed.includes(name)) { node.removeAttribute(attr.name); continue; }
    if (name === "src") {
      const v = attr.value || "";
      if (!/^data:image\//i.test(v) && !/^https?:\/\//i.test(v)) node.removeAttribute(attr.name);
    }
    if (name === "href" && !/^(https?:|#|\/)/i.test(attr.value || "")) node.removeAttribute(attr.name);
    if (name === "style") {
      const m = /font-size\s*:\s*([^;]+)/i.exec(attr.value || "");
      if (m) node.setAttribute("style", "font-size:" + m[1].trim());
      else node.removeAttribute("style");
    }
  }
  if (tag === "A") {
    node.setAttribute("rel", "noopener");
    node.setAttribute("target", "_blank");
  }
}

function cleanChildren(parent) {
  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (child.nodeType === 8) {
      child.remove();
    } else if (child.nodeType === 1) {
      if (!ALLOWED.has(child.tagName)) {
        cleanChildren(child);
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
      } else {
        sanitizeAttrs(child);
        cleanChildren(child);
      }
    }
    child = next;
  }
}

export function sanitizeHtml(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html == null ? "" : html);
  cleanChildren(holder);
  return holder.innerHTML;
}

// Remove o data-URL das imagens antes de guardar: o conteudo real vive na pasta
// de imagens do livro (kv) e e resolvido na abertura do capitulo.
export function stripImageSources(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html == null ? "" : html);
  for (const img of [...holder.querySelectorAll("img")]) {
    img.removeAttribute("src");
    const cap = img.closest("figure");
    if (cap) cap.setAttribute("data-figure", "");
  }
  return holder.innerHTML;
}
