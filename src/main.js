import { store } from "./store.js";
import { universes } from "./universe.js";
import { state, setUI, loadPrefs, savePrefs } from "./ui/state.js";
import { q, qa, el, toast, popupMenu, openModal, confirmDialog } from "./ui/dom.js";
import { renderSidebar, renderListHead, renderList, initBrowse, initGlobalSearch, moveEntityFlow } from "./ui/browse.js";
import { renderDetail, selectEntity, openRelationEditor, initDetailPane, miniGraphState, miniGraphObject } from "./ui/detail.js";
import { initGraphView, refreshGraph, focusInGraph, showGraphView, graphState, graphObject } from "./ui/graphview.js";
import { initAiPanels } from "./ui/aipanels.js";
import { openDataPanel, applyTheme } from "./ui/settings.js";
import { openKindPicker, openKindsManager } from "./ui/relations.js";
import { openUniverseLibrary, openUniverse, consumePendingView, updateUniverseButton } from "./ui/universes.js";
import { loadSampleData } from "./sample.js";
import { initBookView } from "./book/view.js";
import { book } from "./book/store.js";
import { spell } from "./book/spell.js";
import { timeline } from "./timeline/store.js";
import { initTimelineView } from "./timeline/view.js";
import { competencia } from "./competencia/store.js";
import { initCompetenciaView } from "./competencia/view.js";
import { initPresentView } from "./present/view.js";
import { VIEW, startView, viewErrorHtml, bloqueado, installReadonlyChrome, shareUrl } from "./view.js";
import { copyText, esc } from "./util.js";

// O modo somente leitura é decidido pelo endereço (#ver=...) e precisa estar
// ligado ANTES de qualquer store ler o armazenamento — por isso roda aqui no
// topo do módulo, antes do boot.
startView();

let booted = false;
let bookView = null;
let timelineView = null;
let competenciaView = null;
let presentView = null;
let capSheetDirty = false;

