# TODO — Codex

Pendências e ideias de polimento. Ordem aproximada de prioridade.

## Condecorações: segunda família de etiquetas (rodada 20 — a atual)

Pedido: *"Na área de compétencias, quero que crie outro tipo de tags, chamas de Tags de
Condecoração, essas tags de condecoração vão ser as únicas que vão aparecer naquela área
que você criou. Também mude o nome dessa área para Condecorações, apenas tags de
Condecorações vão aparecer ai."*

Feito:
- **`src/competencia/store.js`**: os dados por ficha ganharam `medals` ao lado de `tags`
  (mesma forma `{id,label,note,icon,color}`, ids `med_…`). `cleanTagList` limpa as duas
  listas, e a mecânica virou genérica (`listOf/addEntry/updateEntry/removeEntry/poolOf`)
  com os nomes antigos (`tagsOf/addTag/updateTag/removeTag/tagsPool`) e os novos
  (`medalsOf/addMedal/updateMedal/removeMedal/medalsPool`) por cima. Também entram em
  `isMeaningful` (senão `touch()` apagaria a ficha que só tem condecoração), `truth`,
  `summary` (contagem), `copyData` (re-gera os ids), `importAll` (viaja no backup) e no
  export em texto (`🎖`).
- **`src/competencia/render.js`**: `tagRowHtml`/`tagNotesHtml` receberam `kind`
  (`"tags"`/`"medals"`); `heroTagBlockHtml` virou **`heroMedalsHtml(entity)`** — título
  "🎖 Condecorações", só `medals`, e continua gated por `showsOnSheet` (sem condecoração
  a área não existe).
- **`src/competencia/view.js`**: novo bloco **Condecorações** na aba, com o mesmo editor
  parametrizado por `kind` (`ENTRY_KINDS`, `entryEditorHtml`/`refreshEntryEditor`,
  `openTagEditor(kind, id)`): textos próprios ("Nova/Editar condecoração", exemplos
  "Herói de Beacon, Guardiã rank B…"), cor padrão dourada (`#facc15`) e pool separado.
  A lista de fichas passou a contar condecorações (`listMeta`), e o "Só com dados", a
  dica vazia do modo leitura e o toggle "Na ficha" (tooltip) foram ajustados.
- **`src/main.js`** (Ajuda) e **`src/sample.js`** (exemplo ganhou condecorações em Aria e
  Malvek) atualizados. CSS: `.cpMedalsEditor` (mesma caixa do `.cpTagsEditor`) e
  `.cpBlockHint`; `[data-act="new-medal"]` entrou na lista do modo somente leitura.

Testado no preview com o Misha: o bloco Condecorações aparece na aba com "＋ Nova
condecoração" e a dica; criar pelo modal → chip dourado no editor e **só ele** no
cabeçalho da ficha ("🎖 Condecorações" + chip + anotação), com a tag especial continuando
apenas no painel da Descrição; editar (prefill correto) e remover pelo ✕ funcionam; sem
condecoração a área do cabeçalho desaparece e a meta da linha volta a "6 de 7 gráficos ·
1 tag". Dados de teste removidos depois (Misha ficou com 0 condecorações e a tag
"Guardiã rank B" intacta). `vision` aprovou o bloco na ficha e o bloco na aba.

Pendências / ideias:
- [ ] A tag especial "Guardiã rank B" do Misha **não** foi migrada para condecoração (é
      conteúdo do usuário): se ele quiser vê-la no cabeçalho, é só criar uma condecoração
      com o mesmo nome — ou eu movo se ele pedir.
- [ ] Um preset de condecorações ("Medalha de ouro/prata/bronze", "Herói da cidade") no
      estilo do `ATTR_PRESETS`.
- [ ] Permitir escolher, por ficha, qual família aparece no cabeçalho (hoje é fixo:
      condecorações no cabeçalho, tags na Descrição).

## Imagens folheáveis no Codex publicado (rodada 19)

Pedido: *"Quero que as pessoas que acessem o link de publicação, consigam usar as setas
para passar as imagens. Ou que sejam capazes de visualizar as imagens nas miniaturas."*

Causa (medida no preview, entrando de verdade num link `#ver=…`): as regras do modo
somente leitura escondiam `.mediaThumbPick` (**as miniaturas**) e todo `.imgBtn` que não
fosse o `🔍` — inclusive as setas ‹ › que a rodada 16 tinha posto na foto. Quem abria o
link via uma fileira de rótulos sem imagem, sem nada clicável.

Feito:
- `src/ui/media.js`: em `VIEW.active` a faixa passa a ser `readerTiles(entity)` — **uma
  miniatura por imagem** (na ordem das caixas do autor, e as imagens sem caixa no fim),
  sem caixas vazias, sem tile "＋ imagem" e sem ⋯. As setas ‹ › são montadas quando há
  mais de uma imagem, o ＋/✕ do autor não aparecem, e as guardas novas
  (`showImage`, `openAddImageDialog`, `thumbMenu`, `boxMenu`, drag&drop) fazem o resto.
