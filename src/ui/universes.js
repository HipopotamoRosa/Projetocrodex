// Biblioteca de Codexs: a tela de entrada do Codex.
//
// Cada pessoa que abre o gerador cria o seu próprio Codex; cada Codex é
// um mundo separado (fichas, relações, capítulos, timeline, competência e
// imagens) guardado no armazenamento local do navegador. Aqui dá para criar,
// abrir, renomear, duplicar, exportar, importar e apagar Codexs.

import { universes, DEFAULT_EMOJI } from "../universe.js";
import { store } from "../store.js";
import { q, el, toast, openModal, confirmDialog, popupMenu } from "./dom.js";
import { esc, download, formatDate } from "../util.js";
import { book } from "../book/store.js";
import { timeline } from "../timeline/store.js";
import { competencia } from "../competencia/store.js";

const EMOJIS = ["🌍", "✨", "🐉", "🛡️", "🌌", "📚", "🔥", "🗺️", "⚔️", "🌙", "🕯️", "💠", "🌊", "🏛️", "🧭", "🩸"];

let overlay = null;

function slug(text) {
  return (
    String(text || "codex")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "codex"
  );
}

// ---------------------------------------------------------------- navegação

// Descarrega os dados pendentes, troca o universo ativo e recarrega a página.
// Recarregar é de propósito: garante que nada do universo anterior sobre no ar.
export async function openUniverse(id, opts) {
  opts = opts || {};
  if (id === universes.activeId && !opts.force) {
    closeLibrary();
    if (opts.view) window.dispatchEvent(new CustomEvent("codex:view", { detail: { view: opts.view } }));
    return;
  }
  try {
    await Promise.allSettled([store.flush(), book.flush(), timeline.flush(), competencia.flush()]);
  } catch (err) { /* segue: os dados já estão gravados */ }
  const ok = await universes.switchTo(id);
  if (!ok) return toast("Codex não encontrado", "error");
  if (opts.view) {
    try { sessionStorage.setItem("codex:pending-view", opts.view); } catch (err) { /* ignora */ }
  }
  location.reload();
}

export function consumePendingView() {
  let view = null;
  try {
    view = sessionStorage.getItem("codex:pending-view");
    if (view) sessionStorage.removeItem("codex:pending-view");
  } catch (err) { /* ignora */ }
  return view;
}

// ------------------------------------------------------------------ overlay

export function closeLibrary() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
}

export async function openUniverseLibrary(opts) {
  opts = opts || {};
  closeLibrary();
  overlay = el(`<div class="libOverlay">
    <div class="libScroll">
      <header class="libTop">
        <div class="libTopText">
          <p class="libEyebrow">Biblioteca</p>
          <h1 class="libTitle">Seus Codexs</h1>
          <p class="libSub">Cada Codex guarda personagens, locais, regras, capítulos e relações — tudo separado dos outros mundos.</p>
        </div>
        <div class="libTopActions">
          <span class="libCount" id="libCount"></span>
          <button class="btn" id="libExportZip" title="Baixar um ZIP com todos os Codexs (backup total)">📦 ZIP total</button>
          <button class="btn" id="libImport" title="Importar um Codex (.json), um backup total (.zip), código do site (.zip) ou index.html">⬆️ Importar</button>
          <button class="btn primary" id="libNew">＋ Novo Codex</button>
          <button class="iconBtn" id="libClose" title="Fechar (Esc)">✕</button>
        </div>
      </header>
      <div class="libQuick" id="libQuick"></div>
      <div class="libGrid" id="libGrid"></div>
      <p class="libFoot" id="libFoot"></p>
    </div>
  </div>`);
  const root = q("#modalRoot") || document.body;
  root.appendChild(overlay);
  if (!opts.keepScroll) overlay.querySelector(".libScroll").scrollTop = 0;

  q("#libClose", overlay).onclick = () => closeLibrary();
  q("#libNew", overlay).onclick = () => openCreateFlow();
  q("#libImport", overlay).onclick = () => importFlow();
  q("#libExportZip", overlay).onclick = () => exportZipFlow();
  overlay.addEventListener("click", (e) => {
    const card = e.target.closest(".uniCard");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest("[data-menu]")) { universeMenu(e.target.closest("[data-menu]"), id); return; }
    if (e.target.closest("[data-open]") || !e.target.closest("button")) openUniverse(id);
  });
  document.addEventListener("keydown", onEsc);
  await renderLibrary();
  return overlay;
}

