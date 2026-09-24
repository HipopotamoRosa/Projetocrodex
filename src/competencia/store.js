// Competência: os gráficos de poder e as tags especiais das fichas.
//
// O sistema tem duas camadas independentes:
//
//  1. CATÁLOGO (chave "attrs", pasta "competencia") — quais gráficos existem,
//     como se chamam, de que cor são e qual é o máximo de cada um. É GLOBAL:
//     renomear "INTELIGÊNCIA" aqui renomeia o gráfico em todas as fichas de uma
//     vez — é justamente isso que permite trocar o nome a qualquer momento.
//
//  2. DADOS POR FICHA (chave "ent:<id>") — o valor de cada gráfico, uma
//     anotação curta embaixo de cada um, as DUAS famílias de etiquetas
//     (`tags` = Tags especiais, que saem no painel da Descrição; `medals` =
//     Condecorações, que saem no cabeçalho da ficha) e o texto que aparece sob
//     a grade.
//
// Os valores são guardados por ID de atributo (nunca pelo nome), então
// renomear um gráfico jamais embaralha os números.
//
// Quem desenha o painel dentro da Descrição da ficha é src/competencia/panel.js
// (usando o SVG de src/competencia/render.js); a aba de gerenciamento é
// src/competencia/view.js.

import { createEmitter } from "../emitter.js";
import { uid, norm } from "../util.js";
import { kvFolder } from "../universe.js";

const FOLDER = "competencia";
const K_ATTRS = "attrs";
const K_ENT = "ent:";

export const ATTR_COLORS = [
  "#22c55e", "#e879f9", "#22d3ee", "#facc15", "#ef4444", "#f97316",
  "#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#94a3b8",
];

// A grade que já nasce pronta quando a aba é aberta pela primeira vez — os
// mesmos seis gráficos que o usuário mandou de referência.
const DEFAULT_ATTRS = [
  ["DURABILIDADE", "#22c55e"],
  ["ENERGIA", "#e879f9"],
  ["HABILIDADES DE LUTA", "#22d3ee"],
  ["INTELIGÊNCIA", "#facc15"],
  ["VELOCIDADE", "#ef4444"],
  ["FORÇA", "#f97316"],
];

export const ATTR_PRESETS = [
  {
    id: "rpg", l: "Ficha de RPG", icon: "🎲",
    attrs: [["FORÇA", "#ef4444"], ["DESTREZA", "#22c55e"], ["CONSTITUIÇÃO", "#f97316"], ["INTELIGÊNCIA", "#facc15"], ["SABEDORIA", "#22d3ee"], ["CARISMA", "#e879f9"]],
  },
  {
    id: "poderes", l: "Poderes & habilidades", icon: "✨",
    attrs: [["PODER DE LUTA", "#ef4444"], ["TÉCNICA", "#22d3ee"], ["VELOCIDADE", "#facc15"], ["RESISTÊNCIA", "#22c55e"], ["CONTROLE DE ENERGIA", "#a78bfa"], ["ESTRATÉGIA", "#60a5fa"]],
  },
  {
    id: "narrativo", l: "Peso narrativo", icon: "📖",
    attrs: [["INFLUÊNCIA", "#a78bfa"], ["RECURSOS", "#fbbf24"], ["REPUTAÇÃO", "#e879f9"], ["CONHECIMENTO", "#22d3ee"], ["CARISMA", "#f472b6"], ["PERÍCIA", "#22c55e"]],
  },
];

export function makeAttr(name, color, extra) {
  const clean = String(name == null ? "" : name).trim() || "Novo gráfico";
  return Object.assign({
    id: uid("atr"),
    name: clean,
    icon: "",
    color: color || ATTR_COLORS[0],
    max: 10,
    hint: "",
  }, extra || {});
}

function blankData(entityId) {
  return { id: entityId, values: {}, notes: {}, tags: [], medals: [], caption: "", show: true, updatedAt: Date.now() };
}

// As duas famílias de etiquetas ("tags" e "medals") têm exatamente a mesma forma.
function cleanTagList(raw, prefix) {
  return (Array.isArray(raw) ? raw : [])
    .filter((t) => t && (t.label || t.name))
    .map((t) => ({
      id: t.id || uid(prefix),
      label: String(t.label || t.name || "").trim(),
      note: String(t.note == null ? "" : t.note),
      icon: String(t.icon == null ? "" : t.icon),
      color: String(t.color || "#a78bfa"),
    }));
}

