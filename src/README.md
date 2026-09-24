# Codex — Organizador de Personagens, Mundos e Relações

Aplicação de worldbuilding em pt-BR: fichas ricas (imagem, descrição, campos
personalizados) organizadas em pastas aninhadas infinitas, com grafo de relações
("rede") e árvore genealógica, tudo assistido por IA. Inclui a aba **Livro**: um
editor de capítulos (até 50.000 caracteres cada) com **corretor ortográfico pt-BR**
offline, no estilo do corretor do Google Documentos. Inclui também a aba
**Competência**: os gráficos de poder (aros de rosca), as tags especiais e as
condecorações de cada ficha, desenhados na Descrição dela (aros e tags) e no cabeçalho
(condecorações). A aba **Apresentação** (a primeira) é a capa do
Codex: o resumo do mundo, uma imagem de capa, a pergunta livre à IA e as estatísticas.

Cada pessoa que abre o gerador cria o **seu próprio universo** (o seu mundo): os
universos são mundos separados e independentes, guardados no mesmo navegador. A
**Biblioteca de universos** é a tela de entrada — ver a seção
[Universos](#universos-o-pedido-mais-recente) abaixo, que é obrigatória para quem
for mexer em qualquer store.

Ponto de entrada para um novo agente: **leia este arquivo primeiro**, depois
[`SPEC.md`](SPEC.md) (o que o usuário pediu) e [`TODO.md`](TODO.md) (pendências).

## Como o gerador é montado

- `main.pjs` — `$meta` (título/descrição/tags em pt-BR e **`header mode = minimal`**,
  que recolhe a barra de menu do Perchance na página publicada), os imports de plugin
  (`kv`, `upload-plugin`, `super-fetch-plugin`, `ai-text-plugin`, `text-to-image-plugin`) e a lista `codex` com configuração
  de alto nível: `appTitle`, `aiPersona`, `maxSuggestions`, `maxCatalog`,
  `maxImagensPorFicha` (limite de imagens por ficha, padrão 9) e `imageTipos` (a lista
  de tipos/enquadramentos que a faixa de imagens mostra; o usuário pode acrescentar
  "Outra…" na hora, que vira um tipo novo só daquela ficha).
  Editar a `aiPersona` aqui muda o tom de toda a IA. O `super-fetch-plugin` serve ao
  backup do código (`src/codeBackup.js` lê o `index.html` salvo, que o `fetch` normal
  não alcança).
- `index.html` — casca da app: topbar, `#app` (com as classes de estado
  `sidebarClosed` / `sidebarOpenMobile` / `detailOpen`), `#viewTabs` (7 abas:
  Apresentação / Fichas / Rede / Árvore / Livro / Timeline / Competência),
  `#presentView`, `#browseView`, `#graphView`
  (`#graphToolbar`, `#graphCanvas`), `#bookView`, `#timelineView`, `#competenciaView`,
  `#modalRoot`,
  `#toastRoot`, `#loadingOverlay`. Carrega `src/main.js` como módulo.
- `src/` — todo o resto. Os módulos se importam por caminhos relativos normais de
  ES module; a app é `src/main.js`.

## Arquitetura dos módulos

| Arquivo | Papel |
| --- | --- |
| `src/main.js` | `boot()`: espera `root.kv`, carrega o **registro de universos** (`universes.load()`), carrega o store do universo ativo, aplica tema, monta a UI, liga eventos e expõe a API de debug `window.codex`. Sem universo ativo, o boot abre a **Biblioteca** em modo boas-vindas e para ali (não inicializa a app). Também `openHelp()` e `loadSampleFlow()`. |
| `src/universe.js` | **Registro de universos** e o **namespace de armazenamento**: `UNIVERSE_FOLDERS` (as 6 pastas do app), `kvFolder(name)` (a pasta `name` já com o prefixo do universo ativo — é o que todos os stores usam), `universes` (`load`/`create`/`update`/`touch`/`switchTo`/`duplicate`/`destroy`/`exportOne`/`importFile`/`stats`/`countsLabel`/`preview`/`hydrate`/`clearBootstrapSample`) e `DEFAULT_EMOJI`. Guarda também a **capa** de cada Codex (`covers` em memória, hidratada na carga; `coverFor(id)`/`cover(id)`/`setCover(id, dataUrl)` — chave `cover` na pasta `codex` daquele universo) — a imagem que aparece na Apresentação e na miniatura do card. |
| `src/ui/universes.js` | A **Biblioteca de universos** (overlay de tela cheia): `openUniverseLibrary`, `renderLibrary` (atalhos, grid de cards, estado vazio de primeira vez), `openUniverse` (flush → `switchTo` → `location.reload()`), os fluxos de criar/renomear/duplicar/exportar/importar/apagar e `updateUniverseButton()` (o botão do topbar). O card (`universeCardHtml`) mostra a **capa** do Codex (`uniThumbImg`) quando existe, senão o gradiente com o emoji; o campo "Sobre o que é este mundo?" (`#ufAbout`) aceita **2.000 caracteres**. |
| `src/present/view.js` | A aba **Apresentação**: `initPresentView()` → `createPresentView(host)` devolve `{show(), hide(), refresh(), ask, streaming}`. Renderiza o cabeçalho (emoji + nome, chips de gênero, datas, "✏️ Editar" / "🌍 Codexs"), o texto do resumo em leitura (`renderRich`), a **capa panorâmica** (trocar por dispositivo ou link, remover, zoom) e a **grade de estatísticas** (um cartão por tipo + Capítulos / Relações / Timeline; clicar abre a parte correspondente). `refresh()` não redesenha enquanto a IA responde. |
| `src/data.js` | Dados estáticos: `ENTITY_TYPES` (8 tipos + campos sugeridos), `FIELD_DEFS` (rótulo/tipo/placeholder/dicas de cada campo), `RELATION_GROUPS` (6 grupos coloridos), `RELATION_KINDS` (28 tipos de relação **padrão**, com `f`/`i` para direção, `sym` para simétricos, `step` para gerações de parentesco). O catálogo é **editável em tempo de execução**: `allKinds(customKinds)` (padrões + tipos do usuário, com sobrescrita por `id`), `defaultKind(id)`, `kindById(id, customKinds)`, `relationHintsFor(kinds)`; helpers de tipo: `allTypes`, `typeById`, `fieldDef`. |
| `src/store.js` | Estado + persistência. Mapas `entities`, `folders`, `relations` e `settings`, `events` (emitter). CRUD de ficha/pasta/relação, `search`, `suggestByName`, `resolveName`, `mentionNames`, `childrenFolders`, `descendantFolderIds`, `folderPath`, `stats`, `exportAll`/`importAll`. Guarda no kv-plugin. **Imagens**: cada ficha tem `images: [{id, label, ref, addedAt, byAI, updatedAt?}]` + `imageIndex` (a imagem **ativa**), `boxes` (opcional: os nomes das caixas de imagem daquela ficha, ver `setEntityBoxes` — sem ele valem os `imageTipos` do `main.pjs`) e `descImages: [{id, ref, caption, addedAt}]`; a API é `images/descImages/activeImage/activeIndex/imageById/setActiveImage/addEntityImage/renameEntityImage/replaceEntityImage/removeEntityImage/setEntityBoxes/addDescImage/updateDescImage/removeDescImage/imageRefsOf/getImageSrc/getSrcByRef`. `migrateImages` converte o antigo `{image, imageRef}` num item de `images`. **Anexos (tipos de relação) editáveis**: `kinds()`, `kind(id)`, `addKind`, `updateKind`, `restoreKind`, `removeKind(id, mode)`, `kindUsage(id)`, `isCustomKind(id)`, `kindGroups()` — guardados em `settings.customKinds` (mesmo `id` de um padrão = sobrescreve; o `id` nunca muda) e levados no `exportAll`/`importAll`. |
| `src/ai.js` | Toda a camada de IA: `extractFromText`, `suggestRelations`, `completeEntity`, `describeImage`, `matchProposals`, `resolveProposalName`, `kindFromAI`, `catalogText`, `relationsText`, `entityToPrompt`, `parseJsonLoose`. O **interruptor geral** mora aqui: `enabled()` (lê `store.settings.aiEnabled`, ligado por padrão), `assertEnabled()` e `AI_OFF_MESSAGE` — **sem controle na interface desde a rodada 14**. A **Pergunta ao mundo** (aba Apresentação): `worldBrief(budget)` monta o contexto do Codex (resumo + fichas por tipo + relações + capítulos + timeline), `worldQuestionInstruction(pergunta, brief)` e `askWorld(question, {brief, onChunk})` devolvem o objeto de `root.generateText` (com `.stop()`). `cfg()` lê a lista `codex` do `main.pjs`. |
| `src/graph.js` | Motor de grafo em canvas (sem dependências): `createGraph(canvas)`. Layouts **força** e **árvore** (genealógica), câmera (pan/zoom/fit), hit-test, seleção/hover, animação, e o motor de rótulos (posicionamento com custo, anti-sobreposição, LOD por zoom). **Ligar arrastando**: botão direito numa esfera, a alça 🔗 no hover, ou toque longo (460 ms) iniciam `state.link`; a linha elástica desenha origem→cursor (tracejada, com a pílula \"Solte sobre outra ficha\") ou origem→alvo (sólida, com seta e aro no alvo), e emite `link` ao soltar sobre outra esfera (ou `nodemenu` se não houve arrasto). ~1400 linhas — o arquivo mais complexo. |
| `src/sample.js` | `loadSampleData()`: carrega o "universo de exemplo" (15 fichas, 24 relações, 4 pastas, + os gráficos de Competência, as tags especiais e as condecorações dos personagens) no store. |
| `src/util.js` | Utilitários puros: `uid`, `esc`, `norm`, `levenshtein`, `similarity`, `bestMatch`, `debounce`, `clamp`, `hashString`, `colorFor`, `splitList`, `formatDate`, `copyText`, `download`, `readFileAsDataUrl`, `shrinkImage`, `renderRich`/`mdToPlain` (renderiza `[[Nome]]`, `[[palavra\|Nome da ficha]]` e nomes conhecidos como links; aceita `opts.refTitle`), `buildNameRegex`, `initials`, `truncate`. |
| `src/emitter.js` | `createEmitter()` — mini pub/sub (`on`/`off`/`emit`). |
| `src/ui/state.js` | Estado de UI (`state`) + preferências (`loadPrefs`/`savePrefs`/`setUI`): view atual, ficha aberta, tema, larguras, flags de layout. |
| `src/ui/dom.js` | Helpers de DOM: `q`/`qa`/`el`, `spinner`, `toast`, `openModal`/`closeTopModal`, `confirmDialog`, `promptDialog`, `popupMenu`, `skeleton`. |
| `src/ui/wordlink.js` | **Vínculo de palavra** — liga uma palavra (ou trecho) a uma ficha sem transformá-la em chip: `WORD_LINK_CLASS`, `wordLinkTitle`, `wordLinkHtml` (`<span class="bkRef wordLink" data-ref>palavra</span>`, a serialização do Livro), `wordLinkMarkup`/`parseWordLink`/`stripWordLinks` (`[[palavra\|Nome da ficha]]`, a serialização de texto puro), `wrapRangeWithLink(range, entity, {root})` (envolve uma faixa do `contenteditable`, só dentro de um mesmo bloco), `pickLinkTarget(opts)`, `openEntityById(id)`, `anchorAt(event)` e `bindInputWordLinks(input, opts)` (menu de botão direito em `<textarea>`/`<input>`). |
| `src/ui/entityPicker.js` | `pickEntities({title, subtitle, multi, selected, confirmLabel})` → Promise com os ids escolhidos (ou `null` se cancelar): modal com busca, chips de tipo e miniaturas das fichas. Também `entityChipHtml(entity, {small})`, o `<button class="entChip" data-goto="ID">` usado no texto do Livro, nos cartões da Timeline e nas fichas. |
| `src/ui/media.js` | Todo o sistema de imagens da ficha: `imageTipos`/`maxImagens` (lê a lista `codex` do `main.pjs`), `fileToRef`/`suggestLabel`, `mediaHtml`/`hydrateMedia`/`applyActive`/`bindMedia` (imagem principal + **faixa de caixas logo abaixo dela**, cada caixa com a sua imagem, ⋯ para renomear/trocar/remover, tile "＋ imagem" no fim da faixa, e as setas ‹ › da fileira de botões andando caixa a caixa **ou imagem a imagem** — no modo somente leitura a faixa vira uma miniatura por imagem, `readerTiles`, e a imagem folheada fica só no `roActive`, sem escrever no instantâneo publicado), `renameBoxLabel` (renomeia a caixa e, junto, a imagem dela), `openAddImageDialog` (upload/colar/URL/IA, com `opts.tipo` pré-selecionado), `openEntityZoom`, `thumbMenu`/`boxMenu`, e as imagens da **descrição**: `descGalleryHtml`/`bindDescGallery`/`hydrateDescGallery`/`openDescZoom` (modo leitura, com tile "＋ imagem na descrição") e `descEditorHtml`/`bindDescEditor`/`rerenderDescEditor`/`hydrateDescEditor` (modo edição, com legenda e ✕). |
| `src/ui/lightbox.js` | `openImageZoom({images, index, title, subtitle, actions, onIndexChange})` — o visualizador em tela cheia: zoom por roda/pinça (até 8×), arrastar para mover, clique/duplo clique para alternar, **swipe** horizontal (touch) para trocar de imagem, setas ‹ ›, contador `n/N`, faixa de miniaturas, barra inferior (− / porcentagem / ＋ / ⟲ / ⤓ baixar / ações extras / ✕) e teclado (`Esc`, `←`, `→`, `+`, `−`, `0`). Os `actions` são botões extras, ex. `✨ Descrever com IA` e `🎨 Gerar retrato`. |
| `src/ui/browse.js` | Barra lateral (árvore de pastas, arrastar-e-soltar), cabeçalho, grade/lista de fichas, menus de contexto, `moveEntityFlow`, busca global. |
| `src/ui/detail.js` | Painel de detalhe/edição da ficha, campos personalizados, galeria de relações, e o **mini-grafo** da ficha (`miniGraphObject`). Monta o bloco de imagem chamando `mediaHtml`/`bindMedia` (leitura) ou `descEditorHtml`/`bindDescEditor` (edição), a galeria de imagens da descrição, o **bloco de condecorações** no cabeçalho (`heroMedalsHtml`, abaixo dos botões) e o nó do mini-grafo (com `imgKey`, ver abaixo). |
| `src/ui/graphview.js` | Aba Rede/Árvore: barra de ferramentas, liga o `createGraph`, filtra por foco, expõe `graphObject()`. **Ligar arrastando**: o grafo emite `link` (solta sobre outra esfera → abre `openKindPicker`) e `nodemenu` (botão direito sem arrastar → menu de contexto); `startPickTarget(id)` é o \"Ligar a outra ficha…\" do menu. |
| `src/ui/relations.js` | **Catálogo de anexos (relações)**: `openKindPicker({fromId, toId, swap, relationId})` — o seletor que abre ao soltar a linha elástica (busca, ⇄ inverte a direção, grade por grupo, aviso de ligações que já existem, \"＋ Criar tipo “termo”\" e, com `relationId`, modo **edição** do tipo de uma ligação existente, com ✓ no tipo atual e botão remover); `kindFormModal({prefill})` — cria um tipo; `openKindsManager()` — o gerenciador do catálogo (frases A→B/B→A, ⇄ mútua, grupo, gerações, id interno imutável, \"padrão\", ↺ restaurar, ✕ apagar com conversão das ligações); `editKindFlow(id)`. Avisa o app por `codex:kinds-changed`. |
| `src/ui/aipanels.js` | Modais de IA: extrair de texto, sugerir conexões, enriquecer ficha, descrever imagem, gerar retrato — todos com revisão antes de aplicar. **Sem ponto de entrada na interface desde a rodada 14**: `initAiPanels()` continua ligado no boot, mas nenhum lugar dispara os eventos `codex:ai-*`. |
| `src/ui/settings.js` | Painel "Arquivo, backup e preferências" (exportar/importar JSON, ZIP total de dados, seção Código do site, apagar tudo, tema) e `applyTheme`. |
| `src/backupZip.js` | Backup total dos **dados** em ZIP: `exportFullZip` (todos os Codexs), `exportSingleZip`, `importBackupFile` (aceita `.zip`/`.json`; ZIP de código é recusado com aviso). JSZip via CDN. |
| `src/codeBackup.js` | Backup do **código do site** no formato do Perchance (`main.pjs` + `index.html` + `src/`, `SITE_FILES`): `exportCodeZip`, `readCodeZip`, `diffCodeZip` (iguais/diferentes/só-no-ZIP/não-carregaram), `siteBackups` (guarda até 3 cópias na pasta kv `codex_sitebackups`), `openCodeImportSummary`, `refreshSiteBackupList`. |
| `src/style.css` | Todo o CSS, com variáveis de tema (escuro/claro) e media queries em 1180 / 980 / 900 / 640 px. As regras do Livro/Timeline estão no fim do arquivo (`.bkTools`/`.bkRT`/`.bkRef`/`.bkSide*`, `.pick*`, `.entChip`, `.appears*`, `.tl*`), incluindo o `::highlight(bk-miss)` do corretor. Depois delas vêm os blocos da **Competência**: a aba (`.cp*` — sidebar, quadro, cartões, modais) e o painel da ficha (`.cap*` — aros, nomes, tags, texto de baixo). Depois vem a **Biblioteca de universos** (`.lib*`, `.uni*`, `.emoji*`) e, no **fim de tudo**, a **Apresentação** (`.pr*` — o cabeçalho, o texto, a capa, o interruptor da IA, a caixa de pergunta e a grade de estatísticas), com as media queries de 1000/720/520 px dos atalhos e do grid. |
| `src/book/store.js` | Livro: capítulos na pasta kv `livro` (chave `cap:<id>`), `CHAR_LIMIT = 50000`, CRUD, ordenação, estatísticas, `exportAll`/`importAll` (assíncronos, levam as imagens), gravação com debounce (500 ms). Cada capítulo é `{id, title, moment, html, text, attachments, images, order, createdAt, updatedAt}`: o **html** é a fonte de verdade, o **text** é derivado (contagem/busca/prévia) e as imagens vivem fora do objeto (pasta `livro_img`) — `update()` apara os órfãos sozinho. |
| `src/book/view.js` | Aba Livro: lista "Capítulos" (cabeçalho, busca, cartões com número/pílula de momento/barra de uso), estado vazio, menu de cada capítulo, importação (.md/.txt/.docx via mammoth) com divisão por títulos `#`, exportação (.md/.txt/backup .json com imagens) e restauração. |
| `src/book/editor.js` | Editor de um capítulo (**contenteditable**): barra (voltar, título, indicador de salvamento, Ortografia, Revisar, **💾 Salvar e sair**, menu ⋯), **barra de formatação** (negrito/itálico/sublinhado/riscado, A−/A+, H1/H2/¶/citação, listas, linha, inserir ficha, inserir imagem, desfazer/refazer), campo "Momento", "Anexar fichas", painel lateral (Anexados / Mencionados), contador e autosave. Sublinhado vermelho via **CSS Custom Highlight API**, menu de sugestões no botão direito (que também anexa a palavra/trecho selecionado a uma ficha via `src/ui/wordlink.js`), modal de revisão, limite de 50.000 (bloqueia a digitação excedente em vez de truncar em silêncio). |
| `src/book/richtext.js` | Utilitários puros do texto rico: `domTextMap(root)` (texto + faixas de cada nó, para converter deslocamento ↔ posição no DOM), `serializeText`, `htmlToText`/`textToHtml` (migração de capítulos antigos em texto puro), `rangeFromOffsets`, `globalOffsetOf`, `sanitizeHtml` (allow-list de tags/atributos) e `stripImageSources` (guarda o `data-img` e joga fora o data-URL antes de persistir). |
| `src/book/spell.js` | Ponte com o corretor: busca o glue/dicionário na thread principal, cria o worker de mesma origem, mantém dicionário pessoal e palavras ignoradas (kv `livro` → `ortografia`), aprende os nomes das fichas e expõe `spell.{prepare,check,suggest,learn,ignore,forget,onStatus,reload}`. |
| `src/book/spell-worker.js` | Worker: instancia o hunspell-wasm, descomprime e carrega o dicionário pt-BR, responde `check`/`suggest`/`learn`/`ignore`/`forget`. |
| `src/timeline/store.js` | Eventos da cronologia na pasta kv `timeline` (chave `evt:<id>`): `{id, title, date, sortKey, description, entityIds, chapterId, createdAt, updatedAt}`, CRUD, `forEntity`/`forChapter`/`dates`, `exportAll`/`importAll` e o emitter `eventBus`. `parseSortKey(label)` transforma a data escrita à mão num número ordenável ("Ano 10 DC" → 10, "Antes da Chegada" → −1e6, "1975 AC" → −1975, sem número → `null` = fim da fila). |
| `src/timeline/view.js` | Aba **Timeline**: mistura num só fluxo ordenado os eventos do store **e** os capítulos do Livro com `momento` preenchido (um capítulo que já tem evento ligado não aparece duplicado). Cabeçalho (Exportar / Filtrar / ＋ Novo evento), busca, chips de ficha para filtrar, trilho vertical com pontos por data e cartões com chips clicáveis e atalho para o capítulo. O campo **Descrição** do modal aceita vínculos de palavra (`[[palavra|Ficha]]`, pelo botão direito — `bindInputWordLinks`) e os cartões os renderizam com `renderRich`. Exporta também `openEventEditor({event?, title?, date?, description?, entityIds?, chapterId?})`, o modal de criar/editar evento (usado pelo Livro em "⋯ → Criar evento na Timeline"). |
| `src/dict/hunspell-wasm.js` | Glue Emscripten do `hunspell-asm@4.0.2` (SINGLE_FILE: o wasm vem embutido em base64) + `export default Module`, com comentário de procedência no topo. |
| `src/dict/pt_BR.aff.gz`, `src/dict/pt_BR.dic.gz` | Dicionário **VERO 3.2 pt-BR** (Raimundo Santos Moura, LGPLv3/MPL), de `wooorm/dictionaries` (`dictionaries/pt`), comprimidos com gzip (99 KB + 1,29 MB). |
| `src/competencia/store.js` | Competência: o **catálogo** de gráficos (chave kv `attrs`: `{id,name,icon,color,max,hint}`) e os **dados por ficha** (chave `ent:<id>`: `{values, notes, tags, medals, caption, show}`), ambos na pasta kv `competencia`. `tags` são as **tags especiais** (Descrição) e `medals` as **condecorações** (cabeçalho) — mesma forma e mesma mecânica. API: `list/getAttr/addAttr/updateAttr/removeAttr/moveAttr/applyPreset`, `valueOf/setValue/clearValue`, `noteOf/setNote`, `captionOf/setCaption`, `showsOnSheet/setShow`, `listOf/addEntry/updateEntry/removeEntry/poolOf` (com `tagsOf/addTag/updateTag/removeTag/tagsPool` e `medalsOf/addMedal/updateMedal/removeMedal/medalsPool` por cima), `hasData/summary/entityIds`, `forget/copyData`, `exportAll/importAll/wipe`. `DEFAULT_ATTRS` é a grade que nasce pronta (os seis gráficos da referência do usuário); `ATTR_COLORS` e `ATTR_PRESETS` (RPG / Poderes / Peso narrativo) alimentam os modais. Gravação com debounce de 450 ms (`touch()` → `flush()` → `_write()`). |
| `src/competencia/render.js` | Desenho (só strings HTML/SVG): `fmtValue` (7,5 para 7.5), `ringSvg` (o aro de rosca: trilho + arco com `stroke-dasharray` + número no centro), `ringItemHtml`/`ringGridHtml` (a grade), `tagRowHtml(entityId, kind)`/`tagNotesHtml(entityId, kind)`/`tagChipsHtml` (as etiquetas: linha de chips + lista de notas; `kind` é `"tags"` ou `"medals"`), `heroMedalsHtml(entity)` (o bloco "🎖 Condecorações" que entra no **cabeçalho** da ficha, logo abaixo dos botões — só as **condecorações** aparecem ali, e o bloco só sai quando a ficha tem condecorações e `showsOnSheet` é verdadeiro), além de `capPanelHtml` (o bloco que entra na Descrição da ficha, com o cabeçalho "⚡ Competência", os aros, as **tags especiais** e o botão Editar). O texto de baixo passa por `renderRich`, então aceita `[[vínculo]]`. |
| `src/competencia/panel.js` | Ponte com a ficha: `mountCapPanel(container, entity)` injeta `capPanelHtml` no marcador `[data-cap-holder]` (logo depois das imagens da Descrição, em `src/ui/detail.js#renderFicha`) e liga o botão Editar; `openCompetencia(id)` dispara `codex:open-competencia`. |
| `src/competencia/view.js` | A **aba Competência**: lista de fichas à esquerda (busca, filtro de tipo, "⚡ Só com dados", pips coloridos por gráfico) e o quadro da ficha à direita (um cartão por gráfico com aro, −/＋, campo de valor, slider, nome editável, anotação, cor, máximo e menu ⋯; blocos de **Tags especiais**, de **Condecorações** e do **Texto abaixo dos gráficos**). Os dois blocos de etiquetas são a mesma peça parametrizada por `kind` (`ENTRY_KINDS`, `entryEditorHtml`/`refreshEntryEditor`, `openTagEditor(kind, id)`) — só mudam os textos, a cor padrão (dourado nas condecorações) e a caixa (`.cpTagsEditor` / `.cpMedalsEditor`). Modais `openAttrManager` (catálogo: ícone/nome/cor/máximo, ↑↓, ✕, presets) e `openTagEditor`, além de exportar (backup .json / ficha de poder .txt / resumo .txt). Avisa o resto do app por `codex:competencia-changed` (debounce de 500 ms). |

## Onde os dados ficam

Tudo no **kv-plugin** (IndexedDB, por usuário, por gerador). **Cada pasta do app
recebe o prefixo do universo ativo** (`kvFolder("codex")` → `u_uni_abc_codex`), e é
assim que um universo não enxerga os dados do outro — ver a seção
[Universos](#universos-o-pedido-mais-recente). O universo **legado** (o que existia
antes dos universos) tem prefixo `""`, isto é, usa os nomes de pasta abaixo:

- pasta `codex` → chaves `ent:<id>` (fichas), `folders`, `relations`, `settings` e
  `cover` (o data URL da **capa** do Codex, ver [Apresentação](#apresentação-a-capa-do-codex)).
- pasta `codex_images` → todas as imagens da ficha como data URL: as da galeria de
  tipos **e** as da descrição (fora do objeto da ficha, para não inflar a listagem).
  `store.imageRefsOf()` lista as referências de uma ficha (usado ao excluir/duplicar)
  e `store.getImageSrc()`/`getSrcByRef()` resolvem e cacheiam.
- pasta `livro` → chaves `cap:<id>` (capítulos, `{id,title,moment,html,text,attachments,images,order,createdAt,updatedAt}`)
  e `ortografia` (`{words, ignored}` — o dicionário pessoal do corretor).
- pasta `livro_img` → uma chave por imagem do livro (`cimg…` → data URL). O HTML do
  capítulo guarda só `data-img="<id>"`; o data URL é resolvido ao abrir o capítulo e
  removido quando nenhum capítulo o referencia mais.
- pasta `timeline` → chaves `evt:<id>` (eventos da cronologia).
- pasta `competencia` → chave `attrs` (o **catálogo** de gráficos de poder: vale para
  todas as fichas) e uma chave `ent:<id>` por ficha com dados (`values` por id de
  gráfico, `notes`, `tags`, `caption`, `show`).

Não há backend: backup/portabilidade é via "Arquivo, backup e preferências →
Baixar JSON" / "JSON sem imagens" / "Copiar JSON" e "Importar JSON". O backup é um
**arquivo único com tudo dentro** (montado por `buildPayload()` em `src/ui/settings.js`):

- `store.exportAll({withImages})` → o corpo principal (fichas, pastas, relações, imagens);
- `payload.livro = await book.exportAll({withImages})` → capítulos + imagens do livro;
- `payload.timeline = timeline.exportAll()` → eventos;
- `payload.competencia = competencia.exportAll()` → catálogo + dados por ficha.

Na importação (`runImport`), a ordem importa: `store.importAll` roda primeiro e devolve
`idMap` (id antigo → id novo de cada ficha; em `replace` os ids são preservados, em
`merge` quem colide ganha id novo). Esse mapa é repassado a `book.importAll(payload, mode, entMap)`
(anexos), `timeline.importAll(payload, mode, entMap, chapMap)` (fichas e capítulo do evento)
e `competencia.importAll(payload, mode, entMap)` — assim os vínculos entre módulos
sobrevivem ao round-trip, inclusive na mesclagem. `book.importAll` devolve
`{chapters, idMap}` (para os eventos acharem os capítulos novos). "Apagar tudo" chama
`store.wipe()`, `book.wipe()`, `timeline.wipe()` e `competencia.wipe()`.

## Universos (chamados de "Codexs" na interface)

Pedido do usuário: *"Quero que cada pessoa que entre seja capaz de criar o seu próprio
Codex (Universo), separando o mundo que cada pessoa cria; assim, as coisas ficam mais
organizadas."* A referência visual que ele anexou é uma tela de **Biblioteca** com cards
de universo.

**Nome visível (rodada 10):** na interface, o universo se chama **Codex** — título
"Seus Codexs", botão "＋ Novo Codex", contador "N Codexs", card tracejado "Novo Codex" e
os menus "Abrir/Continuar neste Codex", "Duplicar Codex", "Apagar Codex". Só as strings
de UI mudaram: identificadores internos (`universes`, `UNIVERSE_FOLDERS`, pasta
`codex_universos`, `prefix`, `uni_…`) continuam iguais, e o universo **legado** mantém o
nome que o usuário deu ("Meu universo"). "Universo" ainda aparece onde significa o
*mundo ficcional* (tipo de ficha `universo`, prompts da IA, "carregar o universo de
exemplo").

**O modelo:** o registro vive na pasta kv `codex_universos`, chave `universos`
(`{version, list, active, bootstrapSample}`). Cada universo é
`{id, nome, emoji, genero[], resumo, prefix, criadoEm, atualizadoEm, legacy?}`. O `prefix`
(`u_<id>_`) é o que separa os mundos: **nenhum store fala com o kv direto** — todos
passam por `kvFolder(name)` de `src/universe.js`, que devolve `root.kv[prefix + name]`.

Universos do app = `UNIVERSE_FOLDERS`: `codex`, `codex_images`, `livro`, `livro_img`,
`timeline`, `competencia`.

Invariantes (não quebrar):

- **Todo acesso a dados passa por `kvFolder`.** Se um dia entrar uma pasta nova no kv,
  acrescente o nome a `UNIVERSE_FOLDERS` — senão a pasta fica global (compartilhada
  entre universos) e a duplicação/exportação/apagar não a levam em conta.
- **Migração automática, sem cópia.** Na primeira carga, se não existe registro mas
  existe dado antigo (`anyLegacyData()`), o app cria um universo **legado**
  (`id: "uni_65wnn2s3ug"`, `prefix: ""`, `legacy: true`) apontando para as pastas
  antigas. Os dados **não são movidos nem copiados** — o prefixo vazio é que garante
  isso. Universo legado é como qualquer outro (dá para renomear, exportar). Se não há
  registro nem dado, o registro nasce com a lista vazia e a Biblioteca abre no estado
  de boas-vindas.
- **`_persist()` grava só o registro e NÃO chama `_apply()`.** Trocar de universo
  **só** vale no próximo boot (por isso `openUniverse()` recarrega a página). Chamar
  `_apply()` durante a sessão faria os stores em memória passarem a escrever no
  universo errado no meio de um salvamento.
- **Sempre descarregue antes de mexer no registro**: `store.flush()` (e os `flush()` de
  livro/timeline/competência) **antes** de `create`/`switchTo`/`destroy`/`duplicate` —
  senão um autosave pendente cai no universo novo.
- **Apagar universo** (`destroy`) apaga as chaves das 6 pastas daquele prefixo e o item
  do registro; nunca toca na pasta de outro universo. Não há lixeira.
- **`bootstrapSample`** é o id do universo que ainda precisa receber o universo de
  exemplo. O boot limpa o flag **antes** de rodar o `loadSampleData()` de
  `src/sample.js` (assim um reload no meio não duplica as 15 fichas).
- **Trocar de universo recarrega a página**; a aba pedida pelos atalhos da Biblioteca
  viaja em `sessionStorage` (`codex:pending-view`) e é consumida no boot
  (`consumePendingView`).

O que a Biblioteca faz (tudo em `src/ui/universes.js`): cards com emoji, chips de
gênero, prévia do resumo e contagens por universo; atalhos **Criar entidades /
Escrever capítulos / Perguntar à IA / Ver a rede** (abrem a aba dentro do universo
ativo); **＋ Novo Codex** (nome, emoji, gêneros, resumo e a caixa "começar com um
Codex de exemplo"); ⋯ com **Abrir / Renomear e detalhes / Duplicar / Exportar JSON /
Apagar**. `Exportar` gera `{app:"codex", kind:"codex-universe", version:1, docs:{pasta: [[chave, valor]]}}`
— um arquivo por universo, independente do backup completo de
"Arquivo, backup e preferências" (que continua sendo por universo, já que os stores
leem o prefixo ativo). `Importar` aceita esse formato, o backup antigo (`entities[]`) e
cargas com `fiches`, **sempre criando um universo novo**.

## Apresentação (a capa do Codex)

Pedido na rodada 11: *"crie, do lado esquerdo de fichas, uma nova página chamada
'Apresentação'… Quero que a imagem colocada nessa página seja vista na miniatura do
codex, na página de criação do codex."*

A aba **🏠 Apresentação** é a **primeira** aba (à esquerda de "Fichas") e é a "capa" do
Codex: a página que resume o mundo. É montada por `src/present/view.js`
(`initPresentView()`, chamado em `src/main.js`) dentro de `<section id="presentView">`,
e tem quatro blocos, de cima para baixo: cabeçalho (emoji, nome, gêneros, datas, botões
Editar/Codexs), o texto "Sobre o que é este mundo?" (o `resumo`, em leitura, com botão
de editar), a **capa** e a
**grade de estatísticas** (um cartão por tipo de ficha + Capítulos / Relações / Timeline,
cada um clicável para a aba certa).

Invariantes (não quebrar):

- **A capa é a miniatura do card na Biblioteca.** `universes.cover(id)` lê o cache
  `covers` e `src/ui/universes.js#universeCardHtml` usa a mesma imagem — não há segunda
  fonte de verdade. Se trocar a capa, o card muda junto.
- **A capa fica na pasta `codex` daquele universo** (chave `cover`), não no objeto do
  universo: `universes.setCover(id, dataUrl)` grava pela `kvFolder` (prefixo do universo
  ativo) e `setCover(id, null)` apaga. `covers` é só o cache em memória, hidratado em
  `load()`/`hydrate()`; `duplicate` copia a capa para o novo id.
- **A imagem é reduzida antes de guardar** (`shrinkImage(x, 1600, 0.86)`) e a capa do
  card usa exatamente o mesmo data URL — não gere uma miniatura separada.
- **A IA saiu da tela na rodada 14** (ver a seção "IA fora da interface"): o interruptor
  `#prAiInput`, a caixa "O que você quer saber?" e o painel de resposta continuam no
  arquivo, mas não entram no `html()`. Se algum dia voltarem, `ai.enabled()` e o
  `aiGate()` dos painéis de `src/ui/aipanels.js` continuam valendo — não remova a
  checagem de nenhum painel.
- **`refresh()` não redesenha enquanto `streaming`** (a resposta da IA está chegando) nem
  quando a aba está escondida; quem re-renderiza é o evento `codex:data-changed`.

## IA fora da interface (rodada 14)

Pedido: *"Quero que tire os botões de interação com a IA do meu site."* (com duas capturas
de tela apontando a pílula `✨ IA` do topo, o painel "Usar inteligência neste Codex" e a
caixa "O que você quer saber?").

**A regra, hoje:** a camada de IA está inteira no código (`src/ai.js`, `src/ui/aipanels.js`,
os imports `ai-text-plugin`/`text-to-image-plugin` no `main.pjs`, `ai.askWorld()`), mas
**nenhum elemento da interface a alcança**. Nada foi apagado — só os pontos de entrada.

O que saiu da tela (e onde estava):

| Peça | Onde ficava |
| --- | --- |
| `✨ IA` do topo + menu de ferramentas de IA | `index.html#aiBtn` e o handler em `src/main.js#wire()` |
| `✨ IA` da ficha + menu (enriquecer / sugerir / descrever / retrato) | `src/ui/detail.js#renderFicha` e `bindFichaActions` |
| "Extrair de um texto" (estado vazio da ficha e das Fichas) | `src/ui/detail.js#emptyDetailHtml`, `src/ui/browse.js#renderList` |
| "✨ Extrair do texto colado" (busca sem resultado) | `src/ui/browse.js` (busca global) |
| "Enriquecer com IA" / "Sugerir conexões (IA)" (menu do cartão) | `src/ui/browse.js#entityMenu` |
| `✨ Sugerir conexões` (painel da ficha na Rede) | `src/ui/graphview.js#renderGraphInfo` |
| `✨` e `👁` da imagem + ações do zoom + "Gerar com IA" no diálogo de imagem | `src/ui/media.js` |
| "Gerar com IA" (menu da capa) | `src/present/view.js#coverMenu` |
| "Perguntar à IA" (atalhos da Biblioteca) | `src/ui/universes.js#renderLibrary` |
| Interruptor da IA, caixa de perguntas e painel de resposta | `src/present/view.js` (`aiHtml` / `askHtml` / `answerHtml`, fora do `html()`) |

**Para religar:** re-adicione o botão (ou o `dispatch` do evento `codex:ai-*`) no lugar de
origem — os painéis, os listeners (`initAiPanels()`, no boot) e a camada de IA continuam
funcionando. No caso da Apresentação, basta chamar `aiHtml()`, `askHtml()` e `answerHtml()`
de novo dentro do `html()`; o comentário no arquivo marca o ponto. Nada disso exige tocar
em `src/ai.js`.

**Não confundir:** a marca `✨` do botão **Mencionados** do Livro e o `✨` do gráfico
"Poderes & habilidades" (Competência) não são IA — são só enfeite.

## Como estender

- **Novo tipo de ficha**: adicione um objeto a `ENTITY_TYPES` em `src/data.js`
  (`{id, l, icon, color, fields: [...]}`). A UI pega automaticamente.
- **Novo campo**: adicione a `FIELD_DEFS` (`{l, t, h, options?}`; `t` ∈ `text|long|suggest`).
  Campos não declarados também funcionam (viram `text` com rótulo derivado da chave).
- **Novo tipo de relação**: dentro do app, em **⚙️ Tipos de anexo** (no seletor de
  anexos, na ficha ou na Rede/Árvore) o usuário cria os seus ("é amante de", "é
  concubina de", "é escravo(a) de"…), edita os padrão (mesmo `id` sobrescreve) e
  restaura/apaga — tudo guardado em `settings.customKinds`. Em código, adicione um
  padrão a `RELATION_KINDS`. Use `sym: true` para
  simétricas (a UI mostra a mesma frase dos dois lados); `f`/`i` para direcionais;
  `step: 1|2` marca arestas pai/filho que a **Árvore** usa para posicionar gerações.
  O `id` de um tipo nunca muda (reescrever a frase não quebra as ligações feitas).
- **Ajustar IA**: as instruções e limites vêm de `cfg()` em `src/ai.js`, lendo a
  lista `codex` do `main.pjs`.
- **Gráficos de poder**: o ponto de partida é `DEFAULT_ATTRS` em
  `src/competencia/store.js` (nome + cor; `makeAttr` completa id/máximo/ícone), e as
  "grades prontas" dos modais são `ATTR_PRESETS` ali do lado. O usuário também cria,
  renomeia e reordena os gráficos dentro do app — nada disso exige mexer no código.
  Para desenhar de outro jeito (outra forma, outro layout), mexa em
  `src/competencia/render.js` — é tudo string HTML/SVG.

## API de debug (no console / `page_eval`)

`window.codex`:

- `store`, `state`, `setUI`, `savePrefs`, `render()`, `createEntity()`, `setView()`,
  `selectEntity()`, `openRelationEditor(id, opts)`, `openKindPicker(opts)`,
  `openKindsManager()`, `openDataPanel()`, `openHelp()`
- `graphs.refresh()`, `graphs.focus(id)`, `graphs.state`, `graphs.obj`,
  `graphs.mini`, `graphs.miniObj`
- `book` (`show()`/`hide()`/`render()`, `openChapter(id)`, `showList()`), `bookStore`
  (o store dos capítulos: `list()`, `create()`, `exportAll()`, `importAll(payload, mode, entMap)`…)
  e `spell`
  (o corretor pt-BR: `spell.state` é `idle`/`loading`/`ready`/`error`, `spell.failure`
  traz o motivo, `spell.progress` vai de 0 a 1, `spell.check(text)`/`spell.suggest(palavra)`
  são assíncronos).
- `timeline` (`show()`/`hide()`) e `timelineStore` (o store dos eventos).
- `competencia` — `competencia.store` (o store: `list()`, `setValue(id, attrId, v)`,
  `setNote`, `addTag`, `captionOf`, `summary`, `exportAll`…), `competencia.view`
  (`show()`/`hide()`/`refresh()`/`select(id)`/`currentId`),
  `competencia.show()`, `competencia.select(id)` e `competencia.refresh()`.
- `setView("book")` abre o Livro; `setView("timeline")` abre a Timeline;
  `setView("competencia")` abre a Competência (atalho `c`); `setView("present")` abre a
  Apresentação (atalho `p`).
- `present` — a aba Apresentação (`present.show()`/`present.hide()`/`present.refresh()`).
- `view` — o modo somente leitura (`window.codex.view`): `active`, `id`, `ready`,
  `error`, `payload`, `meta`, `publicadoEm`. Fica `active:false` quando a página não
  tem `#ver=<id>` na URL. Em modo leitura o boot **não** expõe `window.codex`
  quando o link falha (aí a tela é `viewErrorHtml()`).
- `universes` (o registro: `list`, `activeId`, `create()`, `switchTo()`, `destroy()`,
  `duplicate()`, `exportOne()`, `importFile()`, `stats()`, `byId()`), `openUniverse(id)`
  (troca de universo + reload) e `openUniverses()` (abre a Biblioteca).
  **Trocar de universo pela UI recarrega a página** (mata o `page_eval`) — em teste,
  use `await window.codex.universes.create(...)`/`switchTo(...)`/`destroy(...)` e depois
  um `page_refresh` para o boot aplicar o prefixo.

`graphs.obj` devolve o objeto do grafo principal (`{state: {nodes, relations, scale, vw, vh, nodeLabels, ...}}`).
Cada item de `state.nodeLabels` é `{x, y, w, h, kind}` em pixels de tela (`kind` =
`"node"` ou `"edge"`) — é a fonte de verdade para medir clipping/sobreposição de rótulos.

Eventos globais usados pela UI (todos via `window`): `codex:select`, `codex:open-detail`,
`codex:view`, `codex:new-entity`, `codex:refresh-browse`, `codex:data-changed`,
`codex:move-entity`, `codex:open-relation`, `codex:open-data`, `codex:load-sample`,
`codex:open-chapter` (abre a aba Livro no capítulo indicado — é o que a Timeline e a
seção "Aparece em" das fichas usam), `codex:open-competencia` (abre a aba
Competência já na ficha indicada — o botão "✏️ Editar" do painel da Descrição usa esse
caminho) e `codex:competencia-changed` (debounce de 500 ms; faz a ficha aberta ser
redesenhada quando o usuário volta para as Fichas).
Os eventos `codex:ai-complete`, `codex:ai-suggest`, `codex:ai-portrait`,
`codex:ai-describe-image` e `codex:open-ai-extract` continuam registrados por
`initAiPanels()`, mas **nada os dispara** desde a rodada 14 (a IA saiu da
interface).

Cliques em `[data-entity-link]` (links `[[Nome]]` do texto rico) e em `[data-goto]`
(chips de ficha) são resolvidos por um único listener delegado em `document`, dentro
de `wire()` no `src/main.js`. **Não** duplique esse handler nas views.

## Aba Livro e corretor ortográfico (invariantes — não quebrar)

O corretor roda o **hunspell compilado para WebAssembly** num Web Worker dedicado,
com o dicionário VERO pt-BR. Fatos verificados no preview (cada um custou tempo —
não refaça o caminho):

- **O worker tem de vir de `location.origin + "/src/book/spell-worker.js"`.** O
  iframe tem um `<base href="https://perchance.org/...">` injetado pelo motor, então
  `import.meta.url` e `document.baseURI` apontam para `perchance.org` — **outra
  origem** — e `new Worker(urlDeOutraOrigem)` lança `SecurityError`. Um worker
  criado a partir de um **blob** (mesmo módulo) também não serve: ele não enxerga o
  service worker que serve os arquivos não salvos de `src/`.
- **O worker não consegue buscar nada sozinho** (`fetch`/`import()` de `src/...`
  dentro do worker devolve 404 no editor, e num worker `data:` tudo falha por ser
  origem opaca). Por isso `spell.js` baixa glue + `.aff.gz` + `.dic.gz` na thread
  principal e manda por `postMessage`; o worker cria o **blob do glue dentro de si**
  (`URL.createObjectURL` + `import()`) — isso funciona, um blob importado pelo
  worker de mesma origem é permitido. O caminho direto por `import.meta.url` em
  `spell-worker.js` é só reserva para depois de publicado.
- **O glue do Emscripten é um "thenable".** `await mod.default({...})` ou resolver a
  promise com o próprio objeto do módulo **trava para sempre**; é preciso guardá-lo
  numa caixa e resolver com outro valor (`box.m.then(() => resolve())`).
- `self.importScripts` precisa existir (stub) antes de importar o glue, senão o
  Emscripten acha que não está num worker e nunca chama de volta.
- Em `Hunspell_free_list(handle, ptr, n)` passe o **ponteiro alocado** (`sugPtr`),
  não o array interno — a ordem errada dá "memory access out of bounds".
- **O sublinhado do corretor é desenhado pela CSS Custom Highlight API**, não pelo DOM:
  `editor.js` monta `new Highlight(...ranges)` com as faixas de cada palavra errada
  (convertidas de deslocamento de texto para `Range` por `richtext.js#domTextMap` +
  `rangeFromOffsets`) e registra em `CSS.highlights` sob o nome `bk-miss`; o CSS só
  tem `::highlight(bk-miss) { text-decoration: underline wavy … }`. Isso mantém cursor,
  seleção e desfazer intactos — a versão antiga (textarea + espelho invisível) foi
  substituída junto com o editor rico. Se pintar erro no lugar errado, o suspeito é
  `domTextMap` (a contagem de caracteres tem de bater com `htmlToText`).
- **O conteúdo do capítulo é HTML (`contenteditable`)**, o texto puro é derivado. Antes
  de persistir, `sanitizeHtml(stripImageSources(rt.innerHTML))` roda: a allow-list está
  em `richtext.js#ALLOWED`/`ATTRS` (só `<span style="font-size:…">`, `<font size>`,
  `data-img`, `data-ref` etc.). Ao adicionar um recurso novo à barra de formatação,
  **adicione a tag/atributo correspondente à allow-list**, senão ele some no primeiro
  autosave. As imagens ficam em `livro_img` (o data URL nunca vai para o objeto do
  capítulo) — por isso o contador de caracteres não conta imagem nenhuma.
- **`CustomEvent` não borbulha por padrão.** Os avisos internos do editor
  (`bk:closed`, `bk:list-changed`) são disparados no `editorPane` e a view do Livro
  escuta no `#bookView`: sem `{ bubbles: true }` o handler nunca roda e a aba fica
  **em branco** (a lista some e o editor some). Já aconteceu — não "limpe" esse
  `{ bubbles: true }`.
- Os realces do corretor e a barra de formatação dependem de `document.execCommand`
  (`bold`, `italic`, `formatBlock`, `insertHTML`, `fontSize`, …) — está *deprecated*
  mas é o que o motor do navegador implementa de forma consistente com o
  `contenteditable` aqui. `A+`/`A−` passam por `fontSize` com marcador `7`/`1` e
  convertem o `<font>` resultante num `<span style="font-size:Npx">` calculado a partir
  do tamanho herdado (entre 11 e 44 px).
- Em telas ≤640 px a barra de formatação **quebra em duas linhas**
  (`flex-wrap: wrap`); acima disso ela rola na horizontal (`overflow-x: auto`, sem
  barra visível). A regra que esconde o texto dos botões da barra do editor no celular
  usa `:not(.bkExitBtn)` — o botão **Salvar e sair** tem de manter o rótulo sempre.
- **`min-width: 0` em `.bkEditorPane`/`.bkEditor`** é obrigatório: sem isso o
  min-content da barra de ferramentas empurra o editor para ~509 px e, no celular,
  os botões ficam **cortados fora** da tela.
- O corretor carrega em ~2,5 s (download + descomprimir 4,3 MB de `.dic`). Se falhar,
  `spell.state` vira `"error"` e o editor continua funcionando (o app mostra o aviso
  e o usuário pode tentar de novo clicando no chip). Nomes das fichas do universo são
  ensinados automaticamente (`store.mentionNames()`), então não aparecem como erro.
- Cuidado ao capturar imagens de tela para inspeção: `snapdom(...).toPng()` **trava**
  neste ambiente; use `toCanvas()` (e `reconcile: true`, senão o texto é re-renderizado
  fora de posição e dá falso positivo de layout quebrado).

## Imagens da ficha (zoom, tipos e imagens da descrição)

Uma ficha tem **duas coleções independentes** de imagem:

- `images` — a galeria de **tipos/enquadramentos** (Retrato, Corpo inteiro, Traje…,
  configuráveis em `codex.imageTipos` do `main.pjs`). Uma delas é a **ativa**
  (`imageIndex`) e é ela que aparece como imagem principal da ficha, no cartão da
  lista, na miniatura e no nó do grafo. O texto do tipo é a "chave": `imageForTipo`
  casa pelo rótulo normalizado (`trim().toLowerCase()`), então renomear uma imagem
  para "Traje" faz ela ocupar esse tile. Tipos que só existem naquela ficha
  (criados com "Outra…") entram na faixa junto dos padrão (`tiposOf`).
- `descImages` — imagens **anexadas à descrição**, com legenda opcional; aparecem
  logo abaixo do texto, tanto na leitura (`descGalleryHtml`, com o tile
  "＋ imagem na descrição") quanto na edição (`descEditorHtml`).

Invariantes (não quebrar):

- **Limite de imagens por ficha** é `codex.maxImagensPorFicha` (padrão 9) via
  `canAddImage()`; a mensagem de erro é amigável e o tile some quando cheio.
- **`replaceEntityImage` carimba `img.updatedAt`** e o nó do grafo recebe
  `imgKey = <id-da-imagem-ativa>.<updatedAt>` (`detail.js#nodeFor` e
  `graphview.js`). O cache de miniaturas do grafo (`graph.js#loadImage`) é chaveado
  por **`imageId + "@" + imgKey`** — sem o `imgKey` o avatar do grafo continuava
  mostrando a imagem antiga depois de trocar/substituir a imagem ativa (bug real).
  Se mexer no modelo de imagem, mantenha o `imgKey` coerente com o que
  `store.getImageSrc` devolve.
- **Todo clique numa imagem abre o mesmo visualizador** (`openImageZoom`), seja a
  principal, uma da faixa de tipos ou uma da descrição. Não crie um segundo
  visualizador.
- O tile vazio da faixa de tipos ("＋") chama `openAddImageDialog` já com
  `opts.tipo` daquele tipo — é assim que o usuário preenche um tipo específico sem
  precisar renomear nada depois.
- Imagens são guardadas como data URL na pasta `codex_images` (`store.putImageData`);
  `shrinkImage(file, 1024, 0.86)` reduz antes de guardar. O objeto da ficha guarda
  só o `ref` — nunca o data URL.

## Como Livro, fichas e Timeline se conectam (o pedido "tudo conectado")

O elo entre as três partes é sempre um **id de ficha** ou um **id de capítulo**:

- **Capítulo → fichas**: `chapter.attachments` (escolhido em "Anexar fichas") e os
  chips inline `<span class="bkRef" data-ref="ent…">` inseridos no texto pela barra
  ("🔗 Ficha"). O editor mostra os anexados e calcula os **mencionados** comparando o
  texto com `name`+`aliases` de todas as fichas (`norm()` para ignorar acento/caixa).
- **Ficha → capítulos/eventos**: a seção **"Aparece em"** de cada ficha lista os
  capítulos que a anexam ou citam (`countMentions`) e os eventos da Timeline que a
  ligam; clicar dispara `codex:open-chapter` ou abre a aba Timeline.
- **Capítulo → Timeline**: o campo "Momento" do capítulo já o coloca na cronologia;
  não há passo extra. O menu ⋯ do editor tem "Criar evento na Timeline", que abre o
  `openEventEditor` já preenchido com título/momento/trecho e `chapterId`.
- **Evento → fichas e capítulo**: `event.entityIds` (chips clicáveis no cartão) e
  `event.chapterId` (atalho "📖 <título>" que abre o capítulo no editor).
- **Cliques**: chips (`data-goto`) e links `[[Nome]]` (`data-entity-link`) abrem a
  ficha por um único listener delegado no `document` (em `main.js#wire`). Os
  **vínculos de palavra** usam o mesmo caminho (são `data-ref`/`data-entity-link`).

Um capítulo que já tem um evento ligado **não** é repetido na Timeline (evita ver a
mesma cena duas vezes); se o vínculo for removido, o capítulo volta a aparecer.

## Anexar uma palavra a uma ficha (vínculo de palavra)

O usuário seleciona uma palavra (ou um trecho) e clica com o **botão direito** →
"Anexar … a uma ficha…". A palavra **continua sendo a palavra** — não vira chip,
não ganha ícone nem fundo; ela só passa a ser um link **azul** (`var(--link)`,
definida no `:root` e no tema claro) que abre a ficha. Vale no Livro, na Timeline
(descrição do evento), na descrição da ficha e nos campos longos.

Duas serializações (as duas pontas têm de casar):

- **Livro (HTML)** — `<span class="bkRef wordLink" data-ref="ent…" title="…">palavra</span>`.
  Reutiliza `data-ref`, então entra de graça em "Mencionados", no clique para abrir
  a ficha e na contagem de caracteres (o texto da palavra não muda). `contenteditable`
  não está na allow-list do `sanitizeHtml` — quem recoloca é o `open()` do editor.
- **Texto puro** (descrição da ficha, descrição do evento, campos longos) —
  `[[palavra|Nome da ficha]]`. `renderRich` mostra só `palavra`; `mdToPlain` e
  `stripWordLinks` descartam o `|Nome` (buscas, prompts de IA, prévias). `[[Nome]]`
  continua funcionando igual (label = nome resolvido).

Invariantes (não quebrar):

- **A allow-list de atributos do `SPAN` precisa de `title`** (`richtext.js#ATTRS`);
  sem isso o tooltip some no primeiro autosave.
- **Nada de `style="--typeColor:…"` no `wordLink`**: o `sanitizeHtml` só preserva
  `font-size` no `style`, então a cor viria de CSS var inline que é descartada. A cor
  azul do vínculo de palavra é só CSS (`.bkRef.wordLink`, `.mdRef`), não custom property.
- `wrapRangeWithLink` recusa (devolve `null`) seleções que atravessam mais de um
  bloco — nada é removido antes da checagem. O editor avisa "Selecione um trecho
  dentro de um mesmo parágrafo".
- No `contenteditable`, o menu de contexto só intercepta o evento quando há
  **seleção não vazia** ou **uma palavra sob o cursor com o corretor ligado**; sem
  isso o menu nativo do navegador continua aparecendo. Remover o vínculo devolve a
  palavra como texto normal (`replaceWith(document.createTextNode(...))`), nunca
  apaga o texto.

## Competência (gráficos de poder, tags especiais e condecorações)

Pedido na rodada 6: uma aba ao lado de Timeline para gerenciar os "gráficos de poder" e
as tags especiais de cada ficha, com os gráficos aparecendo **na Descrição da ficha**, e
com a possibilidade de **renomear** um gráfico a qualquer momento ("em vez de
INTELIGÊNCIA, quero chamar de outra coisa").

Duas camadas independentes — é o coração do desenho:

1. **Catálogo** (kv `competencia` → `attrs`): quais gráficos existem, nome, ícone, cor e
   **máximo**. É **global**: renomear aqui renomeia em todas as fichas de uma vez.
2. **Dados por ficha** (kv `competencia` → `ent:<id>`): `values` (valor por **id** de
   gráfico), `notes` (a anotação que aparece embaixo de cada aro), `tags` (**tags
   especiais**, que saem no painel da Descrição), `medals` (**condecorações**, que saem
   no cabeçalho da ficha), `caption` (o "Texto abaixo dos gráficos") e `show`.

`tags` e `medals` têm exatamente a mesma forma (`{id,label,note,icon,color}`, prefixo de
id `tag_`/`med_`) e a mesma mecânica (`listOf/addEntry/updateEntry/removeEntry/poolOf`,
com `tagsOf/addTag/…` e `medalsOf/addMedal/…` por cima). Toda a UI das duas famílias é a
mesma peça parametrizada por `kind` (`ENTRY_KINDS` em `view.js`). Ao mexer em uma, mexa
na outra — ou, melhor, no ponto comum.

Invariantes (não quebrar):

- **Nunca use o nome do gráfico como chave.** Os valores são indexados pelo `id`
  (`atr_…`); é só por isso que renomear/mover/recolorir não embaralha nem perde valor.
  Ao criar um gráfico, `id: uid("atr")`; ao apagar, `removeAttr` limpa os valores e
  anotações órfãos e `pruneOrphans()` varre o resto na carga seguinte.
- **Ficha excluída leva os gráficos junto**: o listener de `store.events.on("entity")`
  em `main.js#wire` chama `competencia.forget(id)`. Não remova esse listener.
- **O painel só aparece quando há o que mostrar** (`hasData`: algum valor, anotação, tag,
  condecoração ou texto) **e** `show !== false`. O interruptor "Na ficha" (`.cpShowInput`)
  é o jeito de esconder tudo isso numa ficha específica sem apagar nada.
- **O painel vive dentro da seção "Descrição"** (`<div data-cap-holder>` logo depois das
  imagens da descrição, em `detail.js#renderFicha`), e é montado por `mountCapPanel()`
  depois de `bindFichaActions()`. Se criar uma terceira forma de desenhar a ficha,
  chame `mountCapPanel` de novo — senão a competência some.
- **As condecorações aparecem no cabeçalho da ficha** (`heroMedalsHtml(entity)`, logo
  abaixo de `.heroActions` em `detail.js#renderFicha`), e só elas — as tags especiais
  ficam no painel da Descrição. Mesmo `showsOnSheet` do painel, então o interruptor
  "Na ficha" esconde as duas coisas juntas. Ao mexer no desenho das etiquetas, mexa em
  `tagRowHtml`/`tagNotesHtml` (os dois lugares usam essas duas, com `kind`).
- **O aro é SVG com `viewBox` e sem `width`/`height`**: o tamanho vem do CSS
  (`--capSize`, definido inline no `.capGrid` pelo `ringGridHtml`). O trilho
  (`.capTrack`) e o número (`.capNum`, `fill: var(--text)`) mudam de cor por tema — o
  tema claro tem override explícito para o trilho.
- **O nome embaixo do aro é sempre caixa alta** (`text-transform: uppercase`), como na
  referência que o usuário mandou; o valor é formatado por `fmtValue` (vírgula decimal,
  "–" quando ainda não há valor).
- **`ATTR_PRESETS` junta, não substitui** (`applyPreset` ignora nomes já existentes), e
  `DEFAULT_ATTRS` é a grade que nasce pronta na primeira abertura — trocar ali muda o
  ponto de partida de quem nunca abriu a aba, e nada mais.
- O `caption` passa por `renderRich`, então `[[Nome da ficha]]` vira link ali também —
  igual à descrição. A lista de tags (`tagsPool`) é derivada de todas as fichas, para
  reaproveitar nomes já usados ("Controle de Fogo", etc.).
- O backup principal leva a competência dentro (`payload.competencia`), importa junto
  (remapeando os ids de gráfico **pelo nome**, já que o catálogo pode ter mudado, e
  escrevendo os dados já no id novo da ficha quando ela é duplicada num `merge`) e o
  "Apagar tudo" chama `competencia.wipe()`.

## Câmera e enquadramento do grafo (invariantes — não quebrar)

O grafo deve sempre terminar emoldurado, mas sem atropelar o usuário:

- `state.pendingRefit` é ligado em `setData` (sem `fit`) e ao trocar para o layout
  de força; quando a simulação **assenta**, se `!state.userCamera`, roda `fit()`.
  Isso emoldura as posições *finais* (emoldurar antes de assentar deixava o grafo
  deslocado — era o bug do "grafo jogado no canto").
- `state.userCamera` fica `true` quando o usuário dá pan (>3px) ou zoom; enquanto
  isso, nenhum `fit()` automático acontece. Só `fit()` (botão "Enquadrar", duplo
  clique no fundo, `centerOn` do layout) devolve o controle ao app.
- `viewHolds()` + o `setInterval` de 600ms em `createGraph` existem porque a
  plataforma **não dispara `resize` nem `ResizeObserver`** ao mudar o viewport
  (bug bf9cdc3f). O watchdog reage a rotação/resize e refaz o `fit()` se o usuário
  não tiver tomado a câmera.
- O layout de árvore/radial chama `fit()` ao final (posições ancoradas, sem deriva).

## Anexos: ligar fichas arrastando + catálogo de tipos (pedido do usuário)

- **O gesto**: botão direito numa esfera da Rede/Árvore → linha elástica até o
  cursor → soltar sobre outra esfera → abre `openKindPicker` para escolher o tipo de
  anexo. Alternativas para o mesmo gesto: a **alça 🔗** que aparece no hover da
  esfera (canto superior direito) e o **toque longo** (460 ms) em touch. Se o botão
  direito é solto sem arrastar (menos de 6px), o grafo emite `nodemenu` e abre o menu
  de contexto da esfera. O mini-grafo da ficha também aceita o gesto.
- **Onde mora**: tudo em `src/graph.js` (`state.link`, `linkHandleFor`,
  `linkHandleAt`, `startLink`, `endLink`, `clearLongPress`, e o desenho da prévia no
  fim de `draw()`) — o grafo só **emite** `link`/`nodemenu`; quem escuta é
  `src/ui/graphview.js` (grafo grande) e `src/ui/detail.js` (mini-grafo).
- **O catálogo**: `settings.customKinds` guarda os tipos criados pelo usuário **e** as
  edições dos padrão (mesmo `id` sobrescreve — é isso que permite editar "é irmão(ã)
  de" sem quebrar as ligações). `store.kinds()` devolve padrões + custom; use sempre
  `store.kind(id)` nas telas (nunca `kindById` direto, que ignora as edições).
- **Editar o tipo de uma ligação**: na ficha, o botão 🔗 de cada linha de conexão
  chama `openKindPicker` com `relationId` (modo edição: ✓ no tipo atual, ⇄ troca a
  direção da ligação, botão de remover). O texto da linha usa `v.label` (a frase já
  vem na direção certa de `store.relationView`).
- **Apagar um tipo em uso**: `removeKind(id, mode)` — `"convert"` devolve as ligações
  ao tipo `relacionado`, `"delete"` apaga as ligações junto. A UI sempre pergunta.

## Exportar como arquivo único (index.html autônomo)

`src/tools/build-standalone.mjs` gera um HTML **autossuficiente** (HTML + CSS +
todos os módulos JS dentro de um só arquivo), para o usuário baixar, hospedar ou
abrir direto do disco. Não é usado pelo gerador publicado — é a receita
reproduzível do entregável. Como rodar (no ambiente do agente, em `execute_js`):

```js
const src = await fs.readTextFile("src/tools/build-standalone.mjs");
const res = await new Function("fs", "return (async () => {" + src + "\n})()")(fs);
```

Saída: `scratch/standalone/index.html` (entregar com `attach_file`; **não** fica em
`src/` porque é artefato de build, não parte do gerador). O build usa
esbuild-wasm (esm.sh) para empacotar os ES modules num único `<script>` IIFE;
`index.html` é reaproveitado como corpo (sem o `<link>` do CSS e sem o `<script
type="module">`).

`src/tools/standalone-storage-shim.js` é injetado antes do app e, **só quando
`root.kv` não existe** (isto é, fora do Perchance), cria um `root.kv` compatível
sobre IndexedDB, com fallback para localStorage e depois memória — a mesma API
que o `store.js` usa (`keys/get/getMany/set/setMany/delete/deleteMany`, mais
`entries/values/update`). O proxy de pastas é genérico (cria a pasta na hora, seja
`codex` ou `u_uni_abc_codex`), então o **registro de universos funciona igual** no
arquivo isolado — ele abre na Biblioteca de boas-vindas. Também define
`root.codex` com os valores da lista `codex` do `main.pjs`. Dentro do Perchance o
shim não faz nada.

Limitações do arquivo autônomo (avisar o usuário): a IA (`generateText`) e a
geração de retratos (`generateImage`) vêm dos plugins do Perchance, então no
arquivo isolado os botões de IA só avisam que não estão disponíveis. O resto
(fichas, pastas, rede, árvore, backup JSON) funciona igual, com os dados no
IndexedDB do próprio arquivo.

O **Livro**, a **Timeline** e a **Competência** aparecem no arquivo autônomo (o build
segue o grafo de imports de `src/main.js`), mas o **corretor ortográfico não**: o worker é servido de
`src/book/spell-worker.js` e o dicionário de `src/dict/*.gz`, caminhos que não
existem fora do gerador. Nesse caso `spell.state` fica `"error"`, o chip avisa
"Dicionário pt-BR indisponível" e a escrita/exportação continuam normais. Se for
preciso levar o corretor para o arquivo único, é preciso embutir o glue e os dois
`.gz` como data/blob URLs (o mesmo truque de `spell.js`, mas com os bytes inline).

**Invariante do CSS (importante):** `src/style.css` começa com
`[hidden] { display: none !important; }`. Dentro do Perchance o motor já garante
que o atributo `hidden` vence qualquer `display`, mas num navegador comum uma
regra de autor como `#graphView { display: flex }` (~linha 545) sobrepõe o
`display:none` do UA stylesheet — e no arquivo exportado a Rede e as Fichas
apareciam **lado a lado, dividindo a tela**. Não remova essa regra.

## Publicar para leitura (link somente leitura)

Pedido do usuário: *"Quero que as pessoas sejam capazes de ver o que eu alterei no
meu site sem que elas sejam capazes de modificar nada."* A resposta do projeto é um
**instantâneo publicado** — um link que qualquer pessoa abre para **ler** o Codex
(nada é editável, e nada do visitante toca os dados do autor).

Como funciona:

1. O autor abre 🏠 Apresentação → 📥 Arquivo, backup e preferências → seção
   **"👁️ Publicar para leitura"** e clica em *Publicar / atualizar*.
2. `view.js:publicar()` monta um JSON único (`exportOne()` do universo ativo) com
   `{app, kind:"codex-universe", version, exportedAt, publishedAt, meta, docs}` —
   `docs` com as **6 pastas** do Codex: `codex`, `codex_images`, `livro`,
   `livro_img`, `timeline`, `competencia`. Imagens grandes passam por
   `encolherImagem()` (webp até ~4,6 MiB) antes de entrar.
3. O JSON vai para o **upload-plugin como arquivo editável**
   (`uploadPlugin.editable.set(nome, texto)`), com um nome aleatório
   `codex-<26 chars>` e a `editKey` devolvida na criação.
4. O link compartilhável é `https://perchance.org/<generatorName>#ver=<nome>`.
   Quem abrir cai em modo somente leitura.

Detalhes que importam:

- A `editKey` (e o `nome` do arquivo) vivem **apenas** no
  `localStorage["codex:viewShare"]` do autor, por universo — é o que permite
  republicar/despublicar depois. Não existe lista pública de shares.
- **Publicar de novo = atualizar o mesmo link** (o arquivo é sobrescrito, os bytes
  do snapshot trocam). Não há versionamento; o link sempre mostra o último
  publicado.
- **Despublicar** grava `{retired:true}` no arquivo (1 KB): o link passa a mostrar
  "O autor despublicou este Codex" (checado *antes* de `docs` em `view.load`).
  Isso deixa o link inerte mesmo que alguém já o tenha.
- URLs estão sujeitas a serem descobertas? Não por enumeração: os nomes são
  aleatórios de 26 caracteres. Ainda assim, o arquivo é **público** para quem tem
  a URL — não coloque o que não quer mostrar.
- O visitante baixa o snapshot para **memória**: `universe.js` troca as pastas do
  `kv` por `viewFolder()` (pasta fake em memória, prefixo `u_view_`) e `_save()`
  sai cedo. As pastas reais do visitante **nunca** são escritas — dá para provar
  em teste: `root.kv.codex_universos` do visitante continua intacto.
- A IA **saiu da tela** em 17/09/2026 (rodada 14), para o visitante tanto quanto
  para o autor: a caixa "O que você quer saber?" e o painel de resposta continuam
  em `present/view.js`, mas nenhum lugar chama `askHtml()`. `askEnabled()` segue
  existindo (usa `ai.available()` em modo leitura) para quando a caixa voltar; o
  CSS ainda esconde `.prAi`.
- **A barra de menu do Perchance fica recolhida** na página publicada
  (`$meta.header mode = minimal` no `main.pjs`): o visitante não vê home/forum/
  save/edit — só um botãozinho flutuante no canto superior direito, que o
  Perchance põe ali (e o modo de edição reabre a barra). Como esse botãozinho cai
  em cima do canto do `#dataBtn` no modo leitura, `html[data-readonly] .topActions`
  ganha `padding-right: 22px` em `src/style.css` — sem isso o canto do `⋯` fica
  inalcançável.
- O CSS faz o trabalho pesado: `html[data-readonly]` + `#roBanner`. Toda vez que
  aparecer um **novo** controle de escrita na UI, adicione o seletor na lista
  `html[data-readonly] ... { display: none !important }` no fim de
  `src/style.css`, **e** uma guarda `bloqueado()` (ou `if (VIEW.active) return`) no
  caminho JS — o CSS esconde, a guarda impede (teclado, atalhos, eventos globais).
- **Ler imagem não é escrever**: o visitante PODE folhear as imagens de uma ficha.
  `mediaHtml` (em `src/ui/media.js`) troca as caixas do autor por **uma miniatura por
  imagem** (`readerTiles`, na ordem das caixas e depois as imagens sem caixa), mostra
  as **setas ‹ ›** (que antes eram escondidas pela regra antiga `.imgBtn:not([data-media-zoom])`)
  e o `🔍` fica sempre à vista (`html[data-readonly] .mediaBtns { opacity: 1 }`). Para
  isso não encostar no instantâneo publicado, `showImage()` guarda a imagem escolhida
  num `Map` só da aba (`roActive`) em vez de escrever em `store.setActiveImage` — o
  retrato "oficial" (o do cartão e do grafo) continua o que o autor escolheu. Os
  controles que escrevem (＋, ✕, ⋯, arrastar-e-soltar, `openAddImageDialog`) não são
  montados nesse modo, e as funções ainda têm `if (VIEW.active) return` por segurança.
- `installReadonlyChrome()` cria a faixa de baixo (`#roBanner`) com "Copiar link" e
  "Abrir o meu Codex", marca `document.documentElement.dataset.readonly = "1"` e
  troca o clique do botão de universos por um aviso. A faixa é `position: fixed`;
  `html[data-readonly] #views { padding-bottom: 58px }` (78px no mobile, onde o
  texto vira `.roShort` numa linha) garante que nada fique escondido atrás dela.
- Verificado no preview (2026-09): publicar → ler → republicar (mesmo link, versão
  nova) → despublicar (link vira aviso) → republicar; link inválido mostra
  `viewErrorHtml()`; nenhuma aba tem overflow horizontal em 390×844 e 1920×1080;
  o Codex do autor volta ao normal (botões, dados) sem hash. Depois desses testes o
  share do Fluxoverso foi **republicado** e está ativo.

## Notas para quem for editar

- Edições em `src/` valem no preview imediatamente, mas **publicar só quando o usuário pedir**.
- `src/graph.js` é grande: use `grep`/`list_code_definition_names` e leia faixas, não o arquivo inteiro.
- Idiomas: **toda** a interface e o texto da IA são em português do Brasil.
- O motor do Perchance avalia os `[...]` do template **antes** dos `<script>`, então
  não conte com intercalação entre blocos e scripts.
