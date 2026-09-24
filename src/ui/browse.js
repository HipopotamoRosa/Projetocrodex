import { store } from "../store.js";
import { state, setUI, savePrefs, toggleInSet, ui } from "./state.js";
import { q, qa, el, popupMenu, promptDialog, confirmDialog, toast, openModal } from "./dom.js";
import { esc, truncate, mdToPlain } from "../util.js";
import { VIEW } from "../view.js";

export function visibleEntities() {
  const folderSet = state.folderId && state.folderId.startsWith("__") ? null : state.folderId;
  let ids = null;
  if (folderSet) ids = store.descendantFolderIds(folderSet);
  let list = store.allEntities().filter((e) => {
    if (state.folderId === "__fav") { if (!e.favorite) return false; }
    else if (state.folderId === "__none") { if (e.folderId) return false; }
    else if (ids) { if (!e.folderId || !ids.has(e.folderId)) return false; }
    if (state.typeFilters.size && !state.typeFilters.has(e.type)) return false;
    if (state.tagFilters.size) {
      const tags = (e.tags || []).map((t) => t.toLowerCase());
      for (const t of state.tagFilters) if (!tags.includes(t.toLowerCase())) return false;
    }
    if (state.favoritesOnly && !e.favorite) return false;
    return true;
  });
  const term = state.search.trim();
  if (term) {
    const scored = store.search(term);
    const scoreMap = new Map(scored.map((s) => [s.entity.id, s.score]));
    list = list.filter((e) => scoreMap.has(e.id));
    list.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
    return list;
  }
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    recent: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    connections: (a, b) => store.relationsOf(b.id).length - store.relationsOf(a.id).length,
    type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "pt-BR"),
  };
  list.sort(sorters[state.sort] || sorters.name);
  return list;
}

function countInFolder(folderId, deep) {
  const ids = deep ? store.descendantFolderIds(folderId) : null;
  let n = 0;
  for (const e of store.entities.values()) {
    if (folderId === "__all") n++;
    else if (folderId === "__none") { if (!e.folderId) n++; }
    else if (folderId === "__fav") { if (e.favorite) n++; }
    else if (deep ? (e.folderId && ids.has(e.folderId)) : e.folderId === folderId) n++;
  }
  return n;
}

const expanded = new Set();

