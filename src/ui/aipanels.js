import { store } from "../store.js";
import * as ai from "../ai.js";
import { state } from "./state.js";
import { q, qa, el, openModal, toast, spinner, promptDialog } from "./dom.js";
import { esc, truncate, splitList, mdToPlain } from "../util.js";
import { RELATION_GROUPS, fieldDef } from "../data.js";

// Portão único das ferramentas de IA. O interruptor fica em 🏠 Apresentação
// ("Usar inteligência neste Codex") e vale para todas elas.
function aiGate() {
  if (!ai.available()) { toast("A IA não está disponível nesta página.", "error"); return false; }
  if (!ai.enabled()) { toast(ai.AI_OFF_MESSAGE, "error", 5200); return false; }
  return true;
}

function typeOptions(selected) {
  return store.types().map((t) => `<option value="${esc(t.id)}" ${t.id === selected ? "selected" : ""}>${esc(t.icon)} ${esc(t.l)}</option>`).join("");
}

function kindOptions(selected) {
  const groups = {};
  for (const k of store.kinds()) {
    const g = RELATION_GROUPS[k.g] ? k.g : "outros";
    if (!groups[g]) groups[g] = [];
    groups[g].push(k);
  }
  return Object.entries(groups).map(([g, kinds]) => {
    const group = RELATION_GROUPS[g] || RELATION_GROUPS.outros;
    return `<optgroup label="${esc(group.icon + " " + group.l)}">${kinds.map((k) => `<option value="${esc(k.id)}" ${k.id === selected ? "selected" : ""}>${esc(k.f)}</option>`).join("")}</optgroup>`;
  }).join("");
}

function progressBody(label) {
  return `<div class="aiProgress">
    <div class="aiProgressHead">${spinner("ai")}<span id="aiStage">${esc(label || "A IA está pensando…")}</span></div>
    <pre class="aiStream" id="aiStream"></pre>
    <p class="aiHint">Isso pode levar até um minuto. Você poderá revisar tudo antes de salvar.</p>
  </div>`;
}

function attachProgress(body, label) {
  body.innerHTML = progressBody(label);
  const stage = q("#aiStage", body);
  const stream = q("#aiStream", body);
  return {
    onProgress(text) {
      if (!stream.isConnected) return;
      stream.textContent = text.slice(-1400);
      stream.scrollTop = stream.scrollHeight;
      if (stage.textContent.indexOf("…") < 0) stage.textContent = "A IA está escrevendo…";
    },
    stage(text) { if (stage.isConnected) stage.textContent = text; },
  };
}

export async function openExtractPanel(presetText) {
  if (!aiGate()) return;
  const body = el(`<div class="aiPanel">
    <p class="aiIntro">Cole uma história, biografia, sinopse ou anotações soltas. A IA vai identificar as fichas (personagens, organizações, lugares, itens…) e as relações entre elas — e mostrar tudo para você aprovar antes de salvar.</p>
    <label class="field"><span class="fieldLabel">Texto</span><textarea class="input code" rows="12" id="aiText" placeholder="Ex: Aria cresceu na vila de Pedra Alta, filha do ferreiro Borin. Jurou vingança contra o Lorde Malvek, que destruiu sua casa..."></textarea></label>
    <div class="aiRow">
      <label class="btn tiny" for="aiFile">📄 Carregar arquivo .txt / .md</label>
      <input type="file" id="aiFile" accept=".txt,.md,.markdown,text/plain" hidden>
      <span class="aiHint">Quanto mais os nomes se repetem no texto, mais relações a IA consegue tecer.</span>
    </div>
  </div>`);
  const m = openModal({
    title: "✨ Extrair fichas e relações de um texto",
    size: "lg",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      { label: "Extrair", kind: "primary", onClick: async ({ card, body: b }) => {
        const text = q("#aiText", b).value.trim();
        if (text.length < 30) { toast("Cole um texto um pouco maior para a IA analisar", "error"); return; }
        const progress = attachProgress(q(".modalBody", card), "Lendo o texto…");
        try {
          const result = await ai.extractFromText(text, { onProgress: progress.onProgress });
          if (!result.entities.length) {
            q(".modalBody", card).innerHTML = `<div class="aiPanel"><p class="mutedNote">A IA não encontrou nenhuma ficha nesse texto. Tente com um texto mais descritivo (com nomes de pessoas e lugares).</p></div>`;
            return;
          }
          renderReview(result, card);
        } catch (err) {
          console.error(err);
          q(".modalBody", card).innerHTML = `<div class="aiPanel"><p class="errorNote">⚠️ ${esc(err.message)}</p></div>`;
        }
      } },
    ],
  });
  q("#aiFile", body).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    q("#aiText", body).value = text;
  };
  if (presetText) q("#aiText", body).value = presetText;
  setTimeout(() => q("#aiText", body).focus(), 60);
}