function onEsc(e) {
  if (e.key !== "Escape" || !overlay) return;
  if (document.querySelector(".modalBackdrop")) return;
  closeLibrary();
  document.removeEventListener("keydown", onEsc);
}

async function renderLibrary() {
  if (!overlay) return;
  const list = universes.list.slice().sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  await universes.hydrate(list);
  const total = list.length;
  const countEl = q("#libCount", overlay);
  if (countEl) countEl.textContent = total === 1 ? "1 Codex" : total + " Codexs";

  // atalhos — só fazem sentido quando já existe um universo aberto
  const active = universes.active();
  const quick = q("#libQuick", overlay);
  if (quick) {
    if (!total) {
      quick.hidden = true;
    } else {
      quick.hidden = false;
      quick.innerHTML = [
        { icon: "📇", title: "Criar entidades", sub: "Personagens, locais e regras do mundo", view: "browse" },
        { icon: "📖", title: "Escrever capítulos", sub: "A história ganha forma no texto", view: "book" },
        { icon: "🕸️", title: "Ver a rede", sub: "Quem conhece quem, e como", view: "graph" },
      ]
        .map(
          (s) => `<button class="libQuickCard" data-quick="${esc(s.view)}">
            <span class="libQuickIcon">${s.icon}</span>
            <span class="libQuickText"><strong>${esc(s.title)}</strong><em>${esc(s.sub)}</em></span>
          </button>`
        )
        .join("");
      for (const btn of quick.querySelectorAll(".libQuickCard")) {
        btn.onclick = () => {
          if (!active) { openCreateFlow(); return; }
          openUniverse(active.id, { view: btn.dataset.quick, force: true });
        };
      }
    }
  }

  const grid = q("#libGrid", overlay);
  if (!grid) return;
  if (!total) {
    grid.classList.add("libEmpty");
    grid.innerHTML = `<div class="libWelcome">
      <span class="libWelcomeMark">✦</span>
      <h2>Crie o seu próprio Codex</h2>
      <p>Um Codex é o seu mundo: fichas de personagens, lugares, organizações, as ligações entre eles, o livro com os capítulos, a timeline e os gráficos de poder. Tudo fica salvo no seu navegador, neste dispositivo — ninguém mais mexe no seu arquivo.</p>
      <div class="libWelcomeActions">
        <button class="btn primary" id="libWelcomeNew">＋ Criar meu Codex</button>
        <button class="btn" id="libWelcomeSample">🌱 Começar com um exemplo</button>
      </div>
      <p class="libWelcomeHint">Você pode criar quantos Codexs quiser — cada um fica separado, e dá para exportar ou apagar quando quiser.</p>
    </div>`;
    q("#libWelcomeNew", grid).onclick = () => openCreateFlow();
    q("#libWelcomeSample", grid).onclick = () => openCreateFlow({ withSample: true });
  } else {
    grid.classList.remove("libEmpty");
    grid.innerHTML = list.map(universeCardHtml).join("") + createCardHtml();
    const createCard = grid.querySelector("[data-create]");
    if (createCard) createCard.onclick = () => openCreateFlow();
  }

  const foot = q("#libFoot", overlay);
  if (foot) {
    foot.textContent = total
      ? "Cada Codex é um arquivo separado no seu navegador. Exporte em JSON (um Codex) ou em ZIP total (todos) para guardar uma cópia ou recuperar tudo se o navegador perder os dados."
      : "";
  }
}

