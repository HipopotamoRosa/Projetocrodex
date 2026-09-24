import { store } from "../store.js";
import { RELATION_GROUPS, defaultKind } from "../data.js";
import { q, el, toast, openModal, confirmDialog, promptDialog } from "./dom.js";
import { esc, norm } from "../util.js";

// ---------------------------------------------------------------------------
// Tipos de anexo (relação): escolher no gesto de arrastar da Rede/Árvore e
// gerenciar o catálogo (criar "Amante de…", "Concubina de…", editar, apagar).
// ---------------------------------------------------------------------------

const STEP_OPTIONS = [
  { v: 0, l: "— não é genealogia" },
  { v: 1, l: "↓1 geração (pai→filho)" },
  { v: 2, l: "↓2 gerações (avô→neto)" },
  { v: 3, l: "↓3 gerações" },
  { v: -1, l: "↑1 geração (filho→pai)" },
  { v: -2, l: "↑2 gerações" },
];

function groupLabel(id) {
  const g = RELATION_GROUPS[id] || RELATION_GROUPS.outros;
  return g.icon + " " + g.l;
}

function groupOptionsHtml(selected) {
  return Object.entries(RELATION_GROUPS).map(([id, g]) =>
    `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(groupLabel(id))}</option>`).join("");
}

function stepOptionsHtml(selected) {
  const v = Number(selected) || 0;
  return STEP_OPTIONS.map((o) => `<option value="${o.v}" ${o.v === v ? "selected" : ""}>${esc(o.l)}</option>`).join("");
}

// Outras fichas já ligadas a este par (qualquer direção), para o aviso no seletor.
function pairRelations(aId, bId) {
  const out = [];
  for (const r of store.relations.values()) {
    if ((r.from === aId && r.to === bId) || (r.from === bId && r.to === aId)) out.push(r);
  }
  return out;
}

function sentenceFor(kind, a, b) {
  const label = kind.f || "tem ligação com";
  return `<strong>${esc(a)}</strong> <em>${esc(label)}</em> <strong>${esc(b)}</strong>`;
}

// ---------------------------------------------------------------------------
// Seletor rápido — o que abre quando a linha elástica é solta numa ficha
// ---------------------------------------------------------------------------

