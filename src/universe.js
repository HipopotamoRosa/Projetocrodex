// Universos: cada Codex (mundo) vive num espaço de nomes próprio dentro do
// armazenamento local (kv-plugin → IndexedDB). Um "universo" é um conjunto de
// pastas prefixadas; o registro de universos fica numa pasta fixa, sem prefixo.
//
// Layout no kv:
//   codex_universos / "universos"  -> { version, list, active, bootstrapSample }
//   <prefixo>codex                 -> fichas, pastas, relações, settings, capa
//   <prefixo>codex_images          -> imagens das fichas
//   <prefixo>livro                 -> capítulos do livro
//   <prefixo>livro_img             -> imagens dos capítulos
//   <prefixo>timeline              -> eventos
//   <prefixo>competencia           -> gráficos de poder
//
// O universo "legado" (dados criados antes desta funcionalidade) tem prefixo ""
// — nenhum dado é copiado ou convertido, ele simplesmente continua onde está.

import { uid } from "./util.js";
import { VIEW, viewFolder } from "./view.js";

export const REGISTRY_FOLDER = "codex_universos";
const REGISTRY_KEY = "universos";

// Pastas que pertencem a um universo (usadas para duplicar e apagar).
export const UNIVERSE_FOLDERS = ["codex", "codex_images", "livro", "livro_img", "timeline", "competencia"];

export const DEFAULT_EMOJI = "🌍";

// O espaço de nomes ativo. `prefix` é "" para o universo legado.
export const NS = { id: null, prefix: "" };

// Acesso ao kv já respeitando o universo ativo. Todos os módulos de dados usam isto.
// No modo somente leitura (Codex publicado por outra pessoa) as pastas viram uma
// cópia em memória: nada é lido nem gravado no armazenamento deste navegador.
export function kvFolder(name) {
  if (VIEW.active) return viewFolder(name);
  return root.kv[NS.prefix + name];
}

// Pasta de um universo (não necessariamente o ativo). No modo somente leitura
// tudo é a cópia em memória, para nem tocar no armazenamento de quem só está vendo.
function universeFolder(u, name) {
  if (VIEW.active) return viewFolder(name);
  return root.kv[u.prefix + name];
}

function registry() {
  return root.kv[REGISTRY_FOLDER];
}

