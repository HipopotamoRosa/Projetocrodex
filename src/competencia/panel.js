// Monta o bloco de Competência dentro da Descrição da ficha.

import { q } from "../ui/dom.js";
import { capPanelHtml } from "./render.js";

export function openCompetencia(id) {
  window.dispatchEvent(new CustomEvent("codex:open-competencia", { detail: { id } }));
}

// `container` é o corpo da ficha (detailBody); o painel é injetado no
// marcador [data-cap-holder] que fica logo abaixo da descrição.
export function mountCapPanel(container, entity) {
  const holder = q("[data-cap-holder]", container);
  if (!holder) return;
  holder.innerHTML = capPanelHtml(entity);
  if (!holder.innerHTML) return;
  const btn = q("[data-cap-edit]", holder);
  if (btn) btn.onclick = () => openCompetencia(entity.id);
}
