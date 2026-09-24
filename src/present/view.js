// Apresentação: a página de entrada de um Codex.
//
// É onde o mundo se apresenta: nome, símbolo, gêneros, o texto "Sobre o que é
// este mundo?", a imagem de capa (a mesma que aparece na miniatura do card na
// Biblioteca), o interruptor geral da inteligência, a caixa de perguntas
// ("O que você quer saber?") e a grade de números do Codex.
//
// A capa mora na pasta `codex` do próprio Codex (chave "cover"), então viaja no
// export/duplicar sem trabalho extra — ver universe.js.

import { q, el, toast, popupMenu, promptDialog } from "../ui/dom.js";
import { esc, formatDate, renderRich, truncate, shrinkImage, buildNameRegex } from "../util.js";
import { store } from "../store.js";
import { universes, DEFAULT_EMOJI } from "../universe.js";
import { book } from "../book/store.js";
import { timeline } from "../timeline/store.js";
import { state, setUI, savePrefs } from "../ui/state.js";
import { openImageZoom } from "../ui/lightbox.js";
import { openEditFlow, openUniverseLibrary } from "../ui/universes.js";
import * as ai from "../ai.js";
import { VIEW } from "../view.js";

let instance = null;

export function initPresentView() {
  if (instance) return instance;
  const host = q("#presentView");
  if (!host) return null;
  instance = createPresentView(host);
  return instance;
}

const refTitle = (entity) => store.type(entity.type).l + ": " + entity.name;

// Num Codex publicado só a leitura existe: não há interruptor para ligar, então
// a caixa de perguntas depende apenas de o plugin estar disponível na página.
function askEnabled() {
  return VIEW.active ? ai.available() : ai.enabled();
}

function fmtDate(ts) {
  return ts ? formatDate(ts) : "—";
}