export function openKindPicker(opts) {
  opts = opts || {};
  const from = store.getEntity(opts.fromId);
  const to = store.getEntity(opts.toId);
  if (!from || !to) return;
  const editing = opts.relationId ? store.relations.get(opts.relationId) : null;
  let swap = !!opts.swap;
  let hoveredKind = null;

  const body = el(`<div class="kindPicker">
    <div class="kpPreview">
      <button class="btn tiny kpSwapBtn" id="kpSwap" title="Trocar quem aponta para quem (inverte a direção do anexo)">⇄ inverter</button>
      <span class="kpSentence" id="kpSentence"></span>
    </div>
    <input class="input" id="kpSearch" placeholder="buscar tipo de anexo — irmão, membro, amante…" autocomplete="off" spellcheck="false">
    <div class="kpExisting" id="kpExisting"></div>
    <div class="kpList" id="kpList"></div>
  </div>`);

  const listEl = q("#kpList", body);
  const previewEl = q("#kpSentence", body);
  const existingEl = q("#kpExisting", body);
  const searchEl = q("#kpSearch", body);

  function ends() {
    return swap ? [to, from] : [from, to];
  }

  function updatePreview() {
    const [a, b] = ends();
    const k = hoveredKind || (editing ? store.kind(editing.kind) : store.kinds()[0]);
    previewEl.innerHTML = k ? sentenceFor(k, a.name, b.name) : "";
  }

  function updateExisting() {
    const [a, b] = ends();
    const rels = pairRelations(a.id, b.id);
    if (!rels.length) { existingEl.innerHTML = ""; return; }
    const views = rels.slice(0, 3).map((r) => {
      const k = store.kind(r.kind);
      const v = r.from === a.id ? k.f : (k.i || k.f);
      return `${esc(a.name)} ${esc(v)} ${esc(b.name)}`;
    });
    existingEl.innerHTML = `<span class="kpExistingTag">Já ligadas</span> ${views.map((v) => `<span class="kpExistingRel">${v}</span>`).join("")}
      <span class="kpExistingHint">escolher outro tipo cria uma ligação nova</span>`;
  }

  function kindButtonHtml(k) {
    const [a, b] = ends();
    const group = RELATION_GROUPS[k.g] || RELATION_GROUPS.outros;
    const tag = k.sym ? "⇄" : "→";
    const current = editing && editing.kind === k.id;
    return `<button class="kpKind ${current ? "current" : ""}" data-kind="${esc(k.id)}" style="--groupColor:${esc(group.color)}" title="${esc(a.name + " " + k.f + " " + b.name)}">
      <span class="kpKindGlyph">${current ? "✓" : tag}</span>
      <span class="kpKindLabel">${esc(k.f)}</span>
      ${k.step ? `<span class="kpKindStep" title="Parentesco (posiciona gerações na Árvore)">👪</span>` : ""}
    </button>`;
  }

  function renderList() {
    const raw = searchEl.value.trim();
    const term = norm(raw);
    const groups = store.kindGroups();
    const parts = [];
    let matches = 0;
    const exact = raw && store.kinds().some((k) => norm(k.f) === term || k.id === term);
    if (raw && !exact) {
      parts.push(`<button class="kpKind kpCreate" data-create="${esc(raw)}"><span class="kpKindGlyph">＋</span><span class="kpKindLabel">Criar tipo “${esc(raw)}”</span></button>`);
    }
    for (const g of groups) {
      const kinds = g.kinds.filter((k) => !term || norm(k.f + " " + (k.i || "") + " " + k.id + " " + g.info.l).includes(term));
      if (!kinds.length) continue;
      matches += kinds.length;
      parts.push(`<div class="kpGroup"><div class="kpGroupTitle" style="--groupColor:${esc(g.info.color)}">${esc(g.info.icon)} ${esc(g.info.l)}</div>
        <div class="kpGrid">${kinds.map(kindButtonHtml).join("")}</div></div>`);
    }
    if (!matches && !raw) parts.push(`<div class="mutedNote">Nenhum tipo de anexo no catálogo.</div>`);
    if (!matches && raw) parts.push(`<div class="mutedNote">Nenhum tipo com “${esc(raw)}” — crie um com o botão acima.</div>`);
    listEl.innerHTML = parts.join("");
    hoveredKind = null;
    updatePreview();
    updateExisting();
  }

  function create(kindId) {
    const [a, b] = ends();
    const k = store.kind(kindId);
    if (editing) {
      const same = editing.kind === kindId && editing.from === a.id && editing.to === b.id;
      m.close();
      if (!same) {
        store.updateRelation(editing.id, { kind: kindId, from: a.id, to: b.id });
        window.dispatchEvent(new CustomEvent("codex:data-changed"));
        toast(`Anexo atualizado: ${a.name} ${k.f} ${b.name}`, "success", 4200);
      }
      return;
    }
    const existed = !!store.findRelation(a.id, b.id, kindId);
    store.createRelation({ from: a.id, to: b.id, kind: kindId });
    m.close();
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
    toast(existed ? "Essa ligação já existia" : `Ligado: ${a.name} ${k.f} ${b.name}`, existed ? "info" : "success", 4200);
  }

  const actions = [];
  if (editing) {
    actions.push({ label: "✕ Remover ligação", onClick: () => {
      store.deleteRelation(editing.id);
      m.close();
      window.dispatchEvent(new CustomEvent("codex:data-changed"));
      toast("Ligação removida", "info", 3200);
    } });
  }
  actions.push(
    { label: "⚙️ Tipos de anexo", onClick: () => openKindsManager() },
    { label: "Mais opções…", onClick: ({ close }) => {
      const [a, b] = ends();
      close();
      window.dispatchEvent(new CustomEvent("codex:open-relation", { detail: { id: a.id, targetId: b.id, dir: swap ? "in" : "out" } }));
    } },
    { label: "Cancelar", onClick: ({ close }) => close() },
  );

  const m = openModal({
    title: editing ? "🔗 Editar anexo" : "🔗 Ligar fichas",
    subtitle: editing ? "Troque o tipo desta ligação ou escolha outro" : "Escolha o tipo de anexo entre as duas fichas",
    size: "md",
    body,
    actions,
    onClose: () => window.removeEventListener("codex:kinds-changed", onKindsChanged),
  });

  function onKindsChanged() {
    renderList();
  }
  window.addEventListener("codex:kinds-changed", onKindsChanged);

  q("#kpSwap", body).onclick = () => {
    swap = !swap;
    renderList();
  };
  searchEl.oninput = renderList;
  searchEl.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    const first = q(".kpKind:not(.kpCreate)", listEl);
    if (first) first.click();
  };
  listEl.addEventListener("mouseover", (e) => {
    const btn = e.target.closest(".kpKind[data-kind]");
    if (!btn) return;
    hoveredKind = store.kind(btn.dataset.kind);
    updatePreview();
  });
  listEl.addEventListener("focusin", (e) => {
    const btn = e.target.closest(".kpKind[data-kind]");
    if (!btn) return;
    hoveredKind = store.kind(btn.dataset.kind);
    updatePreview();
  });
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest(".kpKind");
    if (!btn) return;
    if (btn.dataset.kind) { create(btn.dataset.kind); return; }
    if (btn.dataset.create != null) {
      const kind = await kindFormModal({ prefill: btn.dataset.create });
      if (kind) create(kind.id);
    }
  });
  renderList();
  setTimeout(() => searchEl.focus(), 50);
}

