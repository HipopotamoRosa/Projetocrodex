import { store } from "../store.js";
import { q, qa, el, toast, openModal, promptDialog, popupMenu, confirmDialog } from "./dom.js";
import { esc, shrinkImage } from "../util.js";
import { openImageZoom } from "./lightbox.js";
import { VIEW } from "../view.js";

const DEFAULT_TIPOS = ["Retrato", "Corpo inteiro", "Expressões", "Traje", "Combate", "Alternativo", "Cenário"];
const DEFAULT_MAX = 9;

export function imageTipos() {
  try {
    const node = root.codex && root.codex.imageTipos;
    if (node && node.selectAll) {
      const list = node.selectAll.map((x) => String(x.evaluateItem || "").trim()).filter(Boolean);
      if (list.length) return list;
    }
  } catch (err) { /* usa os padrões */ }
  return DEFAULT_TIPOS.slice();
}

export function maxImagens() {
  try {
    const node = root.codex && root.codex.maxImagensPorFicha;
    const n = Number(node && node.evaluateItem != null ? node.evaluateItem : node);
    if (n > 0) return n;
  } catch (err) { /* usa o padrão */ }
  return DEFAULT_MAX;
}

export function canAddImage(entity) {
  if (store.images(entity).length < maxImagens()) return true;
  toast(`Limite de ${maxImagens()} imagens por ficha. Remova uma para adicionar outra.`, "error", 5200);
  return false;
}

