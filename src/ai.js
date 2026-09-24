import { store } from "./store.js";
import { fieldDef } from "./data.js";
import { mdToPlain, truncate } from "./util.js";
import { universes } from "./universe.js";
import { book } from "./book/store.js";
import { timeline } from "./timeline/store.js";

// Os tipos de anexo são editáveis (o usuário cria "é amante de" etc.), então o
// texto com a lista de tipos válidos é montado a cada chamada, não no import.
function relationHints() {
  return store.kinds().map((k) => k.id + " (" + k.f + ")").join(", ");
}

export const DEFAULT_PERSONA =
  "Você é um arquivista profissional de worldbuilding. Você organiza fichas de personagens, organizações, lugares e itens, e tece a rede de relações entre eles com precisão. Você sempre responde em português do Brasil e nunca inventa fatos que contradigam o material fornecido.";

export function cfg() {
  const out = { persona: DEFAULT_PERSONA, maxSuggestions: 6, maxCatalog: 120 };
  try {
    const node = root.codex;
    if (node) {
      if (node.aiPersona) out.persona = String(node.aiPersona.evaluateItem || node.aiPersona).trim();
      if (node.maxSuggestions) out.maxSuggestions = Number(node.maxSuggestions.evaluateItem) || out.maxSuggestions;
      if (node.maxCatalog) out.maxCatalog = Number(node.maxCatalog.evaluateItem) || out.maxCatalog;
    }
  } catch (err) { /* usa padrões */ }
  return out;
}

export function available() {
  return typeof root.generateText === "function";
}

// Interruptor mestre: Apresentação → "Usar inteligência neste Codex".
// Fica gravado nas settings do Codex ativo, então vale para todas as
// ferramentas de IA deste mundo (extrair, sugerir, enriquecer, imagens, perguntas).
export function enabled() {
  return store.settings.aiEnabled !== false;
}

export const AI_OFF_MESSAGE =
  "A inteligência está desligada neste Codex. Ligue em 🏠 Apresentação → “Usar inteligência neste Codex”.";

function assertEnabled() {
  if (!available()) throw new Error("O plugin de IA não está disponível nesta página.");
  if (!enabled()) throw new Error(AI_OFF_MESSAGE);
}

let _meta = null;
function metaObj() {
  if (_meta !== null) return _meta;
  try {
    _meta = root.generateText({ getMetaObject: true });
  } catch (err) {
    _meta = false;
  }
  return _meta || null;
}

export function countTokens(text) {
  const m = metaObj();
  if (m && typeof m.countTokens === "function") {
    try { return m.countTokens(text); } catch (err) { /* fallback */ }
  }
  return Math.round(String(text).length / 4);
}

function typeLabel(id) {
  const t = store.type(id);
  return t ? t.l : id;
}

export function entityToPrompt(entity, opts) {
  opts = opts || {};
  const fields = {};
  for (const [k, v] of Object.entries(entity.fields || {})) {
    if (v) fields[k] = truncate(mdToPlain(v), 220);
  }
  return {
    nome: entity.name,
    tipo: entity.type,
    apelidos: (entity.aliases || []).slice(0, 6),
    resumo: entity.summary || "",
    descricao: opts.full ? mdToPlain(entity.description || "") : truncate(mdToPlain(entity.description || ""), opts.descLimit || 700),
    campos: fields,
  };
}

export function catalogText(excludeIds, charBudget) {
  const exclude = new Set(excludeIds || []);
  const c = cfg();
  const list = store.allEntities().filter((e) => !exclude.has(e.id));
  list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const limited = list.slice(0, c.maxCatalog);
  const lines = [];
  const detailed = [];
  for (const e of limited) {
    const aliases = (e.aliases || []).length ? " — apelidos: " + e.aliases.join(", ") : "";
    const summary = e.summary ? " — " + truncate(mdToPlain(e.summary), 120) : "";
    detailed.push(`- ${e.name} (${typeLabel(e.type)})${aliases}${summary}`);
  }
  const budget = charBudget || 7000;
  let total = 0;
  for (const line of detailed) {
    if (total + line.length > budget) break;
    lines.push(line);
    total += line.length;
  }
  if (!lines.length && detailed.length) lines.push(detailed[0]);
  return lines.join("\n");
}

