// Aba Competência: onde os gráficos de poder e as tags especiais de cada ficha
// são montados, renomeados e conferidos ao vivo.
//
// À esquerda a lista de fichas; à direita o quadro da ficha escolhida: um
// cartão por gráfico (aro, valor, nome editável, anotação, cor e máximo), as
// tags especiais e o texto que aparece embaixo da grade. Tudo isso também é
// desenhado na Descrição da ficha por src/competencia/panel.js.

import { q, qa, el, toast, popupMenu, openModal, confirmDialog } from "../ui/dom.js";
import { esc, download } from "../util.js";
import { store } from "../store.js";
import { competencia, ATTR_COLORS, ATTR_PRESETS } from "./store.js";
import { ringSvg, fmtValue, capPanelHtml } from "./render.js";
import { VIEW } from "../view.js";

let instance = null;

export function initCompetenciaView() {
  if (instance) return instance;
  const host = q("#competenciaView");
  if (!host) return null;
  instance = createCompetenciaView(host);
  return instance;
}

function emptyBoardHtml() {
  if (VIEW.active) {
    return `<div class="cpEmpty">
    <div class="cpEmptyIcon">⚡</div>
    <h3>Competência</h3>
    <p>Escolha uma ficha à esquerda para ver os gráficos de poder e as tags especiais que o autor publicou neste Codex.</p>
  </div>`;
  }
  const hasEntities = store.entities.size > 0;
  return `<div class="cpEmpty">
    <div class="cpEmptyIcon">⚡</div>
    <h3>${hasEntities ? "Escolha uma ficha" : "Crie uma ficha primeiro"}</h3>
    <p>${hasEntities
      ? "Os gráficos de poder e as tags especiais ficam presos à ficha escolhida à esquerda. Monte os aros aqui e eles aparecem na ficha dela — os aros na <b>Descrição</b> e as tags no <b>cabeçalho</b>."
      : "A Competência vive dentro das fichas: crie uma ficha (atalho <b>n</b>) e volte para cá para desenhar os gráficos de poder dela."}</p>
  </div>`;
}