async function waitForGlobals() {
  for (let i = 0; i < 60; i++) {
    if (typeof root !== "undefined" && root && root.kv) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function createEntityFlow(type, opts) {
  opts = opts || {};
  if (state.view === "present") setView("browse");
  const folderId = state.folderId && !state.folderId.startsWith("__") ? state.folderId : null;
  const entity = store.createEntity({
    name: opts.name || "Nova ficha",
    type: type || "personagem",
    folderId,
  });
  setUI({ entityId: entity.id, detailMode: "edit" });
  savePrefs();
  renderSidebar();
  renderList();
  renderDetail();
  if (window.innerWidth < 900) q("#app").classList.add("detailOpen");
  const nameInput = q("[data-bind='name']");
  if (nameInput) { nameInput.focus(); nameInput.select(); }
}

function setView(view) {
  if (view === "tree") {
    state.graphLayout = "tree";
    view = "graph";
  }
  setUI({ view });
  savePrefs();
  for (const tab of qa("#viewTabs .tab")) tab.classList.toggle("active", tab.dataset.view === (view === "graph" ? (state.graphLayout === "tree" ? "tree" : "graph") : view));
  q("#browseView").hidden = view !== "browse";
  q("#graphView").hidden = view !== "graph";
  q("#bookView").hidden = view !== "book";
  q("#timelineView").hidden = view !== "timeline";
  q("#competenciaView").hidden = view !== "competencia";
  q("#presentView").hidden = view !== "present";
  if (view === "graph") showGraphView();
  else if (view === "browse") {
    renderList();
    if (capSheetDirty && state.detailMode !== "edit") { capSheetDirty = false; renderDetail(); }
  }
  if (bookView) {
    if (view === "book") bookView.show();
    else bookView.hide();
  }
  if (timelineView) {
    if (view === "timeline") timelineView.show();
    else timelineView.hide();
  }
  if (competenciaView) {
    if (view === "competencia") competenciaView.show();
    else competenciaView.hide();
  }
  if (presentView) {
    if (view === "present") presentView.show();
    else presentView.hide();
  }
}

function renderBrowseAll() {
  renderSidebar();
  renderListHead();
  renderList();
}

function wire() {
  for (const tab of qa("#viewTabs .tab")) {
    tab.onclick = () => setView(tab.dataset.view);
  }
  q("#newBtn").onclick = (e) => {
    if (VIEW.active) return bloqueado();
    const types = store.types();
    popupMenu(e.currentTarget, [
      ...types.map((t) => ({ icon: t.icon, label: t.l, onClick: () => createEntityFlow(t.id) })),
      { separator: true },
      { icon: "📁", label: "Nova pasta", onClick: () => q("#newFolderBtn").click() },
    ]);
  };
  q("#dataBtn").onclick = (e) => {
    if (VIEW.active) {
      popupMenu(e.currentTarget, [
        { icon: "👁️", label: "Como funciona este Codex publicado", onClick: () => openReadonlyHelp() },
        { separator: true },
        { icon: "⧉", label: "Copiar o link deste Codex", onClick: async () => { await copyText(shareUrl(VIEW.id)); toast("Link copiado", "success"); } },
        { icon: "🌍", label: "Abrir o meu Codex", hint: "só neste navegador", onClick: () => { location.href = "https://perchance.org/" + (window.generatorName || ""); } },
      ], { alignRight: true });
      return;
    }
    popupMenu(e.currentTarget, [
      { icon: "🌍", label: "Biblioteca de Codexs", hint: "criar, abrir, exportar", onClick: () => openUniverseLibrary() },
      { separator: true },
      { icon: "📥", label: "Arquivo, backup e preferências", onClick: () => openDataPanel() },
      { icon: "🧭", label: "Como usar", onClick: () => openHelp() },
      { separator: true },
      { icon: "📁", label: "Nova pasta", onClick: () => q("#newFolderBtn").click() },
    ], { alignRight: true });
  };
  const uniBtn = q("#uniBtn");
  if (uniBtn) uniBtn.onclick = () => openUniverseLibrary();
  q("#menuToggle").onclick = () => {
    q("#app").classList.toggle("sidebarClosed");
    q("#app").classList.toggle("sidebarOpenMobile");
  };
  q("#detailBackBtn").onclick = () => {
    q("#app").classList.remove("detailOpen");
    setUI({ entityId: null });
    renderDetail();
  };

  window.addEventListener("codex:new-entity", (e) => { if (VIEW.active) return bloqueado(); createEntityFlow(e.detail && e.detail.type); });
  window.addEventListener("codex:refresh-browse", () => renderBrowseAll());
  window.addEventListener("codex:data-changed", () => {
    renderBrowseAll();
    if (state.view === "graph") refreshGraph();
    if (competenciaView) competenciaView.refresh();
    if (presentView) presentView.refresh();
  });
  window.addEventListener("codex:open-detail", (e) => {
    const id = e.detail && e.detail.id;
    const edit = !VIEW.active && e.detail && e.detail.edit;
    setUI({ entityId: id, detailMode: edit ? "edit" : null });
    if (window.innerWidth < 900) q("#app").classList.add("detailOpen");
    if (state.view === "graph") setView("browse");
    renderDetail();
    renderList();
  });
  window.addEventListener("codex:select", (e) => {
    const id = e.detail && e.detail.id;
    if (window.innerWidth < 900 && id) q("#app").classList.add("detailOpen");
    renderList();
  });
  window.addEventListener("codex:view", (e) => {
    const d = e.detail || {};
    if (d.view) setView(d.view);
    if (d.focus) focusInGraph(d.focus);
  });
  window.addEventListener("codex:move-entity", (e) => { if (VIEW.active) return bloqueado(); moveEntityFlow(e.detail.id); });
  window.addEventListener("codex:open-relation", (e) => { if (VIEW.active) return bloqueado(); openRelationEditor(e.detail.id, e.detail); });
  window.addEventListener("codex:open-chapter", (e) => {
    const id = e.detail && e.detail.id;
    setView("book");
    if (bookView && id) bookView.openChapter(id);
  });
  window.addEventListener("codex:open-competencia", (e) => {
    const id = e.detail && e.detail.id;
    setView("competencia");
    if (competenciaView && id) competenciaView.select(id);
  });
  window.addEventListener("codex:competencia-changed", () => {
    capSheetDirty = true;
    if (state.view === "browse" && state.detailMode !== "edit") { capSheetDirty = false; renderDetail(); }
  });
  store.events.on("entity", (ev) => {
    if (ev && ev.action === "delete" && ev.entity) competencia.forget(ev.entity.id);
  });
  window.addEventListener("codex:open-data", () => { if (VIEW.active) return openReadonlyHelp(); openDataPanel(); });
  window.addEventListener("codex:load-sample", () => { if (VIEW.active) return bloqueado(); loadSampleFlow(); });

  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest("[data-entity-link], [data-goto]");
    if (!link) return;
    const id = link.dataset.entityLink || link.dataset.goto;
    if (!id) return;
    e.preventDefault();
    setView("browse");
    setUI({ entityId: id, detailMode: null });
    if (window.innerWidth < 900) q("#app").classList.add("detailOpen");
    renderDetail();
    renderList();
  });

  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if (e.key === "Escape") {
      q("#app").classList.remove("detailOpen");
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); q("#globalSearchInput").focus(); }
    if (e.key === "n") { e.preventDefault(); if (VIEW.active) return bloqueado(); createEntityFlow("personagem"); }
    if (e.key === "p") { setView("present"); }
    if (e.key === "g") { setView("graph"); }
    if (e.key === "b") { setView("browse"); }
    if (e.key === "l") { setView("book"); }
    if (e.key === "t") { setView("timeline"); }
    if (e.key === "c") { setView("competencia"); }
    if (e.key === "?") { if (VIEW.active) openReadonlyHelp(); else openHelp(); }
  });

  store.events.on("change", () => {
    clearTimeout(wire._t);
    wire._t = setTimeout(() => {
      renderSidebar();
      renderListHead();
      renderList();
    }, 420);
  });
}

