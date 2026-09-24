import { createGraph } from "../graph.js";
import { store } from "../store.js";
import { state, setUI, savePrefs, toggleInSet } from "./state.js";
import { q, qa, el, toast, openModal, popupMenu } from "./dom.js";
import { esc, truncate, mdToPlain } from "../util.js";
import { RELATION_GROUPS } from "../data.js";
import { openKindPicker } from "./relations.js";
import { VIEW, bloqueado } from "../view.js";

let graph = null;
let graphView = "graph";

export function graphState() {
  return graph ? graph.state : null;
}

export function graphObject() {
  return graph;
}

export function initGraphView(canvasId) {
  const canvas = q("#" + canvasId);
  if (!canvas) return null;
  graph = createGraph(canvas, {
    nodeRadius: 24,
    maxRadiusBonus: 14,
    linkLength: 210,
    repulsion: 8200,
    background: "rgba(0,0,0,0)",
    labelColor: "#e2e8f0",
    labelBackground: "rgba(10,14,23,0.97)",
    imageLoader: (n) => (n.imageId ? store.getImageSrc(store.getEntity(n.imageId)) : null),
    linkable: !VIEW.active,
  });
  graph.on("select", ({ id, source }) => {
    setUI({ graphSelectedId: id });
    graph.setSelected(id);
    renderGraphInfo(id);
    if (source === "dblclick") openEntity(id);
  });
  graph.on("open", (p) => openEntity(p.id));
  graph.on("background", () => {
    setUI({ graphSelectedId: null });
    graph.setSelected(null);
    renderGraphInfo(null);
  });
  graph.on("layoutchange", (p) => {
    if (p.fallback) toast("Essa seleção não tem laços de parentesco suficientes para montar uma árvore — mostrando disposição por força.", "info", 5000);
  });
  graph.on("link", ({ from, to }) => {
    if (VIEW.active) return bloqueado();
    openKindPicker({ fromId: from, toId: to });
  });
  graph.on("nodemenu", ({ id, x, y }) => {
    const rect = canvas.getBoundingClientRect();
    const items = [
      { icon: "📇", label: "Abrir ficha", onClick: () => openEntity(id) },
      ...(VIEW.active ? [] : [
        { icon: "🔗", label: "Ligar a outra ficha…", hint: "arraste", onClick: () => startPickTarget(id) },
        { separator: true },
      ]),
      { icon: "🎯", label: "Centrar aqui", onClick: () => { graph.setSelected(id); setUI({ graphSelectedId: id }); renderGraphInfo(id); graph.centerOn(id); } },
      { icon: "🧭", label: "Explorar a partir daqui", onClick: () => { state.graphScope = "focus"; state.rootEntityId = id; state.graphDepth = state.graphDepth || 2; savePrefs(); renderGraphView(graphView); } },
    ];
    popupMenu(null, items, { rect: { left: rect.left + x, top: rect.top + y, width: 0, height: 0, right: rect.left + x, bottom: rect.top + y } });
  });
  return graph;
}

function startPickTarget(fromId) {
  const body = el(`<div class="pickerList" id="linkTargetPicker">
    <p class="mutedNote">Escolha para qual ficha <strong>${esc((store.getEntity(fromId) || {}).name || "")}</strong> aponta a nova ligação.</p>
    <input class="input" id="ltSearch" placeholder="buscar ficha…" autocomplete="off">
    <div class="rootResults"></div></div>`);
  const rowHtml = (entity) => {
    const t = store.type(entity.type);
    const n = store.relationsOf(entity.id).length;
    return `<button class="pickerRow" data-id="${esc(entity.id)}"><span class="treeIcon">${esc(t.icon)}</span><span class="pickerName">${esc(entity.name)}</span><span class="pickerType">${n} conexõ${n === 1 ? "es" : "es"}</span></button>`;
  };
  const results = (term) => {
    const list = term
      ? store.search(term).map((r) => r.entity)
      : store.allEntities().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list.filter((e) => e.id !== fromId).slice(0, 40).map(rowHtml).join("");
  };
  const m = openModal({ title: "🔗 Ligar a outra ficha", size: "sm", body });
  const box = q(".rootResults", body);
  box.innerHTML = results("");
  q("#ltSearch", body).oninput = (e) => { box.innerHTML = results(e.target.value.trim()); };
  box.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    m.close();
    openKindPicker({ fromId, toId: row.dataset.id });
  });
  setTimeout(() => q("#ltSearch", body).focus(), 40);
}

function openEntity(id) {
  window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
}

