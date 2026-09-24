// Timeline: a cronologia viva da história.
//
// Mistura duas fontes num só fluxo ordenado:
//  - eventos criados aqui (timeline/store.js);
//  - capítulos do Livro que têm "momento" preenchido.
// Cada entrada pode estar ligada a fichas do universo (chips clicáveis) e a um
// capítulo — é o nó onde fichas, livro e cronologia se encontram.

import { q, qa, el, toast, popupMenu, openModal, confirmDialog } from "../ui/dom.js";
import { esc, download, formatDate, renderRich } from "../util.js";
import { store } from "../store.js";
import { book, MOMENT_SUGGESTIONS } from "../book/store.js";
import { timeline, parseSortKey } from "./store.js";
import { pickEntities, entityChipHtml } from "../ui/entityPicker.js";
import { bindInputWordLinks, stripWordLinks } from "../ui/wordlink.js";
import { VIEW } from "../view.js";

let instance = null;

function fmt(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

// Previa do cartao: achata os espacos e corta em 180 caracteres, sem deixar um
// marcador [[palavra|Ficha]] cortado no meio.
function previewRaw(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= 180) return flat;
  let cut = flat.slice(0, 179).trimEnd();
  const open = cut.lastIndexOf("[[");
  if (open !== -1 && cut.indexOf("]]", open) === -1) cut = cut.slice(0, open).trimEnd();
  return cut + "…";
}

function preview(text) {
  return stripWordLinks(previewRaw(text));
}

const refTitle = (entity) => {
  const t = store.type(entity.type);
  return t.l + ": " + entity.name;
};

export function initTimelineView() {
  if (instance) return instance;
  const host = q("#timelineView");
  if (!host) return null;
  instance = createTimelineView(host);
  return instance;
}