export async function loadSampleFlow() {
  if (store.entities.size) {
    const ok = await confirmDialog({
      title: "Carregar o universo de exemplo?",
      message: "Isso vai adicionar cerca de 15 fichas e 24 relações de exemplo ao seu arquivo atual. Você pode apagá-las depois em “⋯ → Arquivo, backup e preferências → Apagar tudo”.",
      confirmLabel: "Carregar exemplo",
    });
    if (!ok) return;
  }
  toast("Montando o universo de exemplo…", "info", 2600);
  await loadSampleData();
  renderBrowseAll();
  renderDetail();
  if (state.view === "graph") refreshGraph();
  toast("Exemplo carregado: abra as fichas, a Rede e a Árvore para explorar", "success", 5200);
}

export function openReadonlyHelp() {
  const nome = (VIEW.meta && VIEW.meta.nome) || "este Codex";
  const body = el(`<div class="helpPanel">
    <section>
      <h4>👁️ Você está vendo um Codex publicado</h4>
      <p>Esta é uma <strong>cópia publicada de “${esc(nome)}”</strong>, aberta pelo link que o autor compartilhou. Ela foi feita no momento em que ele publicou, e serve para <strong>ler e explorar</strong> — nada aqui pode ser alterado por você (nem por engano, nem de propósito).</p>
    </section>
    <section>
      <h4>O que dá para fazer</h4>
      <ul>
        <li>Navegar pelas abas: <strong>🏠 Apresentação</strong>, <strong>🗂️ Fichas</strong> (com pastas, busca e ficha completa), <strong>🕸️ Rede</strong> e <strong>🌳 Árvore</strong>, <strong>📖 Livro</strong>, <strong>⏳ Timeline</strong> e <strong>⚡ Competência</strong>.</li>
        <li>Ler as descrições, ver as imagens, seguir os vínculos <code>[[assim]]</code> de uma ficha para outra.</li>
        <li>Folhear as imagens de uma ficha: as <strong>setas ‹ ›</strong> da foto passam de uma imagem para a outra, as <strong>miniaturas</strong> embaixo dela mostram todas e o <strong>🔍</strong> abre a imagem inteira (com as setas e a tira de miniaturas).</li>
        <li>Copiar o link desta página (no menu <strong>⋯</strong> ou na faixa de baixo) para mostrar a outras pessoas.</li>
      </ul>
    </section>
    <section>
      <h4>O que não dá</h4>
      <p>Criar, editar, apagar, mover, importar ou gerar qualquer coisa. Os botões de escrita não existem aqui, e o que você vê nunca encosta no seu próprio arquivo nem no do autor.</p>
    </section>
    <section>
      <h4>Quer o seu próprio Codex?</h4>
      <p><a class="btn" href="https://perchance.org/${esc(window.generatorName || "")}">Abrir o meu Codex neste navegador</a></p>
    </section>
  </div>`);
  openModal({
    title: "👁️ Codex publicado (somente leitura)",
    size: "md",
    body,
    actions: [{ label: "Entendi", kind: "primary", onClick: ({ close }) => close() }],
  });
}