function scopeIds() {
  const all = new Set(store.entities.keys());
  if (state.graphScope === "folder") {
    const fid = state.folderId && !state.folderId.startsWith("__") ? state.folderId : null;
    if (!fid) return all;
    const deep = store.descendantFolderIds(fid);
    return new Set([...all].filter((id) => {
      const e = store.getEntity(id);
      return e.folderId && deep.has(e.folderId);
    }));
  }
  if (state.graphScope === "focus" && state.rootEntityId && store.getEntity(state.rootEntityId)) {
    const depth = state.graphDepth || 2;
    const keep = new Set([state.rootEntityId]);
    let frontier = [state.rootEntityId];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) {
        for (const r of store.relationsOf(id)) {
          const other = r.from === id ? r.to : r.from;
          if (!keep.has(other)) { keep.add(other); next.push(other); }
        }
      }
      frontier = next;
    }
    return keep;
  }
  return all;
}

export function graphData() {
  const ids = scopeIds();
  const nodes = [];
  const edges = [];
  const hidden = new Set();
  for (const id of ids) {
    const entity = store.getEntity(id);
    if (!entity) continue;
    const t = store.type(entity.type);
    const deg = store.relationsOf(id).length;
    const node = {
      id,
      label: entity.name,
      sub: t.l,
      icon: t.icon,
      color: entity.color || t.color,
      imageId: store.images(entity).length ? entity.id : null,
      imgKey: (() => { const im = store.activeImage(entity); return im ? im.id + "." + (im.updatedAt || 0) : ""; })(),
      degree: deg,
    };
    if (state.graphTypeFilters.size && !state.graphTypeFilters.has(entity.type)) hidden.add(id);
    if (state.graphGroupFilters.size) {
      const groups = new Set(store.relationsOf(id).map((r) => store.kind(r.kind).g));
      if (![...groups].some((g) => state.graphGroupFilters.has(g))) hidden.add(id);
    }
    nodes.push(node);
  }
  for (const r of store.relations.values()) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    if (hidden.has(r.from) || hidden.has(r.to)) continue;
    const k = store.kind(r.kind);
    if (state.graphGroupFilters.size && !state.graphGroupFilters.has(k.g)) continue;
    const group = RELATION_GROUPS[k.g] || RELATION_GROUPS.outros;
    const nodeA = nodes.find((n) => n.id === r.from);
    const nodeB = nodes.find((n) => n.id === r.to);
    edges.push({
      id: r.id,
      source: r.from,
      target: r.to,
      color: group.color,
      directed: !k.sym,
      width: k.step ? 2.4 : 1.5,
      label: (nodeA && nodeB) ? shortenLabel(k.f) : "",
      group: k.g,
      genStep: k.step,
      genSame: k.id === "conjuge" || k.id === "namoro",
    });
  }
  return { nodes, edges, hidden };
}

function shortenLabel(label) {
  return label
    .replace("é ", "")
    .replace(" de", "")
    .replace("(a)", "")
    .replace("(ã)", "")
    .replace("(ó)", "")
    .replace("(a)", "")
    .replace("está em um relacionamento com", "romance")
    .replace("é casado com", "cônjuge")
    .trim();
}

export function showGraphView() {
  if (!graph) return;
  graph.resize();
  renderGraphView();
}

