import { store } from "../store.js";
import { state, setUI, savePrefs } from "./state.js";
import { q, qa, el, toast, openModal, confirmDialog, popupMenu, promptDialog } from "./dom.js";
import { esc, truncate, mdToPlain, renderRich, buildNameRegex, splitList, formatDate, norm } from "../util.js";
import { fieldDef, RELATION_GROUPS } from "../data.js";
import { createGraph } from "../graph.js";
import { openKindPicker, openKindsManager } from "./relations.js";
import { book } from "../book/store.js";
import { timeline } from "../timeline/store.js";
import { mediaHtml, hydrateMedia, bindMedia, descGalleryHtml, bindDescGallery, descEditorHtml, bindDescEditor } from "./media.js";
import { bindInputWordLinks } from "./wordlink.js";
import { mountCapPanel } from "../competencia/panel.js";
import { heroMedalsHtml } from "../competencia/render.js";
import { VIEW } from "../view.js";

const refTitle = (entity) => store.type(entity.type).l + ": " + entity.name;

let miniGraph = null;

export function miniGraphState() {
  return miniGraph ? miniGraph.state : null;
}

export function miniGraphObject() {
  return miniGraph;
}
let boundId = null;
let saveTimer = null;

export function renderDetail() {
  const pane = q("#detailBody");
  if (!pane) return;
  if (miniGraph) { miniGraph.destroy(); miniGraph = null; }
  const id = state.entityId;
  if (!id || !store.getEntity(id)) {
    pane.innerHTML = emptyDetailHtml();
    bindEmpty();
    return;
  }
  const entity = store.getEntity(id);
  if (boundId !== id) boundId = id;
  if (state.detailMode === "edit") renderEditor(pane, entity);
  else renderFicha(pane, entity);
}

function emptyDetailHtml() {
  const stats = store.stats();
  const recent = store.allEntities().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);
  const recentHtml = recent.length ? `<div class="recentBlock"><h3>${VIEW.active ? "Fichas deste Codex" : "Editadas recentemente"}</h3>${recent.map((e) => {
      const t = store.type(e.type);
      return `<button class="recentRow" data-id="${esc(e.id)}"><span class="recentIcon">${esc(t.icon)}</span><span class="recentName">${esc(e.name)}</span><span class="recentTime">${esc(formatDate(e.updatedAt))}</span></button>`;
    }).join("")}</div>` : "";
  // Codex publicado: nada de atalhos que criam — só a lista para continuar lendo.
  if (VIEW.active) {
    return `<div class="detailEmpty">
    <div class="detailEmptyTop">
      <h2>Codex publicado</h2>
      <p>${stats.entities} fichas · ${stats.relations} conexões · ${stats.folders} pastas</p>
      <p class="detailEmptyHint">Escolha uma ficha na lista para ler. Nada aqui pode ser alterado.</p>
    </div>
    ${recentHtml}
  </div>`;
  }
  return `<div class="detailEmpty">
    <div class="detailEmptyTop">
      <h2>Seu arquivo</h2>
      <p>${stats.entities} fichas · ${stats.relations} conexões · ${stats.folders} pastas</p>
    </div>
    <div class="detailEmptyGrid">
      <button class="quickCard" data-quick="entity"><span class="quickIcon">🧝</span><strong>Nova ficha</strong><span>Personagem, organização, local, item…</span></button>
      <button class="quickCard" data-quick="graph"><span class="quickIcon">🕸️</span><strong>Ver a rede</strong><span>Todas as conexões em um grafo</span></button>
      <button class="quickCard" data-quick="import"><span class="quickIcon">📥</span><strong>Importar / Exportar</strong><span>Backup em JSON do seu arquivo</span></button>
    </div>
    ${recentHtml}
  </div>`;
}

function bindEmpty() {
  const pane = q("#detailBody");
  qa("[data-quick]", pane).forEach((b) => {
    b.onclick = () => {
      const kind = b.dataset.quick;
      if (kind === "entity") window.dispatchEvent(new CustomEvent("codex:new-entity"));
      if (kind === "graph") window.dispatchEvent(new CustomEvent("codex:view", { detail: { view: "graph" } }));
      if (kind === "import") window.dispatchEvent(new CustomEvent("codex:open-data"));
    };
  });
  qa(".recentRow", pane).forEach((b) => {
    b.onclick = () => selectEntity(b.dataset.id);
  });
}

export function selectEntity(id) {
  setUI({ entityId: id, detailMode: null });
  savePrefs();
  window.dispatchEvent(new CustomEvent("codex:select", { detail: { id } }));
  renderDetail();
}