function universeCardHtml(u) {
  const chips = (u.genero || []).map((g) => `<span class="uniChip">${esc(g)}</span>`).join("");
  const counts = universes.countsLabel(u) || "ainda vazio — comece criando uma ficha";
  const isActive = u.id === universes.activeId;
  const preview = u.preview ? `<p class="uniPreview">${esc(u.preview)}</p>` : "";
  const cover = universes.covers[u.id];
  const thumb = cover
    ? `<div class="uniThumb hasCover"><img class="uniThumbImg" src="${esc(cover)}" alt=""><span class="uniThumbMark">${esc(u.emoji || DEFAULT_EMOJI)}</span></div>`
    : `<div class="uniThumb"><span>${esc(u.emoji || DEFAULT_EMOJI)}</span></div>`;
  return `<article class="uniCard${isActive ? " current" : ""}" data-id="${esc(u.id)}">
    ${thumb}
    <div class="uniBody">
      <div class="uniHead">
        <h3 class="uniName">${esc(u.nome)}</h3>
        ${isActive ? '<span class="uniBadge">aberto agora</span>' : ""}
      </div>
      ${chips ? `<div class="uniGenres">${chips}</div>` : ""}
      ${preview}
      <div class="uniCounts">${esc(counts)}</div>
      <div class="uniMeta">atualizado ${esc(formatDate(u.atualizadoEm))}</div>
      <div class="uniActions">
        <button class="btn primary" data-open>${isActive ? "Continuar" : "Abrir"}</button>
        <button class="iconBtn" data-menu title="Mais opções">⋯</button>
      </div>
    </div>
  </article>`;
}

function createCardHtml() {
  return `<button class="uniCard uniCreate" data-create>
    <span class="uniCreatePlus">＋</span>
    <strong>Novo Codex</strong>
    <em>Abra um mundo do zero</em>
  </button>`;
}

function universeMenu(anchor, id) {
  const u = universes.byId(id);
  if (!u) return;
  popupMenu(anchor, [
    { icon: "🏠", label: "Abrir a Apresentação", hint: "nome, resumo e capa", onClick: () => openUniverse(id, { view: "present", force: true }) },
    { icon: "🌍", label: u.id === universes.activeId ? "Continuar neste Codex" : "Abrir este Codex", onClick: () => openUniverse(id) },
    { separator: true },
    { icon: "✏️", label: "Renomear e detalhes", onClick: () => openEditFlow(id) },
    { icon: "⧉", label: "Duplicar Codex", onClick: () => duplicateFlow(id) },
    { icon: "📤", label: "Exportar JSON", onClick: () => exportFlow(id) },
    { icon: "📦", label: "Exportar ZIP", onClick: () => exportSingleZipFlow(id) },
    { separator: true },
    { icon: "🗑", label: "Apagar Codex", danger: true, onClick: () => removeFlow(id) },
  ], { alignRight: true });
}

// ---------------------------------------------------------------- fluxos

function emojiPickerHtml(selected) {
  return `<div class="emojiPick">${EMOJIS.map(
    (e) => `<button type="button" class="emojiOpt${e === selected ? " current" : ""}" data-emoji="${esc(e)}">${e}</button>`
  ).join("")}</div>`;
}

function universeFormHtml(u) {
  u = u || {};
  return `<div class="uniForm">
    <div class="field">
      <label class="fieldLabel">Nome do Codex</label>
      <input class="input" id="ufName" value="${esc(u.nome || "")}" placeholder="Meu Codex" maxlength="80">
    </div>
    <div class="field">
      <label class="fieldLabel">Símbolo</label>
      ${emojiPickerHtml(u.emoji || DEFAULT_EMOJI)}
    </div>
    <div class="field">
      <label class="fieldLabel">Gênero (separe por vírgula)</label>
      <input class="input" id="ufGenre" value="${esc((u.genero || []).join(", "))}" placeholder="Fantasia, Romance, Ficção Científica" maxlength="140">
      <p class="fieldHint">Aparece como etiquetas no card do Codex.</p>
    </div>
    <div class="field">
      <label class="fieldLabel">Sobre o que é este mundo?</label>
      <textarea class="input" id="ufAbout" rows="8" placeholder="Escreva a apresentação do Codex: o tom, a premissa, o que está em jogo, quem manda, o que ninguém sabe…" maxlength="2000">${esc(u.resumo || "")}</textarea>
      <p class="fieldHint">Até 2000 caracteres. Este texto vira a página <strong>🏠 Apresentação</strong> do Codex.</p>
    </div>
    <div class="uniFormExtra" id="ufExtra"></div>
  </div>`;
}

