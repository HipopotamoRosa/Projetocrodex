import { createEmitter } from "./emitter.js";
import { uid, norm, similarity } from "./util.js";
import { kvFolder } from "./universe.js";
import { allTypes, allKinds, typeById, kindById, defaultKind, RELATION_GROUPS } from "./data.js";

const FOLDER = "codex";
const IMG_FOLDER = "codex_images";

function folderStore() {
  return kvFolder(FOLDER);
}

function imageStore() {
  return kvFolder(IMG_FOLDER);
}

function migrateImages(entity) {
  let changed = false;
  if (!Array.isArray(entity.images)) {
    entity.images = [];
    if (entity.image && entity.image.value) {
      entity.images.push({
        id: uid("im"),
        label: "Retrato",
        ref: entity.image,
        addedAt: entity.createdAt || Date.now(),
      });
    }
    entity.image = null;
    changed = true;
  }
  if (!Array.isArray(entity.descImages)) {
    entity.descImages = [];
    changed = true;
  }
  if (entity.images.length && (typeof entity.imageIndex !== "number" || entity.imageIndex < 0 || entity.imageIndex >= entity.images.length)) {
    entity.imageIndex = 0;
    changed = true;
  }
  return changed;
}

function isKv(ref) {
  return !!ref && ref.kind === "kv" && typeof ref.value === "string";
}

// "é amante de" → "amante"; "É escravo(a) de" → "escravo"
function slugKindId(label) {
  const stop = new Set(["e", "de", "do", "da", "dos", "das", "em", "a", "o", "as", "os", "com", "para", "por", "no", "na", "que", "um", "uma", "seu", "sua", "tem", "esta", "está"]);
  const words = norm(label).split(" ").filter((w) => w && !stop.has(w));
  const id = words.slice(0, 3).join("_").replace(/[^a-z0-9_]/g, "");
  return id || "tipo";
}