// ---------------------------------------------------------------------------
// Formulário de um tipo (usado pelo seletor para criar na hora)
// ---------------------------------------------------------------------------

export function kindFormModal(opts) {
  opts = opts || {};
  const prefill = String(opts.prefill || "").trim();
  const body = el(`<div class="kindForm">
    <div class="field"><span class="fieldLabel">Frase de A → B</span>
      <input class="input" id="kfF" placeholder="ex: é amante de" value="${esc(prefill)}"></div>
    <div class="field"><span class="fieldLabel">Frase de B → A</span>
      <input class="input" id="kfI" placeholder="deixe igual para relações mútuas"></div>
    <label class="kfCheck"><input type="checkbox" id="kfSym"> Relação mútua (⇄) — as duas fichas usam a mesma frase</label>
    <div class="kfRow">
      <div class="field"><span class="fieldLabel">Grupo</span>
        <select class="input" id="kfG">${groupOptionsHtml("outros")}</select></div>
      <div class="field"><span class="fieldLabel">Na Árvore</span>
        <select class="input" id="kfStep">${stepOptionsHtml(0)}</select></div>
    </div>
    <p class="fieldHint">O identificador interno é criado a partir da primeira frase e <strong>não muda</strong> depois — reescrever a frase não quebra as ligações já feitas.</p>
  </div>`);
  const fEl = q("#kfF", body);
  const iEl = q("#kfI", body);
  const symEl = q("#kfSym", body);
  symEl.onchange = () => {
    iEl.disabled = symEl.checked;
    if (symEl.checked) iEl.value = "";
  };
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: "Novo tipo de anexo",
      size: "sm",
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancelar", onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: "Criar tipo", kind: "primary", onClick: ({ close }) => {
          const f = fEl.value.trim();
          if (!f) { toast("Escreva a frase de A para B", "error"); fEl.focus(); return; }
          const kind = store.addKind({
            f,
            i: symEl.checked ? f : iEl.value.trim(),
            sym: symEl.checked,
            g: q("#kfG", body).value,
            step: Number(q("#kfStep", body).value),
          });
          done = true;
          resolve(kind);
          close();
          window.dispatchEvent(new CustomEvent("codex:kinds-changed"));
        } },
      ],
    });
    setTimeout(() => { fEl.focus(); fEl.select(); }, 50);
  });
}

// ---------------------------------------------------------------------------
// Gerenciador do catálogo (criar / editar / apagar tipos)
// ---------------------------------------------------------------------------