function readForm(card) {
  const emojiBtn = card.querySelector(".emojiOpt.current");
  return {
    nome: card.querySelector("#ufName").value.trim(),
    emoji: emojiBtn ? emojiBtn.dataset.emoji : DEFAULT_EMOJI,
    genero: card.querySelector("#ufGenre").value.split(",").map((s) => s.trim()).filter(Boolean),
    resumo: card.querySelector("#ufAbout").value.trim(),
  };
}

function wireEmojiPicker(card) {
  for (const btn of card.querySelectorAll(".emojiOpt")) {
    btn.onclick = () => {
      for (const b of card.querySelectorAll(".emojiOpt")) b.classList.toggle("current", b === btn);
    };
  }
}

export function openCreateFlow(opts) {
  opts = opts || {};
  let withSample = !!opts.withSample;
  const body = el(universeFormHtml({ nome: opts.nome || "" }));
  const extra = el(`<label class="kfCheck"><input type="checkbox" id="ufSample" ${withSample ? "checked" : ""}> Começar com um Codex de exemplo já preenchido</label>`);
  body.querySelector("#ufExtra").appendChild(extra);
  const m = openModal({
    title: "🌍 Novo Codex",
    subtitle: "Um mundo novo, com fichas, capítulos e timeline próprios.",
    size: "md",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      {
        label: "Criar Codex",
        kind: "primary",
        onClick: async ({ close }) => {
          const data = readForm(m.card);
          withSample = m.card.querySelector("#ufSample").checked;
          close();
          // Descarrega o universo atual ANTES de mexer no registro (para nada
          // pendente acabar gravado no universo novo).
          try {
            await Promise.allSettled([store.flush(), book.flush(), timeline.flush(), competencia.flush()]);
          } catch (err) { /* ignora */ }
          const u = await universes.create({ nome: data.nome || "Meu Codex", emoji: data.emoji, genero: data.genero, resumo: data.resumo, withSample });
          toast("Codex “" + u.nome + "” criado", "success", 3000);
          location.reload();
        },
      },
    ],
  });
  wireEmojiPicker(m.card);
  const nameInput = m.card.querySelector("#ufName");
  if (nameInput) setTimeout(() => nameInput.focus(), 60);
}

export function openEditFlow(id, opts) {
  opts = opts || {};
  const u = universes.byId(id);
  if (!u) return;
  const body = el(universeFormHtml(u));
  const m = openModal({
    title: "✏️ Editar Codex",
    size: "md",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      {
        label: "Salvar",
        kind: "primary",
        onClick: async ({ close }) => {
          const data = readForm(m.card);
          await universes.update(id, data);
          close();
          updateUniverseButton();
          if (overlay) renderLibrary();
          if (opts.onSaved) opts.onSaved();
        },
      },
    ],
  });
  wireEmojiPicker(m.card);
}

async function duplicateFlow(id) {
  const u = universes.byId(id);
  if (!u) return;
  const ok = await confirmDialog({
    title: "Duplicar “" + u.nome + "”?",
    message: "Uma cópia completa deste Codex será criada, com as mesmas fichas, relações, capítulos e imagens.",
    confirmLabel: "Duplicar",
  });
  if (!ok) return;
  toast("Copiando o Codex…", "info", 2600);
  const copy = await universes.duplicate(id);
  toast("Criado: " + copy.nome, "success", 3200);
  renderLibrary();
}

async function exportFlow(id) {
  const u = universes.byId(id);
  if (!u) return;
  toast("Montando o arquivo…", "info", 2200);
  try {
    const payload = await universes.exportOne(id);
    download("codex-" + slug(u.nome) + ".json", JSON.stringify(payload));
    toast("Backup do Codex baixado", "success", 3200);
  } catch (err) {
    toast("Não consegui exportar: " + err.message, "error", 4200);
  }
}