function renderReview(result, card) {
  const proposals = ai.matchProposals(result.entities);
  const entityOptions = proposals.map((p, i) => ({ idx: i, name: p.proposal.name, type: p.proposal.type, candidates: p.candidates }));
  const body = q(".modalBody", card);
  body.innerHTML = `<div class="aiPanel">
    <p class="aiIntro">Revise o que a IA encontrou. Desmarque o que não quiser, ajuste nomes/tipos, e escolha vincular a uma ficha existente quando for o caso.</p>
    <div class="reviewStats"><span class="rvPill">${result.entities.length} fichas</span><span class="rvPill">${result.relations.length} relações</span></div>
    <h4 class="reviewTitle">Fichas</h4>
    <div class="reviewList" id="reviewEntities">
      ${proposals.map((p, i) => {
        const pr = p.proposal;
        const cands = p.candidates.filter((c) => c.score >= 0.6).slice(0, 3);
        return `<div class="reviewRow" data-idx="${i}">
          <label class="rvCheckWrap"><input type="checkbox" class="rvCheck" checked></label>
          <div class="rvMain">
            <div class="rvTop">
              <input class="input rvName" value="${esc(pr.name)}" data-raw="${esc(pr.name)}">
              <select class="input rvType">${typeOptions(pr.type)}</select>
            </div>
            ${cands.length ? `<div class="rvMatchRow"><span class="rvMatchLabel">Parecida com:</span>
              <select class="input rvMatch">
                <option value="">➕ criar ficha nova</option>
                ${cands.map((c) => `<option value="${esc(c.entity.id)}" ${c.score >= 0.9 ? "selected" : ""}>🔗 vincular a "${esc(c.entity.name)}" (${Math.round(c.score * 100)}%)</option>`).join("")}
              </select></div>` : ""}
            <div class="rvMeta">${pr.aliases.length ? "apelidos: " + esc(pr.aliases.join(", ")) + " · " : ""}${pr.fields && Object.keys(pr.fields).length ? Object.keys(pr.fields).length + " campos · " : ""}${pr.summary ? esc(truncate(pr.summary, 90)) : ""}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <h4 class="reviewTitle">Relações</h4>
    <div class="reviewList" id="reviewRelations">
      ${result.relations.map((r, i) => `<div class="reviewRow rel" data-idx="${i}">
        <label class="rvCheckWrap"><input type="checkbox" class="rvCheck" checked></label>
        <div class="rvRelMain">
          <span class="rvEntity">${esc(r.from)}</span>
          <select class="input rvKind">${kindOptions(ai.kindFromAI(r.kind))}</select>
          <span class="rvEntity">${esc(r.to)}</span>
        </div>
        ${r.notes ? `<div class="rvMeta">${esc(truncate(r.notes, 110))}</div>` : ""}
      </div>`).join("") || `<p class="mutedNote">Nenhuma relação encontrada.</p>`}
    </div>
    <label class="inlineCheck"><input type="checkbox" id="mergeFields" checked> Completar campos vazios das fichas que já existem</label>
  </div>`;

  const footer = q(".modalFoot", card);
  footer.innerHTML = "";
  const backBtn = el(`<button class="btn">← Voltar</button>`);
  const cancelBtn = el(`<button class="btn">Cancelar</button>`);
  const applyBtn = el(`<button class="btn primary">Criar fichas e relações</button>`);
  footer.append(backBtn, cancelBtn, applyBtn);
  cancelBtn.onclick = () => card.closest(".modalBackdrop").remove();
  backBtn.onclick = () => { body.innerHTML = ""; openExtractPanelInPlace(card); };

  applyBtn.onclick = () => {
    const merge = q("#mergeFields", body).checked;
    const nameMap = new Map();
    const resolutions = [];
    let created = 0, linked = 0;
    for (const row of qa("#reviewEntities .reviewRow", body)) {
      const idx = Number(row.dataset.idx);
      const checked = q(".rvCheck", row).checked;
      const name = q(".rvName", row).value.trim();
      const type = q(".rvType", row).value;
      const matchId = q(".rvMatch", row) ? q(".rvMatch", row).value : "";
      const proposal = proposals[idx].proposal;
      if (!checked) { resolutions.push({ proposal, action: "skip", name }); continue; }
      const setMaps = (entity) => {
        nameMap.set(proposal.name.toLowerCase().trim(), entity.id);
        nameMap.set(name.toLowerCase().trim(), entity.id);
      };
      if (matchId) {
        const target = store.getEntity(matchId);
        if (target) {
          if (merge) {
            const patch = {};
            if (!target.summary && proposal.summary) patch.summary = proposal.summary;
            if (!target.description && proposal.description) patch.description = proposal.description;
            const fields = Object.assign({}, target.fields);
            for (const [k, v] of Object.entries(proposal.fields || {})) if (!fields[k] && v) fields[k] = v;
            patch.fields = fields;
            const aliases = new Set([...(target.aliases || []), ...(proposal.aliases || [])].filter(Boolean));
            if (name && name !== target.name) aliases.add(name);
            patch.aliases = [...aliases];
            store.updateEntity(target.id, patch, { silent: true });
          }
          setMaps(target);
          resolutions.push({ proposal, action: "link", entity: target, name });
          linked++;
          continue;
        }
      }
      const entity = store.createEntity({
        name: name || proposal.name,
        type,
        aliases: proposal.aliases || [],
        summary: proposal.summary || "",
        description: proposal.description || "",
        fields: proposal.fields || {},
        folderId: state.folderId && !state.folderId.startsWith("__") ? state.folderId : null,
        source: "ai",
      });
      setMaps(entity);
      resolutions.push({ proposal, action: "create", entity, name });
      created++;
    }
    let relCount = 0, skipped = 0;
    for (const row of qa("#reviewRelations .reviewRow", body)) {
      const idx = Number(row.dataset.idx);
      if (!q(".rvCheck", row).checked) continue;
      const r = result.relations[idx];
      const kind = q(".rvKind", row).value;
      const fromId = nameMap.get(String(r.from).toLowerCase().trim()) || (store.resolveName(r.from) || {}).id;
      const toId = nameMap.get(String(r.to).toLowerCase().trim()) || (store.resolveName(r.to) || {}).id;
      if (!fromId || !toId || fromId === toId) { skipped++; continue; }
      const existing = store.findRelation(fromId, toId, kind);
      if (existing) { skipped++; continue; }
      store.createRelation({ from: fromId, to: toId, kind, notes: r.notes, createdBy: "ai" });
      relCount++;
    }
    card.closest(".modalBackdrop").remove();
    toast(`${created} fichas criadas, ${linked} vinculadas, ${relCount} relações${skipped ? ` (${skipped} ignoradas)` : ""}`, "success", 5200);
    window.dispatchEvent(new CustomEvent("codex:refresh-browse"));
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
  };
}

function openExtractPanelInPlace(card) {
  const body = q(".modalBody", card);
  body.innerHTML = `<div class="aiPanel">
    <p class="aiIntro">Cole outro texto para extrair mais fichas e relações.</p>
    <label class="field"><span class="fieldLabel">Texto</span><textarea class="input code" rows="10" id="aiText2"></textarea></label>
  </div>`;
  const foot = q(".modalFoot", card);
  foot.innerHTML = "";
  const cancel = el(`<button class="btn">Cancelar</button>`);
  const run = el(`<button class="btn primary">Extrair</button>`);
  foot.append(cancel, run);
  cancel.onclick = () => card.closest(".modalBackdrop").remove();
  run.onclick = async () => {
    const text = q("#aiText2", body).value.trim();
    if (text.length < 30) { toast("Cole um texto um pouco maior", "error"); return; }
    const progress = attachProgress(body, "Lendo o texto…");
    try {
      const result = await ai.extractFromText(text, { onProgress: progress.onProgress });
      renderReview(result, card);
    } catch (err) {
      body.innerHTML = `<p class="errorNote">⚠️ ${esc(err.message)}</p>`;
    }
  };
}

async function withProgressModal(title, subtitle, worker) {
  const body = el(`<div></div>`);
  const m = openModal({ title, subtitle, size: "lg", body, dismissible: true, actions: [{ label: "Fechar", onClick: ({ close }) => close() }] });
  const progress = attachProgress(body, "A IA está pensando…");
  try {
    const result = await worker(progress.onProgress);
    return { result, body, modal: m };
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="aiPanel"><p class="errorNote">⚠️ ${esc(err.message)}</p></div>`;
    return null;
  }
}