export function renderGraphView(kind) {
  graphView = "graph";
  const view = q("#graphView");
  if (!view || !graph) return;
  const bar = q("#graphToolbar");
  const types = store.types();
  const counts = store.stats().byType;
  const relGroups = store.relationGroups();
  bar.innerHTML = `
    <div class="graphBarGroup">
      <select class="miniSelect" id="${graphView}Scope">
        <option value="all" ${state.graphScope === "all" ? "selected" : ""}>Todas as fichas</option>
        <option value="folder" ${state.graphScope === "folder" ? "selected" : ""}>Pasta atual</option>
        <option value="focus" ${state.graphScope === "focus" ? "selected" : ""}>A partir de uma ficha…</option>
      </select>
      ${state.graphScope === "focus" ? `<button class="btn tiny" id="${graphView}RootBtn">${state.rootEntityId && store.getEntity(state.rootEntityId) ? esc(store.getEntity(state.rootEntityId).name) : "escolher ficha"}</button>
      <select class="miniSelect" id="${graphView}Depth">${[1, 2, 3, 4].map((d) => `<option value="${d}" ${(state.graphDepth || 2) === d ? "selected" : ""}>${d} grau${d > 1 ? "s" : ""}</option>`).join("")}</select>` : ""}
    </div>
    <div class="graphBarGroup">
      <button class="segBtn ${state.graphLayout === "force" ? "on" : ""}" data-layout="force">🌌 Força</button>
      <button class="segBtn ${state.graphLayout === "tree" ? "on" : ""}" data-layout="tree">👪 Genealogia</button>
    </div>
    <div class="graphBarGroup grow">
      <input class="input" id="${graphView}Search" placeholder="destacar fichas na teia…" autocomplete="off">
    </div>
    <div class="graphBarGroup">
      <button class="iconBtn" id="${graphView}ZoomOut" title="Diminuir">−</button>
      <button class="iconBtn" id="${graphView}ZoomIn" title="Aumentar">+</button>
      <button class="iconBtn" id="${graphView}Fit" title="Enquadrar tudo">⤢</button>
      <button class="iconBtn" id="${graphView}Relayout" title="Reorganizar">🔄</button>
    </div>
    <div class="graphChips">
      ${types.filter((t) => counts[t.id]).map((t) => `<button class="chip ${state.graphTypeFilters.has(t.id) ? "on" : ""}" data-gtype="${esc(t.id)}" style="--chipColor:${esc(t.color)}"><span class="chipDot" style="background:${esc(t.color)}"></span>${esc(t.l)}</button>`).join("")}
      <span class="chipDivider"></span>
      ${Object.entries(RELATION_GROUPS).filter(([g]) => relGroups[g]).map(([g, info]) => `<button class="chip ${state.graphGroupFilters.has(g) ? "on" : ""}" data-ggroup="${esc(g)}" style="--chipColor:${esc(info.color)}"><span class="chipDot" style="background:${esc(info.color)}"></span>${esc(info.l)}</button>`).join("")}
    </div>`;

  q(`#${graphView}Scope`).onchange = (e) => {
    state.graphScope = e.target.value;
    if (state.graphScope === "focus" && !state.rootEntityId) { pickRoot(); return; }
    savePrefs();
    refreshGraph();
    renderGraphView(graphView);
  };
  const rootBtn = q(`#${graphView}RootBtn`);
  if (rootBtn) rootBtn.onclick = () => pickRoot();
  const depthSel = q(`#${graphView}Depth`);
  if (depthSel) depthSel.onchange = (e) => { state.graphDepth = Number(e.target.value); refreshGraph(); };
  qa("[data-layout]", bar).forEach((b) => {
    b.onclick = () => {
      state.graphLayout = b.dataset.layout;
      savePrefs();
      qa("[data-layout]", bar).forEach((x) => x.classList.toggle("on", x === b));
      graph.setLayout(state.graphLayout);
    };
  });
  const search = q(`#${graphView}Search`);
  search.oninput = () => {
    const term = search.value.trim();
    if (!term) { graph.highlight([]); return; }
    const ids = store.search(term).map((r) => r.entity.id);
    graph.highlight(ids);
    if (ids.length === 1) graph.centerOn(ids[0]);
  };
  q(`#${graphView}ZoomIn`).onclick = () => graph.zoomAt(graph.state.vw / 2, graph.state.vh / 2, 1.25);
  q(`#${graphView}ZoomOut`).onclick = () => graph.zoomAt(graph.state.vw / 2, graph.state.vh / 2, 0.8);
  q(`#${graphView}Fit`).onclick = () => graph.fit();
  q(`#${graphView}Relayout`).onclick = () => reshuffle();
  qa("[data-gtype]", bar).forEach((b) => {
    b.onclick = () => { toggleInSet(state.graphTypeFilters, b.dataset.gtype); savePrefs(); b.classList.toggle("on"); refreshGraph(); };
  });
  qa("[data-ggroup]", bar).forEach((b) => {
    b.onclick = () => { toggleInSet(state.graphGroupFilters, b.dataset.ggroup); savePrefs(); b.classList.toggle("on"); refreshGraph(); };
  });
  refreshGraph();
  if (graphView === "graph") renderGraphInfo(state.graphSelectedId || null);
}

