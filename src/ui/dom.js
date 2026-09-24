import { esc } from "../util.js";

export function q(sel, r) { return (r || document).querySelector(sel); }
export function qa(sel, r) { return [...(r || document).querySelectorAll(sel)]; }

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function spinner(cls) {
  return `<span class="spinner ${cls || ""}" aria-hidden="true"></span>`;
}

export function toast(message, type, ms) {
  const root = q("#toastRoot");
  if (!root) return;
  const node = el(`<div class="toast toast-${type || "info"}"><span class="toastIcon">${type === "error" ? "⚠️" : type === "success" ? "✅" : "💬"}</span><span class="toastMsg">${esc(message)}</span></div>`);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 300);
  }, ms || (type === "error" ? 5200 : 3200));
}

const modalStack = [];

export function openModal(opts) {
  opts = opts || {};
  const backdrop = el(`<div class="modalBackdrop"><div class="modalCard ${opts.size || "md"}" role="dialog" aria-modal="true"></div></div>`);
  const card = q(".modalCard", backdrop);
  const head = el(`<div class="modalHead"><div class="modalHeadText"><h3 class="modalTitle"></h3><p class="modalSub"></p></div><div class="modalHeadActions"></div></div>`);
  q(".modalTitle", head).textContent = opts.title || "";
  const subEl = q(".modalSub", head);
  if (opts.subtitle) subEl.textContent = opts.subtitle; else subEl.remove();
  const bodyEl = el(`<div class="modalBody"></div>`);
  const footEl = el(`<div class="modalFoot"></div>`);
  card.append(head, bodyEl);
  if (opts.actions && opts.actions.length) {
    for (const a of opts.actions) {
      const btn = el(`<button class="btn ${a.kind || ""}">${esc(a.label)}</button>`);
      btn.addEventListener("click", () => a.onClick && a.onClick({ close, card, body: bodyEl, button: btn }));
      footEl.appendChild(btn);
    }
    card.appendChild(footEl);
  } else {
    footEl.remove();
  }
  const closeBtn = el(`<button class="iconBtn modalClose" title="Fechar (Esc)">✕</button>`);
  closeBtn.addEventListener("click", () => close());
  q(".modalHeadActions", head).appendChild(closeBtn);
  if (opts.body) {
    if (typeof opts.body === "string") bodyEl.innerHTML = opts.body;
    else bodyEl.appendChild(opts.body);
  }
  const onKey = (e) => {
    if (e.key === "Escape" && modalStack[modalStack.length - 1] === entry && opts.dismissible !== false) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    const idx = modalStack.indexOf(entry);
    if (idx >= 0) modalStack.splice(idx, 1);
    backdrop.classList.remove("show");
    setTimeout(() => backdrop.remove(), 220);
    if (opts.onClose) opts.onClose();
  }
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop && opts.dismissible !== false) close();
  });
  const entry = { close, card, body: bodyEl, head, title: (t) => { q(".modalTitle", head).textContent = t; }, subtitle: (t) => { subEl.textContent = t; } };
  q("#modalRoot").appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("show"));
  modalStack.push(entry);
  return entry;
}

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top) top.close();
}

export function confirmDialog(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: opts.title || "Confirmar",
      subtitle: opts.message || "",
      size: "sm",
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: opts.cancelLabel || "Cancelar", onClick: ({ close }) => { done = true; resolve(false); close(); } },
        { label: opts.confirmLabel || "Confirmar", kind: opts.danger ? "danger" : "primary", onClick: ({ close }) => { done = true; resolve(true); close(); } },
      ],
    });
    setTimeout(() => {
      const btn = qa(".modalFoot .btn", m.card);
      if (btn[1]) btn[1].focus();
    }, 30);
  });
}

export function promptDialog(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let done = false;
    const field = opts.multiline
      ? el(`<textarea class="input" rows="${opts.rows || 5}" placeholder="${esc(opts.placeholder || "")}"></textarea>`)
      : el(`<input class="input" type="text" placeholder="${esc(opts.placeholder || "")}">`);
    field.value = opts.value == null ? "" : opts.value;
    const body = el(`<div class="field"><label class="fieldLabel">${esc(opts.label || "")}</label></div>`);
    body.appendChild(field);
    if (opts.hint) body.appendChild(el(`<p class="fieldHint">${esc(opts.hint)}</p>`));
    const m = openModal({
      title: opts.title || "Editar",
      size: opts.size || "sm",
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancelar", onClick: ({ close }) => { done = true; resolve(null); close(); } },
        { label: opts.confirmLabel || "Salvar", kind: "primary", onClick: ({ close }) => { done = true; resolve(field.value); close(); } },
      ],
    });
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (!opts.multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        done = true;
        resolve(field.value);
        m.close();
      }
    });
    setTimeout(() => field.focus(), 40);
  });
}

let openMenu = null;

export function popupMenu(anchor, items, opts) {
  opts = opts || {};
  closeMenu();
  const rect = opts.rect || (anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null);
  if (!rect) return;
  const menu = el(`<div class="popupMenu"></div>`);
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      menu.appendChild(el(`<div class="menuSep"></div>`));
      continue;
    }
    const btn = el(`<button class="menuItem ${item.danger ? "danger" : ""}"><span class="menuIcon">${item.icon || ""}</span><span class="menuLabel">${esc(item.label)}</span>${item.hint ? `<span class="menuHint">${esc(item.hint)}</span>` : ""}</button>`);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      if (item.onClick) item.onClick();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = rect.left + (opts.alignRight ? rect.width - mw : 0);
  let top = rect.bottom + 6;
  if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  requestAnimationFrame(() => menu.classList.add("show"));
  openMenu = menu;
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onMenuKey, true);
  }, 0);
}

function onDocClick(e) {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
}

function onMenuKey(e) {
  if (e.key === "Escape") closeMenu();
}

export function closeMenu() {
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onMenuKey, true);
  if (openMenu) {
    const m = openMenu;
    openMenu = null;
    m.classList.remove("show");
    setTimeout(() => m.remove(), 160);
  }
}

export function skeleton(rows) {
  let out = "";
  for (let i = 0; i < (rows || 4); i++) out += `<div class="skelRow"></div>`;
  return `<div class="skeleton">${out}</div>`;
}
