export const ENTITY_TYPES = [
  {
    id: "personagem", l: "Personagem", p: "Personagens", icon: "🧝", color: "#a78bfa",
    fields: ["aparencia", "personalidade", "idade", "nascimento", "especie", "ocupacao", "status", "afiliacao", "poderes", "objetivos", "medos", "segredos"],
  },
  {
    id: "organizacao", l: "Organização", p: "Organizações", icon: "🏛️", color: "#f59e0b",
    fields: ["tipo_org", "lideranca", "sede", "fundacao", "membros", "ideologia", "recursos", "status"],
  },
  {
    id: "local", l: "Local", p: "Locais", icon: "🗺️", color: "#34d399",
    fields: ["tipo_local", "regiao", "populacao", "governo", "clima", "pontos", "status"],
  },
  {
    id: "item", l: "Item", p: "Itens", icon: "⚔️", color: "#60a5fa",
    fields: ["tipo_item", "dono", "origem", "materiais", "poderes", "status"],
  },
  {
    id: "criatura", l: "Criatura", p: "Criaturas", icon: "🐉", color: "#f87171",
    fields: ["especie", "habitat", "dieta", "porte", "perigo", "poderes"],
  },
  {
    id: "evento", l: "Evento", p: "Eventos", icon: "📜", color: "#38bdf8",
    fields: ["data_evento", "local_evento", "participantes", "consequencias"],
  },
  {
    id: "universo", l: "Universo", p: "Universos", icon: "🌌", color: "#c084fc",
    fields: ["genero", "era", "escala", "sistema", "tom"],
  },
  {
    id: "nota", l: "Nota", p: "Notas", icon: "📝", color: "#94a3b8",
    fields: [],
  },
];

export const FIELD_DEFS = {
  aparencia: { l: "Aparência", t: "long", h: "Traços físicos, roupa, marcas…" },
  personalidade: { l: "Personalidade", t: "long", h: "Temperamento, valores, manias…" },
  idade: { l: "Idade", t: "text", h: "ex: 27 anos, 300 anos" },
  nascimento: { l: "Nascimento", t: "text", h: "Data / local de nascimento" },
  especie: { l: "Espécie", t: "text", h: "ex: humana, élfica, meio-dragão" },
  ocupacao: { l: "Ocupação", t: "text", h: "ex: capitã da guarda" },
  status: { l: "Status", t: "suggest", options: ["Vivo(a)", "Morto(a)", "Desaparecido(a)", "Desconhecido(a)", "Imortal", "Ativo(a)", "Extinto(a)", "Arquivado(a)"] },
  afiliacao: { l: "Afiliação", t: "text", h: "Grupo, facção, casa…" },
  poderes: { l: "Habilidades / Poderes", t: "long", h: "O que essa ficha é capaz de fazer" },
  objetivos: { l: "Objetivos", t: "long", h: "O que quer alcançar" },
  medos: { l: "Medos", t: "text", h: "" },
  segredos: { l: "Segredos", t: "long", h: "O que ninguém sabe…" },
  tipo_org: { l: "Tipo", t: "suggest", options: ["Ordem", "Clã", "Império", "Guilda", "Seita", "Casa nobre", "Corporaçāo", "Seita", "Bando", "Conselho"] },
  lideranca: { l: "Liderança", t: "text", h: "" },
  sede: { l: "Sede", t: "text", h: "" },
  fundacao: { l: "Fundação", t: "text", h: "" },
  membros: { l: "Membros notáveis", t: "text", h: "separe por vírgulas" },
  ideologia: { l: "Ideologia", t: "long", h: "" },
  recursos: { l: "Recursos", t: "text", h: "" },
  tipo_local: { l: "Tipo", t: "suggest", options: ["Cidade", "Vila", "Aldeia", "Reino", "Ilha", "Continente", "Floresta", "Deserto", "Montanha", "Ruína", "Templo", "Dimensão"] },
  regiao: { l: "Região", t: "text", h: "" },
  populacao: { l: "População", t: "text", h: "" },
  governo: { l: "Governo", t: "text", h: "" },
  clima: { l: "Clima", t: "text", h: "" },
  pontos: { l: "Pontos de interesse", t: "long", h: "" },
  tipo_item: { l: "Tipo", t: "suggest", options: ["Arma", "Armadura", "Artefato", "Relíquia", "Consumível", "Documento", "Veículo", "Ferramenta"] },
  dono: { l: "Dono atual", t: "text", h: "" },
  origem: { l: "Origem", t: "text", h: "" },
  materiais: { l: "Materiais", t: "text", h: "" },
  habitat: { l: "Habitat", t: "text", h: "" },
  dieta: { l: "Dieta", t: "text", h: "" },
  porte: { l: "Porte", t: "suggest", options: ["Minúsculo", "Pequeno", "Médio", "Grande", "Colossal"] },
  perigo: { l: "Nível de perigo", t: "suggest", options: ["Inofensivo", "Baixo", "Médio", "Alto", "Letal", "Catastrófico"] },
  data_evento: { l: "Data", t: "text", h: "" },
  local_evento: { l: "Local", t: "text", h: "" },
  participantes: { l: "Participantes", t: "text", h: "separe por vírgulas" },
  consequencias: { l: "Consequências", t: "long", h: "" },
  genero: { l: "Gênero", t: "text", h: "ex: fantasia sombria, sci-fi" },
  era: { l: "Era", t: "text", h: "" },
  escala: { l: "Escala", t: "suggest", options: ["Planeta", "Sistema", "Galáxia", "Universo", "Multiverso", "Cidade", "Continente"] },
  sistema: { l: "Magia / Tecnologia", t: "long", h: "Como o sobrenatural funciona aqui" },
  tom: { l: "Tom", t: "text", h: "ex: esperançoso, brutal" },
};