export async function openSuggestPanel(entityId) {
  const entity = store.getEntity(entityId);
  if (!entity) return;
  if (!aiGate()) return;
  const out = await withProgressModal("✨ Sugerir conexões", entity.name, (onProgress) => ai.suggestRelations(entityId, { onProgress }));
  if (!out) return;
  const suggestions = out.result;
  const body = out.body;
  if (!suggestions.relations.length && !suggestions.summary && !Object.keys(suggestions.fields).length) {
    body.innerHTML = `<div class="aiPanel"><p class="mutedNote">A IA não encontrou conexões novas plausíveis para <strong>${esc(entity.name)}</strong>. Adicione mais detalhes às fichas e tente de novo.</p></div>`;
    return;
  }
  body.innerHTML = `<div class="aiPanel">
    <p class="aiIntro">Relações propostas entre <strong>${esc(entity.name)}</strong> e as fichas do seu arquivo. Desmarque o que não quiser.</p>
    <div class="reviewList">
      ${suggestions.relations.map((r, i) => {
        const fromIsSelf = store.resolveName(r.from) && store.resolveName(r.from).id === entityId;
        const otherName = fromIsSelf ? r.to : r.from;
        const other = store.resolveName(otherName);
        const k = store.kind(r.kind);
        const label = fromIsSelf ? k.f : (k.i || k.f);
        return `<div class="reviewRow rel" data-idx="${i}">
          <label class="rvCheckWrap"><input type="checkbox" class="rvCheck" checked></label>
          <div class="rvRelMain">
            <span class="rvEntity">${esc(entity.name)}</span>
            <select class="input rvKind">${kindOptions(ai.kindFromAI(r.kind))}</select>
            <span class="rvEntity">${esc(otherName)}</span>
            ${other ? "" : `<span class="rvWarn">ficha não encontrada</span>`}
          </div>
          ${r.notes ? `<div class="rvMeta">${esc(truncate(r.notes, 140))}</div>` : ""}
        </div>`;
      }).join("") || `<p class="mutedNote">Nenhuma relação nova proposta.</p>`}
    </div>
    ${suggestions.summary || suggestions.description || Object.keys(suggestions.fields).length ? `<h4 class="reviewTitle">Sugestões para a ficha</h4>
      <div class="aiSuggestion">
        ${suggestions.summary ? `<p><strong>Resumo:</strong> ${esc(suggestions.summary)}</p>` : ""}
        ${suggestions.description ? `<div class="richText">${esc(truncate(mdToPlain(suggestions.description), 600))}</div>` : ""}
        ${Object.entries(suggestions.fields).map(([k, v]) => v ? `<p><strong>${esc(fieldDef(k).l)}:</strong> ${esc(truncate(String(v), 300))}</p>` : "").join("")}
      </div>
      <label class="inlineCheck"><input type="checkbox" id="applySuggestionFields" checked> Preencher os campos vazios com essas sugestões</label>` : ""}
  </div>`;
  const footer = q(".modalFoot", out.modal.card);
  footer.innerHTML = "";
  const closeBtn = el(`<button class="btn">Fechar</button>`);
  const applyBtn = el(`<button class="btn primary">Aplicar selecionadas</button>`);
  footer.append(closeBtn, applyBtn);
  closeBtn.onclick = () => out.modal.close();
  applyBtn.onclick = () => {
    let count = 0;
    for (const row of qa(".reviewRow", body)) {
      if (!q(".rvCheck", row).checked) continue;
      const r = suggestions.relations[Number(row.dataset.idx)];
      const kind = q(".rvKind", row).value;
      const fromIsSelf = (store.resolveName(r.from) || {}).id === entityId;
      const otherName = fromIsSelf ? r.to : r.from;
      const other = store.resolveName(otherName);
      if (!other) continue;
      const from = fromIsSelf ? entityId : other.id;
      const to = fromIsSelf ? other.id : entityId;
      if (store.findRelation(from, to, kind)) continue;
      store.createRelation({ from, to, kind, notes: r.notes, createdBy: "ai" });
      count++;
    }
    const fill = q("#applySuggestionFields", body);
    if (fill && fill.checked) {
      const patch = { fields: Object.assign({}, entity.fields) };
      if (!entity.summary && suggestions.summary) patch.summary = suggestions.summary;
      if (!entity.description && suggestions.description) patch.description = suggestions.description;
      for (const [k, v] of Object.entries(suggestions.fields)) if (!patch.fields[k] && v) patch.fields[k] = v;
      const aliases = new Set([...(entity.aliases || []), ...(suggestions.aliases || [])].filter(Boolean));
      patch.aliases = [...aliases];
      store.updateEntity(entityId, patch, { silent: true });
    }
    out.modal.close();
    toast(`${count} conexões criadas`, "success");
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
    if (state.entityId === entityId) window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: entityId } }));
  };
}