export const store = {
  entities: new Map(),
  folders: new Map(),
  relations: new Map(),
  settings: {},
  events: createEmitter(),
  ready: false,
  storageError: null,
  imageCache: new Map(),
  storageOk: true,

  async load() {
    try {
      const keys = await folderStore().keys();
      const entityKeys = keys.filter((k) => k.startsWith("ent:"));
      if (entityKeys.length) {
        const vals = await folderStore().getMany(entityKeys);
        entityKeys.forEach((k, idx) => {
          const v = vals[idx];
          if (v && v.id) this.entities.set(v.id, v);
        });
      }
      const folders = await folderStore().get("folders");
      if (Array.isArray(folders)) for (const f of folders) this.folders.set(f.id, f);
      const rels = await folderStore().get("relations");
      if (Array.isArray(rels)) for (const r of rels) this.relations.set(r.id, r);
      const settings = await folderStore().get("settings");
      if (settings && typeof settings === "object") this.settings = settings;
      for (const entity of this.entities.values()) {
        if (migrateImages(entity)) this.persistEntity(entity.id);
      }
    } catch (err) {
      this.storageError = err;
      this.storageOk = false;
      console.error("Falha ao carregar dados", err);
    }
    this.ready = true;
    this.events.emit("loaded");
    return this;
  },

  _saveEntity: null,
  persistEntity(id) {
    if (!this._saveEntity) {
      const queue = new Set();
      this._saveEntity = () => {
        const ids = [...queue];
        queue.clear();
        const pairs = ids.map((i) => ["ent:" + i, this.entities.get(i)]).filter((p) => p[1]);
        const dels = ids.filter((i) => !this.entities.get(i));
        folderStore().setMany(pairs).catch((e) => console.error(e));
        if (dels.length) folderStore().deleteMany(dels.map((i) => "ent:" + i)).catch(() => {});
      };
      this._saveEntity.queue = queue;
    }
    this._saveEntity.queue.add(id);
    clearTimeout(this._saveEntity._t);
    this._saveEntity._t = setTimeout(this._saveEntity, 350);
  },

  // Grava agora o que estiver na fila de salvamento (usado antes de trocar de universo).
  flush() {
    if (this._saveEntity) {
      clearTimeout(this._saveEntity._t);
      this._saveEntity();
    }
    return Promise.resolve();
  },

  saveFolders() {
    return folderStore().set("folders", [...this.folders.values()]).catch((e) => console.error(e));
  },

  saveRelations() {
    return folderStore().set("relations", [...this.relations.values()]).catch((e) => console.error(e));
  },

  saveSettings() {
    return folderStore().set("settings", this.settings).catch((e) => console.error(e));
  },

  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    this.events.emit("settings", key);
  },

  types() {
    return allTypes(this.settings.customTypes);
  },

  type(id) {
    return typeById(id, this.settings.customTypes);
  },

  allEntities() {
    return [...this.entities.values()];
  },

  getEntity(id) {
    return this.entities.get(id) || null;
  },

  createEntity(data) {
    const now = Date.now();
    const entity = Object.assign(
      {
        id: uid("ent"),
        type: "personagem",
        name: "Sem nome",
        aliases: [],
        summary: "",
        description: "",
        tags: [],
        fields: {},
        folderId: null,
        color: null,
        favorite: false,
        image: null,
        images: [],
        descImages: [],
        imageIndex: 0,
        createdAt: now,
        updatedAt: now,
        source: null,
      },
      data
    );
    if (!entity.name) entity.name = "Sem nome";
    this.entities.set(entity.id, entity);
    this.persistEntity(entity.id);
    this.events.emit("entity", { action: "create", entity });
    this.events.emit("change");
    return entity;
  },

  updateEntity(id, patch, opts) {
    const entity = this.entities.get(id);
    if (!entity) return null;
    Object.assign(entity, patch, { updatedAt: Date.now() });
    this.persistEntity(id);
    if (!opts || !opts.silent) this.events.emit("entity", { action: "update", entity });
    if (!opts || !opts.quiet) this.events.emit("change");
    return entity;
  },

  deleteEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) return;
    for (const ref of this.imageRefsOf(entity)) imageStore().delete(ref.value).catch(() => {});
    for (const ref of this.imageRefsOf(entity)) this.imageCache.delete(ref.value);
    this.entities.delete(id);
    for (const r of [...this.relations.values()]) {
      if (r.from === id || r.to === id) this.relations.delete(r.id);
    }
    this.persistEntity(id);
    this.saveRelations();
    this.events.emit("entity", { action: "delete", entity });
    this.events.emit("change");
  },

  setImage(id, image) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const active = this.activeImage(entity);
    if (active) return this.replaceEntityImage(id, active.id, image);
    return this.addEntityImage(id, { ref: image });
  },

  // ---- galeria de imagens da ficha (até N "tipos" por ficha) ----
  images(entity) {
    if (!entity) return [];
    if (!Array.isArray(entity.images)) migrateImages(entity);
    return entity.images;
  },

  descImages(entity) {
    if (!entity) return [];
    if (!Array.isArray(entity.descImages)) migrateImages(entity);
    return entity.descImages;
  },

  activeIndex(entity) {
    if (!entity) return 0;
    const imgs = this.images(entity);
    if (!imgs.length) return 0;
    const i = typeof entity.imageIndex === "number" ? entity.imageIndex : 0;
    return Math.min(Math.max(0, i), imgs.length - 1);
  },

  activeImage(entity) {
    const imgs = this.images(entity);
    return imgs.length ? imgs[this.activeIndex(entity)] : null;
  },

  imageById(entity, imageId) {
    return this.images(entity).find((x) => x.id === imageId) || null;
  },

  setActiveImage(id, imageId) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const imgs = this.images(entity);
    const i = imgs.findIndex((x) => x.id === imageId);
    if (i < 0) return;
    this.updateEntity(id, { imageIndex: i, images: imgs }, { quiet: true });
  },

  addEntityImage(id, opts) {
    opts = opts || {};
    const entity = this.entities.get(id);
    if (!entity || !opts.ref) return null;
    const imgs = this.images(entity);
    const img = {
      id: uid("im"),
      label: opts.label || (imgs.length ? "Imagem " + (imgs.length + 1) : "Retrato"),
      ref: opts.ref,
      addedAt: Date.now(),
      byAI: !!opts.byAI,
    };
    imgs.push(img);
    this.updateEntity(id, { images: imgs, imageIndex: imgs.length - 1 });
    return img;
  },

  renameEntityImage(id, imageId, label) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const imgs = this.images(entity);
    const img = imgs.find((x) => x.id === imageId);
    if (!img) return;
    img.label = label;
    this.updateEntity(id, { images: imgs });
  },

  setEntityBoxes(id, boxes) {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const list = Array.isArray(boxes) ? boxes.map((b) => String(b == null ? "" : b).trim()).filter(Boolean) : [];
    return this.updateEntity(id, { boxes: list });
  },

  async replaceEntityImage(id, imageId, ref) {
    const entity = this.entities.get(id);
    if (!entity || !ref) return null;
    const imgs = this.images(entity);
    const img = imageId ? imgs.find((x) => x.id === imageId) : this.activeImage(entity);
    if (!img) return null;
    const old = img.ref;
    img.ref = ref;
    img.updatedAt = Date.now();
    this.updateEntity(id, { images: imgs });
    if (isKv(old) && old.value !== ref.value) {
      this.imageCache.delete(old.value);
      imageStore().delete(old.value).catch(() => {});
    }
    return img;
  },

  async removeEntityImage(id, imageId) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const imgs = this.images(entity);
    const i = imgs.findIndex((x) => x.id === imageId);
    if (i < 0) return;
    const gone = imgs.splice(i, 1)[0];
    const patch = { images: imgs };
    if (imgs.length && typeof entity.imageIndex === "number" && i <= entity.imageIndex) {
      patch.imageIndex = Math.max(0, entity.imageIndex - 1);
    }
    this.updateEntity(id, patch);
    if (isKv(gone.ref)) {
      this.imageCache.delete(gone.ref.value);
      imageStore().delete(gone.ref.value).catch(() => {});
    }
  },

  // ---- imagens anexadas à descrição ----
  addDescImage(id, opts) {
    opts = opts || {};
    const entity = this.entities.get(id);
    if (!entity || !opts.ref) return null;
    const list = this.descImages(entity);
    const img = { id: uid("im"), ref: opts.ref, caption: opts.caption || "", addedAt: Date.now() };
    list.push(img);
    this.updateEntity(id, { descImages: list });
    return img;
  },

  updateDescImage(id, imageId, patch) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const list = this.descImages(entity);
    const img = list.find((x) => x.id === imageId);
    if (!img) return;
    Object.assign(img, patch);
    this.updateEntity(id, { descImages: list });
  },

  async removeDescImage(id, imageId) {
    const entity = this.entities.get(id);
    if (!entity) return;
    const list = this.descImages(entity);
    const i = list.findIndex((x) => x.id === imageId);
    if (i < 0) return;
    const gone = list.splice(i, 1)[0];
    this.updateEntity(id, { descImages: list });
    if (isKv(gone.ref)) {
      this.imageCache.delete(gone.ref.value);
      imageStore().delete(gone.ref.value).catch(() => {});
    }
  },

  imageRefsOf(entity) {
    const out = [];
    const push = (ref) => { if (isKv(ref) && !out.some((r) => r.value === ref.value)) out.push(ref); };
    for (const im of this.images(entity)) push(im.ref);
    for (const im of this.descImages(entity)) push(im.ref);
    return out;
  },

  async getImageSrc(entity, imageId) {
    if (!entity) return null;
    const img = imageId ? this.imageById(entity, imageId) : this.activeImage(entity);
    return img ? this.getSrcByRef(img.ref) : null;
  },

  async getSrcByRef(ref) {
    if (!ref) return null;
    if (ref.kind === "url") return ref.value;
    if (!ref.value) return null;
    if (this.imageCache.has(ref.value)) return this.imageCache.get(ref.value);
    try {
      const dataUrl = await imageStore().get(ref.value);
      if (dataUrl) this.imageCache.set(ref.value, dataUrl);
      return dataUrl || null;
    } catch (err) {
      return null;
    }
  },

  async duplicateEntity(id) {
    const src = this.entities.get(id);
    if (!src) return null;
    const cloned = new Map();
    const cloneRef = async (ref) => {
      if (!ref) return null;
      if (!isKv(ref)) return { kind: ref.kind, value: ref.value };
      if (cloned.has(ref.value)) return cloned.get(ref.value);
      let out = ref;
      try {
        const data = await imageStore().get(ref.value);
        if (data) {
          const newId = uid("img");
          await imageStore().set(newId, data);
          out = { kind: "kv", value: newId };
        }
      } catch (err) { /* mantém a referência original */ }
      cloned.set(ref.value, out);
      return out;
    };
    const images = [];
    for (const im of this.images(src)) images.push(Object.assign({}, im, { id: uid("im"), ref: await cloneRef(im.ref) }));
    const descImages = [];
    for (const im of this.descImages(src)) descImages.push(Object.assign({}, im, { id: uid("im"), ref: await cloneRef(im.ref) }));
    const copy = this.createEntity(Object.assign({}, src, {
      id: undefined,
      name: src.name + " (cópia)",
      image: null,
      images,
      descImages,
      imageIndex: this.activeIndex(src),
      fields: Object.assign({}, src.fields),
      aliases: (src.aliases || []).slice(),
      tags: (src.tags || []).slice(),
      favorite: false,
      createdAt: undefined,
      updatedAt: undefined,
    }));
    return copy;
  },

  async putImageData(dataUrl) {
    const id = uid("img");
    await imageStore().set(id, dataUrl);
    return { kind: "kv", value: id };
  },

  createFolder(data) {
    const folder = Object.assign(
      { id: uid("fld"), name: "Nova pasta", icon: "📁", color: null, parentId: null, description: "", createdAt: Date.now() },
      data
    );
    this.folders.set(folder.id, folder);
    this.saveFolders();
    this.events.emit("change");
    return folder;
  },

  updateFolder(id, patch) {
    const folder = this.folders.get(id);
    if (!folder) return null;
    Object.assign(folder, patch);
    this.saveFolders();
    this.events.emit("change");
    return folder;
  },

  deleteFolder(id) {
    const folder = this.folders.get(id);
    if (!folder) return;
    const parentId = folder.parentId || null;
    for (const f of this.folders.values()) if (f.parentId === id) f.parentId = parentId;
    for (const e of this.entities.values()) if (e.folderId === id) this.updateEntity(e.id, { folderId: parentId }, { quiet: true });
    this.folders.delete(id);
    this.saveFolders();
    this.events.emit("change");
  },

  folderPath(id) {
    const path = [];
    let cur = this.folders.get(id);
    let guard = 0;
    while (cur && guard++ < 40) {
      path.unshift(cur);
      cur = cur.parentId ? this.folders.get(cur.parentId) : null;
    }
    return path;
  },

  childFolders(parentId) {
    return [...this.folders.values()]
      .filter((f) => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },

  descendantFolderIds(id) {
    const out = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of this.folders.values()) {
        if (!out.has(f.id) && f.parentId && out.has(f.parentId)) {
          out.add(f.id);
          changed = true;
        }
      }
    }
    return out;
  },

  // ---------- catálogo de tipos de relação (anexos) ----------
  // `settings.customKinds` guarda os tipos criados pelo usuário E as edições
  // feitas nos tipos padrão (mesmo `id` sobrescreve o padrão). Os ids nunca
  // mudam quando o usuário reescreve uma frase, senão as relações antigas
  // perderiam o tipo.

  kinds() {
    return allKinds(this.settings.customKinds);
  },

  kind(id) {
    return kindById(id, this.settings.customKinds);
  },

  saveKinds() {
    return folderStore().set("settings", this.settings).catch((e) => console.error(e));
  },

  _customKinds() {
    if (!Array.isArray(this.settings.customKinds)) this.settings.customKinds = [];
    return this.settings.customKinds;
  },

  isCustomKind(id) {
    return this._customKinds().some((k) => k.id === id);
  },

  kindUsage(id) {
    let n = 0;
    for (const r of this.relations.values()) if (r.kind === id) n++;
    return n;
  },

  addKind(data) {
    data = data || {};
    const custom = this._customKinds();
    const used = new Set(this.kinds().map((k) => k.id));
    let id = slugKindId(data.id || data.f || data.i || "tipo");
    let base = id;
    let n = 2;
    while (used.has(id)) id = base + "_" + n++;
    const kind = {
      id,
      f: String(data.f || "tem ligação com").trim() || "tem ligação com",
      i: String(data.i || "").trim(),
      g: RELATION_GROUPS[data.g] ? data.g : "outros",
      sym: !!data.sym,
      step: Number(data.step) || 0,
      custom: true,
      createdAt: Date.now(),
    };
    if (kind.sym) kind.i = kind.f;
    custom.push(kind);
    this.saveKinds();
    this.events.emit("kind", { action: "create", kind });
    this.events.emit("change");
    return kind;
  },

  updateKind(id, patch) {
    patch = patch || {};
    const custom = this._customKinds();
    let kind = custom.find((k) => k.id === id);
    if (!kind) {
      const base = defaultKind(id);
      if (!base) return null;
      kind = Object.assign({}, base, { custom: true });
      custom.push(kind);
    }
    if (patch.f != null) kind.f = String(patch.f).trim() || kind.f;
    if (patch.i != null) kind.i = String(patch.i).trim();
    if (patch.g != null && RELATION_GROUPS[patch.g]) kind.g = patch.g;
    if (patch.sym != null) kind.sym = !!patch.sym;
    if (patch.step != null) kind.step = Number(patch.step) || 0;
    if (kind.sym) kind.i = kind.f;
    this.saveKinds();
    this.events.emit("kind", { action: "update", kind });
    this.events.emit("change");
    return kind;
  },

  // Devolve o tipo ao padrão (só para os que existem em RELATION_KINDS).
  restoreKind(id) {
    const custom = this._customKinds();
    const i = custom.findIndex((k) => k.id === id);
    if (i < 0) return null;
    if (!defaultKind(id)) return null;
    custom.splice(i, 1);
    this.saveKinds();
    this.events.emit("kind", { action: "restore", id });
    this.events.emit("change");
    return this.kind(id);
  },

  // `mode`: "convert" devolve as relações ao tipo "relacionado";
  //         "delete" apaga as relações que usavam o tipo.
  removeKind(id, mode) {
    const custom = this._customKinds();
    const i = custom.findIndex((k) => k.id === id);
    if (i < 0) return null;
    const [kind] = custom.splice(i, 1);
    const affected = [...this.relations.values()].filter((r) => r.kind === id);
    if (affected.length) {
      if (mode === "delete") {
        for (const r of affected) this.relations.delete(r.id);
      } else {
        for (const r of affected) r.kind = "relacionado";
      }
      this.saveRelations();
    }
    this.saveKinds();
    this.events.emit("kind", { action: "remove", kind, affected: affected.length });
    this.events.emit("change");
    return { kind, affected: affected.length };
  },

  // Agrupa os tipos por grupo (para a UI), na ordem de RELATION_GROUPS.
  kindGroups() {
    const out = [];
    for (const g of Object.keys(RELATION_GROUPS)) {
      const kinds = this.kinds().filter((k) => (RELATION_GROUPS[k.g] ? k.g : "outros") === g);
      if (kinds.length) out.push({ id: g, info: RELATION_GROUPS[g], kinds });
    }
    return out;
  },

  createRelation(data) {
    const from = data.from;
    const to = data.to;
    if (!from || !to || from === to) return null;
    const kind = data.kind || "relacionado";
    const k = this.kind(kind);
    const existing = this.findRelation(from, to, kind);
    if (existing) {
      if (data.notes) this.updateRelation(existing.id, { notes: data.notes });
      return existing;
    }
    const rel = {
      id: uid("rel"),
      from,
      to,
      kind,
      label: data.label || "",
      notes: data.notes || "",
      createdAt: Date.now(),
      createdBy: data.createdBy || "user",
    };
    this.relations.set(rel.id, rel);
    this.saveRelations();
    this.events.emit("relation", { action: "create", relation: rel });
    this.events.emit("change");
    return rel;
  },

  findRelation(a, b, kind) {
    for (const r of this.relations.values()) {
      if (kind && r.kind !== kind) continue;
      const k = this.kind(r.kind);
      if (k.sym) {
        if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) return r;
      } else if (r.from === a && r.to === b) return r;
    }
    return null;
  },

  updateRelation(id, patch) {
    const rel = this.relations.get(id);
    if (!rel) return null;
    Object.assign(rel, patch);
    this.saveRelations();
    this.events.emit("change");
    return rel;
  },

  deleteRelation(id) {
    this.relations.delete(id);
    this.saveRelations();
    this.events.emit("change");
  },

  relationsOf(id) {
    return [...this.relations.values()].filter((r) => r.from === id || r.to === id);
  },

  relationView(rel, fromPerspective) {
    const k = this.kind(rel.kind);
    const other = rel.from === fromPerspective ? rel.to : rel.from;
    const forward = rel.from === fromPerspective;
    const label = rel.label || (forward ? k.f : k.i || k.f);
    return { rel, kind: k, otherId: other, other: this.getEntity(other), label, forward, group: k.g };
  },

  search(query, opts) {
    opts = opts || {};
    const q = String(query || "").trim();
    if (!q) return [];
    const nq = norm(q);
    const results = [];
    for (const e of this.entities.values()) {
      if (opts.excludeId && e.id === opts.excludeId) continue;
      let score = 0;
      const nn = norm(e.name);
      if (nn === nq) score = 100;
      else if (nn.startsWith(nq)) score = 70;
      else if (nn.includes(nq)) score = 55;
      for (const a of e.aliases || []) {
        const na = norm(a);
        if (na === nq) score = Math.max(score, 95);
        else if (na.startsWith(nq)) score = Math.max(score, 65);
        else if (na.includes(nq)) score = Math.max(score, 50);
      }
      if ((e.tags || []).some((t) => norm(t).includes(nq))) score = Math.max(score, 45);
      if (score < 40 && nn.length && similarity(nq, nn) > 0.72) score = Math.max(score, 40 + 20 * similarity(nq, nn));
      if (score < 40 && e.summary && norm(e.summary).includes(nq)) score = Math.max(score, 25);
      if (score < 40) {
        const fieldText = Object.values(e.fields || {}).join(" ");
        if (norm(fieldText).includes(nq)) score = Math.max(score, 20);
      }
      if (score > 0) results.push({ entity: e, score: score + (e.favorite ? 3 : 0) });
    }
    results.sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name, "pt-BR"));
    return results;
  },

  suggestByName(name, opts) {
    opts = opts || {};
    const q = String(name || "").trim();
    if (!q) return [];
    const nq = norm(q);
    const out = [];
    for (const e of this.entities.values()) {
      if (opts.excludeId && e.id === opts.excludeId) continue;
      let score = similarity(q, e.name);
      for (const a of e.aliases || []) score = Math.max(score, similarity(q, a));
      if (norm(e.name) === nq) score = 1.5;
      out.push({ entity: e, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.filter((r) => r.score >= (opts.min == null ? 0.6 : opts.min)).slice(0, opts.limit || 5);
  },

  resolveName(name, excludeId) {
    const q = norm(name);
    if (!q) return null;
    for (const e of this.entities.values()) {
      if (norm(e.name) === q) return e;
      for (const a of e.aliases || []) if (norm(a) === q) return e;
    }
    const sug = this.suggestByName(name, { excludeId, min: 0.86, limit: 1 });
    return sug.length ? sug[0].entity : null;
  },

  mentionNames(excludeId) {
    const names = [];
    for (const e of this.entities.values()) {
      if (e.id === excludeId) continue;
      for (const a of e.aliases || []) if (a && a.length >= 3) names.push(a);
      if (e.name && e.name.length >= 3) names.push(e.name);
    }
    return [...new Set(names)];
  },

  stats() {
    const byType = {};
    for (const e of this.entities.values()) byType[e.type] = (byType[e.type] || 0) + 1;
    return {
      entities: this.entities.size,
      relations: this.relations.size,
      folders: this.folders.size,
      byType,
    };
  },

  relationGroups() {
    const groups = {};
    for (const r of this.relations.values()) {
      const k = this.kind(r.kind);
      groups[k.g] = (groups[k.g] || 0) + 1;
    }
    return groups;
  },

  async exportAll(opts) {
    opts = opts || {};
    const payload = {
      app: "codex",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      folders: [...this.folders.values()],
      entities: [...this.entities.values()],
      relations: [...this.relations.values()],
      images: {},
    };
    if (opts.withImages !== false) {
      const ids = [];
      for (const e of this.entities.values()) for (const ref of this.imageRefsOf(e)) ids.push(ref.value);
      for (const id of [...new Set(ids)]) {
        try {
          const data = await imageStore().get(id);
          if (data) payload.images[id] = data;
        } catch (err) { /* ignora */ }
      }
    }
    return payload;
  },

  async importAll(payload, mode) {
    if (!payload || !Array.isArray(payload.entities)) throw new Error("Arquivo inválido");
    const replace = mode === "replace";
    if (replace) {
      for (const e of this.entities.values()) for (const ref of this.imageRefsOf(e)) imageStore().delete(ref.value).catch(() => {});
      this.entities.clear();
      this.folders.clear();
      this.relations.clear();
      const keys = await folderStore().keys();
      const entKeys = keys.filter((k) => k.startsWith("ent:"));
      if (entKeys.length) await folderStore().deleteMany(entKeys);
    }
    const folderMap = new Map();
    const entityMap = new Map();
    const imgMap = new Map();
    const remapRef = async (ref) => {
      if (!isKv(ref)) return ref || null;
      if (!payload.images || !payload.images[ref.value]) return ref;
      if (imgMap.has(ref.value)) return imgMap.get(ref.value);
      const newId = uid("img");
      let out = ref;
      try {
        await imageStore().set(newId, payload.images[ref.value]);
        out = { kind: "kv", value: newId };
      } catch (err) { /* mantém a referência original */ }
      imgMap.set(ref.value, out);
      return out;
    };
    for (const f of payload.folders || []) {
      const id = !replace && this.folders.has(f.id) ? uid("fld") : f.id;
      folderMap.set(f.id, id);
      this.folders.set(id, Object.assign({}, f, { id, parentId: null }));
    }
    for (const f of payload.folders || []) {
      const id = folderMap.get(f.id);
      const stored = this.folders.get(id);
      if (stored) stored.parentId = f.parentId ? (folderMap.get(f.parentId) || null) : null;
    }
    for (const e of payload.entities) {
      const id = !replace && this.entities.has(e.id) ? uid("ent") : e.id;
      entityMap.set(e.id, id);
      const incoming = Array.isArray(e.images)
        ? e.images
        : (e.image && e.image.value ? [{ id: uid("im"), label: "Retrato", ref: e.image }] : []);
      const images = [];
      for (const im of incoming) {
        if (!im) continue;
        const ref = await remapRef(im.ref || im);
        if (ref) images.push({ id: im.id || uid("im"), label: im.label || "Imagem", ref, byAI: !!im.byAI, addedAt: im.addedAt || Date.now() });
      }
      const descImages = [];
      for (const im of Array.isArray(e.descImages) ? e.descImages : []) {
        const ref = await remapRef(im.ref || im);
        if (ref) descImages.push({ id: im.id || uid("im"), ref, caption: im.caption || "", addedAt: im.addedAt || Date.now() });
      }
      const entity = Object.assign({}, e, {
        id,
        image: null,
        images,
        descImages,
        imageIndex: typeof e.imageIndex === "number" ? e.imageIndex : 0,
        folderId: e.folderId ? (folderMap.get(e.folderId) || null) : null,
        fields: Object.assign({}, e.fields || {}),
        aliases: (e.aliases || []).slice(),
        tags: (e.tags || []).slice(),
      });
      migrateImages(entity);
      this.entities.set(id, entity);
      this.persistEntity(id);
    }
    for (const r of payload.relations || []) {
      const from = entityMap.get(r.from);
      const to = entityMap.get(r.to);
      if (!from || !to) continue;
      const id = !replace && this.relations.has(r.id) ? uid("rel") : r.id;
      this.relations.set(id, Object.assign({}, r, { id, from, to }));
    }
    this.saveFolders();
    this.saveRelations();
    if (payload.settings && Array.isArray(payload.settings.customKinds)) {
      const incoming = payload.settings.customKinds.filter((k) => k && k.id);
      if (replace) {
        this.settings.customKinds = incoming.slice();
      } else {
        const byId = new Map(this._customKinds().map((k) => [k.id, k]));
        for (const k of incoming) byId.set(k.id, k);
        this.settings.customKinds = [...byId.values()];
      }
      this.saveSettings();
    }
    this.events.emit("change");
    return { entities: payload.entities.length, relations: (payload.relations || []).length, idMap: entityMap, folderMap };
  },

  async wipe() {
    const keys = await folderStore().keys();
    if (keys.length) await folderStore().deleteMany(keys);
    const imgKeys = await imageStore().keys();
    if (imgKeys.length) await imageStore().deleteMany(imgKeys);
    this.entities.clear();
    this.folders.clear();
    this.relations.clear();
    this.settings = {};
    this.imageCache.clear();
    this.events.emit("change");
  },
};
