// Página "Capítulos" do Livro: lista de capítulos, importação, exportação e
// o painel do editor. Cada capítulo aceita até CHAR_LIMIT (50.000) caracteres.

import { q, qa, el, toast, popupMenu, openModal, confirmDialog, promptDialog } from "../ui/dom.js";
import { esc, truncate, download, formatDate } from "../util.js";
import { book, CHAR_LIMIT } from "./store.js";
import { spell } from "./spell.js";
import { createChapterEditor } from "./editor.js";
import { VIEW } from "../view.js";

const RO = VIEW.active;
let bookViewInstance = null;

function fmt(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function preview(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return truncate(flat, 150);
}

function splitByLimit(text) {
  const out = [];
  let rest = String(text || "").trim();
  while (rest.length > CHAR_LIMIT) {
    let cut = rest.lastIndexOf("\n\n", CHAR_LIMIT);
    if (cut < CHAR_LIMIT * 0.5) cut = rest.lastIndexOf("\n", CHAR_LIMIT);
    if (cut < CHAR_LIMIT * 0.5) cut = rest.lastIndexOf(". ", CHAR_LIMIT);
    if (cut < CHAR_LIMIT * 0.5) cut = rest.lastIndexOf(" ", CHAR_LIMIT);
    if (cut < CHAR_LIMIT * 0.5) cut = CHAR_LIMIT;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.length ? out : [""];
}

function splitByHeadings(text) {
  const sections = [];
  let cur = null;
  for (const line of String(text || "").split("\n")) {
    const m = /^\s{0,3}#{1,3}\s+(.+?)\s*$/.exec(line);
    if (m) {
      cur = { title: m[1].replace(/[*_`]/g, "").trim() || "Sem título", lines: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) { cur = { title: "", lines: [] }; sections.push(cur); }
    cur.lines.push(line);
  }
  return sections
    .map((s) => ({ title: s.title, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text.length > 0 || s.title);
}

async function readDocx(file) {
  const mammoth = await import("https://esm.sh/mammoth@1.8.0?bundle");
  const buffer = await file.arrayBuffer();
  const mod = mammoth.default || mammoth;
  const result = await mod.extractRawText({ arrayBuffer: buffer });
  return String(result.value || "");
}

const MIME_OK = /\.(md|markdown|txt|text|docx)$/i;

export function initBookView() {
  if (bookViewInstance) return bookViewInstance;
  const host = q("#bookView");
  if (!host) return null;
  bookViewInstance = createBookView(host);
  return bookViewInstance;
}

export function createBookView(host) {
  let editorPane = null;
  let listPane = null;
  let cardsEl = null;
  let statsEl = null;
  let editor = null;
  let currentId = null;
  let preparedSpell = false;
  let fileMode = "text";
  let searchTerm = "";

  const fileInput = el(`<input type="file" class="bkFileInput" accept=".md,.markdown,.txt,.text,.docx,.json" hidden>`);
  host.appendChild(fileInput);

  listPane = el(`<div class="bkListPane">
    <header class="bkHead">
      <div class="bkHeadText">
        <h1 class="bkTitle">Capítulos</h1>
        <p class="bkSub">Escreva, cole de outro editor ou importe .md / .docx. O Codex conecta o texto ao seu universo.</p>
      </div>
      <div class="bkHeadActions">
        <button class="btn" data-act="export">⤓<span class="btnText"> Exportar</span></button>
        <button class="btn" data-act="import">📄<span class="btnText"> Importar</span></button>
        <button class="btn primary" data-act="new">＋<span class="btnText"> Novo capítulo</span></button>
      </div>
    </header>
    <div class="bkStatsBar">
      <span class="bkStatsText"></span>
      <span class="bkSpellChip"></span>
      <input class="bkSearch" type="search" placeholder="Buscar capítulo…" autocomplete="off" spellcheck="false">
    </div>
    <div class="bkCards"></div>
  </div>`);
  editorPane = el(`<div class="bkEditorPane" hidden></div>`);
  host.append(listPane, editorPane);

  cardsEl = q(".bkCards", listPane);
  statsEl = q(".bkStatsText", listPane);
  const spellChip = q(".bkSpellChip", listPane);
  const searchInput = q(".bkSearch", listPane);
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim();
    renderCards();
  });
  editor = createChapterEditor(editorPane);

  // ---------- faixa de status ----------

  function refreshSpellChip() {
    const s = spell.state;
    if (s === "loading") {
      const pct = Math.round((spell.progress || 0) * 100);
      spellChip.className = "bkSpellChip loading";
      spellChip.innerHTML = `<span class="spinner tiny"></span> Preparando corretor pt-BR… ${pct}%`;
      return;
    }
    if (s === "error") {
      spellChip.className = "bkSpellChip warn";
      spellChip.textContent = "⚠️ Dicionário pt-BR indisponível";
      spellChip.title = spell.failure || "";
      return;
    }
    if (s === "ready") {
      spellChip.className = "bkSpellChip ok";
      spellChip.textContent = "✓ Corretor pt-BR ativo";
      spellChip.title = "Dicionário VERO pt-BR (hunspell) rodando no seu navegador";
      return;
    }
    spellChip.className = "bkSpellChip";
    spellChip.textContent = "Preparar corretor pt-BR";
    spellChip.title = "Baixa o dicionário (~1,4 MB) e ativa a revisão ortográfica";
  }
  spell.onStatus(refreshSpellChip);
  refreshSpellChip();
  spellChip.addEventListener("click", () => {
    if (spell.state === "ready") return;
    spell.prepare().then((ok) => {
      if (ok) toast("Corretor pt-BR pronto", "success");
      else toast("Não consegui carregar o dicionário pt-BR neste navegador", "error", 6000);
    });
  });

  function prepareSpell() {
    if (preparedSpell || !spell.available) return;
    preparedSpell = true;
    spell.prepare().catch(() => {});
  }

  // ---------- lista ----------

  function refreshStats() {
    const s = book.stats();
    statsEl.textContent = fmt(s.chapters) + (s.chapters === 1 ? " capítulo" : " capítulos") + " · " + fmt(s.chars) + " caracteres · " + fmt(s.words) + " palavras · limite de " + fmt(CHAR_LIMIT) + " por capítulo";
  }

  function renderCards() {
    const all = book.list();
    const list = searchTerm
      ? all.filter((c) => (c.title + " " + c.moment + " " + c.text).toLowerCase().includes(searchTerm.toLowerCase()))
      : all;
    refreshStats();
    if (!all.length) {
      cardsEl.replaceChildren(el(RO ? `<div class="bkEmpty">
        <div class="bkEmptyIcon">📖</div>
        <h3>Este Codex publicado não tem capítulos</h3>
        <p>O autor não publicou nenhum capítulo do livro neste instantâneo.</p>
      </div>` : `<div class="bkEmpty">
        <div class="bkEmptyIcon">📖</div>
        <h3>Seu livro começa aqui</h3>
        <p>Crie o primeiro capítulo, cole um texto que você já escreveu ou importe um arquivo <b>.md</b> / <b>.docx</b>. Cada capítulo aceita até ${fmt(CHAR_LIMIT)} caracteres.</p>
        <button class="btn primary" data-act="new">＋ Novo capítulo</button>
      </div>`));
      return;
    }
    const frag = document.createDocumentFragment();
    if (searchTerm && !list.length) {
      frag.appendChild(el(`<p class="bkHint">Nenhum capítulo corresponde a “${esc(searchTerm)}”.</p>`));
    }
    list.forEach((chapter, index) => {
      const pct = Math.min(100, (chapter.text.length / CHAR_LIMIT) * 100);
      const card = el(`<article class="bkCard" data-id="${chapter.id}">
        <div class="bkCardIcon">${index + 1}</div>
        <div class="bkCardBody">
          <h3 class="bkCardTitle">${esc(chapter.title || "Sem título")}</h3>
          <p class="bkCardPreview">${chapter.text.trim() ? esc(preview(chapter.text)) : "Capítulo em branco — clique para começar a escrever."}</p>
          <div class="bkCardMeta">
            ${chapter.moment ? `<span class="bkPill">${esc(chapter.moment)}</span>` : ""}
            <span>${fmt(chapter.text.length)} caracteres</span>
            <span>·</span>
            <span>${fmt(chapter.text.trim() ? chapter.text.trim().split(/\s+/).length : 0)} palavras</span>
            <span>·</span>
            <span>atualizado ${esc(formatDate(chapter.updatedAt))}</span>
          </div>
        </div>
        ${RO ? "" : `<button class="iconBtn bkCardMenu" title="Ações do capítulo">⋯</button>`}
        <div class="bkCardBar" title="${fmt(chapter.text.length)} de ${fmt(CHAR_LIMIT)} caracteres"><i style="width:${pct}%"></i></div>
      </article>`);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".bkCardMenu")) return;
        openChapter(chapter.id);
      });
      const menuBtn = q(".bkCardMenu", card);
      if (menuBtn) menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        cardMenu(e.currentTarget, chapter);
      });
      frag.appendChild(card);
    });
    cardsEl.replaceChildren(frag);
  }

  function cardMenu(anchor, chapter) {
    const ordered = book.list();
    const idx = ordered.findIndex((c) => c.id === chapter.id);
    popupMenu(anchor, [
      { icon: "✏️", label: "Abrir capítulo", onClick: () => openChapter(chapter.id) },
      { icon: "⤓", label: "Exportar .md", onClick: () => exportChapter(chapter, "md") },
      { icon: "📄", label: "Duplicar", onClick: async () => { await book.duplicate(chapter.id); renderCards(); toast("Capítulo duplicado", "success"); } },
      { separator: true },
      { icon: "⬆️", label: "Mover para cima", hint: idx > 0 ? "" : "primeiro", onClick: () => { if (book.move(chapter.id, -1)) renderCards(); } },
      { icon: "⬇️", label: "Mover para baixo", hint: idx < ordered.length - 1 ? "" : "último", onClick: () => { if (book.move(chapter.id, 1)) renderCards(); } },
      { separator: true },
      { icon: "🗑️", label: "Apagar capítulo", danger: true, onClick: async () => {
        const ok = await confirmDialog({
          title: "Apagar “" + (chapter.title || "Sem título") + "”?",
          message: "O texto será removido para sempre. Considere exportar antes.",
          confirmLabel: "Apagar",
          danger: true,
        });
        if (!ok) return;
        book.remove(chapter.id);
        renderCards();
        toast("Capítulo apagado", "success");
      } },
    ], { alignRight: true });
  }

  // ---------- exportar / importar ----------

  function exportChapter(chapter, kind) {
    const safe = (chapter.title || "capitulo").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").toLowerCase() || "capitulo";
    if (kind === "txt") download(safe + ".txt", chapter.text, "text/plain");
    else download(safe + ".md", "# " + (chapter.title || "Sem título") + (chapter.moment ? "\n\n_" + chapter.moment + "_" : "") + "\n\n" + chapter.text, "text/markdown");
    toast("Capítulo exportado", "success");
  }

  async function exportAll(kind) {
    const chapters = book.list();
    if (!chapters.length) { toast("Nenhum capítulo para exportar ainda", "error"); return; }
    if (kind === "json") {
      const payload = await book.exportAll();
      download("livro-codex.json", JSON.stringify(payload, null, 2), "application/json");
      toast("Backup do livro baixado" + (Object.keys(payload.images || {}).length ? " (com as imagens)" : ""), "success");
      return;
    }
    const parts = chapters.map((c) => "# " + (c.title || "Sem título") + (c.moment ? "\n\n_" + c.moment + "_" : "") + "\n\n" + c.text.trim());
    const body = parts.join("\n\n\n");
    if (kind === "txt") download("livro.txt", body.replace(/^#\s+/gm, ""), "text/plain");
    else download("livro.md", body, "text/markdown");
    toast("Livro exportado (" + chapters.length + (chapters.length === 1 ? " capítulo)" : " capítulos)"), "success");
  }

  function exportMenu(anchor) {
    popupMenu(anchor, [
      { icon: "📕", label: "Todo o livro (.md)", onClick: () => exportAll("md") },
      { icon: "📄", label: "Todo o livro (.txt)", onClick: () => exportAll("txt") },
      { icon: "🗄️", label: "Backup do livro (.json)", hint: "para reimportar", onClick: () => exportAll("json") },
      { separator: true },
      { icon: "📥", label: "Importar .md / .txt / .docx", onClick: () => openFile("text") },
      { icon: "🗄️", label: "Restaurar backup (.json)", onClick: () => openFile("json") },
    ], { alignRight: true });
  }

  function openFile(mode) {
    fileMode = mode;
    fileInput.value = "";
    fileInput.click();
  }

  function newChapter() {
    const chapter = book.create({ title: "Novo capítulo", text: "" });
    currentId = chapter.id;
    listPane.hidden = true;
    editorPane.hidden = false;
    prepareSpell();
    editor.open(chapter.id);
    setTimeout(() => {
      const t = q(".bkTitleInput", editorPane);
      if (t) { t.focus(); t.select(); }
    }, 80);
  }

  listPane.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || !listPane.contains(btn)) return;
    const act = btn.dataset.act;
    if (act === "new") newChapter();
    else if (act === "export") exportMenu(btn);
    else if (act === "import") openFile("text");
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (fileMode === "json") { await importBackup(file); return; }
    if (!MIME_OK.test(file.name)) { toast("Formato não reconhecido. Use .md, .txt ou .docx", "error"); return; }
    let text = "";
    const isDocx = /\.docx$/i.test(file.name);
    const loading = toast(isDocx ? "Lendo o .docx…" : "Lendo o arquivo…", "info", 60000);
    try {
      text = isDocx ? await readDocx(file) : await file.text();
    } catch (err) {
      console.error(err);
      toast("Não consegui ler esse arquivo" + (isDocx ? " (.docx). Se estiver protegido, salve como .md ou .txt" : ""), "error", 7000);
      return;
    }
    const clean = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!clean) { toast("O arquivo está vazio", "error"); return; }
    await importFlow(file.name.replace(/\.[^.]+$/, ""), clean);
  });

  async function importFlow(baseName, text) {
    const sections = splitByHeadings(text).filter((s) => s.title || s.text.length > 120);
    const willSplit = sections.length >= 2 && sections.length <= 200;
    const body = el(`<div class="bkImport">
      <p class="bkImportName">📄 ${esc(baseName)}</p>
      <p class="bkImportInfo">${fmt(text.length)} caracteres · ${fmt(text.trim().split(/\s+/).length)} palavras${text.length > CHAR_LIMIT ? ` · será dividido em pelo menos ${Math.ceil(text.length / CHAR_LIMIT)} partes por causa do limite de ${fmt(CHAR_LIMIT)}` : ""}</p>
      <div class="bkImportOpts">
        ${willSplit ? `<label class="bkRadio"><input type="radio" name="bkImportMode" value="split"><span>Dividir em ${sections.length} capítulos pelos títulos (# do markdown)</span></label>` : ""}
        ${willSplit ? `<label class="bkRadio"><input type="radio" name="bkImportMode" value="single"><span>Criar um único capítulo</span></label>` : `<label class="bkRadio"><input type="radio" name="bkImportMode" value="single" checked><span>Criar um capítulo com este texto</span></label>`}
      </div>
      ${willSplit ? `<p class="bkHint">Títulos encontrados: ${esc(sections.slice(0, 6).map((s) => s.title || "(sem título)").join(" · "))}${sections.length > 6 ? " …" : ""}</p>` : ""}
    </div>`);
    if (willSplit) { const r = q("input[value='split']", body); if (r) r.checked = true; }
    const modal = openModal({
      title: "Importar texto",
      size: "md",
      body,
      actions: [
        { label: "Cancelar", onClick: ({ close }) => close() },
        { label: "Importar", kind: "primary", onClick: ({ close }) => {
          const mode = (q("input[name='bkImportMode']:checked", body) || {}).value || "single";
          const created = mode === "split"
            ? sections.map((s) => ({ title: s.title || baseName, text: s.text }))
            : [{ title: baseName, text }];
          let count = 0;
          let order = book.nextOrder();
          for (const item of created) {
            const parts = splitByLimit(item.text);
            parts.forEach((part, i) => {
              book.create({
                title: created.length > 1 ? item.title : (parts.length > 1 ? item.title + " (" + (i + 1) + ")" : item.title),
                text: part,
                order: order++,
              });
              count++;
            });
          }
          close();
          renderCards();
          toast(fmt(count) + (count === 1 ? " capítulo criado" : " capítulos criados"), "success", 4200);
        } },
      ],
    });
    return modal;
  }

  async function importBackup(file) {
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (e) {
      toast("Arquivo JSON inválido", "error");
      return;
    }
    const chapters = payload && Array.isArray(payload.chapters) ? payload.chapters : null;
    if (!chapters) { toast("Este arquivo não parece ser um backup do livro", "error", 6000); return; }
    const mode = await confirmDialog({
      title: "Restaurar " + fmt(chapters.length) + (chapters.length === 1 ? " capítulo?" : " capítulos?"),
      message: "OK substitui tudo o que existe hoje no livro. Cancelar junta os capítulos do backup com os atuais.",
      confirmLabel: "Substituir tudo",
      cancelLabel: "Juntar",
    });
    const res = await book.importAll(payload, mode ? "replace" : "append");
    renderCards();
    toast(fmt(res.chapters.length) + " capítulos restaurados", "success");
  }

  // ---------- editor ----------

  function showList() {
    currentId = null;
    listPane.hidden = false;
    editorPane.hidden = true;
    renderCards();
  }

  function openChapter(id) {
    const chapter = book.get(id);
    if (!chapter) { toast("Capítulo não encontrado", "error"); showList(); return; }
    saveAndSync();
    currentId = id;
    listPane.hidden = true;
    editorPane.hidden = false;
    prepareSpell();
    editor.open(id);
  }

  function saveAndSync() {
    if (currentId) editor.refresh();
  }

  host.addEventListener("bk:list-changed", () => { renderCards(); });
  host.addEventListener("bk:closed", () => { showList(); });
  host.addEventListener("bk:new-chapter", () => { newChapter(); });

  book.events.on("change", () => {
    clearTimeout(createBookView._t);
    createBookView._t = setTimeout(() => {
      if (!listPane.hidden) renderCards();
      else refreshStats();
    }, 350);
  });

  renderCards();
  book.load().then(() => {
    renderCards();
    if (!book.storageOk) toast("Não consegui abrir o armazenamento do livro. As alterações podem não ser salvas.", "error", 8000);
  });

  return {
    show() {
      host.hidden = false;
      prepareSpell();
      if (currentId && book.get(currentId)) {
        editorPane.hidden = false;
        listPane.hidden = true;
        editor.open(currentId);
      } else {
        showList();
      }
    },
    hide() {
      saveAndSync();
      host.hidden = true;
    },
    openChapter(id) { openChapter(id); },
    showList() { showList(); },
    render: renderCards,
  };
}