export async function openCompletePanel(entityId) {
  const entity = store.getEntity(entityId);
  if (!entity) return;
  if (!aiGate()) return;
  const extra = await promptDialog({
    title: "✨ Enriquecer ficha",
    label: "Diretrizes para a IA (opcional)",
    placeholder: "ex: foque em um passado trágico; mantenha o tom sombrio",
    multiline: true,
    confirmLabel: "Gerar",
  });
  if (extra === null) return;
  const out = await withProgressModal("✨ Enriquecer ficha", entity.name, (onProgress) => ai.completeEntity(entityId, { extraContext: extra, onProgress }));
  if (!out) return;
  const r = out.result;
  const body = out.body;
  const type = store.type(entity.type);
  const emptyFields = ((type && type.fields) || []).filter((k) => !entity.fields || !entity.fields[k]);
  body.innerHTML = `<div class="aiPanel">
    <p class="aiIntro">Sugestões para <strong>${esc(entity.name)}</strong>. Marque o que quiser aproveitar.</p>
    <label class="field"><span class="fieldLabel"><input type="checkbox" class="apCheck" id="apSummary" checked> Resumo</span>
      <textarea class="input" rows="2" id="apSummaryText">${esc(r.summary || "")}</textarea></label>
    <label class="field"><span class="fieldLabel"><input type="checkbox" class="apCheck" id="apDesc" checked> Descrição</span>
      <textarea class="input code" rows="10" id="apDescText">${esc(r.description || "")}</textarea></label>
    ${Object.entries(r.fields).map(([k, v]) => v ? `<label class="field"><span class="fieldLabel"><input type="checkbox" class="apCheck" data-fkey="${esc(k)}" checked> ${esc(fieldDef(k).l)} ${emptyFields.includes(k) ? "" : `<span class="rvWarn">(já tem conteúdo — será substituído)</span>`}</span>
      <textarea class="input" rows="${String(v).length > 120 ? 3 : 1}">${esc(String(v))}</textarea></label>` : "").join("")}
    ${(r.aliases || []).length ? `<label class="field"><span class="fieldLabel"><input type="checkbox" class="apCheck" id="apAliases" checked> Apelidos sugeridos</span><input class="input" id="apAliasesText" value="${esc((r.aliases || []).join(", "))}"></label>` : ""}
    <div class="aiRow">
      <button class="btn" id="apAppend">➕ Anexar descrição ao final</button>
      <button class="btn" id="apReplace">↺ Substituir descrição</button>
    </div>
  </div>`;
  let appendDesc = false;
  q("#apAppend", body).onclick = () => { appendDesc = true; q("#apDesc", body).checked = true; toast("A descrição será anexada"); };
  q("#apReplace", body).onclick = () => { appendDesc = false; q("#apDesc", body).checked = true; toast("A descrição será substituída"); };
  const footer = q(".modalFoot", out.modal.card);
  footer.innerHTML = "";
  const skip = el(`<button class="btn">Descartar</button>`);
  const apply = el(`<button class="btn primary">Aplicar</button>`);
  footer.append(skip, apply);
  skip.onclick = () => out.modal.close();
  apply.onclick = () => {
    const fresh = store.getEntity(entityId);
    const patch = { fields: Object.assign({}, fresh.fields) };
    if (q("#apSummary", body).checked) patch.summary = q("#apSummaryText", body).value.trim();
    if (q("#apDesc", body).checked) {
      const text = q("#apDescText", body).value.trim();
      patch.description = appendDesc && fresh.description ? fresh.description.trim() + "\n\n" + text : text;
    }
    for (const row of qa("[data-fkey]", body)) {
      if (!row.checked) continue;
      const key = row.dataset.fkey;
      const input = row.closest("label").querySelector("textarea, input.input");
      patch.fields[key] = input ? input.value.trim() : patch.fields[key];
    }
    const aliasBox = q("#apAliases", body);
    if (aliasBox && aliasBox.checked) {
      const aliases = new Set([...(fresh.aliases || []), ...splitList(q("#apAliasesText", body).value)]);
      patch.aliases = [...aliases];
    }
    store.updateEntity(entityId, patch, { silent: true });
    out.modal.close();
    toast("Ficha enriquecida", "success");
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: entityId } }));
  };
}