export function renderSidebar() {
  const ctn = q("#folderTree");
  if (!ctn) return;
  const stats = store.stats();
  const openIds = new Set();
  const markOpen = (fid) => { if (expanded.has(fid) || state.folderId === fid || store.folderPath(state.folderId || "").some((f) => f.id === fid)) openIds.add(fid); };
  for (const f of store.folders.values()) markOpen(f.id);

  const rows = [];
  rows.push(`<div class="treeRow ${state.folderId === "__all" || !state.folderId ? "active" : ""}" data-folder="__all"><span class="treeCaret empty"></span><span class="treeIcon">🗂️</span><span class="treeName">Todas as fichas</span><span class="treeCount">${stats.entities}</span></div>`);
  rows.push(`<div class="treeSectionLabel">Pastas</div>`);
  const walk = (parentId, depth) => {
    for (const f of store.childFolders(parentId)) {
      const children = store.childFolders(f.id);
      const isOpen = openIds.has(f.id) || (depth === 0 && store.folders.size <= 6);
      const active = state.folderId === f.id;
      rows.push(`<div class="treeRow ${active ? "active" : ""}" data-folder="${esc(f.id)}" draggable="true" style="--depth:${depth}">
        <button class="treeCaret ${children.length ? "" : "empty"}" data-caret="${esc(f.id)}">${children.length ? (isOpen ? "▾" : "▸") : ""}</button>
        <span class="treeIcon" style="${f.color ? "color:" + esc(f.color) : ""}">${esc(f.icon || "📁")}</span>
        <span class="treeName">${esc(f.name)}</span>
        <span class="treeCount">${countInFolder(f.id, true)}</span>
        <button class="treeMore" data-more="${esc(f.id)}" title="Opções">⋯</button>
      </div>`);
      if (isOpen) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  rows.push(`<div class="treeRow ${state.folderId === "__none" ? "active" : ""}" data-folder="__none"><span class="treeCaret empty"></span><span class="treeIcon">📭</span><span class="treeName">Sem pasta</span><span class="treeCount">${countInFolder("__none")}</span></div>`);
  rows.push(`<div class="treeRow ${state.folderId === "__fav" ? "active" : ""}" data-folder="__fav"><span class="treeCaret empty"></span><span class="treeIcon">⭐</span><span class="treeName">Favoritos</span><span class="treeCount">${countInFolder("__fav")}</span></div>`);
  ctn.innerHTML = rows.join("");

  q("#newFolderBtn").onclick = () => createFolderFlow(null);
}

async function createFolderFlow(parentId) {
  const name = await promptDialog({ title: parentId ? "Nova subpasta" : "Nova pasta", label: "Nome da pasta", placeholder: "ex: Reino de Eldoria" });
  if (!name || !name.trim()) return;
  const folder = store.createFolder({ name: name.trim(), parentId: parentId || null });
  if (parentId) expanded.add(parentId);
  setUI({ folderId: folder.id });
  savePrefs();
  renderSidebar();
  renderList();
}

function folderMenu(anchor, folderId) {
  const f = store.folders.get(folderId);
  if (!f) return;
  popupMenu(anchor, [
    { icon: "📁", label: "Nova subpasta", onClick: () => createFolderFlow(folderId) },
    { icon: "✏️", label: "Renomear", onClick: async () => {
      const name = await promptDialog({ title: "Renomear pasta", label: "Nome", value: f.name });
      if (name && name.trim()) { store.updateFolder(folderId, { name: name.trim() }); renderSidebar(); renderList(); }
    } },
    { icon: "🎨", label: "Ícone", onClick: async () => {
      const icon = await promptDialog({ title: "Ícone da pasta", label: "Emoji", value: f.icon, hint: "Cole um emoji, ex: 🏰 🔮 ⚔️ 🌙" });
      if (icon && icon.trim()) { store.updateFolder(folderId, { icon: icon.trim().slice(0, 4) }); renderSidebar(); }
    } },
    { icon: "🌈", label: "Cor", onClick: () => colorPickerFlow(f) },
    { icon: "🏷️", label: "Descrição", onClick: async () => {
      const description = await promptDialog({ title: "Descrição da pasta", label: "Sobre esta pasta", value: f.description, multiline: true });
      if (description !== null) { store.updateFolder(folderId, { description: description.trim() }); }
    } },
    { separator: true },
    { icon: "➕", label: "Nova ficha aqui", onClick: () => { setUI({ folderId }); renderSidebar(); renderList(); window.dispatchEvent(new CustomEvent("codex:new-entity")); } },
    { separator: true },
    { icon: "🗑️", label: "Excluir pasta", danger: true, hint: "fichas sobem um nível", onClick: async () => {
      const ok = await confirmDialog({ title: "Excluir pasta?", message: `"${f.name}" será removida. As fichas e subpastas dentro dela sobem para o nível acima.`, confirmLabel: "Excluir", danger: true });
      if (!ok) return;
      store.deleteFolder(folderId);
      if (state.folderId === folderId) setUI({ folderId: f.parentId || null });
      renderSidebar(); renderList();
      toast("Pasta excluída");
    } },
  ], { alignRight: false });
}

async function colorPickerFlow(folder) {
  const colors = ["#a78bfa", "#f472b6", "#f59e0b", "#34d399", "#38bdf8", "#60a5fa", "#f87171", "#c084fc", "#94a3b8"];
  const body = el(`<div class="swatchRow">${colors.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join("")}<button class="swatch swatchNone" data-color="">sem cor</button></div>`);
  const m = openModal({ title: "Cor da pasta", size: "sm", body });
  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-color]");
    if (!btn) return;
    store.updateFolder(folder.id, { color: btn.dataset.color || null });
    renderSidebar();
    m.close();
  });
}