function renderFicha(pane, entity) {
  const t = store.type(entity.type);
  const rels = store.relationsOf(entity.id).map((r) => store.relationView(r, entity.id));
  const grouped = new Map();
  for (const v of rels) {
    if (!grouped.has(v.group)) grouped.set(v.group, []);
    grouped.get(v.group).push(v);
  }
  const fieldRows = [];
  const templateKeys = (t && t.fields) || [];
  for (const key of templateKeys) {
    const val = entity.fields && entity.fields[key];
    fieldRows.push({ key, value: val, label: fieldDef(key).l, long: fieldDef(key).t === "long" });
  }
  for (const [key, val] of Object.entries(entity.fields || {})) {
    if (templateKeys.includes(key) || !val) continue;
    fieldRows.push({ key, value: val, label: fieldDef(key).l, long: String(val).length > 90 });
  }
  const names = store.mentionNames(entity.id);
  const regex = state.mentionHighlight ? buildNameRegex(names) : null;
  const descHtml = entity.description
    ? renderRich(entity.description, { resolveName: (n) => store.resolveName(n, entity.id), mentionRegex: regex, mentionExclude: entity.id, refTitle })
    : "";
  const hasDescImgs = store.descImages(entity).length > 0;
  const descImgs = descGalleryHtml(entity, { editable: true });
  const imgCount = store.images(entity).length;
  const folderCrumbs = entity.folderId ? store.folderPath(entity.folderId).map((f) => `<button class="crumb" data-gofolder="${esc(f.id)}">${esc(f.icon || "📁")} ${esc(f.name)}</button>`).join('<span class="crumbSep">›</span>') : `<span class="crumbStatic">Sem pasta</span>`;

  const bookHits = [];
  for (const c of book.list()) {
    const attached = (c.attachments || []).includes(entity.id);
    const hits = attached ? 0 : countMentions(c.text, names);
    if (attached || hits) bookHits.push({ chapter: c, attached, hits });
  }
  const tlHits = timeline.forEntity(entity.id);
  const appearsCount = bookHits.length + tlHits.length;
  const appearsHtml = appearsCount ? `<section class="detailSection" id="appearsSection">
        <div class="sectionTitleRow"><h3 class="sectionTitle">Aparece em <span class="relCount">${appearsCount}</span></h3></div>
        <div class="appearsList">
          ${bookHits.map(({ chapter, attached, hits }) => `<button class="appearsRow" data-chapter="${esc(chapter.id)}" title="Abrir o capítulo">
            <span class="appearsIcon">📖</span>
            <span class="appearsBody">
              <span class="appearsName">${esc(chapter.title || "Sem título")}</span>
              <span class="appearsMeta">${chapter.moment ? esc(chapter.moment) + " · " : ""}${attached ? "anexada ao capítulo" : hits + (hits === 1 ? " menção no texto" : " menções no texto")}</span>
            </span>
          </button>`).join("")}
          ${tlHits.map((ev) => `<button class="appearsRow" data-event="${esc(ev.id)}" title="Ver na Timeline">
            <span class="appearsIcon">⏳</span>
            <span class="appearsBody">
              <span class="appearsName">${esc(ev.title)}</span>
              <span class="appearsMeta">${ev.date ? esc(ev.date) : "sem data"}</span>
            </span>
          </button>`).join("")}
        </div>
      </section>` : "";

  pane.innerHTML = `
    <div class="detailHero">
      <div class="mediaWrap heroMedia" style="--typeColor:${esc(t.color)}">${mediaHtml(entity, { cls: "heroImg" })}</div>
      <div class="heroMain">
        <div class="heroTypeRow">
          <button class="typeBadge big" style="--typeColor:${esc(t.color)}" id="heroTypeBtn">${esc(t.icon)} ${esc(t.l)}</button>
          ${(entity.aliases || []).map((a) => `<span class="aliasChip">${esc(a)}</span>`).join("")}
        </div>
        <h2 class="heroName" id="heroName">${esc(entity.name)}</h2>
        <p class="heroSummary">${entity.summary ? esc(mdToPlain(entity.summary)) : `<span class="muted">sem resumo</span>`}</p>
        <div class="heroTags">${(entity.tags || []).map((tg) => `<span class="tagMini">#${esc(tg)}</span>`).join("") || ""}</div>
        <div class="heroActions">
          <button class="btn primary" id="editBtn">✏️ Editar</button>
          <button class="btn" id="relBtn">🔗 Relação</button>
          <button class="btn" id="graphJumpBtn">🕸️ Ver na rede</button>
          <button class="iconBtn ${entity.favorite ? "on" : ""}" id="favBtn" title="Favoritar">★</button>
          <button class="iconBtn" id="moreBtn" title="Mais">⋯</button>
        </div>
        ${heroMedalsHtml(entity)}
      </div>
    </div>
    <div class="detailScroll">
      <section class="detailSection"><h3 class="sectionTitle">Descrição</h3>${descHtml ? `<div class="richText">${descHtml}</div>` : (hasDescImgs ? `<p class="mutedNote">Sem texto de descrição — as imagens abaixo estão anexadas a ela.</p>` : `<p class="mutedNote">Sem descrição ainda — escreva no editor ou anexe imagens abaixo.</p>`)}${descImgs}<div data-cap-holder></div></section>
      ${fieldRows.length ? `<section class="detailSection"><h3 class="sectionTitle">Ficha</h3><div class="fieldGrid">${fieldRows.map((f) => `
        <div class="fieldView ${f.long ? "wide" : ""}"><span class="fieldViewLabel">${esc(f.label)}</span><div class="fieldViewValue">${renderRich(String(f.value), { resolveName: (n) => store.resolveName(n, entity.id), mentionRegex: regex, mentionExclude: entity.id, refTitle })}</div></div>`).join("")}</div></section>` : ""}
      <section class="detailSection">
        <div class="sectionTitleRow">
          <h3 class="sectionTitle">Conexões <span class="relCount">${rels.length}</span></h3>
          <button class="btn tiny" id="relBtn2">+ Nova relação</button>
        </div>
        ${rels.length ? [...grouped.entries()].map(([g, items]) => {
          const group = RELATION_GROUPS[g] || RELATION_GROUPS.outros;
          return `<div class="relGroup"><h4 class="relGroupTitle" style="--groupColor:${group.color}">${group.icon} ${group.l}</h4>
            ${items.map((v) => relRowHtml(v, entity)).join("")}</div>`;
        }).join("") : `<p class="mutedNote">Nenhuma conexão ainda. Use <strong>🔗 Relação</strong> para ligar esta ficha a outras.</p>`}
      </section>
      <section class="detailSection" id="miniGraphSection" ${rels.length ? "" : "hidden"}>
        <div class="sectionTitleRow"><h3 class="sectionTitle">Teia local</h3>
          <div class="miniControls"><button class="btn tiny" id="miniFitBtn">Ajustar</button></div></div>
        <div class="miniGraphWrap"><canvas id="miniGraphCanvas"></canvas></div>
      </section>
      ${appearsHtml}
      <section class="detailSection metaSection">
        <div class="metaRow"><span>Pasta</span><div class="crumbs">${folderCrumbs}</div></div>
        <div class="metaRow"><span>Criada</span><div>${esc(formatDate(entity.createdAt))}</div></div>
        <div class="metaRow"><span>Editada</span><div>${esc(formatDate(entity.updatedAt))}</div></div>
      </section>
    </div>`;

  hydrateHero(entity);
  bindFichaActions(entity);
  mountCapPanel(pane, entity);
  if (appearsCount) bindAppears(pane);
  if (rels.length) renderMiniGraph(entity);
}

function countMentions(text, names) {
  const hay = norm(String(text || ""));
  if (!hay) return 0;
  let hits = 0;
  for (const name of names || []) {
    const needle = norm(name);
    if (needle.length < 3) continue;
    let i = hay.indexOf(needle);
    while (i !== -1) { hits++; i = hay.indexOf(needle, i + needle.length); }
  }
  return hits;
}

function bindAppears(pane) {
  for (const btn of qa(".appearsRow[data-chapter]", pane)) {
    btn.onclick = () => window.dispatchEvent(new CustomEvent("codex:open-chapter", { detail: { id: btn.dataset.chapter } }));
  }
  for (const btn of qa(".appearsRow[data-event]", pane)) {
    btn.onclick = () => window.dispatchEvent(new CustomEvent("codex:view", { detail: { view: "timeline" } }));
  }
}

function relRowHtml(v, entity) {
  const other = v.other;
  const t = other ? store.type(other.type) : null;
  return `<div class="relRow" data-rel="${esc(v.rel.id)}">
    <span class="relVerb">${esc(v.label)}</span>
    ${other ? `<button class="relTarget" data-goto="${esc(other.id)}"><span class="relTargetIcon">${esc(t.icon)}</span>${esc(other.name)}</button>` : `<span class="relTarget missing">ficha removida</span>`}
    ${v.rel.notes ? `<span class="relNotes" title="${esc(v.rel.notes)}">💬 ${esc(truncate(v.rel.notes, 60))}</span>` : ""}
    ${v.rel.createdBy === "ai" ? `<span class="aiTag">IA</span>` : ""}
    <span class="relRowActions">
      <button class="iconBtn tiny" data-relkind="${esc(v.rel.id)}" title="Editar tipo de anexo">🔗</button>
      <button class="iconBtn tiny" data-relnote="${esc(v.rel.id)}" title="Anotação">💬</button>
      <button class="iconBtn tiny danger" data-reldel="${esc(v.rel.id)}" title="Remover">✕</button>
    </span>
  </div>`;
}

async function hydrateHero(entity) {
  const wrap = q(".heroMedia", q("#detailBody"));
  if (!wrap) return;
  await hydrateMedia(wrap, entity);
}

function bindFichaActions(entity) {
  const goFolder = (fid) => { setUI({ folderId: fid }); savePrefs(); window.dispatchEvent(new CustomEvent("codex:refresh-browse")); };
  q("#editBtn").onclick = () => { setUI({ detailMode: "edit" }); renderDetail(); };
  q("#relBtn").onclick = () => openRelationEditor(entity.id);
  q("#relBtn2").onclick = () => openRelationEditor(entity.id);
  q("#favBtn").onclick = () => { store.updateEntity(entity.id, { favorite: !entity.favorite }); renderDetail(); };
  q("#graphJumpBtn").onclick = () => window.dispatchEvent(new CustomEvent("codex:view", { detail: { view: "graph", focus: entity.id } }));
  q("#moreBtn").onclick = (e) => popupMenu(e.currentTarget, [
    { icon: "📁", label: "Mover para pasta…", onClick: () => window.dispatchEvent(new CustomEvent("codex:move-entity", { detail: { id: entity.id } })) },
    { icon: "✏️", label: "Renomear", onClick: async () => {
      const name = await promptDialog({ title: "Renomear ficha", label: "Nome", value: entity.name });
      if (name && name.trim()) { store.updateEntity(entity.id, { name: name.trim() });
        await relinkMentions(entity, name.trim());
        renderDetail(); window.dispatchEvent(new CustomEvent("codex:refresh-browse")); }
    } },
    { icon: "🎨", label: "Converter tipo…", onClick: () => convertTypeFlow(entity) },
    { separator: true },
    { icon: "🗑️", label: "Excluir ficha", danger: true, onClick: async () => {
      const ok = await confirmDialog({ title: "Excluir ficha?", message: `"${entity.name}" e suas relações serão removidas.`, confirmLabel: "Excluir", danger: true });
      if (!ok) return;
      store.deleteEntity(entity.id);
      setUI({ entityId: null });
      renderDetail();
      window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
      toast("Ficha excluída");
    } },
  ], { alignRight: true });

  const mediaWrap = q(".heroMedia", q("#detailBody"));
  if (mediaWrap) bindMedia(mediaWrap, entity, { onDone: () => renderDetail() });
  const descWrap = q(".detailScroll", q("#detailBody"));
  if (descWrap) bindDescGallery(descWrap, entity, { onDone: () => renderDetail() });
  qa("[data-goto]", q("#detailBody")).forEach((b) => { b.onclick = () => selectEntity(b.dataset.goto); });
  qa("[data-gofolder]", q("#detailBody")).forEach((b) => { b.onclick = () => goFolder(b.dataset.gofolder); });
  qa("[data-relkind]", q("#detailBody")).forEach((b) => {
    b.onclick = () => {
      const rel = store.relations.get(b.dataset.relkind);
      if (!rel) return;
      openKindPicker({ fromId: rel.from, toId: rel.to, relationId: rel.id });
    };
  });
  qa("[data-relnote]", q("#detailBody")).forEach((b) => {
    b.onclick = async () => {
      const rel = store.relations.get(b.dataset.relnote);
      if (!rel) return;
      const notes = await promptDialog({ title: "Anotação da relação", label: "O que une estas fichas?", value: rel.notes, multiline: true });
      if (notes !== null) { store.updateRelation(rel.id, { notes: notes.trim() }); renderDetail(); }
    };
  });
  qa("[data-reldel]", q("#detailBody")).forEach((b) => {
    b.onclick = () => { store.deleteRelation(b.dataset.reldel); renderDetail(); toast("Relação removida"); };
  });
  const fitBtn = q("#miniFitBtn");
  if (fitBtn && miniGraph) fitBtn.onclick = () => miniGraph.fit();
}

async function relinkMentions(entity, newName) {
  const oldName = entity.name;
  const aliases = new Set(entity.aliases || []);
  if (oldName && oldName.length >= 3 && oldName !== newName) aliases.add(oldName);
  store.updateEntity(entity.id, { aliases: [...aliases] });
}

async function convertTypeFlow(entity) {
  const types = store.types();
  const body = el(`<div class="pickerList">${types.map((t) => `<button class="pickerRow" data-type="${esc(t.id)}">${esc(t.icon)} ${esc(t.l)}</button>`).join("")}</div>`);
  const m = openModal({ title: "Converter tipo da ficha", subtitle: entity.name, size: "sm", body });
  body.onclick = (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    store.updateEntity(entity.id, { type: b.dataset.type });
    m.close();
    renderDetail();
    window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
  };
}

function renderMiniGraph(entity) {
  const canvas = q("#miniGraphCanvas");
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const hop1 = store.relationsOf(entity.id).map((r) => store.relationView(r, entity.id)).filter((v) => v.other);
  const ids = new Set([entity.id]);
  for (const v of hop1) ids.add(v.otherId);
  const hop1Count = ids.size - 1;
  const second = [];
  if (hop1Count < 9) {
    for (const id of [...ids]) {
      if (id === entity.id) continue;
      for (const r of store.relationsOf(id)) {
        const v = store.relationView(r, id);
        if (v.other && !ids.has(v.otherId)) {
          second.push(v.other);
          ids.add(v.otherId);
        }
      }
    }
  }
  const room = Math.max(0, 11 - hop1Count);
  const secondUnique = [...new Set(second.map((e) => e.id))].slice(0, room);
  for (const id of secondUnique) ids.add(id);
  const nodes = [...ids].map((id) => nodeFor(store.getEntity(id), id === entity.id));
  const edges = [];
  for (const r of store.relations.values()) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    const k = store.kind(r.kind);
    const group = RELATION_GROUPS[k.g] || RELATION_GROUPS.outros;
    edges.push({
      id: r.id, source: r.from, target: r.to,
      color: group.color, directed: !k.sym, label: "", width: 1.6, group: k.g,
      genStep: k.step, genSame: k.id === "conjuge" || k.id === "namoro",
    });
  }
  const miniCw = canvas.getBoundingClientRect().width || 0;
  const miniNarrow = miniCw > 0 && miniCw < 420;
  miniGraph = createGraph(canvas, {
    nodeRadius: 16,
    maxRadiusBonus: 6,
    linkLength: 110,
    repulsion: 2600,
    grid: false,
    alwaysLabels: true,
    labelAnchorId: entity.id,
    labelMargin: miniNarrow ? 58 : 46,
    labelWrapWidth: miniNarrow ? 78 : 96,
    labelColor: "#cbd5e1",
    labelBackground: "rgba(8,11,18,0.9)",
    imageLoader: (n) => (n.imageId ? store.getImageSrc(store.getEntity(n.imageId)) : null),
    linkable: !VIEW.active,
  });
  miniGraph.setData({ nodes, edges }, { fit: true });
  miniGraph.setRadial(entity.id);
  miniGraph.fit();
  miniGraph.on("select", ({ id }) => selectEntity(id));
  miniGraph.on("open", ({ id }) => selectEntity(id));
  miniGraph.on("link", ({ from, to }) => { if (!VIEW.active) openKindPicker({ fromId: from, toId: to }); });
  miniGraph.on("nodemenu", ({ id, x, y }) => {
    const r = canvas.getBoundingClientRect();
    const items = [{ icon: "📇", label: "Abrir ficha", onClick: () => openEntity(id) }];
    if (!VIEW.active) items.push({ icon: "🔗", label: "Ligar a outra ficha…", onClick: () => openRelationEditor(id) });
    popupMenu(null, items, { rect: { left: r.left + x, top: r.top + y, bottom: r.top + y, right: r.left + x, width: 0, height: 0 } });
  });
}

function openEntity(id) {
  window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
}

export function nodeFor(entity, isRoot) {
  const t = store.type(entity.type);
  const deg = entity ? store.relationsOf(entity.id).length : 0;
  return {
    id: entity.id,
    label: entity.name,
    sub: t.l,
    icon: t.icon,
    color: t.color,
    imageId: store.images(entity).length ? entity.id : null,
    imgKey: (() => { const im = store.activeImage(entity); return im ? im.id + "." + (im.updatedAt || 0) : ""; })(),
    degree: deg,
    isRoot: !!isRoot,
  };
}

export function renderEditor(pane, entity) {
  const t = store.type(entity.type);
  const types = store.types();
  const templateKeys = (t && t.fields) || [];
  const extraKeys = Object.keys(entity.fields || {}).filter((k) => !templateKeys.includes(k));
  pane.innerHTML = `
    <div class="editor">
      <div class="editorHead">
        <h2>Editando <span class="editorName">${esc(entity.name)}</span></h2>
        <div class="editorHeadBtns">
          <button class="btn" id="editorViewBtn">👁 Ver ficha</button>
          <button class="btn primary" id="editorDoneBtn">✓ Concluído</button>
        </div>
      </div>
      <div class="editorScroll">
        <div class="editorTop">
          <div class="mediaWrap editorMedia" style="--typeColor:${esc(t.color)}">${mediaHtml(entity, { cls: "editorImg", hint: "arraste uma imagem" })}</div>
          <div class="editorTopFields">
            <label class="field"><span class="fieldLabel">Nome</span><input class="input big" data-bind="name" value="${esc(entity.name)}"></label>
            <label class="field"><span class="fieldLabel">Tipo</span><select class="input" id="editorType">${types.map((ty) => `<option value="${esc(ty.id)}" ${ty.id === entity.type ? "selected" : ""}>${esc(ty.icon)} ${esc(ty.l)}</option>`).join("")}</select></label>
            <label class="field"><span class="fieldLabel">Apelidos / outros nomes</span><input class="input" data-bind="aliases" value="${esc((entity.aliases || []).join(", "))}" placeholder="separe por vírgulas"></label>
            <label class="field"><span class="fieldLabel">Pasta</span><select class="input" id="editorFolder"><option value="">— sem pasta —</option>${[...store.folders.values()].map((f) => `<option value="${esc(f.id)}" ${entity.folderId === f.id ? "selected" : ""}>${esc(store.folderPath(f.id).map((x) => x.name).join(" / "))}</option>`).join("")}</select></label>
            <label class="field"><span class="fieldLabel">Etiquetas</span><input class="input" data-bind="tags" value="${esc((entity.tags || []).join(", "))}" placeholder="protagonista, reino-norte…"></label>
          </div>
        </div>
        <label class="field"><span class="fieldLabel">Resumo (uma frase)</span><input class="input" data-bind="summary" value="${esc(entity.summary || "")}" placeholder="Quem é essa ficha em uma linha"></label>
        <div class="field">
          <span class="fieldLabel">Descrição <span class="fieldHintInline">use **negrito**, - listas e [[Nome de outra ficha]] · botão direito numa palavra para anexá-la a uma ficha</span></span>
          <textarea class="input code" rows="9" data-bind="description">${esc(entity.description || "")}</textarea>
        </div>
        ${descEditorHtml(entity)}
        <h3 class="sectionTitle">Campos da ficha</h3>
        <div class="editorFields" id="editorFields">
          ${templateKeys.map((key) => fieldInputHtml(key, entity.fields && entity.fields[key], false)).join("")}
          ${extraKeys.map((key) => fieldInputHtml(key, entity.fields[key], true)).join("")}
        </div>
        <button class="btn tiny" id="addFieldBtn">+ Adicionar campo personalizado</button>
        <div class="saveStatus" id="saveStatus"></div>
      </div>
    </div>`;

  const mediaWrap = q(".editorMedia", pane);
  const rerender = () => { flushSave(); renderEditor(pane, store.getEntity(entity.id)); };
  const flushSave = () => {
    clearTimeout(saveTimer);
    const fresh = store.getEntity(entity.id);
    if (!fresh) return;
    store.updateEntity(entity.id, collectPatch(), { silent: true });
    window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
  };
  const collectPatch = () => {
    const fresh = store.getEntity(entity.id);
    const patch = {};
    for (const input of qa("[data-bind]", pane)) {
      const key = input.dataset.bind;
      if (key === "aliases" || key === "tags") patch[key] = splitList(input.value);
      else patch[key] = input.value;
    }
    const fields = Object.assign({}, fresh.fields);
    for (const input of qa("[data-field]", pane)) fields[input.dataset.field] = input.value;
    patch.fields = fields;
    return patch;
  };
  if (mediaWrap) {
    hydrateMedia(mediaWrap, entity);
    bindMedia(mediaWrap, entity, { onDone: rerender });
  }
  const descBox = q("[data-desc-editor]", pane);
  if (descBox) bindDescEditor(pane, entity);
  for (const ta of qa("textarea[data-bind='description'], textarea[data-field]", pane)) bindInputWordLinks(ta);
  q("#editorViewBtn").onclick = () => { setUI({ detailMode: null }); renderDetail(); };
  q("#editorDoneBtn").onclick = () => { setUI({ detailMode: null }); renderDetail(); window.dispatchEvent(new CustomEvent("codex:refresh-browse")); };
  q("#editorType").onchange = (e) => { store.updateEntity(entity.id, { type: e.target.value }); renderEditor(pane, store.getEntity(entity.id)); };
  q("#editorFolder").onchange = (e) => { store.updateEntity(entity.id, { folderId: e.target.value || null }); window.dispatchEvent(new CustomEvent("codex:refresh-browse")); };
  q("#addFieldBtn").onclick = async () => {
    const label = await promptDialog({ title: "Novo campo", label: "Nome do campo", placeholder: "ex: Altura, Motivação secreta…" });
    if (!label || !label.trim()) return;
    const key = label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key) return;
    const fields = Object.assign({}, store.getEntity(entity.id).fields, { [key]: "" });
    store.updateEntity(entity.id, { fields });
    renderEditor(pane, store.getEntity(entity.id));
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    const status = q("#saveStatus");
    if (status) status.textContent = "salvando…";
    saveTimer = setTimeout(() => {
      flushSave();
      const st = q("#saveStatus");
      if (st) st.textContent = "salvo ✓";
      const nameEl = q(".editorName");
      const fresh = store.getEntity(entity.id);
      if (nameEl && fresh) nameEl.textContent = fresh.name;
    }, 450);
  };
  pane.addEventListener("input", scheduleSave);
  pane.addEventListener("change", scheduleSave);
  pane.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.target.closest("textarea")) { setUI({ detailMode: null }); renderDetail(); }
  });
}

function fieldInputHtml(key, value, custom) {
  const def = fieldDef(key);
  const id = "f_" + key;
  const long = def.t === "long";
  const list = def.options ? `<datalist id="${id}_list">${def.options.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>` : "";
  const input = long
    ? `<textarea class="input" rows="3" data-field="${esc(key)}" placeholder="${esc(def.h || "")}">${esc(value || "")}</textarea>`
    : `<input class="input" data-field="${esc(key)}" list="${def.options ? id + "_list" : ""}" value="${esc(value || "")}" placeholder="${esc(def.h || "")}">`;
  return `<div class="field editorField ${long ? "wide" : ""}">${list}
    <span class="fieldLabel">${esc(def.l)}${custom ? `<button class="fieldRemove" data-removefield="${esc(key)}" title="Remover campo">✕</button>` : ""}</span>
    ${input}</div>`;
}

export function openRelationEditor(entityId, opts) {
  opts = opts || {};
  const entity = store.getEntity(entityId);
  if (!entity) return;
  const groups = {};
  for (const k of store.kinds()) {
    const g = RELATION_GROUPS[k.g] ? k.g : "outros";
    if (!groups[g]) groups[g] = [];
    groups[g].push(k);
  }
  const startDir = opts.dir === "in" ? "in" : "out";
  const body = el(`<div class="relEditor">
    <div class="relDirToggle">
      <button class="segBtn ${startDir === "out" ? "on" : ""}" data-dir="out">Esta ficha <span class="arrow">→</span> outra</button>
      <button class="segBtn ${startDir === "in" ? "on" : ""}" data-dir="in">Outra <span class="arrow">→</span> esta ficha</button>
    </div>
    <div class="field"><span class="fieldLabel">Tipo de relação</span>
      <select class="input" id="relKind">${Object.entries(groups).map(([g, kinds]) => {
        const group = RELATION_GROUPS[g] || RELATION_GROUPS.outros;
        return `<optgroup label="${esc(group.icon + " " + group.l)}">${kinds.map((k) => `<option value="${esc(k.id)}">${esc(k.f)}${k.sym ? " (mútua)" : ""}</option>`).join("")}</optgroup>`;
      }).join("")}</select>
      <button class="btn tiny ghost relKindManage" id="relKindManage">⚙️ Editar tipos de anexo…</button>
    </div>
    <div class="field preview" id="relPreview"></div>
    <div class="field"><span class="fieldLabel">Outra ficha</span>
      <input class="input" id="relSearch" placeholder="digite um nome — as fichas existentes aparecem aqui" autocomplete="off">
      <div class="pickerList" id="relResults"></div>
    </div>
    <div class="field"><span class="fieldLabel">Anotação (opcional)</span><input class="input" id="relNotes" placeholder="o que une essas duas fichas"></div>
  </div>`);
  let dir = startDir;
  let target = opts.targetId ? store.getEntity(opts.targetId) : null;
  const renderResults = () => {
    const term = q("#relSearch").value.trim();
    const results = term ? store.search(term, { excludeId: entityId }).slice(0, 7) : store.allEntities().filter((e) => e.id !== entityId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
    const list = q("#relResults", body);
    const rows = results.map(({ entity: e }) => {
      const t = store.type(e.type);
      return `<button class="pickerRow" data-pick="${esc(e.id)}"><span class="treeIcon">${esc(t.icon)}</span><span class="pickerName">${esc(e.name)}</span><span class="pickerType">${esc(t.l)}</span></button>`;
    });
    if (term && !results.some((r) => (r.entity || r).name.toLowerCase() === term.toLowerCase())) {
      rows.unshift(`<button class="pickerRow create" data-create="1">➕ Criar nova ficha "${esc(term)}"</button>`);
    }
    list.innerHTML = rows.join("") || `<div class="mutedNote">Nenhuma ficha encontrada</div>`;
  };
  const updatePreview = () => {
    const kind = store.kind(q("#relKind", body).value);
    const label = dir === "out" ? kind.f : (kind.i || kind.f);
    const otherName = target ? target.name : "…";
    const a = dir === "out" ? entity.name : otherName;
    const b = dir === "out" ? otherName : entity.name;
    q("#relPreview", body).innerHTML = `<span class="previewLabel">Prévia</span> <strong>${esc(a)}</strong> <em>${esc(label)}</em> <strong>${esc(b)}</strong>`;
  };
  const m = openModal({
    title: "Nova relação",
    subtitle: target ? `${entity.name}  ⇄  ${target.name}` : entity.name,
    size: "md",
    body,
    actions: [
      { label: "⚙️ Tipos de anexo", onClick: () => openKindsManager() },
      { label: "Cancelar", onClick: ({ close }) => close() },
      { label: "Criar relação", kind: "primary", onClick: ({ close }) => {
        if (!target) { toast("Escolha a outra ficha", "error"); return; }
        const kindId = q("#relKind", body).value;
        const notes = q("#relNotes", body).value.trim();
        const from = dir === "out" ? entity.id : target.id;
        const to = dir === "out" ? target.id : entity.id;
        store.createRelation({ from, to, kind: kindId, notes });
        close();
        renderDetail();
        window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
        toast("Relação criada", "success");
      } },
    ],
  });
  body.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-dir]");
    if (seg) {
      dir = seg.dataset.dir;
      for (const b of qa(".segBtn", body)) b.classList.toggle("on", b.dataset.dir === dir);
      updatePreview();
      return;
    }
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      target = store.getEntity(pick.dataset.pick);
      for (const r of qa(".pickerRow", body)) r.classList.toggle("on", r === pick);
      q("#relSearch", body).value = target.name;
      updatePreview();
      renderResults();
      qa("[data-pick]", body).forEach((r) => r.classList.toggle("on", r.dataset.pick === target.id));
      return;
    }
    const create = e.target.closest("[data-create]");
    if (create) {
      const name = q("#relSearch", body).value.trim();
      const newEntity = store.createEntity({ name, type: "personagem", folderId: entity.folderId });
      target = newEntity;
      updatePreview();
      renderResults();
      qa("[data-pick]", body).forEach((r) => r.classList.toggle("on", r.dataset.pick === target.id));
      toast(`Ficha "${name}" criada`, "success");
      window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
    }
  });
  q("#relKind", body).onchange = updatePreview;
  q("#relKindManage", body).onclick = () => openKindsManager();
  q("#relSearch", body).oninput = renderResults;
  renderResults();
  if (target) {
    q("#relSearch", body).value = target.name;
    qa("[data-pick]", body).forEach((r) => r.classList.toggle("on", r.dataset.pick === target.id));
  }
  updatePreview();
  setTimeout(() => q("#relSearch", body).focus(), target ? 0 : 40);
}

export function initDetailPane() {
  q("#detailBody").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-pick]")) e.target.click();
  });
}