export function relationsText(entityId) {
  const rows = store.relationsOf(entityId).map((r) => store.relationView(r, entityId));
  if (!rows.length) return "(nenhuma relação registrada ainda)";
  return rows
    .map((v) => {
      const other = v.other ? v.other.name : "(ficha removida)";
      return `- ${v.forward ? "esta ficha" : other} ${v.label} ${v.forward ? other : "esta ficha"} (tipo: ${v.kind.id})`;
    })
    .join("\n");
}

const JSON_RULES = `Regras de saída:
- Responda APENAS com um objeto JSON válido. Sem cercas de código, sem comentários, sem texto antes ou depois.
- Escreva o JSON compacto: sem indentação e sem quebras de linha entre os itens (isso evita que a resposta seja cortada no meio).
- Use exatamente os nomes que aparecem no material fornecido.
- Escreva tudo em português do Brasil.
- Nunca invente relações que o material não sustente; na dúvida, omita.
- Seja econômico: descrições de no máximo 2 frases curtas.`;

function tryParse(s) {
  try { return JSON.parse(s); } catch (err) { return null; }
}

function tidyJson(s) {
  return s
    .replace(/^\uFEFF/, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function closeJson(s) {
  let inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "").replace(/:\s*$/, ':""');
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonLoose(text) {
  let s = String(text || "").trim();
  s = s.replace(/^\s*```(?:json)?/i, "").replace(/```[\s\S]*$/, "").trim();
  const start = s.indexOf("{");
  if (start > 0) s = s.slice(start);
  const candidates = [];
  const end = s.lastIndexOf("}");
  if (end > 0) candidates.push(s.slice(0, end + 1));
  candidates.push(s);
  for (const c of candidates) {
    const tidy = tidyJson(c);
    const direct = tryParse(c) || tryParse(tidy);
    if (direct) return direct;
    const closed = tryParse(closeJson(tidy));
    if (closed) return closed;
    const lastObj = tidy.lastIndexOf("}");
    if (lastObj > 0) {
      const cut = tryParse(closeJson(tidy.slice(0, lastObj + 1)));
      if (cut) return cut;
    }
    const lastArr = tidy.lastIndexOf("]");
    if (lastArr > 0) {
      const cut2 = tryParse(closeJson(tidy.slice(0, lastArr + 1)));
      if (cut2) return cut2;
    }
  }
  return null;
}

async function generateRaw(instruction, opts, extra) {
  let full = "";
  const result = await root.generateText(Object.assign({
    instruction,
    onChunk: (d) => {
      full = d.fullTextSoFar;
      if (opts && opts.onProgress) opts.onProgress(full);
    },
  }, extra || {}));
  return (result && (result.liveResponseText || result.text)) || full || "";
}

const RETRY_NOTE = "\n\nATENÇÃO: a resposta anterior foi cortada ou veio fora do formato. Responda novamente APENAS com o JSON completo, compacto, começando com { e terminando com } — sem nenhum texto fora do JSON.";

async function ask(instruction, opts) {
  opts = opts || {};
  assertEnabled();
  let text = await generateRaw(instruction, opts);
  let data = parseJsonLoose(text);
  if (!data) {
    text = await generateRaw(instruction + RETRY_NOTE, opts, { startWith: "{" });
    data = parseJsonLoose(text);
  }
  if (!data) {
    const err = new Error("A IA não devolveu um JSON válido. Tente novamente.");
    err.raw = text;
    throw err;
  }
  return { data, text };
}

const EXTRACT_SCHEMA = () => `Você receberá um texto (história, biografia, sinopse, anotações de mesa, lista de ideias) e deve extrair um JSON com duas listas: "entidades" e "relacoes".

Formato: {"entidades":[{"nome":"Nome exato","tipo":"personagem","apelidos":["apelido"],"resumo":"uma frase","descricao":"2 a 4 frases","campos":{"ocupacao":"...","status":"...","aparencia":"..."}}],"relacoes":[{"de":"Nome A","para":"Nome B","tipo":"id_do_tipo","nota":"o que no texto indica isso"}]}

Valores válidos de "tipo" para entidades: personagem, organizacao, local, item, criatura, evento, universo, nota.
Campos úteis por tipo (use só os que o texto sustentar, como texto curto): aparencia, personalidade, idade, nascimento, especie, ocupacao, status, afiliacao, poderes, objetivos, medos, segredos, lideranca, sede, ideologia, regiao, populacao, governo, materiais, dono, habitat, data_evento, consequencias.
Valores válidos de "tipo" para relacoes (id | significado quando lido de "de" para "para"): ${relationHints()}.
Direção da relação: em "A é pai de B", de=A, para=B, tipo=pai. Em "A é membro da Ordem X", de=A, para=Ordem X, tipo=membro.
Crie relações apenas entre nomes que estejam na sua própria lista "entidades".
No máximo 60 entidades e 120 relações.`;

export async function extractFromText(text, opts) {
  opts = opts || {};
  const c = cfg();
  const catalog = catalogText([], 5000);
  const instruction = [
    c.persona,
    "",
    EXTRACT_SCHEMA(),
    "",
    "Fichas que já existem no arquivo do usuário (se o texto falar de alguma delas, reutilize exatamente o mesmo nome e marque existente como true):",
    "<FICHAS_EXISTENTES>",
    catalog || "(o arquivo está vazio)",
    "</FICHAS_EXISTENTES>",
    "",
    JSON_RULES,
    "",
    "TAREFA: Extraia as entidades e as relações do texto abaixo, no formato JSON descrito.",
    "Se um nome do texto corresponder a uma ficha existente, use o campo nome exatamente igual ao existente e acrescente \"existente\": true.",
    "",
    "<TEXTO>",
    text,
    "</TEXTO>",
  ].join("\n");
  const { data } = await ask(instruction, opts);
  return normalizeExtraction(data);
}

export function normalizeExtraction(data) {
  const entities = (Array.isArray(data.entidades) ? data.entidades : []).map((e) => ({
    name: String(e.nome || e.name || "").trim(),
    type: String(e.tipo || e.type || "personagem").trim(),
    aliases: Array.isArray(e.apelidos) ? e.apelidos.map(String) : (e.aliases || []),
    summary: String(e.resumo || e.summary || "").trim(),
    description: String(e.descricao || e.description || "").trim(),
    fields: Object.assign({}, e.campos || e.fields || {}),
    existing: !!e.existente,
  })).filter((e) => e.name);
  const entitiesByNorm = new Map();
  for (const e of entities) entitiesByNorm.set(e.name.toLowerCase().trim(), e);
  const relations = (Array.isArray(data.relacoes) ? data.relacoes : []).map((r) => ({
    from: String(r.de || r.from || "").trim(),
    to: String(r.para || r.to || "").trim(),
    kind: String(r.tipo || r.kind || "relacionado").trim(),
    notes: String(r.nota || r.notes || "").trim(),
  })).filter((r) => r.from && r.to);
  return { entities, relations, entitiesByNorm };
}

export const SUGGEST_SCHEMA = () => `Você receberá uma FICHA ALVO, as relações que ela já tem, e o CATÁLOGO de fichas já existentes. Devolva um JSON propondo conexões novas e plausíveis.

Formato: {"relacoes":[{"de":"Nome A","para":"Nome B","tipo":"id_do_tipo","nota":"justificativa curta"}],"resumo":"resumo de uma frase","descricao":"parágrafos opcionais","campos":{"campo":"valor"},"apelidos":["apelido"]}

Regras específicas:
- Use apenas outros nomes que estejam no CATÁLOGO, escritos exatamente como aparecem lá (ou a própria FICHA ALVO).
- Nunca proponha uma relação que já exista na lista de relações atuais.
- Só proponha conexões coerentes com o que está escrito nas fichas; se não houver nada plausível, devolva "relacoes": [].
- Ordene as relações mais fortes primeiro.
- Tipos válidos de relação (id | significado de "de" para "para"): ${relationHints()}.`;

export async function suggestRelations(entityId, opts) {
  opts = opts || {};
  const c = cfg();
  const entity = store.getEntity(entityId);
  if (!entity) throw new Error("Ficha não encontrada");
  const count = opts.count || c.maxSuggestions;
  const catalog = catalogText([entityId], 6500);
  const extra = opts.extraContext ? "\n\nAnotações adicionais do usuário:\n<ANOTACOES>\n" + opts.extraContext + "\n</ANOTACOES>" : "";
  const instruction = [
    c.persona,
    "",
    SUGGEST_SCHEMA(),
    "",
    "<FICHA_ALVO>",
    JSON.stringify(entityToPrompt(entity, { full: true, descLimit: 900 }), null, 1),
    "</FICHA_ALVO>",
    "",
    "Relações atuais da FICHA ALVO:",
    relationsText(entityId),
    "",
    "<CATALOGO>",
    catalog || "(sem outras fichas)",
    "</CATALOGO>",
    extra,
    "",
    JSON_RULES,
    "",
    `TAREFA: proponha até ${count} relações novas entre esta ficha e o catálogo, além de um resumo curto e campos que estejam faltando (deixe vazio o que não souber). Responda no formato JSON descrito.`,
  ].join("\n");
  const { data } = await ask(instruction, opts);
  const relations = (Array.isArray(data.relacoes) ? data.relacoes : []).map((r) => ({
    from: String(r.de || r.from || entity.name).trim(),
    to: String(r.para || r.to || "").trim(),
    kind: String(r.tipo || r.kind || "relacionado").trim(),
    notes: String(r.nota || r.notes || "").trim(),
  })).filter((r) => r.from && r.to);
  return {
    relations,
    summary: String(data.resumo || "").trim(),
    description: String(data.descricao || "").trim(),
    fields: Object.assign({}, data.campos || {}),
    aliases: Array.isArray(data.apelidos) ? data.apelidos.map(String) : [],
  };
}

const PROFILE_SCHEMA = `Você preencherá a ficha de uma entidade do arquivo do usuário. Devolva JSON.

Formato: {"resumo":"uma frase de efeito","descricao":"3 a 5 parágrafos em markdown, sem títulos","apelidos":["apelido"],"campos":{"campo":"valor"}}

Regras específicas:
- Parta SEMPRE do que já existe na ficha e expanda com coerência; preserve nomes próprios, idades, parentescos e fatos já escritos.
- Não contradiga as relações já registradas.
- Preencha apenas campos que façam sentido para o tipo da entidade.
- Texto em português do Brasil, tom de enciclopédia viva, sem clichês genéricos.`;

export async function completeEntity(entityId, opts) {
  opts = opts || {};
  const c = cfg();
  const entity = store.getEntity(entityId);
  if (!entity) throw new Error("Ficha não encontrada");
  const relationNames = store.relationsOf(entityId).map((r) => store.relationView(r, entityId)).filter((v) => v.other).map((v) => (v.forward ? entity.name + " " + v.label + " " + v.other.name : v.other.name + " " + v.label + " " + entity.name));
  const missing = [];
  const type = store.type(entity.type);
  for (const key of (type && type.fields) || []) {
    if (!entity.fields || !entity.fields[key]) missing.push(key + " (" + fieldDef(key).l + ")");
  }
  const instruction = [
    c.persona,
    "",
    PROFILE_SCHEMA,
    "",
    "<FICHA_ATUAL>",
    JSON.stringify(entityToPrompt(entity, { full: true, descLimit: 1500 }), null, 1),
    "</FICHA_ATUAL>",
    "",
    "Relações registradas:",
    relationNames.length ? relationNames.map((s) => "- " + s).join("\n") : "(nenhuma)",
    "",
    "Campos do tipo " + typeLabel(entity.type) + ":", ((type && type.fields) || []).map((k) => k + " (" + fieldDef(k).l + ")").join(", ") || "(nenhum)",
    "Campos ainda vazios nesta ficha: " + (missing.join(", ") || "(nenhum)"),
    opts.extraContext ? "\nDiretrizes do usuário:\n" + opts.extraContext : "",
    "",
    JSON_RULES,
    "",
    "TAREFA: enriqueça esta ficha (resumo, descrição e os campos vazios que fizerem sentido). Mantenha tudo o que já estava correto.",
  ].join("\n");
  const { data } = await ask(instruction, opts);
  return {
    summary: String(data.resumo || "").trim(),
    description: String(data.descricao || "").trim(),
    fields: Object.assign({}, data.campos || {}),
    aliases: Array.isArray(data.apelidos) ? data.apelidos.map(String) : [],
  };
}

export async function describeImage(entityId, imageBlob, opts) {
  opts = opts || {};
  const c = cfg();
  const entity = store.getEntity(entityId);
  const parts = [
    c.persona,
    "",
    "A imagem a seguir é uma referência visual (retrato, conceito, mapa, objeto).",
    "Descreva o que ela mostra em detalhe útil para uma ficha de worldbuilding e devolva JSON.",
    "",
    'Formato: {"aparencia":"descrição visual detalhada, do geral ao específico (cabelo, olhos, roupas, cores, marcas, clima da imagem)","resumo":"uma frase","descricao":"1 a 2 parágrafos inferindo quem/o que é","campos":{"campo":"valor"},"tags":["etiqueta"]}',
    "",
    entity ? "Contexto da ficha: " + entity.name + " (" + typeLabel(entity.type) + ")" + (entity.summary ? " — " + entity.summary : "") : "",
    opts.extraContext ? "Diretrizes do usuário: " + opts.extraContext : "",
    "",
    "IMAGEM:",
    imageBlob,
    "",
    JSON_RULES,
    "",
    "TAREFA: descreva a imagem e devolva o JSON descrito. Se for um retrato de personagem, foque em aparência e leitura de personalidade.",
  ].filter(Boolean).join("\n");
  const { data } = await ask(parts, opts);
  return {
    appearance: String(data.aparencia || "").trim(),
    summary: String(data.resumo || "").trim(),
    description: String(data.descricao || "").trim(),
    fields: Object.assign({}, data.campos || {}),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
  };
}

export function matchProposals(entities) {
  return entities.map((e) => {
    const sug = store.suggestByName(e.name, { min: 0.55, limit: 3 });
    return { proposal: e, candidates: sug };
  });
}

export function resolveProposalName(name, entitiesByNorm, existingList) {
  const key = String(name || "").toLowerCase().trim();
  if (entitiesByNorm && entitiesByNorm.has(key)) return entitiesByNorm.get(key).name;
  return name;
}

const KIND_SYNONYMS = {
  pai: ["pai", "padrasto", "papai", "father"],
  mae: ["mae", "mãe", "madrasta", "mamae", "mother"],
  avo: ["avo", "avô", "avó", "vovô", "vovó", "avo", "neta", "neto", "grandparent"],
  tio: ["tio", "tia", "tios", "sobrinho", "sobrinha"],
  primo: ["primo", "prima", "primos"],
  irmao: ["irmao", "irmão", "irma", "irmã", "irmãos", "irmas"],
  conjuge: ["conjuge", "cônjuge", "esposa", "esposo", "marido", "mulher", "casado", "casada", "casamento", "esposou"],
  namoro: ["namoro", "namorado", "namorada", "noivo", "noiva", "paquera"],
  ex: ["ex", "exnamorado", "exnamorada", "exmarido", "exesposa", "antigo amor"],
  amigo: ["amigo", "amiga", "amizade", "amigos", "companheiro", "companheira"],
  aliado: ["aliado", "aliada", "aliados", "aliance", "aliou", "parceiro", "parceira", "pacto", "alianca", "aliança"],
  rival: ["rival", "rivalidade", "competidor", "oponente", "desafia"],
  inimigo: ["inimigo", "inimiga", "inimizade", "traiu", "traicao", "traição", "traido", "traído", "odeia", "matou", "assassinou", "vinganca", "vingança", "atacou", "destruiu", "guerra"],
  mentor: ["mentor", "mentora", "mentoria", "mestre", "professor", "professora", "tutor", "treinou", "treinado", "treinamento", "aluno", "aluna", "aprendiz", "discipulo", "discípulo"],
  conhece: ["conhece", "conheceu", "conhecido", "conhecida", "sabe de", "ciente"],
  membro: ["membro", "membra", "pertence", "pertenceu", "participa de", "integrante", "filiado", "entrou em"],
  lider: ["lider", "líder", "lidera", "liderou", "capita", "capitã", "capitão", "comanda", "comandante", "chefe", "rainha", "rei", "senhor", "governa", "dirige", "chefia"],
  fundador: ["fundador", "fundadora", "fundou", "fundacao", "fundação", "criou a", "criadora"],
  serve: ["serve", "servo", "serva", "serviu", "subordinado", "subordinada", "soldado de", "guarda de", "vassalo", "vassala"],
  mora: ["mora", "morou", "mora em", "vive", "viveu", "reside", "residente", "habita", "habitante", "fugiu para", "refugiou", "se esconde em", "casa"],
  nasceu: ["nasceu", "nascimento", "natural de", "originario", "originário", "origem", "criado em", "cresceu em"],
  localizado: ["localizado", "situado", "fica", "fica em", "regiao", "região", "territorio", "território", "perto de", "fica na"],
  possui: ["possui", "possuidor", "dono", "dona", "porta", "tem", "pertence a", "herdou", "guardiao", "guardião", "guarda"],
  participou: ["participou", "participa", "presente em", "lutou em", "esteve em", "testemunhou"],
  causou: ["causou", "causa", "provocou", "culpado de", "responsavel por", "responsável por", "desencadeou"],
  criou: ["criou", "criador", "criadora", "construiu", "construiu a", "forjou", "inventou", "escreveu", "autor", "autora"],
  relacionado: ["relacionado", "relacionada", "ligado", "ligada", "conexao", "conexão", "ligacao", "ligação"],
};

function stripAccents(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function kindFromAI(id) {
  const raw = String(id || "").toLowerCase().trim();
  const kinds = store.kinds();
  const found = kinds.find((k) => k.id === raw);
  if (found) return found.id;
  const plain = stripAccents(raw).replace(/[_-]+/g, " ").trim();
  const words = plain.split(/[^a-z0-9]+/).filter(Boolean);
  for (const k of kinds) {
    const nf = stripAccents(String(k.f || "").toLowerCase()).replace(/[_-]+/g, " ").trim();
    if (!nf) continue;
    if (plain === nf || plain.replace(/\s+/g, "") === nf.replace(/\s+/g, "")) return k.id;
    if (nf.length >= 6 && (plain.includes(nf) || nf.includes(plain))) return k.id;
  }
  for (const [kind, list] of Object.entries(KIND_SYNONYMS)) {
    if (!kinds.some((k) => k.id === kind)) continue;
    for (const w of list) {
      const nw = stripAccents(w);
      if (plain === nw || words.includes(nw) || plain.replace(/\s+/g, "") === nw.replace(/\s+/g, "")) return kind;
      if (nw.length >= 6 && plain.includes(nw)) return kind;
    }
  }
  return "relacionado";
}

// ---------------------------------------------------------------------------
// "O que você quer saber?" (Apresentação)
//
// O material do mundo (o BRIEF) é montado uma vez e fica estável; só a pergunta
// muda. Isso deixa o prompt amigável ao cache de prefixo do modelo: perguntas
// seguidas reaproveitam o mesmo começo e a resposta começa bem mais rápido.
// ---------------------------------------------------------------------------

export const WORLD_SYSTEM =
  DEFAULT_PERSONA +
  " Agora você é o guardião deste Codex: conversa com o autor sobre o próprio mundo dele. " +
  "Responda em português do Brasil, em prosa direta e concreta, sem encher linguiça. " +
  "Use como única fonte da verdade o material do Codex abaixo. " +
  "Se algo não estiver registrado ali, diga que não está registrado e ofereça o que faria sentido — deixando claro que é sugestão sua. " +
  "Aponte incoerências (datas que não fecham, relações contraditórias, fichas órfãs) quando a pergunta esbarrar nelas.";

// Texto do mundo: Codex + fichas + relações + capítulos + timeline, cortado num
// orçamento de caracteres para não virar um prompt gigante.
export function worldBrief(budget) {
  budget = budget || 7000;
  const u = universes.active();
  const parts = [];
  parts.push("CODEX: " + (u ? u.emoji + " " + u.nome : "(sem nome)") + (u && u.genero && u.genero.length ? " — gêneros: " + u.genero.join(", ") : ""));
  if (u && u.resumo) parts.push("APRESENTAÇÃO (escrita pelo autor):\n" + u.resumo);

  const byType = new Map();
  for (const e of store.entities.values()) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type).push(e);
  }
  const typeLines = [];
  for (const t of store.types()) {
    const list = byType.get(t.id);
    if (!list || !list.length) continue;
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const shown = list.slice(0, 40).map((e) => e.name + (e.summary ? " (" + truncate(mdToPlain(e.summary), 90) + ")" : ""));
    typeLines.push("- " + (t.p || t.l + "s") + " (" + list.length + "): " + shown.join("; "));
  }
  parts.push("FICHAS:\n" + (typeLines.length ? typeLines.join("\n") : "(nenhuma ficha ainda)"));

  const rels = [];
  for (const r of store.relations.values()) {
    const a = store.getEntity(r.from);
    const b = store.getEntity(r.to);
    if (!a || !b) continue;
    rels.push("- " + a.name + " " + store.kind(r.kind).f + " " + b.name);
    if (rels.length >= 80) break;
  }
  if (rels.length) parts.push("RELAÇÕES:\n" + rels.join("\n"));

  const chapters = book.list();
  if (chapters.length) {
    parts.push("CAPÍTULOS DO LIVRO:\n" + chapters.slice(0, 40).map((c) => "- " + c.title + (c.moment ? " (momento: " + c.moment + ")" : "")).join("\n"));
  }

  const events = timeline.list();
  if (events.length) {
    parts.push("TIMELINE:\n" + events.slice(0, 60).map((e) => "- " + (e.date || "sem data") + " — " + e.title).join("\n"));
  }

  let text = parts.join("\n\n");
  if (text.length > budget) text = text.slice(0, budget - 24).trimEnd() + "\n(…material cortado)";
  return text;
}

export function worldQuestionInstruction(question, brief) {
  return [
    WORLD_SYSTEM,
    "",
    "<CODEX>",
    brief || worldBrief(),
    "</CODEX>",
    "",
    "TAREFA: responda à pergunta do autor sobre este mundo. Se a pergunta pedir algo que não está no material, diga o que falta antes de sugerir.",
    "",
    "<PERGUNTA>",
    String(question || "").trim(),
    "</PERGUNTA>",
  ].join("\n");
}

// Devolve o objeto do generateText (com .stop()) — quem chama escreve o texto
// que chega em onChunk enquanto ele é gerado.
export function askWorld(question, opts) {
  opts = opts || {};
  assertEnabled();
  const instruction = worldQuestionInstruction(question, opts.brief);
  return root.generateText({
    instruction,
    onChunk: (d) => {
      if (opts.onChunk) opts.onChunk(String(d.textChunk || ""), String(d.fullTextSoFar || ""));
    },
  });
}
