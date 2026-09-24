# SPEC — O que o usuário pediu (Codex)

Documento vivo: toda vez que o usuário ajustar o escopo, atualize aqui. Se a sessão
de chat for perdida, é este arquivo que preserva os desejos do usuário.

## Pedido original (verbatim)

> Gostaria que me ajudasse a criar um organizador de personagens, no qual eu possa
> colocar imagem, descrição e muitas outras informações para cada personagem. Assim
> como inúmeras pastas que eu possa gerenciar para outras coisas, como criar um
> universo, organizações, etc. Tudo com a ajuda da IA para me auxiliar a inteligar
> esses personagens, reconhecendo-os por nomes e criando uma rede "genealógica"
> entre amigos, familiares, inimigos, etc.

## Requisitos destilados

1. **Fichas de personagem ricas**
   - imagem (upload com recorte/redimensionamento, colar, ou gerar por IA)
   - nome, tipo, resumo curto, descrição longa
   - "muitas outras informações": campos sugeridos por tipo + campos personalizados
     livres (o usuário cria quantos quiser, com o nome que quiser)
2. **Pastas em abundância, para qualquer coisa**
   - pastas aninhadas **sem limite de profundidade**
   - pastas servem para personagens **e** para outras coisas: universos, organizações,
     locais, itens, criaturas, eventos, notas
   - mover fichas entre pastas (arrastar-e-soltar), renomear, excluir em cascata
3. **IA como assistente de ligação (o coração do pedido)**
   - **reconhecer fichas por nome** já existentes no arquivo (sem depender de ID)
   - criar **rede de relações**: amigos, familiares, inimigos, hierarquias, lugares
   - **visão genealógica**: uma árvore organizada por gerações de parentesco
   - extrair fichas + relações a partir de um texto colado
   - sugerir conexões plausíveis entre fichas existentes
   - enriquecer uma ficha (resumo/descrição/campos vazios)
   - descrever uma imagem e gerar retratos

## Pedidos seguintes

### 2. Aba "Livro" (editor de capítulos + corretor pt-BR) — verbatim

> Agora eu quero que você crie uma página nova que permita que as pessoas criem
> páginas de livros que permitam escrever até 50.000 caracteres. Parecido com a
> imagem anexada, mas sem o nome Bardo e, de preferência, que a cor seja parecida
> com a que já existe. Também quero que você adicione um corretor ortográfico que
> ajude a corrigir erros em português-Brasil (PT-BR). Assim como o corretor do
> Google Documentos.

Requisitos destilados:

1. Aba/página nova dedicada a escrever o **livro**, com a mesma linguagem visual do
   app (fundo escuro azulado, acento violeta `#a78bfa`) — **sem** nenhuma menção a
   "Bardo" (o app se chama **Codex**).
2. Cada **capítulo** aceita no máximo **50.000 caracteres**; ao ultrapassar, o texto
   é truncado com um aviso e o contador/barra indicam o uso.
3. Lista de capítulos com título, prévia do texto, um campo de **momento** da
   cronologia (ex.: "Ano 10 DC"), contagem de caracteres/palavras, busca, ordenação,
   duplicar/apagar, importar `.md`/`.txt`/`.docx` e exportar (capítulo, livro todo em
   `.md`/`.txt`, backup `.json`).
4. **Corretor ortográfico pt-BR** com comportamento semelhante ao do Google
   Documentos: sublinhado vermelho ondulado nas palavras erradas enquanto se
   escreve, sugestões para corrigir (clique direito na palavra), botão de revisão
   com a lista das palavras + sugestões, ignorar palavra, adicionar ao dicionário
   pessoal, e nenhum falso positivo para os nomes já cadastrados no universo.

### 3. Livro rico, anexos e Timeline — verbatim

> Coloque na parte de livro uma barra em que seja capaz de usar negrito, itálico,
> sublinhado, aumentar o tamanho das letras, etc. Está faltando isso. Também coloque
> um botão para salvar o capítulo e sair da página, para iniciar um novo ou fazer
> outra coisa. Gostaria também que colocasse a opção de anexar imagens ou
> personagens, organizações, etc., das fichas já criadas nos capítulos para ajudar a
> encontrá-los. Também seria bom criar uma area para timeline. Quero que tudo seja
> conectado para facilitar.

Requisitos destilados:

1. **Barra de formatação** no editor do capítulo: negrito, itálico, sublinhado,
   riscado, aumentar/diminuir o tamanho da letra, títulos (H1/H2), parágrafo,
   citação, listas (marcadores e numerada), linha divisória e desfazer/refazer.
   O texto passa a ser **rico** de verdade (o capítulo deixa de ser texto puro).
