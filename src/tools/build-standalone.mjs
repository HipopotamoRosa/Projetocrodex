/*
 * Gera um index.html AUTÔNOMO (arquivo único, tudo embutido) a partir de
 * index.html + src/style.css + src/**.js + o shim de armazenamento.
 *
 * Não é usado pelo gerador publicado — é a receita reproduzível do arquivo
 * distribuível. Rode-o no ambiente do agente (worker com o fs do workspace):
 *
 *   const src = await fs.readTextFile("src/tools/build-standalone.mjs");
 *   const res = await new Function("fs", "return (async () => {" + src + "\n})()")(fs);
 *
 * Saída: scratch/standalone/index.html (entregue ao usuário com attach_file).
 * Precisa de esbuild-wasm (esm.sh) para empacotar os módulos ES num só script.
 */

const css = await fs.readTextFile("src/style.css");
const rawHtml = await fs.readTextFile("index.html");
const shim = await fs.readTextFile("src/tools/standalone-storage-shim.js");

const esm = await import("https://esm.sh/esbuild-wasm@0.21.5?bundle");
const esbuild = esm.default || esm;
await esbuild.initialize({ wasmURL: "https://esm.sh/esbuild-wasm@0.21.5/esbuild.wasm" });

function resolveRel(importer, p) {
  const base = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  const parts = (base ? base + "/" + p : p).split("/");
  const out = [];
  for (const seg of parts) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  let r = out.join("/");
  if (!/\.[a-z0-9]+$/i.test(r)) r += ".js";
  return r;
}

const result = await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  charset: "utf8",
  logLevel: "silent",
  plugins: [
    {
      name: "workspace",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (!args.importer) return { path: args.path, namespace: "wk" };
          if (args.path.startsWith(".")) return { path: resolveRel(args.importer, args.path), namespace: "wk" };
          return { path: args.path, external: true };
        });
        b.onLoad({ filter: /.*/, namespace: "wk" }, async (args) => ({
          contents: await fs.readTextFile(args.path),
          loader: "js",
        }));
      },
    },
  ],
});
const js = result.outputFiles[0].text;

let body = rawHtml
  .replace(/^<link rel="stylesheet" href="src\/style\.css">\n/, "")
  .replace(/<script type="module" src="src\/main\.js"><\/script>\n?/, "")
  .trim();

const safe = (s) => s.replace(/<\/(script|style)/gi, "<\\/$1");

const out = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Codex — Organizador de Personagens, Mundos e Relações</title>
<meta name="description" content="Crie fichas de personagens, organizações, lugares e itens com imagem, descrição e campos personalizados, organize tudo em pastas infinitas e deixe a IA reconhecer os nomes e tecer a rede de relações (família, amigos, inimigos, hierarquias) entre eles.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>&#10022;</text></svg>">
<style>
${safe(css)}
</style>
</head>
<body>
${body}

<script>
${safe(shim)}
</script>
<script>
${safe(js)}
</script>
</body>
</html>
`;

await fs.writeTextFile("scratch/standalone/index.html", out);

return {
  bytes: out.length,
  jsBytes: js.length,
  cssBytes: css.length,
  shimBytes: shim.length,
  warnings: (result.warnings || []).map((w) => w.text),
};