export function renderListHead() {
  const types = store.types();
  const counts = store.stats().byType;
  const chips = types
    .filter((t) => counts[t.id])
    .map((t) => `<button class="chip ${state.typeFilters.has(t.id) ? "on" : ""}" data-type="${esc(t.id)}" style="--chipColor:${esc(t.color)}"><span class="chipDot" style="background:${esc(t.color)}"></span>${esc(t.l)} <span class="chipNum">${counts[t.id]}</span></button>`)
    .join("");
  const tagCounts = new Map();
  for (const e of store.allEntities()) for (const t of e.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const tagChips = topTags.map(([t, n]) => `<button class="chip chipTag ${state.tagFilters.has(t) ? "on" : ""}" data-tag="${esc(t)}">#${esc(t)} <span class="chipNum">${n}</span></button>`).join("");
  const crumbs = state.folderId && !state.folderId.startsWith("__")
    ? store.folderPath(state.folderId).map((f, i, arr) => `<button class="crumb" data-crumb="${esc(f.id)}">${esc(f.icon || "📁")} ${esc(f.name)}</button>`).join('<span class="crumbSep">›</span>')
    : "";
  const sortLabels = { name: "Nome", recent: "Editadas", created: "Criadas", connections: "Conexões", type: "Tipo" };
  q("#listHead").innerHTML = `
    <div class="listHeadTop">
      <div class="crumbs">${crumbs || `<span class="crumbStatic">Todas as fichas</span>`}</div>
      <div class="listHeadBtns">
        <button class="iconBtn ${state.favoritesOnly ? "on" : ""}" id="favFilterBtn" title="Só favoritos">★</button>
        <button class="iconBtn" id="densityBtn" title="Alternar visualização">${state.density === "grid" ? "▤" : "▦"}</button>
        <select class="miniSelect" id="sortSelect">${Object.entries(sortLabels).map(([k, v]) => `<option value="${k}" ${state.sort === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
    </div>
    <div class="chipRow">${chips || `<span class="mutedNote">Nenhuma ficha ainda</span>`}</div>
    ${tagChips ? `<div class="chipRow chipRowTags">${tagChips}</div>` : ""}`;
  q("#favFilterBtn").onclick = () => { state.favoritesOnly = !state.favoritesOnly; renderListHead(); renderList(); };
  q("#densityBtn").onclick = () => { state.density = state.density === "grid" ? "list" : "grid"; savePrefs(); renderListHead(); renderList(); };
  q("#sortSelect").onchange = (e) => { state.sort = e.target.value; savePrefs(); renderList(); };
  qa("[data-crumb]", q("#listHead")).forEach((b) => {
    b.onclick = () => { setUI({ folderId: b.dataset.crumb, entityId: null }); savePrefs(); renderSidebar(); renderListHead(); renderList(); };
  });
  qa("[data-type]", q("#listHead")).forEach((b) => {
    b.onclick = () => { toggleInSet(state.typeFilters, b.dataset.type); savePrefs(); renderListHead(); renderList(); };
  });
  qa("[data-tag]", q("#listHead")).forEach((b) => {
    b.onclick = () => { toggleInSet(state.tagFilters, b.dataset.tag); renderListHead(); renderList(); };
  });
}

export function renderList() {
  const ctn = q("#entityList");
  if (!ctn) return;
  const list = visibleEntities();
  const countEl = q("#listCount");
  if (countEl) countEl.textContent = list.length;
  if (!list.length) {
    const total = store.entities.size;
    ctn.innerHTML = total
      ? `<div class="emptyState"><div class="emptyIcon">🔍</div><h3>Nada por aqui</h3><p>Ajuste os filtros ou a busca para ver suas fichas.</p></div>`
      : (VIEW.active
        ? `<div class="emptyState"><div class="emptyIcon">🗂️</div><h3>Este Codex publicado não tem fichas</h3><p>O autor não publicou fichas neste instantâneo.</p></div>`
        : `<div class="emptyState"><div class="emptyIcon">📇</div><h3>Comece seu arquivo</h3><p>Crie sua primeira ficha, organize tudo em pastas e ligue as fichas na rede.</p><div class="emptyBtns"><button class="btn primary" data-empty-new="personagem">Criar personagem</button><button class="btn" data-empty-sample="1">🌱 Carregar exemplo</button></div></div>`);
    const nb = q("[data-empty-new]", ctn);
    if (nb) nb.onclick = () => window.dispatchEvent(new CustomEvent("codex:new-entity", { detail: { type: nb.dataset.emptyNew } }));
    const sb = q("[data-empty-sample]", ctn);
    if (sb) sb.onclick = () => window.dispatchEvent(new CustomEvent("codex:load-sample"));
    return;
  }
  const html = list.map((e) => cardHtml(e)).join("");
  ctn.innerHTML = html;
  ctn.className = "entityList " + (state.density === "grid" ? "grid" : "rows");
  for (const card of qa(".card", ctn)) {
    const id = card.dataset.id;
    const entity = store.getEntity(id);
    if (entity) hydrateCard(card, entity);
  }
}

function cardHtml(e) {
  const t = store.type(e.type);
  const relCount = store.relationsOf(e.id).length;
  const tags = (e.tags || []).slice(0, 4).map((tag) => `<span class="tagMini">#${esc(tag)}</span>`).join("");
  const summary = e.summary ? truncate(mdToPlain(e.summary), 96) : "";
  return `<article class="card ${state.entityId === e.id ? "active" : ""}" data-id="${esc(e.id)}" draggable="true" style="--typeColor:${esc(t.color)}">
    <div class="cardThumb" data-thumb="${esc(e.id)}"><span class="cardIcon">${esc(t.icon)}</span></div>
    <div class="cardBody">
      <div class="cardNameRow"><h4 class="cardName">${esc(e.name)}</h4>${e.favorite ? `<span class="cardFav">★</span>` : ""}</div>
      <div class="cardMeta"><span class="typeBadge" style="--typeColor:${esc(t.color)}">${esc(t.l)}</span>${relCount ? `<span class="cardRel">${relCount} conexõ${relCount === 1 ? "es" : "es"}</span>` : ""}</div>
      ${summary ? `<p class="cardSummary">${esc(summary)}</p>` : ""}
      ${tags ? `<div class="cardTags">${tags}</div>` : ""}
    </div>
    <button class="cardMore" data-cardmore="${esc(e.id)}" title="Opções">⋯</button>
  </article>`;
}

async function hydrateCard(card, entity) {
  const thumb = q("[data-thumb]", card);
  if (thumb) {
    const src = await store.getImageSrc(entity);
    if (src && card.isConnected) {
      thumb.style.backgroundImage = `url("${src}")`;
      thumb.classList.add("hasImg");
      const icon = q(".cardIcon", thumb);
      if (icon) icon.remove();
    }
  }
  card.onclick = (e) => {
    if (e.target.closest("[data-cardmore]")) return;
    setUI({ entityId: entity.id });
    savePrefs();
    markActiveCard();
    window.dispatchEvent(new CustomEvent("codex:select", { detail: { id: entity.id } }));
  };
  card.ondblclick = () => window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: entity.id } }));
  const more = q("[data-cardmore]", card);
  if (more) more.onclick = (ev) => { ev.stopPropagation(); entityMenu(more, entity.id); };
  card.addEventListener("dragstart", (ev) => {
    ev.dataTransfer.setData("text/codex-entity", entity.id);
    ev.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
}

function markActiveCard() {
  for (const c of qa(".card")) c.classList.toggle("active", c.dataset.id === state.entityId);
}

export function entityMenu(anchor, id) {
  const e = store.getEntity(id);
  if (!e) return;
  popupMenu(anchor, [
    { icon: "🔍", label: "Abrir ficha", onClick: () => { setUI({ entityId: id }); window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } })); } },
    { icon: "✏️", label: "Editar", onClick: () => { setUI({ entityId: id }); window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id, edit: true } })); } },
    { icon: e.favorite ? "☆" : "★", label: e.favorite ? "Remover dos favoritos" : "Favoritar", onClick: () => { store.updateEntity(id, { favorite: !e.favorite }); renderList(); renderSidebar(); } },
    { separator: true },
    { icon: "📁", label: "Mover para…", onClick: () => moveEntityFlow(id) },
    { icon: "⧉", label: "Duplicar", onClick: async () => {
      await store.duplicateEntity(id);
      toast("Ficha duplicada", "success");
      renderSidebar(); renderList();
    } },
    { separator: true },
    { icon: "🗑️", label: "Excluir", danger: true, onClick: async () => {
      const ok = await confirmDialog({ title: "Excluir ficha?", message: `"${e.name}" e todas as suas relações serão removidas.`, confirmLabel: "Excluir", danger: true });
      if (!ok) return;
      store.deleteEntity(id);
      if (state.entityId === id) setUI({ entityId: null });
      renderSidebar(); renderList();
      window.dispatchEvent(new CustomEvent("codex:select", { detail: { id: null } }));
      toast("Ficha excluída");
    } },
  ]);
}