async function removeFlow(id) {
  const u = universes.byId(id);
  if (!u) return;
  const ok = await confirmDialog({
    title: "Apagar “" + u.nome + "”?",
    message: "Todas as fichas, relações, capítulos, imagens e eventos deste Codex serão apagados deste dispositivo. Os outros Codexs não são afetados. Baixe um backup JSON antes, se quiser guardar.",
    confirmLabel: "Apagar Codex",
    danger: true,
  });
  if (!ok) return;
  const wasActive = u.id === universes.activeId;
  await universes.destroy(id);
  toast("Codex apagado", "info", 3000);
  if (wasActive) {
    location.reload();
    return;
  }
  renderLibrary();
}

async function exportSingleZipFlow(id) {
  const u = universes.byId(id);
  if (!u) return;
  toast("Montando o ZIP…", "info", 2200);
  try {
    const { exportSingleZip } = await import("../backupZip.js");
    await exportSingleZip(id);
    toast("ZIP do Codex baixado", "success", 3200);
  } catch (err) {
    toast("Não consegui exportar: " + err.message, "error", 4200);
  }
}

async function exportZipFlow() {
  toast("Montando o ZIP total…", "info", 2600);
  try {
    const { exportFullZip } = await import("../backupZip.js");
    const res = await exportFullZip();
    toast(res.count === 1 ? "ZIP total baixado (1 Codex)" : "ZIP total baixado (" + res.count + " Codexs)", "success", 3600);
  } catch (err) {
    toast("Não consegui exportar: " + err.message, "error", 5000);
  }
}

function importFlow() {
  const input = el('<input type="file" accept=".zip,.json,.html,.htm,application/json,application/zip,text/html" style="position:fixed;left:-9999px">');
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const isZip = /\.zip$/i.test(file.name || "");
    const isHtml = /\.html?$/i.test(file.name || "");
    try {
      if (isHtml) {
        const text = await file.text();
        if (!text || !text.trim()) throw new Error("arquivo vazio");
        const { openIndexHtmlSummary } = await import("../codeBackup.js");
        openIndexHtmlSummary(file.name || "index.html", text, overlay);
        return;
      }
      if (isZip) {
        toast("Lendo o ZIP…", "info", 2600);
        const { importBackupFile } = await import("../backupZip.js");
        const list = await importBackupFile(file);
        toast(list.length === 1 ? "Codex “" + list[0].nome + "” importado" : list.length + " Codexs importados do ZIP", "success", 4000);
        location.reload();
        return;
      }
      const text = await file.text();
      const payload = JSON.parse(text);
      const u = await universes.importFile(payload);
      toast("Codex “" + u.nome + "” importado", "success", 3600);
      location.reload();
    } catch (err) {
      if (err && err.code === "SITE_CODE") {
        try {
          toast("É código do site — abrindo no importador de código…", "info", 2600);
          const { readCodeZip, diffCodeZip, openCodeImportSummary } = await import("../codeBackup.js");
          const bundle = await readCodeZip(file);
          bundle.diff = await diffCodeZip(bundle.files);
          openCodeImportSummary(bundle, file, overlay);
        } catch (err2) {
          toast("Não consegui importar: " + (err2 && err2.message ? err2.message : "arquivo inválido"), "error", 6000);
        }
        return;
      }
      toast("Não consegui importar: " + (err && err.message ? err.message : "arquivo inválido"), "error", 6000);
    }
  };
  input.click();
}

// --------------------------------------------------------- botão da topbar

export function updateUniverseButton() {
  const u = universes.active();
  const nameEl = q("#uniNameEl");
  if (nameEl) nameEl.textContent = u ? u.nome : "Codex";
  const emojiEl = q("#uniMark");
  if (emojiEl && u) emojiEl.textContent = u.emoji || DEFAULT_EMOJI;
}
