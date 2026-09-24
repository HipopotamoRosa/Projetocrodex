import { store } from "./store.js";
import { norm } from "./util.js";
import { competencia } from "./competencia/store.js";

const D = {
  aria: "Capitã da Guarda de Prata, nasceu em [[Pedra Alta]] e cresceu entre o martelo do pai e as ervas da mãe. Jurou vingança contra [[Lorde Malvek]] depois que a [[Queda de Pedra Alta]] queimou a vila. Carrega a [[Lâmina do Crepúsculo]], herdada de [[Ser Kael Dorn]].\n\nFala pouco, observa muito. Acredita que a [[Ordem do Sol Nascente]] ainda pode ser salva, mesmo depois da traição de [[Ysold Vek]].",
  borin: "Ferreiro de [[Pedra Alta]]. Forjou metade das ferramentas da vila e a guarda de treino da filha. Sobreviveu ao ataque escondido na forja, e desde então culpa a si mesmo.",
  maren: "Curandeira de [[Pedra Alta]]. Conhece as ervas do Vale de Eldoria melhor que qualquer mestre da [[Ordem do Sol Nascente]]. Ensinou Aria a ler as pessoas antes das espadas.",
  talia: "Irmã mais nova de [[Aria Valen]]. Foi enviada a [[Vessport]] antes da queda da vila e hoje estuda com os escribas do porto, colecionando mapas antigos.",
  malvek: "Senhor da Casa Malvek. Incendiou [[Pedra Alta]] em busca da [[Coroa de Cinzas]] e não hesitaria em fazê-lo de novo. Nunca aparece duas vezes com o mesmo rosto.",
  ysold: "Mago da [[Ordem do Sol Nascente]], desertou levando o código dos sigilos. Vive escondido nas [[Cavernas de Dorn]], vendendo segredos para quem pagar melhor.",
  kael: "Cavaleiro aposentado da [[Ordem do Sol Nascente]]. Treinou [[Aria Valen]] e lhe confiou a [[Lâmina do Crepúsculo]] quando percebeu que não tinha mais força para usá-la.",
  ordem: "Antiga ordem de cavaleiros e magos que jurou proteger as relíquias de Eldoria. Fragmentada desde a traição de [[Ysold Vek]].",
  lamina: "Espada longa de aço estrelado, forjada nos primeiros anos da [[Ordem do Sol Nascente]]. Esquenta perto de traição.",
  coroa: "Relíquia de ferro negro que guarda as vozes dos reis mortos de [[Eldoria]]. Foi o motivo da [[Queda de Pedra Alta]].",
  pedra: "Vila de pedra clara encravada no alto do vale. Foi a terra natal de [[Aria Valen]] até a [[Queda de Pedra Alta]].",
  vessport: "Cidade portuária de [[Eldoria]], cheia de mercadores, espiões e mapas falsos. É onde [[Talia Valen]] vive agora.",
  cavernas: "Rede de túneis sob o vale, usada por contrabandistas e por quem precisa desaparecer — como [[Ysold Vek]].",
  queda: "O ataque que incendiou [[Pedra Alta]] e dispersou a família Valen. Deu início à vingança de [[Aria Valen]].",
  eldoria: "Reino antigo dividido entre casas nobres, ordens de cavaleiros e ruínas que ninguém explica. A magia escorre pelas fendas do mundo.",
};

