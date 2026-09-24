// Editor de capitulo em texto rico (contenteditable) com barra de formatacao,
// corretor ortografico pt-BR, anexo de fichas e imagens.
//
// O HTML e a fonte de verdade do capitulo; o texto puro e derivado (contagem,
// busca e previa). Os realces do corretor usam a CSS Custom Highlight API, que
// desenha o sublinhado ondulado sem tocar no DOM — assim o cursor, a selecao e
// o desfazer continuam intactos.

import { q, qa, el, toast, popupMenu, openModal, confirmDialog } from "../ui/dom.js";
import { esc, norm, copyText, download, formatDate, shrinkImage, readFileAsDataUrl } from "../util.js";
import { store } from "../store.js";
import { book, CHAR_LIMIT, MOMENT_SUGGESTIONS } from "./store.js";
import { spell, tokenize } from "./spell.js";
import { domTextMap, globalOffsetOf, rangeFromOffsets, sanitizeHtml, stripImageSources, htmlToText } from "./richtext.js";
import { pickEntities } from "../ui/entityPicker.js";
import { WORD_LINK_CLASS, wordLinkTitle, pickLinkTarget, anchorAt, wrapRangeWithLink } from "../ui/wordlink.js";
import { openEventEditor } from "../timeline/view.js";
import { VIEW } from "../view.js";

const SAVE_DELAY = 900;
const ANALYZE_DELAY = 800;
const MAX_REVIEW_ROWS = 40;
const HL_NAME = "bk-miss";

