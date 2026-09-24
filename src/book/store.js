// Armazenamento dos capitulos do livro (IndexedDB via kv-plugin, pasta "livro").
//
// Cada capitulo: { id, title, moment, html, text, attachments, images, order, createdAt, updatedAt }
//  - html: conteudo do editor (contenteditable);
//  - text: espelho em texto puro, usado para contar caracteres, buscar e previa;
//  - attachments: ids de fichas anexadas;
//  - images: ids das imagens do capitulo (pasta "livro_img").
// O texto e limitado a CHAR_LIMIT caracteres por capitulo.

import { createEmitter } from "../emitter.js";
import { uid } from "../util.js";
import { htmlToText, textToHtml } from "./richtext.js";
import { kvFolder } from "../universe.js";

const FOLDER = "livro";
const IMG_FOLDER = "livro_img";

export const CHAR_LIMIT = 50000;
export const MOMENT_SUGGESTIONS = ["", "Antes da Chegada", "Ano 1 DC", "Ano 10 DC", "Ano 25 DC", "Ano 50 DC", "Depois do Fim"];

function kv() {
  return kvFolder(FOLDER);
}

function kvImg() {
  return kvFolder(IMG_FOLDER);
}

function clean(text) {
  return String(text == null ? "" : text);
}

export const book = {
  chapters: new Map(),
  ready: false,
  storageOk: true,
  storageError: null,
  events: createEmitter(),
  imageCache: new Map(),

  async load() {
    try {
      const keys = (await kv().keys()).filter((k) => k.startsWith("cap:"));
      if (keys.length) {
        const vals = await kv().getMany(keys);
        for (const v of vals) if (v && v.id) this.chapters.set(v.id, this._normalize(v));
      }
    } catch (err) {
      this.storageOk = false;
      this.storageError = err;
      console.error(err);
    }
    this.ready = true;
    this.events.emit("loaded");
  },

  _normalize(raw) {
    const c = Object.assign({}, raw);
    c.id = c.id || uid();
    c.title = clean(c.title) || "Sem título";
    c.moment = clean(c.moment);
    let html = clean(c.html);
    const text = clean(c.text);
    if (!html && text) html = textToHtml(text);
    c.html = html;
    c.text = (text || htmlToText(html)).slice(0, CHAR_LIMIT);
    c.attachments = Array.isArray(c.attachments) ? c.attachments.filter((x) => typeof x === "string") : [];
    c.images = Array.isArray(c.images) ? c.images.filter((x) => typeof x === "string") : [];
    if (typeof c.order !== "number") c.order = 0;
    if (!c.createdAt) c.createdAt = new Date().toISOString();
    if (!c.updatedAt) c.updatedAt = c.createdAt;
    return c;
  },

  list() {
    return [...this.chapters.values()].sort((a, b) => (a.order - b.order) || String(a.createdAt).localeCompare(String(b.createdAt)));
  },

  get(id) {
    return this.chapters.get(id) || null;
  },

  nextOrder() {
    let max = 0;
    for (const c of this.chapters.values()) max = Math.max(max, c.order || 0);
    return max + 1;
  },

  create(patch) {
    const now = new Date().toISOString();
    const chapter = this._normalize(Object.assign({
      title: "Novo capítulo",
      moment: "",
      html: "",
      text: "",
      order: this.nextOrder(),
      createdAt: now,
      updatedAt: now,
    }, patch || {}));
    this.chapters.set(chapter.id, chapter);
    this.persist(chapter.id);
    this.events.emit("change", { action: "create", chapter });
    return chapter;
  },

  update(id, patch, opts) {
    const chapter = this.chapters.get(id);
    if (!chapter) return null;
    const next = Object.assign({}, patch);
    if (next.html != null && next.text == null) next.text = htmlToText(next.html);
    if (next.text != null && next.html == null) next.html = textToHtml(next.text);
    if (next.text != null) next.text = clean(next.text).slice(0, CHAR_LIMIT);
    if (next.html != null) {
      const ids = extractImageIds(next.html);
      const dropped = (chapter.images || []).filter((x) => !ids.includes(x));
      next.images = ids;
      if (dropped.length) this.dropImages(dropped);
    }
    Object.assign(chapter, next);
    chapter.updatedAt = new Date().toISOString();
    this.persist(id);
    if (!opts || !opts.quiet) this.events.emit("change", { action: "update", chapter });
    return chapter;
  },

  setAttachments(id, list) {
    const chapter = this.chapters.get(id);
    if (!chapter) return null;
    chapter.attachments = [...new Set((list || []).filter(Boolean))];
    chapter.updatedAt = new Date().toISOString();
    this.persist(id);
    this.events.emit("change", { action: "update", chapter });
    return chapter;
  },

  toggleAttachment(id, entityId) {
    const chapter = this.chapters.get(id);
    if (!chapter) return null;
    const has = chapter.attachments.includes(entityId);
    chapter.attachments = has
      ? chapter.attachments.filter((x) => x !== entityId)
      : [...chapter.attachments, entityId];
    chapter.updatedAt = new Date().toISOString();
    this.persist(id);
    this.events.emit("change", { action: "update", chapter });
    return !has;
  },

  remove(id) {
    const chapter = this.chapters.get(id);
    if (!chapter) return;
    this.dropImages(chapter.images || []);
    this.chapters.delete(id);
    if (this._pending) this._pending.delete(id);
    kv().delete("cap:" + id).catch(() => {});
    this.events.emit("change", { action: "delete", chapter });
  },

  async duplicate(id) {
    const chapter = this.chapters.get(id);
    if (!chapter) return null;
    const imgMap = new Map();
    for (const oldId of chapter.images || []) {
      try {
        const data = await this.getImage(oldId);
        if (!data) continue;
        imgMap.set(oldId, await this.putImage(data));
      } catch (e) { /* ignora */ }
    }
    let html = chapter.html || "";
    for (const [oldId, newId] of imgMap) {
      html = html.split('data-img="' + oldId + '"').join('data-img="' + newId + '"');
    }
    const copy = this.create({
      title: chapter.title + " (cópia)",
      moment: chapter.moment,
      html,
      images: extractImageIds(html),
      attachments: chapter.attachments.slice(),
      order: (chapter.order || 0) + 0.5,
    });
    return copy;
  },

  move(id, delta) {
    const ordered = this.list();
    const idx = ordered.findIndex((c) => c.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ordered.length) return false;
    ordered.splice(target, 0, ordered.splice(idx, 1)[0]);
    ordered.forEach((c, i) => {
      c.order = i + 1;
      this.persist(c.id);
    });
    this.events.emit("change", { action: "move" });
    return true;
  },

  persist(id) {
    const chapter = this.chapters.get(id);
    if (!chapter) return;
    if (!this._pending) this._pending = new Map();
    this._pending.set(id, chapter);
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const entries = [...this._pending.entries()];
      this._pending.clear();
      const pairs = entries.map(([k, v]) => ["cap:" + k, v]);
      kv().setMany(pairs).catch((e) => { console.error(e); this.storageOk = false; });
    }, 500);
  },

  flush() {
    clearTimeout(this._saveTimer);
    if (!this._pending || !this._pending.size) return Promise.resolve();
    const entries = [...this._pending.entries()];
    this._pending.clear();
    return kv().setMany(entries.map(([k, v]) => ["cap:" + k, v])).catch((e) => { console.error(e); });
  },

  // ---------- imagens ----------

  async putImage(dataUrl) {
    const id = uid("cimg");
    try {
      await kvImg().set(id, dataUrl);
      this.imageCache.set(id, dataUrl);
      return id;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  async getImage(id) {
    if (!id) return null;
    if (this.imageCache.has(id)) return this.imageCache.get(id);
    try {
      const data = await kvImg().get(id);
      if (data) this.imageCache.set(id, data);
      return data || null;
    } catch (err) {
      return null;
    }
  },

  dropImages(ids) {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return;
    for (const id of list) this.imageCache.delete(id);
    kvImg().deleteMany(list).catch(() => {});
  },

  stats() {
    let chars = 0;
    let words = 0;
    for (const c of this.chapters.values()) {
      chars += c.text.length;
      const t = c.text.trim();
      if (t) words += t.split(/\s+/).length;
    }
    return { chapters: this.chapters.size, chars, words };
  },

  async exportAll(opts) {
    opts = opts || {};
    const images = {};
    if (opts.withImages !== false) {
      const ids = [...new Set([...this.chapters.values()].flatMap((c) => c.images || []))];
      for (const id of ids) {
        try {
          const data = await this.getImage(id);
          if (data) images[id] = data;
        } catch (e) { /* ignora */ }
      }
    }
    return {
      kind: "codex-livro",
      version: 2,
      exportedAt: new Date().toISOString(),
      chapters: this.list(),
      images,
    };
  },

  async wipe() {
    for (const c of [...this.chapters.values()]) this.dropImages(c.images || []);
    this.chapters.clear();
    this.imageCache.clear();
    try {
      const keys = await kv().keys();
      const capKeys = keys.filter((k) => k.startsWith("cap:"));
      if (capKeys.length) await kv().deleteMany(capKeys);
      const imgKeys = await kvImg().keys();
      if (imgKeys.length) await kvImg().deleteMany(imgKeys);
    } catch (e) { console.error(e); }
    this.events.emit("change", { action: "wipe" });
  },

  async importAll(payload, mode, entityMap) {
    const chapters = (payload && Array.isArray(payload.chapters)) ? payload.chapters : null;
    if (!chapters) throw new Error("arquivo sem capítulos");
    if (mode === "replace") {
      for (const c of [...this.chapters.values()]) this.remove(c.id);
    }
    const imgMap = new Map();
    const idMap = new Map();
    const sourceImages = (payload && payload.images) || {};
    let order = this.nextOrder();
    const created = [];
    for (const raw of chapters) {
      const oldId = raw && raw.id;
      const chapter = this._normalize(Object.assign({}, raw, { id: undefined, order: order++ }));
      chapter.id = (mode === "replace" || !oldId || !this.chapters.has(oldId)) ? (oldId || uid()) : uid();
      if (oldId) idMap.set(oldId, chapter.id);
      if (entityMap && entityMap.size) {
        chapter.attachments = chapter.attachments.map((id) => entityMap.get(id) || id);
      }
      for (const ref of chapter.images || []) {
        if (imgMap.has(ref) || !sourceImages[ref]) continue;
        try { imgMap.set(ref, await this.putImage(sourceImages[ref])); } catch (e) { /* ignora */ }
      }
      for (const [ref, newId] of imgMap) {
        if (chapter.html.includes('data-img="' + ref + '"')) {
          chapter.html = chapter.html.split('data-img="' + ref + '"').join('data-img="' + newId + '"');
        }
      }
      chapter.images = extractImageIds(chapter.html);
      this.chapters.set(chapter.id, chapter);
      this.persist(chapter.id);
      created.push(chapter);
    }
    this.events.emit("change", { action: "import" });
    return { chapters: created, idMap };
  },
};

function extractImageIds(html) {
  const out = [];
  const re = /data-img="([^"]+)"/g;
  let m;
  while ((m = re.exec(String(html || "")))) out.push(m[1]);
  return [...new Set(out)];
}