- **Folhear não escreve**: a imagem escolhida pelo visitante fica num `Map` da aba
  (`roActive`) via `showImage()`, em vez de `store.setActiveImage` — o instantâneo
  publicado e o retrato "oficial" (cartão/grafo) ficam intactos. Isso também fez o
  visualizador (🔍) acompanhar a imagem que está sendo vista.
- A navegação dos tiles passou a usar o **id da imagem** (`data-media-thumb`) em vez do
  rótulo, então uma caixa com duas imagens de mesmo nome não "prende" mais a segunda.
- `src/style.css`: saíram da lista de escondidos o `.mediaThumbPick` e o
  `.imgBtn:not([data-media-zoom])`; ficaram escondidos só `[data-media-add]` e
  `[data-media-remove]`. Novas regras `html[data-readonly] .mediaBtns { opacity: 1 }` e
  `.mediaThumb { cursor: pointer }` (no toque não existe hover).
- Ajuda do modo leitura (`src/main.js#openReadonlyHelp`) ganhou a linha de folhear
  imagens.

Testado no preview **em modo publicado de verdade** (`#ver=…` do Fluxoverso, instantâneo
de 4 imagens do Misha): 4 miniaturas com imagem (Foto 1, Foto 2, Emblema, Haloy) na ordem
das caixas, todas clicáveis; setas ‹ › andando imagem a imagem com a etiqueta
acompanhando (Foto 1 → Foto 2 → Emblema → volta circular), botões sempre à vista
(opacity 1) em 1280x900 e em 390x844; 🔍 abre em 3/4 com as 4 miniaturas e as setas dele
também trocam a imagem da ficha; `store.imageIndex` continuou 0 durante tudo (nada
escrito). No modo autor, conferido que nada mudou: 7 caixas, ⋯ em todas, tile "＋ imagem",
botões ＋ ✕, pager andando caixa a caixa e o diálogo de adicionar imagem abrindo nas
caixas vazias. O preview voltou ao modo autor (hash limpo) depois do teste.

Pendências / ideias:
- [ ] Um indicador de "n/N" no canto da foto para quem lê (hoje só a etiqueta do tipo).
- [ ] Modo autor: uma caixa com duas imagens de mesmo rótulo ainda mostra só a primeira
      (o visitante vê as duas via `readerTiles`); decidir se vale juntar os dois modelos.
- [ ] Publicar de novo depois desta rodada para o link do usuário já sair com as setas
      (o instantâneo atual é do código antigo — mas o *comportamento* vem do código do
      gerador, então basta o usuário salvar; republicar é opcional).

## Tags de Competência no cabeçalho (rodada 18)

Pedido: *"Quero que as tags de competencia sejam capazes de aparecer na área que eu
coloquei a caixa vermelha na imagem anexada."* A imagem mostrava a ficha com um retângulo
vermelho no espaço vazio do cabeçalho, logo abaixo dos botões Editar / Relação /
Ver na rede / ★ / ⋯.

Feito:
- `src/competencia/render.js`: `tagChipsHtml` foi partido em `tagRowHtml` (a linha de
  chips) + `tagNotesHtml` (a lista de anotações), e nasceu `heroTagBlockHtml(entity)` —
  o bloco do cabeçalho, com a etiqueta "⚡ Competência", os chips e as anotações. Ele só
  sai quando a ficha **tem tags** e `showsOnSheet(entity.id)` é verdadeiro (o mesmo
  interruptor "Na ficha" do painel da Descrição; o `title` do interruptor e os textos da
  aba e da Ajuda foram ajustados para dizer que ele esconde as duas coisas).
- `src/ui/detail.js`: `heroTagBlockHtml(entity)` entra logo depois de `.heroActions`, no
  cabeçalho da ficha (só no modo leitura — o editor não tem cabeçalho).
- `src/style.css`: `.heroTagBlock` (caixa arredondada, `min-height: 52px`, fundo
  translúcido, etiqueta em caixa alta miúda) + `.heroTagBlockTitle`.

Testado no preview: com o Misha (tag "Guardiã rank B") o bloco sai abaixo dos botões em
1280x900 (274x70, sem sobrepor nada) e em 390x844 empilhado e de largura cheia; o Yang
(sem tags) não ganha caixa nenhuma; o painel da Descrição continua mostrando as tags
iguais (a refatoração não mudou o HTML dele); desligar "Na ficha" esconde o bloco e
religar o traz de volta; uma anotação de teste na tag apareceu na lista e foi apagada
depois (dados do Misha restaurados). `vision` aprovou o bloco no desktop e no celular.

Pendências / ideias:
- [ ] Decidir se os chips do cabeçalho devem abrir a aba ⚡ Competência ao clique (hoje
      são só leitura; o botão ✏️ Editar do painel da Descrição continua sendo o atalho).
- [ ] Ideia: um interruptor próprio ("tags no cabeçalho") separado do "Na ficha", caso o
      usuário queira as tags no topo mas não os aros na Descrição.

