import { createEmitter } from "../emitter.js";
import { store } from "../store.js";

export const ui = createEmitter();

export const state = {
  view: "browse",
  folderId: null,
  entityId: null,
  search: "",
  typeFilters: new Set(),
  tagFilters: new Set(),
  favoritesOnly: false,
  sort: "name",
  density: "grid",
  graphScope: "all",
  graphLayout: "force",
  graphTypeFilters: new Set(),
  graphGroupFilters: new Set(),
  graphDirFilters: new Set(),
  rootEntityId: null,
  treeDepth: 2,
  mentionHighlight: true,
  theme: "dark",
  detailTab: "ficha",
  sidebarOpen: true,
};

export function setUI(patch, evt) {
  Object.assign(state, patch);
  ui.emit(evt || "change", patch);
}

const PERSIST = ["view", "graphLayout", "density", "sort", "mentionHighlight", "theme", "folderId", "entityId", "sidebarOpen", "graphScope"];

export function loadPrefs() {
  const saved = store.settings && store.settings.ui;
  if (saved && typeof saved === "object") {
    for (const key of PERSIST) {
      if (saved[key] !== undefined && saved[key] !== null) {
        state[key] = saved[key];
      }
    }
    if (Array.isArray(saved.typeFilters)) state.typeFilters = new Set(saved.typeFilters);
    if (Array.isArray(saved.graphTypeFilters)) state.graphTypeFilters = new Set(saved.graphTypeFilters);
    if (Array.isArray(saved.graphGroupFilters)) state.graphGroupFilters = new Set(saved.graphGroupFilters);
  }
  if (state.view === "tree") state.view = "graph";
  if (state.graphLayout !== "tree") state.graphLayout = state.graphLayout === "force" ? "force" : "force";
}

export function savePrefs() {
  const payload = {};
  for (const key of PERSIST) payload[key] = state[key];
  payload.typeFilters = [...state.typeFilters];
  payload.graphTypeFilters = [...state.graphTypeFilters];
  payload.graphGroupFilters = [...state.graphGroupFilters];
  store.setSetting("ui", payload);
}

export function toggleInSet(set, value) {
  if (set.has(value)) set.delete(value); else set.add(value);
  return set;
}