export function createTimelineView(host) {
  let term = "";
  let entityFilter = null;
  let showChapters = true;

  const rootEl = el(`<div class="tlPane">
    <header class="tlHead">
      <div class="tlHeadText">
        <h1 class="tlTitle">Timeline</h1>
        <p class="tlSub">A cronologia viva da história — eventos, capítulos e acontecimentos datados, ligados às suas fichas.</p>
      </div>
      <div class="tlHeadActions">
        <button class="btn" data-act="export">⤓<span class="btnText"> Exportar</span></button>
        <button class="btn" data-act="filters">🔎<span class="btnText"> Filtrar</span></button>
        <button class="btn primary" data-act="new">＋<span class="btnText"> Novo evento</span></button>
      </div>
    </header>
    <div class="tlBar">
      <input class="input tlSearch" type="search" placeholder="Buscar na cronologia…" autocomplete="off" spellcheck="false">
      <div class="tlChips"></div>
      <span class="tlCount"></span>
    </div>
    <div class="tlBody"></div>
  </div>`);
  host.replaceChildren(rootEl);

  const searchInput = q(".tlSearch", rootEl);
  const chipsEl = q(".tlChips", rootEl);
  const countEl = q(".tlCount", rootEl);
  const bodyEl = q(".tlBody", rootEl);

  // ---------- montagem das entradas ----------

  function allEntries() {
    const out = [];
    const linkedChapters = new Set();
    for (const ev of timeline.list()) if (ev.chapterId) linkedChapters.add(ev.chapterId);
    for (const ev of timeline.list()) {
      out.push({
        kind: "event",
        id: ev.id,
        event: ev,
        title: ev.title,
        date: ev.date,
        sortKey: typeof ev.sortKey === "number" ? ev.sortKey : parseSortKey(ev.date),
        text: ev.description,
        entityIds: ev.entityIds || [],
        chapterId: ev.chapterId,
        stamp: ev.createdAt,
      });
    }
    if (showChapters) {
      for (const c of book.list()) {
        if (linkedChapters.has(c.id)) continue;
        out.push({
          kind: "chapter",
          id: c.id,
          chapter: c,
          title: c.title,
          date: c.moment,
          sortKey: c.moment ? parseSortKey(c.moment) : null,
          text: c.text,
          entityIds: c.attachments || [],
          chapterId: c.id,
          stamp: c.createdAt,
        });
      }
    }
    out.sort((a, b) => {
      const ka = typeof a.sortKey === "number" ? a.sortKey : Infinity;
      const kb = typeof b.sortKey === "number" ? b.sortKey : Infinity;
      if (ka !== kb) return ka - kb;
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date), "pt-BR");
      return String(a.stamp || "").localeCompare(String(b.stamp || ""));
    });
    return out;
  }

  function filtered(list) {
    let out = list;
    if (entityFilter) out = out.filter((e) => (e.entityIds || []).includes(entityFilter));
    if (term) {
      const t = term.toLowerCase();
      out = out.filter((e) => (e.title + " " + e.date + " " + e.text).toLowerCase().includes(t));
    }
    return out;
  }

  function renderChips() {
    const chips = [];
    chips.push(`<button class="tlChip ${!entityFilter ? "on" : ""}" data-ent="">Todas</button>`);
    const counts = new Map();
    for (const e of allEntries()) for (const id of e.entityIds || []) counts.set(id, (counts.get(id) || 0) + 1);
    const ordered = [...counts.entries()]
      .map(([id, n]) => ({ entity: store.getEntity(id), n }))
      .filter((x) => x.entity)
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    for (const item of ordered) {
      const t = store.type(item.entity.type);
      chips.push(`<button class="tlChip ${entityFilter === item.entity.id ? "on" : ""}" data-ent="${esc(item.entity.id)}" style="--typeColor:${esc(t.color)}">${esc(t.icon)} ${esc(item.entity.name)} <b>${item.n}</b></button>`);
    }
    chipsEl.innerHTML = chips.join("");
    qa(".tlChip", chipsEl).forEach((b) => {
      b.onclick = () => { entityFilter = b.dataset.ent || null; render(); };
    });
  }

  function card(entry) {
    const isChapter = entry.kind === "chapter";
    const linkedChapter = entry.chapterId ? book.get(entry.chapterId) : null;
    const cardEl = el(`<article class="tlCard ${isChapter ? "isChapter" : ""}" data-id="${esc(entry.id)}" data-kind="${entry.kind}">
      <div class="tlCardHead">
        <span class="tlCardKind" title="${isChapter ? "Capítulo do Livro" : "Evento"}">${isChapter ? "📖" : "📜"}</span>
        <h4 class="tlCardTitle">${esc(entry.title || "Sem título")}</h4>
        <button class="iconBtn tiny tlCardMenu" title="Ações">⋯</button>
      </div>
      ${entry.text ? `<div class="tlCardText">${renderRich(previewRaw(entry.text), { resolveName: (n) => store.resolveName(n), refTitle })}</div>` : ""}
      <div class="tlCardMeta"></div>
    </article>`);
    const meta = q(".tlCardMeta", cardEl);

    for (const id of (entry.entityIds || []).slice(0, 8)) {
      const entity = store.getEntity(id);
      if (!entity) continue;
      const chip = el(entityChipHtml(entity, { small: true }));
      chip.addEventListener("click", () => openEntity(entity.id));
      meta.appendChild(chip);
    }
    if (!isChapter && linkedChapter) {
      const b = el(`<button class="tlLink" title="Abrir o capítulo">📖 ${esc(linkedChapter.title)}</button>`);
      b.addEventListener("click", () => openChapter(linkedChapter.id));
      meta.appendChild(b);
    } else if (isChapter && (entry.chapter.attachments || []).length === 0) {
      const b = el(`<button class="tlLink" title="Abrir o capítulo">📖 Abrir capítulo</button>`);
      b.addEventListener("click", () => openChapter(entry.chapter.id));
      meta.appendChild(b);
    }
    if (isChapter) {
      const b = el(`<button class="tlLink" title="${VIEW.active ? "Abrir o capítulo" : "Escrever o capítulo"}">${VIEW.active ? "📖" : "✏️"} ${VIEW.active ? "Ler" : "Escrever"}</button>`);
      b.addEventListener("click", () => openChapter(entry.chapter.id));
      meta.appendChild(b);
    } else if (!entry.date) {
      meta.appendChild(el(`<span class="tlWarn">sem data</span>`));
    }

    if (isChapter) {
      q(".tlCardMenu", cardEl).addEventListener("click", (e) => {
        e.stopPropagation();
        popupMenu(e.currentTarget, [
          { icon: "📖", label: "Abrir o capítulo", onClick: () => openChapter(entry.chapter.id) },
          { icon: "⏳", label: "Criar evento a partir dele", onClick: () => openEventEditor({ title: entry.chapter.title, date: entry.chapter.moment, chapterId: entry.chapter.id, description: entry.chapter.text.slice(0, 400) }) },
        ], { alignRight: true });
      });
    } else {
      q(".tlCardMenu", cardEl).addEventListener("click", (e) => {
        e.stopPropagation();
        popupMenu(e.currentTarget, [
          { icon: "✏️", label: "Editar evento", onClick: () => openEventEditor({ event: entry.event }) },
          { icon: "🔖", label: "Anexar fichas…", onClick: async () => {
            const picked = await pickEntities({ title: "Fichas do evento", selected: entry.event.entityIds, multi: true, confirmLabel: "Salvar" });
            if (picked === null) return;
            timeline.update(entry.event.id, { entityIds: picked });
            render();
          } },
          { icon: "⏳", label: "Mover para outra data", onClick: () => moveEvent(entry.event) },
          { separator: true },
          { icon: "🗑️", label: "Apagar evento", danger: true, onClick: async () => {
            const ok = await confirmDialog({ title: "Apagar “" + entry.event.title + "”?", message: "O evento sai da cronologia.", confirmLabel: "Apagar", danger: true });
            if (!ok) return;
            timeline.remove(entry.event.id);
            render();
            toast("Evento apagado", "success");
          } },
        ], { alignRight: true });
      });
    }
    return cardEl;
  }

  function render() {
    renderChips();
    const list = filtered(allEntries());
    countEl.textContent = list.length + (list.length === 1 ? " entrada" : " entradas");
    if (!list.length) {
      const nothing = !timeline.list().length && !book.list().length;
      bodyEl.replaceChildren(el(`<div class="bkEmpty tlEmpty">
        <div class="bkEmptyIcon">⏳</div>
        <h3>${nothing ? "Sua cronologia começa aqui" : "Nada encontrado"}</h3>
        <p>${nothing
          ? "Crie um evento com data — ou escreva um capítulo e preencha o campo <b>Momento</b>: ele aparece automaticamente nesta linha do tempo, ligado às fichas que você citar."
          : "Nenhuma entrada corresponde ao filtro atual."}</p>
        <button class="btn primary" data-act="new">＋ Novo evento</button>
      </div>`));
      return;
    }
    const frag = document.createDocumentFragment();
    let lastName = null;
    let group = null;
    let cards = null;
    for (const entry of list) {
      const name = entry.date || "Sem data";
      if (name !== lastName) {
        group = el(`<section class="tlGroup">
          <div class="tlMarker"><span class="tlDot"></span><span class="tlDate">${esc(name)}</span></div>
          <div class="tlCards"></div>
        </section>`);
        frag.appendChild(group);
        cards = q(".tlCards", group);
        lastName = name;
      }
      cards.appendChild(card(entry));
    }
    bodyEl.replaceChildren(frag);
  }

  // ---------- acoes ----------

  function openEntity(id) {
    if (window.codex && window.codex.setView) window.codex.setView("browse");
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
  }

  function openChapter(id) {
    window.dispatchEvent(new CustomEvent("codex:open-chapter", { detail: { id } }));
  }

  async function moveEvent(event) {
    const date = await promptDate(event.date);
    if (date === null) return;
    timeline.update(event.id, { date, sortKey: parseSortKey(date) });
    render();
  }

  function exportMenu(anchor) {
    popupMenu(anchor, [
      { icon: "🗄️", label: "Backup da timeline (.json)", onClick: () => {
        download("timeline-codex.json", JSON.stringify(timeline.exportAll(), null, 2), "application/json");
        toast("Backup da timeline baixado", "success");
      } },
      { icon: "📄", label: "Cronologia em texto (.txt)", onClick: () => {
        const list = filtered(allEntries());
        if (!list.length) { toast("Nada para exportar", "error"); return; }
        let out = "TIMELINE\n\n";
        let last = null;
        for (const e of list) {
          if (e.date !== last) { out += "\n=== " + (e.date || "Sem data") + " ===\n"; last = e.date; }
          out += "• " + e.title + (e.text ? "\n  " + preview(e.text) : "") + "\n";
        }
        download("timeline.txt", out, "text/plain");
        toast("Timeline exportada", "success");
      } },
      { separator: true },
      { icon: "📖", label: (showChapters ? "Ocultar" : "Mostrar") + " os capítulos do Livro", onClick: () => { showChapters = !showChapters; render(); } },
    ], { alignRight: true });
  }

  searchInput.addEventListener("input", () => { term = searchInput.value.trim(); render(); });

  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "new") openEventEditor();
    else if (btn.dataset.act === "export") exportMenu(btn);
    else if (btn.dataset.act === "filters") {
      const open = !chipsEl.classList.contains("open");
      chipsEl.classList.toggle("open", open);
    }
  });

  book.events.on("change", () => { clearTimeout(render._t); render._t = setTimeout(render, 350); });
  book.events.on("loaded", () => { clearTimeout(render._t3); render._t3 = setTimeout(render, 60); });
  timeline.eventBus.on("change", () => { clearTimeout(render._t2); render._t2 = setTimeout(render, 200); });

  render();

  return {
    show() { host.hidden = false; render(); },
    hide() { host.hidden = true; },
  };
}