## Caixas de imagem abaixo da foto (rodada 17)

Pedido: *"Certo, ficou muito bom, mas esses anexos de imagem que estão a cima do tretato,
coloque eles para baixo da imagem."* (ou seja: a faixa de caixas de imagem, que a rodada
16 tinha posto **acima** da foto, desce para **baixo** da foto).


Feito:
- `src/ui/media.js` (`mediaHtml`): o `mediaHtml` agora devolve o `.mediaImg` (foto) e só
  depois a `.mediaStrip` (a faixa de caixas). Vale para os dois usos — ficha em leitura
  (`heroImg`) e editor (`editorImg`) — porque é o mesmo componente.
- `src/style.css`: comentário atualizado e o `padding` da `.mediaStrip` virou
  `1px 5px 5px` (colado na foto por cima, com respiro embaixo, já que agora é o último
  elemento).
- Medido no preview com o Misha (200px de largura): foto 85→352, faixa 360→441 (antes era
  faixa 85→166 e foto 174→441); no editor, foto 159→426 e faixa 434→515. `vision` aprovou
  a ordem, sem sobreposição nem recorte, e o pager ‹ › continua andando caixa a caixa
  (cursor foi para "Corpo inteiro", que é vazia, então a foto não troca — correto).
  Em 390×844 a faixa rola dentro do card (`scrollWidth` 398 > `clientWidth` 334) e
  `documentElement` não ganha rolagem horizontal; nada de corte. Dados de teste do Misha
  restaurados (imagem ativa de volta à original) depois do teste.

Pendências / ideias:
- [ ] Ideia: deixar as caixas arrastáveis para reordenar.

## Caixas de imagem em faixa (rodada 16)

