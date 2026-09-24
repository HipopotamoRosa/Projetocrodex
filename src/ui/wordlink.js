// Vinculo de palavra: liga uma palavra (ou um trecho curto) a uma ficha do
// universo SEM trocar a palavra por um "chip" — o texto continua normal, so
// ganha a cor de vinculo.
//
// O mesmo vinculo tem duas serializacoes:
//  - no Livro (HTML):  <span class="bkRef wordLink" data-ref="ent…">palavra</span>
//  - em texto puro (descricao da ficha, descricao do evento, campos longos):
//                      [[palavra|Nome da ficha]]
//
// O menu de botao direito em <textarea>/<input> e ligado por bindInputWordLinks.

import { popupMenu } from "./dom.js";
import { esc, copyText } from "../util.js";
import { store } from "../store.js";
import { pickEntities } from "./entityPicker.js";

export const WORD_LINK_CLASS = "wordLink";
export const WORD_LINK_RE = /\[\[([^\[\]]*?)\]\]/g;

const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "UL", "OL",
  "PRE", "HR", "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE", "FIGCAPTION",
]);

export function wordLinkTitle(entity) {
  const t = store.type(entity.type);
  return t.l + ": " + entity.name + " — clique para abrir a ficha";
}

export function wordLinkHtml(entity, label) {
  return `<span class="bkRef ${WORD_LINK_CLASS}" data-ref="${esc(entity.id)}" contenteditable="false" title="${esc(wordLinkTitle(entity))}">${esc(label)}</span>`;
}

function cleanPart(s) {
  return String(s == null ? "" : s).replace(/[\[\]|]/g, "").replace(/\s+/g, " ").trim();
}

// Marcador de texto puro: [[palavra|Nome da ficha]]
export function wordLinkMarkup(entity, label) {
  return "[[" + (cleanPart(label) || cleanPart(entity.name)) + "|" + cleanPart(entity.name) + "]]";
}

// Marcador que contem o deslocamento `index` (cursor dentro de um vinculo).
export function parseWordLink(text, index) {
  const src = String(text == null ? "" : text);
  WORD_LINK_RE.lastIndex = 0;
  let m;
  while ((m = WORD_LINK_RE.exec(src))) {
    const end = m.index + m[0].length;
    if (index < m.index || index > end) continue;
    const payload = m[1];
    const bar = payload.indexOf("|");
    const label = (bar >= 0 ? payload.slice(0, bar) : payload).trim();
    const target = (bar >= 0 ? payload.slice(bar + 1) : payload).trim();
    if (!target) continue;
    return { start: m.index, end, raw: m[0], label: label || target, target };
  }
  return null;
}

export function wordLinkEntity(target) {
  return target ? store.resolveName(target) : null;
}

// [[palavra|Nome]] -> "palavra"; usado em previas e buscas.
export function stripWordLinks(text) {
  return String(text == null ? "" : text).replace(/\[\[([^\[\]]*)\]\]/g, (m, payload) => {
    const bar = payload.indexOf("|");
    return bar >= 0 ? payload.slice(0, bar).trim() : payload.trim();
  });
}

export async function pickLinkTarget(opts) {
  opts = opts || {};
  const picked = await pickEntities({
    title: opts.title || "Anexar a uma ficha",
    subtitle: opts.subtitle || "Escolha o personagem, organização, lugar ou item que essa palavra representa.",
    multi: false,
    selected: opts.selected ? [opts.selected] : [],
    confirmLabel: opts.confirmLabel || "Anexar",
  });
  if (!picked || !picked.length) return null;
  return store.getEntity(picked[0]) || null;
}

export function openEntityById(id) {
  if (!id) return;
  if (window.codex && window.codex.setView) window.codex.setView("browse");
  window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
}