export const RELATION_GROUPS = {
  familia: { l: "Família", color: "#f472b6", icon: "👪" },
  social: { l: "Social", color: "#4ade80", icon: "🤝" },
  hierarquia: { l: "Hierarquia", color: "#fbbf24", icon: "👑" },
  lugar: { l: "Lugar & Coisas", color: "#38bdf8", icon: "🗺️" },
  narrativa: { l: "Narrativa", color: "#c084fc", icon: "📖" },
  outros: { l: "Outros", color: "#94a3b8", icon: "🔗" },
};

export const RELATION_KINDS = [
  { id: "pai", f: "é pai de", i: "é filho(a) de", g: "familia", step: 1 },
  { id: "mae", f: "é mãe de", i: "é filho(a) de", g: "familia", step: 1 },
  { id: "avo", f: "é avô/avó de", i: "é neto(a) de", g: "familia", step: 2 },
  { id: "tio", f: "é tio(a) de", i: "é sobrinho(a) de", g: "familia" },
  { id: "primo", f: "é primo(a) de", i: "é primo(a) de", g: "familia", sym: true },
  { id: "irmao", f: "é irmão(ã) de", i: "é irmão(ã) de", g: "familia", sym: true },
  { id: "conjuge", f: "é casado(a) com", i: "é casado(a) com", g: "familia", sym: true },
  { id: "namoro", f: "tem um romance com", i: "tem um romance com", g: "familia", sym: true },
  { id: "ex", f: "é ex de", i: "é ex de", g: "familia", sym: true },
  { id: "amigo", f: "é amigo(a) de", i: "é amigo(a) de", g: "social", sym: true },
  { id: "aliado", f: "é aliado(a) de", i: "é aliado(a) de", g: "social", sym: true },
  { id: "rival", f: "é rival de", i: "é rival de", g: "social", sym: true },
  { id: "inimigo", f: "é inimigo(a) de", i: "é inimigo(a) de", g: "social", sym: true },
  { id: "mentor", f: "é mentor(a) de", i: "é aprendiz de", g: "social" },
  { id: "conhece", f: "conhece", i: "conhece", g: "social", sym: true },
  { id: "membro", f: "é membro de", i: "tem como membro", g: "hierarquia" },
  { id: "lider", f: "lidera", i: "é liderado(a) por", g: "hierarquia" },
  { id: "fundador", f: "fundou", i: "foi fundado(a) por", g: "hierarquia" },
  { id: "serve", f: "serve a", i: "é servido(a) por", g: "hierarquia" },
  { id: "mora", f: "mora em", i: "tem como morador(a)", g: "lugar" },
  { id: "nasceu", f: "nasceu em", i: "é terra natal de", g: "lugar" },
  { id: "localizado", f: "fica em", i: "contém", g: "lugar" },
  { id: "possui", f: "possui", i: "pertence a", g: "lugar" },
  { id: "participou", f: "participou de", i: "teve como participante", g: "narrativa" },
  { id: "causou", f: "causou", i: "foi causado(a) por", g: "narrativa" },
  { id: "criou", f: "criou", i: "foi criado(a) por", g: "narrativa" },
  { id: "relacionado", f: "tem ligação com", i: "tem ligação com", g: "outros", sym: true },
];

export function allTypes(customTypes) {
  const base = ENTITY_TYPES.slice();
  for (const t of customTypes || []) base.push(t);
  return base;
}

export function typeById(id, customTypes) {
  const list = allTypes(customTypes);
  return list.find((t) => t.id === id) || list[list.length - 1];
}

// O catálogo de tipos de relação (anexos) é editável: `customKinds` guarda tanto
// os tipos novos quanto as edições de um tipo padrão (mesmo `id` = sobrescreve).
export function allKinds(customKinds) {
  const custom = (customKinds || []).filter((k) => k && k.id);
  if (!custom.length) return RELATION_KINDS.slice();
  const overridden = new Set(custom.map((k) => k.id));
  return RELATION_KINDS.filter((k) => !overridden.has(k.id)).concat(custom);
}

export function defaultKind(id) {
  return RELATION_KINDS.find((k) => k.id === id) || null;
}

export function kindById(id, customKinds) {
  const custom = (customKinds || []).find((k) => k && k.id === id);
  if (custom) return custom;
  return defaultKind(id) || RELATION_KINDS[RELATION_KINDS.length - 1];
}

export function relationHintsFor(kinds) {
  return (kinds || RELATION_KINDS).map((k) => k.id + " (" + k.f + ")").join(", ");
}

export function fieldDef(key) {
  return FIELD_DEFS[key] || { l: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), t: "text", h: "" };
}

export const AI_RELATION_HINTS = relationHintsFor(RELATION_KINDS);