export function createCompetenciaView(host) {
  let term = "";
  let typeFilter = "";
  let onlyWithData = false;
  let currentId = null;

  const rootEl = el(`<div class="cpPane">
    <aside class="cpSide">
      <header class="cpSideHead">
        <h1 class="cpTitle">Competência</h1>
        <p class="cpSub">Os gráficos de poder e as tags especiais de cada ficha — os aros na Descrição dela e as tags no cabeçalho.</p>
      </header>
      <div class="cpSideBar">
        <input class="input cpSearch" type="search" placeholder="Buscar ficha…" autocomplete="off" spellcheck="false">
        <select class="input cpTypeSel" title="Filtrar por tipo"></select>
        <label class="cpOnlyData" title="Mostrar só as fichas que já têm gráficos, tags ou condecorações"><input type="checkbox" class="cpOnlyInput"><span>⚡ Só com dados</span></label>
      </div>
      <div class="cpList"></div>
      <footer class="cpSideFoot">
        <button class="btn tiny" data-act="attrs">⚙ Atributos</button>
        <button class="btn tiny" data-act="export">⤓ Exportar</button>
      </footer>
    </aside>
    <section class="cpBoard"></section>
  </div>`);
  host.replaceChildren(rootEl);

  const listEl = q(".cpList", rootEl);
  const boardEl = q(".cpBoard", rootEl);
  const searchEl = q(".cpSearch", rootEl);
  const typeSel = q(".cpTypeSel", rootEl);
  const onlyInput = q(".cpOnlyInput", rootEl);

  typeSel.innerHTML = `<option value="">Todos os tipos</option>`
    + store.types().map((t) => `<option value="${esc(t.id)}">${esc(t.icon)} ${esc(t.l)}</option>`).join("");

  // ---------- avisos de mudança (mantém a ficha aberta em sincronia) ----------

  let changeTimer = null;
  function markChanged() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("codex:competencia-changed", { detail: { id: currentId } }));
    }, 500);
  }

  // ---------- lista de fichas ----------

  function visibleEntities() {
    const t = term.toLowerCase();
    return store.allEntities()
      .filter((e) => !typeFilter || e.type === typeFilter)
      .filter((e) => !onlyWithData || competencia.hasData(e.id))
      .filter((e) => !t || (e.name + " " + (e.aliases || []).join(" ") + " " + (e.tags || []).join(" ")).toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function pipsHtml(entityId) {
    const data = competencia.get(entityId);
    return competencia.list().map((a) => {
      const v = data && typeof data.values[a.id] === "number" ? data.values[a.id] : null;
      const pct = v == null ? 0 : Math.max(4, Math.round((v / (a.max || 10)) * 100));
      return `<span class="cpPip" style="--c:${esc(a.color)};--p:${pct}%" title="${esc(a.name + (v == null ? ": sem valor" : ": " + fmtValue(v) + " de " + a.max))}"></span>`;
    }).join("");
  }

  function listMeta(entityId) {
    const sum = competencia.summary(entityId);
    if (!sum.filled && !sum.tags && !sum.medals) return "sem gráficos ainda";
    return `${sum.filled} de ${sum.total} gráficos`
      + (sum.tags ? ` · ${sum.tags} ${sum.tags === 1 ? "tag" : "tags"}` : "")
      + (sum.medals ? ` · ${sum.medals} ${sum.medals === 1 ? "condecoração" : "condecorações"}` : "");
  }

  function renderList() {
    const list = visibleEntities();
    if (!list.length) {
      listEl.innerHTML = `<p class="cpListEmpty">${store.entities.size ? "Nenhuma ficha com esse filtro." : "Seu arquivo está vazio."}</p>`;
      return;
    }
    listEl.innerHTML = list.map((e) => {
      const t = store.type(e.type);
      const meta = listMeta(e.id);
      return `<button class="cpRow ${e.id === currentId ? "on" : ""} ${competencia.hasData(e.id) ? "hasData" : ""}" data-id="${esc(e.id)}">
        <span class="cpRowIcon" style="--typeColor:${esc(t.color)}">${esc(t.icon)}</span>
        <span class="cpRowText">
          <span class="cpRowName">${esc(e.name)}</span>
          <span class="cpRowMeta">${esc(meta)}</span>
        </span>
        <span class="cpPips">${pipsHtml(e.id)}</span>
      </button>`;
    }).join("");
  }

  function refreshRow(entityId) {
    const row = q(`.cpRow[data-id="${entityId}"]`, listEl);
    if (!row) return;
    const e = store.getEntity(entityId);
    if (!e) return;
    q(".cpRowMeta", row).textContent = listMeta(entityId);
    q(".cpPips", row).innerHTML = pipsHtml(entityId);
    row.classList.toggle("hasData", competencia.hasData(entityId));
  }

  // ---------- quadro da ficha ----------

  function attrCardHtml(attr) {
    const value = competencia.valueOf(currentId, attr.id);
    return `<article class="cpCard" data-attr="${esc(attr.id)}">
      <div class="cpCardTop">
        <div class="cpCardRing">${ringSvg({ value, max: attr.max, color: attr.color, size: 104, name: attr.name })}</div>
        <div class="cpCardSide">
          <div class="cpStepRow">
            <button class="cpStepBtn" type="button" data-step="-1" title="Diminuir">−</button>
            <input class="input cpValueInput" type="number" min="0" max="${attr.max}" step="1" value="${value == null ? "" : value}" placeholder="–" title="Valor (de 0 a ${attr.max})">
            <button class="cpStepBtn" type="button" data-step="1" title="Aumentar">＋</button>
          </div>
          <input class="cpRange" type="range" min="0" max="${attr.max}" step="1" value="${value == null ? 0 : Math.round(value)}">
          <div class="cpCardHint">de ${attr.max}${value == null ? ` · <button class="cpLinkBtn" type="button" data-act="clear">deixar em branco</button>` : ""}</div>
        </div>
      </div>
      <input class="input cpNameInput" value="${esc(attr.name)}" placeholder="nome do gráfico" title="Renomeie quando quiser — o novo nome vale para todas as fichas" maxlength="40">
      <textarea class="input cpNoteInput" rows="1" placeholder="texto que aparece abaixo deste gráfico (opcional)" maxlength="240">${esc(competencia.noteOf(currentId, attr.id))}</textarea>
      <div class="cpCardFoot">
        <input type="color" class="cpColorInput" value="${esc(attr.color)}" title="Cor do aro">
        <label class="cpMaxWrap" title="Valor máximo deste gráfico">máx
          <input class="input cpMaxInput" type="number" min="1" max="999" step="1" value="${attr.max}"></label>
        ${attr.icon ? `<span class="cpCardIcon">${esc(attr.icon)}</span>` : ""}
        <span class="cpFootSpacer"></span>
        <button class="iconBtn tiny cpCardMenu" type="button" data-act="card-menu" title="Mais opções">⋯</button>
      </div>
    </article>`;
  }

  // As duas famílias de etiquetas da ficha: Tags especiais (vão para a Descrição) e
  // Condecorações (vão para o cabeçalho). Mesma mecânica, textos e caixa diferentes.
  const ENTRY_KINDS = {
    tags: {
      box: ".cpTagsEditor", empty: "Nenhuma tag especial ainda.", color: "#a78bfa",
      del: "data-tagdel", edit: "data-tagedit",
      newTitle: "Nova tag especial", editTitle: "Editar tag especial",
      subtitle: "Uma capacidade, um poder, uma marca — o que fizer esse personagem único.",
      placeholder: "ex: Lâmina do Crepúsculo, Controle de Fogo…",
      iconPlaceholder: "⚔️", poolLabel: "Já usadas no arquivo",
      label: "Nome da tag", noteLabel: "Texto abaixo da tag (opcional)", create: "Criar tag",
    },
    medals: {
      box: ".cpMedalsEditor", empty: "Nenhuma condecoração ainda.", color: "#facc15",
      del: "data-medaldel", edit: "data-medaledit",
      newTitle: "Nova condecoração", editTitle: "Editar condecoração",
      subtitle: "Uma honraria, um título, uma medalha — o que o mundo reconheceu neste personagem.",
      placeholder: "ex: Herói de Beacon, Guardiã rank B, Cidadão Honorário…",
      iconPlaceholder: "🎖️", poolLabel: "Já usadas neste Codex",
      label: "Nome da condecoração", noteLabel: "Texto abaixo da condecoração (opcional)", create: "Criar condecoração",
    },
  };

  function entryEditorHtml(kind) {
    const spec = ENTRY_KINDS[kind];
    const list = competencia.listOf(currentId, kind);
    if (!list.length) return `<p class="mutedNote">${spec.empty}</p>`;
    return list.map((t) => `<span class="capTag cpTagEditable" style="--tagColor:${esc(t.color || spec.color)}" title="${esc((t.note ? t.label + " — " + t.note : t.label) + " (clique para editar)")}">
      ${t.icon ? `<span class="capTagIcon">${esc(t.icon)}</span>` : ""}<span class="capTagLabel" ${spec.edit}="${esc(t.id)}">${esc(t.label)}</span>
      <button class="capTagDel" type="button" ${spec.del}="${esc(t.id)}" title="Remover">✕</button>
    </span>`).join("");
  }

  function refreshEntryEditor(kind) {
    const box = q(ENTRY_KINDS[kind].box, boardEl);
    if (box) box.innerHTML = entryEditorHtml(kind);
  }

  function renderBoard() {
    const entity = currentId ? store.getEntity(currentId) : null;
    if (!entity) {
      boardEl.innerHTML = emptyBoardHtml();
      return;
    }
    const t = store.type(entity.type);
    const attrs = competencia.list();
    // Somente leitura: o quadro vira a mesma peça que aparece na Descrição da
    // ficha — aros, tags e o texto de baixo, sem nenhum controle.
    if (VIEW.active) {
      const panel = capPanelHtml(entity, { force: true, size: 96 });
      boardEl.innerHTML = `
        <header class="cpBoardHead">
          <div class="cpBoardTitle">
            <button class="cpBoardIcon" type="button" style="--typeColor:${esc(t.color)}" data-act="open-sheet" title="Abrir a ficha">${esc(t.icon)}</button>
            <div class="cpBoardTitleText">
              <h2 class="cpBoardName">${esc(entity.name)}</h2>
              <p class="cpBoardMeta">${esc(t.l)}${attrs.length ? " · " + attrs.length + (attrs.length === 1 ? " gráfico no catálogo" : " gráficos no catálogo") : ""}</p>
            </div>
          </div>
          <div class="cpBoardActions">
            <button class="btn tiny" data-act="open-sheet">👁 Ver ficha</button>
          </div>
        </header>
        ${panel || `<div class="cpEmpty">
          <div class="cpEmptyIcon">⚡</div>
          <h3>Sem gráficos nesta ficha</h3>
          <p>O autor não publicou gráficos de competência, tags especiais nem condecorações para <b>${esc(entity.name)}</b>.</p>
        </div>`}`;
      return;
    }
    const show = competencia.showsOnSheet(entity.id);
    boardEl.innerHTML = `
      <header class="cpBoardHead">
        <div class="cpBoardTitle">
          <button class="cpBoardIcon" type="button" style="--typeColor:${esc(t.color)}" data-act="open-sheet" title="Abrir a ficha">${esc(t.icon)}</button>
          <div class="cpBoardTitleText">
            <h2 class="cpBoardName">${esc(entity.name)}</h2>
            <p class="cpBoardMeta">${esc(t.l)} · ${attrs.length} ${attrs.length === 1 ? "gráfico" : "gráficos"} no catálogo</p>
          </div>
        </div>
        <div class="cpBoardActions">
          <label class="cpShowToggle" title="Mostrar a Competência na ficha: os aros e as tags na Descrição, as condecorações no cabeçalho"><input type="checkbox" class="cpShowInput" ${show ? "checked" : ""}><span>Na ficha</span></label>
          <button class="btn tiny" data-act="open-sheet">👁 Ver ficha</button>
          <button class="btn tiny" data-act="attrs">⚙ Atributos</button>
          <button class="btn primary tiny" data-act="new-attr">＋ Novo gráfico</button>
        </div>
      </header>
      <div class="cpGridEditor">
        ${attrs.map(attrCardHtml).join("")}
        <button class="cpAddCard" type="button" data-act="new-attr"><span class="cpAddIcon">＋</span><span>Novo gráfico</span></button>
      </div>
      <section class="cpBlock">
        <div class="cpBlockHead">
          <h3 class="cpBlockTitle">Tags especiais</h3>
          <button class="btn tiny" data-act="new-tag">＋ Nova tag</button>
        </div>
        <div class="cpTagsEditor">${entryEditorHtml("tags")}</div>
      </section>
      <section class="cpBlock">
        <div class="cpBlockHead">
          <h3 class="cpBlockTitle">Condecorações</h3>
          <button class="btn tiny" data-act="new-medal">＋ Nova condecoração</button>
        </div>
        <p class="cpBlockHint">As condecorações aparecem no <b>cabeçalho da ficha</b>, abaixo dos botões — as tags especiais ficam na Descrição.</p>
        <div class="cpMedalsEditor">${entryEditorHtml("medals")}</div>
      </section>
      <section class="cpBlock">
        <div class="cpBlockHead"><h3 class="cpBlockTitle">Texto abaixo dos gráficos</h3></div>
        <textarea class="input cpCaptionInput" rows="3" placeholder="Uma linha sobre o conjunto — aparece embaixo dos gráficos, na ficha." maxlength="600">${esc(competencia.captionOf(entity.id))}</textarea>
      </section>`;
  }

  // Atualiza só o cartão de um atributo (para não perder o foco de quem digita).
  function refreshCard(attrId) {
    const card = q(`.cpCard[data-attr="${attrId}"]`, boardEl);
    if (!card) return;
    const attr = competencia.getAttr(attrId);
    if (!attr) return;
    const value = competencia.valueOf(currentId, attrId);
    q(".cpCardRing", card).innerHTML = ringSvg({ value, max: attr.max, color: attr.color, size: 104, name: attr.name });
    const range = q(".cpRange", card);
    if (range) { range.max = attr.max; range.value = value == null ? 0 : Math.min(attr.max, Math.round(value)); }
    const vin = q(".cpValueInput", card);
    if (vin && document.activeElement !== vin) { vin.value = value == null ? "" : value; vin.max = attr.max; }
    const hint = q(".cpCardHint", card);
    if (hint) hint.innerHTML = `de ${attr.max}${value == null ? ` · <button class="cpLinkBtn" type="button" data-act="clear">deixar em branco</button>` : ""}`;
    const min = q(".cpMaxInput", card);
    if (min && document.activeElement !== min) min.value = attr.max;
    const arc = q(".capArc", card);
    if (arc) arc.setAttribute("stroke", attr.color);
  }

  function select(id, opts) {
    currentId = id && store.getEntity(id) ? id : null;
    renderList();
    renderBoard();
    if (!opts || !opts.silent) {
      const row = currentId ? q(`.cpRow[data-id="${currentId}"]`, listEl) : null;
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    }
  }

  function openSheet() {
    if (!currentId) return;
    if (!competencia.hasData(currentId)) toast("Esta ficha ainda não tem nada preenchido — dê um valor a pelo menos um aro para o painel aparecer na Descrição.", "info", 4800);
    else if (!competencia.showsOnSheet(currentId)) toast("A Competência desta ficha está oculta na ficha (cabeçalho e Descrição) — ligue “Na ficha” para vê-la lá.", "info", 4600);
    if (window.codex && window.codex.setView) window.codex.setView("browse");
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: currentId } }));
  }

  function nextColor() {
    const used = competencia.list().map((a) => a.color);
    const free = ATTR_COLORS.find((c) => !used.includes(c));
    return free || ATTR_COLORS[competencia.list().length % ATTR_COLORS.length];
  }

  function addAttrFlow() {
    const attr = competencia.addAttr({ name: "NOVO GRÁFICO", color: nextColor() });
    renderBoard();
    refreshRow(currentId);
    const card = q(`.cpCard[data-attr="${attr.id}"]`, boardEl);
    const input = card && q(".cpNameInput", card);
    if (input) { input.focus(); input.select(); }
    toast("Gráfico criado — dê um nome a ele", "info", 2600);
  }

  // ---------- interações do quadro ----------

  boardEl.addEventListener("click", (e) => {
    const tagDel = e.target.closest("[data-tagdel]");
    if (tagDel) {
      competencia.removeTag(currentId, tagDel.dataset.tagdel);
      refreshEntryEditor("tags");
      refreshRow(currentId);
      markChanged();
      return;
    }
    const tagEdit = e.target.closest("[data-tagedit]");
    if (tagEdit) { openTagEditor("tags", tagEdit.dataset.tagedit); return; }
    const medalDel = e.target.closest("[data-medaldel]");
    if (medalDel) {
      competencia.removeMedal(currentId, medalDel.dataset.medaldel);
      refreshEntryEditor("medals");
      refreshRow(currentId);
      markChanged();
      return;
    }
    const medalEdit = e.target.closest("[data-medaledit]");
    if (medalEdit) { openTagEditor("medals", medalEdit.dataset.medaledit); return; }
    const step = e.target.closest("[data-step]");
    if (step) {
      const card = step.closest(".cpCard");
      const attr = competencia.getAttr(card.dataset.attr);
      if (!attr) return;
      const cur = competencia.valueOf(currentId, attr.id);
      const next = Math.min(attr.max, Math.max(0, (cur == null ? 0 : cur) + Number(step.dataset.step)));
      competencia.setValue(currentId, attr.id, next);
      refreshCard(attr.id);
      if (currentId) refreshRow(currentId);
      markChanged();
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn || !boardEl.contains(btn)) return;
    const act = btn.dataset.act;
    if (act === "new-attr") addAttrFlow();
    else if (act === "attrs") openAttrManager();
    else if (act === "open-sheet") openSheet();
    else if (act === "new-tag") openTagEditor("tags", null);
    else if (act === "new-medal") openTagEditor("medals", null);
    else if (act === "clear") {
      const card = btn.closest(".cpCard");
      competencia.clearValue(currentId, card.dataset.attr);
      refreshCard(card.dataset.attr);
      refreshRow(currentId);
      markChanged();
    } else if (act === "card-menu") {
      const card = btn.closest(".cpCard");
      const attr = competencia.getAttr(card.dataset.attr);
      if (!attr) return;
      const i = competencia.attrIndex(attr.id);
      popupMenu(btn, [
        { icon: "↑", label: "Mover para trás", onClick: () => { competencia.moveAttr(attr.id, -1); renderBoard(); } },
        { icon: "↓", label: "Mover para frente", onClick: () => { competencia.moveAttr(attr.id, 1); renderBoard(); } },
        { icon: "⧉", label: "Duplicar gráfico", onClick: () => {
          const copy = competencia.addAttr({ name: attr.name + " (2)", color: attr.color, max: attr.max, icon: attr.icon, hint: attr.hint });
          competencia.moveAttr(copy.id, i + 1 - competencia.attrIndex(copy.id));
          renderBoard();
        } },
        { separator: true },
        { icon: "📋", label: "Preencher em todas as fichas", hint: "copia o valor atual", onClick: () => {
          const v = competencia.valueOf(currentId, attr.id);
          if (v == null) { toast("Esta ficha ainda não tem valor nesse gráfico", "error"); return; }
          let n = 0;
          for (const ent of store.allEntities()) {
            if (ent.id === currentId) continue;
            if (competencia.valueOf(ent.id, attr.id) == null) { competencia.setValue(ent.id, attr.id, v); n += 1; }
          }
          toast(n ? `Valor aplicado em ${n} ${n === 1 ? "ficha" : "fichas"} sem valor` : "Todas as fichas já tinham valor aqui", "success", 3200);
          renderList();
        } },
        { separator: true },
        { icon: "🗑️", label: "Apagar gráfico do catálogo", danger: true, onClick: async () => {
          const ok = await confirmDialog({
            title: "Apagar “" + attr.name + "”?",
            message: "O gráfico sai de todas as fichas, junto com os valores e as anotações já preenchidos. Não tem como desfazer.",
            confirmLabel: "Apagar",
            danger: true,
          });
          if (!ok) return;
          competencia.removeAttr(attr.id);
          renderBoard();
          renderList();
          markChanged();
        } },
      ], { alignRight: true });
    }
  });

  boardEl.addEventListener("input", (e) => {
    const card = e.target.closest(".cpCard");
    const target = e.target;
    if (target.classList.contains("cpRange")) {
      competencia.setValue(currentId, card.dataset.attr, target.value);
      refreshCard(card.dataset.attr);
      refreshRow(currentId);
      markChanged();
      return;
    }
    if (target.classList.contains("cpValueInput")) {
      const raw = target.value.trim();
      if (!raw) competencia.clearValue(currentId, card.dataset.attr);
      else competencia.setValue(currentId, card.dataset.attr, raw);
      refreshCard(card.dataset.attr);
      refreshRow(currentId);
      markChanged();
      return;
    }
    if (target.classList.contains("cpNameInput")) {
      competencia.updateAttr(card.dataset.attr, { name: target.value }, { quiet: true });
      markChanged();
      return;
    }
    if (target.classList.contains("cpNoteInput")) {
      competencia.setNote(currentId, card.dataset.attr, target.value);
      markChanged();
      return;
    }
    if (target.classList.contains("cpColorInput")) {
      competencia.updateAttr(card.dataset.attr, { color: target.value }, { quiet: true });
      const arc = q(".capArc", card);
      if (arc) arc.setAttribute("stroke", target.value);
      markChanged();
      return;
    }
    if (target.classList.contains("cpMaxInput")) {
      const max = Number(target.value);
      if (isFinite(max) && max >= 1) {
        competencia.updateAttr(card.dataset.attr, { max }, { quiet: true });
        const attr = competencia.getAttr(card.dataset.attr);
        const cur = competencia.valueOf(currentId, attr.id);
        if (cur != null && cur > attr.max) competencia.setValue(currentId, attr.id, attr.max);
        refreshCard(attr.id);
      }
      return;
    }
    if (target.classList.contains("cpCaptionInput")) {
      competencia.setCaption(currentId, target.value);
      markChanged();
    }
  });

  boardEl.addEventListener("change", (e) => {
    const target = e.target;
    if (target.classList.contains("cpShowInput")) {
      competencia.setShow(currentId, target.checked);
      markChanged();
      return;
    }
    if (target.classList.contains("cpValueInput")) {
      const card = target.closest(".cpCard");
      const value = competencia.valueOf(currentId, card.dataset.attr);
      target.value = value == null ? "" : value;
    }
  });

  // ---------- gerenciador de atributos ----------

  function openAttrManager() {
    const body = el(`<div class="cpAttrModal">
      <div class="cpAttrRows"></div>
      <div class="cpAttrFoot">
        <button class="btn tiny" data-act="add">＋ Novo gráfico</button>
        <span class="cpPresetLabel">Grade pronta:</span>
        ${ATTR_PRESETS.map((p) => `<button class="btn tiny" data-preset="${esc(p.id)}">${esc(p.icon)} ${esc(p.l)}</button>`).join("")}
      </div>
    </div>`);
    const rowsEl = q(".cpAttrRows", body);

    function rowHtml(attr) {
      return `<div class="cpAttrRow" data-attr="${esc(attr.id)}">
        <input class="input cpAttrIcon" value="${esc(attr.icon || "")}" maxlength="2" placeholder="–" title="Ícone (opcional)">
        <input class="input cpAttrName" value="${esc(attr.name)}" placeholder="nome do gráfico" title="Nome do gráfico">
        <input type="color" class="cpAttrColor" value="${esc(attr.color)}" title="Cor">
        <label class="cpAttrMaxWrap" title="Valor máximo">máx
          <input class="input cpAttrMax" type="number" min="1" max="999" step="1" value="${attr.max}"></label>
        <button class="iconBtn tiny" data-move="-1" title="Mover para cima">↑</button>
        <button class="iconBtn tiny" data-move="1" title="Mover para baixo">↓</button>
        <button class="iconBtn tiny cpAttrDel" data-del title="Apagar">✕</button>
      </div>`;
    }

    function renderRows() {
      rowsEl.innerHTML = competencia.list().map(rowHtml).join("");
    }

    rowsEl.addEventListener("input", (e) => {
      const row = e.target.closest(".cpAttrRow");
      if (!row) return;
      const id = row.dataset.attr;
      if (e.target.classList.contains("cpAttrName")) competencia.updateAttr(id, { name: e.target.value }, { quiet: true });
      else if (e.target.classList.contains("cpAttrColor")) competencia.updateAttr(id, { color: e.target.value }, { quiet: true });
      else if (e.target.classList.contains("cpAttrMax")) {
        const max = Number(e.target.value);
        if (isFinite(max) && max >= 1) competencia.updateAttr(id, { max }, { quiet: true });
      } else if (e.target.classList.contains("cpAttrIcon")) competencia.updateAttr(id, { icon: e.target.value.trim() }, { quiet: true });
      syncBoard();
    });

    rowsEl.addEventListener("click", async (e) => {
      const row = e.target.closest(".cpAttrRow");
      if (!row) return;
      const id = row.dataset.attr;
      const move = e.target.closest("[data-move]");
      if (move) {
        competencia.moveAttr(id, Number(move.dataset.move));
        renderRows();
        syncBoard();
        return;
      }
      if (e.target.closest("[data-del]")) {
        const attr = competencia.getAttr(id);
        if (!attr) return;
        const ok = await confirmDialog({
          title: "Apagar “" + attr.name + "”?",
          message: "O gráfico sai de todas as fichas, junto com os valores e anotações já preenchidos.",
          confirmLabel: "Apagar",
          danger: true,
        });
        if (!ok) return;
        competencia.removeAttr(id);
        renderRows();
        syncBoard();
      }
    });

    q("[data-act='add']", body).onclick = () => {
      competencia.addAttr({ name: "NOVO GRÁFICO", color: nextColor() });
      renderRows();
      syncBoard();
      const inputs = qa(".cpAttrName", rowsEl);
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    };

    for (const preset of ATTR_PRESETS) {
      q(`[data-preset="${preset.id}"]`, body).onclick = () => {
        const added = competencia.applyPreset(preset.id);
        renderRows();
        syncBoard();
        toast(added.length ? `${added.length} gráficos adicionados` : "Esses gráficos já existem no catálogo", added.length ? "success" : "info", 3000);
      };
    }

    renderRows();
    openModal({
      title: "⚙ Gráficos do catálogo",
      subtitle: "O nome escrito aqui aparece embaixo do gráfico, em todas as fichas — renomeie quando quiser: os valores já preenchidos continuam onde estão.",
      size: "lg",
      body,
      actions: [
        { label: "Ver na ficha", onClick: () => openSheet() },
        { label: "Fechar", kind: "primary", onClick: ({ close }) => close() },
      ],
      onClose: () => { renderBoard(); renderList(); },
    });
  }

  function syncBoard() {
    renderBoard();
    renderList();
    markChanged();
  }

  // ---------- editor de tag / condecoração ----------

  function openTagEditor(kind, entryId) {
    const spec = ENTRY_KINDS[kind] || ENTRY_KINDS.tags;
    const editing = entryId ? competencia.listOf(currentId, kind).find((t) => t.id === entryId) : null;
    const pool = competencia.poolOf(kind);
    const body = el(`<div class="cpTagModal">
      <div class="cpTagGrid">
        <div class="field">
          <label class="fieldLabel">${spec.label}</label>
          <input class="input cpTagLabel" maxlength="40" placeholder="${esc(spec.placeholder)}" value="${esc(editing ? editing.label : "")}">
        </div>
        <div class="field cpTagSmall">
          <label class="fieldLabel">Ícone</label>
          <input class="input cpTagIcon" maxlength="2" placeholder="${esc(spec.iconPlaceholder)}" value="${esc(editing ? editing.icon : "")}">
        </div>
        <div class="field cpTagSmall">
          <label class="fieldLabel">Cor</label>
          <input type="color" class="input cpTagColor" value="${esc(editing ? editing.color : spec.color)}">
        </div>
      </div>
      <div class="field">
        <label class="fieldLabel">${spec.noteLabel}</label>
        <textarea class="input cpTagNote" rows="2" placeholder="Como isso funciona? Ex: só desperta sob a lua cheia.">${esc(editing ? editing.note : "")}</textarea>
      </div>
      ${pool.length ? `<div class="field">
        <label class="fieldLabel">${spec.poolLabel}</label>
        <div class="cpTagPool">${pool.slice(0, 14).map((t) => `<button class="capTag cpTagPick" type="button" data-pick="${esc(t.label)}" style="--tagColor:${esc(t.color)}">${t.icon ? esc(t.icon) + " " : ""}${esc(t.label)}</button>`).join("")}</div>
      </div>` : ""}
    </div>`);
    const labelEl = q(".cpTagLabel", body);
    const iconEl = q(".cpTagIcon", body);
    const colorEl = q(".cpTagColor", body);
    const noteEl = q(".cpTagNote", body);
    qa("[data-pick]", body).forEach((b) => {
      b.onclick = () => {
        const found = pool.find((t) => t.label === b.dataset.pick);
        labelEl.value = b.dataset.pick;
        if (found) { iconEl.value = found.icon || ""; colorEl.value = found.color || spec.color; }
      };
    });
    const modal = openModal({
      title: editing ? spec.editTitle : spec.newTitle,
      subtitle: spec.subtitle,
      size: "md",
      body,
      actions: [
        { label: "Cancelar", onClick: ({ close }) => close() },
        { label: editing ? "Salvar" : spec.create, kind: "primary", onClick: ({ close }) => {
          const label = labelEl.value.trim();
          if (!label) { toast("Dê um nome primeiro", "error"); labelEl.focus(); return; }
          const patch = { label, icon: iconEl.value.trim(), color: colorEl.value, note: noteEl.value.trim() };
          if (editing) competencia.updateEntry(currentId, kind, editing.id, patch);
          else competencia.addEntry(currentId, kind, patch);
          close();
          refreshEntryEditor(kind);
          refreshRow(currentId);
          markChanged();
          toast(editing ? "Atualizado" : "Adicionado", "success");
        } },
      ],
    });
    setTimeout(() => labelEl.focus(), 60);
    return modal;
  }

  // ---------- exportar ----------

  function exportMenu(anchor) {
    popupMenu(anchor, [
      { icon: "🗄️", label: "Backup da competência (.json)", onClick: () => {
        download("competencia-codex.json", JSON.stringify(competencia.exportAll(), null, 2), "application/json");
        toast("Backup baixado", "success");
      } },
      { icon: "📄", label: "Ficha de poder em texto (.txt)", onClick: () => {
        const ids = competencia.entityIds();
        if (!ids.length) { toast("Nada para exportar", "error"); return; }
        const attrs = competencia.list();
        let out = "COMPETÊNCIA\n\n";
        for (const id of ids) {
          const e = store.getEntity(id);
          if (!e) continue;
          out += "== " + e.name + " ==\n";
          const data = competencia.get(id);
          for (const a of attrs) {
            const v = data.values[a.id];
            if (typeof v !== "number") continue;
            out += "  " + a.name + ": " + fmtValue(v) + " / " + a.max + "\n";
          }
          for (const t of data.tags) out += "  ★ " + t.label + (t.note ? " — " + t.note : "") + "\n";
          for (const t of data.medals || []) out += "  🎖 " + t.label + (t.note ? " — " + t.note : "") + "\n";
          if (data.caption.trim()) out += "  " + data.caption.replace(/\n/g, "\n  ") + "\n";
          out += "\n";
        }
        download("competencia.txt", out, "text/plain");
        toast("Competência exportada", "success");
      } },
      { icon: "📋", label: "Resumo do catálogo (texto)", onClick: () => {
        const text = competencia.list().map((a) => `${a.icon ? a.icon + " " : ""}${a.name} (0–${a.max})`).join("\n");
        download("graficos.txt", text + "\n", "text/plain");
      } },
    ], { alignRight: true });
  }

  // ---------- filtros e inicialização ----------

  searchEl.addEventListener("input", () => { term = searchEl.value.trim().toLowerCase(); renderList(); });
  typeSel.addEventListener("change", () => { typeFilter = typeSel.value; renderList(); });
  onlyInput.addEventListener("change", () => { onlyWithData = onlyInput.checked; renderList(); });

  rootEl.addEventListener("click", (e) => {
    const row = e.target.closest(".cpRow");
    if (row) { select(row.dataset.id); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn || !rootEl.contains(btn) || boardEl.contains(btn)) return;
    if (btn.dataset.act === "attrs") openAttrManager();
    else if (btn.dataset.act === "export") exportMenu(btn);
  });

  store.events.on("change", () => { clearTimeout(renderList._t); renderList._t = setTimeout(() => renderList(), 400); });
  store.events.on("entity", (ev) => {
    if (ev && ev.action === "delete" && ev.entity && ev.entity.id === currentId) select(null, { silent: true });
  });
  competencia.events.on("change", (ev) => {
    const action = ev && ev.action || "";
    if (action.startsWith("attr-")) { renderBoard(); }
    if (action === "wipe") { renderBoard(); renderList(); }
  });

  renderList();
  const first = visibleEntities()[0];
  if (first) currentId = first.id;
  renderBoard();

  return {
    show() {
      host.hidden = false;
      renderList();
      renderBoard();
    },
    hide() { host.hidden = true; },
    refresh() {
      renderList();
      renderBoard();
    },
    select(id) {
      if (!store.getEntity(id)) return;
      select(id);
    },
    get currentId() { return currentId; },
  };
}