export async function loadSampleData() {
  const fWorld = store.createFolder({ name: "Reino de Eldoria", icon: "🏰", color: "#c084fc", description: "O universo inteiro: reinos, eras, magia." });
  const fHouse = store.createFolder({ name: "Casa Valen", icon: "🛡️", color: "#38bdf8", parentId: fWorld.id, description: "A família protagonista." });
  const fOrder = store.createFolder({ name: "Ordem do Sol Nascente", icon: "☀️", color: "#f59e0b", parentId: fWorld.id, description: "Aliados, mentores e irmandades." });
  const fDark = store.createFolder({ name: "Vilões & Ameaças", icon: "💀", color: "#f87171", parentId: fWorld.id, description: "Quem quer ver o mundo queimar." });

  const mk = (data) => store.createEntity(data);

  const eldoria = mk({ name: "Eldoria", type: "universo", folderId: fWorld.id, summary: "Reino antigo de casas nobres e ruínas vivas.", description: D.eldoria, tags: ["cenário"], fields: { genero: "fantasia sombria", era: "Terceira Era", escala: "Continente", sistema: "A magia vem das fendas abertas pela queda das relíquias; cada feitiço cobra um pedaço de memória.", tom: "Esperançoso, mas sangrento." } });

  const aria = mk({ name: "Aria Valen", type: "personagem", folderId: fHouse.id, favorite: true, tags: ["protagonista", "espadachim"], summary: "Capitã da Guarda de Prata em busca de vingança — e de um motivo para não se perder nela.", description: D.aria, fields: { aparencia: "Cabelo escuro preso em trança de combate, cicatriz fina sobre a sobrancelha esquerda, olhos cinzentos.", personalidade: "Fria com estranhos, ferozmente leal a quem confia. Paciente como uma lâmina sendo afiada.", idade: "27 anos", nascimento: "Pedra Alta, Vale de Eldoria", especie: "humana", ocupacao: "Capitã da Guarda de Prata", status: "Vivo(a)", afiliacao: "Ordem do Sol Nascente", poderes: "Lê o peso das armas pelo som; golpe 'Meia-lua' aprendido com Kael.", objetivos: "Encontrar Malvek e reconstruir a Guarda de Prata.", medos: "Chegar tarde como chegou em Pedra Alta.", segredos: "Guardou o anel de Ysold Vek sem contar a ninguém — quer ouvir a versão dele antes de matá-lo." } });

  const borin = mk({ name: "Borin Valen", type: "personagem", folderId: fHouse.id, summary: "Ferreiro de Pedra Alta, pai de Aria e Talia.", description: D.borin, fields: { ocupacao: "Ferreiro", status: "Vivo(a)", idade: "58 anos", personalidade: "Teimoso, caloroso, alérgico a despedidas.", aparencia: "Mãos queimadas de forja, barba grisalha curta.", medos: "Que a filha volte igual ao que ela jurou ser." } });

  const maren = mk({ name: "Maren Valen", type: "personagem", folderId: fHouse.id, summary: "Curandeira, mãe de Aria e Talia.", description: D.maren, fields: { ocupacao: "Curandeira", status: "Vivo(a)", idade: "55 anos", personalidade: "Serena, prática, incapaz de ficar de braços cruzados.", aparencia: "Cabelo grisalho solto, bolsas de ervas no avental." } });

  const talia = mk({ name: "Talia Valen", type: "personagem", folderId: fHouse.id, summary: "Irmã mais nova, aprendiz de escriba em Vessport.", description: D.talia, fields: { ocupacao: "Escriba aprendiz", status: "Vivo(a)", idade: "16 anos", personalidade: "Curiosa, falante, guarda mapas como outros guardam moedas.", objetivos: "Mapear todas as ruínas de Eldoria." } });

  const malvek = mk({ name: "Lorde Malvek", type: "personagem", folderId: fDark.id, favorite: true, tags: ["antagonista"], summary: "Senhor da Casa Malvek. Incendiou Pedra Alta atrás da Coroa de Cinzas.", description: D.malvek, fields: { aparencia: "Alto, elegante, sempre de luvas de couro negro.", personalidade: "Educado até o momento exato em que deixa de ser.", ocupacao: "Lorde da Casa Malvek", status: "Vivo(a)", poderes: "Nunca usa o mesmo rosto duas vezes — dizem que vendeu o próprio.", objetivos: "Reunir as relíquias e sentar-se no Trono de Cinzas.", segredos: "A Coroa de Cinzas não obedece a ele; apenas o tolera." } });

  const ysold = mk({ name: "Ysold Vek", type: "personagem", folderId: fDark.id, summary: "Mago renegado da Ordem do Sol Nascente.", description: D.ysold, fields: { ocupacao: "Mago renegado", status: "Desconhecido(a)", idade: "Desconhecida", poderes: "Sigilos roubados da Ordem; abre passagens curtas entre sombras.", objetivos: "Sobreviver, cobrar caro e não ser encontrado por Aria.", medos: "Que alguém leia o código dos sigilos antes dele." } });

  const kael = mk({ name: "Ser Kael Dorn", type: "personagem", folderId: fOrder.id, summary: "Cavaleiro aposentado, mentor de Aria.", description: D.kael, fields: { ocupacao: "Cavaleiro aposentado", status: "Vivo(a)", idade: "63 anos", personalidade: "Seco, irônico, incapaz de assistir a uma injustiça calado.", aparencia: "Branco dos anos, perna esquerda que trava no frio." } });

  const ordem = mk({ name: "Ordem do Sol Nascente", type: "organizacao", folderId: fOrder.id, summary: "Ordem de cavaleiros e magos guardiã das relíquias.", description: D.ordem, fields: { tipo_org: "Ordem", lideranca: "Conselho de Sete Mantos", sede: "Solar do Amanhecer, em Vessport", fundacao: "Segunda Era", membros: "Ser Kael Dorn, Aria Valen, Ysold Vek", ideologia: "Nenhuma relíquia pertence a um só homem.", recursos: "Sigilos, arquivos proibidos, três navios.", status: "Ativo(a)" } });

  const lamina = mk({ name: "Lâmina do Crepúsculo", type: "item", folderId: fOrder.id, summary: "Espada de aço estrelado que esquenta perto de traição.", description: D.lamina, fields: { tipo_item: "Arma", dono: "Aria Valen", origem: "Forjada nos primeiros anos da Ordem", materiais: "Aço estrelado, prata de lua", poderes: "Aquece quando alguém por perto mente com intenção de trair.", status: "Ativo(a)" } });

  const coroa = mk({ name: "Coroa de Cinzas", type: "item", folderId: fDark.id, summary: "Relíquia de ferro negro que guarda as vozes dos reis mortos.", description: D.coroa, fields: { tipo_item: "Relíquia", dono: "Lorde Malvek", origem: "Túmulos de Eldoria", materiais: "Ferro negro, vidro vulcânico", status: "Ativo(a)" } });

  const pedra = mk({ name: "Pedra Alta", type: "local", folderId: fWorld.id, summary: "Vila de pedra clara no alto do vale, terra natal de Aria.", description: D.pedra, fields: { tipo_local: "Vila", regiao: "Vale de Eldoria", populacao: "cerca de 400 almas", governo: "Conselho de anciãos", clima: "Frio e ventoso", pontos: "A forja de Borin, o poço velho, o mirante sobre o vale.", status: "Extinto(a)" } });

  const vessport = mk({ name: "Vessport", type: "local", folderId: fWorld.id, summary: "Cidade portuária de mercadores, espiões e mapas falsos.", description: D.vessport, fields: { tipo_local: "Cidade", regiao: "Costa Leste de Eldoria", populacao: "12 mil habitantes", governo: "Casa de Mercadores", clima: "Úmido, cheio de névoa", pontos: "Mercado das Âncoras, Solar do Amanhecer, os cais falsos." } });

  const cavernas = mk({ name: "Cavernas de Dorn", type: "local", folderId: fDark.id, summary: "Túneis sob o vale, usados por quem precisa desaparecer.", description: D.cavernas, fields: { tipo_local: "Ruína", regiao: "Sob o Vale de Eldoria", clima: "Gotejante, quente no fundo", pontos: "A câmara dos sigilos, a ponte quebrada, o lago cego." } });

  const queda = mk({ name: "Queda de Pedra Alta", type: "evento", folderId: fWorld.id, summary: "O ataque que incendiou Pedra Alta e dispersou a família Valen.", description: D.queda, fields: { data_evento: "Inverno do ano 17 da Terceira Era", local_evento: "Pedra Alta", participantes: "Lorde Malvek, Borin Valen, Aria Valen", consequencias: "A vila foi abandonada, os Valen se separaram e Aria jurou vingança." } });

  const rel = (a, b, kind, notes) => store.createRelation({ from: a.id, to: b.id, kind, notes, createdBy: "sample" });

  rel(borin, aria, "pai", "Borin criou Aria na forja de Pedra Alta.");
  rel(maren, aria, "mae", "");
  rel(borin, talia, "pai", "");
  rel(maren, talia, "mae", "");
  rel(aria, talia, "irmao", "As duas se escrevem por cartas desde que Talia partiu para Vessport.");
  rel(borin, maren, "conjuge", "");
  rel(kael, aria, "mentor", "Treinou Aria por seis invernos e lhe confiou a Lâmina do Crepúsculo.");
  rel(kael, ordem, "membro", "Serviu a Ordem até a perna ceder.");
  rel(aria, ordem, "membro", "Entrou para reconstruir a Guarda de Prata.");
  rel(ysold, ordem, "membro", "Desertou levando o código dos sigilos.");
  rel(aria, ysold, "inimigo", "Aria quer ouvir a versão dele antes de decidir o que fazer.");
  rel(malvek, aria, "inimigo", "Malvek queimou a vila dela e não se lembra do nome.");
  rel(malvek, ysold, "aliado", "Compra segredos do mago renegado.");
  rel(aria, pedra, "nasceu", "");
  rel(aria, vessport, "mora", "Passa temporadas no Solar do Amanhecer.");
  rel(talia, vessport, "mora", "Estuda com os escribas do porto.");
  rel(ysold, cavernas, "mora", "Esconde-se na câmara dos sigilos.");
  rel(pedra, eldoria, "localizado", "Encravada no Vale de Eldoria.");
  rel(vessport, eldoria, "localizado", "Principal porto do reino.");
  rel(aria, lamina, "possui", "Herdada de Ser Kael Dorn.");
  rel(malvek, coroa, "possui", "A relíquia que ele nunca conseguiu usar de verdade.");
  rel(aria, queda, "participou", "Tinha 17 anos quando a vila queimou.");
  rel(malvek, queda, "causou", "Ordenou o ataque atrás da Coroa de Cinzas.");
  rel(queda, pedra, "causou", "A vila nunca foi reconstruída.");

  // Competência: os gráficos de poder das fichas de exemplo. O catálogo é
  // global (as seis mesmas medidas), então casamos pelo nome e ignoramos o que
  // o usuário tiver renomeado ou apagado.
  const attrId = (name) => {
    const target = norm(name);
    const attr = competencia.list().find((a) => norm(a.name) === target);
    return attr ? attr.id : null;
  };
  const cap = (entity, spec) => {
    for (const [name, value] of Object.entries(spec.values || {})) {
      const id = attrId(name);
      if (id) competencia.setValue(entity.id, id, value);
    }
    for (const [name, text] of Object.entries(spec.notes || {})) {
      const id = attrId(name);
      if (id) competencia.setNote(entity.id, id, text);
    }
    for (const tag of spec.tags || []) competencia.addTag(entity.id, tag);
    for (const medal of spec.medals || []) competencia.addMedal(entity.id, medal);
    if (spec.caption) competencia.setCaption(entity.id, spec.caption);
  };

  cap(aria, {
    values: { DURABILIDADE: 7, ENERGIA: 6, "HABILIDADES DE LUTA": 9, "INTELIGÊNCIA": 6, VELOCIDADE: 8, "FORÇA": 7 },
    notes: { "HABILIDADES DE LUTA": "Golpe “Meia-lua”, aprendido com Kael." },
    tags: [
      { label: "Guarda de Prata", icon: "🛡️", color: "#22d3ee", note: "Comanda o que sobrou da guarda de Pedra Alta." },
      { label: "Lâmina do Crepúsculo", icon: "⚔️", color: "#a78bfa", note: "A espada esquenta perto de traição." },
    ],
    medals: [
      { label: "Heroína de Pedra Alta", icon: "🎖️", color: "#facc15", note: "O vale inteiro viu quando ela segurou o portão sozinha." },
    ],
    caption: "A melhor lâmina do vale — e a que menos dorme.",
  });
  cap(malvek, {
    values: { DURABILIDADE: 8, ENERGIA: 9, "HABILIDADES DE LUTA": 7, "INTELIGÊNCIA": 9, VELOCIDADE: 6, "FORÇA": 6 },
    notes: { "INTELIGÊNCIA": "Planeja três invernos à frente." },
    tags: [
      { label: "Rosto Emprestado", icon: "🎭", color: "#e879f9", note: "Nunca aparece duas vezes com o mesmo rosto." },
      { label: "Coroa de Cinzas", icon: "👑", color: "#ef4444", note: "A relíquia o tolera — não o obedece." },
    ],
    medals: [
      { label: "Lorde do Vale", icon: "🎖️", color: "#facc15", note: "Título que ele mesmo escreveu nas portas da capital." },
    ],
    caption: "Medido uma vez, e nunca pela mesma pessoa.",
  });
  cap(kael, {
    values: { DURABILIDADE: 6, ENERGIA: 4, "HABILIDADES DE LUTA": 8, "INTELIGÊNCIA": 7, VELOCIDADE: 3, "FORÇA": 6 },
    notes: { VELOCIDADE: "A perna esquerda trava no frio." },
    tags: [{ label: "Velho Mestre", icon: "🌙", color: "#facc15", note: "Seis invernos ensinando Aria na forja de Borin." }],
    caption: "Ainda ensina mais do que luta.",
  });
  cap(ysold, {
    values: { DURABILIDADE: 4, ENERGIA: 8, "HABILIDADES DE LUTA": 4, "INTELIGÊNCIA": 9, VELOCIDADE: 7, "FORÇA": 3 },
    notes: { ENERGIA: "Os sigilos cobram caro de quem os usa." },
    tags: [{ label: "Sigilos Roubados", icon: "🔮", color: "#60a5fa", note: "Abre passagens curtas entre sombras." }],
    caption: "Perigoso pelo que sabe, não pelo que levanta.",
  });
  cap(borin, {
    values: { DURABILIDADE: 7, ENERGIA: 4, "HABILIDADES DE LUTA": 3, "INTELIGÊNCIA": 5, VELOCIDADE: 2, "FORÇA": 8 },
    tags: [{ label: "Forja de Guerra", icon: "🔨", color: "#f97316", note: "Forjou a guarda de treino da filha — e metade das ferramentas da vila." }],
    caption: "O martelo pesa mais que a espada.",
  });
  cap(maren, {
    values: { DURABILIDADE: 5, ENERGIA: 5, "HABILIDADES DE LUTA": 2, "INTELIGÊNCIA": 8, VELOCIDADE: 4, "FORÇA": 3 },
    tags: [{ label: "Ervas de Eldoria", icon: "🌿", color: "#34d399", note: "Conhece o vale planta por planta." }],
  });
  cap(talia, {
    values: { DURABILIDADE: 3, ENERGIA: 5, "HABILIDADES DE LUTA": 2, "INTELIGÊNCIA": 8, VELOCIDADE: 5, "FORÇA": 2 },
    notes: { "INTELIGÊNCIA": "Lê mapas como outros leem romances." },
    tags: [{ label: "Cartógrafa", icon: "🗺️", color: "#22d3ee", note: "Quer mapear todas as ruínas de Eldoria." }],
  });

  window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
  window.dispatchEvent(new CustomEvent("codex:data-changed"));

  return { folders: 4, entities: store.entities.size, relations: store.relations.size, names: [aria.name, malvek.name, kael.name] };
}