export async function openDescribeImagePanel(entityId, imageId) {
  const entity = store.getEntity(entityId);
  if (!entity) return;
  if (!aiGate()) return;
  const img = imageId ? store.imageById(entity, imageId) : store.activeImage(entity);
  if (!img) { toast("Esta ficha ainda não tem imagem", "error"); return; }
  const src = await store.getSrcByRef(img.ref);
  if (!src) { toast("Não consegui carregar a imagem", "error"); return; }
  let blob;
  try {
    blob = await (await fetch(src)).blob();
  } catch (err) {
    toast("Não consegui ler os pixels da imagem (pode ser um link externo bloqueado). Envie a imagem pelo botão ⬆.", "error", 6000);
    return;
  }
  const out = await withProgressModal("👁 Descrever imagem", entity.name, (onProgress) => ai.describeImage(entityId, blob, { onProgress }));
  if (!out) return;
  const r = out.result;
  const body = out.body;
  body.innerHTML = `<div class="aiPanel">
    <p class="aiIntro">O que a IA viu em <strong>${esc(entity.name)}</strong>:</p>
    <label class="field"><span class="fieldLabel"><input type="checkbox" id="viAppearance" checked> Aparência</span>
      <textarea class="input" rows="4" id="viAppearanceText">${esc(r.appearance || "")}</textarea></label>
    <label class="field"><span class="fieldLabel"><input type="checkbox" id="viSummary" ${entity.summary ? "" : "checked"}> Resumo</span>
      <textarea class="input" rows="2" id="viSummaryText">${esc(r.summary || "")}</textarea></label>
    <label class="field"><span class="fieldLabel"><input type="checkbox" id="viDesc"> Descrição</span>
      <textarea class="input code" rows="6" id="viDescText">${esc(r.description || "")}</textarea></label>
    ${Object.entries(r.fields).map(([k, v]) => v ? `<label class="field"><span class="fieldLabel"><input type="checkbox" data-vkey="${esc(k)}" checked> ${esc(fieldDef(k).l)}</span><input class="input" value="${esc(String(v))}"></label>` : "").join("")}
    ${r.tags.length ? `<label class="field"><span class="fieldLabel"><input type="checkbox" id="viTags" checked> Etiquetas</span><input class="input" id="viTagsText" value="${esc(r.tags.join(", "))}"></label>` : ""}
  </div>`;
  const footer = q(".modalFoot", out.modal.card);
  footer.innerHTML = "";
  const skip = el(`<button class="btn">Descartar</button>`);
  const apply = el(`<button class="btn primary">Aplicar à ficha</button>`);
  footer.append(skip, apply);
  skip.onclick = () => out.modal.close();
  apply.onclick = () => {
    const fresh = store.getEntity(entityId);
    const patch = { fields: Object.assign({}, fresh.fields) };
    if (q("#viAppearance", body).checked) patch.fields.aparencia = q("#viAppearanceText", body).value.trim();
    for (const row of qa("[data-vkey]", body)) {
      if (!row.checked) continue;
      const input = row.closest("label").querySelector("input.input");
      patch.fields[row.dataset.vkey] = input.value.trim();
    }
    if (q("#viSummary", body).checked) patch.summary = q("#viSummaryText", body).value.trim();
    if (q("#viDesc", body).checked) patch.description = q("#viDescText", body).value.trim();
    const tagsBox = q("#viTags", body);
    if (tagsBox && tagsBox.checked) {
      const tags = new Set([...(fresh.tags || []), ...splitList(q("#viTagsText", body).value)]);
      patch.tags = [...tags];
    }
    store.updateEntity(entityId, patch, { silent: true });
    out.modal.close();
    toast("Imagem descrita e aplicada", "success");
    window.dispatchEvent(new CustomEvent("codex:data-changed"));
    window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: entityId } }));
  };
}