const TAG_KINDS = { tags: { field: "tags", prefix: "tag" }, medals: { field: "medals", prefix: "med" } };

function tagKind(kind) {
  return TAG_KINDS[kind] || TAG_KINDS.tags;
}

function cleanData(raw, entityId) {
  const d = blankData(entityId);
  if (!raw || typeof raw !== "object") return d;
  const values = {};
  for (const [k, v] of Object.entries(raw.values || {})) {
    const n = Number(v);
    if (k && isFinite(n)) values[k] = n;
  }
  const notes = {};
  for (const [k, v] of Object.entries(raw.notes || {})) {
    const t = String(v == null ? "" : v);
    if (k && t.trim()) notes[k] = t;
  }
  d.values = values;
  d.notes = notes;
  d.tags = cleanTagList(raw.tags, "tag");
  d.medals = cleanTagList(raw.medals, "med");
  d.caption = String(raw.caption == null ? "" : raw.caption);
  d.show = raw.show !== false;
  d.updatedAt = Number(raw.updatedAt) || Date.now();
  return d;
}

function kv() {
  return kvFolder(FOLDER);
}

export const competencia = {
  attrs: [],
  data: new Map(),
  ready: false,
  storageOk: true,
  events: createEmitter(),

  async load() {
    try {
      const stored = await kv().get(K_ATTRS);
      this.attrs = (Array.isArray(stored) ? stored : [])
        .filter((a) => a && a.id && a.name)
        .map((a) => Object.assign(makeAttr(a.name, a.color), a, { max: Number(a.max) > 0 ? Number(a.max) : 10 }));
      if (!this.attrs.length) {
        this.attrs = DEFAULT_ATTRS.map(([name, color]) => makeAttr(name, color));
        this.persistAttrs();
      }
      const keys = (await kv().keys()).filter((k) => k.startsWith(K_ENT));
      if (keys.length) {
        const vals = await kv().getMany(keys);
        keys.forEach((k, i) => {
          const id = k.slice(K_ENT.length);
          if (vals[i]) this.data.set(id, cleanData(vals[i], id));
        });
      }
      this.pruneOrphans();
    } catch (err) {
      this.storageOk = false;
      console.error("Falha ao carregar a competência", err);
    }
    this.ready = true;
    this.events.emit("loaded");
    return this;
  },

  // Remove valores/anotações que apontam para atributos que não existem mais.
  pruneOrphans() {
    const known = new Set(this.attrs.map((a) => a.id));
    let changed = false;
    const dropped = [];
    for (const [id, data] of this.data) {
      for (const key of Object.keys(data.values)) if (!known.has(key)) { delete data.values[key]; changed = true; }
      for (const key of Object.keys(data.notes)) if (!known.has(key)) { delete data.notes[key]; changed = true; }
      if (!this.isMeaningful(data)) { this.data.delete(id); dropped.push(id); changed = true; }
    }
    if (dropped.length) kv().deleteMany(dropped.map((id) => K_ENT + id)).catch(() => {});
    if (changed) this.flush();
  },

  isMeaningful(data) {
    if (!data) return false;
    return Object.keys(data.values).length > 0
      || Object.keys(data.notes).length > 0
      || data.tags.length > 0
      || (Array.isArray(data.medals) && data.medals.length > 0)
      || !!String(data.caption || "").trim();
  },

  // ---------- catálogo ----------

  list() {
    return this.attrs;
  },

  getAttr(id) {
    return this.attrs.find((a) => a.id === id) || null;
  },

  attrIndex(id) {
    return this.attrs.findIndex((a) => a.id === id);
  },

  addAttr(patch) {
    const attr = makeAttr((patch || {}).name, (patch || {}).color, patch);
    this.attrs.push(attr);
    this._attrsDirty = true;
    this.flush();
    this.events.emit("change", { action: "attr-add", attr });
    return attr;
  },

  updateAttr(id, patch, opts) {
    const attr = this.getAttr(id);
    if (!attr) return null;
    Object.assign(attr, patch);
    if (patch && patch.name != null) attr.name = String(patch.name).trim() || attr.name;
    if (patch && patch.max != null) attr.max = Number(patch.max) > 0 ? Number(patch.max) : attr.max;
    this._attrsDirty = true;
    this.flush();
    if (!opts || !opts.quiet) this.events.emit("change", { action: "attr-update", attr });
    return attr;
  },

  removeAttr(id) {
    const i = this.attrIndex(id);
    if (i < 0) return;
    const [attr] = this.attrs.splice(i, 1);
    for (const data of this.data.values()) {
      delete data.values[id];
      delete data.notes[id];
    }
    this._attrsDirty = true;
    this.flush();
    if (attr) this.events.emit("change", { action: "attr-remove", attr });
    return attr;
  },
  moveAttr(id, delta) {
    const i = this.attrIndex(id);
    if (i < 0) return;
    const j = Math.min(this.attrs.length - 1, Math.max(0, i + delta));
    if (i === j) return;
    const [attr] = this.attrs.splice(i, 1);
    this.attrs.splice(j, 0, attr);
    this._attrsDirty = true;
    this.flush();
    this.events.emit("change", { action: "attr-move", attr });
    return attr;
  },

  // Junta uma grade pronta ao catálogo, ignorando nomes que já existem.
  applyPreset(presetId) {
    const preset = ATTR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return [];
    const used = new Set(this.attrs.map((a) => norm(a.name)));
    const added = [];
    for (const [name, color] of preset.attrs) {
      if (used.has(norm(name))) continue;
      used.add(norm(name));
      added.push(this.addAttr({ name, color }));
    }
    return added;
  },

  // ---------- dados por ficha ----------

  get(entityId) {
    return this.data.get(entityId) || null;
  },

  dataOf(entityId, create) {
    let data = this.data.get(entityId);
    if (!data && create) {
      data = blankData(entityId);
      this.data.set(entityId, data);
    }
    return data;
  },

  truth(entityId) {
    const stored = this.get(entityId);
    return {
      values: Object.assign({}, stored ? stored.values : {}),
      notes: Object.assign({}, stored ? stored.notes : {}),
      tags: stored ? stored.tags.slice() : [],
      medals: stored && Array.isArray(stored.medals) ? stored.medals.slice() : [],
      caption: stored ? stored.caption : "",
      show: stored ? stored.show !== false : true,
    };
  },

  valueOf(entityId, attrId) {
    const data = this.get(entityId);
    const v = data ? data.values[attrId] : null;
    return typeof v === "number" && isFinite(v) ? v : null;
  },

  setValue(entityId, attrId, value) {
    const data = this.dataOf(entityId, true);
    const n = Number(value);
    if (!isFinite(n)) return this.clearValue(entityId, attrId);
    const attr = this.getAttr(attrId);
    const max = attr ? attr.max : 10;
    data.values[attrId] = Math.min(max, Math.max(0, Math.round(n * 100) / 100));
    this.touch(entityId);
    return data.values[attrId];
  },

  clearValue(entityId, attrId) {
    const data = this.get(entityId);
    if (!data) return null;
    delete data.values[attrId];
    this.touch(entityId);
    return null;
  },

  noteOf(entityId, attrId) {
    const data = this.get(entityId);
    return data ? (data.notes[attrId] || "") : "";
  },

  setNote(entityId, attrId, text) {
    const data = this.dataOf(entityId, true);
    const clean = String(text == null ? "" : text);
    if (clean.trim()) data.notes[attrId] = clean;
    else delete data.notes[attrId];
    this.touch(entityId);
  },

  captionOf(entityId) {
    const data = this.get(entityId);
    return data ? data.caption : "";
  },

  setCaption(entityId, text) {
    const data = this.dataOf(entityId, true);
    data.caption = String(text == null ? "" : text);
    this.touch(entityId);
  },

  showsOnSheet(entityId) {
    const data = this.get(entityId);
    return !data || data.show !== false;
  },

  setShow(entityId, show) {
    const data = this.dataOf(entityId, true);
    data.show = !!show;
    this.touch(entityId);
    return data.show;
  },

  // ---------- etiquetas: Tags especiais ("tags") e Condecorações ("medals") ----------

  listOf(entityId, kind) {
    const data = this.get(entityId);
    const list = data ? data[tagKind(kind).field] : null;
    return Array.isArray(list) ? list : [];
  },

  tagsOf(entityId) { return this.listOf(entityId, "tags"); },
  medalsOf(entityId) { return this.listOf(entityId, "medals"); },

  addEntry(entityId, kind, tag) {
    const spec = tagKind(kind);
    const data = this.dataOf(entityId, true);
    if (!Array.isArray(data[spec.field])) data[spec.field] = [];
    const entry = {
      id: uid(spec.prefix),
      label: String((tag || {}).label || "").trim() || (kind === "medals" ? "Nova condecoração" : "Nova tag"),
      note: String((tag || {}).note == null ? "" : (tag || {}).note),
      icon: String((tag || {}).icon == null ? "" : (tag || {}).icon),
      color: String((tag || {}).color || "#a78bfa"),
    };
    data[spec.field].push(entry);
    this.touch(entityId);
    return entry;
  },

  updateEntry(entityId, kind, tagId, patch) {
    const data = this.get(entityId);
    if (!data) return null;
    const list = data[tagKind(kind).field] || [];
    const tag = list.find((t) => t.id === tagId);
    if (!tag) return null;
    Object.assign(tag, patch || {});
    if (tag.label != null) tag.label = String(tag.label).trim() || tag.label;
    this.touch(entityId);
    return tag;
  },

  removeEntry(entityId, kind, tagId) {
    const data = this.get(entityId);
    if (!data) return;
    const list = data[tagKind(kind).field] || [];
    const i = list.findIndex((t) => t.id === tagId);
    if (i < 0) return;
    list.splice(i, 1);
    this.touch(entityId);
  },

  addTag(entityId, tag) { return this.addEntry(entityId, "tags", tag); },
  updateTag(entityId, tagId, patch) { return this.updateEntry(entityId, "tags", tagId, patch); },
  removeTag(entityId, tagId) { return this.removeEntry(entityId, "tags", tagId); },

  addMedal(entityId, medal) { return this.addEntry(entityId, "medals", medal); },
  updateMedal(entityId, medalId, patch) { return this.updateEntry(entityId, "medals", medalId, patch); },
  removeMedal(entityId, medalId) { return this.removeEntry(entityId, "medals", medalId); },

  hasData(entityId) {
    return this.isMeaningful(this.get(entityId));
  },

  // Quantos gráficos já têm valor e quantas etiquetas a ficha tem — usado na lista.
  summary(entityId) {
    const data = this.get(entityId);
    if (!data) return { filled: 0, tags: 0, medals: 0, total: this.attrs.length };
    const filled = Object.keys(data.values).filter((k) => this.getAttr(k)).length;
    return { filled, tags: data.tags.length, medals: (data.medals || []).length, total: this.attrs.length };
  },

  entityIds() {
    return [...this.data.keys()].filter((id) => this.isMeaningful(this.data.get(id)));
  },

  // Todas as tags já usadas no arquivo, para sugerir ao criar uma nova.
  poolOf(kind) {
    const field = tagKind(kind).field;
    const pool = new Map();
    for (const data of this.data.values()) {
      for (const tag of data[field] || []) {
        const key = norm(tag.label);
        if (!key) continue;
        const cur = pool.get(key);
        if (cur) cur.count += 1;
        else pool.set(key, { label: tag.label, icon: tag.icon, color: tag.color, count: 1 });
      }
    }
    return [...pool.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  },

  tagsPool() { return this.poolOf("tags"); },
  medalsPool() { return this.poolOf("medals"); },

  // Ficha excluída: os dados de competência vão junto.
  forget(entityId) {
    if (!this.data.has(entityId)) return;
    this.data.delete(entityId);
    if (this._pending) this._pending.delete(entityId);
    kv().delete(K_ENT + entityId).catch(() => {});
  },

  copyData(fromId, toId) {
    const src = this.get(fromId);
    if (!src) return null;
    const copy = cleanData(JSON.parse(JSON.stringify(src)), toId);
    copy.tags = copy.tags.map((t) => Object.assign({}, t, { id: uid("tag") }));
    copy.medals = copy.medals.map((t) => Object.assign({}, t, { id: uid("med") }));
    this.data.set(toId, copy);
    this.touch(toId);
    return copy;
  },

  // ---------- persistência ----------

  persistAttrs() {
    return kv().set(K_ATTRS, this.attrs).catch((e) => console.error(e));
  },

  touch(entityId) {
    const data = this.data.get(entityId);
    if (!data) return;
    if (!this.isMeaningful(data)) {
      this.data.delete(entityId);
      if (this._pending) this._pending.delete(entityId);
      kv().delete(K_ENT + entityId).catch(() => {});
      this.events.emit("change", { action: "clear", entityId });
      return;
    }
    data.updatedAt = Date.now();
    if (!this._pending) this._pending = new Map();
    this._pending.set(entityId, data);
    this.events.emit("change", { action: "edit", entityId });
    this.flush();
  },

  // Agenda a gravação (usada a cada tecla digitada).
  flush() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._write(), 450);
  },

  // Grava agora.
  _write() {
    clearTimeout(this._saveTimer);
    if (this._attrsDirty) {
      this._attrsDirty = false;
      this.persistAttrs();
    }
    if (!this._pending || !this._pending.size) return Promise.resolve();
    const entries = [...this._pending.entries()];
    this._pending.clear();
    return kv().setMany(entries.map(([id, v]) => [K_ENT + id, v])).catch((e) => console.error(e));
  },

  // ---------- backup ----------

  exportAll() {
    const entities = {};
    for (const [id, data] of this.data) entities[id] = data;
    return {
      kind: "codex-competencia",
      version: 1,
      exportedAt: new Date().toISOString(),
      attrs: this.attrs,
      entities,
    };
  },

  importAll(payload, mode, entityMap) {
    if (!payload || typeof payload !== "object") throw new Error("arquivo inválido");
    const attrs = Array.isArray(payload.attrs) ? payload.attrs : [];
    const entities = payload.entities && typeof payload.entities === "object" ? payload.entities : {};
    if (mode === "replace") {
      for (const id of [...this.data.keys()]) this.forget(id);
      this.attrs = [];
    }
    let addedAttrs = 0;
    const byName = new Map(this.attrs.map((a) => [norm(a.name), a]));
    for (const raw of attrs) {
      if (!raw || !raw.name) continue;
      const key = norm(raw.name);
      if (byName.has(key)) continue;
      const attr = makeAttr(raw.name, raw.color, { max: raw.max, hint: raw.hint, icon: raw.icon });
      attr.id = raw.id || attr.id;
      this.attrs.push(attr);
      byName.set(key, attr);
      addedAttrs += 1;
    }
    this._attrsDirty = true;
    // Os dados vêm com o id antigo do atributo: remapeia pelo nome.
    const idMap = new Map();
    for (const raw of attrs) if (raw && raw.id && raw.name) idMap.set(raw.id, byName.get(norm(raw.name)));
    let applied = 0;
    for (const [entityId, raw] of Object.entries(entities)) {
      // Fichas que ganharam um id novo no import (ex.: mesclagem) recebem os gráficos no id novo.
      const targetId = (entityMap && entityMap.get(entityId)) || entityId;
      const clean = cleanData(raw, targetId);
      const remapped = blankData(targetId);
      for (const [oldId, value] of Object.entries(clean.values)) {
        const attr = idMap.get(oldId);
        if (attr) remapped.values[attr.id] = value;
      }
      for (const [oldId, note] of Object.entries(clean.notes)) {
        const attr = idMap.get(oldId);
        if (attr) remapped.notes[attr.id] = note;
      }
      remapped.tags = clean.tags;
      remapped.medals = clean.medals;
      remapped.caption = clean.caption;
      remapped.show = clean.show;
      this.data.set(targetId, remapped);
      this._pending = this._pending || new Map();
      this._pending.set(targetId, remapped);
      applied += 1;
    }
    this._write();
    this.events.emit("change", { action: "import" });
    return { attrs: addedAttrs, entities: applied };
  },

  async wipe() {
    for (const id of [...this.data.keys()]) {
      this.data.delete(id);
      kv().delete(K_ENT + id).catch(() => {});
    }
    this._pending = new Map();
    this.attrs = DEFAULT_ATTRS.map(([name, color]) => makeAttr(name, color));
    this._attrsDirty = true;
    await this._write();
    this.events.emit("change", { action: "wipe" });
  },

  // Reassocia os gráficos quando os ids das fichas mudam depois de um import.
  remapEntities(map) {
    if (!map || !map.size) return 0;
    const next = new Map();
    let moved = 0;
    for (const [oldId, data] of this.data) {
      const newId = map.get(oldId) || oldId;
      if (newId !== oldId && !this.data.has(newId)) {
        data.id = newId;
        data.updatedAt = Date.now();
        kv().delete(K_ENT + oldId).catch(() => {});
        this._pending = this._pending || new Map();
        this._pending.set(newId, data);
        moved += 1;
        next.set(newId, data);
        this.data.delete(oldId);
        continue;
      }
      next.set(newId, data);
    }
    this.data = next;
    if (moved) this._write();
    return moved;
  },
};