export function openHelp() {
  const body = el(`<div class="helpPanel">
    <section>
      <h4>Apresentação</h4>
      <ul>
        <li>A aba <strong>🏠 Apresentação</strong> é a capa do seu Codex: nome, símbolo, gêneros, o texto “Sobre o que é este mundo?” (até 2000 caracteres) e a <strong>imagem de capa</strong>.</li>
        <li>A capa aparece também na <strong>miniatura do card</strong> na Biblioteca de Codexs. Troque por um arquivo ou por um link — e clique nela para ver em tamanho grande.</li>
        <li>A grade de números embaixo mostra cada tipo de ficha, capítulos, relações e timeline: clique num card para ir direto para lá. <strong>✏️ Editar</strong> abre o formulário do Codex.</li>
      </ul>
    </section>
    <section>
      <h4>O básico</h4>
      <ul>
        <li><strong>+ Novo</strong> cria uma ficha. Escolha o tipo (personagem, organização, local, item, criatura, evento, universo, nota).</li>
        <li>Pastas organizam tudo: arraste uma ficha para uma pasta na barra lateral, ou crie subpastas infinitas.</li>
        <li>Cada ficha aceita <strong>imagem, resumo, descrição e campos personalizados</strong> (o botão “+ Adicionar campo” cria os seus).</li>
      </ul>
    </section>
    <section>
      <h4>Vínculos entre fichas</h4>
      <ul>
        <li><strong>🔗 Relação</strong> liga duas fichas (família, amigos, inimigos, liderança, lugar…). A direção importa: “A é pai de B”.</li>
        <li>Na <strong>Rede</strong> e na <strong>Árvore</strong>, passe o mouse sobre uma esfera e use a alça <strong>🔗</strong> — ou clique com o <strong>botão direito</strong> na esfera — e <strong>arraste até outra ficha</strong>: ao soltar, você escolhe o tipo de anexo.</li>
        <li>Na ficha, o botão <strong>🔗</strong> ao lado de cada conexão troca o tipo daquele anexo — e em <strong>⚙️ Tipos de anexo</strong> você cria os seus: “é amante de”, “é concubina de”, “é escravo(a) de”…</li>
        <li>Na descrição, escreva <code>[[Nome da ficha]]</code> para criar um vínculo clicável. Nomes de fichas existentes também são destacados automaticamente.</li>
        <li><strong>Rede</strong> mostra o grafo completo; <strong>Árvore</strong> organiza por gerações de parentesco.</li>
      </ul>
    </section>
    <section>
      <h4>Livro</h4>
      <ul>
        <li>A aba <strong>📖 Livro</strong> é o seu caderno de escrita: cada capítulo aceita até <strong>50.000 caracteres</strong>.</li>
        <li>A <strong>barra de formatação</strong> deixa o texto rico: negrito, itálico, sublinhado, riscado, tamanho da letra (A−/A+), títulos, citação, listas e linha divisória.</li>
        <li><strong>🔗 Ficha</strong> insere um atalho clicável para um personagem, organização ou lugar no meio do texto; <strong>🖼️</strong> insere uma imagem no capítulo.</li>
        <li>Comece a digitar e clique em <strong>Anexar fichas</strong> (ou no painel lateral) para prender as fichas ao capítulo: elas ficam em <strong>Anexados</strong> e você as acha depois na ficha, em <strong>Aparece em</strong>.</li>
        <li><strong>💾 Salvar e sair</strong> grava o capítulo e volta para a lista (tudo também é salvo sozinho enquanto você escreve).</li>
        <li>Importe <code>.md</code>, <code>.txt</code> ou <code>.docx</code> — se o texto tiver títulos, ele pode ser dividido em vários capítulos.</li>
        <li>O <strong>corretor ortográfico pt-BR</strong> sublinha os erros, sugere trocas (clique com o botão direito na palavra) e aprende os nomes das suas fichas.</li>
      </ul>
    </section>
    <section>
      <h4>Timeline</h4>
      <ul>
        <li>A aba <strong>⏳ Timeline</strong> é a cronologia viva: <strong>＋ Novo evento</strong> cria um acontecimento datado e <strong>Filtrar</strong> mostra os chips das fichas.</li>
        <li>Escreva a data como quiser (“Ano 10 DC”, “1975”, “Antes da Chegada”): números ordenam sozinhos e “AC”/“antes” joga para o começo.</li>
        <li>Todo capítulo com o campo <strong>Momento</strong> preenchido entra na Timeline automaticamente — e o menu ⋯ do editor cria um evento já ligado ao capítulo.</li>
        <li>Ligue fichas a um evento para ver a história por personagem, e clique nos chips para abrir a ficha.</li>
      </ul>
    </section>
    <section>
      <h4>Competência</h4>
      <ul>
        <li>A aba <strong>⚡ Competência</strong> desenha os <strong>gráficos de poder</strong> de cada ficha: escolha a ficha à esquerda e ajuste cada aro — valor, cor, máximo e uma anotação curta embaixo.</li>
        <li>Os gráficos formam um <strong>catálogo</strong> que vale para todas as fichas: renomeie “INTELIGÊNCIA” para “INSTINTO” quando quiser e os valores já preenchidos continuam nos seus lugares.</li>
        <li><strong>Tags especiais</strong> marcam capacidades únicas (poderes, marcas, técnicas) com ícone, cor e um texto explicativo.</li>
        <li><strong>Condecorações</strong> são a outra família de etiquetas: honrarias, títulos e medalhas que o mundo reconheceu naquele personagem — são <strong>elas</strong> que aparecem no <strong>cabeçalho da ficha</strong>, logo abaixo dos botões.</li>
        <li>O que você monta aqui aparece na ficha: os <strong>aros</strong> e as <strong>tags especiais</strong> na <strong>Descrição</strong> (abaixo do texto, junto do “Texto abaixo dos gráficos”) e as <strong>condecorações</strong> no <strong>cabeçalho</strong>. O botão <strong>✏️ Editar</strong> do painel traz você de volta para cá.</li>
      </ul>
    </section>
    <section>
      <h4>Atalhos</h4>
      <p><code>/</code> buscar · <code>n</code> nova ficha · <code>p</code> apresentação · <code>b</code> fichas · <code>g</code> rede · <code>l</code> livro · <code>t</code> timeline · <code>c</code> competência · <code>?</code> ajuda · <code>Ctrl+S</code> salvar o capítulo</p>
    </section>
    <section>
      <h4>Onde ficam meus dados?</h4>
      <p>Tudo é salvo no seu navegador (IndexedDB), na sua conta deste gerador. Use <strong>Arquivo, backup e preferências → Baixar JSON</strong> para guardar uma cópia ou levar para outro dispositivo.</p>
    </section>
  </div>`);
  openModal({
    title: "🧭 Como usar o Codex",
    size: "md",
    body,
    actions: [
      { label: "🌱 Carregar exemplo", onClick: ({ close }) => { close(); loadSampleFlow(); } },
      { label: "Entendi", kind: "primary", onClick: ({ close }) => close() },
    ],
  });
}