// ---------- editor de evento ----------

function promptDate(current) {
  return new Promise((resolve) => {
    const options = [...new Set([...timeline.dates(), ...MOMENT_SUGGESTIONS.filter(Boolean), ...book.list().map((c) => c.moment).filter(Boolean)])];
    const body = el(`<div class="field">
      <label class="fieldLabel">Data ou período</label>
      <input class="input" list="tlDateList" placeholder="Ex.: Ano 10 DC, 1975, Antes da Chegada" value="${esc(current || "")}">
      <datalist id="tlDateList">${options.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>
      <p class="fieldHint">Números ordenam a linha do tempo automaticamente (use “AC” ou “antes” para o que vem antes).</p>
    </div>`);
    const input = q("input", body);
    let done = false;
    const modal = openModal({
      title: "Data do evento",
      size: "sm",
      body,
      actions: [
        { label: "Cancelar", onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: "Salvar", kind: "primary", onClick: ({ close }) => { done = true; resolve(input.value.trim()); close(); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { done = true; resolve(input.value.trim()); modal.close(); } });
    setTimeout(() => input.focus(), 40);
  });
}

export function openEventEditor(opts) {
  opts = opts || {};
  const editing = opts.event || null;
  const state = {
    entityIds: editing ? editing.entityIds.slice() : (opts.entityIds || []).slice(),
    chapterId: editing ? editing.chapterId : (opts.chapterId || null),
  };

  const options = [...new Set([...timeline.dates(), ...MOMENT_SUGGESTIONS.filter(Boolean), ...book.list().map((c) => c.moment).filter(Boolean)])];
  const chapters = book.list();

  const body = el(`<div class="tlForm">
    <div class="field">
      <label class="fieldLabel">Título do evento</label>
      <input class="input tlTitleInput" placeholder="Ex.: A Queda da Muralha" maxlength="120" value="${esc(editing ? editing.title : (opts.title || ""))}">
    </div>
    <div class="field">
      <label class="fieldLabel">Data ou período</label>
      <input class="input tlDateInput" list="tlFormDates" placeholder="Ex.: Ano 10 DC, 1975, Antes da Chegada" value="${esc(editing ? editing.date : (opts.date || ""))}">
      <datalist id="tlFormDates">${options.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>
      <p class="fieldHint">Números ordenam a cronologia automaticamente (use “AC” ou “antes” para o que vem antes).</p>
    </div>
    <div class="field">
      <label class="fieldLabel">Descrição</label>
      <textarea class="input tlDescInput" rows="3" placeholder="O que aconteceu?">${esc(editing ? editing.description : (opts.description || ""))}</textarea>
    </div>
    <div class="field">
      <label class="fieldLabel">Capítulo do Livro</label>
      <select class="input tlChapterInput">
        <option value="">— nenhum —</option>
        ${chapters.map((c) => `<option value="${esc(c.id)}" ${state.chapterId === c.id ? "selected" : ""}>${esc(c.title || "Sem título")}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label class="fieldLabel">Fichas ligadas</label>
      <div class="tlFormChips"></div>
      <button class="btn tiny tlPickBtn">🔖 Escolher fichas…</button>
    </div>
  </div>`);

  const chipsEl = q(".tlFormChips", body);
  const titleEl = q(".tlTitleInput", body);
  const dateEl = q(".tlDateInput", body);
  const descEl = q(".tlDescInput", body);
  const chapterEl = q(".tlChapterInput", body);

  bindInputWordLinks(descEl);

  function renderChips() {
    if (!state.entityIds.length) {
      chipsEl.innerHTML = `<span class="bkHint">Nenhuma ficha ligada.</span>`;
      return;
    }
    chipsEl.innerHTML = state.entityIds.map((id) => {
      const e = store.getEntity(id);
      if (!e) return "";
      const t = store.type(e.type);
      return `<span class="tlFormChip" style="--typeColor:${esc(t.color)}" data-id="${esc(id)}">${esc(t.icon)} ${esc(e.name)} <b>✕</b></span>`;
    }).join("");
    qa(".tlFormChip", chipsEl).forEach((c) => {
      c.onclick = () => { state.entityIds = state.entityIds.filter((x) => x !== c.dataset.id); renderChips(); };
    });
  }

  q(".tlPickBtn", body).onclick = async () => {
    const picked = await pickEntities({ title: "Fichas do evento", selected: state.entityIds, multi: true, confirmLabel: "Salvar" });
    if (picked === null) return;
    state.entityIds = picked;
    renderChips();
  };

  renderChips();

  const modal = openModal({
    title: editing ? "Editar evento" : "Novo evento",
    subtitle: "Acontecimentos datados que cruzam capítulos e fichas.",
    size: "md",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      { label: editing ? "Salvar" : "Criar evento", kind: "primary", onClick: ({ close }) => {
        const title = titleEl.value.trim();
        if (!title) { toast("Dê um título ao evento", "error"); titleEl.focus(); return; }
        const patch = {
          title,
          date: dateEl.value.trim(),
          sortKey: parseSortKey(dateEl.value.trim()),
          description: descEl.value.trim(),
          entityIds: state.entityIds,
          chapterId: chapterEl.value || null,
        };
        if (editing) timeline.update(editing.id, patch);
        else timeline.create(patch);
        close();
        if (instance) instance.show();
        toast(editing ? "Evento atualizado" : "Evento criado na timeline", "success");
      } },
    ],
  });
  setTimeout(() => titleEl.focus(), 80);
  return modal;
}