function createPresentView(host) {
  let streaming = false;
  let askPromise = null;
  let reqId = 0;
  let draft = "";
  let answerQuestion = "";
  let answerText = "";

  // ------------------------------------------------------------------ grade

  function statCards() {
    const stats = store.stats();
    const cards = store.types().map((t) => ({
      icon: t.icon || "📄",
      label: t.p || t.l + "s",
      value: stats.byType[t.id] || 0,
      color: t.color || null,
      typeId: t.id,
    }));
    const chapters = book.list().length;
    const events = timeline.list().length;
    cards.push({ icon: "📖", label: "Capítulos", value: chapters });
    cards.push({ icon: "🕸️", label: "Relações", value: stats.relations });
    cards.push({ icon: "⏳", label: "Timeline", value: events, note: "Cronologia dos acontecimentos" });
    return cards;
  }

  function statsHtml() {
    return statCards()
      .map(
        (c) => `<button class="prStat" data-stat="${esc(c.typeId || c.label)}"${c.typeId ? "" : ` data-goto="${esc(gotoOf(c.label))}"`}>
          ${c.color ? `<span class="prStatDot" style="background:${esc(c.color)}"></span>` : ""}
          <span class="prStatBody">
            <span class="prStatLabel">${esc(c.label)}</span>
            <span class="prStatValue">${c.value}</span>
            ${c.note ? `<span class="prStatNote">${esc(c.note)}</span>` : ""}
          </span>
          <span class="prStatIcon">${c.icon}</span>
        </button>`
      )
      .join("");
  }

  function gotoOf(label) {
    if (label === "Capítulos") return "book";
    if (label === "Relações") return "graph";
    if (label === "Timeline") return "timeline";
    return "browse";
  }

  // ------------------------------------------------------------------ HTML

  function headHtml(u) {
    const chips = (u.genero || []).map((g) => `<span class="uniChip">${esc(g)}</span>`).join("");
    const created = u.criadoEm ? "criado em " + fmtDate(u.criadoEm) : "";
    const updated = u.atualizadoEm ? "atualizado em " + fmtDate(u.atualizadoEm) : "";
    const meta = [created, updated].filter(Boolean).join(" · ");
    return `<header class="prHead">
      <div class="prHeadText">
        <p class="prEyebrow">Apresentação</p>
        <h1 class="prTitle"><span class="prTitleMark">${esc(u.emoji || DEFAULT_EMOJI)}</span><span class="prTitleName">${esc(u.nome)}</span></h1>
        ${chips ? `<div class="uniGenres prGenres">${chips}</div>` : ""}
        ${meta ? `<p class="prMeta">${esc(meta)}</p>` : ""}
      </div>
      <div class="prHeadActions">
        <button class="btn" data-pr="edit" title="Nome, símbolo, gêneros e o texto do mundo">✏️ Editar</button>
        <button class="btn" data-pr="library" title="Biblioteca de Codexs">🌍 Codexs</button>
      </div>
    </header>`;
  }

  function aboutHtml(u) {
    if (!u.resumo) {
      return `<section class="prAbout prAboutEmpty">
        <p class="prAboutHint">Este Codex ainda não tem apresentação. Escreva, em até 2000 caracteres, sobre o que é este mundo — a premissa, o tom, quem manda, o que está em jogo.</p>
        <button class="btn" data-pr="edit">✏️ Escrever a apresentação</button>
      </section>`;
    }
    const regex = state.mentionHighlight ? buildNameRegex(store.mentionNames()) : null;
    const html = renderRich(u.resumo, {
      resolveName: (n) => store.resolveName(n),
      mentionRegex: regex,
      mentionExclude: null,
      refTitle,
    });
    return `<section class="prAbout"><div class="richText prAboutText">${html}</div></section>`;
  }

  function coverHtml(u) {
    const cover = universes.cover(u.id);
    if (!cover) {
      return `<section class="prCover prCoverEmpty">
        <button class="prCoverAdd" data-pr="cover">🖼 Adicionar capa</button>
        <p class="prCoverHint">Uma arte panorâmica que representa o mundo. Ela também vira a miniatura deste Codex na Biblioteca.</p>
      </section>`;
    }
    return `<section class="prCover" data-pr="zoom">
      <img class="prCoverImg" src="${esc(cover)}" alt="Capa de ${esc(u.nome)}">
      <div class="prCoverTools">
        <button class="btn prCoverBtn" data-pr="cover" title="Trocar a capa">🖼 Trocar capa</button>
        <button class="iconBtn prCoverDel" data-pr="cover-remove" title="Remover capa">🗑</button>
      </div>
    </section>`;
  }

  function aiHtml() {
    const on = ai.enabled();
    const available = ai.available();
    return `<section class="prAi${on ? " on" : ""}">
      <label class="prAiRow">
        <span class="prSwitch">
          <input type="checkbox" id="prAiInput" ${on ? "checked" : ""}${available ? "" : " disabled"}>
          <span class="prSwitchTrack"><span class="prSwitchKnob"></span></span>
        </span>
        <span class="prAiText">
          <strong>Usar inteligência neste Codex</strong>
          <em>Extrair fichas de um texto, sugerir conexões, enriquecer fichas, descrever imagens, gerar retratos e responder sobre o mundo.</em>
        </span>
        <span class="prAiBadge">${on ? "ligada" : "desligada"}</span>
      </label>
      <p class="prAiHint">${available
        ? (on ? "Tudo pronto: as ferramentas ✨ estão ativas neste Codex." : "Nada de IA vai rodar neste Codex até você ligar de novo.")
        : "O plugin de IA não está disponível nesta página, então o interruptor fica desativado."}</p>
    </section>`;
  }

  function askHtml() {
    const on = askEnabled();
    return `<form class="prAsk" data-pr="ask">
      <span class="prAskMark">✦</span>
      <div class="prAskField">
        <input class="prAskInput" id="prAskInput" autocomplete="off" spellcheck="true"
          placeholder="${on ? "O que você quer saber?" : "Ligue a inteligência acima para perguntar"}"
          ${on ? "" : "disabled"}>
        <p class="prAskHint">${VIEW.active
          ? "Pergunte sobre este Codex publicado — a resposta é gerada só para você, nada aqui altera o original."
          : "Pergunte ao seu universo e verifique a coerência da história."}</p>
      </div>
      <button class="prAskGo" type="submit" title="Perguntar"${on ? "" : " disabled"}>➜</button>
    </form>`;
  }

  function answerHtml() {
    const idle = !answerQuestion && !streaming;
    return `<section class="prAnswer"${idle ? " hidden" : ""}>
      <header class="prAnswerHead">
        <span class="prAnswerQ"><span class="prAnswerMark">✦</span>${esc(answerQuestion)}</span>
        <button class="iconBtn" data-pr="answer-close" title="Fechar a resposta">✕</button>
      </header>
      <div class="prAnswerBody"></div>
      <footer class="prAnswerFoot">
        <span class="prAnswerState"></span>
        <button class="btn" data-pr="stop" hidden>⏹ Parar</button>
      </footer>
    </section>`;
  }

  // IA fora da tela a pedido do usuário (17/09/2026): as três seções abaixo
  // (interruptor, caixa de perguntas e painel de resposta) não entram no
  // layout. Para voltar, é só chamá-las de novo dentro do html().
  function html() {
    const u = universes.active();
    if (!u) return `<div class="prPane"><p class="prEmpty">Nenhum Codex aberto.</p></div>`;
    return `<div class="prPane">
      ${headHtml(u)}
      ${aboutHtml(u)}
      ${coverHtml(u)}
      <section class="prStats">
        <h2 class="prStatsTitle">O que tem neste Codex</h2>
        <div class="prGrid">${statsHtml()}</div>
        <p class="prStatsHint">Clique num número para abrir aquela parte do Codex.</p>
      </section>
    </div>`;
  }

  // ----------------------------------------------------------------- wiring

  function answerBody() {
    return host.querySelector(".prAnswerBody");
  }
  function answerCtn() {
    return host.querySelector(".prAnswer");
  }

  function paintStream(full) {
    const body = answerBody();
    if (!body) return;
    body.innerHTML = `<p class="prAnswerStream">${esc(full)}<span class="prCaret"></span></p>`;
  }

  function paintFinal(text) {
    const body = answerBody();
    if (!body) return;
    const regex = state.mentionHighlight ? buildNameRegex(store.mentionNames()) : null;
    const trimmed = String(text || "").trim();
    body.innerHTML = trimmed
      ? `<div class="prAnswerRich">${renderRich(trimmed, { resolveName: (n) => store.resolveName(n), mentionRegex: regex, mentionExclude: null, refTitle })}</div>`
      : `<p class="prAnswerHint">A resposta veio vazia. Tente reformular a pergunta.</p>`;
  }

  function setAnswerState(text) {
    const s = host.querySelector(".prAnswerState");
    if (s) s.textContent = text || "";
  }

  function openAnswer(question) {
    answerQuestion = question;
    answerText = "";
    const ctn = answerCtn();
    if (ctn) {
      ctn.hidden = false;
      const head = ctn.querySelector(".prAnswerQ");
      if (head) head.innerHTML = `<span class="prAnswerMark">✦</span>${esc(question)}`;
    }
  }

  function closeAnswer() {
    if (askPromise && typeof askPromise.stop === "function") {
      try { askPromise.stop(); } catch (err) { /* já terminou */ }
    }
    reqId++;
    streaming = false;
    askPromise = null;
    answerQuestion = "";
    answerText = "";
    const ctn = answerCtn();
    if (ctn) { ctn.hidden = true; const b = answerBody(); if (b) b.innerHTML = ""; }
  }

  async function ask(question) {
    const qtext = String(question || "").trim();
    if (!qtext) return;
    if (!ai.available()) return toast("O plugin de IA não está disponível nesta página.", "error", 4500);
    if (!askEnabled()) return toast(ai.AI_OFF_MESSAGE, "error", 5200);

    if (streaming) closeAnswer();
    draft = "";
    openAnswer(qtext);
    streaming = true;
    const myReq = ++reqId;

    const ctn = answerCtn();
    if (ctn && ctn.scrollIntoView) {
      try { ctn.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (err) { /* ignora */ }
    }

    const stopBtn = host.querySelector("[data-pr='stop']");
    if (stopBtn) stopBtn.hidden = false;
    const body = answerBody();
    if (body) {
      body.innerHTML = `<div class="prAnswerLoading"><span class="spinner ai"></span><p>Consultando o seu Codex…</p></div>`;
    }
    setAnswerState("lendo fichas, relações, capítulos e timeline…");

    try {
      askPromise = ai.askWorld(qtext, {
        onChunk: (chunk, full) => {
          if (myReq !== reqId) return;
          answerText = full;
          if (full) {
            setAnswerState("escrevendo…");
            paintStream(full);
          }
        },
      });
      const res = await askPromise;
      if (myReq !== reqId) return;
      const finalText = (res && (res.liveResponseText || res.text)) || answerText;
      answerText = finalText;
      paintFinal(finalText);
      setAnswerState("");
    } catch (err) {
      if (myReq !== reqId) return;
      const msg = (err && err.message) || "Não consegui responder agora.";
      if (body) {
        body.innerHTML = `<p class="prAnswerError">${esc(msg)}</p>
          <div class="prAnswerRetry"><button class="btn" data-pr="retry">↻ Tentar de novo</button></div>`;
        const retry = body.querySelector("[data-pr='retry']");
        if (retry) retry.onclick = () => ask(qtext);
      }
      setAnswerState("");
    } finally {
      if (myReq === reqId) {
        streaming = false;
        askPromise = null;
        if (stopBtn) stopBtn.hidden = true;
      }
    }
  }

  // ------------------------------------------------------------------- capa

  async function applyCover(dataUrl) {
    const u = universes.active();
    if (!u) return;
    const saved = await universes.setCover(u.id, dataUrl);
    if (!saved) return toast("Não consegui salvar a capa", "error", 4200);
    toast("Capa salva", "success", 2400);
    render();
  }

  function pickCoverFile() {
    const input = el('<input type="file" accept="image/*" style="position:fixed;left:-9999px">');
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const dataUrl = await shrinkImage(file, 1600, 0.86);
      if (!dataUrl) return toast("Não consegui ler esta imagem", "error", 4200);
      await applyCover(dataUrl);
    };
    input.click();
  }

  async function coverFromLink() {
    const url = await promptDialog({
      title: "🖼 Capa de um link",
      label: "Endereço da imagem",
      placeholder: "https://…/imagem.jpg",
      hint: "A imagem é copiada para o seu Codex quando o site permite; senão, o link fica guardado como capa.",
      confirmLabel: "Usar esta imagem",
    });
    if (!url) return;
    const trimmed = String(url).trim();
    if (!/^https?:\/\//i.test(trimmed)) return toast("Cole um endereço começando com http:// ou https://", "error", 4200);
    const dataUrl = await shrinkImage(trimmed, 1600, 0.86);
    await applyCover(dataUrl || trimmed);
  }

  async function coverFromAi(anchor) {
    if (!ai.available()) return toast("O gerador de imagens não está disponível nesta página.", "error", 4200);
    if (!ai.enabled()) return toast(ai.AI_OFF_MESSAGE, "error", 5200);
    const u = universes.active();
    if (!u) return;
    const genres = (u.genero || []).length ? " (" + u.genero.join(", ") + ")" : "";
    const prompt =
      `Ilustração panorâmica de capa para um mundo de ficção${genres} chamado "${u.nome}". ` +
      (u.resumo ? truncate(u.resumo.replace(/\s+/g, " "), 500) + " " : "") +
      "Arte atmosférica cinematográfica, paisagem ampla, profundidade, luz marcante. Sem texto, sem letras, sem molduras, sem marca d'água.";
    const coverEl = host.querySelector(".prCover");
    if (coverEl) {
      coverEl.className = "prCover prCoverEmpty loading";
      coverEl.innerHTML = `<span class="spinner ai"></span><p class="prCoverHint">Gerando a capa do seu mundo…</p>`;
    }
    try {
      const res = await root.generateImage(prompt, { resolution: "768x512" });
      const dataUrl = res && (res.dataUrl || res.dataURL || res.url);
      if (!dataUrl) throw new Error("resposta sem imagem");
      await applyCover(dataUrl);
    } catch (err) {
      toast("Não consegui gerar a capa: " + ((err && err.message) || "erro"), "error", 5000);
      render();
    }
  }

  function coverMenu(anchor) {
    const u = universes.active();
    const items = [
      { icon: "⬆️", label: "Enviar do dispositivo", onClick: () => pickCoverFile() },
      { icon: "🔗", label: "De um link", onClick: () => coverFromLink() },
    ];
    if (universes.cover(u.id)) items.push({ separator: true }, { icon: "🗑", label: "Remover capa", danger: true, onClick: () => removeCover() });
    popupMenu(anchor, items, { alignRight: true });
  }

  async function removeCover() {
    const u = universes.active();
    if (!u) return;
    await universes.setCover(u.id, null);
    toast("Capa removida", "info", 2400);
    render();
  }

  function zoomCover() {
    const u = universes.active();
    const src = universes.cover(u.id);
    if (!src) return;
    openImageZoom({
      images: [{ id: "cover", src, label: "Capa" }],
      index: 0,
      title: u.emoji + " " + u.nome,
      subtitle: "Capa do Codex",
      actions: [
        { icon: "🖼", label: "Trocar capa", title: "Trocar capa", onClick: ({ close }) => { close(); pickCoverFile(); } },
      ],
    });
  }

  // ----------------------------------------------------------------- wiring

  function goToType(typeId) {
    setUI({ typeFilters: new Set([typeId]), folderId: null, entityId: null });
    savePrefs();
    window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
    window.dispatchEvent(new CustomEvent("codex:view", { detail: { view: "browse" } }));
  }

  function wire() {
    const u = universes.active();
    if (!u) return;
    for (const btn of host.querySelectorAll("[data-pr]")) {
      const action = btn.dataset.pr;
      if (action === "edit") btn.onclick = () => openEditFlow(u.id, { onSaved: () => render() });
      else if (action === "library") btn.onclick = () => openUniverseLibrary();
      else if (action === "cover") btn.onclick = () => coverMenu(btn);
      else if (action === "cover-remove") btn.onclick = () => removeCover();
      else if (action === "zoom") btn.onclick = (e) => { if (!e.target.closest("button")) zoomCover(); };
      else if (action === "stop") btn.onclick = () => { if (askPromise && askPromise.stop) askPromise.stop(); setAnswerState("interrompido."); };
      else if (action === "answer-close") btn.onclick = () => closeAnswer();
    }

    const input = host.querySelector("#prAskInput");
    if (input) {
      input.value = draft;
      input.oninput = () => { draft = input.value; };
    }

    const form = host.querySelector("[data-pr='ask']");
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const value = input ? input.value : "";
        if (input) input.value = "";
        draft = "";
        ask(value);
      };
    }

    const toggle = host.querySelector("#prAiInput");
    if (toggle) {
      toggle.onchange = () => {
        store.setSetting("aiEnabled", toggle.checked);
        toast(toggle.checked ? "Inteligência ligada neste Codex" : "Inteligência desligada neste Codex", "info", 2600);
        render();
      };
    }

    for (const card of host.querySelectorAll(".prStat")) {
      card.onclick = () => {
        if (card.dataset.stat && card.dataset.stat !== "undefined" && card.dataset.goto === undefined) {
          goToType(card.dataset.stat);
        } else {
          const view = card.dataset.goto || "browse";
          if (view === "browse") goToType(null);
          else window.dispatchEvent(new CustomEvent("codex:view", { detail: { view } }));
        }
      };
    }
  }

  // ------------------------------------------------------------------ ciclo

  function render() {
    if (!universes.active()) return;
    const keepQuestion = answerQuestion;
    const wasStreaming = streaming;
    const keepText = answerText;
    host.innerHTML = html();
    wire();
    if (keepQuestion || wasStreaming) {
      answerQuestion = keepQuestion;
      answerText = keepText;
      const ctn = answerCtn();
      if (ctn && (keepText || wasStreaming)) {
        ctn.hidden = false;
        const head = ctn.querySelector(".prAnswerQ");
        if (head) head.innerHTML = `<span class="prAnswerMark">✦</span>${esc(keepQuestion)}`;
        if (wasStreaming) {
          streaming = true;
          const stopBtn = host.querySelector("[data-pr='stop']");
          if (stopBtn) stopBtn.hidden = false;
          setAnswerState("escrevendo…");
          paintStream(keepText);
        } else {
          paintFinal(keepText);
        }
      }
    }
  }

  render();

  return {
    show() {
      render();
    },
    hide() {},
    refresh() {
      if (streaming) return;
      if (host.hidden) return;
      render();
    },
    ask,
    get streaming() {
      return streaming;
    },
  };
}