async function boot() {
  if (booted) return;
  booted = true;
  const ok = await waitForGlobals();
  const loading = q("#loadingOverlay");
  if (!ok) {
    if (loading) loading.innerHTML = `<div class="loadBox"><h2>Não consegui carregar o armazenamento</h2><p>Recarregue a página para tentar de novo.</p></div>`;
    return;
  }

  // O universo ativo decide em qual espaço de nomes (pastas do kv) o app vai ler
  // e escrever — por isso ele é resolvido antes de qualquer store carregar.
  await universes.load();
  const activeUniverse = universes.active();

  // Codex publicado por outra pessoa: se o instantâneo não veio (link errado,
  // despublicado, sem rede), mostramos o motivo — e mais nada.
  if (VIEW.active && !activeUniverse) {
    if (loading) loading.innerHTML = viewErrorHtml();
    return;
  }

  if (loading && activeUniverse) {
    const p = loading.querySelector(".loadBox p");
    if (p) p.textContent = "Abrindo “" + activeUniverse.nome + "”…";
  }

  if (!universes.activeId) {
    if (loading) { loading.classList.add("gone"); setTimeout(() => loading.remove(), 400); }
    window.codex = {
      universes,
      state,
      store,
      openUniverse,
      openUniverses: () => openUniverseLibrary(),
      createUniverse: () => openUniverseLibrary(),
      reload: () => location.reload(),
    };
    openUniverseLibrary({ welcome: true });
    return;
  }

  await store.load();
  if (!store.storageOk) toast("Não consegui abrir o banco de dados local. As alterações podem não ser salvas.", "error", 8000);
  await timeline.load();
  await competencia.load();
  loadPrefs();
  applyTheme(state.theme || "dark");
  q("#app").classList.toggle("sidebarClosed", !state.sidebarOpen);
  initBrowse();
  initGlobalSearch();
  initDetailPane();
  initAiPanels();
  initGraphView("graphCanvas");
  bookView = initBookView();
  timelineView = initTimelineView();
  competenciaView = initCompetenciaView();
  presentView = initPresentView();
  wire();
  renderBrowseAll();
  renderDetail();
  // Quem só está vendo um Codex publicado cai na Apresentação (a capa do mundo),
  // que é a melhor porta de entrada e a aba mais "de leitura" de todas.
  setView(VIEW.active ? "present" : (state.view || "browse"));
  if (VIEW.active) installReadonlyChrome();
  updateUniverseButton();

  // Se o usuário pediu uma aba ao trocar de universo (atalhos da biblioteca),
  // ela vem guardada na sessão.
  const pendingView = consumePendingView();
  if (pendingView && pendingView !== state.view) setView(pendingView);

  // Universo recém-criado com o exemplo marcado: enche o mundo agora.
  if (universes.bootstrapSample && universes.bootstrapSample === universes.activeId) {
    await universes.clearBootstrapSample();
    try {
      await loadSampleData();
      renderBrowseAll();
      renderDetail();
      if (state.view === "graph") refreshGraph();
      if (competenciaView) competenciaView.refresh();
      toast("Universo de exemplo pronto — abra as fichas, a Rede e o Livro para explorar", "success", 5200);
    } catch (err) {
      console.error("Falha ao carregar o exemplo", err);
      toast("Não consegui montar o universo de exemplo", "error", 4200);
    }
  }

  window.codex = {
    store, state, setUI, savePrefs, universes, view: VIEW,
    render: () => { renderBrowseAll(); renderDetail(); if (state.view === "graph") refreshGraph(); if (state.view === "browse") renderList(); },
    createEntity: createEntityFlow, setView, selectEntity, openRelationEditor, openDataPanel, openHelp,
    openKindPicker, openKindsManager, openUniverse,
    openUniverses: () => openUniverseLibrary(),
    reload: () => location.reload(),
    book: bookView,
    bookStore: book,
    timeline: timelineView,
    timelineStore: timeline,
    competencia: {
      store: competencia,
      get view() { return competenciaView; },
      show: () => setView("competencia"),
      select: (id) => { setView("competencia"); if (competenciaView) competenciaView.select(id); },
      refresh: () => { if (competenciaView) competenciaView.refresh(); },
    },
    spell,
    get present() { return presentView; },
    graphs: {
      refresh: refreshGraph, focus: focusInGraph,
      get state() { return graphState(); },
      get obj() { return graphObject(); },
      get mini() { return miniGraphState(); },
      get miniObj() { return miniGraphObject(); },
    },
  };
  if (!VIEW.active && !store.entities.size) {
    setTimeout(() => {
      if (!store.entities.size) q("#app").classList.add("detailOpen");
    }, 300);
  }
  if (loading) { loading.classList.add("gone"); setTimeout(() => loading.remove(), 400); }
  if (!VIEW.active && !store.entities.size) setTimeout(() => openHelp(), 600);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