export async function openPortraitPanel(entityId, opts) {
  opts = opts || {};
  const entity = store.getEntity(entityId);
  if (!entity) return;
  if (typeof root.generateImage !== "function") { toast("A geração de imagens não está disponível nesta página.", "error"); return; }
  const replaceImg = opts.imageId ? store.imageById(entity, opts.imageId) : null;
  const basePrompt = [entity.name, store.type(entity.type).l, entity.summary, mdToPlain(entity.fields && entity.fields.aparencia || ""), entity.description ? truncate(mdToPlain(entity.description), 400) : ""]
    .filter(Boolean).join(", ");
  const prompt = await promptDialog({
    title: "🎨 Gerar retrato com IA",
    label: "Prompt de imagem",
    value: basePrompt,
    placeholder: "descreva a aparência desejada",
    multiline: true,
    hint: "Dica: cite estilo, enquadramento e iluminação. Ex: 'retrato, fantasia sombria, iluminação dramática'.",
    confirmLabel: "Gerar",
  });
  if (!prompt || !prompt.trim()) return;
  const body = el(`<div></div>`);
  const m = openModal({ title: "🎨 Gerando imagem…", subtitle: entity.name, size: "md", body });
  body.innerHTML = `<div class="aiProgress"><div class="aiProgressHead">${spinner("ai")}<span>Gerando a imagem… (pode levar até um minuto)</span></div><div class="genPreview" id="genPreview"></div></div>`;
  try {
    const result = await root.generateImage(prompt.trim(), { resolution: "768x768" });
    if (result.error) throw new Error(result.error);
    const src = result.dataUrl || result.url;
    q("#genPreview", body).innerHTML = `<img src="${esc(src)}" alt="prévia">`;
    const footer = q(".modalFoot", m.card) || el(`<div class="modalFoot"></div>`);
    if (!footer.parentElement) m.card.appendChild(footer);
    footer.innerHTML = "";
    const retry = el(`<button class="btn">🔄 Gerar outra</button>`);
    const use = el(`<button class="btn primary">${replaceImg ? "Substituir esta imagem" : "Usar como nova imagem"}</button>`);
    footer.append(retry, use);
    retry.onclick = () => { m.close(); openPortraitPanel(entityId, opts); };
    use.onclick = async () => {
      const dataUrl = await (await import("../util.js")).shrinkImage(src, 1024, 0.86);
      if (!dataUrl) { toast("Não consegui processar a imagem", "error"); return; }
      const ref = await store.putImageData(dataUrl);
      const fresh = store.getEntity(entityId) || entity;
      if (replaceImg && store.imageById(fresh, replaceImg.id)) {
        await store.replaceEntityImage(entityId, replaceImg.id, ref);
        toast("Imagem substituída", "success");
      } else {
        const imgs = store.images(fresh);
        const label = opts.label || (imgs.some((i) => i.label === "Retrato IA") ? "Retrato IA " + (imgs.length + 1) : "Retrato IA");
        store.addEntityImage(entityId, { ref, label, byAI: true });
        toast("Imagem adicionada", "success");
      }
      m.close();
      window.dispatchEvent(new CustomEvent("codex:data-changed"));
      window.dispatchEvent(new CustomEvent("codex:open-detail", { detail: { id: entityId } }));
    };
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="aiPanel"><p class="errorNote">⚠️ ${esc(err.message || "Falha ao gerar imagem")}</p></div>`;
  }
}

export function initAiPanels() {
  window.addEventListener("codex:open-ai-extract", (e) => openExtractPanel(e.detail && e.detail.text));
  window.addEventListener("codex:ai-suggest", (e) => openSuggestPanel(e.detail.id));
  window.addEventListener("codex:ai-complete", (e) => openCompletePanel(e.detail.id));
  window.addEventListener("codex:ai-describe-image", (e) => openDescribeImagePanel(e.detail.id, e.detail.imageId));
  window.addEventListener("codex:ai-portrait", (e) => openPortraitPanel(e.detail.id, { imageId: e.detail.imageId, label: e.detail.label }));
}
