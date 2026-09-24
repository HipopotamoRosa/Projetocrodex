import { esc } from "../util.js";

const MAX_SCALE = 8;
const STEP = 1.35;

function safeName(text) {
  return String(text || "imagem")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "imagem";
}

function extFor(src) {
  const m = /^data:image\/([a-z0-9+.-]+)/i.exec(String(src || ""));
  if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  const m2 = /\.(png|jpe?g|webp|gif|avif|bmp)(?:\?|#|$)/i.exec(String(src || ""));
  if (m2) return m2[1].toLowerCase();
  return "png";
}

export function openImageZoom(opts) {
  opts = opts || {};
  const list = (Array.isArray(opts.images) && opts.images.length ? opts.images : [{ src: opts.src, label: opts.subtitle || "" }])
    .filter((im) => im && im.src);
  if (!list.length) return null;

  let index = Math.min(Math.max(0, opts.index | 0), list.length - 1);
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let moved = false;
  const pointers = new Map();
  let pinch = null;
  let swipe = null;

  const root = document.createElement("div");
  root.className = "zoomOverlay";
  const actions = opts.actions || [];
  root.innerHTML = `
    <div class="zoomTop">
      <div class="zoomTitles"><strong data-zoom-title></strong><span data-zoom-sub></span></div>
      <div class="zoomTopRight">
        ${list.length > 1 ? `<button class="zoomBtn" data-zoom-prev title="Anterior (←)">‹</button><span class="zoomCount" data-zoom-count></span><button class="zoomBtn" data-zoom-next title="Próxima (→)">›</button>` : ""}
        <button class="zoomBtn" data-zoom-close title="Fechar (Esc)">✕</button>
      </div>
    </div>
    <div class="zoomStage" data-zoom-stage><img class="zoomImg" data-zoom-img alt="" draggable="false"></div>
    <div class="zoomBar">
      <button class="zoomBtn" data-zoom-out title="Diminuir (−)">−</button>
      <span class="zoomPct" data-zoom-pct>100%</span>
      <button class="zoomBtn" data-zoom-in title="Aumentar (＋)">＋</button>
      <button class="zoomBtn" data-zoom-reset title="Ajustar à tela (0)">⟲</button>
      <span class="zoomSep"></span>
      <button class="zoomBtn" data-zoom-download title="Baixar imagem">⤓</button>
      ${actions.map((a, i) => `<button class="zoomBtn" data-zoom-action="${i}" title="${esc(a.title || a.label || "")}">${esc(a.icon || "•")}</button>`).join("")}
      <span class="zoomSep"></span>
      <button class="zoomBtn" data-zoom-close title="Fechar">✕</button>
    </div>
    ${list.length > 1 ? `<div class="zoomStrip" data-zoom-strip>${list.map((im, i) => `<button class="zoomThumb ${i === index ? "active" : ""}" data-zoom-jump="${i}" title="${esc(im.label || "Imagem " + (i + 1))}"><img src="${esc(im.src)}" alt=""></button>`).join("")}</div>` : ""}
  `;
  document.body.appendChild(root);

  const img = root.querySelector("[data-zoom-img]");
  const stage = root.querySelector("[data-zoom-stage]");
  const pctEl = root.querySelector("[data-zoom-pct]");
  const titleEl = root.querySelector("[data-zoom-title]");
  const subEl = root.querySelector("[data-zoom-sub]");
  const countEl = root.querySelector("[data-zoom-count]");

  function render() {
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    img.classList.toggle("zoomed", scale > 1.001);
    if (pctEl) pctEl.textContent = Math.round(scale * 100) + "%";
  }

  function clampPan() {
    if (scale <= 1) { tx = 0; ty = 0; return; }
    const rect = stage.getBoundingClientRect();
    const w = img.offsetWidth * scale;
    const h = img.offsetHeight * scale;
    const maxX = Math.max(0, (w - rect.width) / 2);
    const maxY = Math.max(0, (h - rect.height) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  function zoomAt(cx, cy, factor) {
    const next = Math.min(MAX_SCALE, Math.max(1, scale * factor));
    if (next === scale) return;
    const rect = stage.getBoundingClientRect();
    const px = cx - (rect.left + rect.width / 2);
    const py = cy - (rect.top + rect.height / 2);
    const k = next / scale;
    tx = px - k * (px - tx);
    ty = py - k * (py - ty);
    scale = next;
    clampPan();
    render();
  }

  function reset() { scale = 1; tx = 0; ty = 0; render(); }

  function label(i) {
    const im = list[i];
    if (im && im.label) return im.label;
    return list.length > 1 ? `Imagem ${i + 1} de ${list.length}` : "";
  }

  function load(i) {
    const next = (i + list.length) % list.length;
    const changed = next !== index;
    index = next;
    img.src = list[index].src;
    if (titleEl) titleEl.textContent = opts.title || "";
    if (subEl) subEl.textContent = label(index);
    if (countEl) countEl.textContent = `${index + 1}/${list.length}`;
    for (const b of root.querySelectorAll("[data-zoom-jump]")) {
      b.classList.toggle("active", Number(b.dataset.zoomJump) === index);
    }
    reset();
    if (changed && opts.onIndexChange) opts.onIndexChange(index, list[index]);
  }

  function close() {
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", reset);
    root.removeEventListener("wheel", onWheel);
    root.classList.remove("show");
    setTimeout(() => root.remove(), 200);
    if (opts.onClose) opts.onClose();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key === "ArrowLeft" && list.length > 1) { e.stopPropagation(); load(index - 1); return; }
    if (e.key === "ArrowRight" && list.length > 1) { e.stopPropagation(); load(index + 1); return; }
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (e.key === "+" || e.key === "=") { e.stopPropagation(); zoomAt(cx, cy, STEP); }
    if (e.key === "-" || e.key === "_") { e.stopPropagation(); zoomAt(cx, cy, 1 / STEP); }
    if (e.key === "0") { e.stopPropagation(); reset(); }
  }

  function onWheel(e) {
    if (e.target.closest("[data-zoom-strip]")) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0018));
  }

  root.addEventListener("click", (e) => {
    const jump = e.target.closest("[data-zoom-jump]");
    if (jump) { load(Number(jump.dataset.zoomJump)); return; }
    const act = e.target.closest("[data-zoom-action]");
    if (act) {
      const a = actions[Number(act.dataset.zoomAction)];
      if (a && a.onClick) a.onClick({ index, entry: list[index], close, overlay: root });
      return;
    }
    const prev = e.target.closest("[data-zoom-prev]");
    if (prev) { load(index - 1); return; }
    const next = e.target.closest("[data-zoom-next]");
    if (next) { load(index + 1); return; }
    if (e.target.closest("[data-zoom-in]")) { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, STEP); return; }
    if (e.target.closest("[data-zoom-out]")) { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / STEP); return; }
    if (e.target.closest("[data-zoom-reset]")) { reset(); return; }
    if (e.target.closest("[data-zoom-download]")) {
      const a = document.createElement("a");
      a.href = list[index].src;
      a.download = `${safeName(opts.title)}${list[index].label ? "-" + safeName(list[index].label) : ""}.${extFor(list[index].src)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (e.target.closest("[data-zoom-close]")) { close(); return; }
    if (e.target.closest("[data-zoom-stage]")) {
      if (moved) { moved = false; return; }
      if (e.target === img) {
        const rect = stage.getBoundingClientRect();
        if (scale <= 1.02) zoomAt(e.clientX || rect.left + rect.width / 2, e.clientY || rect.top + rect.height / 2, 2.3);
        else reset();
        return;
      }
      close();
    }
  });

  stage.addEventListener("pointerdown", (e) => {
    if (e.target !== stage && e.target !== img) return;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    swipe = pointers.size === 1 ? { x: e.clientX, y: e.clientY, dx: 0, dy: 0 } : null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, tx, ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });

  stage.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const ox = p.x;
    const oy = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      scale = Math.min(MAX_SCALE, Math.max(1, pinch.scale * (dist / (pinch.dist || dist || 1))));
      tx = pinch.tx + (mid.x - pinch.mx);
      ty = pinch.ty + (mid.y - pinch.my);
      clampPan();
      render();
      moved = true;
      return;
    }
    if (pointers.size === 1 && scale > 1.001) {
      tx += e.clientX - ox;
      ty += e.clientY - oy;
      if (Math.abs(e.clientX - ox) + Math.abs(e.clientY - oy) > 0.6) moved = true;
      clampPan();
      render();
      return;
    }
    if (pointers.size === 1 && swipe) {
      swipe.dx = e.clientX - swipe.x;
      swipe.dy = e.clientY - swipe.y;
      if (Math.abs(swipe.dx) > 12 && Math.abs(swipe.dx) > Math.abs(swipe.dy)) moved = true;
    }
  });

  const endPointer = (e) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (wasSingle && swipe && list.length > 1 && scale <= 1.02) {
      const dx = swipe.dx;
      const dy = swipe.dy;
      if (Math.abs(dx) > 44 && Math.abs(dy) < Math.abs(dx) * 0.85) load(dx < 0 ? index + 1 : index - 1);
    }
    if (!pointers.size) swipe = null;
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("pointerleave", (e) => { if (pointers.size === 1) endPointer(e); });

  root.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", reset);

  load(index);
  requestAnimationFrame(() => root.classList.add("show"));
  return { close, overlay: root, load };
}