2. **Botão "Salvar e sair"** bem visível que salva o capítulo e volta para a lista,
   para começar outro capítulo ou ir a outra parte do app.
3. **Anexar imagens e fichas** (personagens, organizações, locais…) aos capítulos:
   - imagens inseridas no meio do texto (upload, redimensionadas e guardadas no
     navegador);
   - fichas anexadas ao capítulo **e** inseridas inline no texto como atalho
     clicável, para achar a ficha direto do capítulo e o capítulo direto da ficha
     (seção "Aparece em" da ficha).
4. **Timeline**: uma área nova de cronologia com eventos datados, que mostra também
   os capítulos pelo seu "Momento", com fichas ligadas a cada evento.
5. **"Tudo conectado"**: capítulo ↔ fichas ↔ timeline (e o resto do app) ligados por
   cliques e por listas derivadas, sem retrabalho manual.

### 4. Zoom na imagem, imagens na descrição e vários tipos de imagem — verbatim

> Quero que permita dar zoon na imagem dos personagens ao clicar diretamente na
> imagem. Isso vai permitir que a pessoa veja com mais clareza. Também permita anexar
> imagem na descrição do personagem, assim como permitir colocar várias imagens na
> área da imagem 4, permitindo colocar pelo menos 5 tipos.

Requisitos destilados:

1. **Zoom ao clicar na imagem** da ficha (e em qualquer imagem da descrição): abre um
   visualizador em tela cheia com roda do mouse / pinça para dar zoom, arrastar para
   mover, duplo clique/clique para ampliar, barra inferior com −/＋/porcentagem,
   girar/redefinir (⟲), baixar (⤓), ação contextual (✨ descrever com IA), fechar (✕),
   setas ‹ ›, contador `n/N`, faixa de miniaturas e **arrastar (swipe) no celular**
   para trocar de imagem. Teclado: `Esc`, `←`, `→`, `+`, `−`, `0`.
2. **Imagens anexadas à descrição** do personagem: várias imagens com legenda
   opcional, exibidas junto do texto da ficha; clique amplia no mesmo visualizador.
3. **Vários tipos de imagem por ficha** (pelo menos 5): cada ficha tem uma galeria de
   "tipos" (Retrato, Corpo inteiro, Expressões, Traje, Combate, Alternativo, Cenário
   por padrão, + tipos personalizados). Cada tipo guarda a sua própria imagem; um
   deles é o **ativo** (aparece como imagem principal da ficha, nos cartões e nos
   nós do grafo). Limite configurável em `maxImagensPorFicha` (padrão 9) e lista de
   tipos em `imageTipos`, ambos em `main.pjs`.

Ou seja: cada ficha continua com **uma imagem "principal"** (o tipo ativo), mas pode
ter imagens para vários enquadramentos/variações, mais as imagens da descrição.

### 5. Anexar uma ficha a uma palavra — verbatim

> Quero que seja possível anexar um personagem, organização ou qualquer ficha em uma
> palavra no livro, na timeline ou em qualquer outra área, mostrando apenas a palavra
> em azul. No caso, ao selecionar e clicar com o botão direito para anexar.

Requisitos destilados:

1. **Anexar qualquer ficha a uma palavra** (ou trecho curto) — personagem,
   organização, lugar, item, o que existir no Codex.
2. **Aparece só a palavra**, na cor **azul**, como link — sem chip, sem ícone, sem
   fundo colorido. Clicar na palavra abre a ficha.
3. **Funciona no Livro, na Timeline e "em qualquer outra área"** — isto é, também na
   descrição da ficha e nos campos longos de texto.
4. **Fluxo pedido: selecionar a palavra e clicar com o botão direito** → "Anexar…".
5. Deve dar para **desfazer** (remover o vínculo mantendo a palavra) e trocar a ficha
   de destino, pelo mesmo menu.

### 6. Competência — gráficos de poder e tags especiais — verbatim

> Eu quero que você crie, do lado de Timeline, uma nova área sobre Competência, onde
> vou poder gerenciar alguns gráficos de poder e tags especiais sobre as capacidades
> de cada personagem. Esses gráficos vão ser mostrados na ficha do personagem da área
> de descrição. Quero ser capaz de renomear e escrever o que vai aparecer abaixo dos
> gráficos. Tipo a imagem que anexei. Em vez de inteligência, quero ser capaz de mudar
> esse nome a hora que quiser para outro tipo de nome ou manter o que já está mostrando.

