// Desenho dos gráficos de competência: os aros (rosca), a grade inteira e as
// tags especiais. Tudo vira string HTML/SVG — quem monta no DOM é panel.js
// (dentro da ficha) e view.js (aba de gerenciamento).

import { esc, renderRich } from "../util.js";
import { store } from "../store.js";
import { competencia } from "./store.js";

// 6 -> "6", 7.5 -> "7,5"
export function fmtValue(n) {
  if (typeof n !== "number" || !isFinite(n)) return "–";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

// Aro de rosca: trilho cinza + arco colorido + número no centro.
export function ringSvg(opts) {
  opts = opts || {};
  const size = opts.size || 96;
  const stroke = opts.stroke || Math.round(size * 0.105);
  const max = Number(opts.max) > 0 ? Number(opts.max) : 10;
  const raw = typeof opts.value === "number" && isFinite(opts.value) ? opts.value : null;
  const val = raw == null ? 0 : Math.min(max, Math.max(0, raw));
  const cx = size / 2;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const dash = c * (max > 0 ? val / max : 0);
  const shown = fmtValue(raw);
  const numSize = Math.round(size * (shown.length > 3 ? 0.25 : shown.length > 2 ? 0.3 : 0.36));
  const title = raw == null
    ? (opts.name ? opts.name + " — ainda sem valor" : "sem valor")
    : (opts.name ? opts.name + ": " + shown + " de " + max : shown + " de " + max);
  return `<svg class="capRing" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(title)}">
    <circle class="capTrack" cx="${cx}" cy="${cx}" r="${r}" stroke-width="${stroke}" fill="none"></circle>
    <circle class="capArc" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${stroke}"
      stroke="${esc(opts.color || "#a78bfa")}" stroke-linecap="${val > 0 ? "round" : "butt"}"
      stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"></circle>
    <text class="capNum" x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${numSize}"${raw == null ? ' data-empty="1"' : ""}>${esc(shown)}</text>
  </svg>`;
}

function noteText(text) {
  return esc(text).replace(/\n/g, "<br>");
}

// Um gráfico: aro + nome (sempre em caixa alta, como na referência) + anotação.
export function ringItemHtml(attr, data, opts) {
  opts = opts || {};
  const value = data && typeof data.values[attr.id] === "number" ? data.values[attr.id] : null;
  const note = (data && data.notes[attr.id]) || "";
  const hint = [attr.hint, value == null ? "sem valor" : fmtValue(value) + " de " + attr.max, note].filter(Boolean).join(" · ");
  return `<div class="capItem"${hint ? ` title="${esc(hint)}"` : ""} data-attr="${esc(attr.id)}">
    <div class="capRingBox">${ringSvg({ value, max: attr.max, color: attr.color, size: opts.size || 96, name: attr.name })}</div>
    <div class="capName">${attr.icon ? `<span class="capNameIcon">${esc(attr.icon)}</span> ` : ""}${esc(attr.name)}</div>
    ${note ? `<div class="capNote">${noteText(note)}</div>` : ""}
  </div>`;
}

export function ringGridHtml(entityId, opts) {
  opts = opts || {};
  const attrs = competencia.list();
  if (!attrs.length) return "";
  const data = competencia.get(entityId);
  return `<div class="capGrid" style="--capSize:${opts.size || 96}px">`
    + attrs.map((a) => ringItemHtml(a, data, opts)).join("")
    + `</div>`;
}

export function tagChipsHtml(entityId) {
  const row = tagRowHtml(entityId);
  if (!row) return "";
  return `<div class="capTags">${row}${tagNotesHtml(entityId)}</div>`;
}

// Uma linha de chips de uma das duas famílias de etiquetas (sem a moldura do bloco):
// `tags` = Tags especiais (painel da Descrição) e `medals` = Condecorações (cabeçalho).
export function tagRowHtml(entityId, kind) {
  const list = competencia.listOf(entityId, kind || "tags");
  if (!list.length) return "";
  const chips = list.map((t) => `<span class="capTag" style="--tagColor:${esc(t.color || "#a78bfa")}" title="${esc([t.label, t.note].filter(Boolean).join(" — "))}">`
    + `${t.icon ? `<span class="capTagIcon">${esc(t.icon)}</span>` : ""}<span class="capTagLabel">${esc(t.label)}</span></span>`).join("");
  return `<div class="capTagRow">${chips}</div>`;
}

function tagNotesHtml(entityId, kind) {
  const noted = competencia.listOf(entityId, kind || "tags").filter((t) => String(t.note || "").trim());
  if (!noted.length) return "";
  return `<ul class="capTagNotes">${noted.map((t) => `<li><span class="capTagNoteName" style="color:${esc(t.color || "#a78bfa")}">${esc(t.label)}</span> ${noteText(t.note)}</li>`).join("")}</ul>`;
}

// A área do cabeçalho da ficha (logo abaixo dos botões de ação). Só as
// **Condecorações** aparecem aqui — as Tags especiais ficam no painel da Descrição.
// Só sai quando a ficha tem condecorações e a Competência está marcada para aparecer
// na ficha (`showsOnSheet`, o interruptor "Na ficha" da aba).
export function heroMedalsHtml(entity) {
  if (!entity || !competencia.showsOnSheet(entity.id)) return "";
  const row = tagRowHtml(entity.id, "medals");
  if (!row) return "";
  return `<div class="heroMedalBlock" data-hero-medals="${esc(entity.id)}">
    <span class="heroMedalBlockTitle">🎖 Condecorações</span>
    ${row}
    ${tagNotesHtml(entity.id, "medals")}
  </div>`;
}

// O texto abaixo dos gráficos aceita o mesmo [[vínculo]] do resto do app.
function captionHtml(text, entity) {
  return renderRich(text, {
    resolveName: (n) => store.resolveName(n, entity.id),
    mentionRegex: null,
    mentionExclude: entity.id,
    refTitle: (e) => store.type(e.type).l + ": " + e.name,
  });
}

// Bloco que aparece na Descrição da ficha.
export function capPanelHtml(entity, opts) {
  opts = opts || {};
  if (!competencia.hasData(entity.id)) return "";
  if (!competencia.showsOnSheet(entity.id) && !opts.force) return "";
  const grid = ringGridHtml(entity.id, { size: opts.size || 96 });
  const tags = tagChipsHtml(entity.id);
  const caption = competencia.captionOf(entity.id);
  return `<div class="capPanel" data-cap-panel="${esc(entity.id)}">
    <div class="capPanelHead">
      <span class="capPanelTitle">⚡ Competência</span>
      <button class="capEditBtn" type="button" data-cap-edit="${esc(entity.id)}" title="Gerenciar os gráficos desta ficha">✏️ Editar</button>
    </div>
    ${grid || `<p class="mutedNote">Nenhum gráfico no catálogo ainda.</p>`}
    ${tags}
    ${caption.trim() ? `<div class="capCaption richText">${captionHtml(caption, entity)}</div>` : ""}
  </div>`;
}
