// Seletor de fichas do universo (usado pelo Livro e pela Timeline) e o "chip"
// clicavel que representa uma ficha dentro de um texto ou cartao.

import { q, qa, el, openModal } from "./dom.js";
import { store } from "../store.js";
import { esc, initials, norm } from "../util.js";

export function entityChipHtml(entity, opts) {
  opts = opts || {};
  const t = store.type(entity.type);
  const label = opts.label || entity.name;
  const cls = "entChip" + (opts.small ? " small" : "");
  return `<button class="${cls}" data-goto="${esc(entity.id)}" title="${esc(t.l)}: ${esc(entity.name)}" style="--typeColor:${esc(t.color)}">` +
    `<span class="entChipIcon">${esc(t.icon)}</span><span class="entChipName">${esc(label)}</span></button>`;
}

export function pickEntities(opts) {
  opts = opts || {};
  const multi = opts.multi !== false;
  const selected = new Set((opts.selected || []).filter(Boolean));
  let term = "";
  let typeFilter = "";

  const body = el(`<div class="pick">
    <div class="pickTop">
      <input class="input pickSearch" type="search" placeholder="Buscar ficha por nome, apelido ou etiqueta…" autocomplete="off" spellcheck="false">
      <div class="pickTypes"></div>
    </div>
    <div class="pickList"></div>
    <p class="pickHint"></p>
  </div>`);

  const searchInput = q(".pickSearch", body);
  const typesEl = q(".pickTypes", body);
  const listEl = q(".pickList", body);
  const hintEl = q(".pickHint", body);

  const results = () => {
    let list = store.allEntities();
    if (typeFilter) list = list.filter((e) => e.type === typeFilter);
    if (term) {
      const nq = norm(term);
      list = list.filter((e) => {
        if (norm(e.name).includes(nq)) return true;
        if ((e.aliases || []).some((a) => norm(a).includes(nq))) return true;
        if ((e.tags || []).some((t) => norm(t).includes(nq))) return true;
        return norm(e.summary || "").includes(nq);
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  };

  function renderTypes() {
    const counts = new Map();
    for (const e of store.allEntities()) counts.set(e.type, (counts.get(e.type) || 0) + 1);
    const chip = (id, label, n) =>
      `<button class="pickType ${typeFilter === id ? "on" : ""}" data-type="${esc(id)}">${esc(label)} <b>${n}</b></button>`;
    typesEl.innerHTML = chip("", "Todas", store.entities.size) +
      store.types().filter((t) => counts.get(t.id)).map((t) => chip(t.id, t.icon + " " + t.l, counts.get(t.id))).join("");
    qa(".pickType", typesEl).forEach((b) => {
      b.onclick = () => { typeFilter = b.dataset.type; renderTypes(); renderList(); };
    });
  }

  function renderList() {
    const list = results();
    if (!list.length) {
      listEl.innerHTML = store.entities.size
        ? `<p class="bkHint">Nenhuma ficha corresponde a esse filtro.</p>`
        : `<p class="bkHint">Você ainda não criou fichas. Crie uma em <b>Fichas → + Nova</b> e ela aparece aqui para anexar.</p>`;
      updateHint();
      return;
    }
    const frag = document.createDocumentFragment();
    for (const entity of list.slice(0, 400)) {
      const t = store.type(entity.type);
      const on = selected.has(entity.id);
      const row = el(`<button class="pickRow ${on ? "on" : ""}" data-id="${esc(entity.id)}">
        <span class="pickThumb" style="--typeColor:${esc(t.color)}"><span class="pickThumbIcon">${esc(t.icon)}</span></span>
        <span class="pickBody">
          <span class="pickName">${esc(entity.name)}</span>
          <span class="pickMeta">${esc(t.l)}${(entity.aliases || []).length ? " · " + esc((entity.aliases || []).slice(0, 3).join(", ")) : ""}${entity.summary ? " · " + esc(String(entity.summary).slice(0, 60)) : ""}</span>
        </span>
        <span class="pickCheck">${on ? "✓" : ""}</span>
      </button>`);
      loadThumb(entity, q(".pickThumb", row));
      row.onclick = () => {
        if (!multi) {
          selected.clear();
          selected.add(entity.id);
        } else if (selected.has(entity.id)) selected.delete(entity.id);
        else selected.add(entity.id);
        renderList();
      };
      frag.appendChild(row);
    }
    if (list.length > 400) frag.appendChild(el(`<p class="bkHint">Mostrando 400 de ${list.length}. Refine a busca.</p>`));
    listEl.replaceChildren(frag);
    updateHint();
  }

  async function loadThumb(entity, node) {
    const src = await store.getImageSrc(entity);
    if (!src || !node.isConnected) return;
    node.style.backgroundImage = `url("${src}")`;
    node.classList.add("hasImg");
  }

  function updateHint() {
    if (!multi) { hintEl.textContent = "Escolha uma ficha."; return; }
    hintEl.textContent = selected.size
      ? selected.size + (selected.size === 1 ? " ficha selecionada" : " fichas selecionadas")
      : "Toque nas fichas para selecionar. Elas ficarão ligadas a este capítulo.";
  }

  searchInput.addEventListener("input", () => { term = searchInput.value.trim(); renderList(); });

  let settle = null;
  const promise = new Promise((res) => { settle = res; });
  function resolveWith(cancelled) {
    if (!settle) return;
    const fn = settle;
    settle = null;
    fn(cancelled ? null : [...selected]);
  }

  openModal({
    title: opts.title || "Anexar fichas",
    subtitle: opts.subtitle || "Personagens, organizações, lugares, itens…",
    size: "md",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => { resolveWith(true); close(); } },
      { label: opts.confirmLabel || (multi ? "Pronto" : "Escolher"), kind: "primary", onClick: ({ close }) => { resolveWith(); close(); } },
    ],
    onClose: () => { resolveWith(true); },
  });

  renderTypes();
  renderList();
  setTimeout(() => searchInput.focus(), 60);
  return promise;
}