(Imagem anexada: seis aros de rosca em fila — número no centro, rótulo em caixa alta
embaixo, trilho cinza — com DURABILIDADE 6, ENERGIA 5, HABILIDADES DE LUTA 3,
INTELIGÊNCIA 3, VELOCIDADE 3, FORÇA 2.)

Requisitos destilados:

1. **Nova aba "Competência", ao lado de Timeline**, para gerenciar os gráficos de poder
   de cada ficha.
2. **Gráficos de poder**: no estilo da imagem (aros de rosca com o número no centro e o
   nome em caixa alta embaixo), um por medida, com valor preenchível por ficha.
3. **Tags especiais** de capacidade (poderes, marcas, técnicas) — gerenciáveis na mesma
   área.
4. **Os gráficos aparecem na ficha**, na área de **Descrição**.
5. **Renomear os gráficos a qualquer momento** ("em vez de inteligência, quero mudar
   esse nome") — mantendo os valores já preenchidos no lugar.
6. **Escrever o que aparece abaixo dos gráficos** — texto livre embaixo da grade, além
   da anotação curta de cada gráfico individual.

### 7. Ligar fichas arrastando + catálogo de anexos editável — verbatim

> Certo, agora eu quero que me ajude a melhorar a anexação de personagens a outros.
> Quero ser capaz de clicar com o botão direito do mouse em uma esfera na área Árvore,
> gerar uma linha e arrastá-la até outra esfera de ficha e então selecionar o tipo de
> anexo, ligando ambas as partes. Assim fica mais fácil indicar quem é irmão, filho ou
> a que organização ele faz parte. Também gostaria de ser capaz de editar os anexos de
> relacionamento, para ser capaz de criar outros como "Amante de ...", "Cuncumbina
> de...", "Escravo de..." etc...

Requisitos destilados:

1. **Botão direito numa esfera** (na Árvore — e também na Rede, que é a mesma tela em
   outro layout) **inicia uma linha** que segue o mouse.
2. **Soltar a linha sobre outra ficha** abre a escolha do **tipo de anexo** e cria a
   ligação entre as duas partes.
3. **Editar os anexos de relacionamento**: mudar o tipo de uma ligação já existente.
4. **Criar tipos novos**, como "Amante de…", "Concumbina de…", "Escravo(a) de…" —
   ou seja, o catálogo de tipos é editável pelo usuário (não só código).

### 8. Universos separados + Biblioteca — verbatim

> Quero que cada pessoa que entre seja capaz de criar o seu próprio Codex (Universo),
> separando o mundo que cada pessoa cria; assim, as coisas ficam mais organizadas.

(Anexada: captura de outra aplicação — tela \"BIBLIOTECA / Seus universos\": eyebrow em
destaque, título grande, subtítulo \"Cada universo guarda personagens, locais, regras,
capítulos e memória.\", contador \"N universos\", botão \"+ Novo universo\", três cartões
atalho (\"Criar entidades\", \"Escrever capítulos\", \"Perguntar à IA\") e uma grade de
cartões de universo com etiquetas de gênero e prévia, mais um cartão tracejado \"Novo
universo\".)

Requisitos destilados:

1. **Cada pessoa cria o seu próprio universo** ao entrar, e cada universo é um mundo
   **separado** dos outros (fichas, pastas, relações, capítulos, timeline, competência
   e imagens) — \"as coisas ficam mais organizadas\".
2. Uma **Biblioteca** como tela de entrada, no estilo da captura: título, contador,
   botão de criar, atalhos e cards dos universos (com emoji, gênero e prévia).
3. Poder **criar, abrir/trocar, renomear, duplicar, exportar, importar e apagar**
   universos; a partir do segundo, trocar de universo é um clique.
4. Um universo novo pode **nascer vazio** ou **já com o universo de exemplo**.
5. Os dados que já existiam **não podem se perder** com a chegada dos universos (vira o
   universo \"legado\", sem cópia de dados).



- **Persistência local (IndexedDB via kv-plugin)**, sem backend: dados do usuário são
  privados por padrão; backup/portabilidade por JSON. O usuário não pediu colaboração
  em tempo real nem nuvem.
- **Um JSON só, com tudo dentro** (pedido do usuário): o backup principal leva fichas,
  pastas, relações, imagens **e também** os capítulos do livro, os eventos da timeline e
  os gráficos de competência (`payload.livro`, `payload.timeline`, `payload.competencia`).
  Importar restaura tudo de uma vez e os vínculos entre módulos são refeitos via o mapa
  de ids do import (anexo capítulo↔ficha, evento↔ficha, evento↔capítulo, gráficos↔ficha),
  tanto em "Substituir tudo" quanto em "Mesclar".
- **Direção importa nas relações**: "A é pai de B" ≠ "B é pai de A". Cada tipo tem
  frase direta (`f`) e inversa (`i`); tipos simétricos usam `sym`.
- **Nomes são a chave da IA**: o prompt recebe um catálogo de nomes existentes e a IA
  devolve pares por nome, que a app resolve para IDs (com `similarity`/`levenshtein`
  para tolerar pequenas diferenças de escrita). Isso é o "reconhecendo-os por nomes".
- **Árvore ≠ Rede**: a Rede é um grafo de forças com *todas* as relações; a Árvore usa
  apenas as relações de parentesco com `step` (pai/mãe/avô) para empilhar gerações.
- **Nada é aplicado pela IA sem revisão**: extrair/sugerir/enriquecer abrem um painel
  com propostas; o usuário aceita ou descarta item a item.
- **Tudo em pt-BR**, incluindo a persona da IA e os textos de interface.
- **Universo de exemplo** (15 fichas / 24 relações / 4 pastas) para o app não abrir
  vazio — carregado pelo botão ou pelo "Como usar".
- **Livro**: capítulos separados, cada um com seu próprio limite de 50.000 caracteres
  (em vez de um documento único), porque a divisão por capítulo é o que combina com
  "livro" e mantém o editor leve; um texto maior é dividido automaticamente na
  importação.
- **Corretor 100% local**: dicionário VERO pt-BR (hunspell em WebAssembly) rodando num
  Web Worker no navegador do usuário — nenhum texto sai do dispositivo, nada de
  dependência de serviço externo, e funciona offline depois do primeiro carregamento.
  Optamos por não "corrigir sozinho": só sublinhar/sugerir, como o Google Documentos.
- **Espelho invisível** para desenhar os sublinhados: ~~o sublinhado ondulado é do
  próprio navegador (`text-decoration: underline wavy`) sobre uma cópia invisível do
  texto~~ → **substituído na rodada 3**: com o editor rico o sublinhado passou a ser
  desenhado pela **CSS Custom Highlight API** (`::highlight(bk-miss)`), que dá o mesmo
  resultado visual sem tocar no DOM (cursor, seleção e desfazer intactos).
- **Editor rico com `contenteditable` + `document.execCommand`**, e não uma biblioteca
  (Quill/ProseMirror/TipTap): mantém o bundle mínimo, funciona offline e evita trazer
  um editor inteiro para um app que já pesa 1,4 MB de dicionário. O HTML é saneado numa
  allow-list antes de salvar (`book/richtext.js#sanitizeHtml`).
- **Imagens do capítulo fora do objeto do capítulo** (pasta kv `livro_img`, referência
  por `data-img`): sem isso cada capítulo com imagens inflaria a listagem e o backup.
  As imagens ainda assim vão no backup `.json` do livro.
- **Timeline derivada e explícita ao mesmo tempo**: o capítulo entra na cronologia pelo
  campo "Momento" (sem trabalho extra para o usuário) **e** existem eventos próprios
  com fichas ligadas. Ordenação por `parseSortKey` (número extraído do texto; "AC"/"antes"
  invertem o sinal; sem número vai para o fim) para a linha do tempo se ordenar sozinha.
- **Ficha do universo como "chip"**: no texto e nos cartões a ficha aparece como um
  `<button class="entChip" data-goto>`, resolvido por um listener delegado global — é o
  que faz "tudo conectado" funcionar em qualquer lugar sem código por tela.
- **Vínculo de palavra = link inline, não chip**: quando o usuário quer ligar uma
  palavra que já existe no texto ("o **rei**", "a **Ordem**"), trocar a palavra por um
  chip com ícone destruiria a frase. Então a forma padrão do vínculo é a própria
  palavra em azul. No Livro ela vira um `<span class="bkRef wordLink" data-ref>`
  (reaproveita toda a maquinaria dos chips: abrir ficha, "Mencionados", contagem de
  caracteres); em texto puro vira `[[palavra|Nome da ficha]]`, que o mesmo
  `renderRich` dos `[[Nome]]` já sabia desenhar. Uma primitiva
  (`src/ui/wordlink.js`) serve as quatro áreas — Livro, Timeline, descrição da ficha
  e campos longos — em vez de código por tela.
- **Competência = catálogo global + dados por ficha**: os gráficos (nome, cor, máximo,
  ícone) são um **catálogo único** que vale para todas as fichas, e cada ficha guarda
  **valores por id de gráfico**. É isso que torna "mudar o nome a qualquer momento"
  seguro: renomear "INTELIGÊNCIA" para "INSTINTO" renomeia em todas as fichas e
  **nenhum número sai do lugar** (a chave é o id, nunca o nome). A alternativa — nomes
  como chave, ou um conjunto de gráficos por ficha — faria a renomeação perder ou
  embaralhar valores.
- **A nota fica embaixo do gráfico, o texto fica embaixo da grade**: são dois campos
  separados (anotação curta por gráfico; "Texto abaixo dos gráficos" para o conjunto),
  ambos pedidos pelo usuário.
- **A competência vive dentro da Descrição da ficha** (e não numa seção própria da
  ficha): foi onde o usuário pediu, e o painel nasce junto do bloco de imagens da
  descrição, com um "✏️ Editar" que leva à aba Competência já naquela ficha.
- **Só aparece quando há o que mostrar**: o painel não polui a ficha sem dados, e há um
  interruptor "Na ficha" para esconder a grade de uma ficha específica sem apagar nada.
- **Universos = prefixo de pasta no kv, não um banco por universo**: cada universo tem
  um `prefix` (`u_<id>_`) e todo store pede a pasta por `kvFolder(nome)`. A alternativa
  (abrir um IndexedDB/kv por universo, ou limpar e recarregar os dados na troca) exigiria
  trocar de conexão em tempo de execução e arriscaria escrever no universo errado durante
  um autosave. Com prefixo, a troca é só **trocar o prefixo e recarregar a página** — e
  um universo que ficou para trás continua intacto no armazenamento.
- **O universo que já existia virou o "legado" (prefixo vazio), sem mover nada**: a
  migração só cria um registro apontando para as pastas antigas. Copiar dados de 6
  pastas na primeira abertura seria lento e poderia falhar no meio (dados órfãos ou
  duplicados); com prefixo vazio o risco é zero, e o usuário nem percebe a transição.
- **`_persist()` não chama `_apply()`**: trocar de universo no meio da sessão faria os
  stores em memória escreverem no universo errado no próximo autosave. Por isso a troca
  é sempre "grava o registro → recarrega a página", e a aba pedida viaja em
  `sessionStorage`.
- **Biblioteca como tela de entrada (e não um seletor no canto)**: o usuário pediu que
  "cada pessoa crie o seu próprio Codex" — a primeira coisa que se vê é a escolha do
  mundo, e os atalhos/contagens dão contexto de onde parou. Quando não há nenhum
  universo, o mesmo overlay vira a tela de boas-vindas (criar do zero ou começar pelo
  exemplo).
- **Exportar universo é diferente de exportar backup**: o backup principal ("Arquivo,
  backup e preferências") leva o universo inteiro em formato pensado para restauração do
  app inteiro; a exportação da Biblioteca é um arquivo **por universo**
  (`kind: "codex-universe"`), que dá para guardar, mandar para outra pessoa ou
  reimportar como um universo novo.

### 9. Nomes visíveis "Codex" — verbatim

> Quero que mude o nome "Seus universos" para "Seus Codexs" O mesmo vale para "Novo
> universo" para "Novo Codex" troque as palavras na parte inicial para Codex.

Requisitos destilados:

1. **A Biblioteca (a "parte inicial") fala em Codex**: título "Seus Codexs", botão
   "＋ Novo Codex", card tracejado "Novo Codex", contador "N Codexs", subtítulo/rodapé e
   estado vazio idem.
2. **Os fluxos também**: criar/editar ("Nome do Codex", "🌍 Novo Codex", "Criar Codex"),
   duplicar, apagar, exportar/importar e os toasts.
3. **Só a camada visível muda.** Identificadores internos (`universes`,
   `UNIVERSE_FOLDERS`, pasta kv `codex_universos`, `prefix`, ids `uni_…`) e os nomes de
   dados já salvos ficam como estão — o universo legado continua "Meu universo".
4. "Universo" segue válido onde significa o **mundo ficcional**: tipo de ficha
   `universo`, prompts da IA, "carregar o universo de exemplo".

### 10. Página "Apresentação" + resumo de 2000 caracteres — verbatim

> Quero que você aumente a quantidade de caracteres na área "Sobre o que é este mundo?"
> para 2000 caracteres. Além disso, quero que você crie, do lado esquerdo de fichas, uma
> nova página chamada "Apresentação", onde você vai criar algo parecido com o da imagem
> que vou anexar. Quero que a imagem colocada nessa página seja vista na miniatura do
> codex, na página de criação do codex.

Requisitos destilados:

1. O campo **"Sobre o que é este mundo?"** (o `resumo` do Codex) aceita **2.000
   caracteres** (antes 600) — `#ufAbout` com `maxlength="2000"` e o contador/limite
   mostrando o novo teto.
2. **Aba nova "Apresentação"** como a **primeira** aba (à esquerda de "Fichas"),
   no estilo da imagem de referência do usuário: cabeçalho (emoji + nome, chips de
   gênero, datas), o texto "Sobre o que é este mundo?" em modo leitura, uma **capa
   panorâmica**, o interruptor da IA, a caixa **"O que você quer saber?"** (pergunta
   livre respondida pela IA) e a **grade de estatísticas** do Codex (uma por tipo de
   ficha + Capítulos / Relações / Timeline, cada uma clicável).
3. A **imagem da capa** colocada na Apresentação é a **miniatura do card** do Codex na
   **Biblioteca** (a "página de criação do codex"): o `universeCardHtml` passa a mostrar
   a capa no lugar do gradiente quando ela existe.
4. A capa é guardada junto do Codex (chave `cover` na pasta `codex` daquele universo),
   com **trocar/remover**, upload do dispositivo, link, geração por IA e zoom em tela
   cheia — e entra na duplicação do Codex.

### 11. Ver o que eu alterei, sem poder modificar — verbatim

> Quero que as pessoas sejam capazes de ver o que eu alterei no meu site sem que elas
> sejam capazes de modificar nada.

Requisitos destilados:

1. **Publicar um link de leitura**: o autor gera, em um clique, um link que mostra o
   Codex **como ele está agora** — fichas, pastas, relações, Rede, Árvore, Livro,
   Timeline, Competência e capa.
2. **Quem abre o link não pode alterar nada**: nenhum botão/atalho/campo de escrita
   funciona para o visitante (nem por engano), e o visitante **não** escreve nos dados
   do autor nem nos dele.
3. **O autor continua dono das mudanças**: editar depois e **publicar de novo** faz o
   mesmo link mostrar a versão nova; **despublicar** desliga o link.
4. Vale só para quem tem o link (não é uma vitrine pública automática, não há
   listagem/busca de Codexs publicados).

### 12. Tirar os botões de interação com a IA — verbatim

> Quero que tire os botões de interação com a IA do meu site.

(veio logo depois de um pedido com duas capturas de tela — a pílula `✨ IA` da barra de
topo e o painel "Usar inteligência neste Codex" com a caixa "O que você quer saber?" —
apontando os três elementos para remoção)

Requisitos destilados:

1. **Nenhum controle de IA na interface**: saem da tela o `✨ IA` do topo e o `✨ IA` da
   ficha, as ações de IA dos menus (ficha, cartão, imagem, miniaturas, capa, Biblioteca),
   o "Extrair de um texto" dos estados vazios e da busca, e o bloco da Apresentação
   (interruptor "Usar inteligência neste Codex", caixa "O que você quer saber?" e o
   painel de resposta).
2. **A camada de IA continua no código** (`src/ai.js`, `src/ui/aipanels.js` e os imports
   de plugin do `main.pjs`): nada foi apagado, só ficou sem ponto de entrada — para
   religar, ver a seção "IA fora da interface (rodada 14)" do `README.md`.
3. **O resto do app não muda**: fichas, pastas, Rede, Árvore, Livro, Timeline,
   Competência, Biblioteca e o modo somente leitura seguem iguais.

### 13. Esconder a barra do Perchance para quem abre o link — verbatim

> Quero que deixe a barra do editor do perchance oculta para as pessoas que acessarem o
> link de visualização das publicações.

Requisitos destilados:

1. **A barra de menu do Perchance (home/forum/save/edit) não aparece** na página
   publicada — nem para o autor vendo a própria página, nem para quem recebe o link
   de leitura. Feito com `$meta.header mode = minimal` (o mecanismo oficial da
   plataforma, `main.pjs`); o Perchance deixa um botãozinho flutuante no canto superior
   direito para reabrir a barra, e no **modo de edição a barra continua aparecendo**.
2. **Nenhum controle do app fica debaixo desse botãozinho**: o `.topActions` do modo
   somente leitura ganha um respiro à direita (`src/style.css`).
3. O resto do layout não muda (o app ganha a altura que a barra ocupava).

### 14. Caixas de imagem: faixa em cima da foto, renomeáveis — verbatim

> Analise a imagem anexada e execute as atualizações referentes as caixas vermelhas aos
> textos vermelhos, que explicam e mostram o que deve ser modificado.

A imagem trazia duas anotações vermelhas:
- um retângulo em volta da grade de caixas de imagem (Retrato, Corpo inteiro, …,
  "＋ imagem"), com o texto *"Coloque essas caixas no lugar onde a seta esta apontando.
  Também quero ser capaz de renomear cada caixa e que elas estejam conectadas com a seta
  preta"*;
- um círculo em volta de uma tira de abas (exemplo: "Foto 1 | Foto 2 | Foto 3 | ＋"), com
  *"Quero isso, mas deixe um pouco transparente."*

Requisitos destilados:

1. **As caixas saem de baixo da foto e viram uma faixa em cima dela**: uma tira
   horizontal, semitransparente (fundo translúcido + blur), que rola de lado quando não
   cabe (também com o dedo/scroll).
2. **Cada caixa é renomeável**, cheia ou vazia ("Renomear caixa" no ⋯ de qualquer caixa,
   `src/ui/media.js`), e o nome fica salvo na ficha (`entity.boxes`, `setEntityBoxes` no
   `src/store.js`) — renomear uma caixa cheia renomeia a imagem junto, para ela não
   escapar para outra caixa.
3. **As caixas ficam ligadas às setas ‹ ›**, que ficam nas pontas da fileira de botões da
   foto (sempre visíveis quando há mais de uma caixa): cada toque anda uma caixa, rola a
   faixa até ela e, se a caixa tiver imagem, troca a foto exibida.

### 15. As caixas de imagem descem para baixo da foto — verbatim

> Certo, ficou muito bom, mas esses anexos de imagem que estão a cima do tretato, coloque
> eles para baixo da imagem.

Requisitos destilados:

1. **A faixa de caixas de imagem fica logo ABAIXO da foto** (era em cima dela, ver
   pedido 14) — tanto na ficha em modo leitura quanto no editor e no celular. Só a
   posição mudou: a faixa continua horizontal, semitransparente, com rolagem lateral, o
   ⋯ de cada caixa e o tile "＋ imagem" no fim.
2. **Nada mais muda**: os botões ‹ ＋ 🔍 ✕ › sobre a foto (e o pager das caixas), o
   rótulo do tipo no canto da foto, o arrastar-e-soltar e as imagens da descrição
   seguem iguais.

### 16. Tags de Competência no cabeçalho da ficha — verbatim

> Quero que as tags de competencia sejam capazes de aparecer na área que eu coloquei a
> caixa vermelha na imagem anexada.

(A imagem era uma captura da ficha com um retângulo vermelho desenhado no espaço vazio do
cabeçalho, logo **abaixo da fileira de botões** Editar / Relação / Ver na rede / ★ / ⋯.)

Requisitos destilados:

1. **As tags especiais de Competência aparecem nessa área**: um bloco logo abaixo dos
   botões de ação do cabeçalho da ficha (`heroTagBlockHtml`, `src/competencia/render.js`),
   com uma etiqueta discreta "⚡ Competência" e os chips das tags — e a lista de anotações
   das tags que tiverem uma.

   > **Substituído pelo pedido 18**: a área do cabeçalho passou a mostrar **só as
   > Condecorações** (outra família de etiquetas, criada no pedido 18) e o título virou
   > "🎖 Condecorações". As tags especiais continuam no painel da Descrição.
2. **"Capazes de aparecer"** = o mesmo interruptor de sempre governa: o bloco só sai
   quando a ficha **tem tags** e a Competência está marcada para aparecer na ficha (o
   "Na ficha" da aba ⚡ Competência, que continua controlando também o painel da
   Descrição). Ficha sem tags não ganha caixa vazia.
3. **Nada mais muda**: os aros continuam na Descrição, e as tags continuam aparecendo lá
   dentro do painel da Descrição como antes.

### 17. Quem recebe o link pode folhear as imagens — verbatim

> Quero que as pessoas que acessem o link de publicação, consigam usar as setas para
> passar as imagens. Ou que sejam capazes de visualizar as imagens nas miniaturas.

Requisitos destilados:

1. **No Codex publicado, as setas ‹ › da foto funcionam para quem só lê**: cada toque
   passa para a imagem seguinte (dá a volta no fim) e a etiqueta do canto da foto
   acompanha.
2. **As miniaturas aparecem**: embaixo da foto fica uma miniatura por imagem da ficha
   (na ordem das caixas do autor; as imagens que não caíram em caixa nenhuma entram no
   fim), e **clicar numa miniatura exibe aquela imagem**. As caixas vazias do autor e o
   tile "＋ imagem" não aparecem para quem lê.
3. **O 🔍 continua abrindo a imagem inteira** — com as setas ‹ › e a tira de miniaturas
   próprias do visualizador.
4. **Ler não é escrever**: folhear imagens não altera o instantâneo publicado (nem o
   retrato "oficial" da ficha, que continua sendo o que o autor escolheu) e os controles
   que escrevem (＋, ✕, ⋯, arrastar-e-soltar) não existem nesse modo.

### 18. Tags de Condecoração: outra família de etiquetas, só elas no cabeçalho — verbatim

> Na área de compétencias, quero que crie outro tipo de tags, chamas de Tags de
> Condecoração, essas tags de condecoração vão ser as únicas que vão aparecer naquela
> área que você criou. Também mude o nome dessa área para Condecorações, apenas tags de
> Condecorações vão aparecer ai.

(A imagem anexada era só um recorte da área criada no pedido 16 — "⚡ Competência" e o
chip "Guardiã rank B" —, sem anotação.)

Requisitos destilados:

1. **Existe uma segunda família de etiquetas, as Condecorações**, criada e editada na
   mesma aba ⚡ Competência, no bloco **Condecorações** (ao lado do bloco "Tags
   especiais"): mesmo formulário (nome, ícone, cor, texto embaixo e sugestões do que já
   foi usado no Codex), mesma mecânica de editar/remover, cor padrão dourada.
2. **Só as condecorações aparecem na área do cabeçalho**, que passa a se chamar
   **🎖 Condecorações**. As Tags especiais continuam existindo e aparecem apenas no
   painel da Descrição — não no cabeçalho.
3. **Continua valendo o interruptor "Na ficha"**: sem condecorações (ou com a
   Competência oculta na ficha) a área simplesmente não aparece — nada de caixa vazia.
4. As condecorações entram no backup/importação, na cópia de ficha, na contagem da lista
   de fichas e no export em texto, como as tags.

### 19. Backup total em ZIP — verbatim

> Também quero ser capaz de gerar backups zipados e usar os que o proprio site perchance
> me permite baixar diretamente no meu site. Quero que coloque outro botão de importar e
> exportar esse tipo de arquivo. Assim posso atualizar o site caso ele perca arquivos.

Requisitos destilados:

1. **Botão novo de exportar ZIP** ao lado do importar/exportar JSON: na Biblioteca
   ("📦 ZIP total" no topo + "📦 Exportar ZIP" no ⋯ de cada Codex) e em Arquivo, backup
   e preferências ("📦 Baixar ZIP total").
2. **ZIP total = todos os Codexs de uma vez**: um `.json` por Codex (o mesmo
   `kind: "codex-universe"` do exportar JSON) + `backup.json` (manifesto). Serve para
   guardar cópia e **recuperar tudo se o navegador perder os dados**.
3. **Importar aceita `.zip` e `.json`**: o ZIP total cria um Codex novo por `.json`
   interno; o JSON único continua criando um Codex novo como antes. ZIP com `main.pjs` /
   `index.html` / `src/` (código do site) **não** entra por aqui: ele é recusado com um
   aviso apontando para a seção **Código do site** (item 5).
4. Implementação em `src/backupZip.js` (JSZip via CDN, `exportFullZip` /
   `exportSingleZip` / `importBackupFile`), usado por `src/ui/universes.js` e
   `src/ui/settings.js`.
5. **Código do site (.zip)** (`src/codeBackup.js`, seção no painel Arquivo): importa e
   exporta o **mesmo formato que o Perchance deixa baixar** (`main.pjs` + `index.html` +
   `src/`, como o anexo `Atual_-_….zip`). Exportar lê o `main.pjs`/`index.html` salvos
   (APIs `getGeneratorsAndDependencies` e `getGeneratorHtml`, a segunda via
   `super-fetch-plugin`, que entrou no `main.pjs` por isso) e os arquivos `src/` ao vivo;
   o que não carregar entra na lista de faltantes. Importar valida a estrutura, mostra
   título/tamanho, **compara cada arquivo com o site atual** (iguais, diferentes, só no
   ZIP, e os que o site não conseguiu carregar — o caso "perdeu arquivos") e **guarda a
   cópia neste navegador** (pasta kv `codex_sitebackups`, até 3, com baixar/apagar).
   Aplicar o código é no editor do Perchance (extrair + salvar) — o modal diz isso; o
   site em execução não troca o próprio código.

## Fora de escopo (até agora)

- Multiplayer / edição colaborativa.
- Sincronização entre dispositivos (só via exportar/importar JSON).
- Upload de imagens para servidor (imagens ficam locais no IndexedDB) — **exceto** no
  instantâneo publicado (ver pedido 11), onde as imagens viajam dentro do próprio
  arquivo publicado.
- Listagem/busca pública de Codexs publicados; comentários no Codex publicado.