export function openKindsManager() {
  const body = el(`<div class="kindManager">
    <div class="kmTop">
      <input class="input" id="kmSearch" placeholder="buscar tipo…" autocomplete="off" spellcheck="false">
      <button class="btn tiny primary" id="kmAdd">＋ Novo tipo</button>
    </div>
    <div class="kmList" id="kmList"></div>
  </div>`);
  const listEl = q("#kmList", body);
  const searchEl = q("#kmSearch", body);

  function rowHtml(k) {
    const isDefault = !store.isCustomKind(k.id);
    const canRestore = !isDefault && !!defaultKind(k.id);
    const usage = store.kindUsage(k.id);
    return `<div class="kmRow" data-kind="${esc(k.id)}">
      <div class="kmPhrases">
        <input class="input kmPhrase" data-kfield="f" value="${esc(k.f)}" title="A → B" placeholder="é pai de">
        <input class="input kmInverse" data-kfield="i" value="${esc(k.i || "")}" title="B → A" placeholder="é filho(a) de" ${k.sym ? "disabled" : ""}>
      </div>
      <label class="kmCheck" title="Relação mútua: a mesma frase vale nos dois sentidos"><input type="checkbox" data-kfield="sym" ${k.sym ? "checked" : ""}>⇄</label>
      <select class="miniSelect kmGroupSel" data-kfield="g" title="Grupo (cor na ficha e na Rede)">${groupOptionsHtml(RELATION_GROUPS[k.g] ? k.g : "outros")}</select>
      <select class="miniSelect kmStep" data-kfield="step" title="Genealogia: quantas gerações a outra ficha fica abaixo (a Árvore usa isso)">${stepOptionsHtml(k.step)}</select>
      <span class="kmMeta" title="Identificador interno — não muda">${esc(k.id)}${usage ? `<em>${usage} ligaç${usage === 1 ? "ão" : "ões"}</em>` : ""}</span>
      <span class="kmActions">
        ${isDefault ? `<span class="kmStd" title="Tipo padrão do app">padrão</span>` : ""}
        ${canRestore ? `<button class="iconBtn tiny" data-restore title="Voltar ao padrão do app">↺</button>` : ""}
        ${!isDefault ? `<button class="iconBtn tiny danger" data-del title="Apagar este tipo">✕</button>` : ""}
      </span>
    </div>`;
  }

  function renderList() {
    const term = norm(searchEl.value.trim());
    const groups = store.kindGroups();
    const parts = [];
    for (const g of groups) {
      const kinds = g.kinds.filter((k) => !term || norm(k.f + " " + (k.i || "") + " " + k.id).includes(term));
      if (!kinds.length) continue;
      parts.push(`<div class="kmGroup"><div class="kmGroupTitle" style="--groupColor:${esc(g.info.color)}">${esc(g.info.icon)} ${esc(g.info.l)} <span class="kmGroupCount">${kinds.length}</span></div>
        ${kinds.map(rowHtml).join("")}</div>`);
    }
    if (!parts.length) parts.push(`<div class="mutedNote">Nenhum tipo encontrado.</div>`);
    listEl.innerHTML = parts.join("");
  }

  async function removeFlow(id) {
    const k = store.kind(id);
    const usage = store.kindUsage(id);
    if (!usage) {
      const ok = await confirmDialog({ title: `Apagar “${k.f}”?`, message: "Nenhuma ficha usa este tipo.", confirmLabel: "Apagar", danger: true });
      if (ok) { store.removeKind(id); renderList(); notify(); }
      return;
    }
    const m = openModal({
      title: `Apagar “${k.f}”?`,
      subtitle: `${usage} ligaç${usage === 1 ? "ão usa" : "ões usam"} este tipo.`,
      size: "sm",
      body: el(`<p class="mutedNote">Escolha o que fazer com ${usage === 1 ? "a ligação existente" : "as ligações existentes"}: virar <strong>“tem ligação com”</strong> (mantém as fichas ligadas) ou ser apagada${usage === 1 ? "" : "s"} junto com o tipo.</p>`),
      actions: [
        { label: "Cancelar", onClick: ({ close }) => close() },
        { label: "Converter em “tem ligação com”", kind: "primary", onClick: ({ close }) => { store.removeKind(id, "convert"); renderList(); notify(); close(); } },
        { label: "Apagar as ligações", kind: "danger", onClick: ({ close }) => { store.removeKind(id, "delete"); renderList(); notify(); close(); } },
      ],
    });
    return m;
  }

  function notify() {
    window.dispatchEvent(new CustomEvent("codex:kinds-changed"));
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
  }

  listEl.addEventListener("input", (e) => {
    const row = e.target.closest(".kmRow");
    if (!row) return;
    const field = e.target.dataset.kfield;
    if (!field) return;
    const id = row.dataset.kind;
    if (field === "sym") {
      const on = e.target.checked;
      store.updateKind(id, { sym: on });
      const inv = q(".kmInverse", row);
      if (inv) { inv.disabled = on; if (on) inv.value = store.kind(id).i || ""; }
      return;
    }
    if (field === "g") { store.updateKind(id, { g: e.target.value }); return; }
    if (field === "step") { store.updateKind(id, { step: Number(e.target.value) }); return; }
    if (field === "f" || field === "i") {
      store.updateKind(id, { [field]: e.target.value });
      if (field === "f") {
        const inv = q(".kmInverse", row);
        const k = store.kind(id);
        if (k.sym && inv) inv.value = k.i || "";
      }
    }
  });

  listEl.addEventListener("change", (e) => {
    const row = e.target.closest(".kmRow");
    if (!row) return;
    if (e.target.dataset.kfield === "g") renderList();
  });

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest(".kmRow");
    if (!row) return;
    const id = row.dataset.kind;
    if (e.target.closest("[data-del]")) { removeFlow(id); return; }
    if (e.target.closest("[data-restore]")) {
      store.restoreKind(id);
      renderList();
      notify();
      toast("Tipo restaurado ao padrão", "info");
    }
  });

  q("#kmAdd", body).onclick = async () => {
    const label = await promptDialog({
      title: "Novo tipo de anexo",
      label: "Como fica a frase de A para B?",
      placeholder: "ex: é amante de",
      confirmLabel: "Criar",
    });
    if (!label || !label.trim()) return;
    const kind = store.addKind({ f: label.trim(), g: "outros" });
    searchEl.value = "";
    renderList();
    const row = q(`.kmRow[data-kind="${kind.id}"]`, listEl);
    if (row) {
      row.scrollIntoView({ block: "center" });
      const inv = q(".kmInverse", row);
      if (inv) inv.focus();
    }
    notify();
  };

  searchEl.oninput = renderList;

  openModal({
    title: "⚙️ Tipos de anexo",
    subtitle: "Estes são os tipos de relação que você escolhe ao ligar duas fichas (na ficha, na Rede e na Árvore). Reescreva as frases, mude o grupo, marque genealogia — ou crie os seus: “é amante de”, “é concubina de”, “é escravo(a) de”…",
    size: "lg",
    body,
    actions: [
      { label: "Fechar", kind: "primary", onClick: ({ close }) => close() },
    ],
    onClose: notify,
  });

  renderList();
  setTimeout(() => searchEl.focus(), 60);
}