export async function fileToRef(file) {
  const dataUrl = await shrinkImage(file, 1024, 0.86);
  if (!dataUrl) return null;
  return store.putImageData(dataUrl);
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function suggestLabel(entity) {
  const imgs = store.images(entity);
  const boxes = tiposOf(entity);
  if (!imgs.length) return boxes[0] || "Retrato";
  const used = new Set(imgs.map((i) => i.label));
  const free = boxes.find((t) => !used.has(t));
  return free || "Imagem " + (imgs.length + 1);
}

function tiposOf(entity) {
  const saved = entity && Array.isArray(entity.boxes)
    ? entity.boxes.map((b) => String(b || "").trim()).filter(Boolean)
    : [];
  const list = saved.length ? saved.slice() : imageTipos().slice();
  const lower = new Set(list.map((t) => t.toLowerCase()));
  for (const im of store.images(entity)) {
    const l = String(im.label || "").trim();
    if (l && !lower.has(l.toLowerCase())) { list.push(l); lower.add(l.toLowerCase()); }
  }
  return list;
}

export function renameBoxLabel(entityId, index, newLabel) {
  const ent = store.getEntity(entityId);
  if (!ent) return null;
  const list = tiposOf(ent);
  const old = list[index];
  if (!old) return null;
  const label = String(newLabel == null ? "" : newLabel).trim() || old;
  if (label === old) return old;
  const im = imageForTipo(ent, old);
  list[index] = label;
  if (im) store.renameEntityImage(entityId, im.id, label);
  store.setEntityBoxes(entityId, list);
  return label;
}

function imageForTipo(entity, tipo) {
  const t = String(tipo || "").trim().toLowerCase();
  if (!t) return null;
  return store.images(entity).find((im) => String(im.label || "").trim().toLowerCase() === t) || null;
}

function downloadRef(ref, name) {
  store.getSrcByRef(ref).then((src) => {
    if (!src) { toast("Não consegui carregar a imagem", "error"); return; }
    const m = /^data:image\/([a-z0-9+.-]+)/i.exec(src);
    const ext = m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "png";
    const a = document.createElement("a");
    a.href = src;
    a.download = `${String(name || "imagem").replace(/[^\w\-]+/g, "-").toLowerCase() || "imagem"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

/* ------------------------------------------------------------------
   Galeria de imagens da ficha (o mesmo componente serve a ficha e o editor)
   ------------------------------------------------------------------ */

// No modo somente leitura (Codex publicado) o visitante pode FOLHEAR as imagens,
// mas nada disso pode encostar no instantâneo: a imagem que ele está vendo fica só
// nesta aba (some ao recarregar) e o retrato "oficial" da ficha — o que alimenta o
// cartão da lista e o grafo — continua sendo o que o autor escolheu.
const roActive = new Map();

function activeFor(entity) {
  if (VIEW.active && entity) {
    const id = roActive.get(entity.id);
    const im = id ? store.imageById(entity, id) : null;
    if (im) return im;
  }
  return store.activeImage(entity);
}

function showImage(entityId, imageId) {
  if (VIEW.active) roActive.set(entityId, imageId);
  else store.setActiveImage(entityId, imageId);
}

// As miniaturas de quem lê: uma por imagem, na ORDEM das caixas do autor (é assim
// que ele arrumou a ficha) e, no fim, as imagens que não caíram em caixa nenhuma
// (ex.: duas imagens com o mesmo rótulo) — assim nenhuma imagem fica inalcançável.
function readerTiles(entity) {
  const imgs = store.images(entity);
  const out = [];
  const used = new Set();
  for (const tipo of tiposOf(entity)) {
    const alvo = String(tipo || "").trim().toLowerCase();
    const im = imgs.find((x) => !used.has(x.id) && String(x.label || "").trim().toLowerCase() === alvo);
    if (!im) continue;
    used.add(im.id);
    out.push({ tipo: im.label || tipo, im });
  }
  for (const im of imgs) if (!used.has(im.id)) out.push({ tipo: im.label || "Imagem", im });
  return out;
}

export function mediaHtml(entity, opts) {
  opts = opts || {};
  const cls = opts.cls || "heroImg";
  const leitura = VIEW.active;
  const imgs = store.images(entity);
  const active = activeFor(entity);
  const icon = store.type(entity.type).icon;
  // Quem lê vê uma miniatura por IMAGEM (as caixas vazias do autor não interessam, e
  // assim toda imagem fica alcançável). O autor continua vendo as caixas dele.
  const tiles = leitura
    ? readerTiles(entity)
    : (imgs.length || cls === "editorImg" ? tiposOf(entity) : []).map((tipo) => ({ tipo, im: imageForTipo(entity, tipo) }));
  const strip = tiles.length ? `<div class="mediaStrip" data-media-strip>
    <div class="mediaThumbs" data-media-thumbs>
      ${tiles.map((t, i) => {
        const on = t.im && active && t.im.id === active.id;
        return `<div class="mediaThumb ${t.im ? "" : "empty"} ${on ? "active" : ""}" data-media-thumb="${t.im ? esc(t.im.id) : ""}" data-media-tipo="${esc(t.tipo)}" data-box-index="${i}">
      <button class="mediaThumbPick" data-tipotab="${esc(t.tipo)}" title="${esc(t.im ? t.tipo + " — clique para exibir" : "Adicionar uma imagem de " + t.tipo)}">${t.im ? "" : "＋"}</button>
      <span class="mediaThumbLabel">${esc(t.tipo)}</span>
      ${leitura ? "" : `<button class="mediaThumbMore" ${t.im ? `data-thumbmore="${esc(t.im.id)}"` : `data-boxmore="${i}"`} title="Opções desta caixa">⋯</button>`}
    </div>`;
      }).join("")}
      ${leitura ? "" : `<button class="mediaAddTile" data-media-add title="Adicionar imagem"><span>＋</span><small>imagem</small></button>`}
    </div>
  </div>` : "";
  return `<div class="mediaImg ${cls} ${imgs.length ? "hasImg" : ""}" data-media-img>
    ${imgs.length ? "" : `<span class="mediaIcon heroIcon">${esc(icon)}</span>`}
    <img class="mediaPhoto" data-media-photo alt="${esc(entity.name)}" ${active ? "" : "hidden"}>
    <span class="mediaTypeTag" data-media-tag ${active && active.label ? "" : "hidden"}>${esc(active ? active.label : "")}</span>
    <div class="heroImgBtns mediaBtns">
      ${tiles.length > 1 ? `<button class="imgBtn" data-media-prev title="${leitura ? "Imagem anterior" : "Caixa anterior"}">‹</button>` : ""}
      ${leitura ? "" : `<button class="imgBtn" data-media-add title="Adicionar imagem">＋</button>`}
      ${imgs.length ? `<button class="imgBtn" data-media-zoom title="Ampliar a imagem">🔍</button>` : ""}
      ${!leitura && imgs.length ? `<button class="imgBtn danger" data-media-remove title="Remover esta imagem">✕</button>` : ""}
      ${tiles.length > 1 ? `<button class="imgBtn" data-media-next title="${leitura ? "Próxima imagem" : "Próxima caixa"}">›</button>` : ""}
    </div>
    ${imgs.length ? `<button class="mediaZoomChip" data-media-zoom title="Clique para ampliar">🔍</button>` : ""}
    ${opts.hint ? `<div class="mediaHint">${esc(opts.hint)}</div>` : ""}
    <input type="file" accept="image/*" data-media-input hidden>
  </div>${strip}`;
}

export async function hydrateMedia(wrap, entity) {
  if (!wrap) return;
  const host = wrap.querySelector("[data-media-img]") || wrap;
  const photo = host.querySelector("[data-media-photo]");
  const active = activeFor(entity);
  if (active) {
    const src = await store.getSrcByRef(active.ref);
    if (src && photo && photo.isConnected) {
      photo.src = src;
      photo.hidden = false;
      host.classList.add("hasImg");
      const ic = host.querySelector(".mediaIcon");
      if (ic) ic.remove();
    }
  }
  for (const im of store.images(entity)) {
    const tile = wrap.querySelector(`[data-media-thumb="${im.id}"]`);
    if (!tile) continue;
    const pick = tile.querySelector(".mediaThumbPick");
    const src = await store.getSrcByRef(im.ref);
    if (src && pick && pick.isConnected) {
      pick.style.backgroundImage = `url("${src}")`;
      pick.classList.add("hasImg");
    }
  }
}

async function applyActive(wrap, entity) {
  if (!wrap || !wrap.isConnected) return;
  const host = wrap.querySelector("[data-media-img]") || wrap;
  const photo = host.querySelector("[data-media-photo]");
  const tag = host.querySelector("[data-media-tag]");
  const active = activeFor(entity);
  if (photo) {
    const src = active ? await store.getSrcByRef(active.ref) : null;
    if (src && photo.isConnected) {
      photo.src = src;
      photo.hidden = false;
      host.classList.add("hasImg");
      const ic = host.querySelector(".mediaIcon");
      if (ic) ic.remove();
    }
  }
  if (tag) {
    tag.textContent = active && active.label ? active.label : "";
    tag.hidden = !(active && active.label);
  }
  for (const tile of qa("[data-media-thumb]", wrap)) {
    tile.classList.toggle("active", !!active && tile.dataset.mediaThumb === active.id);
  }
}

export function bindMedia(wrap, entity, opts) {
  opts = opts || {};
  const done = () => { if (opts.onDone) opts.onDone(); else dispatch("codex:data-changed", {}); };
  if (!wrap) return;
  const leitura = VIEW.active;
  const host = wrap.querySelector("[data-media-img]") || wrap;
  const current = () => activeFor(store.getEntity(entity.id) || entity);
  const entityId = entity.id;

  // Só o autor pode acrescentar/remover imagem (o visitante do Codex publicado, não).
  if (!leitura) {
    for (const b of qa("[data-media-add]", wrap)) b.onclick = () => openAddImageDialog(store.getEntity(entityId), { onDone: done });

    const input = wrap.querySelector("[data-media-input]");
    if (input) {
      input.onchange = async () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        if (!canAddImage(store.getEntity(entityId))) return;
        const ref = await fileToRef(file);
        if (!ref) { toast("Não consegui ler essa imagem", "error"); return; }
        store.addEntityImage(entityId, { ref, label: suggestLabel(store.getEntity(entityId)) });
        toast("Imagem adicionada", "success");
        done();
      };
    }
  }

  const zoom = async (imageId) => {
    await openEntityZoom(store.getEntity(entityId), imageId, { onSwitch: () => applyActive(wrap, store.getEntity(entityId)) });
  };
  const photo = wrap.querySelector("[data-media-photo]");
  if (photo) photo.onclick = (e) => { e.stopPropagation(); const cur = current(); if (cur) zoom(cur.id); };
  for (const b of qa("[data-media-zoom]", wrap)) b.onclick = (e) => { e.stopPropagation(); const cur = current(); if (cur) zoom(cur.id); };

  const rm = wrap.querySelector("[data-media-remove]");
  if (rm) rm.onclick = async () => {
    const cur = current();
    if (!cur) return;
    const ok = await confirmDialog({
      title: "Remover esta imagem?",
      message: `“${cur.label || "Imagem"}” será apagada desta ficha.`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    await store.removeEntityImage(entityId, cur.id);
    toast("Imagem removida");
    done();
  };

  const tilesNow = () => qa("[data-media-thumb]", wrap);
  const markCursor = (i) => {
    const list = tilesNow();
    if (!list.length) return;
    wrap.dataset.boxCursor = String(i);
    list.forEach((t, k) => t.classList.toggle("cursor", k === i));
  };
  const cursorIndex = () => {
    const list = tilesNow();
    if (!list.length) return -1;
    let i = Number(wrap.dataset.boxCursor);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) {
      const ent = store.getEntity(entityId);
      const act = activeFor(ent);
      i = list.findIndex((t) => !!t.dataset.mediaThumb && !!act && t.dataset.mediaThumb === act.id);
      if (i < 0) i = 0;
    }
    return i;
  };
  // A imagem de uma caixa/miniatura: o id no próprio tile manda (é o que faz a
  // segunda imagem de uma caixa repetida ser alcançável); sem id, cai no rótulo.
  const imageOfTile = (ent, tile) => {
    if (!tile) return null;
    if (tile.dataset.mediaThumb) return store.imageById(ent, tile.dataset.mediaThumb);
    return imageForTipo(ent, tile.dataset.mediaTipo);
  };
  const goBox = async (dir) => {
    const list = tilesNow();
    if (list.length < 2) return;
    const i = ((cursorIndex() + dir) % list.length + list.length) % list.length;
    markCursor(i);
    const ent = store.getEntity(entityId);
    const tile = list[i];
    const im = imageOfTile(ent, tile);
    if (im) {
      showImage(entityId, im.id);
      await applyActive(wrap, ent);
    }
    try { tile.scrollIntoView({ block: "nearest", inline: "center" }); } catch (err) { /* navegador antigo */ }
  };
  for (const b of qa("[data-media-prev]", wrap)) b.onclick = (e) => { e.stopPropagation(); goBox(-1); };
  for (const b of qa("[data-media-next]", wrap)) b.onclick = (e) => { e.stopPropagation(); goBox(1); };

  for (const b of qa("[data-tipotab]", wrap)) b.onclick = async (e) => {
    e.stopPropagation();
    const tile = b.closest(".mediaThumb");
    const tipo = b.dataset.tipotab;
    const idx = tile ? tilesNow().indexOf(tile) : -1;
    if (idx >= 0) markCursor(idx);
    const ent = store.getEntity(entityId);
    const im = imageOfTile(ent, tile);
    if (im) {
      showImage(entityId, im.id);
      await applyActive(wrap, ent);
      return;
    }
    if (leitura) return; // no Codex publicado não há como acrescentar imagem
    openAddImageDialog(ent, { tipo, onDone: done });
  };

  if (!leitura) {
    for (const b of qa("[data-thumbmore]", wrap)) b.onclick = (e) => {
      e.stopPropagation();
      const cur = store.getEntity(entityId);
      thumbMenu(b, cur, b.dataset.thumbmore, wrap, done);
    };

    for (const b of qa("[data-boxmore]", wrap)) b.onclick = (e) => {
      e.stopPropagation();
      boxMenu(b, store.getEntity(entityId), Number(b.dataset.boxmore), done);
    };
  }

  if (host && !leitura) {
    host.addEventListener("dragover", (e) => { e.preventDefault(); host.classList.add("dropHover"); });
    host.addEventListener("dragleave", () => host.classList.remove("dropHover"));
    host.addEventListener("drop", async (e) => {
      e.preventDefault();
      host.classList.remove("dropHover");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !String(file.type).startsWith("image/")) return;
      const ent = store.getEntity(entityId);
      if (!canAddImage(ent)) return;
      const ref = await fileToRef(file);
      if (!ref) { toast("Não consegui ler essa imagem", "error"); return; }
      store.addEntityImage(entityId, { ref, label: suggestLabel(ent) });
      toast("Imagem adicionada", "success");
      done();
    });
  }
}

function thumbMenu(anchor, entity, imageId, wrap, done) {
  if (VIEW.active) return;
  const img = store.imageById(entity, imageId);
  if (!img) return;
  const isActive = store.activeImage(entity) && store.activeImage(entity).id === imageId;
  const items = [
    { icon: "🔍", label: "Ampliar", onClick: () => openEntityZoom(entity, imageId, { onSwitch: () => applyActive(wrap, store.getEntity(entity.id)) }) },
  ];
  if (!isActive) items.push({ icon: "⭐", label: "Exibir na ficha", onClick: async () => { store.setActiveImage(entity.id, imageId); await applyActive(wrap, store.getEntity(entity.id)); } });
  items.push(
    { icon: "✏️", label: "Renomear caixa", onClick: async () => {
      const v = await promptDialog({ title: "Nome da caixa", label: "Como chamar esta caixa?", value: img.label || "", placeholder: "ex: Retrato, Combate, Traje de gala…" });
      if (v === null) return;
      const list = tiposOf(entity);
      const idx = list.findIndex((t) => t.toLowerCase() === String(img.label || "").trim().toLowerCase());
      renameBoxLabel(entity.id, idx < 0 ? 0 : idx, v);
      done();
    } },
    { icon: "⤓", label: "Baixar imagem", onClick: () => downloadRef(img.ref, entity.name + "-" + (img.label || "")) },
    { separator: true },
    { icon: "🗑️", label: "Remover esta imagem", danger: true, onClick: async () => {
      const ok = await confirmDialog({ title: "Remover imagem?", message: `“${img.label || "Imagem"}” será apagada desta ficha.`, confirmLabel: "Remover", danger: true });
      if (!ok) return;
      await store.removeEntityImage(entity.id, imageId);
      toast("Imagem removida");
      done();
    } },
  );
  popupMenu(anchor, items, { alignRight: true });
}

function boxMenu(anchor, entity, index, done) {
  if (VIEW.active) return;
  if (!entity || !Number.isInteger(index) || index < 0) return;
  const list = tiposOf(entity);
  const tipo = list[index];
  if (!tipo) return;
  popupMenu(anchor, [
    { icon: "✏️", label: "Renomear caixa", onClick: async () => {
      const v = await promptDialog({ title: "Nome da caixa", label: "Como chamar esta caixa?", value: tipo, placeholder: "ex: Retrato, Combate, Traje de gala…" });
      if (v === null) return;
      renameBoxLabel(entity.id, index, v);
      done();
    } },
    { icon: "＋", label: "Adicionar imagem", onClick: () => openAddImageDialog(entity, { tipo, onDone: done }) },
  ], { alignRight: true });
}

export function openAddImageDialog(entity, opts) {
  opts = opts || {};
  if (!entity || VIEW.active) return;
  const done = () => { if (opts.onDone) opts.onDone(); };
  if (!canAddImage(entity)) return;
  const tipos = tiposOf(entity);
  let tipo = String(opts.tipo || "").trim() || tipos[0] || "Retrato";
  if (!tipos.some((t) => t.toLowerCase() === tipo.toLowerCase())) tipos.push(tipo);
  const selected = (t) => (t.toLowerCase() === tipo.toLowerCase() ? "on" : "");
  const outroOn = !tiposOf(entity).some((t) => t.toLowerCase() === tipo.toLowerCase());
  const body = el(`<div class="addImg">
    <div class="field">
      <span class="fieldLabel">Tipo desta imagem <span class="fieldHintInline">${store.images(entity).length} de ${maxImagens()} imagens usadas</span></span>
      <div class="chipRow" id="addImgTipos">
        ${tipos.map((t, i) => `<button class="chipBtn ${selected(t)}" data-tipo="${esc(t)}">${esc(t)}</button>`).join("")}
        <button class="chipBtn ${outroOn ? "on" : ""}" data-tipo="__outro">Outro…</button>
      </div>
      <input class="input" id="addImgTipoOutro" placeholder="nome do tipo (ex: Traje de gala)" value="${outroOn ? esc(tipo) : ""}" ${outroOn ? "" : "hidden"}>
    </div>
    <div class="field">
      <span class="fieldLabel">De onde vem a imagem?</span>
      <div class="addImgSources">
        <button class="addImgSource" data-src="file"><span class="addImgIcon">⬆</span><strong>Enviar do dispositivo</strong><small>escolha um arquivo de imagem</small></button>
        <button class="addImgSource" data-src="url"><span class="addImgIcon">🔗</span><strong>De um link</strong><small>cole o endereço de uma imagem</small></button>
      </div>
    </div>
    <input type="file" accept="image/*" id="addImgFile" hidden>
  </div>`);

  const tipoOutro = q("#addImgTipoOutro", body);
  const fileInput = q("#addImgFile", body);
  body.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tipo]");
    if (chip) {
      for (const c of qa("[data-tipo]", body)) c.classList.toggle("on", c === chip);
      const outro = chip.dataset.tipo === "__outro";
      tipoOutro.hidden = !outro;
      tipo = outro ? "" : chip.dataset.tipo;
      if (outro) tipoOutro.focus();
      return;
    }
    const src = e.target.closest("[data-src]");
    if (!src) return;
    const label = (tipoOutro.hidden ? tipo : tipoOutro.value.trim()) || "Imagem";
    if (src.dataset.src === "file") { fileInput.click(); return; }
    if (src.dataset.src === "url") {
      promptDialog({ title: "Imagem de um link", label: "Endereço da imagem (URL)", placeholder: "https://…/imagem.jpg", confirmLabel: "Adicionar" }).then(async (url) => {
        if (!url || !url.trim()) return;
        store.addEntityImage(entity.id, { ref: { kind: "url", value: url.trim() }, label });
        m.close();
        toast("Imagem adicionada", "success");
        done();
      });
    }
  });
  tipoOutro.addEventListener("input", () => { tipo = tipoOutro.value.trim(); });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const label = (tipoOutro.hidden ? tipo : tipoOutro.value.trim()) || "Imagem";
    const ref = await fileToRef(file);
    if (!ref) { toast("Não consegui ler essa imagem", "error"); return; }
    store.addEntityImage(entity.id, { ref, label });
    m.close();
    toast("Imagem adicionada", "success");
    done();
  });

  const m = openModal({
    title: "Adicionar imagem",
    subtitle: entity.name,
    size: "md",
    body,
    actions: [{ label: "Fechar", onClick: ({ close }) => close() }],
  });
}

/* ------------------------------------------------------------------
   Zoom
   ------------------------------------------------------------------ */

export async function openEntityZoom(entity, imageId, opts) {
  opts = opts || {};
  const imgs = store.images(entity);
  if (!imgs.length) return;
  const entries = [];
  for (const im of imgs) {
    const src = await store.getSrcByRef(im.ref);
    if (src) entries.push({ id: im.id, src, label: im.label });
  }
  if (!entries.length) { toast("Não consegui carregar a imagem", "error"); return; }
  let index = entries.findIndex((e) => e.id === imageId);
  if (index < 0) {
    const shown = activeFor(entity);
    index = shown ? entries.findIndex((e) => e.id === shown.id) : -1;
  }
  if (index < 0) index = 0;
  openImageZoom({
    images: entries,
    index,
    title: entity.name,
    subtitle: entries[index].label,
    onIndexChange: (i, entry) => {
      showImage(entity.id, entry.id);
      if (opts.onSwitch) opts.onSwitch(i, entry);
    },
  });
}

/* ------------------------------------------------------------------
   Imagens anexadas à descrição
   ------------------------------------------------------------------ */

export function descGalleryHtml(entity, opts) {
  opts = opts || {};
  const imgs = store.descImages(entity);
  return `<div class="descGallery" data-desc-gallery>
    ${imgs.map((im) => `<figure class="descShot" data-descfig="${esc(im.id)}">
      <button class="descShotBtn" data-descimg="${esc(im.id)}" title="Clique para ampliar"></button>
      ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}
    </figure>`).join("")}
    ${opts.editable ? `<button class="descShotAdd" data-desc-add-view title="Adicionar uma imagem à descrição"><span>＋</span><small>imagem na descrição</small></button>` : ""}
  </div>`;
}

export function bindDescGallery(wrap, entity, opts) {
  opts = opts || {};
  const gallery = wrap && wrap.querySelector("[data-desc-gallery]");
  if (!gallery) return;
  hydrateDescGallery(gallery, entity);
  for (const b of qa("[data-descimg]", gallery)) b.onclick = () => openDescZoom(entity, b.dataset.descimg, () => hydrateDescGallery(gallery, entity));
  const addBtn = gallery.querySelector("[data-desc-add-view]");
  if (addBtn) addBtn.onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const ref = await fileToRef(file);
      if (!ref) { toast("Não consegui ler essa imagem", "error"); return; }
      store.addDescImage(entity.id, { ref });
      toast("Imagem adicionada à descrição", "success");
      if (opts.onDone) opts.onDone();
      else dispatch("codex:data-changed", {});
    };
    input.click();
  };
}

async function hydrateDescGallery(gallery, entity) {
  for (const im of store.descImages(entity)) {
    const btn = gallery.querySelector(`[data-descimg="${im.id}"]`);
    if (!btn) continue;
    const src = await store.getSrcByRef(im.ref);
    if (src && btn.isConnected) {
      btn.style.backgroundImage = `url("${src}")`;
      btn.classList.add("hasImg");
    }
  }
}

export async function openDescZoom(entity, imageId, onSwitch) {
  const imgs = store.descImages(entity);
  const entries = [];
  for (const im of imgs) {
    const src = await store.getSrcByRef(im.ref);
    if (src) entries.push({ id: im.id, src, label: im.caption || "Imagem da descrição" });
  }
  if (!entries.length) return;
  let index = entries.findIndex((e) => e.id === imageId);
  if (index < 0) index = 0;
  openImageZoom({
    images: entries,
    index,
    title: entity.name,
    subtitle: entries[index].label,
    onIndexChange: () => { if (onSwitch) onSwitch(); },
  });
}

export function descEditorHtml(entity) {
  return `<div class="field">
    <span class="fieldLabel">Imagens da descrição <span class="fieldHintInline">aparecem junto do texto na ficha · clique para ampliar</span></span>
    <div class="descEditorGrid" data-desc-editor>
      ${store.descImages(entity).map((im) => descEditorTileHtml(im)).join("")}
    </div>
    <div class="descEditorBtns">
      <button class="btn tiny" data-desc-add>＋ Adicionar imagem na descrição</button>
      <input type="file" accept="image/*" data-desc-file hidden>
    </div>
  </div>`;
}

function descEditorTileHtml(im) {
  return `<div class="descEditCard" data-desccard="${esc(im.id)}">
    <button class="descEditThumb" data-descimg="${esc(im.id)}" title="Clique para ampliar"></button>
    <input class="input descEditCaption" data-desccaption="${esc(im.id)}" value="${esc(im.caption || "")}" placeholder="legenda (opcional)">
    <button class="iconBtn tiny danger" data-descrm="${esc(im.id)}" title="Remover">✕</button>
  </div>`;
}

export function bindDescEditor(wrap, entity) {
  const box = wrap && wrap.querySelector("[data-desc-editor]");
  if (!box) return;
  hydrateDescEditor(wrap, entity);

  const addBtn = wrap.querySelector("[data-desc-add]");
  const fileInput = wrap.querySelector("[data-desc-file]");
  if (addBtn && fileInput) {
    addBtn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      const ref = await fileToRef(file);
      if (!ref) { toast("Não consegui ler essa imagem", "error"); return; }
      store.addDescImage(entity.id, { ref });
      rerenderDescEditor(wrap, entity);
      toast("Imagem adicionada à descrição", "success");
    };
  }

  for (const b of qa("[data-descimg]", box)) b.onclick = () => openDescZoom(store.getEntity(entity.id), b.dataset.descimg, () => hydrateDescEditor(wrap, entity));
  for (const b of qa("[data-descrm]", box)) b.onclick = async () => {
    await store.removeDescImage(entity.id, b.dataset.descrm);
    rerenderDescEditor(wrap, entity);
  };
  for (const input of qa("[data-desccaption]", box)) {
    input.onchange = () => store.updateDescImage(entity.id, input.dataset.desccaption, { caption: input.value.trim() });
  }
}

function rerenderDescEditor(wrap, entity) {
  const box = wrap.querySelector("[data-desc-editor]");
  if (!box) return;
  const fresh = store.getEntity(entity.id) || entity;
  box.innerHTML = store.descImages(fresh).map((im) => descEditorTileHtml(im)).join("");
  hydrateDescEditor(wrap, fresh);
  for (const b of qa("[data-descimg]", box)) b.onclick = () => openDescZoom(fresh, b.dataset.descimg, () => hydrateDescEditor(wrap, fresh));
  for (const b of qa("[data-descrm]", box)) b.onclick = async () => {
    await store.removeDescImage(fresh.id, b.dataset.descrm);
    rerenderDescEditor(wrap, fresh);
  };
  for (const input of qa("[data-desccaption]", box)) {
    input.onchange = () => store.updateDescImage(fresh.id, input.dataset.desccaption, { caption: input.value.trim() });
  }
}

async function hydrateDescEditor(wrap, entity) {
  const box = wrap && wrap.querySelector("[data-desc-editor]");
  if (!box) return;
  const fresh = store.getEntity(entity.id) || entity;
  for (const im of store.descImages(fresh)) {
    const btn = box.querySelector(`[data-descimg="${im.id}"]`);
    if (!btn) continue;
    const src = await store.getSrcByRef(im.ref);
    if (src && btn.isConnected) {
      btn.style.backgroundImage = `url("${src}")`;
      btn.classList.add("hasImg");
    }
  }
}