function fmt(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function refChipHtml(entity) {
  const t = store.type(entity.type);
  return `<span class="bkRef" data-ref="${esc(entity.id)}" contenteditable="false" style="--typeColor:${esc(t.color)}">${esc(t.icon)} ${esc(entity.name)}</span>`;
}

function highlightSupported() {
  return typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight === "function";
}

export function createChapterEditor(host) {
  // Num Codex publicado (somente leitura) o editor vira uma folha de leitura:
  // nada aqui escreve, e as barras de ferramentas nem aparecem.
  const RO = VIEW.active;
  let chapter = null;
  let spellEnabled = true;
  let badWords = new Set();
  let analyzeTimer = null;
  let saveTimer = null;
  let countRaf = 0;
  let lastLimitWarn = 0;
  let statusOff = null;
  let committedText = "";
  let sideTab = "attached";
  let ready = false;

  const rootEl = el(`<div class="bkEditor">
    <div class="bkBar">
      <button class="iconBtn" data-act="back" title="Voltar aos capítulos">←</button>
      <input class="bkTitleInput" placeholder="Título do capítulo" maxlength="140" autocomplete="off" spellcheck="false">
      <span class="bkSaveState" title="Salvamento automático"></span>
      <div class="bkBarSpacer"></div>
      <button class="btn tiny bkSpellBtn" data-act="spell" title="Ligar/desligar o corretor ortográfico">✓ <span>Ortografia</span></button>
      <button class="btn tiny bkReviewBtn" data-act="review" title="Lista de palavras para revisar">🔎 <span>Revisar</span><b class="bkBadge" hidden></b></button>
      <button class="btn tiny primary bkExitBtn" data-act="exit" title="Salvar e voltar para a lista de capítulos">💾 <span>Salvar e sair</span></button>
      <button class="iconBtn" data-act="menu" title="Mais ações">⋯</button>
    </div>
    <div class="bkTools">
      <button class="bkT" data-cmd="bold" title="Negrito (Ctrl+B)"><b>B</b></button>
      <button class="bkT" data-cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
      <button class="bkT" data-cmd="underline" title="Sublinhado (Ctrl+U)"><u>U</u></button>
      <button class="bkT" data-cmd="strikeThrough" title="Riscado"><s>S</s></button>
      <span class="bkTSep"></span>
      <button class="bkT bkTText" data-size="-1" title="Diminuir o tamanho do texto">A−</button>
      <button class="bkT bkTText" data-size="1" title="Aumentar o tamanho do texto">A+</button>
      <span class="bkTSep"></span>
      <button class="bkT bkTText" data-block="H1" title="Título do capítulo">H1</button>
      <button class="bkT bkTText" data-block="H2" title="Subtítulo">H2</button>
      <button class="bkT" data-block="P" title="Parágrafo normal">¶</button>
      <button class="bkT" data-block="BLOCKQUOTE" title="Citação">❝</button>
      <span class="bkTSep"></span>
      <button class="bkT" data-cmd="insertUnorderedList" title="Lista com marcadores">⁝≡</button>
      <button class="bkT bkTText" data-cmd="insertOrderedList" title="Lista numerada">1.</button>
      <button class="bkT" data-cmd="insertHorizontalRule" title="Linha divisória">―</button>
      <span class="bkTSep"></span>
      <button class="bkT bkTText" data-act="insert-entity" title="Inserir uma ficha do seu universo no texto — ou clique com o botão direito numa palavra para anexá-la a uma ficha">🔗 Ficha</button>
      <button class="bkT" data-act="insert-image" title="Inserir uma imagem">🖼️</button>
      <span class="bkTSep"></span>
      <button class="bkT" data-cmd="undo" title="Desfazer (Ctrl+Z)">↶</button>
      <button class="bkT" data-cmd="redo" title="Refazer (Ctrl+Shift+Z)">↷</button>
    </div>
    <div class="bkSubBar">
      <label class="bkMomentField"><span>Momento</span>
        <input class="input bkMomentInput" placeholder="Ex.: Ano 10 DC" maxlength="70" autocomplete="off" spellcheck="false" list="bkMomentList">
      </label>
      <datalist id="bkMomentList"></datalist>
      <button class="btn tiny" data-act="attach" title="Ligar fichas do universo a este capítulo">🔖 <span>Anexar fichas</span></button>
      <div class="bkSubHint"></div>
    </div>
    <div class="bkMain">
      <div class="bkPaper">
        <div class="bkRT" contenteditable="true" spellcheck="false" autocapitalize="sentences" autocomplete="off" aria-label="Texto do capítulo"></div>
      </div>
      <aside class="bkSide">
        <div class="bkSideTabs">
          <button class="bkSideTab on" data-side="attached">🔖 Anexados</button>
          <button class="bkSideTab" data-side="mentioned">✨ Mencionados</button>
        </div>
        <div class="bkSideBody"></div>
        <button class="btn tiny bkSideAdd" data-act="attach">＋ Anexar ficha</button>
      </aside>
    </div>
    <div class="bkFoot">
      <div class="bkCounter"><span class="bkCountText">0 / 50.000 caracteres</span><span class="bkBarTrack"><i class="bkBarFill"></i></span></div>
      <div class="bkSpellState"></div>
    </div>
    <input type="file" class="bkImgInput" accept="image/*" hidden>
  </div>`);

  host.replaceChildren(rootEl);

  const titleInput = q(".bkTitleInput", rootEl);
  const momentInput = q(".bkMomentInput", rootEl);
  const momentList = q("#bkMomentList", rootEl);
  const rt = q(".bkRT", rootEl);
  const sideBody = q(".bkSideBody", rootEl);
  const countText = q(".bkCountText", rootEl);
  const barFill = q(".bkBarFill", rootEl);
  const spellStateEl = q(".bkSpellState", rootEl);
  const subHint = q(".bkSubHint", rootEl);
  const spellBtn = q(".bkSpellBtn", rootEl);
  const reviewBtn = q(".bkReviewBtn", rootEl);
  const badge = q(".bkBadge", rootEl);
  const saveStateEl = q(".bkSaveState", rootEl);
  const imgInput = q(".bkImgInput", rootEl);

  if (RO) {
    rootEl.classList.add("bkReadonly");
    rt.setAttribute("contenteditable", "false");
    rt.setAttribute("aria-readonly", "true");
    titleInput.readOnly = true;
    momentInput.readOnly = true;
    setSaveState("");
  }

  for (const m of MOMENT_SUGGESTIONS) {
    if (!m) continue;
    momentList.appendChild(el(`<option value="${esc(m)}"></option>`));
  }

  // ---------- estado do corretor ----------

  function setSpellState(kind, text) {
    spellStateEl.className = "bkSpellState" + (kind ? " " + kind : "");
    spellStateEl.textContent = text;
  }

  function spellStatusText() {
    if (!spellEnabled) return "Corretor desligado";
    if (spell.state === "loading") {
      const pct = Math.round((spell.progress || 0) * 100);
      return "Carregando dicionário pt-BR… " + (pct > 0 ? pct + "%" : "");
    }
    if (spell.state === "error") return "Corretor do dicionário indisponível — usando o corretor do navegador";
    if (spell.state !== "ready") return "Corretor pronto para iniciar";
    const n = badWords.size;
    if (!n) return "✓ Nenhum erro de ortografia";
    return n + (n === 1 ? " palavra para revisar" : " palavras para revisar");
  }

  function refreshSpellUI() {
    const loading = spellEnabled && spell.state === "loading";
    spellBtn.classList.toggle("on", spellEnabled);
    spellBtn.innerHTML = (loading ? `<span class="spinner tiny"></span>` : (spellEnabled ? "✓" : "○")) + " <span>Ortografia</span>";
    spellStateEl.textContent = spellStatusText();
    spellStateEl.className = "bkSpellState" + (spell.state === "error" && spellEnabled ? " warn" : (badWords.size && spellEnabled && spell.state === "ready" ? " bad" : ""));
    const showReview = spellEnabled && badWords.size > 0;
    reviewBtn.hidden = !showReview;
    badge.hidden = !showReview;
    if (showReview) badge.textContent = badWords.size > 99 ? "99+" : String(badWords.size);
  }

  function ensureSpell() {
    if (!statusOff) statusOff = spell.onStatus(() => refreshSpellUI());
    if (!spell.available) {
      rt.spellcheck = true;
      rt.lang = "pt-BR";
      refreshSpellUI();
      return;
    }
    if (spell.state === "idle" || spell.state === "error") {
      spell.prepare().then((ok) => {
        if (!ok) {
          rt.spellcheck = true;
          rt.lang = "pt-BR";
          setSpellState("warn", "Corretor do dicionário indisponível — usando o corretor do navegador");
        }
        refreshSpellUI();
      });
    }
    refreshSpellUI();
  }

  // ---------- realces (CSS Custom Highlight) ----------

  function clearHighlights() {
    if (!highlightSupported()) return;
    try { CSS.highlights.delete(HL_NAME); } catch (e) { /* ok */ }
  }

  function applyHighlights() {
    clearHighlights();
    if (!highlightSupported()) return;
    if (!spellEnabled || spell.state !== "ready" || !badWords.size) return;
    const map = domTextMap(rt);
    const ranges = [];
    for (const tk of tokenize(map.text)) {
      if (!badWords.has(tk.word)) continue;
      const r = rangeFromOffsets(map, tk.start, tk.end);
      if (r) ranges.push(r);
    }
    if (!ranges.length) return;
    try { CSS.highlights.set(HL_NAME, new Highlight(...ranges)); } catch (e) { console.warn(e); }
  }

  // ---------- contagem / limite ----------

  function scheduleCount() {
    if (!countRaf) countRaf = requestAnimationFrame(() => countNow());
  }

  function countNow() {
    countRaf = 0;
    const map = domTextMap(rt);
    committedText = map.text;
    updateCounter();
    if (committedText.length > CHAR_LIMIT) warnLimit();
  }

  function updateCounter() {
    const n = committedText.length;
    countText.textContent = fmt(n) + " / " + fmt(CHAR_LIMIT) + " caracteres";
    const pct = Math.min(100, (n / CHAR_LIMIT) * 100);
    barFill.style.width = pct + "%";
    barFill.dataset.level = pct >= 100 ? "full" : pct >= 90 ? "warn" : pct >= 60 ? "mid" : "low";
    const t = committedText.trim();
    const words = t ? t.split(/\s+/).length : 0;
    subHint.textContent = fmt(words) + (words === 1 ? " palavra" : " palavras") + " · " + (chapter && chapter.updatedAt ? "salvo " + formatDate(chapter.updatedAt) : "");
  }

  function warnLimit() {
    const now = Date.now();
    if (now - lastLimitWarn < 5000) return;
    lastLimitWarn = now;
    toast("Limite de 50.000 caracteres por capítulo atingido. Separe o texto em outro capítulo.", "error", 6500);
  }

  function wouldExceed(delta) {
    return committedText.length + delta > CHAR_LIMIT;
  }

  // ---------- barra de formatacao ----------

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const node = sel.anchorNode;
    return !!node && rt.contains(node);
  }

  function refreshToolbar() {
    const inEditor = selectionInEditor();
    for (const btn of qa(".bkT[data-cmd]", rootEl)) {
      const cmd = btn.dataset.cmd;
      let on = false;
      if (inEditor && /^(bold|italic|underline|strikeThrough|insertUnorderedList|insertOrderedList)$/.test(cmd)) {
        try { on = document.queryCommandState(cmd); } catch (e) { on = false; }
      }
      btn.classList.toggle("on", on);
    }
    let block = "";
    if (inEditor) {
      try { block = String(document.queryCommandValue("formatBlock") || "").toUpperCase(); } catch (e) { block = ""; }
    }
    for (const btn of qa(".bkT[data-block]", rootEl)) {
      btn.classList.toggle("on", !!block && btn.dataset.block === block);
    }
  }

  function exec(cmd, value) {
    rt.focus();
    try { document.execCommand(cmd, false, value == null ? null : value); } catch (e) { console.warn(e); }
    refreshToolbar();
    handleInput();
  }

  function bumpFontSize(dir) {
    rt.focus();
    const marker = dir > 0 ? "7" : "1";
    document.execCommand("styleWithCSS", false, false);
    if (!document.execCommand("fontSize", false, marker)) return;
    const fresh = qa(`font[size="${marker}"]`, rt);
    if (!fresh.length) return;
    for (const f of fresh) {
      const parent = f.parentElement || rt;
      const base = parseFloat(getComputedStyle(parent).fontSize) || 18;
      const next = Math.max(11, Math.min(44, Math.round(base * (dir > 0 ? 1.16 : 1 / 1.16))));
      const span = document.createElement("span");
      span.style.fontSize = next + "px";
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    }
    refreshToolbar();
    handleInput();
  }

  function setBlock(tag) {
    exec("formatBlock", tag);
  }

  // ---------- insercao de fichas e imagens ----------

  function insertHtmlAtCaret(html) {
    rt.focus();
    if (!selectionInEditor()) placeCaretEnd();
    try {
      document.execCommand("insertHTML", false, html);
    } catch (e) {
      console.warn(e);
    }
    for (const node of qa("span[data-ref]", rt)) {
      if (node.getAttribute("contenteditable") !== "false") node.setAttribute("contenteditable", "false");
    }
    handleInput();
  }

  async function insertEntityChip() {
    const picked = await pickEntities({
      title: "Inserir ficha no texto",
      subtitle: "A ficha vira um atalho clicável dentro do capítulo.",
      multi: false,
      confirmLabel: "Inserir",
    });
    if (!picked || !picked.length) return;
    const entity = store.getEntity(picked[0]);
    if (!entity) return;
    const nameLen = entity.name.length + 3;
    if (wouldExceed(nameLen)) { warnLimit(); return; }
    insertHtmlAtCaret(refChipHtml(entity) + "&nbsp;");
  }

  async function attachEntities() {
    if (!chapter) return;
    const picked = await pickEntities({
      title: "Anexar fichas ao capítulo",
      subtitle: "Elas ficam salvas junto do capítulo e aparecem em “Anexados” para você abrir quando quiser.",
      multi: true,
      selected: chapter.attachments,
      confirmLabel: "Anexar",
    });
    if (picked === null) return;
    book.setAttachments(chapter.id, picked);
    sideTab = "attached";
    renderSideTabs();
    renderSide();
    toast(picked.length ? fmt(picked.length) + (picked.length === 1 ? " ficha anexada" : " fichas anexadas") : "Anexos removidos", "success", 2600);
  }

  async function insertImage() {
    imgInput.value = "";
    imgInput.click();
  }

  async function handleImageFile(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast("Imagem grande demais (máximo 12 MB)", "error"); return; }
    const loading = toast("Preparando a imagem…", "info", 30000);
    let dataUrl = null;
    try {
      const raw = await readFileAsDataUrl(file);
      dataUrl = await shrinkImage(raw, 1400, 0.86);
      if (!dataUrl) dataUrl = raw;
    } catch (err) {
      console.error(err);
      toast("Não consegui ler essa imagem", "error");
      return;
    }
    let id = null;
    try {
      id = await book.putImage(dataUrl);
    } catch (err) {
      toast("Não consegui guardar a imagem", "error");
      return;
    }
    const alt = esc(file.name.replace(/\.[^.]+$/, ""));
    insertHtmlAtCaret(`<img class="bkImg" data-img="${esc(id)}" src="${dataUrl}" alt="${alt}"><p><br></p>`);
    toast("Imagem inserida", "success", 2200);
  }

  async function resolveImages() {
    const imgs = qa("img[data-img]", rt);
    for (const img of imgs) {
      if (img.getAttribute("src")) continue;
      const id = img.dataset.img;
      const src = await book.getImage(id);
      if (!img.isConnected) continue;
      if (src) img.setAttribute("src", src);
      else { img.classList.add("bkImgMissing"); img.setAttribute("alt", "imagem indisponível"); }
    }
  }

  async function imageMenu(event, img) {
    event.preventDefault();
    popupMenu(img, [
      { icon: "🔍", label: "Abrir em tamanho grande", onClick: () => { const src = img.getAttribute("src"); if (src) window.open(src, "_blank", "noopener"); } },
      { icon: "🖼️", label: "Trocar imagem…", onClick: () => swapImage(img) },
      { separator: true },
      { icon: "🗑️", label: "Remover imagem", danger: true, onClick: () => { img.remove(); handleInput(); } },
    ]);
  }

  function swapImage(img) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const raw = await readFileAsDataUrl(file);
      let dataUrl = await shrinkImage(raw, 1400, 0.86);
      if (!dataUrl) dataUrl = raw;
      const id = await book.putImage(dataUrl);
      img.setAttribute("data-img", id);
      img.setAttribute("src", dataUrl);
      handleInput();
    };
    inp.click();
  }

  // ---------- painel lateral ----------

  function renderSideTabs() {
    for (const b of qa(".bkSideTab", rootEl)) b.classList.toggle("on", b.dataset.side === sideTab);
  }

  function renderSide() {
    if (sideTab === "attached") renderAttached();
    else renderMentions();
    renderSideTabs();
  }

  function entityRow(entity, opts) {
    opts = opts || {};
    const t = store.type(entity.type);
    const row = el(`<div class="bkSideRow" data-id="${esc(entity.id)}" role="button" tabindex="0" title="Abrir a ficha de ${esc(entity.name)}">
      <span class="bkSideThumb" style="--typeColor:${esc(t.color)}"><span class="bkSideThumbIcon">${esc(t.icon)}</span></span>
      <span class="bkSideRowBody">
        <span class="bkSideRowName">${esc(entity.name)}</span>
        <span class="bkSideRowMeta">${esc(t.l)}${opts.meta ? " · " + esc(opts.meta) : ""}</span>
      </span>
      ${(RO || opts.actions === false) ? "" : `<span class="bkSideRowActs">
        <button class="iconBtn tiny" data-act="insert" title="Inserir no texto">🔗</button>
        <button class="iconBtn tiny" data-act="detach" title="Remover dos anexos">✕</button>
      </span>`}
    </div>`);
    store.getImageSrc(entity).then((src) => {
      const thumb = q(".bkSideThumb", row);
      if (src && thumb && thumb.isConnected) {
        thumb.style.backgroundImage = `url("${src}")`;
        thumb.classList.add("hasImg");
      }
    });
    row.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) {
        e.stopPropagation();
        if (act.dataset.act === "insert") {
          insertHtmlAtCaret(refChipHtml(entity) + "&nbsp;");
        } else {
          book.toggleAttachment(chapter.id, entity.id);
          renderSide();
        }
        return;
      }
      openEntity(entity.id);
    });
    return row;
  }

  function renderAttached() {
    const ids = (chapter && chapter.attachments) || [];
    const frag = document.createDocumentFragment();
    if (!ids.length) {
      frag.appendChild(el(`<p class="bkHint">Nenhuma ficha anexada ainda. Use <b>Anexar fichas</b> para ligar personagens, organizações e lugares a este capítulo — assim você os encontra sem precisar procurar.</p>`));
    } else {
      let missing = 0;
      for (const id of ids) {
        const entity = store.getEntity(id);
        if (!entity) { missing++; continue; }
        frag.appendChild(entityRow(entity, { meta: "anexada" }));
      }
      if (missing) frag.appendChild(el(`<p class="bkHint">${missing} ficha(s) anexada(s) foram excluídas.</p>`));
    }
    sideBody.replaceChildren(frag);
  }

  function renderMentions() {
    const entities = [...store.entities.values()];
    if (!entities.length) {
      sideBody.innerHTML = `<p class="bkHint">Assim que você criar fichas no Codex, os nomes citados neste capítulo aparecem aqui com um atalho.</p>`;
      return;
    }
    const hay = norm(committedText);
    if (!hay.trim()) {
      sideBody.innerHTML = `<p class="bkHint">Comece a escrever. Os nomes das suas fichas aparecem aqui automaticamente.</p>`;
      return;
    }
    const attached = new Set((chapter && chapter.attachments) || []);
    const found = [];
    for (const entity of entities) {
      const names = [entity.name, ...(entity.aliases || [])].filter(Boolean);
      let hits = 0;
      for (const name of names) {
        const needle = norm(name);
        if (needle.length < 3) continue;
        let i = hay.indexOf(needle);
        while (i !== -1) { hits++; i = hay.indexOf(needle, i + needle.length); }
      }
      if (hits) found.push({ entity, hits });
    }
    found.sort((a, b) => b.hits - a.hits);
    if (!found.length) {
      sideBody.innerHTML = `<p class="bkHint">Nenhuma ficha citada neste capítulo ainda.</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const item of found.slice(0, 40)) {
      const row = entityRow(item.entity, {
        meta: item.hits + "× no texto" + (attached.has(item.entity.id) ? " · anexada" : ""),
        actions: !attached.has(item.entity.id),
      });
      frag.appendChild(row);
    }
    if (found.length > 40) frag.appendChild(el(`<p class="bkHint">e mais ${found.length - 40}…</p>`));
    sideBody.replaceChildren(frag);
  }

  function openEntity(id) {
    if (window.codex && window.codex.setView) window.codex.setView("browse");
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id } }));
  }

  // ---------- analise ortografica ----------

  function scheduleAnalysis(delay) {
    if (RO) return;
    clearTimeout(analyzeTimer);
    if (!spellEnabled || !spell.available) { refreshSpellUI(); return; }
    analyzeTimer = setTimeout(runAnalysis, delay == null ? ANALYZE_DELAY : delay);
  }

  async function runAnalysis() {
    if (!chapter || !spellEnabled) return;
    const text = committedText;
    if (!text.trim()) {
      badWords = new Set();
      clearHighlights();
      refreshSpellUI();
      return;
    }
    const res = await spell.check(text);
    if (!chapter) return;
    if (res.stale) return;
    if (!res.ok) {
      if (spell.state === "error") { rt.spellcheck = true; rt.lang = "pt-BR"; }
      refreshSpellUI();
      return;
    }
    if (res.bad) badWords = new Set(res.bad);
    refreshSpellUI();
    applyHighlights();
    renderSide();
  }

  // ---------- sugestoes ----------

  function wordAtPoint(x, y) {
    let node = null;
    let off = 0;
    try {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r) { node = r.startContainer; off = r.startOffset; }
      } else if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p) { node = p.offsetNode; off = p.offset; }
      }
    } catch (e) { /* segue */ }
    if (!node || node.nodeType !== 3) return null;
    const map = domTextMap(rt);
    const global = globalOffsetOf(map, node, off);
    if (global < 0) return null;
    const toks = tokenize(map.text);
    for (const tk of toks) if (global >= tk.start && global <= tk.end) return tk;
    return null;
  }

  function replaceRange(start, end, text) {
    const map = domTextMap(rt);
    const r = rangeFromOffsets(map, start, end);
    if (!r) return false;
    r.deleteContents();
    const node = document.createTextNode(text);
    r.insertNode(node);
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
    return true;
  }

  async function doLearn(word) {
    await spell.learn([word]);
    badWords.delete(word);
    badWords.delete(word.toLowerCase());
    await runAnalysis();
    toast("“" + word + "” adicionada ao seu dicionário", "success");
  }

  async function doIgnore(word) {
    await spell.ignore([word]);
    badWords.delete(word);
    badWords.delete(word.toLowerCase());
    await runAnalysis();
  }

  async function addToUniverse(word) {
    const ok = await confirmDialog({
      title: "Criar ficha para “" + word + "”?",
      message: "A palavra passa a ser reconhecida pelo corretor e você pode registrá-la no seu universo como personagem, lugar ou item.",
      confirmLabel: "Criar ficha",
      cancelLabel: "Só reconhecer",
    });
    await spell.learn([word]);
    badWords.delete(word);
    badWords.delete(word.toLowerCase());
    if (ok) {
      if (window.codex && window.codex.createEntity) window.codex.createEntity("personagem", { name: word });
      else window.dispatchEvent(new CustomEvent("codex:new-entity", { detail: { type: "personagem", name: word } }));
      toast("Ficha criada — o corretor já reconhece “" + word + "”", "success");
    }
    await runAnalysis();
  }

  // ---------- vinculos de palavra ----------

  function selectionInfo() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!rt.contains(range.commonAncestorContainer)) return null;
    const text = range.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { range, text, label: text.length > 40 ? text.slice(0, 39).trimEnd() + "…" : text };
  }

  async function attachRangeToEntity(range, label) {
    if (!range || !rt.contains(range.commonAncestorContainer)) {
      toast("Não consegui localizar esse trecho agora", "error");
      return;
    }
    const entity = await pickLinkTarget({
      title: "Anexar “" + label + "” a uma ficha",
      confirmLabel: "Anexar",
    });
    if (!entity) return;
    const node = wrapRangeWithLink(range, entity, { root: rt });
    if (!node) { toast("Selecione um trecho dentro de um mesmo parágrafo", "error", 3600); return; }
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
    toast("“" + label + "” agora leva à ficha " + entity.name, "success", 2600);
  }

  function chipMenu(chip) {
    const id = chip.dataset.ref;
    const entity = store.getEntity(id);
    const isWordLink = chip.classList.contains(WORD_LINK_CLASS);
    const items = [
      { icon: "📇", label: "Abrir ficha" + (entity ? ": " + entity.name : ""), onClick: () => openEntity(id) },
      { icon: "🔗", label: "Trocar a ficha…", onClick: async () => {
        const picked = await pickLinkTarget({ title: "Trocar a ficha deste vínculo", selected: id, confirmLabel: "Trocar" });
        if (!picked) return;
        chip.dataset.ref = picked.id;
        chip.title = wordLinkTitle(picked);
        handleInput();
        toast("Vínculo agora aponta para " + picked.name, "success", 2400);
      } },
    ];
    if (isWordLink) {
      items.push({ separator: true });
      items.push({ icon: "✖", label: "Remover o vínculo (mantém a palavra)", danger: true, onClick: () => {
        chip.replaceWith(document.createTextNode(chip.textContent));
        handleInput();
      } });
    } else {
      items.push({ icon: "🔖", label: "Anexar ao capítulo", onClick: () => { book.toggleAttachment(chapter.id, id); renderSide(); } });
      items.push({ separator: true });
      items.push({ icon: "🗑️", label: "Remover do texto", danger: true, onClick: () => { chip.remove(); handleInput(); } });
    }
    popupMenu(chip, items);
  }

  async function wordMenuItems(tk) {
    const items = [];
    if (badWords.has(tk.word)) {
      const res = await spell.suggest(tk.word);
      if (res.list.length) {
        for (const s of res.list) items.push({ icon: "↳", label: s, onClick: () => replaceRange(tk.start, tk.end, s) });
      } else {
        items.push({ icon: "🤷", label: "Sem sugestões", hint: "importado?" });
      }
      items.push({ separator: true });
      items.push({ icon: "🫥", label: "Ignorar “" + tk.word + "”", hint: "neste arquivo", onClick: () => doIgnore(tk.word) });
      items.push({ icon: "📕", label: "Adicionar ao dicionário", onClick: () => doLearn(tk.word) });
      items.push({ icon: "✦", label: "Registrar no universo", onClick: () => addToUniverse(tk.word) });
      items.push({ separator: true });
    } else {
      items.push({ icon: "✅", label: tk.word, hint: "reconhecida" });
      items.push({ separator: true });
    }
    items.push({ icon: "🔗", label: "Anexar “" + tk.word + "” a uma ficha…", onClick: () => {
      const r = rangeFromOffsets(domTextMap(rt), tk.start, tk.end);
      if (!r || !r.toString().trim()) { toast("Não consegui localizar essa palavra agora", "error"); return; }
      attachRangeToEntity(r, r.toString().trim());
    } });
    items.push({ icon: "🔎", label: "Revisar todas as palavras", onClick: openReview });
    items.push({ icon: "🔗", label: "Inserir ficha aqui…", onClick: insertEntityChip });
    items.push({ icon: "🅰️", label: "Copiar palavra", onClick: () => copyText(tk.word) });
    return items;
  }

  async function openWordMenu(event) {
    const img = event.target.closest && event.target.closest("img[data-img]");
    if (img) { imageMenu(event, img); return; }
    const chip = event.target.closest && event.target.closest("span[data-ref]");
    if (chip) {
      event.preventDefault();
      chipMenu(chip);
      return;
    }
    const sel = selectionInfo();
    const tk = sel || !spellEnabled ? null : wordAtPoint(event.clientX, event.clientY);
    if (!sel && !tk) return;
    event.preventDefault();
    if (sel) {
      popupMenu(anchorAt(event), [
        { icon: "🔗", label: "Anexar “" + sel.label + "” a uma ficha…", onClick: () => attachRangeToEntity(sel.range, sel.text) },
        { icon: "🅰️", label: "Copiar trecho", onClick: () => copyText(sel.text) },
      ]);
      return;
    }
    popupMenu(anchorAt(event), await wordMenuItems(tk));
  }

  async function openReview() {
    if (!spellEnabled || !badWords.size) {
      toast("Nenhuma palavra para revisar agora", "info");
      return;
    }
    const text = committedText;
    const groups = new Map();
    for (const tk of tokenize(text)) {
      if (!badWords.has(tk.word)) continue;
      const g = groups.get(tk.word);
      if (g) { g.count++; g.last = tk; } else groups.set(tk.word, { word: tk.word, count: 1, first: tk, last: tk });
    }
    const rows = [...groups.values()].sort((a, b) => a.first.start - b.first.start);
    const body = el(`<div class="bkReview">
      <p class="bkReviewHint">Clique numa palavra para ir até ela no texto. ${rows.length > MAX_REVIEW_ROWS ? "Mostrando as primeiras " + MAX_REVIEW_ROWS + " de " + rows.length + "." : ""}</p>
      <div class="bkReviewList"></div>
    </div>`);
    const list = q(".bkReviewList", body);
    const shown = rows.slice(0, MAX_REVIEW_ROWS);
    const modal = openModal({
      title: "🔎 Revisar ortografia",
      subtitle: badWords.size + (badWords.size === 1 ? " palavra para verificar" : " palavras para verificar"),
      size: "lg",
      body,
      actions: [{ label: "Fechar", onClick: ({ close }) => close() }],
    });
    for (const row of shown) {
      const item = el(`<div class="bkReviewRow">
        <button class="bkReviewWord" title="Ir para a palavra">${esc(row.word)}<em>${row.count}×</em></button>
        <div class="bkReviewSugs"><span class="spinner tiny"></span></div>
        <div class="bkReviewActs">
          <button class="iconBtn tiny" data-act="ignore" title="Ignorar neste arquivo">🫥</button>
          <button class="iconBtn tiny" data-act="learn" title="Adicionar ao dicionário">📕</button>
        </div>
      </div>`);
      q(".bkReviewWord", item).addEventListener("click", () => { modal.close(); gotoWord(row.first); });
      q("[data-act='ignore']", item).addEventListener("click", async () => { await doIgnore(row.word); item.remove(); });
      q("[data-act='learn']", item).addEventListener("click", async () => { await doLearn(row.word); item.remove(); });
      list.appendChild(item);
      spell.suggest(row.word).then((res) => {
        const sugs = q(".bkReviewSugs", item);
        if (!sugs) return;
        sugs.replaceChildren();
        if (!res.list.length) { sugs.appendChild(el(`<span class="bkHint">sem sugestões</span>`)); return; }
        for (const s of res.list.slice(0, 5)) {
          const b = el(`<button class="bkSug">${esc(s)}</button>`);
          b.addEventListener("click", () => {
            modal.close();
            const map = domTextMap(rt);
            const fresh = seekWord(map, row.word, row.first.start);
            if (fresh) replaceRange(fresh.start, fresh.end, s);
          });
          sugs.appendChild(b);
        }
      });
    }
  }

  function seekWord(map, word, around) {
    const toks = tokenize(map.text);
    let best = null;
    for (const tk of toks) {
      if (tk.word !== word) continue;
      if (!best) best = tk;
      if (Math.abs(tk.start - around) < Math.abs(best.start - around)) best = tk;
    }
    return best;
  }

  function gotoWord(tk) {
    rt.focus();
    const map = domTextMap(rt);
    const fresh = seekWord(map, tk.word, tk.start) || tk;
    const r = rangeFromOffsets(map, fresh.start, fresh.end);
    if (!r) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    const node = r.startContainer.parentElement;
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // ---------- entrada / salvamento ----------

  function setSaveState(kind) {
    if (!saveStateEl) return;
    saveStateEl.dataset.state = kind;
    saveStateEl.textContent = kind === "saving" ? "salvando…" : kind === "saved" ? "salvo" : "";
  }

  function saveNow(force) {
    if (RO) return;
    if (!chapter) return;
    clearTimeout(saveTimer);
    const html = sanitizeHtml(stripImageSources(rt.innerHTML));
    const text = committedText || htmlToText(html);
    const nextTitle = titleInput.value.trim() || "Sem título";
    book.update(chapter.id, {
      html,
      text,
      title: nextTitle,
      moment: momentInput.value.trim(),
      attachments: chapter.attachments.slice(),
    }, { quiet: true });
    chapter.title = nextTitle;
    if (force) book.flush();
    setSaveState("saved");
  }

  function scheduleSave() {
    if (RO) return;
    setSaveState("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), SAVE_DELAY);
  }

  function handleInput() {
    scheduleCount();
    scheduleSave();
    scheduleAnalysis();
  }

  function placeCaretEnd() {
    const range = document.createRange();
    range.selectNodeContents(rt);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------- menu ----------

  function chapterFileBase() {
    return (chapter.title || "capitulo").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").toLowerCase() || "capitulo";
  }

  function exportMarkdown() {
    const plain = htmlToText(rt.innerHTML);
    const head = "# " + (chapter.title || "Sem título") + (chapter.moment ? "\n\n_" + chapter.moment + "_" : "");
    download(chapterFileBase() + ".md", head + "\n\n" + plain, "text/markdown");
    toast("Capítulo exportado (.md)", "success");
  }

  function exportTxt() {
    download(chapterFileBase() + ".txt", htmlToText(rt.innerHTML), "text/plain");
    toast("Capítulo exportado (.txt)", "success");
  }

  async function exportHtml() {
    const holder = document.createElement("div");
    holder.innerHTML = rt.innerHTML;
    for (const img of [...holder.querySelectorAll("img[data-img]")]) {
      if (img.getAttribute("src")) continue;
      const src = await book.getImage(img.dataset.img);
      if (src) img.setAttribute("src", src);
    }
    const css = "body{max-width:42rem;margin:3rem auto;padding:0 1.2rem;font:17px/1.9 Georgia,serif;color:#1c1c22;background:#fff}" +
      "h1{font-size:2rem}img{max-width:100%;border-radius:10px}.bkRef{display:inline-block;padding:1px 8px;border-radius:999px;background:#efe9ff;color:#5b3fb5;font-size:.85em}" +
      ".bkRef.wordLink{display:inline;padding:0;background:none;border-radius:0;color:#2b6cff;font-size:inherit}";
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(chapter.title || "Sem título")}</title><style>${css}</style></head><body>` +
      `<h1>${esc(chapter.title || "Sem título")}</h1>` +
      (chapter.moment ? `<p><em>${esc(chapter.moment)}</em></p>` : "") +
      holder.innerHTML + `</body></html>`;
    download(chapterFileBase() + ".html", doc, "text/html");
    toast("Página .html exportada (as imagens vão embutidas)", "success", 4000);
  }

  async function doMenu(event) {
    popupMenu(event.currentTarget, [
      { icon: "💾", label: "Salvar agora", hint: "Ctrl+S", onClick: () => { saveNow(true); toast("Capítulo salvo", "success", 1600); } },
      { icon: "💾", label: "Salvar e sair", onClick: () => close() },
      { icon: "🆕", label: "Salvar e criar outro capítulo", onClick: () => { saveNow(true); close(true); host.dispatchEvent(new CustomEvent("bk:new-chapter", { bubbles: true })); } },
      { separator: true },
      { icon: "⤓", label: "Exportar .md", onClick: exportMarkdown },
      { icon: "⤓", label: "Exportar .txt", onClick: exportTxt },
      { icon: "🌐", label: "Exportar página .html", onClick: () => exportHtml() },
      { icon: "📋", label: "Copiar o texto", onClick: () => copyText(htmlToText(rt.innerHTML)).then(() => toast("Texto copiado", "success")) },
      { separator: true },
      { icon: "🔖", label: "Anexar fichas…", onClick: attachEntities },
      { icon: "🔗", label: "Anexar a seleção a uma ficha…", hint: "clique direito numa palavra", onClick: () => {
        const sel = selectionInfo();
        if (!sel) { toast("Selecione uma palavra ou um trecho no texto primeiro", "info", 4200); return; }
        attachRangeToEntity(sel.range, sel.text);
      } },
      { icon: "⏳", label: "Criar evento na Timeline", hint: "ligado a este capítulo", onClick: () => {
        openEventEditor({ title: chapter.title, date: chapter.moment, chapterId: chapter.id, description: htmlToText(rt.innerHTML).slice(0, 400) });
      } },
      { separator: true },
      { icon: "🧹", label: "Limpar espaços duplicados", onClick: () => {
        const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT);
        let node;
        let changed = 0;
        while ((node = walker.nextNode())) {
          const before = node.data;
          const after = before.replace(/[ \t]{2,}/g, " ");
          if (after !== before) { node.data = after; changed += before.length - after.length; }
        }
        handleInput();
        toast(changed ? "Removidos " + fmt(changed) + " caracteres repetidos" : "Nada para limpar", changed ? "success" : "info");
      } },
      { icon: "📄", label: "Duplicar capítulo", onClick: async () => {
        saveNow(true);
        const copy = await book.duplicate(chapter.id);
        if (copy) { toast("Capítulo duplicado", "success"); host.dispatchEvent(new CustomEvent("bk:list-changed", { bubbles: true })); open(copy.id); }
      } },
      { icon: "🖨️", label: "Contar palavras e páginas", onClick: () => {
        const t = committedText.trim();
        const words = t ? t.split(/\s+/).length : 0;
        const pages = Math.max(1, Math.ceil(words / 250));
        toast(fmt(words) + " palavras · cerca de " + fmt(pages) + (pages === 1 ? " página" : " páginas") + " impressas", "info", 5200);
      } },
      { separator: true },
      { icon: "🗑️", label: "Apagar capítulo", danger: true, onClick: async () => {
        const ok = await confirmDialog({
          title: "Apagar “" + (chapter.title || "Sem título") + "”?",
          message: "O texto deste capítulo será removido para sempre.",
          confirmLabel: "Apagar",
          danger: true,
        });
        if (!ok) return;
        book.remove(chapter.id);
        host.dispatchEvent(new CustomEvent("bk:list-changed", { bubbles: true }));
        close(true);
        toast("Capítulo apagado", "success");
      } },
    ], { alignRight: true });
  }

  // ---------- eventos ----------

  function bindOnce() {
    q("[data-act='back']", rootEl).addEventListener("click", () => close());
    q("[data-act='exit']", rootEl).addEventListener("click", () => close());
    q("[data-act='menu']", rootEl).addEventListener("click", doMenu);
    for (const b of qa("[data-act='attach']", rootEl)) b.addEventListener("click", attachEntities);
    q("[data-act='insert-entity']", rootEl).addEventListener("click", insertEntityChip);
    q("[data-act='insert-image']", rootEl).addEventListener("click", insertImage);

    qa(".bkSideTab", rootEl).forEach((b) => {
      b.addEventListener("click", () => { sideTab = b.dataset.side; renderSide(); });
    });

    const tools = q(".bkTools", rootEl);
    tools.addEventListener("mousedown", (e) => { if (e.target.closest(".bkT")) e.preventDefault(); });
    tools.addEventListener("click", (e) => {
      const btn = e.target.closest(".bkT");
      if (!btn) return;
      if (btn.dataset.cmd) exec(btn.dataset.cmd);
      else if (btn.dataset.size) bumpFontSize(Number(btn.dataset.size));
      else if (btn.dataset.block) setBlock(btn.dataset.block);
    });

    reviewBtn.addEventListener("click", openReview);
    spellBtn.addEventListener("click", () => {
      spellEnabled = !spellEnabled;
      if (spellEnabled) {
        rt.spellcheck = false;
        ensureSpell();
        refreshSpellUI();
        scheduleAnalysis(60);
      } else {
        rt.spellcheck = false;
        badWords = new Set();
        clearHighlights();
        refreshSpellUI();
      }
    });

    rt.addEventListener("input", () => handleInput());
    rt.addEventListener("keyup", () => { refreshToolbar(); scheduleCount(); });
    rt.addEventListener("mouseup", () => refreshToolbar());
    rt.addEventListener("contextmenu", openWordMenu);
    rt.addEventListener("beforeinput", (e) => {
      const type = e.inputType || "";
      let add = 0;
      if (type === "insertText" || type === "insertCompositionText") add = (e.data || "").length;
      else if (type === "insertParagraph" || type === "insertLineBreak") add = 1;
      else if (type === "insertFromPaste" || type === "insertFromDrop") add = 400;
      if (add && wouldExceed(add)) { e.preventDefault(); warnLimit(); }
    });
    rt.addEventListener("paste", (e) => {
      e.preventDefault();
      let text = "";
      try { text = (e.clipboardData || window.clipboardData).getData("text/plain") || ""; } catch (err) { text = ""; }
      if (!text) return;
      const room = CHAR_LIMIT - committedText.length;
      if (room <= 0) { warnLimit(); return; }
      let clipped = false;
      if (text.length > room) { text = text.slice(0, room); clipped = true; }
      const html = text.replace(/\r\n?/g, "\n").split(/\n{2,}/)
        .map((p) => "<p>" + p.split("\n").map(esc).join("<br>") + "</p>").join("") || "";
      if (html) document.execCommand("insertHTML", false, html);
      if (clipped) toast("O texto colado foi cortado no limite de 50.000 caracteres", "error", 6000);
      handleInput();
    });
    rt.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow(true);
        toast("Capítulo salvo", "success", 1600);
      }
    });
    rt.addEventListener("blur", () => saveNow(false));
    rt.addEventListener("click", (e) => {
      const chip = e.target.closest && e.target.closest("span[data-ref]");
      if (chip) { openEntity(chip.dataset.ref); return; }
    });

    document.addEventListener("selectionchange", () => {
      if (!chapter) return;
      if (selectionInEditor()) refreshToolbar();
    });

    imgInput.addEventListener("change", () => {
      const file = imgInput.files && imgInput.files[0];
      imgInput.value = "";
      if (file) handleImageFile(file);
    });

    let titleTimer = null;
    const touchTitle = () => {
      setSaveState("saving");
      clearTimeout(titleTimer);
      titleTimer = setTimeout(() => saveNow(false), SAVE_DELAY);
    };
    titleInput.addEventListener("input", touchTitle);
    titleInput.addEventListener("blur", () => saveNow(false));
    momentInput.addEventListener("input", touchTitle);
    momentInput.addEventListener("blur", () => saveNow(false));
    ready = true;
  }

  async function open(id) {
    const c = book.get(id);
    if (!c) return null;
    if (chapter && chapter.id !== id) saveNow(false);
    clearTimeout(analyzeTimer);
    clearTimeout(saveTimer);
    chapter = c;
    titleInput.value = c.title || "";
    momentInput.value = c.moment || "";
    rt.innerHTML = c.html || "";
    for (const span of qa("span[data-ref]", rt)) span.setAttribute("contenteditable", "false");
    host.hidden = false;
    committedText = c.text || htmlToText(c.html || "");
    badWords = new Set();
    updateCounter();
    applyHighlights();
    renderSide();
    if (!RO) {
      ensureSpell();
      refreshSpellUI();
      setSaveState("");
      countNow();
      await resolveImages();
      scheduleAnalysis(300);
      setTimeout(() => { rt.focus(); placeCaretEnd(); }, 30);
      return c;
    }
    await resolveImages();
    return c;
  }

  function close(skipSave) {
    if (!skipSave) saveNow(true);
    clearTimeout(analyzeTimer);
    clearHighlights();
    chapter = null;
    host.hidden = true;
    host.dispatchEvent(new CustomEvent("bk:closed", { bubbles: true }));
  }

  function refresh() {
    if (chapter) saveNow(false);
  }

  function currentId() {
    return chapter ? chapter.id : null;
  }

  bindOnce();

  return {
    open,
    close,
    refresh,
    currentId,
    get chapter() { return chapter; },
  };
}