function newId() {
  return "uni_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function clean(text, max) {
  const t = String(text == null ? "" : text)
    .replace(/\[\[\s*([^\]|]+?)\s*(\|[^\]]*)?\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (max && t.length > max) return t.slice(0, max - 1).trimEnd() + "…";
  return t;
}

function makeUniverse(data) {
  data = data || {};
  const id = data.id || newId();
  const legacy = !!data.legacy;
  return {
    id,
    nome: data.nome || "Meu Codex",
    emoji: data.emoji || DEFAULT_EMOJI,
    genero: Array.isArray(data.genero) ? data.genero.filter(Boolean).slice(0, 12) : [],
    resumo: data.resumo || "",
    prefix: legacy ? "" : "u_" + id + "_",
    legacy,
    criadoEm: data.criadoEm || Date.now(),
    atualizadoEm: data.atualizadoEm || Date.now(),
  };
}

async function folderHasData(name, keyPrefix) {
  try {
    const keys = await root.kv[name].keys();
    return keys.some((k) => !keyPrefix || k.startsWith(keyPrefix));
  } catch (err) {
    return false;
  }
}

async function anyLegacyData() {
  if (await folderHasData("codex", "ent:")) return true;
  if (await folderHasData("livro", "cap:")) return true;
  if (await folderHasData("timeline", "evt:")) return true;
  if (await folderHasData("competencia", "ent:")) return true;
  if (await folderHasData("codex_images")) return true;
  return false;
}

export const universes = {
  list: [],
  activeId: null,
  bootstrapSample: null,
  // Capas dos Codexs (id -> dataURL). Só em memória: o dado de verdade mora na
  // pasta `codex` do próprio Codex, na chave "cover" — por isso ele viaja no
  // export/duplicar sem nenhum trabalho extra. Nunca entra no registro (um
  // dataURL ali incharia o registro inteiro a cada gravação).
  covers: {},
  loaded: false,

  byId(id) {
    return this.list.find((u) => u.id === id) || null;
  },

  active() {
    return this.byId(this.activeId);
  },

  async load() {
    if (VIEW.active) return this._loadView();
    let data = null;
    try {
      data = await registry().get(REGISTRY_KEY);
    } catch (err) {
      console.error("Falha ao ler o registro de universos", err);
    }
    if (!data || !Array.isArray(data.list)) {
      // Primeira vez com esta funcionalidade: os dados que já existem (se houver)
      // viram o universo legado, sem prefixo, sem copiar nada.
      const legacy = await anyLegacyData();
      data = { version: 1, list: legacy ? [makeUniverse({ nome: "Meu universo", legacy: true })] : [], active: null };
      try {
        await this._save(data);
      } catch (err) { /* segue com o registro em memória */ }
    }
    this.list = data.list.map((u) => makeUniverse(u));
    const wanted = data.active && this.list.some((u) => u.id === data.active) ? data.active : null;
    this.activeId = wanted || (this.list[0] ? this.list[0].id : null);
    this.bootstrapSample = data.bootstrapSample || null;
    this._apply();
    this.loaded = true;
    if (this.activeId) await this.coverFor(this.activeId);
    return this;
  },

  _apply() {
    const u = this.active();
    NS.id = u ? u.id : null;
    NS.prefix = u ? u.prefix : "";
  },

  // Modo somente leitura: não existe registro de universos — o Codex publicado é
  // a única coisa que aparece, e ele mora inteiro na memória (src/view.js).
  async _loadView() {
    await VIEW.ready;
    this.list = [];
    this.activeId = null;
    this.bootstrapSample = null;
    this.loaded = true;
    if (VIEW.error) {
      this._apply();
      return this;
    }
    const meta = VIEW.meta || {};
    const u = makeUniverse({
      id: "view",
      nome: meta.nome || "Codex publicado",
      emoji: meta.emoji,
      genero: meta.genero,
      resumo: meta.resumo,
      criadoEm: meta.criadoEm,
    });
    u.publicado = true;
    u.atualizadoEm = meta.atualizadoEm || u.criadoEm;
    this.list = [u];
    this.activeId = u.id;
    this._apply();
    try {
      this.covers[u.id] = (await kvFolder("codex").get("cover")) || null;
    } catch (err) {
      this.covers[u.id] = null;
    }
    return this;
  },

  async _save(data) {
    if (VIEW.active) return;
    const payload = data || {
      version: 1,
      list: this.list,
      active: this.activeId,
      bootstrapSample: this.bootstrapSample,
    };
    await registry().set(REGISTRY_KEY, payload);
  },

  _persist() {
    // Não mexe no espaço de nomes ativo: quem troca de universo recarrega a
    // página logo depois, e é o próximo boot que aplica o prefixo do novo
    // universo (assim nenhuma gravação pendente cai no mundo errado).
    return this._save();
  },

  applyActive() {
    this._apply();
  },

  // ---------------------------------------------------------------- capa
  // A capa é a imagem panorâmica mostrada na Apresentação do Codex e na
  // miniatura do card da Biblioteca.
  async coverFor(id) {
    const u = this.byId(id);
    if (!u) return null;
    if (this.covers[id] !== undefined) return this.covers[id];
    let data = null;
    try {
      data = await universeFolder(u, "codex").get("cover");
    } catch (err) { /* Codex sem capa */ }
    this.covers[id] = typeof data === "string" && data ? data : null;
    return this.covers[id];
  },

  cover(id) {
    const key = id || this.activeId;
    return this.covers[key] || null;
  },

  async setCover(id, dataUrl) {
    const u = this.byId(id);
    if (!u) return null;
    const folder = universeFolder(u, "codex");
    try {
      if (dataUrl) await folder.set("cover", dataUrl);
      else await folder.delete("cover");
    } catch (err) {
      console.error("Falha ao gravar a capa do Codex", err);
      return null;
    }
    this.covers[u.id] = dataUrl || null;
    u.atualizadoEm = Date.now();
    await this._persist();
    return this.covers[u.id];
  },

  async create(opts) {
    opts = opts || {};
    const u = makeUniverse({
      nome: String(opts.nome || "").trim() || "Meu Codex",
      emoji: opts.emoji,
      genero: opts.genero,
      resumo: String(opts.resumo || "").trim(),
    });
    this.list.push(u);
    this.activeId = u.id;
    this.bootstrapSample = opts.withSample ? u.id : null;
    await this._persist();
    return u;
  },

  async update(id, patch) {
    const u = this.byId(id);
    if (!u) return null;
    if (patch.nome !== undefined) u.nome = String(patch.nome || "").trim() || u.nome;
    if (patch.emoji !== undefined) u.emoji = patch.emoji || DEFAULT_EMOJI;
    if (patch.genero !== undefined) u.genero = (Array.isArray(patch.genero) ? patch.genero : String(patch.genero || "").split(",")).map((g) => String(g).trim()).filter(Boolean).slice(0, 12);
    if (patch.resumo !== undefined) u.resumo = String(patch.resumo || "").trim();
    u.atualizadoEm = Date.now();
    await this._save({ version: 1, list: this.list, active: this.activeId, bootstrapSample: this.bootstrapSample });
    return u;
  },

  async touch(id) {
    const u = this.byId(id);
    if (!u) return;
    u.atualizadoEm = Date.now();
    await this._save({ version: 1, list: this.list, active: this.activeId, bootstrapSample: this.bootstrapSample });
  },

  // Troca o universo ativo. Quem chama deve descarregar (flush) os dados antes.
  async switchTo(id) {
    const u = this.byId(id);
    if (!u) return false;
    this.activeId = u.id;
    u.atualizadoEm = Date.now();
    await this._persist();
    return true;
  },

  async clearBootstrapSample() {
    if (!this.bootstrapSample) return;
    this.bootstrapSample = null;
    await this._save();
  },

  async duplicate(id) {
    const src = this.byId(id);
    if (!src) return null;
    const copy = makeUniverse({
      nome: src.nome + " (cópia)",
      emoji: src.emoji,
      genero: src.genero,
      resumo: src.resumo,
    });
    for (const name of UNIVERSE_FOLDERS) {
      try {
        const entries = await universeFolder(src, name).entries();
        if (entries.length) await universeFolder(copy, name).setMany(entries);
      } catch (err) {
        console.error("Falha ao copiar a pasta " + name, err);
      }
    }
    this.list.push(copy);
    this.covers[copy.id] = this.covers[src.id] || null;
    await this._save({ version: 1, list: this.list, active: this.activeId, bootstrapSample: this.bootstrapSample });
    return copy;
  },

  // Apaga TODOS os dados do universo. Nunca apaga o registro de outro universo.
  async destroy(id) {
    const u = this.byId(id);
    if (!u) return false;
    for (const name of UNIVERSE_FOLDERS) {
      try {
        const folder = universeFolder(u, name);
        const keys = await folder.keys();
        if (keys.length) await folder.deleteMany(keys);
      } catch (err) {
        console.error("Falha ao limpar a pasta " + name, err);
      }
    }
    this.list = this.list.filter((x) => x.id !== id);
    if (this.activeId === id) this.activeId = this.list[0] ? this.list[0].id : null;
    if (this.bootstrapSample === id) this.bootstrapSample = null;
    delete this.covers[id];
    await this._persist();
    return true;
  },

  count() {
    return this.list.length;
  },

  countsLabel(u) {
    const c = u.counts || {};
    const parts = [];
    if (c.fichas) parts.push(c.fichas + (c.fichas === 1 ? " ficha" : " fichas"));
    if (c.relacoes) parts.push(c.relacoes + (c.relacoes === 1 ? " relação" : " relações"));
    if (c.capitulos) parts.push(c.capitulos + (c.capitulos === 1 ? " capítulo" : " capítulos"));
    if (c.eventos) parts.push(c.eventos + (c.eventos === 1 ? " evento" : " eventos"));
    return parts.join(" · ");
  },

  async stats(u) {
    const at = (name) => universeFolder(u, name);
    const out = { fichas: 0, relacoes: 0, capitulos: 0, eventos: 0, imagens: 0 };
    try {
      const keys = await at("codex").keys();
      out.fichas = keys.filter((k) => k.startsWith("ent:")).length;
      const rels = await at("codex").get("relations");
      out.relacoes = Array.isArray(rels) ? rels.length : 0;
    } catch (err) { /* universo vazio */ }
    try {
      const keys = await at("livro").keys();
      out.capitulos = keys.filter((k) => k.startsWith("cap:")).length;
    } catch (err) { /* idem */ }
    try {
      const keys = await at("timeline").keys();
      out.eventos = keys.filter((k) => k.startsWith("evt:")).length;
    } catch (err) { /* idem */ }
    try {
      out.imagens = (await at("codex_images").keys()).length;
    } catch (err) { /* idem */ }
    u.counts = out;
    return out;
  },

  // Capa do card: o resumo escrito pelo usuário ou, na falta dele, o começo da
  // primeira ficha do universo.
  async preview(u) {
    if (u.resumo) return clean(u.resumo, 200);
    try {
      const keys = await universeFolder(u, "codex").keys();
      const entKey = keys.find((k) => k.startsWith("ent:"));
      if (entKey) {
        const e = await universeFolder(u, "codex").get(entKey);
        const text = e && (e.summary || e.description);
        if (text) return clean(text, 190);
      }
    } catch (err) { /* sem prévia */ }
    return "";
  },

  async hydrate(list) {
    const items = list || this.list;
    for (const u of items) {
      await this.stats(u);
      u.preview = await this.preview(u);
      await this.coverFor(u.id);
    }
    return items;
  },

  // -------------------------------------------------------------------------
  // Backup de UM universo: lê as pastas cruas, sem trocar o universo ativo.
  // O arquivo gerado pode ser guardado e reimportado como um universo novo
  // (é também assim que se passa um mundo de uma pessoa para outra).
  // -------------------------------------------------------------------------
  async exportOne(id) {
    const u = this.byId(id);
    if (!u) throw new Error("Codex não encontrado");
    const docs = {};
    for (const name of UNIVERSE_FOLDERS) {
      try {
        docs[name] = await universeFolder(u, name).entries();
      } catch (err) {
        docs[name] = [];
      }
    }
    return {
      app: "codex",
      kind: "codex-universe",
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: {
        nome: u.nome,
        emoji: u.emoji,
        genero: u.genero,
        resumo: u.resumo,
        criadoEm: u.criadoEm,
      },
      docs,
    };
  },

  // Aceita arquivos no formato acima e também os antigos ("app: codex" com
  // entities/folders/relations/settings/images). Sempre cria um universo NOVO.
  async importFile(payload, opts) {
    opts = opts || {};
    if (!payload || typeof payload !== "object") throw new Error("Arquivo inválido");
    let docs = null;
    let meta = {};
    if (payload.kind === "codex-universe" && payload.docs) {
      docs = payload.docs;
      meta = payload.meta || {};
    } else if (Array.isArray(payload.entities)) {
      // backup antigo do painel "Arquivo, backup e preferências"
      const codex = payload.entities.map((e) => ["ent:" + e.id, e]);
      if (Array.isArray(payload.folders)) codex.push(["folders", payload.folders]);
      if (Array.isArray(payload.relations)) codex.push(["relations", payload.relations]);
      if (payload.settings) codex.push(["settings", payload.settings]);
      docs = { codex, codex_images: Object.entries(payload.images || {}) };
      meta = { nome: opts.nome || "Codex importado" };
    } else if (payload.app === "codex" && payload.fiches) {
      docs = payload;
    } else {
      throw new Error("Este arquivo não é um Codex exportado daqui");
    }

    const u = await this.create({
      nome: opts.nome || meta.nome || "Codex importado",
      emoji: meta.emoji || (opts.emoji || DEFAULT_EMOJI),
      genero: meta.genero || [],
      resumo: meta.resumo || "",
    });
    for (const name of UNIVERSE_FOLDERS) {
      const entries = docs[name];
      if (!Array.isArray(entries) || !entries.length) continue;
      const pairs = entries.filter((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "string");
      if (!pairs.length) continue;
      try {
        await universeFolder(u, name).setMany(pairs);
      } catch (err) {
        console.error("Falha ao gravar a pasta " + name, err);
        throw new Error("Não consegui gravar os dados importados");
      }
    }
    return u;
  },
};