async function pickRoot() {
  const body = el(`<div class="pickerList" id="rootPicker">
    <input class="input" id="rootSearch" placeholder="buscar ficha…" autocomplete="off">
    <div class="rootResults"></div></div>`);
  const results = (term) => {
    const list = term
      ? store.search(term).map((r) => r.entity).slice(0, 10)
      : store.allEntities().sort((a, b) => store.relationsOf(b.id).length - store.relationsOf(a.id).length).slice(0, 10);
    return list.map((entity) => {
      const t = store.type(entity.type);
      return `<button class="pickerRow" data-id="${esc(entity.id)}"><span class="treeIcon">${esc(t.icon)}</span><span class="pickerName">${esc(entity.name)}</span><span class="pickerType">${store.relationsOf(entity.id).length} conexões</span></button>`;
    }).join("");
  };
  const m = openModal({ title: "Centrar a teia em uma ficha", size: "sm", body });
  const box = q(".rootResults", body);
  box.innerHTML = results("");
  q("#rootSearch", body).oninput = (e) => { box.innerHTML = results(e.target.value.trim()); };
  body.addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    state.rootEntityId = row.dataset.id;
    state.graphScope = "focus";
    savePrefs();
    m.close();
    renderGraphView(graphView);
  });
  setTimeout(() => q("#rootSearch", body).focus(), 40);
}

export function refreshGraph() {
  if (!graph) return;
  const data = graphData();
  graph.setData(data, { fit: !graph.state.nodes.length });
  graph.setHidden(data.hidden);
  if (state.graphLayout === "tree") graph.setLayout("tree");
  const selected = state.graphSelectedId;
  if (selected && data.nodes.some((n) => n.id === selected)) {
    graph.setSelected(selected);
    graph.centerOn(selected);
  }
  const stats = q("#graphStats");
  if (stats) stats.textContent = `${data.nodes.length} fichas · ${data.edges.length} conexões visíveis`;
}

function reshuffle() {
  for (const n of graph.state.nodes) {
    n.x = (Math.random() - 0.5) * 400;
    n.y = (Math.random() - 0.5) * 400;
    n.vx = 0; n.vy = 0;
  }
  graph.wake(1);
}

function renderGraphInfo(id) {
  const ctn = q("#graphInfo");
  if (!ctn) return;
  if (!id) { ctn.innerHTML = `<div class="graphInfoHint">Clique em uma ficha para ver os detalhes<br><span class="muted">arraste para mover · roda do mouse para zoom · clique duplo abre a ficha${VIEW.active ? "" : "<br><strong>botão direito numa ficha</strong> e arraste até outra para ligá-las · ou passe o mouse e use a alça 🔗"}</span></div>`; return; }
  const entity = store.getEntity(id);
  if (!entity) return;
  const t = store.type(entity.type);
  const rels = store.relationsOf(id).length;
  ctn.innerHTML = `<div class="giCard">
    <div class="giImg" id="giImg" style="--typeColor:${esc(t.color)}"><span>${esc(t.icon)}</span></div>
    <div class="giHead"><span class="typeBadge" style="--typeColor:${esc(t.color)}">${esc(t.l)}</span><h4>${esc(entity.name)}</h4></div>
    <p class="giSummary">${entity.summary ? esc(truncate(mdToPlain(entity.summary), 150)) : `<span class="muted">sem resumo</span>`}</p>
    ${(entity.aliases || []).length ? `<div class="giAliases">${entity.aliases.slice(0, 4).map((a) => `<span class="aliasChip">${esc(a)}</span>`).join("")}</div>` : ""}
    <div class="giStats"><span>${rels} conexõ${rels === 1 ? "es" : "es"}</span>${(entity.tags || []).length ? `<span>${(entity.tags || []).length} etiquetas</span>` : ""}</div>
    <div class="giBtns">
      <button class="btn primary tiny" id="giOpen">Abrir ficha</button>
      <button class="btn tiny" id="giRel">🔗 Relação</button>
    </div>
    <button class="btn tiny ghost" id="giCenter">Centrar aqui</button>
    <button class="btn tiny ghost" id="giFocus">Explorar a partir daqui</button>
  </div>`;
  store.getImageSrc(entity).then((src) => {
    const img = q("#giImg");
    if (src && img && img.isConnected) {
      img.style.backgroundImage = `url("${src}")`;
      img.classList.add("hasImg");
      const s = q("span", img);
      if (s) s.remove();
    }
  });
  q("#giOpen").onclick = () => openEntity(id);
  q("#giRel").onclick = () => window.dispatchEvent(new CustomEvent("codex:open-relation", { detail: { id } }));
  q("#giCenter").onclick = () => graph.centerOn(id);
  q("#giFocus").onclick = () => { state.graphScope = "focus"; state.rootEntityId = id; state.graphDepth = state.graphDepth || 2; savePrefs(); renderGraphView(graphView); };
}

export function focusInGraph(id) {
  state.graphSelectedId = id;
  refreshGraph();
  if (graph) graph.centerOn(id, Math.max(1.1, graph.state.scale));
  renderGraphInfo(id);
}
