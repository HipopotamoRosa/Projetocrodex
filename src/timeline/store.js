// Eventos da linha do tempo (IndexedDB via kv-plugin, pasta "timeline").
//
// Cada evento: { id, title, date, sortKey, description, entityIds, chapterId, createdAt, updatedAt }
// Os capitulos do Livro que tem "momento" preenchido tambem aparecem na
// cronologia (derivados em src/timeline/view.js), de modo que escrever o
// capitulo ja o coloca na história.

import { createEmitter } from "../emitter.js";
import { uid, norm } from "../util.js";
import { kvFolder } from "../universe.js";

const FOLDER = "timeline";
const PREFIX = "evt:";

const NAMED = {
  "antes da chegada": -1000000,
  "antes do inicio": -1000000,
  "depois do fim": 1000000,
  "sem data": null,
};

export function parseSortKey(label) {
  const raw = String(label == null ? "" : label).trim();
  if (!raw) return null;
  const low = norm(raw);
  if (low in NAMED) return NAMED[low];
  const m = low.match(/(\d[\d.\s]*)/);
  if (!m) return null;
  let n = Number(m[1].replace(/[.\s]/g, ""));
  if (!isFinite(n)) return null;
  if (/\bac\b/.test(low) || /\bantes\b/.test(low)) n = -Math.abs(n);
  return n;
}

function kv() {
  return kvFolder(FOLDER);
}

function clean(v) {
  return String(v == null ? "" : v);
}

export const timeline = {
  events: new Map(),
  ready: false,
  storageOk: true,
  eventBus: createEmitter(),

  async load() {
    try {
      const keys = (await kv().keys()).filter((k) => k.startsWith(PREFIX));
      if (keys.length) {
        const vals = await kv().getMany(keys);
        for (const v of vals) if (v && v.id) this.events.set(v.id, this._normalize(v));
      }
    } catch (err) {
      this.storageOk = false;
      console.error(err);
    }
    this.ready = true;
    this.eventBus.emit("loaded");
  },

  _normalize(raw) {
    const e = Object.assign({}, raw);
    e.id = e.id || uid("evt");
    e.title = clean(e.title) || "Novo evento";
    e.date = clean(e.date);
    e.description = clean(e.description);
    e.entityIds = Array.isArray(e.entityIds) ? e.entityIds.filter((x) => typeof x === "string") : [];
    e.chapterId = e.chapterId || null;
    if (typeof e.sortKey !== "number") e.sortKey = parseSortKey(e.date);
    if (!e.createdAt) e.createdAt = new Date().toISOString();
    if (!e.updatedAt) e.updatedAt = e.createdAt;
    return e;
  },

  list() {
    return [...this.events.values()].sort((a, b) => {
      const ka = typeof a.sortKey === "number" ? a.sortKey : Infinity;
      const kb = typeof b.sortKey === "number" ? b.sortKey : Infinity;
      if (ka !== kb) return ka - kb;
      return String(a.date).localeCompare(String(b.date), "pt-BR") || String(a.createdAt).localeCompare(String(b.createdAt));
    });
  },

  get(id) {
    return this.events.get(id) || null;
  },

  create(patch) {
    const now = new Date().toISOString();
    const event = this._normalize(Object.assign({
      title: "Novo evento",
      date: "",
      description: "",
      entityIds: [],
      chapterId: null,
      createdAt: now,
      updatedAt: now,
    }, patch || {}));
    if (typeof (patch || {}).sortKey !== "number") event.sortKey = parseSortKey(event.date);
    this.events.set(event.id, event);
    this.persist(event.id);
    this.eventBus.emit("change", { action: "create", event });
    return event;
  },

  update(id, patch, opts) {
    const event = this.events.get(id);
    if (!event) return null;
    const next = Object.assign({}, patch);
    if (next.date != null && next.sortKey == null) next.sortKey = parseSortKey(next.date);
    if (next.entityIds) next.entityIds = [...new Set(next.entityIds.filter(Boolean))];
    Object.assign(event, next);
    event.updatedAt = new Date().toISOString();
    this.persist(id);
    if (!opts || !opts.quiet) this.eventBus.emit("change", { action: "update", event });
    return event;
  },

  remove(id) {
    const event = this.events.get(id);
    if (!event) return;
    this.events.delete(id);
    if (this._pending) this._pending.delete(id);
    kv().delete(PREFIX + id).catch(() => {});
    this.eventBus.emit("change", { action: "delete", event });
  },

  forEntity(entityId) {
    return this.list().filter((e) => (e.entityIds || []).includes(entityId));
  },

  forChapter(chapterId) {
    return this.list().filter((e) => e.chapterId === chapterId);
  },

  dates() {
    const out = [];
    for (const e of this.list()) if (e.date && !out.includes(e.date)) out.push(e.date);
    return out;
  },

  persist(id) {
    const event = this.events.get(id);
    if (!event) return;
    if (!this._pending) this._pending = new Map();
    this._pending.set(id, event);
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flush(), 500);
  },

  flush() {
    clearTimeout(this._saveTimer);
    if (!this._pending || !this._pending.size) return Promise.resolve();
    const entries = [...this._pending.entries()];
    this._pending.clear();
    return kv().setMany(entries.map(([k, v]) => [PREFIX + k, v])).catch((e) => { console.error(e); });
  },

  exportAll() {
    return {
      kind: "codex-timeline",
      version: 1,
      exportedAt: new Date().toISOString(),
      events: this.list(),
    };
  },

  async wipe() {
    this.events.clear();
    try {
      const keys = await kv().keys();
      const evtKeys = keys.filter((k) => k.startsWith(PREFIX));
      if (evtKeys.length) await kv().deleteMany(evtKeys);
    } catch (e) { console.error(e); }
    this.eventBus.emit("change", { action: "wipe" });
  },

  importAll(payload, mode, entityMap, chapterMap) {
    const events = (payload && Array.isArray(payload.events)) ? payload.events : null;
    if (!events) throw new Error("arquivo sem eventos");
    if (mode === "replace") for (const e of [...this.events.values()]) this.remove(e.id);
    const created = [];
    for (const raw of events) {
      const event = this._normalize(Object.assign({}, raw, { id: undefined }));
      event.id = uid("evt");
      // Ids das fichas/capítulos que ganharam um novo id neste import.
      if (entityMap && entityMap.size) event.entityIds = event.entityIds.map((id) => entityMap.get(id) || id);
      if (chapterMap && chapterMap.size && event.chapterId) event.chapterId = chapterMap.get(event.chapterId) || event.chapterId;
      this.events.set(event.id, event);
      this.persist(event.id);
      created.push(event);
    }
    this.eventBus.emit("change", { action: "import" });
    return created;
  },
};