export async function moveEntityFlow(id) {
  const entity = store.getEntity(id);
  if (!entity) return;
  const folders = [...store.folders.values()].sort((a, b) => store.folderPath(a.id).length - store.folderPath(b.id).length);
  const body = el(`<div class="pickerList">
    <button class="pickerRow" data-folder=""><span class="treeIcon">📭</span> Sem pasta</button>
    ${folders.map((f) => `<button class="pickerRow" data-folder="${esc(f.id)}">${renderPath(f.id)}</button>`).join("")}
  </div>`);
  const m = openModal({ title: "Mover ficha", subtitle: entity.name, size: "sm", body });
  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-folder]");
    if (!btn) return;
    store.updateEntity(id, { folderId: btn.dataset.folder || null });
    m.close();
    renderSidebar(); renderList();
    toast("Ficha movida", "success");
  });
}

function renderPath(id) {
  return store.folderPath(id).map((f) => `${esc(f.icon || "📁")} ${esc(f.name)}`).join(' <span class="crumbSep">›</span> ');
}

export function initBrowse() {
  const tree = q("#folderTree");
  tree.addEventListener("click", (e) => {
    const caret = e.target.closest("[data-caret]");
    if (caret) {
      const id = caret.dataset.caret;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      renderSidebar();
      return;
    }
    const more = e.target.closest("[data-more]");
    if (more) {
      e.stopPropagation();
      folderMenu(more, more.dataset.more);
      return;
    }
    const row = e.target.closest("[data-folder]");
    if (row) {
      const fid = row.dataset.folder;
      if (fid && !fid.startsWith("__")) expanded.add(fid);
      setUI({ folderId: fid === null ? null : fid });
      savePrefs();
      renderSidebar(); renderListHead(); renderList();
      ui.emit("selection");
    }
  });
  tree.addEventListener("dragover", (e) => {
    const row = e.target.closest("[data-folder]");
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    for (const r of qa(".treeRow.dropTarget", tree)) r.classList.remove("dropTarget");
    row.classList.add("dropTarget");
  });
  tree.addEventListener("dragleave", (e) => {
    const row = e.target.closest("[data-folder]");
    if (row) row.classList.remove("dropTarget");
  });
  tree.addEventListener("drop", (e) => {
    const row = e.target.closest("[data-folder]");
    if (!row) return;
    e.preventDefault();
    row.classList.remove("dropTarget");
    const targetFolder = row.dataset.folder;
    const fid = e.dataTransfer.getData("text/codex-folder");
    if (fid) {
      if (fid === targetFolder) return;
      const target = targetFolder && !targetFolder.startsWith("__") ? targetFolder : null;
      const banned = store.descendantFolderIds(fid);
      if (target && banned.has(target)) { toast("Não dá para mover uma pasta para dentro dela mesma", "error"); return; }
      store.updateFolder(fid, { parentId: target });
      if (target) expanded.add(target);
      renderSidebar();
      return;
    }
    const id = e.dataTransfer.getData("text/codex-entity");
    if (!id) return;
    const folderId = targetFolder === "__none" || (targetFolder && targetFolder.startsWith("__")) ? null : targetFolder;
    store.updateEntity(id, { folderId });
    renderSidebar(); renderList();
    toast("Ficha movida", "success");
  });
  q("#newFolderBtn").onclick = () => createFolderFlow(state.folderId && !state.folderId.startsWith("__") ? state.folderId : null);
}