Pedido: uma captura da ficha do Misha com duas anotações vermelhas — um retângulo em volta
da grade de caixas de imagem ("Coloque essas caixas no lugar onde a seta esta apontando.
Também quero ser capaz de renomear cada caixa e que elas estejam conectadas com a seta
preta") e um círculo sobre uma tira de abas ("Quero isso, mas deixe um pouco
transparente").

Feito:
- A grade de caixas (2 linhas de 4, embaixo da foto) virou **uma faixa horizontal em cima
  da foto**, semitransparente (`.mediaStrip` em `src/style.css`), com rolagem lateral sem
  barra visível; o tile "＋ imagem" foi junto, no fim da faixa.
- **‹ › nas pontas da fileira de botões da foto** (`data-media-prev`/`data-media-next` em
  `src/ui/media.js`): andam uma caixa por vez, rolam a faixa até ela e trocam a foto quando
  a caixa tem imagem (cursor destacado por `.mediaThumb.cursor`). A fileira de botões da
  foto fica sempre visível quando existe pager (`.mediaBtns:has([data-media-prev])`).
- **Toda caixa tem ⋯** (cheia ou vazia) com "Renomear caixa" — e, nas vazias, "Adicionar
  imagem". O nome fica na ficha (`entity.boxes` + `store.setEntityBoxes`), `renameBoxLabel`
  renomeia a imagem junto quando a caixa está cheia, e `tiposOf` junta os nomes salvos com
  os rótulos das imagens (imagem com rótulo órfão ganha caixa própria).
- `openAddImageDialog` agora usa os nomes das caixas da ficha como chips.

Testado no preview (com o Misha): faixa acima da foto sem sobrepor, rolagem e pager
funcionando (cursor 1→2→3→4, `scrollLeft` acompanhando, volta circular), renomear caixa
vazia e cheia (a imagem acompanha), diálogo de adicionar imagem abre com o tipo certo;
conferido em 390x844 e no editor (`👁 Ver ficha` / `✓ Concluído`). Dados de teste
desfeitos depois (as caixas do Misha voltaram ao padrão).

Pendências / ideias:
- [x] Confirmado com o usuário: a faixa **não** ficou onde ele queria — ele pediu para
      descer as caixas para **baixo da foto** (rodada 17, a atual).
- [ ] Ideia: deixar as caixas arrastáveis para reordenar.


Pedido: *"Quero que deixe a barra do editor do perchance oculta para as pessoas que
acessarem o link de visualização das publicações."*

Feito:
- `main.pjs`: `$meta.header` com `mode = minimal`. É o mecanismo oficial da plataforma
  (`window.generatorStaticMetaData.header.mode === "minimal"` faz o shell do Perchance
  esconder `#menuBarEl` e mostrar só um botãozinho flutuante no canto superior direito;
  `__showEditShell()` volta a mostrar a barra no modo de edição).
- `src/style.css`: `html[data-readonly] .topActions { padding-right: 22px; }` — medido no
  preview, o botãozinho do Perchance (≈17×17 px, `right: 0.21rem`) cobria ~6,6×10 px do
  canto do `#dataBtn` no modo leitura. Depois do respiro, sobreposição = 0 (conferido
  com o botão emulado no lugar + `vision`).
- Decisão: **não** esconder nada no app (a barra some é no shell do Perchance) e **não**
  aplicar o respiro fora do modo leitura (no editor a barra aparece, então o espaço
  extra só viraria buraco).

Pendências / ideias:
- [ ] Só dá para ver de fato na página publicada **depois de salvar** (`#static-meta-data`
  da página de topo vem do servidor): abrir `perchance.org/<nome>` sem `#edit` e conferir
  que a barra sumiu e que o botãozinho não cobre nada.
- [ ] O `mode = minimal` vale para qualquer visita à página, inclusive a do próprio autor
  (fora do editor) — é uma escolha global, não por-visitante. Se um dia incomodar,
  reverter é apagar o bloco `header` do `$meta`.

## IA fora da interface (rodada 14)

Pedido: *"Quero que tire os botões de interação com a IA do meu site."* (antes dele, duas
capturas de tela apontando a pílula `✨ IA` do topo, o painel "Usar inteligência neste
Codex" e a caixa "O que você quer saber?").

Feito:
- **Saiu da tela todo controle de IA**, sem apagar a camada de IA:
  `#aiBtn` do topo (e o menu de ferramentas), o `✨ IA` da ficha (`#aiMenuBtn`) e o menu
  da ficha, "Extrair de um texto" (estado vazio da ficha + estado vazio das Fichas +
  busca sem resultado), "Enriquecer com IA" / "Sugerir conexões (IA)" (menu do cartão),
  `✨ Sugerir conexões` do painel da Rede (`#giAi`), os botões `✨`/`👁` da imagem e as
  ações de IA do zoom, "Gerar com IA" no diálogo de adicionar imagem, o item "Gerar com
  IA" do menu da capa, o atalho "Perguntar à IA" da Biblioteca e o bloco da Apresentação
  (interruptor `#prAiInput`, caixa `#prAskInput` e painel `.prAnswer`).
- **`initAiPanels()` continua ligado no boot** e os listeners `codex:ai-*` continuam
  registrados — só não há mais quem os dispare. Religar = recolocar os botões (ou
  chamar `aiHtml()`/`askHtml()`/`answerHtml()` de volta no `html()` de
  `src/present/view.js`; o comentário no arquivo diz onde).
- Faixa da Ajuda (`?`) sem a seção "IA" e sem as menções a IA; texto do estado vazio das
  Fichas reescrito (`📇 Comece seu arquivo`).
- Testado no preview: nenhum `#aiBtn`/`#aiMenuBtn`/`#giAi`/`.prAi`/`.prAsk` no DOM, menu
  do cartão, menu da miniatura, zoom e diálogo de imagem sem itens de IA, Apresentação
  sem a caixa de perguntas, Biblioteca com 3 atalhos, e o app abre normal no Fluxoverso.
- **Standalone regerado** por `src/tools/build-standalone.mjs` (sem warnings) e entregue
  como `codex.html`.

Pendências / ideias:
- [ ] Se o usuário quiser, remover de vez `src/ai.js`/`src/ui/aipanels.js` e os imports
      `ai-text-plugin`/`text-to-image-plugin` do `main.pjs` (hoje eles custam carregar a
      página sem nenhum botão que os use).
- [ ] Decidir se a marca `✨` do botão "Mencionados" do Livro (que **não** é IA) fica.

## Publicar para leitura (rodada 13)

Pedido: *"Quero que as pessoas sejam capazes de ver o que eu alterei no meu site sem que
elas sejam capazes de modificar nada."*

Feito:
- **`#ver=<id>` na URL entra em modo somente leitura**: o app baixa o instantâneo
  publicado (`src/view.js`) para a memória e mostra o Codex inteiro sem nenhum caminho
  de escrita (`html[data-readonly]` esconde os controles; guardas `bloqueado()`/`VIEW.active`
  barram teclado, atalhos e eventos globais).
- **Seção "👁️ Publicar para leitura"** em 📥 Arquivo, backup e preferências: publicar /
  atualizar (mesmo link), copiar link, abrir o link e despublicar (grava `retired`).
- **`src/view.js`** (novo): `VIEW`, `publicar()`, `despublicar()`, `load()`,
  `installReadonlyChrome()` (faixa de baixo + botão do topo vira aviso), `viewFolder()`,
  `viewErrorHtml()`, `encolherImagem()`.
- **`universe.js` view-aware**: em modo leitura as pastas do `kv` são trocadas por pastas
  em memória (`u_view_...`) e `_save()` sai cedo — os dados do visitante nunca são tocados.
- A **IA continua disponível** para quem só lê (perguntar ao mundo é leitura + geração
  local); o interruptor `.prAi` some no modo leitura (`askEnabled()`).
- Testado no preview: publicar → ler → republicar (mesmo link, versão nova) → despublicar
  (link vira "O autor despublicou este Codex") → republicar; link errado mostra a tela de
  erro; sem overflow horizontal em 390×844 e 1920×1080; o Codex do autor volta ao normal.
  Depois dos testes o share do Fluxoverso foi republicado e está ativo.

Pendências / ideias:
- [ ] "Ver o histórico": guardar N instantâneos antigos (hoje republicar sobrescreve).
- [ ] Botão "Exportar o JSON deste Codex publicado" na faixa de leitura (hoje só lê na tela).
- [ ] Aviso no painel quando o Codex mudou desde a última publicação ("há alterações não
      publicadas") — hoje o autor precisa lembrar de republicar.
- [ ] Opcional: campos ocultos/privados que ficam de fora do instantâneo publicado.

## Rodada 12 — DESFEITA (restaurada do backup do usuário)

O usuário pediu que o mundo vivesse no próprio perchance.org, *"para que outras pessoas
sejam capazes de ver o meu universo e que eu possa ver o que eles criaram"*. Foi
implementado e testado (Praça hospedada pelo `server-plugin` do Perchance, com protocolo
binário, chave do autor no `localStorage`, presença, freios de abuso; mais uma "nuvem
particular" no Firebase para o arquivo autônomo). Em seguida o usuário pediu
**"Desfaz todas essas alterações até."** e, logo depois, mandou um **backup do gerador**
(estado do fim da rodada 11) pedindo para restaurar o site a partir dele.

O site foi restaurado byte a byte do backup: saíram `src/cloud.js`, `src/praca-server.js`,
`src/ui/cloud.js`, `src/ui/praca.js`, `src/docs/nuvem-e-praca.md`, o bloco
`<script type="text/x-server-plugin">` do `index.html` e o import do `server-plugin` no
`main.pjs`. **Não refazer sem o usuário pedir de novo.** (Uma cópia do código da rodada 12
ficou só na sessão de edição; o guia da nuvem/Praça está no histórico do chat, não no repo.)

## Página "Apresentação" + resumo 2000 (rodada 11 — o pedido mais recente)

Pedido: *"Quero que você aumente a quantidade de caracteres na área 'Sobre o que é este
mundo?' para 2000 caracteres. Além disso, quero que você crie, do lado esquerdo de fichas,
uma nova página chamada 'Apresentação'… Quero que a imagem colocada nessa página seja vista
na miniatura do codex, na página de criação do codex."*

Feito:
- **Resumo do Codex de 600 → 2.000 caracteres** (`#ufAbout`, `maxlength="2000"`).
- **Aba "🏠 Apresentação"** como primeira aba (antes de "Fichas"), `#presentView`,
  `src/present/view.js` (`createPresentView`): cabeçalho, texto em leitura, capa
  panorâmica, interruptor da IA, "O que você quer saber?" (IA responde com streaming) e a
  grade de estatísticas clicável.
- **Capa do Codex** guardada na pasta `codex` daquele universo (chave `cover`), com
  upload/link/IA/remover/zoom — e a **miniatura do card na Biblioteca** passa a usá-la.
- A seção **"Apresentação"** entrou na Ajuda (`?`), e a tecla `p` abre a aba.

Pendências / ideias:
- [ ] Capa com recorte/enquadramento manual (hoje ela é centralizada e cortada por CSS).
- [ ] Reordenar os cartões da grade de estatísticas ou escolher quais aparecem.
- [ ] Histórico de versões do "Sobre o que é este mundo?" (hoje só o texto atual).

## Nomes visíveis "Codex" (rodada 10)

Pedido: *"Quero que mude o nome 'Seus universos' para 'Seus Codexs'. O mesmo vale para
'Novo universo' para 'Novo Codex'; troque as palavras na parte inicial para Codex."*

Feito (só strings de UI, em `src/ui/universes.js`, `src/universe.js`, `src/main.js`,
`index.html`):
- Biblioteca: título **"Seus Codexs"**, subtítulo "Cada Codex guarda…", contador
  **"1 Codex" / "N Codexs"**, botão **"＋ Novo Codex"**, card tracejado **"Novo Codex"**,
  rodapé "Cada Codex é um arquivo separado…", tooltip do botão do topo "Biblioteca de
  Codexs" e o item do menu ⋯.
- Estado vazio: "Crie o seu próprio Codex", "Um Codex é o seu mundo: …",
  "＋ Criar meu Codex", "quantos Codexs quiser".
- Formulários/fluxos: "Nome do Codex" (placeholder "Meu Codex"), "🌍 Novo Codex" /
  "✏️ Editar Codex", ação "Criar Codex", "Duplicar Codex", "Apagar Codex" e os toasts
  ("Codex 'X' criado", "Codex apagado", "Codex 'X' importado", "Backup do Codex
  baixado", "Codex não encontrado").
- Nada interno mudou (`universes`, `UNIVERSE_FOLDERS`, `codex_universos`, `uni_…`), e o
  universo legado do usuário continua com o nome de dado que ele escolheu.

## Universos + Biblioteca (rodada 9)

Resolvido nesta rodada (pedido: *"cada pessoa que entre seja capaz de criar o seu próprio
Codex (Universo), separando o mundo que cada pessoa cria"*):
- **Cada universo é um mundo separado** no armazenamento: as 6 pastas do app
  (`codex`, `codex_images`, `livro`, `livro_img`, `timeline`, `competencia`) passam a
  levar o prefixo do universo ativo (`u_uni_…_`), via `kvFolder(nome)` de
  `src/universe.js`. Trocar de universo só troca o prefixo e recarrega a página.
- **Biblioteca de universos** (`src/ui/universes.js`) como tela de entrada, no estilo da
  captura que o usuário mandou: título então "Seus universos" (hoje "Seus Codexs"),
  contador, atalhos (Criar
  entidades / Escrever capítulos / **Perguntar à IA** / Ver a rede), grid de cards
  (emoji, nome, badge "aberto agora", etiquetas de gênero, prévia do resumo, contagens,
  "atualizado …", Abrir/Continuar + ⋯) e o card tracejado "Novo Codex".
- **Criar / abrir / renomear / duplicar / exportar / importar / apagar** universo; um
  universo novo pode nascer vazio **ou** já com o universo de exemplo (`bootstrapSample`).
- **Migração sem cópia**: os dados que já existiam viraram o universo **legado**
  (`uni_65wnn2s3ug`, prefixo vazio) — nada foi movido, o usuário não perdeu nada.
- Botão do topo (`🌍 Meu universo ▾`) abre a Biblioteca; item também no menu ⋯.
- Exportar universo = arquivo `{kind: "codex-universe", docs: {pasta: [[chave, valor]]}}`
  (por universo); Importar aceita esse formato, o backup antigo (`entities[]`) e cargas
  com `fiches`, sempre criando um universo novo.

Pendências / ideias:
- [ ] **Mover uma ficha (ou uma ficha + as vizinhas) de um universo para outro** — a
      cópia hoje é do universo inteiro (duplicar) ou do arquivo inteiro (importar).
- [ ] **Compartilhar um universo com outra pessoa** por link/file (hoje: exportar JSON e
      mandar o arquivo).
- [x] Foto/capa do universo além do emoji — **feito na rodada 11** (capa na Apresentação,
      mostrada também na miniatura do card).
- [ ] Estatísticas do universo no card (palavras escritas, eventos, gráficos) — hoje são
      fichas/relações/capítulos.
- [ ] Reordenar os universos manualmente na Biblioteca (hoje a ordem é "atualizado em").
- [ ] Lixeira para universo apagado (hoje `destroy` apaga as chaves na hora, sem volta).
- [ ] Sincronizar entre dispositivos (só via exportar/importar JSON).

## Anexos: ligar arrastando + catálogo editável (rodada 8)

Resolvido nesta rodada:
- **Botão direito numa esfera** (Rede ou Árvore) inicia uma **linha elástica**; soltar
  sobre outra esfera abre o seletor de tipo e cria a ligação. Também funciona pela
  **alça 🔗** que aparece no hover da esfera e pelo **toque longo** (460 ms) no touch.
- Botão direito **sem** arrasto (menos de 6px) abre o **menu de contexto** da esfera
  (Abrir ficha / Ligar a outra ficha… / Centrar aqui / Explorar a partir daqui).
- **Catálogo de tipos de anexo editável**: **⚙️ Tipos de anexo** cria "é amante de",
  "é concubina de", "é escravo(a) de"…, permite reescrever as frases dos tipos padrão
  (mesmo `id` sobrescreve, sem quebrar as ligações), marcar ⇄ mútua, mudar grupo e
  gerações de parentesco, **restaurar o padrão** e **apagar** (convertendo as ligações
  para "tem ligação com" ou apagando-as junto).
- **Editar o tipo de uma ligação existente**: o botão 🔗 de cada linha de conexão da
  ficha abre o seletor em modo edição (✓ no tipo atual, ⇄ troca a direção, remover).
- Tudo guardado em `settings.customKinds` e levado no backup JSON. A IA passa a ver os
  tipos criados pelo usuário na extração/sugestão.
- Corrigido de passagem: a linha de conexão na ficha mostrava o nome da outra ficha
  **duas vezes** quando a relação estava no sentido inverso; e "A partir de uma ficha…"
  (escolher a ficha raiz) quebrava quando a busca estava vazia.

Pendências / ideias:
- [ ] Reordenar/duplicar um tipo no gerenciador.
- [ ] Arrastar de uma ficha para outra **aberta no painel de detalhe** (hoje só nas esferas).
- [ ] Sugerir o tipo provável pelo que já existe entre as duas fichas (ex.: se já são
      irmãos, oferecer "é tio(a) de" para o filho).
- [ ] Cores próprias por tipo (hoje a cor vem do grupo).

## Backup único em JSON (rodada 7 — livros, timeline e competência no mesmo arquivo)

Resolvido nesta rodada:
- O "Baixar JSON" / "JSON sem imagens" / "Copiar JSON" agora levam **tudo**: além de
  fichas/pastas/relações/imagens, vão `payload.livro` (capítulos + imagens do livro),
  `payload.timeline` (eventos) e `payload.competencia` (catálogo + dados por ficha).
- Importar restaura os três módulos junto com o arquivo principal, e os **vínculos entre
  módulos são refeitos** com o mapa de ids do import: anexo capítulo↔ficha, evento↔ficha,
  evento↔capítulo e gráficos↔ficha — em "Substituir tudo" (ids preservados) e em
  "Mesclar" (quem colide ganha id novo, e o mapa redireciona as referências).
- "Apagar tudo" agora limpa também `book`, `timeline` e `competencia` (`wipe()` novo nos
  dois primeiros stores), e o painel "Seu arquivo" mostra capítulos, eventos, fichas com
  competência e total de palavras escritas.
- `store.importAll` devolve `{entities, relations, idMap, folderMap}`; `book.importAll`
  devolve `{chapters, idMap}` (mudou de array para objeto — o chamador em `book/view.js`
  foi ajustado).

Pendências / ideias:
- [ ] Backup incremental/automático (hoje é manual; o usuário pode esquecer).
- [ ] Importar só um módulo (ex.: só a timeline) sem tocar no resto — a área de dados só
      tem "mesclar tudo" / "substituir tudo".
- [ ] Avisar no import quando o arquivo é de uma versão mais nova (`version`/`kind` já vão
      no payload, mas ninguém confere).

## Competência (rodada 6 — gráficos de poder e tags especiais)

Resolvido nesta rodada:
- Aba **⚡ Competência** ao lado de Timeline: lista de fichas à esquerda, quadro da
  ficha à direita com um cartão por gráfico (aro, −/＋, valor, slider, nome, anotação,
  cor, máximo, ordenar/duplicar/apagar) e os blocos de **Tags especiais** e **Texto
  abaixo dos gráficos** (`src/competencia/view.js`).
- Gráficos como **catálogo global** (nome/cor/máximo valem para todas as fichas) com
  **valores por ficha indexados por id** — renomear "INTELIGÊNCIA" para outra coisa
  mantém todos os números no lugar.
- Painel **⚡ Competência** desenhado na **Descrição da ficha** (aros SVG, nomes em
  caixa alta, anotação embaixo de cada aro, tags, texto de baixo com `[[vínculo]]`),
  com interruptor "Na ficha" e botão "✏️ Editar" que volta para a aba na ficha certa.
- Backup: `payload.competencia` no JSON principal (exportar/importar/apagar tudo).
- Universo de exemplo ganhou valores e tags de competência para os personagens.

Pendências / ideias:
- [ ] Escalas alternativas por gráfico além de 0..máx (ex.: −5..+5, ou % ) — hoje
      `min` é sempre 0.
- [ ] Comparar a competência de duas fichas lado a lado (radar/duelo).
- [ ] Um gráfico de radar juntando todos os aros (visão "de relance" da ficha).
- [ ] Reaproveitar o catálogo na IA: pedir sugestão de valores a partir da descrição
      ("dê notas de 0 a 10 para esta ficha").
- [ ] Tags especiais com efeito mecânico opcional (dado, modificador) para mesas de RPG.
- [ ] Ordenar/filtrar a lista da aba por um gráfico específico (hoje só por nome/tipo).
- [ ] Arrastar o cartão para reordenar (hoje só pelo menu ⋯ ↑/↓).

## Vínculo de palavra (rodada 5 — anexar ficha a uma palavra)

Resolvido nesta rodada:
- Botão direito numa palavra/trecho → "Anexar … a uma ficha…": a palavra continua
  normal e passa a ser um link **azul** que abre a ficha (sem chip/ícone/fundo).
- Vale no Livro (`<span class="bkRef wordLink" data-ref>`), na descrição do evento da
  Timeline, na descrição da ficha e nos campos longos (`[[palavra|Nome da ficha]]`,
  desenhados pelo `renderRich`), tudo por uma primitiva só: `src/ui/wordlink.js`.
- Menu do vínculo já existente: abrir ficha, **trocar a ficha**, e **remover o vínculo
  mantendo a palavra**. Chip clássico também ganhou "Trocar a ficha…".

Pendências:
- [ ] Anexar a mesma palavra a mais de uma ficha (hoje o vínculo é 1:1).
- [ ] Sugerir automaticamente palavras do texto que casam com fichas existentes
      ("o nome X aparece aqui — anexar?"), aproveitando `store.resolveName`.
- [ ] Autocompletar `[[` na descrição da ficha (hoje só o menu de botão direito).
- [ ] Um painel "Vínculos" no editor do Livro listando todos os word links do capítulo.
- [ ] `contenteditable` não sobrevive ao `sanitizeHtml` (o `open()` recoloca) — se a
      allow-list ganhar esse atributo, remover o remendo do `open()`.

## Imagens da ficha (rodada 4 — zoom, tipos, imagens da descrição)

Resolvido nesta rodada:
- Zoom ao clicar em qualquer imagem (principal, tipo, descrição) — `src/ui/lightbox.js`,
  com pinça/roda, arrastar, ‹ ›, miniaturas, contador, baixar, girar, ações extras,
  teclado e **swipe** para trocar de imagem no celular.
- Imagens na descrição: leitura com legenda e tile "＋ imagem na descrição"; edição
  com legenda e ✕ (`src/ui/media.js` + `src/store.js`).
- Vários tipos de imagem por ficha (7 padrão, + tipos personalizados, limite
  `maxImagensPorFicha` = 9), com a imagem **ativa** alimentando ficha, cartão e grafo.
- Cache de miniatura do grafo invalidado por `imgKey` (bug do avatar velho).

Pendências:
- [ ] Reordenar as imagens da ficha (arrastar a miniatura para mudar a ordem; hoje a
      ordem é a de criação).
- [ ] Escolher qual tipo é a imagem principal a partir do próprio visualizador.
- [ ] Comparar duas imagens lado a lado ("antes/depois" de um retrato por IA).
- [ ] Crop/recorte não destrutivo por imagem (hoje só o `shrinkImage` global de 1024px).

## Motor de rótulos do grafo (`src/graph.js`)

Resolvido nesta rodada (não repetir sem medir):
- Rótulos nunca mais são recortados: a posição final é sempre uma candidata
  **totalmente dentro** do canvas quando existe alguma (`bestInside` é usado sem
  tolerância) — medido 0 recortes em 390/768/1280/1440/1920 de largura.
- Direção preferida dos rótulos = **para fora do centro de massa** do grafo, o que
  joga os rótulos para as margens livres: menos sobreposições e melhor folga.
- Em zoom baixo os nomes longos são encurtados (por palavra, até ~17 caracteres)
  antes de medir a caixa — caixas menores = menos colisões.
- O grafo fica **emoldurado** (fit) depois que a simulação assenta, e o `fit()`
  imediato dentro de `refreshGraph()` foi removido (era a causa do grafo deslocado).

Pendências:
- [ ] Em telas bem pequenas e zoom baixo (ex.: 390x496, escala ~0,46) ainda restam
      1–2 rótulos a ~3px de um círculo vizinho. A caixa de texto é grande em relação
      aos nós nesse zoom; uma saída seria desenhar os rótulos em duas linhas ou
      reduzir a fonte no zoom baixo.
- [ ] Canvas muito baixo (ex.: 62px de altura no editor) continua apertado por
      definição — o `labelCap` já reduz para o mínimo de 4, mas vale revisar.
- [ ] Considerar esmaecer (alpha) em vez de esconder rótulos que perdem a vaga.

## Verificação

- [ ] O modelo de visão erra em julgamentos finos nesse canvas (chegou a dizer
      "recortado" e "grafo jogado para a direita" quando a bbox de pixels provou
      margens simétricas). Fontes de verdade, em ordem:
      1. `state.nodeLabels` (`{x,y,w,h,kind}` em px de tela) para rótulos;
      2. **bbox dos pixels desenhados do canvas** (alpha > 24) para enquadramento;
      3. `getBoundingClientRect` / `documentElement.scrollWidth` para layout.
- [ ] Para A/B justo de layout: semear `Math.random`, assentar, congelar posições,
      então comparar variantes desenhando no mesmo tick.

## Plataforma

- [ ] `set_viewport_size` NÃO dispara `resize` na página nem callback de
      `ResizeObserver` (bug reportado: bf9cdc3f). Por isso `createGraph` tem um
      `setInterval` de 600ms que compara `parent.clientWidth/Height` com `state.vw/vh`
      e chama `resize()` quando muda. Não remover sem verificar que a plataforma
      passou a entregar os eventos — rotação de tela/resize dependem disso.

## Ideias de produto (não pedidas ainda)

- [x] Linha do tempo visual para fichas do tipo `evento` — **feita na rodada 3** como
      a aba **Timeline** (`src/timeline/*`), com eventos datados + capítulos pelo
      "Momento" + chips de fichas.
- [ ] Exportar a árvore genealógica como imagem/SVG.
- [ ] "Modo apresentação" (só leitura, fundo neutro) para mostrar o mundo a terceiros.
- [ ] Marcar relações como "canônicas" vs "proposta" (rascunho da IA).
- [ ] Mapa mental de locais (posicionar locais no canvas e ligar por `localizado`).
- [ ] Cálculo de parentesco derivado (ex.: inferir avô a partir de pai+pai).

## Livro / Timeline — polimento possível

- [ ] Anexar a mesma imagem a dois capítulos guarda duas cópias (ids separados). Dá
      para deduplicar por hash do data URL, se o armazenamento pesar.
- [ ] Arrastar um cartão da Timeline para reordenar/redatar (hoje só pelo menu ⋯).
- [ ] Uma imagem inserida no texto pode ser arrastada/redimensionada com o mouse
      (hoje o tamanho é o natural, limitado à largura da coluna).
- [ ] Tabelas e alinhamento de texto na barra de formatação (a allow-list de
      `richtext.js` já aceita `TABLE` mas a barra ainda não as cria).
- [ ] Exportar a timeline como imagem/PDF para impressão.