// Ancora invisivel no ponto do clique, para posicionar o popupMenu.
export function anchorAt(event) {
  const anchor = document.createElement("div");
  anchor.className = "bkAnchor";
  anchor.style.left = (event.clientX || 0) + "px";
  anchor.style.top = (event.clientY || 0) + "px";
  document.body.appendChild(anchor);
  setTimeout(() => anchor.remove(), 0);
  return anchor;
}

function blockAncestor(node, root) {
  let n = node && node.nodeType === 1 ? node : node ? node.parentNode : null;
  while (n && n !== root) {
    if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName)) return n;
    n = n.parentNode;
  }
  return root;
}

// Envolve uma faixa do editor num span-vinculo. Devolve null se a selecao
// atravessa mais de um bloco (paragrafos diferentes) — nesse caso nao mexe
// em nada.
export function wrapRangeWithLink(range, entity, opts) {
  const root = (opts && opts.root) || null;
  if (!range || !entity || !range.startContainer) return null;
  if (root && blockAncestor(range.startContainer, root) !== blockAncestor(range.endContainer, root)) return null;
  if (!range.toString().trim()) return null;
  const frag = range.extractContents();
  const node = document.createElement("span");
  node.className = "bkRef " + WORD_LINK_CLASS;
  node.setAttribute("data-ref", entity.id);
  node.setAttribute("contenteditable", "false");
  node.title = wordLinkTitle(entity);
  node.appendChild(frag);
  range.insertNode(node);
  return node;
}

function shortLabel(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const max = n || 40;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// Menu de botao direito em <textarea>/<input>: anexa a selecao a uma ficha,
// abre/troca/remove um vinculo ja existente.
export function bindInputWordLinks(input, opts) {
  opts = opts || {};
  if (!input || input.dataset.wordLinkBound === "1") return;
  input.dataset.wordLinkBound = "1";

  const notify = () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (opts.onChange) opts.onChange();
    try { input.focus(); } catch (e) { /* segue */ }
  };

  const applyLink = async (start, end, label) => {
    const entity = await pickLinkTarget({
      title: "Anexar “" + shortLabel(label) + "” a uma ficha",
      confirmLabel: "Anexar",
    });
    if (!entity) return;
    input.setRangeText(wordLinkMarkup(entity, label), start, end, "end");
    notify();
  };

  input.addEventListener("contextmenu", (event) => {
    const value = input.value || "";
    const selStart = input.selectionStart == null ? 0 : input.selectionStart;
    const selEnd = input.selectionEnd == null ? selStart : input.selectionEnd;
    const selection = selEnd > selStart ? value.slice(selStart, selEnd).replace(/\s+/g, " ").trim() : "";
    const inside = selection ? null : parseWordLink(value, selStart);
    if (!selection && !inside) return;

    event.preventDefault();
    const items = [];
    if (selection) {
      items.push({ icon: "🔗", label: "Anexar “" + shortLabel(selection) + "” a uma ficha…", onClick: () => applyLink(selStart, selEnd, selection) });
      items.push({ icon: "🅰️", label: "Copiar trecho", onClick: () => copyText(selection) });
    } else {
      const entity = wordLinkEntity(inside.target);
      if (entity) items.push({ icon: "📇", label: "Abrir ficha: " + entity.name, onClick: () => openEntityById(entity.id) });
      else items.push({ icon: "📇", label: "Nenhuma ficha chamada “" + shortLabel(inside.target) + "”", onClick: null });
      items.push({ icon: "🔗", label: entity ? "Anexar a outra ficha…" : "Anexar a uma ficha…", onClick: () => applyLink(inside.start, inside.end, inside.label) });
      items.push({ icon: "🅰️", label: "Copiar palavra", onClick: () => copyText(inside.label) });
      items.push({ separator: true });
      items.push({ icon: "✖", label: "Remover o vínculo (mantém a palavra)", danger: true, onClick: () => {
        input.setRangeText(inside.label, inside.start, inside.end, "end");
        notify();
      } });
    }
    if (opts.extraItems) items.push(...opts.extraItems());
    popupMenu(anchorAt(event), items);
  });
}