export function initGlobalSearch() {
  const input = q("#globalSearchInput");
  const box = q("#searchResultsCtn");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const val = input.value;
    state.search = val;
    timer = setTimeout(() => {
      renderList();
      if (!val.trim()) { box.hidden = true; box.innerHTML = ""; return; }
      const results = store.search(val).slice(0, 12);
      if (!results.length) {
        box.innerHTML = `<div class="searchEmpty">Nenhuma ficha encontrada para "${esc(val)}"</div>`;
        box.hidden = false;
        return;
      }
      box.innerHTML = results.map(({ entity }) => {
        const t = store.type(entity.type);
        return `<button class="searchRow" data-id="${esc(entity.id)}"><span class="searchIcon">${esc(t.icon)}</span><span class="searchName">${esc(entity.name)}</span><span class="searchType">${esc(t.l)}</span>${entity.summary ? `<span class="searchSummary">${esc(truncate(mdToPlain(entity.summary), 50))}</span>` : ""}</button>`;
      }).join("") + `<button class="searchRow searchAll" data-all="1">Ver todos os resultados na lista →</button>`;
      box.hidden = false;
      box.onclick = (e) => {
        const row = e.target.closest("[data-id]");
        if (row) {
          const id = row.dataset.id;
          box.hidden = true;
          setUI({ entityId: id, folderId: null });
          savePrefs();
          renderSidebar(); renderListHead(); renderList();
          window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
          return;
        }
        if (e.target.closest("[data-all]")) { box.hidden = true; renderList(); }
      };
    }, 140);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; state.search = ""; box.hidden = true; renderList(); input.blur(); }
    if (e.key === "Enter") { box.hidden = true; renderList(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#searchWrap")) box.hidden = true;
  });
  q("#globalSearchClear")?.addEventListener("click", () => { input.value = ""; state.search = ""; box.hidden = true; renderList(); });
}
