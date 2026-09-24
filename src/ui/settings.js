import { store } from "../store.js";
import { universes } from "../universe.js";
import { VIEW, shareFor, publicar, despublicar, shareUrl } from "../view.js";
import { state, setUI, savePrefs } from "./state.js";
import { q, el, openModal, toast, confirmDialog } from "./dom.js";
import { esc, download, copyText } from "../util.js";
import { book } from "../book/store.js";
import { timeline } from "../timeline/store.js";
import { competencia } from "../competencia/store.js";
import { exportCodeZip, readCodeZip, diffCodeZip, refreshSiteBackupList, openCodeImportSummary } from "../codeBackup.js";

export function openDataPanel() {
  const stats = store.stats();
  const types = store.types();
  const rows = types.map((t) => `<div class="statRow"><span class="statIcon" style="color:${esc(t.color)}">${esc(t.icon)}</span><span class="statName">${esc(t.l)}</span><span class="statNum">${stats.byType[t.id] || 0}</span></div>`).join("");
  const bstats = book.stats();
  const extraRows = [
    `<div class="statRow"><span class="statIcon">📖</span><span class="statName">Capítulos do livro</span><span class="statNum">${bstats.chapters}</span></div>`,
    `<div class="statRow"><span class="statIcon">⏳</span><span class="statName">Eventos da timeline</span><span class="statNum">${timeline.list().length}</span></div>`,
    `<div class="statRow"><span class="statIcon">⚡</span><span class="statName">Fichas com competência</span><span class="statNum">${competencia.data.size}</span></div>`,
  ].join("");
  const body = el(`<div class="settingsPanel">
    <section class="setSection">
      <h4>Seu arquivo</h4>
      <div class="statGrid">${rows}</div>
      <div class="setRow"><span>Total</span><strong>${stats.entities} fichas · ${stats.relations} conexões · ${stats.folders} pastas</strong></div>
      <div class="statGrid" style="margin-top:10px">${extraRows}</div>
      <div class="setRow"><span>Palavras escritas</span><strong>${bstats.words.toLocaleString("pt-BR")}</strong></div>
    </section>
    <section class="setSection">
      <h4>Backup e exportação</h4>
      <p class="fieldHint">Tudo fica salvo neste navegador (IndexedDB). Exporte um JSON de vez em quando para não perder o arquivo. O JSON leva <strong>tudo</strong>: fichas, pastas, conexões, capítulos do livro, eventos da timeline e gráficos de competência.</p>
      <div class="btnRow">
        <button class="btn primary" id="exportAllBtn">⬇ Baixar JSON (com imagens)</button>
        <button class="btn" id="exportLightBtn">⬇ JSON sem imagens</button>
        <button class="btn" id="copyJsonBtn">⧉ Copiar JSON</button>
      </div>
      <p class="fieldHint">Backup total em <strong>ZIP</strong>: leva <strong>todos os Codexs de uma vez</strong>. Se o navegador perder os dados, importe o ZIP de volta para recuperar tudo.</p>
      <div class="btnRow">
        <button class="btn primary" id="exportZipBtn">📦 Baixar ZIP total</button>
        <label class="btn" for="importZipInput">📂 Importar ZIP / JSON</label>
        <input type="file" id="importZipInput" accept=".zip,.json,application/json,application/zip" hidden>
      </div>
    </section>
        <section class="setSection" id="githubSection">
      <h4>🐙 GitHub — salvar o site</h4>
      <p class="fieldHint">Envia o código do site (main.pjs + index.html + src/) direto para um repositório seu no GitHub. O conteúdo dos seus Codexs (fichas, livro, timeline) continua no navegador — isto aqui versiona o <strong>site</strong>, não os dados.</p>
      <div class="setRow"><span>Status</span><strong id="ghStatus">—</strong></div>
      <div class="field"><label class="fieldLabel">Repositório (dono/repo)</label>
        <input class="input code" id="ghRepo" placeholder="seu-usuario/meu-codex" autocomplete="off" spellcheck="false">
      </div>
      <div class="field"><label class="fieldLabel">Branch</label>
        <input class="input code" id="ghBranch" placeholder="main" autocomplete="off" spellcheck="false">
        <p class="fieldHint">Geralmente <code>main</code>. O branch precisa já existir no repositório.</p>
      </div>
      <div class="field"><label class="fieldLabel">Token (classic, com escopo repo)</label>
        <input class="input code" id="ghToken" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
        <p class="fieldHint">Crie em GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) com escopo <code>repo</code>. O token fica guardado só neste navegador. <button class="linkBtn" id="ghHelpBtn" type="button">Como criar</button></p>
      </div>
      <div class="btnRow">
        <button class="btn" id="ghTestBtn">🔍 Testar conexão</button>
        <button class="btn primary" id="ghPushBtn">⬆ Enviar site ao GitHub</button>
        <button class="btn danger" id="ghForgetBtn">Apagar token</button>
      </div>
      <div class="btnRow" id="ghProgressRow" hidden><span class="fieldHint" id="ghProgress">—</span></div>
      <p class="fieldHint" id="ghHint"></p>
    </section>

<section class="setSection">
      <h4>Importar</h4>
      <div class="btnRow">
        <label class="btn" for="importFileInput">📂 Escolher arquivo JSON</label>
        <input type="file" id="importFileInput" accept="application/json,.json" hidden>
        <select class="miniSelect" id="importMode"><option value="merge">Mesclar com o que já existe</option><option value="replace">Substituir tudo</option></select>
      </div>
      <textarea class="input code" rows="3" id="importPaste" placeholder="…ou cole aqui o conteúdo de um JSON exportado"></textarea>
      <div class="btnRow"><button class="btn" id="importPasteBtn">Importar texto colado</button></div>
    </section>
    <section class="setSection">
      <h4>Código do site (.zip)</h4>
      <p class="fieldHint">O mesmo formato que o Perchance deixa baixar: <strong>main.pjs + index.html + src/</strong>. Baixe para guardar o código atual; importe um ZIP desse tipo para conferir o que mudou e guardar uma cópia neste navegador.</p>
      <div class="btnRow">
        <button class="btn primary" id="exportSiteBtn">📦 Baixar código (.zip)</button>
        <label class="btn" for="importSiteInput">📂 Importar código (.zip)</label>
        <input type="file" id="importSiteInput" accept=".zip,application/zip" hidden>
      </div>
      <div class="btnRow">
        <button class="btn" id="exportHtmlBtn">📄 Baixar index.html</button>
        <label class="btn" for="importHtmlInput">📄 Importar index.html</label>
        <input type="file" id="importHtmlInput" accept=".html,.htm,text/html" hidden>
      </div>
      <div id="siteBackupList"></div>
    </section>
    <section class="setSection">
      <h4>Exemplo</h4>
      <p class="fieldHint">Quer ver como tudo funciona junto? Carregue o universo de exemplo (Casa Valen, a Ordem do Sol Nascente, Lorde Malvek…) com pastas, fichas e relações prontas para explorar.</p>
      <div class="btnRow"><button class="btn" id="loadSampleBtn">🌱 Carregar universo de exemplo</button></div>
    </section>
    <section class="setSection" id="pubSection">
      <h4>👁️ Publicar para leitura</h4>
      <p class="fieldHint">Gera um link que mostra este Codex <strong>como ele está agora</strong> — e quem abrir só pode <strong>ler</strong>: fichas, pastas, relações, livro, timeline, competência e capa. Ninguém consegue alterar nada por esse link (nem você). Publique de novo para atualizar o que os outros veem.</p>
      <div class="setRow"><span>Estado</span><strong id="pubState">—</strong></div>
      <div class="btnRow"><input class="input code" id="pubUrl" readonly hidden></div>
      <div class="btnRow">
        <button class="btn primary" id="pubBtn">🌐 Publicar / atualizar</button>
        <button class="btn" id="pubCopyBtn">⧉ Copiar link</button>
        <button class="btn" id="pubOpenBtn">↗ Abrir o link</button>
        <button class="btn danger" id="pubOffBtn">✖ Despublicar</button>
      </div>
      <p class="fieldHint" id="pubHint"></p>
    </section>
    <section class="setSection">
      <h4>Preferências</h4>
      <div class="setRow"><span>Tema</span>
        <select class="miniSelect" id="themeSelect">
          <option value="dark" ${state.theme === "dark" ? "selected" : ""}>Escuro</option>
          <option value="light" ${state.theme === "light" ? "selected" : ""}>Claro</option>
        </select></div>
      <div class="setRow"><span>Destacar menções de nomes nas descrições</span>
        <label class="switch"><input type="checkbox" id="mentionToggle" ${state.mentionHighlight ? "checked" : ""}><span></span></label></div>
      <p class="fieldHint">Use <code>[[Nome]]</code> na descrição para criar um vínculo clicável com outra ficha. Nomes de fichas existentes também são destacados automaticamente.</p>
    </section>
    <section class="setSection danger">
      <h4>Zona de perigo</h4>
      <p class="fieldHint">Apaga fichas, pastas, conexões, imagens, capítulos do livro, eventos da timeline e os gráficos de competência deste navegador.</p>
      <div class="btnRow"><button class="btn danger" id="wipeBtn">🗑 Apagar tudo</button></div>
    </section>
  </div>`);
  const m = openModal({ title: "📥 Arquivo, backup e preferências", size: "lg", body });
  const buildPayload = async (withImages) => {
    book.flush();
    timeline.flush();
    competencia.flush();
    const payload = await store.exportAll({ withImages });
    payload.livro = await book.exportAll({ withImages });
    payload.timeline = timeline.exportAll();
    payload.competencia = competencia.exportAll();
    return payload;
  };
  const doExport = async (withImages) => {
    const payload = await buildPayload(withImages);
    const text = JSON.stringify(payload);
    const ok = download(`codex-${(window.generatorName || "arquivo")}-${new Date().toISOString().slice(0, 10)}.json`, text);
    if (!ok) { await copyText(text); toast("Download bloqueado — o JSON foi copiado para a área de transferência", "info", 5000); }
    else toast("Backup exportado", "success");
  };
  q("#loadSampleBtn", body).onclick = () => window.dispatchEvent(new CustomEvent("codex:load-sample"));
  q("#exportAllBtn", body).onclick = () => doExport(true);
  q("#exportZipBtn", body).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Montando o ZIP…";
    try {
      const { exportFullZip } = await import("../backupZip.js");
      const res = await exportFullZip();
      toast(res.count === 1 ? "ZIP total baixado (1 Codex)" : "ZIP total baixado (" + res.count + " Codexs)", "success", 4000);
    } catch (err) {
      toast("Não consegui exportar: " + err.message, "error", 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  q("#importZipInput", body).onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const isZip = /\.zip$/i.test(file.name || "");
    if (!isZip) {
      const text = await file.text();
      await runImport(text, true);
      return;
    }
    try {
      toast("Lendo o ZIP…", "info", 2600);
      const { importBackupFile } = await import("../backupZip.js");
      const list = await importBackupFile(file);
      m.close();
      toast(list.length === 1 ? "Codex “" + list[0].nome + "” importado como novo" : list.length + " Codexs importados do ZIP", "success", 5000);
    } catch (err) {
      if (err && err.code === "SITE_CODE") {
        try {
          toast("É código do site — abrindo no importador de código…", "info", 2600);
          const bundle = await readCodeZip(file);
          bundle.diff = await diffCodeZip(bundle.files);
          openCodeImportSummary(bundle, file, body);
          return;
        } catch (err2) {
          toast("Não consegui importar: " + (err2 && err2.message ? err2.message : "arquivo inválido"), "error", 6000);
          return;
        }
      }
      toast("Não consegui importar: " + (err && err.message ? err.message : "arquivo inválido"), "error", 6000);
    }
  };
  q("#exportLightBtn", body).onclick = () => doExport(false);
  q("#copyJsonBtn", body).onclick = async () => {
    const payload = await buildPayload(true);
    await copyText(JSON.stringify(payload));
    toast("JSON copiado", "success");
  };
  const runImport = async (text, fromFile) => {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      toast("JSON inválido", "error");
      return;
    }
    const mode = q("#importMode", body).value;
    if (mode === "replace") {
      const ok = await confirmDialog({ title: "Substituir o arquivo atual?", message: "Todas as fichas, pastas, conexões, capítulos do livro, eventos da timeline e gráficos de competência atuais serão apagados e substituídos pelos do arquivo importado.", confirmLabel: "Substituir", danger: true });
      if (!ok) return;
    }
    try {
      const result = await store.importAll(payload, mode);
      const entMap = result.idMap || new Map();
      let livro = { chapters: [], idMap: new Map() };
      if (payload.livro || payload.book) {
        try { livro = await book.importAll(payload.livro || payload.book, mode, entMap); }
        catch (err) { console.error("Falha ao importar o livro", err); }
      }
      let evtCount = 0;
      if (payload.timeline) {
        try { evtCount = timeline.importAll(payload.timeline, mode, entMap, livro.idMap).length; }
        catch (err) { console.error("Falha ao importar a timeline", err); }
      }
      if (payload.competencia) {
        try { competencia.importAll(payload.competencia, mode, entMap); }
        catch (err) { console.error("Falha ao importar a competência", err); }
      }
      await book.flush();
      await timeline.flush();
      m.close();
      toast(`${result.entities} fichas · ${result.relations} conexões · ${livro.chapters.length} capítulos · ${evtCount} eventos importados`, "success");
      window.dispatchEvent(new CustomEvent("codex:data-changed"));
      const selfId = state.entityId ? (entMap.get(state.entityId) || state.entityId) : null;
      if (selfId && store.entities.has(selfId)) window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: selfId } }));
      else setUI({ entityId: null, folderId: null });
    } catch (err) {
      console.error(err);
      toast(err.message || "Falha ao importar", "error");
    }
  };
  q("#importFileInput", body).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await runImport(text, true);
  };
  q("#importPasteBtn", body).onclick = () => runImport(q("#importPaste", body).value, false);
  q("#exportSiteBtn", body).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Montando o ZIP…";
    try {
      const res = await exportCodeZip();
      toast(res.missing.length ? "Código baixado (" + res.count + " arquivos, " + res.missing.length + " falharam)" : "Código baixado (" + res.count + " arquivos)", res.missing.length ? "info" : "success", 5000);
    } catch (err) {
      toast("Não consegui exportar: " + err.message, "error", 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  q("#importSiteInput", body).onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      toast("Lendo o ZIP…", "info", 2600);
      const bundle = await readCodeZip(file);
      toast("Comparando com o site atual…", "info", 2600);
      bundle.diff = await diffCodeZip(bundle.files);
      openCodeImportSummary(bundle, file, body);
    } catch (err) {
      toast("Não consegui importar: " + (err && err.message ? err.message : "arquivo inválido"), "error", 6000);
    }
  };
  q("#exportHtmlBtn", body).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Baixando…";
    try {
      const { exportIndexHtml } = await import("../codeBackup.js");
      await exportIndexHtml();
      toast("index.html baixado", "success", 4000);
    } catch (err) {
      toast("Não consegui exportar: " + (err && err.message ? err.message : "falha"), "error", 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  q("#importHtmlInput", body).onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (!text || !text.trim()) throw new Error("arquivo vazio");
      const { openIndexHtmlSummary } = await import("../codeBackup.js");
      openIndexHtmlSummary(file.name || "index.html", text, body);
    } catch (err) {
      toast("Não consegui importar: " + (err && err.message ? err.message : "arquivo inválido"), "error", 6000);
    }
  };
  refreshSiteBackupList(body);
    try { initGithubSection(body); } catch (err) { console.error(err); }
  async function initGithubSection(root) {
    const mod = await import("../github.js");
    const statusEl = q("#ghStatus", root);
    const repoInput = q("#ghRepo", root);
    const branchInput = q("#ghBranch", root);
    const tokenInput = q("#ghToken", root);
    const hintEl = q("#ghHint", root);
    const testBtn = q("#ghTestBtn", root);
    const pushBtn = q("#ghPushBtn", root);
    const forgetBtn = q("#ghForgetBtn", root);
    const progRow = q("#ghProgressRow", root);
    const progEl = q("#ghProgress", root);
    const helpBtn = q("#ghHelpBtn", root);
    if (helpBtn) helpBtn.onclick = () => openGithubHelp();
    const showErr = (msg) => {
      const m = String(msg || "Falha");
      console.error("[github]", m);
      toast(m, "error", 12000);
      if (hintEl) hintEl.textContent = "\u26a0 " + m;
    };
    const parseRepo = (raw) => {
      const t = String(raw || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
      const parts = t.split("/").filter(Boolean);
      if (parts.length < 2) return {};
      return { owner: parts[0], repo: parts[1] };
    };
    const render = async () => {
      let cfg;
      try { cfg = await mod.getGithubCfg(); } catch (e) { return; }
      if (repoInput && document.activeElement !== repoInput) repoInput.value = cfg.owner && cfg.repo ? cfg.owner + "/" + cfg.repo : (repoInput.value || "");
      if (branchInput && document.activeElement !== branchInput) branchInput.value = cfg.branch || "main";
      if (statusEl) {
        if (cfg.owner && cfg.repo && cfg.token) statusEl.textContent = "pronto para enviar (" + cfg.owner + "/" + cfg.repo + ")";
        else if (cfg.owner && cfg.repo) statusEl.textContent = "falta o token";
        else statusEl.textContent = "não configurado";
      }
      if (hintEl) {
        if (cfg.lastPush) {
          const q2 = new Date(cfg.lastPush).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
          hintEl.textContent = "\u00daltimo envio: " + q2 + " (" + (cfg.lastOk || 0) + " de " + (cfg.lastFiles || 0) + " arquivos).";
        } else hintEl.textContent = "O primeiro envio cria os arquivos no repositório. Os próximos atualizam os mesmos arquivos.";
      }
    };
    const readForm = async () => {
      const pr = parseRepo(repoInput.value);
      const cfg = await mod.setGithubCfg({
        owner: pr.owner || "",
        repo: pr.repo || "",
        branch: (branchInput.value || "main").trim() || "main",
        token: (tokenInput.value || "").trim() || (await mod.getGithubCfg()).token || "",
      });
      return cfg;
    };
    if (repoInput) repoInput.onchange = async () => { const pr = parseRepo(repoInput.value); await mod.setGithubCfg({ owner: pr.owner || "", repo: pr.repo || "" }); render(); };
    if (branchInput) branchInput.onchange = async () => { await mod.setGithubCfg({ branch: (branchInput.value || "main").trim() || "main" }); render(); };
    if (tokenInput) tokenInput.onchange = async () => { const v = tokenInput.value.trim(); if (v) await mod.setGithubCfg({ token: v }); render(); };
    if (testBtn) testBtn.onclick = async () => {
      testBtn.disabled = true;
      const lb = testBtn.textContent;
      testBtn.textContent = "Testando\u2026";
      try {
        const cfg = await readForm();
        const info = await mod.testGithubConnection(cfg);
        toast("Repositório encontrado: " + info.fullName, "success", 4000);
        if (hintEl) hintEl.textContent = "Repositório " + info.fullName + " acessível" + (info.defaultBranch ? " (branch padrão: " + info.defaultBranch + ")" : "") + ".";
      } catch (err) { showErr(err.message || "Falha no teste"); }
      finally { testBtn.disabled = false; testBtn.textContent = lb; render(); }
    };
    if (pushBtn) pushBtn.onclick = async () => {
      const cfg = await readForm();
      if (!cfg.owner || !cfg.repo) { toast("Preencha dono/repo primeiro", "error"); repoInput.focus(); return; }
      if (!cfg.token) { toast("Cole o token primeiro", "error"); tokenInput.focus(); return; }
      const ok = await confirmDialog({ title: "Enviar o site ao GitHub?", message: "Isto cria ou atualiza main.pjs, index.html e os arquivos de src/ no repositório " + cfg.owner + "/" + cfg.repo + " (" + (cfg.branch || "main") + ").", confirmLabel: "Enviar" });
      if (!ok) return;
      pushBtn.disabled = true;
      const lb = pushBtn.textContent;
      if (progRow) progRow.hidden = false;
      try {
        await mod.pushSiteToGithub((i, total, path) => {
          pushBtn.textContent = "Enviando " + i + "/" + total + "\u2026";
          if (progEl) progEl.textContent = i + " de " + total + " — " + path;
        });
        toast("Site enviado ao GitHub", "success", 4000);
      } catch (err) {
        if (err && err.pushed) toast("Enviado: " + err.pushed + " de " + err.total + (err.partial ? ". Falhas: " + (err.errors || []).slice(0, 2).join(" | ") : ""), err.partial ? "info" : "success", 8000);
        else showErr(err.message || "Falha ao enviar");
      }
      finally { pushBtn.disabled = false; pushBtn.textContent = lb; render(); }
    };
    if (forgetBtn) forgetBtn.onclick = async () => {
      await mod.clearGithubToken();
      if (tokenInput) tokenInput.value = "";
      toast("Token apagado deste navegador");
      render();
    };
    render();
  }
  function openGithubHelp() {
    const b = el("<div class=\"helpPanel\"><section><h4>Como criar o token</h4><ol><li>Abra <strong>github.com \u2192 foto de perfil \u2192 Settings \u2192 Developer settings \u2192 Personal access tokens \u2192 Tokens (classic)</strong>.</li><li><strong>Generate new token (classic)</strong>, marque o escopo <strong>repo</strong> e gere.</li><li>Cole o token aqui (começa com <code>ghp_</code>). Ele fica só neste navegador.</li><li>Preencha <strong>dono/repo</strong> e o <strong>branch</strong> (ex.: main) e clique em Testar conexão.</li></ol><p>Cada envio atualiza main.pjs, index.html e src/ no repositório. Para voltar atrás, use o histórico de commits do GitHub.</p></section></div>");
    openModal({ title: "\U0001f419 GitHub — token", size: "md", body: b, actions: [{ label: "Entendi", kind: "primary", onClick: ({ close }) => close() }] });
  }
q("#themeSelect", body).onchange = (e) => applyTheme(e.target.value);
  q("#mentionToggle", body).onchange = (e) => {
    state.mentionHighlight = e.target.checked;
    savePrefs();
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: state.entityId } }));
  };
  q("#wipeBtn", body).onclick = async () => {
    const ok = await confirmDialog({ title: "Apagar tudo?", message: "Isso remove todas as fichas, pastas, conexões, imagens, capítulos do livro, eventos da timeline e gráficos de competência salvos neste navegador. Não tem como desfazer.", confirmLabel: "Apagar tudo", danger: true });
    if (!ok) return;
    await store.wipe();
    await book.wipe();
    await timeline.wipe();
    await competencia.wipe();
    setUI({ entityId: null, folderId: null });
    m.close();
    toast("Arquivo apagado");
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
  };

  // ---------------------------------------------------- publicar para leitura
  const pubSection = q("#pubSection", body);
  if (VIEW.active) {
    if (pubSection) pubSection.hidden = true;
  } else {
    const stateEl = q("#pubState", body);
    const urlEl = q("#pubUrl", body);
    const hintEl = q("#pubHint", body);
    const pubBtn = q("#pubBtn", body);
    const copyBtn = q("#pubCopyBtn", body);
    const openBtn = q("#pubOpenBtn", body);
    const offBtn = q("#pubOffBtn", body);
    let publicando = false;

    const renderPub = () => {
      const s = shareFor(universes.activeId);
      if (!s) {
        stateEl.textContent = "não publicado";
        urlEl.hidden = true; urlEl.value = "";
        copyBtn.disabled = true; openBtn.disabled = true; offBtn.disabled = true;
        hintEl.textContent = "Ao publicar, um instantâneo deste Codex vira um arquivo público e o link aparece aqui. Só quem tiver o link consegue ver.";
        return;
      }
      const quando = new Date(s.publicadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      const kb = Math.max(1, Math.round((s.bytes || 0) / 1024));
      stateEl.textContent = (s.despublicado ? "despublicado" : "publicado") + " · " + quando + " · " + kb + " KB";
      urlEl.hidden = false;
      urlEl.value = shareUrl(s.id);
      copyBtn.disabled = false; openBtn.disabled = false; offBtn.disabled = false;
      hintEl.textContent = s.despublicado
        ? "O link continua existindo, mas avisa que o autor despublicou este Codex. Publique de novo para reativar (o mesmo link volta a funcionar)."
        : (s.enxuto
          ? "Algumas imagens foram reduzidas para caber no arquivo publicado. Publique de novo depois de editar para quem tem o link ver as mudanças."
          : "Este link mostra o Codex como ele estava quando você publicou. Publique de novo depois de editar para os outros verem as mudanças.");
    };

    pubBtn.onclick = async () => {
      if (publicando) return;
      publicando = true;
      const label = pubBtn.textContent;
      pubBtn.disabled = true;
      pubBtn.textContent = "Publicando…";
      try {
        store.flush(); book.flush(); timeline.flush(); competencia.flush();
        const u = universes.active();
        const payload = await universes.exportOne(u.id);
        payload.publishedAt = new Date().toISOString();
        await publicar(u.id, payload, (fase) => { pubBtn.textContent = "Publicando… " + fase; });
        renderPub();
        toast("Publicado — o link já mostra esta versão do Codex", "success", 5000);
      } catch (err) {
        console.error("Falha ao publicar", err);
        toast(err.message || "Não consegui publicar este Codex", "error", 8000);
      } finally {
        publicando = false;
        pubBtn.disabled = false;
        pubBtn.textContent = label;
      }
    };

    copyBtn.onclick = async () => {
      if (!urlEl.value) return;
      await copyText(urlEl.value);
      toast("Link copiado — mande para quem quiser mostrar", "success");
    };
    openBtn.onclick = () => { if (urlEl.value) window.open(urlEl.value, "_blank"); };
    offBtn.onclick = async () => {
      const s = shareFor(universes.activeId);
      if (!s) return;
      const ok = await confirmDialog({
        title: "Despublicar este Codex?",
        message: "Quem tiver o link vai ver um aviso de que o autor despublicou. O link não passa a mostrar outra coisa, e você pode publicar de novo a qualquer momento.",
        confirmLabel: "Despublicar",
        danger: true,
      });
      if (!ok) return;
      offBtn.disabled = true;
      try {
        await despublicar(universes.activeId);
        renderPub();
        toast("Codex despublicado", "success");
      } catch (err) {
        toast(err.message || "Não consegui despublicar", "error");
        offBtn.disabled = false;
      }
    };

    renderPub();
  }
}

export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  savePrefs();
}