// ---------------------------------------------------------------------------
// Micro-editor de um tipo já existente (usado no menu da ficha)
// ---------------------------------------------------------------------------

export async function editKindFlow(id) {
  const k = store.kind(id);
  const body = el(`<div class="kindForm">
    <div class="field"><span class="fieldLabel">Frase de A → B</span><input class="input" id="kfF" value="${esc(k.f)}"></div>
    <div class="field"><span class="fieldLabel">Frase de B → A</span><input class="input" id="kfI" value="${esc(k.i || "")}" ${k.sym ? "disabled" : ""}></div>
    <label class="kfCheck"><input type="checkbox" id="kfSym" ${k.sym ? "checked" : ""}> Relação mútua (⇄)</label>
    <div class="kfRow">
      <div class="field"><span class="fieldLabel">Grupo</span><select class="input" id="kfG">${groupOptionsHtml(RELATION_GROUPS[k.g] ? k.g : "outros")}</select></div>
      <div class="field"><span class="fieldLabel">Na Árvore</span><select class="input" id="kfStep">${stepOptionsHtml(k.step)}</select></div>
    </div>
    <p class="fieldHint">Vale para todas as ligações deste tipo (${store.kindUsage(id)} no arquivo).</p>
  </div>`);
  const symEl = q("#kfSym", body);
  const iEl = q("#kfI", body);
  symEl.onchange = () => { iEl.disabled = symEl.checked; if (symEl.checked) iEl.value = q("#kfF", body).value.trim(); };
  const ok = await new Promise((resolve) => {
    let done = false;
    openModal({
      title: "Editar tipo de anexo",
      size: "sm",
      body,
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: "Cancelar", onClick: ({ close }) => { done = true; resolve(false); close(); } },
        { label: "Salvar", kind: "primary", onClick: ({ close }) => {
          store.updateKind(id, {
            f: q("#kfF", body).value,
            i: symEl.checked ? q("#kfF", body).value.trim() : iEl.value,
            sym: symEl.checked,
            g: q("#kfG", body).value,
            step: Number(q("#kfStep", body).value),
          });
          done = true;
          resolve(true);
          close();
        } },
      ],
    });
  });
  if (ok) {
    window.dispatchEvent(new CustomEvent("codex:kinds-changed"));
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
  }
  return ok;
}
