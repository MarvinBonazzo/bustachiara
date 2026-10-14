/* ============================================================
   BustaChiara — UI e logica applicativa
   ============================================================ */
'use strict';

/* ---------- utilità ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200); }
function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function b64ToText(b64) { return new TextDecoder('utf-8').decode(b64ToU8(b64)); }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now() + Math.random().toString(36).slice(2)); }
function flexNum(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  s = String(s).trim();
  const it = itNum(s); if (it != null) return it;
  const m = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(m) ? parseFloat(m) : null;
}
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); let cur = o; for (let i = 0; i < ks.length - 1; i++) { if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {}; cur = cur[ks[i]]; } cur[ks[ks.length - 1]] = v; }
function fontiHTML(ids) {
  const items = (ids || []).map(id => FONTI[id]).filter(Boolean);
  if (!items.length) return '';
  return `<p class="fonti-line">Verifica su: ${items.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.label)}</a>`).join(' · ')}</p>`;
}
const MESI_NOMI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
function periodoLabel(p) { return p ? (MESI_NOMI[p.mese] ? `${MESI_NOMI[p.mese]} ${p.anno}` : `${p.mese}/${p.anno}`) : '—'; }
function periodoKey(p) { return p ? p.anno * 12 + p.mese : 0; }
function primaFrase(t) {
  const text = t || '';
  const re = /\.\s+(?=[A-ZÀ-Ý])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    if (m.index > 20 && !/(?:\b(?:art|artt|comma|n|nr|lett|cfr|es|ecc|pag|L|D|Lgs|D\.Lgs|DPR|sig|dott)|\b[A-Z])$/.test(before)) return text.slice(0, m.index + 1);
  }
  return text;
}
const TIPO_CEDOLINO = {
  ordinario: 'Ordinario', tredicesima: 'Tredicesima', quattordicesima: 'Quattordicesima',
  conguaglio: 'Conguaglio', cessazione: 'Cessazione', arretrati: 'Arretrati',
  premio: 'Premio', rettifica: 'Rettifica', altro: 'Altro',
};
function tipoCedolino(record) { return record && record.documento && record.documento.tipo || 'ordinario'; }
function tipoCedolinoLabel(record) { return TIPO_CEDOLINO[tipoCedolino(record)] || 'Altro'; }
function employerKey(record) { return aliasKey(record && record.azienda && record.azienda.nome || ''); }
function recordIdentityKey(record) { return [periodoKey(record.periodo), employerKey(record), tipoCedolino(record)].join('|'); }

/* ---------- archivio locale ---------- */
const STORE_KEY = 'bustachiara_v1';
const Store = {
  data: { records: [], customCcnl: [], voiceAliases: [], layoutProfiles: [] },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && Array.isArray(d.records)) {
        this.data = Object.assign(this.data, d);
        delete this.data.prefs; // migrazione: la vecchia modalità semplificata non esiste più
        this.data.voiceAliases = Array.isArray(d.voiceAliases) ? d.voiceAliases : [];
        this.data.layoutProfiles = Array.isArray(d.layoutProfiles) ? d.layoutProfiles : [];
        this.data.records = this.data.records.map(record => {
          record.documento = record.documento || { tipo: 'ordinario' };
          Parser.ripulisciRecord(record);
          if (!record.ccnlId) {
            const contract = Parser.trovaCcnl(record, CCNL_DB);
            if (contract) record.ccnlId = contract.id;
          }
          return record;
        });
      }
    } catch (e) { /* dati corrotti: si riparte */ }
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { toast('Salvataggio non riuscito: spazio esaurito? Esporta i dati.'); } },
};
function allCcnl() { return [...(Store.data.customCcnl || []).map(reviveCustom), ...CCNL_DB]; }
function reviveCustom(c) { return Object.assign({}, c, { match: (c.matchSrc || []).map(s => { try { return new RegExp(s, 'i'); } catch (e) { return /$^/; } }) }); }
function ccnlById(id) {
  const local = allCcnl().find(c => c.id === id);
  if (local) return local;
  const match = String(id || '').match(/^cnel-(.+)$/);
  return match ? Parser.cnelContractByCode(match[1]) : null;
}
function recSorted() { return [...Store.data.records].sort((a, b) => periodoKey(a.periodo) - periodoKey(b.periodo)
  || employerKey(a).localeCompare(employerKey(b)) || tipoCedolino(a).localeCompare(tipoCedolino(b))); }

function aliasKey(value) {
  return Parser.normalizzaTesto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Impara il formato senza conservare il documento né il nome dell'azienda.
   La chiave del datore è un hash locale non reversibile nell'uso normale; il
   profilo contiene soltanto campi confermati, software e contratto scelto. */
function localProfileHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function layoutProfileKey(record) {
  const employer = aliasKey(record && record.azienda && record.azienda.nome || '');
  if (!employer) return null;
  const software = aliasKey(record && record.meta && record.meta.software || 'FORMATO GENERICO');
  const sector = aliasKey(record && record.meta && record.meta.settore || 'PRIVATO');
  return `${software}|${sector}|${localProfileHash(employer)}`;
}
function applicaProfiloLayout(record) {
  const key = layoutProfileKey(record);
  const profile = key && (Store.data.layoutProfiles || []).find(item => item.key === key);
  if (!profile) return;
  if (!record.ccnlId && profile.ccnlId) record.ccnlId = profile.ccnlId;
  record.ccnl = record.ccnl || {};
  if (!record.ccnl.cnel && profile.cnel) record.ccnl.cnel = profile.cnel;
  record.meta = record.meta || {};
  record.meta.fields = record.meta.fields || {};
  for (const [path, confirmations] of Object.entries(profile.fields || {})) {
    if (getPath(record, path) == null || confirmations < 2) continue;
    const current = record.meta.fields[path] || {};
    if ((Number(current.confidence) || 0) >= .82) continue;
    record.meta.fields[path] = Object.assign({}, current, {
      confidence: Math.max(Number(current.confidence) || 0, .78),
      method: 'profilo locale di formato già confermato', learnedLocally: true,
    });
  }
  record.meta.layoutProfile = { matched: true, samples: profile.samples || 1 };
}
function imparaProfiloLayout(record) {
  const key = layoutProfileKey(record);
  if (!key) return;
  const profiles = Store.data.layoutProfiles || (Store.data.layoutProfiles = []);
  const old = profiles.find(item => item.key === key);
  const fields = Object.assign({}, old && old.fields || {});
  const paths = Object.entries(record.meta && record.meta.fields || {})
    .filter(([path, metadata]) => getPath(record, path) != null && metadata && metadata.confirmed === true)
    .map(([path]) => path);
  for (const path of paths) fields[path] = Math.min(30, (fields[path] || 0) + 1);
  const profile = {
    key,
    software: record.meta && record.meta.software || 'Formato generico',
    sector: record.meta && record.meta.settore || 'privato-lul',
    fields,
    ccnlId: record.ccnlId || null,
    cnel: record.ccnl && record.ccnl.cnel || null,
    samples: Math.min(99, (old && old.samples || 0) + 1),
    updatedAt: new Date().toISOString(),
  };
  if (old) profiles[profiles.indexOf(old)] = profile; else profiles.push(profile);
  if (profiles.length > 100) Store.data.layoutProfiles = profiles.slice(-100);
}

function applicaAliasLocali(record) {
  const software = record.meta && record.meta.software || '*';
  for (const voice of record.voci || []) {
    const original = voice.descrizioneOriginale || voice.descrizione || '';
    const key = aliasKey(original);
    if (!key) continue;
    const alias = (Store.data.voiceAliases || []).find(item => item.key === key && (item.software === software || item.software === '*'));
    if (!alias) continue;
    voice.descrizioneOriginale = original;
    if (alias.descrizione) voice.descrizione = alias.descrizione;
    if (alias.categoria) voice.categoriaManuale = alias.categoria;
    if (alias.nome) voice.nomeManuale = alias.nome;
    voice.meta = Object.assign({}, voice.meta, { learnedLocally: true });
  }
}

function imparaCorrezioni(record) {
  const software = record.meta && record.meta.software || '*';
  const aliases = Store.data.voiceAliases || (Store.data.voiceAliases = []);
  for (const voice of record.voci || []) {
    const original = voice.descrizioneOriginale || '';
    const key = aliasKey(original);
    if (!key) continue;
    const corrected = String(voice.descrizione || '').trim();
    const changed = corrected && aliasKey(corrected) !== key;
    if (!changed && !voice.categoriaManuale && !voice.nomeManuale) continue;
    const item = { software, key, originale: original, descrizione: corrected || original,
      categoria: voice.categoriaManuale || null, nome: voice.nomeManuale || null, updatedAt: new Date().toISOString() };
    const index = aliases.findIndex(alias => alias.software === software && alias.key === key);
    if (index >= 0) aliases[index] = item; else aliases.push(item);
  }
  if (aliases.length > 500) Store.data.voiceAliases = aliases.slice(-500);
}

/* ---------- popover informativo ---------- */
let focusBeforePopover = null;
function openInfo(titolo, bodyHtml) {
  focusBeforePopover = document.activeElement;
  $('#popover-title').textContent = titolo;
  $('#popover-body').innerHTML = bodyHtml;
  $('#popover').hidden = false;
  document.body.classList.add('modal-open');
  ['#topbar', 'main', 'footer'].forEach(s => {
    const el = $(s); if (!el) return;
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
  });
  requestAnimationFrame(() => $('#popover-close').focus());
}
function closeInfo() {
  if ($('#popover').hidden) return;
  $('#popover').hidden = true;
  document.body.classList.remove('modal-open');
  ['#topbar', 'main', 'footer'].forEach(s => {
    const el = $(s); if (!el) return;
    el.removeAttribute('aria-hidden');
    el.inert = false;
  });
  if (focusBeforePopover && typeof focusBeforePopover.focus === 'function') focusBeforePopover.focus();
}
function iBtn(key) { return `<button class="ibtn" data-info="${esc(key)}" title="Cosa significa?" aria-label="Spiegazione di ${esc(key)}">i</button>`; }
let detailVoci = []; // voci del record mostrato in Dettaglio, per i popup
function vociInfoHtml(v) {
  const s = spiegaVoce(v);
  return `<p>${esc(spiegazioneCompletaVoce(v, s))}</p>
    ${controlloUtileVoce(v, s) ? `<p><b>Controllo utile:</b> ${esc(controlloUtileVoce(v, s))}</p>` : ''}
    ${fontiHTML(s.fonti)}`;
}

/* ---------- spiegazione voci ---------- */
function spiegaVoce(v) {
  return classificaVoce(v);
}
function spiegazioneCompletaVoce(v, spiegazione = spiegaVoce(v)) {
  const fallback = spiegazione.cat === 'trattenuta'
    ? 'Questa somma viene tolta dal totale prima di arrivare al netto.'
    : spiegazione.cat === 'competenza'
      ? 'Questa somma viene aggiunta alle competenze del mese.'
      : 'È un dato usato per spiegare o calcolare il cedolino; da solo non cambia il netto.';
  let text = String(spiegazione.cosa || '').replace(/\s*Riconoscimento offline[\s\S]*$/i, '').trim() || fallback;
  text = text.replace(/\bcausale\b/gi, 'voce').replace(/\bgestionale\b/gi, 'software paghe');
  return text;
}
function spiegazioneBreveVoce(v, spiegazione = spiegaVoce(v)) {
  const full = spiegazioneCompletaVoce(v, spiegazione);
  const text = primaFrase(full) || full;
  return text.length > 230 ? text.slice(0, 227).replace(/\s+\S*$/, '') + '…' : text;
}
function controlloUtileVoce(v, spiegazione = spiegaVoce(v)) {
  const confidence = Number(v.meta && v.meta.confidence);
  const uncertain = Number.isFinite(confidence) && confidence < .7;
  const calculation = Parser.calcoloVoce(v);
  if (calculation && !calculation.ok) return 'Il calcolo base × quantità non coincide con l’importo: confronta questa riga col documento.';
  if (uncertain) return spiegazione.controlla || 'La lettura di questa riga non è abbastanza sicura: confronta nome e importo col documento.';
  return '';
}

/* ---------- navigazione ---------- */
let currentDetailId = null;
let draft = null; // { record, warnings } in verifica
const SourcePreviewCache = new Map(); // anteprime solo in RAM: mai nel localStorage
const APP_VIEWS = new Set(['importa', 'verifica', 'riassunto', 'dettaglio', 'guida', 'consigli', 'progetto', 'impostazioni']);
const APP_HISTORY_STORAGE_PREFIX = 'bustachiara.history.v1.';
let activeView = null;
let historyPosition = 0;
let historyFurthest = 0;
let historyTrailId = null;

function newHistoryTrailId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `bc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isAppHistoryState(state) {
  return !!state && state.bustaChiara === true && Number.isInteger(state.position) && state.position >= 0;
}

function readHistoryLedger(trailId) {
  if (!trailId || typeof sessionStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(APP_HISTORY_STORAGE_PREFIX + trailId) || 'null');
    return parsed && Number.isInteger(parsed.furthest) && parsed.furthest >= 0 ? parsed : null;
  } catch (error) { return null; }
}

function persistHistoryLedger() {
  if (!historyTrailId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(APP_HISTORY_STORAGE_PREFIX + historyTrailId, JSON.stringify({
      furthest: historyFurthest,
      current: historyPosition,
    }));
  } catch (error) { /* sessionStorage non disponibile: resta attiva la cronologia della sessione corrente */ }
}

function restoreHistoryEntry(state = history.state) {
  if (!isAppHistoryState(state)) {
    historyTrailId = newHistoryTrailId();
    historyPosition = 0;
    historyFurthest = 0;
    persistHistoryLedger();
    updateHistoryButtons();
    return null;
  }
  historyTrailId = typeof state.trailId === 'string' && state.trailId ? state.trailId : (historyTrailId || newHistoryTrailId());
  historyPosition = state.position;
  const ledger = readHistoryLedger(historyTrailId);
  historyFurthest = Math.max(historyPosition, ledger ? ledger.furthest : historyPosition);
  persistHistoryLedger();
  updateHistoryButtons();
  return { ...state, trailId: historyTrailId };
}

function routeRecordId(name, requestedId) {
  if (requestedId) return requestedId;
  if (name === 'verifica' && draft && draft.record) return draft.record.id || null;
  if (name === 'riassunto' || name === 'dettaglio') return currentDetailId || (recSorted().slice(-1)[0] || {}).id || null;
  return null;
}

function routeUrl(name) {
  return `#${name}`;
}

function updateHistoryButtons() {
  const back = $('#nav-back'), forward = $('#nav-forward');
  if (back) back.disabled = historyPosition <= 0;
  if (forward) forward.disabled = historyPosition >= historyFurthest;
}

function showView(name, options = {}) {
  if (!APP_VIEWS.has(name)) name = 'importa';
  if (!historyTrailId) restoreHistoryEntry();
  const recordId = routeRecordId(name, options.recordId);
  const historyMode = options.historyMode || 'push';
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $('#view-' + name); if (el) el.classList.add('active');
  if (typeof document !== 'undefined') document.body.dataset.view = name;
  if (typeof closeMenu === 'function') closeMenu();
  $$('#tabs .tab').forEach(b => {
    const active = b.dataset.view === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const sameRoute = activeView === name && ((history.state && history.state.recordId) || null) === recordId;
  activeView = name;
  const state = { bustaChiara: true, trailId: historyTrailId, view: name, recordId, position: historyPosition };
  try {
    if (historyMode === 'replace' || (historyMode === 'push' && sameRoute)) {
      history.replaceState(state, '', routeUrl(name));
      persistHistoryLedger();
    } else if (historyMode === 'push') {
      const nextPosition = historyPosition + 1;
      state.position = nextPosition;
      history.pushState(state, '', routeUrl(name));
      historyPosition = nextPosition;
      historyFurthest = nextPosition; // pushState elimina le eventuali schermate "Avanti" dell'app
      persistHistoryLedger();
    }
  } catch (error) { /* file locale o browser senza History API: le schede continuano a funzionare */ }
  updateHistoryButtons();
  window.scrollTo({ top: 0 });
}

function renderRoute(name, recordId) {
  if (name === 'verifica') {
    if (!draft) {
      const saved = Store.data.records.find(record => record.id === recordId);
      if (!saved) return false;
      draft = {
        record: JSON.parse(JSON.stringify(saved)),
        warnings: ['Stai modificando una busta già salvata.'],
        previewPages: SourcePreviewCache.get(saved.id) || [],
        activeSource: null,
      };
    }
    renderVerifica();
  } else if (name === 'dettaglio') return renderDettaglio(recordId || routeRecordId(name));
  else if (name === 'riassunto') return renderRiassunto(recordId || routeRecordId(name));
  else if (name === 'importa') renderImporta();
  else if (name === 'consigli') renderConsigli();
  else if (name === 'guida') renderGuida();
  else if (name === 'progetto') renderProgetto();
  else if (name === 'impostazioni') renderImpostazioni();
  return true;
}

function navigateTo(name, recordId = null) {
  if (!APP_VIEWS.has(name)) name = 'importa';
  if (!renderRoute(name, recordId)) {
    name = Store.data.records.length ? 'riassunto' : 'importa';
    recordId = routeRecordId(name);
    renderRoute(name, recordId);
  }
  showView(name, { recordId });
}

function handleHistoryPopState(event) {
  const state = event.state;
  if (!isAppHistoryState(state)) {
    // La History API non espone eventuali pagine avanti/indietro estranee all'app:
    // i pulsanti BustaChiara promettono quindi soltanto schermate registrate dall'app.
    historyPosition = 0;
    historyFurthest = 0;
    updateHistoryButtons();
    return;
  }
  closeInfo();
  const restored = restoreHistoryEntry(state);
  let name = APP_VIEWS.has(restored.view) ? restored.view : 'importa';
  let recordId = restored.recordId || null;
  if (!renderRoute(name, recordId)) {
    name = Store.data.records.length ? 'riassunto' : 'importa';
    recordId = routeRecordId(name);
    renderRoute(name, recordId);
  }
  showView(name, { historyMode: 'none', recordId });
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  navigateTo(b.dataset.view);
});

/* ============================================================
   IMPORTA
   ============================================================ */
function renderImporta() {
  const last = recSorted().slice(-1)[0];
  $('#view-importa').innerHTML = `
  <div class="home">
    <div id="dropzone" role="button" tabindex="0" aria-describedby="dropzone-help">
      <span class="dz-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
      <b>Carica la busta paga</b>
      <span id="dropzone-help" class="muted">Tocca o trascina qui · PDF o foto</span>
      <input type="file" id="file-input" accept="application/pdf,image/*" aria-label="Scegli un PDF o un'immagine della busta paga" hidden>
    </div>
    <div id="import-status" role="status" aria-live="polite" style="display:none">
      <p id="import-msg" class="muted"></p><progress id="import-bar" max="1" value="0"></progress>
    </div>
    <p class="home-privacy"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Resta sul tuo dispositivo, non viene inviata a nessuno.</p>
    ${last ? `<button type="button" class="home-last" id="home-last">Ultima busta: ${esc(periodoLabel(last.periodo))} · ${fmtEur(last.totali.netto)} € ›</button>` : ''}
  </div>`;
  const lastButton = $('#home-last');
  if (lastButton) lastButton.addEventListener('click', () => navigateTo('riassunto', last.id));
  const dz = $('#dropzone'), fi = $('#file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); fi.value = ''; });
}
function importStatus(msg, frac) {
  $('#import-status').style.display = 'block';
  $('#import-msg').textContent = msg;
  if (frac != null) $('#import-bar').value = frac;
}

async function handleFile(file) {
  try {
    if (file.size > 35 * 1024 * 1024) {
      toast('Il file supera 35 MB: prova a ridurre la scansione o usare una foto più leggera.');
      return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      importStatus('Leggo il PDF…', 0.1);
      const buf = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: buf });
      // PDF protetti: chiediamo la password (resta sul dispositivo come tutto il resto)
      task.onPassword = (updatePassword, reason) => {
        const msg = reason === 2
          ? 'Password sbagliata. Riprova:'
          : 'Questo PDF è protetto da password.\nInseriscila per aprirlo (non viene salvata né inviata da nessuna parte):';
        const pw = prompt(msg);
        if (pw === null) { importStatus('Apertura annullata: PDF protetto.', 0); task.destroy(); return; }
        updatePassword(pw);
      };
      const pdf = await task.promise;
      const pages = [];
      const pageSizes = [];
      const pdfPages = [];
      let chars = 0;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        pdfPages.push(page);
        const viewport = page.getViewport({ scale: 1 });
        pageSizes.push({ width: viewport.width, height: viewport.height });
        const tc = await page.getTextContent();
        const items = tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.height || it.transform[3] || 10) }));
        chars += items.reduce((s, it) => s + it.str.length, 0);
        pages.push(items);
        importStatus(`Leggo il PDF… pagina ${p}/${pdf.numPages}`, 0.1 + 0.5 * p / pdf.numPages);
      }
      if (chars > 150) {
        const weakPages = pages.map((items, index) => pageNeedsOcr(items) ? index : -1).filter(index => index >= 0);
        const previews = [];
        for (let p = 0; p < pdfPages.length; p++) {
          const weak = weakPages.includes(p);
          const rendered = await renderPage(pdfPages[p], weak ? 2.6 : 1.35);
          if (weak) {
            importStatus(`Pagina ${p + 1}: integro solo le zone senza testo…`, .55 + .25 * (p + 1) / pdfPages.length);
            // Il PDF renderizzato ha già orientamento e geometria corretti. Non lo
            // ritagliamo né deformiamo: così coordinate native, OCR e anteprima
            // condividono esattamente lo stesso sistema di riferimento.
            const data = await ocrDataMulti(rendered, (m, f) => importStatus(`OCR selettivo pagina ${p + 1}: ${m}`, .55 + .25 * ((p + (f || 0)) / pdfPages.length)));
            const ocrItems = ocrItemsToPdfCoordinates(ocrToItems(data, rendered), pageSizes[p]);
            pages[p] = mergePageItems(pages[p], ocrItems);
          }
          previews.push(canvasPreviewDataUrl(rendered));
        }
        const { record, warnings } = Parser.parsePdfPages(pages, { pageSizes });
        record.meta.fileName = file.name;
        if (weakPages.length) warnings.unshift(`OCR selettivo applicato a ${weakPages.length} pagina/e con testo digitale insufficiente.`);
        importStatus('Fatto', 1);
        proponiDopoImport(record, warnings, previews);
      } else {
        importStatus('PDF senza testo (scansione): avvio la lettura ottica locale…', 0.15);
        const canvases = [];
        for (let p = 1; p <= pdf.numPages; p++) canvases.push(await renderPage(await pdf.getPage(p), 2.6));
        const { record, warnings, previewPages } = await parseDaOcr(canvases, (m, f) => importStatus('Lettura ottica: ' + m, 0.15 + 0.8 * (f || 0)));
        record.meta.fileName = file.name;
        proponiDopoImport(record, warnings, previewPages);
      }
    } else if (/^image\//.test(file.type)) {
      importStatus('Preparo l’immagine…', 0.1);
      const canvas = await imageToCanvas(file);
      const { record, warnings, previewPages } = await parseDaOcr([canvas], (m, f) => importStatus('Lettura ottica: ' + m, 0.1 + 0.85 * (f || 0)));
      record.meta.fileName = file.name;
      proponiDopoImport(record, warnings, previewPages);
    } else {
      toast('Formato non supportato: usa PDF o immagine.');
    }
  } catch (err) {
    console.error(err);
    importStatus('Errore: ' + err.message, 0);
    toast('Non sono riuscito a leggere il file: prova con un PDF più nitido o una foto dritta e ben illuminata.');
  }
}
function pageNeedsOcr(items) {
  const meaningful = (items || []).filter(item => /[A-Za-zÀ-ù0-9]{2}/.test(item.str || ''));
  const chars = meaningful.reduce((sum, item) => sum + String(item.str || '').trim().length, 0);
  const numeric = meaningful.filter(item => /\d/.test(item.str || '')).length;
  const labels = meaningful.filter(item => /NETTO|TOTALE|RETRIBUZ|TRATTEN|COMPETEN|IRPEF|INPS|TFR/i.test(item.str || '')).length;
  return chars < 95 || meaningful.length < 16 || numeric < 4 || labels < 1;
}
function mergePageItems(nativeItems, ocrItems) {
  const result = [...(nativeItems || [])];
  for (const item of ocrItems || []) {
    const key = aliasKey(item.str);
    if (!key) continue;
    const duplicate = result.some(existing => aliasKey(existing.str) === key
      && Math.abs(Number(existing.x || 0) - Number(item.x || 0)) < 18
      && Math.abs(Number(existing.y || 0) - Number(item.y || 0)) < 12);
    if (!duplicate) result.push(item);
  }
  return result;
}
function ocrItemsToPdfCoordinates(items, pageSize) {
  const scale = pageSize && pageSize.width ? pageSize.width / 600 : 1;
  return (items || []).map(item => ({
    str: item.str, x: Number(item.x || 0) * scale, y: Number(item.y || 0) * scale,
    w: Number(item.w || 0) * scale, h: Number(item.h || 0) * scale,
  }));
}
function canvasPreviewDataUrl(source) {
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / Math.max(1, source.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .86);
}
async function renderPage(page, scale) {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas;
}
function imageToCanvas(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      // gli screenshot vanno ingranditi: il testo piccolo è il primo motivo di letture fallite
      const TARGET = 2400, MAX = 3400;
      let k = TARGET / Math.max(img.width, 1);
      k = Math.max(k, 1); k = Math.min(k, 3, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // scala di grigi con leggero aumento di contrasto: aiuta l'OCR
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const a = d.data;
      for (let i = 0; i < a.length; i += 4) {
        let g = a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114;
        g = Math.max(0, Math.min(255, (g - 128) * 1.25 + 132));
        a[i] = a[i + 1] = a[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
      URL.revokeObjectURL(img.src); res(c);
    };
    img.onerror = () => rej(new Error('immagine non leggibile'));
    img.src = URL.createObjectURL(file);
  });
}

function cloneCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

function trimLightMargins(source) {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const { width, height } = source;
  if (!width || !height) return source;
  const data = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(2, Math.floor(Math.max(width, height) / 1400));
  let left = width, right = 0, top = height, bottom = 0;
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4;
    const gray = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
    if (gray > 242) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right <= left || bottom <= top) return source;
  const pad = Math.round(Math.min(width, height) * .012);
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  if (left < width * .015 && right > width * .985 && top < height * .015 && bottom > height * .985) return source;
  const canvas = document.createElement('canvas');
  canvas.width = right - left + 1; canvas.height = bottom - top + 1;
  canvas.getContext('2d').drawImage(source, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function estimateSmallSkew(source) {
  const scale = Math.min(1, 800 / Math.max(source.width, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const tiny = document.createElement('canvas'); tiny.width = width; tiny.height = height;
  const ctx = tiny.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const samples = [];
  for (let y = 2; y < height - 2; y += 3) for (let x = 2; x < width - 2; x += 3) {
    const i = (y * width + x) * 4;
    const gray = pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114;
    if (gray < 145) samples.push([x, y]);
  }
  if (samples.length < 250) return 0;
  let best = { angle: 0, score: -Infinity };
  for (let angle = -3; angle <= 3.001; angle += .5) {
    const tangent = Math.tan(angle * Math.PI / 180);
    const rows = new Uint16Array(height + Math.ceil(width * .06) + 4);
    for (const [x, y] of samples) {
      const row = Math.round(y + x * tangent + width * .03);
      if (row >= 0 && row < rows.length && rows[row] < 65535) rows[row]++;
    }
    let score = 0;
    for (const count of rows) score += count * count;
    if (score > best.score) best = { angle, score };
  }
  return Math.abs(best.angle) >= .5 ? best.angle : 0;
}

function rotateCanvas(source, degrees) {
  if (!degrees) return source;
  const radians = -degrees * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians)), cos = Math.abs(Math.cos(radians));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(source.width * cos + source.height * sin);
  canvas.height = Math.ceil(source.width * sin + source.height * cos);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(radians);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function projectionScore(source, axis) {
  const scale = Math.min(1, 520 / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement('canvas'); sample.width = width; sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const length = axis === 'row' ? height : width;
  const counts = new Float64Array(length);
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const i = (y * width + x) * 4;
    const gray = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
    if (gray < 175) counts[axis === 'row' ? y : x]++;
  }
  const mean = counts.reduce((sum, value) => sum + value, 0) / Math.max(1, counts.length);
  const variance = counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, counts.length);
  return Math.sqrt(variance) / Math.max(1, mean);
}

function autoOrientCanvas(source) {
  const row = projectionScore(source, 'row'), column = projectionScore(source, 'column');
  if (column > row * 1.28) {
    const rotated = rotateCanvas(source, 90);
    rotated._ocrCorrections = ['orientamento 90°'];
    return rotated;
  }
  return source;
}

/* Correzione prospettica conservativa per foto di un foglio chiaro su sfondo
   più scuro. Se il bordo del foglio non è sufficientemente evidente non tocca
   l'immagine, evitando deformazioni sui PDF e sugli screenshot. */
function perspectiveCorrectCanvas(source) {
  const scale = Math.min(1, 720 / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement('canvas'); sample.width = width; sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const grayAt = (x, y) => { const i = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4; return data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; };
  let edge = 0, edgeCount = 0;
  for (let x = 0; x < width; x += 8) { edge += grayAt(x, 2) + grayAt(x, height - 3); edgeCount += 2; }
  for (let y = 0; y < height; y += 8) { edge += grayAt(2, y) + grayAt(width - 3, y); edgeCount += 2; }
  edge /= Math.max(1, edgeCount);
  let center = 0, centerCount = 0;
  for (let y = Math.round(height * .25); y < height * .75; y += 12) for (let x = Math.round(width * .25); x < width * .75; x += 12) { center += grayAt(x, y); centerCount++; }
  center /= Math.max(1, centerCount);
  if (center - edge < 22 || center < 185) return source;
  const threshold = Math.min(238, edge + Math.max(22, (center - edge) * .45));
  const spans = [];
  for (let y = 0; y < height; y += 3) {
    let left = -1, right = -1;
    for (let x = 0; x < width; x += 2) if (grayAt(x, y) >= threshold) { left = x; break; }
    for (let x = width - 1; x >= 0; x -= 2) if (grayAt(x, y) >= threshold) { right = x; break; }
    if (left >= 0 && right - left >= width * .52) spans.push({ y, left, right });
  }
  if (spans.length < height / 12) return source;
  const topY = spans[0].y, bottomY = spans[spans.length - 1].y;
  const bandAverage = target => {
    const band = spans.filter(span => Math.abs(span.y - target) <= Math.max(9, height * .035));
    if (!band.length) return null;
    return { left: band.reduce((sum, span) => sum + span.left, 0) / band.length, right: band.reduce((sum, span) => sum + span.right, 0) / band.length };
  };
  const top = bandAverage(topY + (bottomY - topY) * .12), bottom = bandAverage(topY + (bottomY - topY) * .88);
  if (!top || !bottom) return source;
  const topWidth = top.right - top.left, bottomWidth = bottom.right - bottom.left;
  const distortion = Math.abs(topWidth - bottomWidth) / Math.max(topWidth, bottomWidth);
  if (distortion < .035 || distortion > .32) return source;
  const y0 = Math.max(0, Math.round(topY / scale)), y1 = Math.min(source.height, Math.round(bottomY / scale));
  const targetWidth = Math.round(Math.max(topWidth, bottomWidth) / scale);
  const output = document.createElement('canvas'); output.width = targetWidth; output.height = Math.max(1, y1 - y0);
  const out = output.getContext('2d'); out.fillStyle = '#fff'; out.fillRect(0, 0, output.width, output.height);
  for (let y = 0; y < output.height; y += 2) {
    const t = y / Math.max(1, output.height - 1);
    const left = (top.left + (bottom.left - top.left) * t) / scale;
    const right = (top.right + (bottom.right - top.right) * t) / scale;
    out.drawImage(source, left, y0 + y, Math.max(1, right - left), Math.min(2, output.height - y), 0, y, output.width, Math.min(2, output.height - y));
  }
  output._ocrCorrections = [...(source._ocrCorrections || []), 'prospettiva del foglio'];
  return output;
}

function localThresholdCanvas(source) {
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const block = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) / 45));
  for (let by = 0; by < canvas.height; by += block) for (let bx = 0; bx < canvas.width; bx += block) {
    const maxY = Math.min(canvas.height, by + block), maxX = Math.min(canvas.width, bx + block);
    let sum = 0, count = 0;
    for (let y = by; y < maxY; y += 3) for (let x = bx; x < maxX; x += 3) {
      const i = (y * canvas.width + x) * 4;
      sum += data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; count++;
    }
    const threshold = Math.max(125, Math.min(225, sum / Math.max(1, count) - 13));
    for (let y = by; y < maxY; y++) for (let x = bx; x < maxX; x++) {
      const i = (y * canvas.width + x) * 4;
      const gray = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      const value = gray < threshold ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function prepareOcrCanvas(source) {
  const oriented = autoOrientCanvas(source);
  const perspective = perspectiveCorrectCanvas(oriented);
  const trimmed = trimLightMargins(perspective);
  const result = trimLightMargins(rotateCanvas(trimmed, estimateSmallSkew(trimmed)));
  result._ocrCorrections = [...(perspective._ocrCorrections || []), ...(result === trimmed ? [] : ['inclinazione'])];
  return result;
}

/* ---------- OCR (tesseract.js inglobato, zero rete) ---------- */
const OCR = { worker: null, initing: null };
async function getOcrWorker(status) {
  if (OCR.worker) return OCR.worker;
  if (!OCR.initing) OCR.initing = (async () => {
    status && status('inizializzo il motore di lettura (prima volta: ~10s)…', 0);
    const coreJS = b64ToText(TESS_CORE_B64);
    const workerJS = b64ToText(TESS_WORKER_B64);
    const shim = 'self.__ITA_B64="' + ITA_B64 + '";\n' +
      '(function(){function u8(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}\n' +
      'var of_=self.fetch?self.fetch.bind(self):null;\n' +
      'self.fetch=function(url,opts){try{if(typeof url==="string"&&url.indexOf(".traineddata")!==-1){return Promise.resolve(new Response(u8(self.__ITA_B64),{status:200}));}}catch(e){}\n' +
      'if(of_)return of_(url,opts);return Promise.reject(new Error("offline"));};})();\n';
    const blob = new Blob([coreJS, '\n', shim, workerJS], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = await Tesseract.createWorker('ita', 1, {
      workerPath: workerUrl, workerBlobURL: false, corePath: 'embedded.wasm.js',
      langPath: 'embedded://tessdata', cacheMethod: 'none', gzip: true,
      logger: m => { if (status && m.status) status(m.status, m.progress); },
    });
    await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
    OCR.worker = worker;
    return worker;
  })();
  return OCR.initing;
}
async function ocrData(canvas, status, pageSegMode = '3') {
  const worker = await getOcrWorker(status);
  status && status('riconosco il testo…', 0.5);
  await worker.setParameters({ tessedit_pageseg_mode: pageSegMode, preserve_interword_spaces: '1', user_defined_dpi: '300' });
  const { data } = await worker.recognize(canvas.toDataURL('image/png'));
  status && status('fatto', 1);
  return data;
}
async function ocr(canvas, status) { return (await ocrData(canvas, status)).text || ''; }

function mergeOcrPasses(primary, secondary) {
  const words = [...(primary.words || [])];
  const alternatives = [];
  for (const word of secondary.words || []) {
    if (!word.text || !word.bbox) continue;
    const cx = (word.bbox.x0 + word.bbox.x1) / 2, cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const duplicateIndex = words.findIndex(existing => {
      if (!existing.bbox) return false;
      const ex = (existing.bbox.x0 + existing.bbox.x1) / 2, ey = (existing.bbox.y0 + existing.bbox.y1) / 2;
      const tolerance = Math.max(8, word.bbox.y1 - word.bbox.y0);
      const overlap = Math.max(0, Math.min(existing.bbox.x1, word.bbox.x1) - Math.max(existing.bbox.x0, word.bbox.x0))
        * Math.max(0, Math.min(existing.bbox.y1, word.bbox.y1) - Math.max(existing.bbox.y0, word.bbox.y0));
      const existingArea = Math.max(1, (existing.bbox.x1 - existing.bbox.x0) * (existing.bbox.y1 - existing.bbox.y0));
      const wordArea = Math.max(1, (word.bbox.x1 - word.bbox.x0) * (word.bbox.y1 - word.bbox.y0));
      return Math.abs(cx - ex) <= tolerance && Math.abs(cy - ey) <= tolerance && overlap / Math.min(existingArea, wordArea) >= .25;
    });
    if (duplicateIndex < 0) words.push(word);
    else {
      const existing = words[duplicateIndex];
      const same = aliasKey(existing.text) === aliasKey(word.text);
      if (!same) alternatives.push({ primary: existing, secondary: word });
      // Sono due passaggi dello stesso motore e la scala è confrontabile: nella
      // versione fusa una posizione può avere un solo token, mentre i due esiti
      // indipendenti restano disponibili separatamente per il consenso.
      if ((word.confidence || 0) > (existing.confidence || 0)) words[duplicateIndex] = word;
    }
  }
  return Object.assign({}, primary, { words, text: words.map(word => word.text).join(' '), _passAlternatives: alternatives });
}

async function ocrDataMulti(canvas, status) {
  const primary = await ocrData(canvas, (message, progress) => status && status('lettura 1/3: ' + message, (progress || 0) * .48), '3');
  // La seconda lettura non è più riservata ai casi già giudicati deboli: un
  // numero apparentemente sicuro può essere quello sbagliato. Ogni scansione
  // viene quindi riletta con segmentazione e contrasto differenti.
  status && status('lettura 2/3: miglioro contrasto e tabelle…', .49);
  const thresholded = localThresholdCanvas(canvas);
  const secondary = await ocrData(thresholded, (message, progress) => status && status('lettura 2/3: ' + message, .49 + (progress || 0) * .25), '6');
  const merged = mergeOcrPasses(primary, secondary);
  merged._primaryResult = primary;
  merged._secondaryResult = secondary;
  try {
    const specialist = await AiOcr.recognize(canvas, (message, progress) => status && status(`lettura 3/3: ${message}`, .75 + (progress || 0) * .25));
    const result = AiOcr.mergeSpecialist(merged, specialist);
    // Conserviamo anche l'esito indipendente: il parser lo valuta separatamente
    // prima di applicare il consenso, invece di appiattire subito i conflitti.
    result._specialistResult = specialist;
    return result;
  } catch (_) {
    // Gli asset AI sono opzionali: senza rete/cache o su browser incompatibili
    // la pipeline prosegue sempre con le due letture Tesseract già completate.
    return merged;
  }
}

/* Converte le parole OCR (con coordinate) negli "item" usati dal parser dei PDF,
   unendo le parole vicine non numeriche (es. "IMPORTO"+"BASE" → "IMPORTO BASE"). */
const OCR_NUM_RE = /^\(?-?\d{1,3}(\.\d{3})*(,\d+)?\)?%?€?$/;
function ocrToItems(data, canvas) {
  const canvasH = canvas.height;
  // coordinate riportate alla scala tipica dei PDF (~600 pt di larghezza),
  // così le tolleranze del parser valgono anche per screenshot e foto
  const K = 600 / Math.max(canvas.width, 1);
  const rumore = (s, bw, bh) => {
    if (bw < bh * 0.45 && s.length >= 2) return true;               // testo verticale dei margini
    if (s.length <= 2 && !/^(\d{1,2}|%|€|GG|gg\.?|h|N\.?)$/i.test(s)) return true; // frammenti tipo "im]"
    if (!/[0-9A-Za-zÀ-ù€%]/.test(s)) return true;                    // sola punteggiatura
    const punct = (s.match(/[^0-9A-Za-zÀ-ù]/g) || []).length;
    if (s.length <= 4 && punct >= Math.ceil(s.length / 3) && !/^\d|^F\.do$/i.test(s)) return true;
    return false;
  };
  const words = (data.words || [])
    .filter(w => w.text && w.text.trim() && (w.confidence == null || w.confidence > 30))
    .map(w => ({ str: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, yc: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }))
    .filter(w => !rumore(w.str, w.x1 - w.x0, w.h));
  words.sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  // raggruppa per riga
  const righe = [];
  for (const w of words) {
    let r = righe.find(rr => Math.abs(rr.yc - w.yc) < Math.max(8, w.h * 0.6));
    if (!r) { r = { yc: w.yc, ws: [] }; righe.push(r); }
    r.ws.push(w);
  }
  const items = [];
  const isCodice = s => /^(?=.{1,12}$)(?=.*\d)[A-Z0-9][A-Z0-9./_-]*$/i.test(s);
  for (const r of righe) {
    r.ws.sort((a, b) => a.x0 - b.x0);
    const y = (canvasH - r.yc) * K;   // stessa y per tutte le celle della riga
    let cur = null;
    const chiudi = () => { if (cur) items.push({ str: cur.str, x: cur.x0 * K, y, w: (cur.x1 - cur.x0) * K, h: cur.h * K }); };
    for (const w of r.ws) {
      const testo = w.str;
      const numerico = OCR_NUM_RE.test(testo);
      if (cur && !cur.numerico && !numerico && !isCodice(testo) && !isCodice(cur.str.split(' ')[0]) &&
          (w.x0 - cur.x1) < Math.max(14, cur.h * 0.9)) {
        cur.str += ' ' + testo; cur.x1 = w.x1;
      } else {
        chiudi();
        cur = { str: testo, x0: w.x0, x1: w.x1, h: w.h, numerico };
      }
    }
    chiudi();
  }
  return items;
}
/* Doppio tentativo: parser a coordinate (come per i PDF) + parser testuale;
   vince quello che estrae di più e l'altro riempie i buchi. */
function scoreEstrazione(r) {
  let s = r.voci.length * 2;
  s += r.voci.filter(v => v.codice).length;            // struttura riconosciuta
  s += r.voci.filter(v => v.base != null && (v.competenza != null || v.trattenuta != null)).length;
  const t = r.totali || {};
  for (const k of ['competenze', 'trattenute', 'netto']) if (t[k] != null) s += 3;
  if (r.periodo) s += 2;
  if (r.derivati && r.derivati.imponibileIrpef != null) s += 2;
  if (r.tfr && r.tfr.quotaMese != null) s += 2;
  if (r.ratei && r.ratei.ferie) s += 2;
  if (r.ccnl && r.ccnl.cnel) s += 2;
  return s;
}
const CAMPI_SCALARI = ['periodo', 'azienda.nome', 'azienda.cf', 'dipendente.nome', 'dipendente.cf', 'dipendente.livello', 'dipendente.qualifica', 'dipendente.dataAssunzione', 'ccnl.cnel', 'ccnl.descrizione', 'elementi.pagaBase', 'elementi.superminimo', 'elementi.contingenza', 'elementi.totale', 'orario.oreOrdinarie', 'orario.giorniLavorati', 'orario.pagaOraria', 'orario.pagaGiornaliera', 'totali.competenze', 'totali.trattenute', 'totali.arrotondamento', 'totali.netto', 'tfr.retribUtile', 'tfr.quotaMese', 'tfr.fondo3112', 'tfr.quotaAnno', 'tfr.rivalutazione', 'tfr.aFondi', 'progressivi.impInps', 'progressivi.impIrpef', 'progressivi.irpefPagata', 'ratei.ferie', 'ratei.permessi'];
function unisciEstrazioni(a, b) {
  const [base, altro] = scoreEstrazione(a.record) >= scoreEstrazione(b.record) ? [a, b] : [b, a];
  for (const p of CAMPI_SCALARI) {
    const alternative = getPath(altro.record, p);
    if (alternative == null) continue;
    const currentConfidence = Parser.fieldConfidence(base.record, p) || 0;
    const alternativeConfidence = Parser.fieldConfidence(altro.record, p) || 0;
    if (getPath(base.record, p) == null || alternativeConfidence > currentConfidence + .12) {
      setPath(base.record, p, alternative);
      if (altro.record.meta && altro.record.meta.fields && altro.record.meta.fields[p]) {
        base.record.meta.fields[p] = altro.record.meta.fields[p];
      }
    }
  }
  for (const voice of altro.record.voci || []) {
    const amount = voice.competenza ?? voice.trattenuta;
    const duplicate = base.record.voci.some(existing => aliasKey(existing.descrizione) === aliasKey(voice.descrizione)
      && (existing.competenza ?? existing.trattenuta) === amount);
    if (!duplicate) base.record.voci.push(voice);
  }
  base.record.derivati = Parser.derivaIndice(base.record);
  base.record.meta.fonte = 'ocr';
  base.record.meta.consistency = Parser.valutaCoerenza(base.record);
  base.record.meta.qualita = Parser.valutaQualita(base.record);
  base.warnings = [...new Set([...(base.warnings || []), ...(altro.warnings || [])])];
  return base;
}

function consensusValueKey(value) {
  if (typeof value === 'number') return `n:${Math.round(value * 100) / 100}`;
  if (value && typeof value === 'object') {
    const ordered = Object.keys(value).sort().reduce((result, key) => { result[key] = value[key]; return result; }, {});
    return `o:${JSON.stringify(ordered)}`;
  }
  return `s:${aliasKey(value)}`;
}
function unisciEstrazioniMultiple(extractions) {
  const valid = (extractions || []).filter(item => item && item.record);
  if (!valid.length) throw new Error('nessuna lettura disponibile');
  const votes = valid.map(item => JSON.parse(JSON.stringify(item.record)));
  let result = valid[0];
  for (let index = 1; index < valid.length; index++) result = unisciEstrazioni(result, valid[index]);
  const conflicts = {};
  result.record.meta = result.record.meta || {};
  result.record.meta.fields = result.record.meta.fields || {};
  for (const path of CAMPI_SCALARI) {
    const groups = new Map();
    votes.forEach((record, reader) => {
      const value = getPath(record, path); if (value == null) return;
      const key = consensusValueKey(value);
      if (!groups.has(key)) groups.set(key, { value, readers: [], confidence: 0 });
      const group = groups.get(key);
      group.readers.push(reader);
      group.confidence = Math.max(group.confidence, Parser.fieldConfidence(record, path) || 0);
    });
    const ranked = [...groups.values()].sort((left, right) => right.readers.length - left.readers.length || right.confidence - left.confidence);
    if (!ranked.length) continue;
    if (ranked[0].readers.length >= 2) {
      setPath(result.record, path, ranked[0].value);
      result.record.meta.fields[path] = Object.assign({}, result.record.meta.fields[path], {
        confidence: Math.max(Number(result.record.meta.fields[path] && result.record.meta.fields[path].confidence) || 0, Math.min(.98, .86 + ranked[0].readers.length * .03)),
        method: `consenso di ${ranked[0].readers.length} letture locali`, consensusReaders: ranked[0].readers.length,
      });
    } else if (ranked.length > 1) {
      conflicts[path] = ranked.slice(0, 4).map(group => group.value);
      const current = result.record.meta.fields[path] || {};
      result.record.meta.fields[path] = Object.assign({}, current, { confidence: Math.min(Number(current.confidence) || .62, .62), conflictingReads: ranked.length });
    }
  }
  for (const voice of result.record.voci || []) {
    const amount = voice.competenza ?? voice.trattenuta;
    const readers = votes.filter(record => (record.voci || []).some(candidate => aliasKey(candidate.descrizione) === aliasKey(voice.descrizione)
      && Math.abs(Number(candidate.competenza ?? candidate.trattenuta) - Number(amount)) < .01)).length;
    voice.meta = Object.assign({}, voice.meta, { consensusReaders: readers, confidence: Math.max(Number(voice.meta && voice.meta.confidence) || 0, readers >= 2 ? .9 : .58) });
  }
  Parser.ripulisciRecord(result.record);
  result.record.meta.consensusConflicts = conflicts;
  result.record.meta.recognition = {
    strategy: 'multi-lettura-con-controlli', readers: valid.length,
    checks: ['testo e coordinate', 'contrasto alternativo', 'PP-OCR locale', 'quadrature contabili', 'profilo locale confermato'],
  };
  return result;
}
/* Pipeline completa: una o più immagini → record da verificare. */
async function parseDaOcr(canvases, status) {
  const primaryPages = [];
  const secondaryPages = [];
  const specialistPages = [];
  const pageSizes = [];
  const previewPages = [];
  const corrections = [];
  for (let i = 0; i < canvases.length; i++) {
    const prepared = prepareOcrCanvas(canvases[i]);
    previewPages.push(canvasPreviewDataUrl(prepared));
    const scale = 600 / Math.max(prepared.width, 1);
    pageSizes.push({ width: 600, height: prepared.height * scale });
    if (prepared._ocrCorrections && prepared._ocrCorrections.length) corrections.push(`pagina ${i + 1}: ${prepared._ocrCorrections.join(', ')}`);
    const data = await ocrDataMulti(prepared, (m, f) => status && status(`${canvases.length > 1 ? 'pagina ' + (i + 1) + '/' + canvases.length + ': ' : ''}${m}`, ((i + (f || 0)) / canvases.length)));
    primaryPages.push(ocrToItems(data._primaryResult || data, prepared));
    secondaryPages.push(ocrToItems(data._secondaryResult || data, prepared));
    specialistPages.push(data._specialistResult ? ocrToItems(data._specialistResult, prepared) : []);
  }
  const textForPages = pages => {
    let output = '';
    for (const page of pages) {
      const rows = new Map();
      for (const item of page) { const key = Math.round(item.y / 3); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(item); }
      output += [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(cell => cell.str).join(' ')).join('\n') + '\n';
    }
    return output;
  };
  const parseEngine = (pages, source) => unisciEstrazioni(
    Parser.parsePdfPages(pages, { source, pageSizes }),
    Parser.parseFreeText(textForPages(pages)),
  );
  // Un solo voto per motore OCR: coordinate e testo sono due interpretazioni
  // dello stesso flusso di parole e vengono prima fuse, non contate due volte.
  const engineExtractions = [parseEngine(primaryPages, 'ocr-tesseract-1'), parseEngine(secondaryPages, 'ocr-tesseract-2')];
  if (specialistPages.some(page => page.length)) engineExtractions.push(parseEngine(specialistPages, 'ocr-pp'));
  const esito = unisciEstrazioniMultiple(engineExtractions);
  esito.warnings = ['Lettura ottica (OCR): i numeri possono contenere errori di lettura, controlla TUTTI i campi prima di salvare.',
    ...(corrections.length ? [`Correzioni automatiche immagine — ${corrections.join('; ')}.`] : []),
    ...esito.warnings.filter(w => !/precisione limitata/.test(w))];
  esito.previewPages = previewPages;
  return esito;
}

/* ============================================================
   VERIFICA (conferma/correzione prima del salvataggio)
   ============================================================ */

function rememberSourcePreview(record, previewPages) {
  if (!record || !record.id || !previewPages || !previewPages.length) return;
  SourcePreviewCache.set(record.id, previewPages);
  while (SourcePreviewCache.size > 3) SourcePreviewCache.delete(SourcePreviewCache.keys().next().value);
}

function prepareRecord(record) {
  if (!record.id) record.id = uid();
  applicaProfiloLayout(record);
  applicaAliasLocali(record);
  Parser.ripulisciRecord(record);
  record.meta = record.meta || { fonte: 'manuale' };
  record.meta.qualita = Parser.valutaQualita(record);
  const hit = Parser.trovaCcnl(record, CCNL_DB, Store.data.customCcnl.map(reviveCustom));
  if (hit && !record.ccnlId) record.ccnlId = hit.id;
  return record;
}

function proponiDopoImport(record, warnings, previewPages = []) {
  const classification = record && record.meta && record.meta.documentClassification;
  if (classification && classification.inScope === false) {
    openInfo('Questo non sembra un cedolino', `<p>Il file è stato riconosciuto come <b>${esc(classification.label)}</b>.</p><p>Per evitare risultati inventati, BustaChiara non lo analizzerà e non lo salverà.</p><p class="muted small">Puoi chiudere questo messaggio e scegliere una busta paga da lavoro dipendente.</p>`);
    return;
  }
  prepareRecord(record);
  rememberSourcePreview(record, previewPages);
  const period = record.periodo ? periodoLabel(record.periodo) : 'Periodo da controllare';
  const net = record.totali && record.totali.netto != null ? `${fmtEur(record.totali.netto)} € netti` : 'Netto da controllare';
  openInfo('Documento letto', `<p><b>${esc(period)}</b> · ${esc(net)}</p><p>Scegli se andare subito al Riassunto oppure controllare prima i dati letti.</p><div class="import-choice"><button type="button" class="primary" id="import-save-analyze">Salva e analizza</button><button type="button" class="ghost" id="import-check-data">Controlla i dati</button></div><p class="muted small">Il documento resta sul dispositivo. L’anteprima originale rimane soltanto nella memoria di questa sessione.</p>`);
  $('#import-save-analyze').addEventListener('click', () => {
    if (!salvaRecord(record, { confirmed: false, previewPages })) return;
    closeInfo(); completaSalvataggio(record);
  });
  $('#import-check-data').addEventListener('click', () => {
    closeInfo(); startVerifica(record, warnings, previewPages);
  });
}

function startVerifica(record, warnings, previewPages = []) {
  prepareRecord(record);
  const availablePreviews = previewPages && previewPages.length ? previewPages : (SourcePreviewCache.get(record.id) || []);
  rememberSourcePreview(record, availablePreviews);
  draft = { record, warnings: warnings || [], previewPages: availablePreviews, activeSource: null };
  renderVerifica();
  showView('verifica', { recordId: record.id });
}
const MAIN_FIELDS = [
  ['periodo.mese', 'Mese (1–12)'], ['periodo.anno', 'Anno'],
  ['totali.competenze', 'Lordo €'], ['totali.trattenute', 'Trattenute €'], ['totali.netto', 'Netto €'],
];
const FIELD_GROUPS = [
  { titolo: 'Persone e azienda', fields: [
    ['dipendente.nome', 'Dipendente'], ['dipendente.cf', 'Codice fiscale'], ['azienda.nome', 'Azienda'],
    ['dipendente.livello', 'Livello'], ['dipendente.qualifica', 'Qualifica'], ['dipendente.dataAssunzione', 'Data assunzione'],
  ]},
  { titolo: 'Paga e orario', info: 'elementi', fields: [
    ['elementi.pagaBase', 'Paga base €'], ['elementi.contingenza', 'Contingenza €'], ['elementi.superminimo', 'Superminimo €'],
    ['elementi.scatti', 'Scatti anzianità €'], ['elementi.totale', 'Totale elementi €'], ['orario.oreOrdinarie', 'Ore ordinarie lavorate'],
    ['orario.giorniLavorati', 'Giorni lavorati'], ['orario.pagaOraria', 'Paga all’ora €'], ['orario.pagaGiornaliera', 'Paga al giorno €'],
    ['totali.arrotondamento', 'Arrotondamento €'],
  ]},
  { titolo: 'TFR', info: 'tfr', fields: [
    ['tfr.retribUtile', 'Retribuzione utile TFR €'], ['tfr.quotaMese', 'Quota TFR del mese €'], ['tfr.fondo3112', 'Fondo TFR al 31/12 €'],
    ['tfr.rivalutazione', 'Rivalutazione €'], ['tfr.quotaAnno', 'Quota dell’anno €'], ['tfr.aFondi', 'TFR a fondi €'],
  ]},
  { titolo: 'Ferie e permessi', info: 'saldo', fields: [
    ['ratei.ferie.residuoAp', 'Ferie: residuo anno prima'], ['ratei.ferie.maturato', 'Ferie: maturate'], ['ratei.ferie.goduto', 'Ferie: usate quest’anno'], ['ratei.ferie.godutoAp', 'Ferie: usate dell’anno prima'], ['ratei.ferie.saldo', 'Ferie: rimaste'],
    ['ratei.permessi.residuoAp', 'Permessi: residuo anno prima'], ['ratei.permessi.maturato', 'Permessi: maturati'], ['ratei.permessi.goduto', 'Permessi: usati quest’anno'], ['ratei.permessi.godutoAp', 'Permessi: usati dell’anno prima'], ['ratei.permessi.saldo', 'Permessi: rimasti'],
  ]},
  { titolo: 'Progressivi dell’anno', info: 'progressivi', fields: [
    ['progressivi.impInps', 'Imponibile INPS progressivo €'], ['progressivi.impIrpef', 'Imponibile IRPEF progressivo €'], ['progressivi.irpefPagata', 'IRPEF pagata €'],
  ]},
];
const NUM_FIELDS = new Set([...MAIN_FIELDS, ...FIELD_GROUPS.flatMap(g => g.fields)].map(f => f[0]).filter(p => !/nome|cf|qualifica|dataAssunzione|livello/.test(p)));

function sourceButton(path, label = 'Mostra nel documento') {
  const meta = draft && draft.record && draft.record.meta && draft.record.meta.fields && draft.record.meta.fields[path];
  if (!meta || meta.visualTarget !== 'value' || !meta.bbox || meta.page == null || !(draft.previewPages || [])[meta.page]) return '';
  return `<button type="button" class="source-btn" data-source-path="${esc(path)}" title="${esc(label)}" aria-label="${esc(label)}">⌖</button>`;
}
function sourceViewerHtml() {
  if (!draft.previewPages || !draft.previewPages.length) return '';
  return `<aside class="document-viewer" aria-label="Documento originale">
    <div class="document-viewer-head"><div><b>Documento originale</b><p id="source-location">Premi ⌖ accanto a un campo o a una voce.</p></div><span class="privacy-local">Solo in memoria</span></div>
    <div class="document-pages">${draft.previewPages.map((src, page) => `<div class="document-page" data-page="${page}">
      <div class="document-sheet"><img src="${src}" alt="Pagina ${page + 1} del documento"><span class="source-highlight" hidden></span></div>
      <span class="page-number">Pagina ${page + 1}</span>
    </div>`).join('')}</div>
  </aside>`;
}
function showSourceEvidence(evidence) {
  if (!evidence || evidence.page == null || !evidence.bbox) return;
  const page = $(`.document-page[data-page="${evidence.page}"]`, $('#view-verifica'));
  const size = draft.record.meta && draft.record.meta.pageSizes && draft.record.meta.pageSizes[evidence.page];
  if (!page || !size || !size.width || !size.height) return;
  $$('.source-highlight', $('#view-verifica')).forEach(item => { item.hidden = true; });
  const highlight = $('.source-highlight', page);
  const box = evidence.bbox;
  const paddingX = Math.max(1.5, size.width * .004), paddingY = Math.max(1, size.height * .0025);
  const left = Math.max(0, Math.min(size.width, Number(box.x || 0) - paddingX));
  const right = Math.max(left, Math.min(size.width, Number(box.x || 0) + Number(box.w || 0) + paddingX));
  const bottom = Math.max(0, Math.min(size.height, Number(box.y || 0) - paddingY));
  const topPdf = Math.max(bottom, Math.min(size.height, Number(box.y || 0) + Number(box.h || 0) + paddingY));
  highlight.style.left = `${left / size.width * 100}%`;
  highlight.style.width = `${Math.max(1.4, (right - left) / size.width * 100)}%`;
  highlight.style.top = `${(size.height - topPdf) / size.height * 100}%`;
  highlight.style.height = `${Math.max(1.1, (topPdf - bottom) / size.height * 100)}%`;
  highlight.hidden = false;
  const location = $('#source-location');
  if (location) location.textContent = `Pagina ${evidence.page + 1}${evidence.snippet ? ` · ${String(evidence.snippet).slice(0, 72)}` : ''}`;
  page.classList.add('source-active');
  setTimeout(() => page.classList.remove('source-active'), 900);
  const pages = $('.document-pages', $('#view-verifica'));
  if (pages) pages.scrollTo({ top: Math.max(0, page.offsetTop - (pages.clientHeight - page.offsetHeight) / 2), behavior: 'smooth' });
  if (matchMedia('(max-width: 640px)').matches) $('.document-viewer', $('#view-verifica')).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderVerifica() {
  const r = draft.record;
  const quality = r.meta && r.meta.qualita ? r.meta.qualita : Parser.valutaQualita(r);
  const qualityClass = quality.livello === 'alta' ? 'ok' : (quality.livello === 'media' ? 'warn' : 'alert');
  const qualityLabel = quality.livello === 'alta' ? 'Buona' : (quality.livello === 'media' ? 'Parziale' : 'Bassa');
  const software = r.meta && r.meta.software && !/non identificato|sconosciuto/i.test(r.meta.software) ? ` · formato ${esc(r.meta.software)}` : '';
  const knownContracts = allCcnl();
  const ccnlSuggestions = Parser.suggerisciCcnl(r, CCNL_DB, Store.data.customCcnl.map(reviveCustom), 3);
  const suggestedContracts = ccnlSuggestions.map(item => item.contract).filter(Boolean);
  const selectedOfficial = r.ccnlId && !knownContracts.some(c => c.id === r.ccnlId) ? ccnlById(r.ccnlId) : null;
  const optionContracts = [...(selectedOfficial ? [selectedOfficial] : []), ...suggestedContracts, ...knownContracts]
    .filter((contract, index, list) => contract && list.findIndex(item => item.id === contract.id) === index);
  const ccnlOpts = optionContracts
    .map(c => `<option value="${esc(c.id)}" ${r.ccnlId === c.id ? 'selected' : ''}>${esc(c.nome)}${c.officialOnly ? ' — indice ufficiale CNEL' : ''}</option>`).join('');
  const confidenceBadge = path => {
    const meta = r.meta && r.meta.fields && r.meta.fields[path];
    if (!meta || meta.confidence >= 0.75) return '';
    const label = meta.confidence < 0.55 ? 'incerto' : 'da verificare';
    return ` <span class="field-confidence ${meta.confidence < 0.55 ? 'low' : ''}" title="${esc(meta.method || 'estrazione euristica')}">${label}</span>`;
  };
  const isUncertain = path => { const meta = r.meta && r.meta.fields && r.meta.fields[path]; return !!meta && meta.confidence < 0.75; };
  const fieldHTML = ([k, lab]) => {
    const v = getPath(r, k);
    return `<label class="field">${esc(lab)}${confidenceBadge(k)}${sourceButton(k)}<input data-k="${k}" inputmode="${NUM_FIELDS.has(k) ? 'decimal' : 'text'}" value="${v == null ? '' : esc(k.startsWith('periodo.') ? String(v) : NUM_FIELDS.has(k) && typeof v === 'number' ? fmtEur(v) : v)}"></label>`;
  };
  const dubbi = (fields) => fields.filter(([k]) => isUncertain(k)).length;
  const gruppo = (id, title, sub, body, open) => `<details class="gruppo" ${id ? `id="${id}"` : ''} ${open ? 'open' : ''}>
    <summary><span class="gruppo-title"><b>${title}</b><small>${sub}</small></span></summary>
    <div class="gruppo-body verify-group">${body}</div>
  </details>`;
  const subDubbi = (n, fallback) => n ? `${n} ${n === 1 ? 'dato da verificare' : 'dati da verificare'}` : fallback;
  const contractDubbi = dubbi([['ccnl.cnel'], ['ccnl.descrizione']]) + (r.ccnlId ? 0 : 1);
  $('#view-verifica').innerHTML = `
  <div class="verify-layout ${draft.previewPages && draft.previewPages.length ? 'with-document' : ''}">
  ${sourceViewerHtml()}
  <div class="verify-form">
    <div class="page-head">
      <h1>Controlla i dati</h1>
      <p class="muted">Confronta con il documento e correggi solo quello che non torna.</p>
      <p class="verify-quality ${qualityClass}">Lettura ${qualityLabel.toLowerCase()} · ${r.voci.length} ${r.voci.length === 1 ? 'voce' : 'voci'} trovate${software}</p>
    </div>
    ${draft.warnings.map(w => `<p class="verify-note">${esc(w)}</p>`).join('')}
    <section class="card">
      <h2>I numeri principali</h2>
      <div class="grid">${MAIN_FIELDS.map(fieldHTML).join('')}</div>
      <div id="live-quadratura"></div>
    </section>
    <div class="card accordion">
      ${gruppo('verify-voci', `Le voci del cedolino`, `${r.voci.length} ${r.voci.length === 1 ? 'voce' : 'voci'} · tocca × per eliminare una riga letta male`, `
        <div class="tablewrap"><table class="voci" id="voci-edit">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Tipo</th><th class="num">Base</th><th class="num">Rif.</th><th>Unità</th><th class="num">Trattenuta</th><th class="num">Competenza</th><th></th></tr></thead>
          <tbody></tbody>
        </table></div>
        <div class="btnrow"><button class="ghost" id="btn-add-voce">+ Aggiungi voce</button></div>`, false)}
      ${gruppo('', `Contratto ${iBtn('ccnl')}`, subDubbi(contractDubbi, r.ccnlId ? esc((ccnlById(r.ccnlId) || {}).nome || 'Riconosciuto') : 'Non riconosciuto'), `
        <div class="grid">
          <label class="field">Tipo di busta<select id="f-doc-type">${Object.entries(TIPO_CEDOLINO).map(([value, label]) => `<option value="${value}" ${tipoCedolino(r) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label class="field">Contratto (CCNL)<select id="f-ccnl"><option value="">— non identificato —</option>${ccnlOpts}</select></label>
          <label class="field">Codice CNEL${confidenceBadge('ccnl.cnel')}${sourceButton('ccnl.cnel')}<input data-k="ccnl.cnel" value="${esc(r.ccnl.cnel || '')}" placeholder="es. H052"></label>
          <label class="field">Descrizione contratto${confidenceBadge('ccnl.descrizione')}${sourceButton('ccnl.descrizione')}<input data-k="ccnl.descrizione" value="${esc(r.ccnl.descrizione || '')}"></label>
        </div>
        ${ccnlSuggestions.length ? `<div class="ccnl-suggestions"><p class="muted small"><b>Contratti più probabili</b> — scegli solo se la descrizione coincide col cedolino.</p>${ccnlSuggestions.map(item => `<button type="button" class="ccnl-suggestion ${r.ccnlId === item.contract.id ? 'selected' : ''}" data-ccnl-suggest="${esc(item.contract.id)}"><span>${esc(item.contract.nome)}</span><small>${Math.round(item.score * 100)}% · ${esc(item.reasons.join('; '))}</small></button>`).join('')}</div>` : ''}`, contractDubbi > 0)}
      ${FIELD_GROUPS.map(g => {
        const n = dubbi(g.fields);
        const filled = g.fields.filter(([k]) => getPath(r, k) != null && getPath(r, k) !== '').length;
        return gruppo('', `${esc(g.titolo)} ${g.info ? iBtn(g.info) : ''}`, subDubbi(n, filled ? `${filled} ${filled === 1 ? 'dato letto' : 'dati letti'}` : 'Nessun dato letto'), `<div class="grid">${g.fields.map(fieldHTML).join('')}</div>`, n > 0);
      }).join('')}
    </div>
    <div class="verify-actions">
      <button class="ghost" id="btn-annulla">Annulla</button>
      <button class="primary" id="btn-salva">Salva e analizza</button>
    </div>
  </div></div>`;
  renderVociEdit();
  const verifyView = $('#view-verifica');
  verifyView.addEventListener('input', onVerificaInput);
  $('#f-ccnl').addEventListener('change', e => { draft.record.ccnlId = e.target.value || null; });
  $('#f-doc-type').addEventListener('change', e => { draft.record.documento.tipo = e.target.value || 'ordinario'; });
  verifyView.addEventListener('click', e => {
    const source = e.target.closest('.source-btn');
    if (source) {
      const path = source.dataset.sourcePath;
      const voiceIndex = source.dataset.sourceVoice;
      const evidence = path != null
        ? draft.record.meta.fields[path]
        : (voiceIndex != null && draft.record.voci[+voiceIndex] && draft.record.voci[+voiceIndex].meta && draft.record.voci[+voiceIndex].meta.visual);
      showSourceEvidence(evidence); return;
    }
    const suggestion = e.target.closest('.ccnl-suggestion');
    if (suggestion) {
      const contract = optionContracts.find(item => item.id === suggestion.dataset.ccnlSuggest);
      if (!contract) return;
      draft.record.ccnlId = contract.id;
      $('#f-ccnl').value = contract.id;
      if (!draft.record.ccnl.cnel && contract.cnel && contract.cnel.length === 1) {
        draft.record.ccnl.cnel = contract.cnel[0];
        const input = $('[data-k="ccnl.cnel"]'); if (input) input.value = contract.cnel[0];
      }
      $$('.ccnl-suggestion', verifyView).forEach(button => button.classList.toggle('selected', button === suggestion));
      toast('Contratto selezionato: confermalo confrontando il documento.');
    }
    const alternative = e.target.closest('[data-total-alternative]');
    if (alternative) {
      const item = (draft.record.meta.reconciliation.alternatives || [])[+alternative.dataset.totalAlternative];
      if (!item) return;
      for (const key of ['competenze', 'trattenute', 'arrotondamento', 'netto']) if (item[key] != null) draft.record.totali[key] = item[key];
      renderVerifica();
    }
  });
  verifyView.addEventListener('focusin', e => {
    const path = e.target && e.target.dataset && e.target.dataset.k;
    const evidence = path && draft.record.meta.fields[path];
    if (!matchMedia('(max-width: 640px)').matches && evidence && evidence.visualTarget === 'value') showSourceEvidence(evidence);
  });
  $('#btn-add-voce').addEventListener('click', () => { draft.record.voci.push({ codice: '', descrizione: '', base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null }); renderVociEdit(); });
  $('#btn-salva').addEventListener('click', salvaDraft);
  $('#btn-annulla').addEventListener('click', () => { draft = null; navigateTo(Store.data.records.length ? 'dettaglio' : 'importa'); });
  liveQuadratura();
}
function renderVociEdit() {
  const tb = $('#voci-edit tbody');
  tb.innerHTML = draft.record.voci.map((v, i) => `<tr data-i="${i}">
    <td data-label="Codice"><input class="code" data-vk="codice" aria-label="Codice voce" value="${esc(v.codice || '')}"></td>
    <td data-label="Descrizione"><div class="voice-description-stack"><div class="voice-description-edit"><input class="desc" data-vk="descrizione" aria-label="Descrizione voce" value="${esc(v.descrizione || '')}">${v.meta && v.meta.visual && draft.previewPages[v.meta.visual.page] ? `<button type="button" class="source-btn" data-source-voice="${i}" aria-label="Mostra la voce nel documento">⌖</button>` : ''}</div>${v.rifTesto ? `<div class="voice-reference">Riferimento: ${esc(v.rifTesto)}</div>` : ''}<div class="voice-check" data-voice-check="${i}" hidden></div></div></td>
    <td data-label="Tipo"><select data-vk="categoriaManuale" aria-label="Conferma il tipo di voce"><option value="">Automatico</option><option value="competenza" ${v.categoriaManuale === 'competenza' ? 'selected' : ''}>Competenza</option><option value="trattenuta" ${v.categoriaManuale === 'trattenuta' ? 'selected' : ''}>Trattenuta</option><option value="dato" ${v.categoriaManuale === 'dato' ? 'selected' : ''}>Dato</option></select></td>
    <td class="num" data-label="Base"><input data-vk="base" aria-label="Base" value="${v.base == null ? '' : esc(fmtEur(v.base, 5).replace(/(,\d*?)0+$/, '$1').replace(/,$/, ''))}"></td>
    <td class="num" data-label="Riferimento"><input data-vk="rifQta" aria-label="Riferimento o quantità" value="${v.rifQta == null ? '' : esc(fmtEur(v.rifQta, 5).replace(/(,\d*?)0+$/, '$1').replace(/,$/, ''))}"></td>
    <td data-label="Unità"><input class="code" data-vk="rifUnita" aria-label="Unità" value="${esc(v.rifUnita || '')}"></td>
    <td class="num" data-label="Trattenuta"><input data-vk="trattenuta" aria-label="Trattenuta" value="${v.trattenuta == null ? '' : esc(fmtEur(v.trattenuta))}"></td>
    <td class="num" data-label="Competenza"><input data-vk="competenza" aria-label="Competenza" value="${v.competenza == null ? '' : esc(fmtEur(v.competenza))}"></td>
    <td class="voice-actions" data-label="Azioni"><button class="danger del-voce" title="elimina riga" aria-label="Elimina voce">×</button></td>
  </tr>`).join('');
  tb.addEventListener('click', e => {
    const b = e.target.closest('.del-voce'); if (!b) return;
    const i = +b.closest('tr').dataset.i;
    draft.record.voci.splice(i, 1); renderVociEdit(); liveQuadratura();
  }, { once: true });
}
function reconciliationCheckLabel(check, record) {
  const labels = {
    totali: 'quadratura dei totali', 'somma-competenze': 'somma delle competenze',
    'somma-trattenute': 'somma delle trattenute', 'paga-oraria': 'plausibilità della paga oraria',
    'imponibile-irpef': 'plausibilità dell’imponibile IRPEF', 'quota-tfr': 'quota TFR',
    'ratei.ferie': 'saldo ferie', 'ratei.permessi': 'saldo permessi', 'ratei.exFestivita': 'saldo ex festività',
  };
  const voiceMatch = String(check.id || '').match(/^voce\.(\d+)$/);
  if (voiceMatch) {
    const voice = (record.voci || [])[+voiceMatch[1]] || {};
    const identity = [voice.codice, voice.descrizione].filter(Boolean).join(' — ');
    return identity ? `voce “${identity}”` : `riga ${+voiceMatch[1] + 1} delle voci`;
  }
  return labels[check.id] || String(check.id || '').replace(/[-.]/g, ' ');
}
function updateVoiceCheckBadges(consistency) {
  $$('.voice-check', $('#view-verifica')).forEach(item => { item.hidden = true; item.textContent = ''; item.className = 'voice-check'; });
  const checked = new Set();
  for (const check of consistency.checks || []) {
    const match = String(check.id || '').match(/^voce\.(\d+)$/); if (!match) continue;
    const index = +match[1], voice = draft.record.voci[index];
    const item = $(`[data-voice-check="${index}"]`, $('#view-verifica')); if (!item || !voice) continue;
    checked.add(index);
    const calculation = Parser.calcoloVoce(voice);
    if (!calculation) continue;
    item.hidden = false;
    item.classList.add(check.ok ? 'ok' : 'warn');
    item.textContent = check.ok
      ? `✓ Calcolo coerente: ${fmtEur(calculation.expected)} €`
      : `Da controllare: base × quantità = ${fmtEur(calculation.expected)} €, importo ${fmtEur(calculation.amount)} € (scarto ${fmtEur(check.delta)} €)`;
  }
  (draft.record.voci || []).forEach((voice, index) => {
    if (checked.has(index)) return;
    const item = $(`[data-voice-check="${index}"]`, $('#view-verifica')); if (!item) return;
    item.hidden = false; item.classList.add('info');
    item.textContent = voice.meta && voice.meta.nonMultiplicative
      ? `Dato di riferimento${voice.rifTesto ? `: ${voice.rifTesto}` : ''}. Non viene usato nel calcolo base × quantità.`
      : 'Controllo riga non applicabile: base o quantità non sono presenti.';
  });
}
function onVerificaInput(e) {
  const inp = e.target;
  if (inp.dataset.vk != null) {
    const tr = inp.closest('tr'); const v = draft.record.voci[+tr.dataset.i]; if (!v) return;
    const k = inp.dataset.vk;
    v[k] = (k === 'codice' || k === 'descrizione' || k === 'rifUnita' || k === 'categoriaManuale') ? inp.value.trim() : flexNum(inp.value);
    v.meta = Object.assign({}, v.meta, { confirmed: true, confidence: 1 });
  } else if (inp.dataset.k) {
    const k = inp.dataset.k;
    setPath(draft.record, k, NUM_FIELDS.has(k) ? flexNum(inp.value) : (inp.value.trim() || null));
    draft.record.meta.fields = draft.record.meta.fields || {};
    draft.record.meta.fields[k] = Object.assign({}, draft.record.meta.fields[k], { confidence: 1, confirmed: true, method: 'confermato dall’utente' });
    if (k === 'periodo.mese' || k === 'periodo.anno') {
      const p = draft.record.periodo; p.mese = Math.max(1, Math.min(12, Math.round(flexNum(String(p.mese)) || 0))) || p.mese;
    }
  }
  liveQuadratura();
}
function liveQuadratura() {
  const r = draft.record, t = r.totali || {};
  const sumC = r.voci.reduce((s, v) => s + (v.competenza || 0), 0);
  const sumT = r.voci.reduce((s, v) => s + (v.trattenuta || 0), 0);
  let html = '';
  if (t.competenze != null && t.trattenute != null && t.netto != null) {
    const quadratura = Parser.quadraturaTotali(t);
    html += quadratura.ok
      ? `<p class="verify-check ok">✓ I conti tornano: ${fmtEur(t.competenze)} − ${fmtEur(t.trattenute)} = ${fmtEur(t.netto)} €${quadratura.modalita === 'netto-arrotondato' ? ` (arrotondamento ${fmtEur(quadratura.scarto)} €)` : ''}</p>`
      : `<p class="verify-check alert">I conti non tornano: lordo − trattenute fa <b>${fmtEur(quadratura.atteso)} €</b>, ma il netto scritto è <b>${fmtEur(t.netto)} €</b>. Ricontrolla questi tre numeri.</p>`;
  }
  if (Math.abs(sumC - (t.competenze || 0)) > .05 || Math.abs(sumT - (t.trattenute || 0)) > .05) {
    html += `<p class="muted small">Somma delle voci lette: guadagni ${fmtEur(sumC)} € · trattenute ${fmtEur(sumT)} €. Se è diversa dai totali, forse manca o è in più una voce.</p>`;
  }
  const consistency = Parser.valutaCoerenza(r);
  const failed = (consistency.checks || []).filter(check => !check.ok).map(check => reconciliationCheckLabel(check, r));
  if (failed.length) html += `<p class="muted small">Da ricontrollare: ${esc(failed.slice(0, 3).join(', '))}${failed.length > 3 ? ` e altri ${failed.length - 3}` : ''}.</p>`;
  const alternatives = r.meta && r.meta.reconciliation && r.meta.reconciliation.alternatives || [];
  const ambiguous = alternatives.length > 1 && alternatives[0].score - alternatives[1].score < .9;
  if (ambiguous) {
    html += `<div class="total-alternatives"><p><b>Più letture plausibili dei totali</b><br><span class="muted small">Scegli confrontando il documento: nessuna alternativa viene nascosta.</span></p>${alternatives.map((item, index) => `<button type="button" data-total-alternative="${index}" class="${index === 0 ? 'selected' : ''}"><b>${index + 1}</b><span>Comp. ${fmtEur(item.competenze)} · Tratt. ${fmtEur(item.trattenute)} · Netto ${fmtEur(item.netto)}</span><small>${esc((item.reasons || []).join(', ') || 'candidato da etichette')}</small></button>`).join('')}</div>`;
  }
  $('#live-quadratura').innerHTML = html;
  updateVoiceCheckBadges(consistency);
}
function salvaRecord(r, options = {}) {
  if (!r.periodo || !r.periodo.anno || !r.periodo.mese) { toast('Indica mese e anno del cedolino.'); return; }
  r.periodo.label = periodoLabel(r.periodo);
  const dup = Store.data.records.find(x => x.id !== r.id && recordIdentityKey(x) === recordIdentityKey(r));
  if (dup && !confirm(`Esiste già un cedolino ${tipoCedolinoLabel(r).toLowerCase()} di ${r.azienda.nome || 'questa azienda'} per ${r.periodo.label}: lo sostituisco?`)) return false;
  if (dup) {
    Store.data.records = Store.data.records.filter(x => x.id !== dup.id);
    SourcePreviewCache.delete(dup.id);
  }
  r.derivati = Parser.derivaIndice(r);
  if (options.confirmed) {
    imparaCorrezioni(r);
    imparaProfiloLayout(r);
  }
  rememberSourcePreview(r, options.previewPages || []);
  r.meta.importedAt = new Date().toISOString();
  const i = Store.data.records.findIndex(x => x.id === r.id);
  if (i >= 0) Store.data.records[i] = r; else Store.data.records.push(r);
  Store.save();
  return true;
}

function completaSalvataggio(r) {
  draft = null;
  currentDetailId = r.id;
  renderImporta();
  renderRiassunto(r.id);
  renderDettaglio(r.id);
  showView('riassunto');
  toast('Busta salvata nella cronologia (solo su questo dispositivo).');
}

function salvaDraft() {
  const r = draft.record;
  const previewPages = draft.previewPages || [];
  if (!salvaRecord(r, { confirmed: true, previewPages })) return;
  completaSalvataggio(r);
}

/* ============================================================
   RIASSUNTO E VOCI
   ============================================================ */
/* Barra per passare da un mese archiviato all'altro (solo se ce n'è più di uno). */
function selettorePeriodo(r, view) {
  const recs = recSorted();
  if (recs.length < 2) return '';
  const i = recs.findIndex(x => x.id === r.id);
  const prev = recs[i - 1], next = recs[i + 1];
  return `<div class="month-bar">
    <button type="button" class="month-step" data-goto="${prev ? esc(prev.id) : ''}" ${prev ? '' : 'disabled'} aria-label="Busta precedente">‹</button>
    <label><span class="sr-only">Scegli la busta</span><select class="month-select" data-view="${view}">${recs.map(x => `<option value="${esc(x.id)}" ${x.id === r.id ? 'selected' : ''}>${esc(periodoLabel(x.periodo))}${tipoCedolino(x) !== 'ordinario' ? ` · ${esc(tipoCedolinoLabel(x))}` : ''}</option>`).join('')}</select></label>
    <button type="button" class="month-step" data-goto="${next ? esc(next.id) : ''}" ${next ? '' : 'disabled'} aria-label="Busta successiva">›</button>
  </div>`;
}
function bindSelettorePeriodo(el, view) {
  const select = $('.month-select', el);
  if (select) select.addEventListener('change', () => navigateTo(view, select.value));
  $$('.month-step', el).forEach(b => b.addEventListener('click', () => { if (b.dataset.goto) navigateTo(view, b.dataset.goto); }));
}

function renderDettaglio(id) {
  const r = Store.data.records.find(x => x.id === id);
  const el = $('#view-dettaglio');
  currentDetailId = id || null;
  if (!r) return false;
  const ccnl = r.ccnlId ? ccnlById(r.ccnlId) : Parser.trovaCcnl(r, CCNL_DB, Store.data.customCcnl.map(reviveCustom));
  detailVoci = r.voci;
  renderDettaglioCompleto(el, r, ccnl);
  return true;
}

/* Sezione richiudibile (usata da Diritti minimi e dalle schede contratto) */
function sez(titleHtml, bodyHtml, open = true) {
  return `<details class="card sez" ${open ? 'open' : ''}><summary><h2>${titleHtml}</h2></summary><div class="sez-body">${bodyHtml}</div></details>`;
}

const isOre = (unit) => /^(?:ORE|ORA|H)$/i.test(unit || '');
const isGiorni = (unit) => /^(?:GG|GIORNI|G|GIORNO)$/i.test(unit || '');
function fmtQta(value) { const n = Number(value); return fmtEur(n, Number.isInteger(n) ? 0 : Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? 1 : 2); }
function unitaTempo(unit, value) {
  if (isOre(unit)) return Number(value) === 1 ? 'ora' : 'ore';
  return Number(value) === 1 ? 'giorno' : 'giorni';
}

/* Nome comprensibile a chiunque; se non lo riconosco resta quello della base dati. */
function nomeSemplice(v, s = spiegaVoce(v)) {
  const t = `${v.descrizione || ''} ${s.nome || ''}`;
  if (v.trattenuta != null) {
    if (/ritenut\w*\s+irpef|irpef\s+(?:a\s+)?debito|ritenute\s+fiscali/i.test(t)) return 'Tasse allo Stato (IRPEF)';
    if (/addiz\w*\s+reg/i.test(t)) return 'Tassa della Regione';
    if (/addiz\w*\s+com/i.test(t)) return 'Tassa del Comune';
    if (/cessione|quinto|prestit|pignor|delegazione/i.test(t)) return 'Rata di un prestito';
    if (/sindacal/i.test(t)) return 'Quota del sindacato';
    if (/fondo\s+pension|previdenza\s+complem|fon\.?te\b|cometa|fonchim|previambiente/i.test(t)) return 'Fondo pensione';
    if (/\bfis\b|integrazione\s+salariale/i.test(t)) return 'Fondo FIS';
    if (/\bivs\b|contribut\w*\s+(?:inps|previd)|\binps\b/i.test(t)) return 'Pensione (INPS)';
    if (/fast|sanit|\best\b|metasalute|cassa\s+assist/i.test(t)) return 'Assicurazione sanitaria';
    return s.nome;
  }
  const rateo = /rateo/i.test(t) || (isOre(v.rifUnita) && Number(v.rifQta) < 40);
  if (/13.?m|tredicesim|gratifica\s+natal/i.test(t)) return rateo ? 'Pezzo di tredicesima' : 'Tredicesima';
  if (/14.?m|quattordicesim/i.test(t)) return rateo ? 'Pezzo di quattordicesima' : 'Quattordicesima';
  if (/straordin|supplementar/i.test(t)) return 'Straordinari';
  if (/ferie\s+god|godiment\w*\s+ferie/i.test(t)) return 'Ferie usate';
  if (/(?:permess|\brol\b|ex\s*fest)[\s\S]*god|god[\s\S]*(?:permess|\brol\b)/i.test(t)) return 'Permessi usati';
  if (/malatt/i.test(t)) return 'Malattia';
  if (/retribuzion|stipendio|paga\s+base|ore\s+ordinar|lavoro\s+ordinario/i.test(t) && !/magg|festiv|notturn/i.test(t)) {
    if (isOre(v.rifUnita)) return 'Ore lavorate';
    if (isGiorni(v.rifUnita)) return 'Giorni lavorati';
    return 'Stipendio del mese';
  }
  return s.nome;
}

/* Il conto della voce, in pezzi da mostrare come "a × b = c". Solo se torna. */
function calcoloVoceParti(v, record) {
  const togli = v.trattenuta != null;
  const risultato = (value) => ({ v: `${fmtEur(value)} €`, l: togli ? 'tolti' : 'per te', res: true });
  if (togli && nomeSemplice(v) === 'Tasse allo Stato (IRPEF)') {
    const d = record.derivati || {};
    const lorda = Number(d.irpefLorda), detr = Number(d.detrazioni) || 0, extra = Number(d.ulterioreDetrazione) || 0;
    if (Number.isFinite(lorda) && lorda > 0 && Math.abs(lorda - detr - extra - Math.abs(Number(v.trattenuta))) < .05) {
      const parts = [{ v: `${fmtEur(lorda)} €`, l: 'tasse piene' }];
      if (detr) parts.push({ op: '−' }, { v: `${fmtEur(detr)} €`, l: 'sconto dipendenti' });
      if (extra) parts.push({ op: '−' }, { v: `${fmtEur(extra)} €`, l: 'sconto extra' });
      return [...parts, { op: '=' }, risultato(Math.abs(Number(v.trattenuta)))];
    }
  }
  const c = Parser.calcoloVoce(v);
  if (!c || !c.ok) return null;
  const q = Number(v.rifQta), b = Number(v.base);
  if (v.rifUnita === '%') return [{ v: `${fmtEur(b)} €`, l: 'stipendio lordo' }, { op: '×' }, { v: `${fmtQta(q)}%`, l: 'percentuale' }, { op: '=' }, risultato(c.amount)];
  if (isOre(v.rifUnita) || isGiorni(v.rifUnita)) {
    return [{ v: `${fmtQta(q)} ${unitaTempo(v.rifUnita, q)}`, l: 'quante' }, { op: '×' }, { v: `${fmtEur(b)} €`, l: isOre(v.rifUnita) ? 'paga all’ora' : 'paga al giorno' }, { op: '=' }, risultato(c.amount)];
  }
  return [{ v: fmtQta(q), l: 'quantità' }, { op: '×' }, { v: `${fmtEur(b)} €`, l: 'ognuna' }, { op: '=' }, risultato(c.amount)];
}
function calcoloHTML(parts) {
  if (!parts) return '';
  return `<div class="calc" aria-label="Come è calcolata">${parts.map(p => p.op
    ? `<span class="calc-op" aria-hidden="true">${esc(p.op)}</span>`
    : `<span class="calc-box${p.res ? ' res' : ''}"><b>${esc(p.v)}</b><small>${esc(p.l)}</small></span>`).join('')}</div>`;
}

function saldoRateo(record, key) {
  const r = record.ratei && record.ratei[key];
  if (!r || r.saldo == null) return null;
  return { saldo: r.saldo, unita: isOre(r.unita) ? 'ore' : 'giorni' };
}
function rimanenteVoce(v, record) {
  const nome = nomeSemplice(v);
  const key = nome === 'Ferie usate' ? 'ferie' : nome === 'Permessi usati' ? 'permessi' : null;
  const saldo = key && saldoRateo(record, key);
  if (!saldo) return '';
  return `Ti restano ancora ${fmtQta(saldo.saldo)} ${saldo.unita} di ${key === 'ferie' ? 'ferie' : 'permesso'}`;
}

/* Ferie o permessi usati nel mese, letti dalle voci (ore o giorni). */
function usatoNelMese(record, re) {
  const voce = (record.voci || []).find(v => re.test(v.descrizione || '') && Number.isFinite(Number(v.rifQta)) && (isOre(v.rifUnita) || isGiorni(v.rifUnita)));
  return voce ? `${fmtQta(voce.rifQta)} ${unitaTempo(voce.rifUnita, voce.rifQta)}` : '';
}

/* TFR: quota del mese e quanto c'è "nel salvadanaio" ora. */
function tfrSemplice(record) {
  const t = record.tfr || {};
  const parts = [['fondo3112', 'fino a dicembre'], ['rivalutazione', 'interessi'], ['quotaAnno', 'quest’anno']]
    .filter(([k]) => Number.isFinite(Number(t[k])) && Number(t[k]) !== 0)
    .map(([k, l]) => ({ v: Number(t[k]), l }));
  const totale = parts.length && (t.fondo3112 != null || t.quotaAnno != null) ? parts.reduce((sum, p) => sum + p.v, 0) : null;
  if (t.quotaMese == null && totale == null) return null;
  return { quotaMese: t.quotaMese, totale, parts, aFondi: !!t.aFondi };
}

function importoFirmato(value, togli) {
  const n = Number(value);
  const segno = togli ? (n < 0 ? '+ ' : '') : (n < 0 ? '− ' : '');
  return `${segno}${fmtEur(Math.abs(n))} €`;
}

function importoVoci(record, regex, used = new Set()) {
  let totale = 0, quantita = 0;
  (record.voci || []).forEach((voice, index) => {
    if (used.has(index) || !regex.test(String(voice.descrizione || ''))) return;
    const amount = Number(voice.competenza);
    if (!Number.isFinite(amount) || amount <= 0) return;
    used.add(index); totale += amount;
    if (Number.isFinite(Number(voice.rifQta))) quantita += Number(voice.rifQta);
  });
  return { totale, quantita };
}

/* Le cose in più del mese, per il Riassunto. */
function extraDelMese(record) {
  const used = new Set(), out = [];
  const add = (title, re, sub) => {
    const r = importoVoci(record, re, used);
    if (r.totale) out.push({ title, sub: sub(r), amount: r.totale });
  };
  add('Straordinari', /straordinar|supplementar|ore\s+extra/i, r => r.quantita ? `${fmtQta(r.quantita)} ore oltre l’orario, pagate un po’ di più` : 'Ore oltre l’orario, pagate un po’ di più');
  add('Domeniche e festivi', /magg.*(?:domenic|festiv)|(?:domenic|festiv).*magg|riposo\s+settimanale/i, () => 'Un extra per aver lavorato in giorni speciali');
  add('Lavoro di notte', /notturn/i, () => 'Un extra per le ore lavorate di notte');
  add('Premi', /premio|bonus|incentiv|provvig|una\s*tantum/i, () => 'Soldi in più per i risultati');
  add('Pezzi di tredicesima e quattordicesima', /13.?m|tredicesim|14.?m|quattordicesim|gratifica\s+natalizia/i, () => 'Invece che tutte insieme, ti arrivano un po’ ogni mese');
  add('Rimborsi', /rimborso|trasferta|pie.*lista|chilometr/i, () => 'Soldi che ti restituiscono per spese di lavoro');
  return out;
}

function nettoPrecedente(record) {
  const previous = recSorted().filter(item => item.id !== record.id && item.totali && item.totali.netto != null
    && employerKey(item) === employerKey(record) && tipoCedolino(item) === tipoCedolino(record)
    && periodoKey(item.periodo) < periodoKey(record.periodo)).slice(-1)[0];
  if (!previous || !record.totali || record.totali.netto == null) return null;
  const delta = record.totali.netto - previous.totali.netto;
  return Math.abs(delta) >= .01 ? { delta, label: MESI_NOMI[previous.periodo.mese] ? MESI_NOMI[previous.periodo.mese].toLowerCase() : periodoLabel(previous.periodo) } : null;
}

function testoControlloSemplice(finding) {
  if (/CCNL non identificato/i.test(finding.titolo)) return 'Non ho riconosciuto il contratto. Apri “Modifica dati” e selezionalo confrontando il cedolino.';
  if (/quadratur|somma/i.test(`${finding.titolo} ${finding.area}`)) return 'Un totale non coincide con la somma delle righe lette. Confronta competenze, trattenute e netto col documento.';
  if (/paga base sotto/i.test(finding.titolo)) return 'La paga base sembra inferiore al riferimento disponibile. Falla controllare prima di trarre conclusioni.';
  if (/festiv|domenic/i.test(finding.titolo)) return 'La paga per festivi o domeniche non è abbastanza chiara per un controllo automatico sicuro. Confrontala col tuo CCNL.';
  return 'Questo dato merita un controllo sul cedolino o con l’ufficio paghe.';
}

function controlliSempliciHTML(findings) {
  const urgent = findings.filter(finding => finding.livello === 'alert' || finding.livello === 'warn').slice(0, 4);
  if (!urgent.length) return `<p class="all-good"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>I controlli automatici non hanno trovato niente di strano.</p>`;
  return `<section class="card to-check"><h2>${urgent.length === 1 ? '1 cosa da controllare' : `${urgent.length} cose da controllare`}</h2>${urgent.map(finding => `<div class="to-check-item"><b>${esc(finding.titolo)}</b><p>${esc(testoControlloSemplice(finding))}</p></div>`).join('')}</section>`;
}

const FLOW_COLORS = { netto: 'var(--brand)', contributi: 'var(--c-pensione)', tasse: 'var(--c-tasse)', altre: 'var(--c-altro)' };
function calcolaFlussoStipendio(record) {
  const t = record.totali || {}, d = record.derivati || Parser.derivaIndice(record);
  const netto = Math.max(0, Number(t.netto) || 0);
  let trattenute = t.trattenute == null || t.trattenute === '' ? NaN : Number(t.trattenute);
  if (!Number.isFinite(trattenute)) trattenute = Math.max(0, (Number(t.competenze) || 0) - netto + (Number(t.arrotondamento) || 0));
  trattenute = Math.max(0, trattenute);
  let contributi = Math.max(0, Number(d.ivs && d.ivs.importo) || 0) + Math.max(0, Number(d.fis && d.fis.importo) || 0);
  let tasse = Math.max(0, Number(d.ritenuteIrpef) || 0) + Math.max(0, Number(d.addRegionale) || 0) + Math.max(0, Number(d.addComunale) || 0);
  const classificato = contributi + tasse;
  if (classificato > trattenute && classificato > 0) {
    const ratio = trattenute / classificato;
    contributi *= ratio; tasse *= ratio;
  }
  const altre = Math.max(0, trattenute - contributi - tasse);
  const totale = netto + trattenute;
  return {
    totale, netto, trattenute,
    segments: [
      { key: 'netto', label: 'Ti resta (netto)', value: netto, color: FLOW_COLORS.netto },
      { key: 'contributi', label: 'Messi da parte per la pensione', value: contributi, color: FLOW_COLORS.contributi },
      { key: 'tasse', label: 'Tasse', value: tasse, color: FLOW_COLORS.tasse },
      { key: 'altre', label: 'Altre trattenute', value: altre, color: FLOW_COLORS.altre },
    ].filter(segment => segment.value > .005),
  };
}

function flussoHTML(r) {
  const flow = calcolaFlussoStipendio(r);
  const lordo = r.totali.competenze != null ? Number(r.totali.competenze) : flow.totale;
  if (!flow.totale) return '';
  const pct = Math.round(flow.netto / flow.totale * 100);
  const minus = flow.segments.filter(s => s.key !== 'netto');
  return `<section class="card">
    <h2>Dal lordo al netto</h2>
    <p class="lead">Hai guadagnato ${fmtEur(lordo)} €. Prima di dartelo, una parte è andata alla tua pensione e una parte in tasse: su 100 € te ne arrivano circa ${pct}.</p>
    <div class="money-bar" role="img" aria-label="${flow.segments.map(s => `${s.label} ${Math.round(s.value / flow.totale * 100)}%`).join(', ')}">${flow.segments.map(s => `<span style="width:${(s.value / flow.totale * 100).toFixed(2)}%;background:${s.color}"></span>`).join('')}</div>
    <div class="rows">
      <div class="row"><span>Hai guadagnato (lordo)</span><b>${fmtEur(lordo)} €</b></div>
      ${minus.map(s => `<div class="row"><span><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}</span><span>− ${fmtEur(s.value)} €</span></div>`).join('')}
      <div class="row total"><b>Ti resta (netto)</b><b class="brand">${fmtEur(r.totali.netto)} €</b></div>
    </div>
  </section>`;
}

function renderRiassunto(id) {
  const r = Store.data.records.find(item => item.id === id) || recSorted().slice(-1)[0];
  const el = $('#view-riassunto');
  if (!r) return false;
  currentDetailId = r.id;
  const ccnl = r.ccnlId ? ccnlById(r.ccnlId) : null;
  const findings = eseguiControlli(r, ccnl, Store.data.records);
  const extra = extraDelMese(r);
  const ferie = saldoRateo(r, 'ferie'), permessi = saldoRateo(r, 'permessi');
  const tfr = tfrSemplice(r);
  const diff = nettoPrecedente(r);
  const tile = (title, saldo, usato) => saldo ? `<div class="tile"><span class="muted">${title}</span><b>${fmtQta(saldo.saldo)} ${saldo.unita}</b><span class="muted">ancora da usare</span>${usato ? `<span class="tile-note">Questo mese ne hai usate ${usato}</span>` : ''}</div>` : '';
  el.innerHTML = `
    ${selettorePeriodo(r, 'riassunto')}
    <section class="hero">
      <p class="hero-period">${esc(periodoLabel(r.periodo))}${tipoCedolino(r) !== 'ordinario' ? ` · ${esc(tipoCedolinoLabel(r))}` : ''}</p>
      <p class="hero-net">${fmtEur(r.totali.netto)} €</p>
      <p class="hero-label">ti sono arrivati sul conto</p>
      ${diff ? `<p class="hero-diff">${diff.delta > 0 ? '▲' : '▼'} ${fmtEur(Math.abs(diff.delta))} € ${diff.delta > 0 ? 'in più' : 'in meno'} rispetto a ${esc(diff.label)}</p>` : ''}
    </section>
    ${flussoHTML(r)}
    ${extra.length ? `<section class="card"><h2>In più questo mese</h2><div class="rows">${extra.map(x => `<div class="row"><span>${esc(x.title)}<small>${esc(x.sub)}</small></span><b>+ ${fmtEur(x.amount)} €</b></div>`).join('')}</div></section>` : ''}
    ${ferie || permessi ? `<section class="card"><h2>Ferie e permessi</h2><div class="tiles">
      ${tile('Ferie', ferie, usatoNelMese(r, /ferie\s+god|godiment\w*\s+ferie/i))}
      ${tile('Permessi', permessi, usatoNelMese(r, /(?:permess|\brol\b|ex\s*fest)[\s\S]*god/i))}
    </div><p class="muted small">Ferie e permessi sono pagati: usarli non ti costa niente.</p></section>` : ''}
    ${tfr ? `<section class="card"><h2>TFR, il tuo salvadanaio</h2>
      <p class="lead">Ogni mese l’azienda mette da parte dei soldi per te. ${tfr.aFondi ? 'Nel tuo caso vanno in un fondo pensione.' : 'Li ricevi quando smetti di lavorare lì.'}</p>
      <div class="rows">
        ${tfr.quotaMese != null ? `<div class="row"><span>Messo da parte questo mese</span><b>+ ${fmtEur(tfr.quotaMese)} €</b></div>` : ''}
        ${tfr.totale != null && !tfr.aFondi ? `<div class="row total"><span>Se lasciassi l’azienda oggi<small>prima delle tasse sul TFR</small></span><b class="brand big">${fmtEur(tfr.totale)} €</b></div>` : ''}
      </div></section>` : ''}
    <button type="button" class="link-card" id="summary-voci">Guarda ogni voce e come è calcolata<span aria-hidden="true">›</span></button>
    ${controlliSempliciHTML(findings)}`;
  bindSelettorePeriodo(el, 'riassunto');
  $('#summary-voci').addEventListener('click', () => navigateTo('dettaglio', r.id));
  return true;
}

function vociHTML(r) {
  const entries = (r.voci || []).map((v, i) => ({ v, i, s: spiegaVoce(v) }));
  const voceHTML = ({ v, i, s }, togli) => {
    const expl = spiegazioneCompletaVoce(v, s).replace(/\s*Perché compare:[\s\S]*$/i, '').replace(/\s*Scalano dal saldo[^.]*\./i, '');
    const calc = calcoloVoceParti(v, r);
    const left = rimanenteVoce(v, r);
    const check = controlloUtileVoce(v, s);
    const amount = togli ? v.trattenuta : v.competenza;
    return `<details class="voce">
      <summary><span class="voce-name">${esc(nomeSemplice(v, s))}</span><span class="voce-amount">${amount != null ? importoFirmato(amount, togli) : ''}</span></summary>
      <div class="voce-body">
        <p>${esc(expl)}</p>
        ${calcoloHTML(calc)}
        ${left ? `<p class="voce-left">${esc(left)}</p>` : ''}
        <p class="voce-orig">Sul cedolino: “${esc(v.descrizione || s.nome)}”${v.codice ? ` · codice ${esc(v.codice)}` : ''}</p>
        ${check ? `<button type="button" class="voce-check" data-edit-voice="${i}">${esc(check)} <span>Correggi</span></button>` : ''}
      </div>
    </details>`;
  };
  const gruppo = (key, title, sub, totalHtml, body, cls = '') => `<details class="gruppo ${cls}" data-gruppo="${key}">
    <summary><span class="gruppo-title"><b>${title}</b><small>${sub}</small></span>${totalHtml ? `<b class="gruppo-total">${totalHtml}</b>` : ''}</summary>
    <div class="gruppo-body">${body}</div>
  </details>`;
  const competenze = entries.filter(e => e.s.cat === 'competenza' && e.v.competenza != null);
  const trattenute = entries.filter(e => e.s.cat === 'trattenuta' && e.v.trattenuta != null);
  const sum = (list, key) => list.reduce((total, e) => total + Number(e.v[key] || 0), 0);
  const conta = (n) => `${n} ${n === 1 ? 'voce' : 'voci'}`;
  const out = [];
  if (competenze.length) out.push(gruppo('competenze', 'Quanto hai guadagnato', `Le voci che ti danno soldi · ${conta(competenze.length)}`,
    `+ ${fmtEur(r.totali.competenze != null ? r.totali.competenze : sum(competenze, 'competenza'))} €`, competenze.map(e => voceHTML(e, false)).join(''), 'pos'));
  if (trattenute.length) out.push(gruppo('trattenute', 'Quanto ti hanno tolto', `Pensione, tasse e piccole quote · ${conta(trattenute.length)}`,
    `− ${fmtEur(r.totali.trattenute != null ? r.totali.trattenute : sum(trattenute, 'trattenuta'))} €`, trattenute.map(e => voceHTML(e, true)).join(''), 'neg'));
  const tfr = tfrSemplice(r);
  if (tfr) {
    const rows = [];
    if (tfr.quotaMese != null) rows.push(`<details class="voce"><summary><span class="voce-name">Messo da parte questo mese</span><span class="voce-amount">${fmtEur(tfr.quotaMese)} €</span></summary><div class="voce-body"><p>Ogni mese l’azienda mette da parte per te circa uno stipendio diviso 13,5. Non lo vedi nel netto: si accumula.</p></div></details>`);
    if (tfr.totale != null) rows.push(`<details class="voce"><summary><span class="voce-name">${tfr.aFondi ? 'TFR maturato in azienda' : 'Se lasciassi l’azienda oggi'}</span><span class="voce-amount">${fmtEur(tfr.totale)} €</span></summary><div class="voce-body"><p>${tfr.aFondi ? 'Il TFR nuovo va al fondo pensione; questo è quello rimasto in azienda.' : 'Tutto quello che hai nel salvadanaio adesso. Su questa cifra si pagano poi delle tasse.'}</p>${tfr.parts.length > 1 ? calcoloHTML([...tfr.parts.flatMap((p, k) => [...(k ? [{ op: '+' }] : []), { v: `${fmtEur(p.v)} €`, l: p.l }]), { op: '=' }, { v: `${fmtEur(tfr.totale)} €`, l: 'il tuo TFR', res: true }]) : ''}</div></details>`);
    out.push(gruppo('tfr', 'TFR, il tuo salvadanaio', 'Soldi che ricevi quando lasci l’azienda', tfr.quotaMese != null ? `+ ${fmtEur(tfr.quotaMese)} € al mese` : '', rows.join(''), 'pos'));
  }
  const presenze = r.presenze && Array.isArray(r.presenze.righe) ? r.presenze.righe.filter(row => Number.isFinite(Number(row.totale))) : [];
  if (presenze.length) out.push(gruppo('presenze', 'Presenze del mese', 'Ore e giorni dal calendario, non sono euro', '',
    `<div class="rows">${presenze.map(row => `<div class="row"><span>${esc(row.descrizione)}</span><span>${fmtQta(row.totale)} ${/ORE/i.test(row.unita || '') ? 'ore' : 'giorni'}</span></div>`).join('')}</div>`));
  return out.join('');
}

function renderDettaglioCompleto(el, r, ccnl) {
  const contratto = ccnl ? ccnl.nome : (r.ccnl.descrizione || 'Non riconosciuto');
  el.innerHTML = `
  ${selettorePeriodo(r, 'dettaglio')}
  <div class="page-head">
    <p class="hero-period">${esc(periodoLabel(r.periodo))}</p>
    <h1>Le voci della busta</h1>
    <p class="muted">Tocca una sezione per aprirla, poi una voce per vedere come è calcolata.</p>
  </div>
  <div class="card accordion">
    ${vociHTML(r)}
    <details class="gruppo" data-gruppo="contratto">
      <summary><span class="gruppo-title"><b>Il tuo contratto</b><small>${esc(contratto)}${r.dipendente.livello ? ` · livello ${esc(r.dipendente.livello)}` : ''}</small></span></summary>
      <div class="gruppo-body"><div class="rows">
        <div class="row"><span>Azienda</span><span>${esc(r.azienda.nome || '—')}</span></div>
        <div class="row"><span>Contratto</span><span>${esc(contratto)}${r.ccnl.cnel ? ` · CNEL ${esc(r.ccnl.cnel)}` : ''}</span></div>
        <div class="row"><span>Livello</span><span>${esc(r.dipendente.livello || '—')}</span></div>
      </div></div>
    </details>
    <div class="accordion-foot"><b>Ti resta (netto)</b><b class="brand">${fmtEur(r.totali.netto)} €</b></div>
  </div>
  <div class="btnrow detail-actions"><button class="ghost" id="btn-edit">Modifica dati</button><button class="ghost" id="btn-print">Stampa</button><button class="danger" id="btn-del">Elimina</button></div>`;
  bindSelettorePeriodo(el, 'dettaglio');
  bindDettaglioCommon(el, r);
}

function openRecordEditor(record, voiceIndex = null) {
  const copy = JSON.parse(JSON.stringify(record));
  const previews = SourcePreviewCache.get(record.id) || [];
  startVerifica(copy, ['Stai modificando una busta già salvata.'], previews);
  if (voiceIndex == null) return;
  const voiceGroup = $('#verify-voci'); if (voiceGroup) voiceGroup.open = true;
  requestAnimationFrame(() => {
    const row = $(`#voci-edit tr[data-i="${voiceIndex}"]`, $('#view-verifica'));
    if (!row) return;
    row.classList.add('target-edit');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = $('[data-vk="base"]', row) || $('input', row);
    if (input) input.focus({ preventScroll: true });
    const voice = draft.record.voci[voiceIndex];
    if (voice && voice.meta && voice.meta.visual && previews.length) showSourceEvidence(voice.meta.visual);
  });
}

function bindDettaglioCommon(el, r) {
  const be = $('#btn-edit'); if (be) be.addEventListener('click', () => openRecordEditor(r));
  el.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-voice]');
    if (!edit) return;
    event.preventDefault(); event.stopPropagation();
    openRecordEditor(r, +edit.dataset.editVoice);
  });
  const bp = $('#btn-print'); if (bp) bp.addEventListener('click', () => window.print());
  const bd = $('#btn-del'); if (bd) bd.addEventListener('click', () => {
    if (!confirm('Eliminare questa busta dalla cronologia locale?')) return;
    Store.data.records = Store.data.records.filter(x => x.id !== r.id); Store.save();
    SourcePreviewCache.delete(r.id);
    navigateTo('importa');
    toast('Busta eliminata.');
  });
}
function ccnlInfoCard(c, r) {
  const warn = (v) => v && v.verificato === false ? ' <span class="badge dato">da verificare</span>' : '';
  return sez(`Il tuo contratto: ${esc(c.nome)} ${iBtn('ccnl')}`,
  `<div class="kv">
    <div><b>Firmatari</b>${esc(c.firmatari || '—')}</div>
    <div><b>Ferie ${iBtn('ferie')}</b>${c.ferie ? c.ferie.giorni + ' gg/anno' : '—'}${warn(c.ferie)}</div>
    <div><b>ROL/permessi ${iBtn('rol')}</b>${c.rol && c.rol.ore ? c.rol.ore + ' h/anno a regime' : '—'}${warn(c.rol)}</div>
    <div><b>Ex festività ${iBtn('exfestivita')}</b>${c.exFest && c.exFest.ore ? c.exFest.ore + ' h/anno' : '—'}${warn(c.exFest)}</div>
    <div><b>Mensilità ${iBtn('mensilita')}</b>${c.mensilita || '—'}</div>
    <div><b>Divisore orario ${iBtn('divisore')}</b>${c.divisoreOrario || '—'}</div>
    <div><b>Fondo pensione ${iBtn('fondopensione')}</b>${c.fondoPensione ? esc(c.fondoPensione.nome) + (c.fondoPensione.datore ? ` (datore ${esc(c.fondoPensione.datore)})` : '') : '—'}</div>
    <div><b>Sanità integrativa ${iBtn('fondosanitario')}</b>${c.sanitario ? esc(c.sanitario.nome) : '—'}</div>
  </div>
  ${c.ferie && c.ferie.nota ? `<p class="muted small">${esc(c.ferie.nota)}</p>` : ''}
  ${c.rol && (c.rol.nota || c.rol.scaglioni) ? `<p class="muted small">${esc(c.rol.nota || '')} ${esc(c.rol.scaglioni || '')}</p>` : ''}
  ${c.quattordicesima ? `<p class="muted small"><b>14ª:</b> ${esc(c.quattordicesima)}</p>` : ''}
  ${c.scatti ? `<p class="muted small"><b>Scatti:</b> ${esc(c.scatti)}</p>` : ''}
  ${c.minimi && c.minimi.nota ? `<p class="muted small"><b>Minimi tabellari:</b> ${esc(c.minimi.nota)} (${esc(c.minimi.aggiornatoA || 'data n/d')})</p>` : ''}
  ${c.note ? `<p class="muted small"><b>Nota:</b> ${esc(c.note)}</p>` : ''}
  <p class="muted small">“Da verificare” = valore indicativo: la fonte che fa fede è il testo del CCNL depositato al CNEL e le tabelle dei firmatari.</p>
  ${fontiHTML([...(c.fontiTesto || []), c.fondoPensione && c.fondoPensione.fonte, c.sanitario && c.sanitario.fonte].filter(Boolean))}`);
}

/* ============================================================
   CONSIGLI
   ============================================================ */
/* Contesto per personalizzare le curiosità sui numeri reali dell'utente */
function ctxCuriosita() {
  const recs = recSorted();
  const r = recs[recs.length - 1];
  if (!r) return null;
  const ccnl = r.ccnlId ? ccnlById(r.ccnlId) : Parser.trovaCcnl(r, CCNL_DB, Store.data.customCcnl.map(reviveCustom));
  const d = r.derivati || {};
  const oraria = (d.retribuzione && d.retribuzione.oraria) || (r.elementi && r.elementi.totale && ccnl && ccnl.divisoreOrario ? r.elementi.totale / ccnl.divisoreOrario : null);
  return { r, ccnl, d, oraria, periodo: periodoLabel(r.periodo) };
}
/* Paragrafo "sui tuoi numeri" per ogni curiosità (null = niente da personalizzare) */
function curiositaPersonale(id, ctx) {
  if (!ctx) return null;
  const { r, ccnl, d, oraria } = ctx;
  switch (id) {
    case 'tfr-vs-fondo': {
      const retribMese = r.tfr && r.tfr.retribUtile;
      if (!retribMese) return null;
      const percDatore = (ccnl && ccnl.fondoPensione && parseFloat(String(ccnl.fondoPensione.datore || '').replace(',', '.'))) || 0.55;
      const baseAnnua = retribMese * ((ccnl && ccnl.mensilita) || 13);
      const regalo = baseAnnua * percDatore / 100;
      if (r.tfr.aFondi) return `Il tuo TFR va già a un fondo (${fmtEur(r.tfr.aFondi)} € quest’anno). Verifica sul sito del fondo che i versamenti — tuoi, del datore e del TFR — arrivino tutti.`;
      return `Oggi il tuo TFR resta in azienda (${r.tfr.quotaAnno != null ? 'quota di quest’anno: ' + fmtEur(r.tfr.quotaAnno) + ' €' : 'quota del mese: ' + fmtEur(r.tfr.quotaMese) + ' €'}). Con una retribuzione utile di ${fmtEur(retribMese)} €/mese, aderendo a ${esc(ccnl && ccnl.fondoPensione ? ccnl.fondoPensione.nome : 'un fondo di categoria')} col contributo minimo, il contributo del datore varrebbe circa ${fmtEur(regalo, 0)} €/anno (${fmtEur(percDatore)}% da contratto): in 30 anni ≈ ${fmtEur(regalo * 30, 0)} €, rendimenti esclusi. In cambio, TFR vincolato fino alla pensione salvo anticipi.`;
    }
    case 'silenzio-assenso': {
      const da = r.dipendente && r.dipendente.dataAssunzione;
      const m = da && da.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (!m) return null;
      const fine = new Date(+m[3], +m[2] - 1 + 6, +m[1]);
      const fmt = fine.toLocaleDateString('it-IT');
      return new Date() > fine
        ? `Sei stato assunto il ${da}: la finestra dei 6 mesi per la scelta esplicita è terminata il ${fmt}. Se non hai compilato nulla, guarda sul cedolino la riga “TFR a fondi” per capire dov’è finito il tuo TFR.`
        : `Sei stato assunto il ${da}: hai tempo fino al ${fmt} per scegliere esplicitamente con il modulo TFR2. Dopo quella data scatta il silenzio-assenso.`;
    }
    case 'valore-ora': {
      if (!oraria) return null;
      const giorno = r.elementi && r.elementi.totale ? r.elementi.totale / 26 : oraria * 6.67;
      return `I tuoi numeri: paga oraria ${fmtEur(oraria, 2)} €${r.elementi && r.elementi.totale && ccnl && ccnl.divisoreOrario ? ` (${fmtEur(r.elementi.totale)} € ÷ ${ccnl.divisoreOrario})` : ''}. Un’ora di straordinario al 15% ≈ ${fmtEur(oraria * 1.15, 2)} €, un’ora festiva al 20% ≈ ${fmtEur(oraria * 1.2, 2)} €, una tua giornata (e quindi un giorno di ferie) ≈ ${fmtEur(giorno, 0)} € lordi.`;
    }
    case 'tredicesima-tasse': {
      if (d.rateo13 == null) return null;
      return `Nella tua busta la 13ª${d.rateo14 != null ? ' (e la 14ª)' : ''} arriva a ratei mensili di ${fmtEur(d.rateo13)} €: l’effetto fiscale è già distribuito su ogni mese, quindi a dicembre non vedrai né la mensilità piena né il suo “salto” di tassazione.`;
    }
    case 'costo-azienda': {
      const lordo = r.totali && r.totali.competenze;
      if (!lordo || !r.totali.netto) return null;
      return `Stima sul tuo mese: competenze lorde ${fmtEur(lordo)} € → costo reale per l’azienda ≈ ${fmtEur(lordo * 1.4, 0)}–${fmtEur(lordo * 1.55, 0)} € tra contributi a suo carico, INAIL e TFR. Il tuo netto di ${fmtEur(r.totali.netto)} € è circa il ${fmtEur(r.totali.netto / (lordo * 1.45) * 100, 0)}% di quella cifra: la differenza sono contributi (futura pensione e tutele) e imposte.`;
    }
    case 'superminimo-assorbibile': {
      const sm = r.elementi && r.elementi.superminimo;
      if (!sm) return null;
      return `Nella tua busta c’è un superminimo di ${fmtEur(sm)} €/mese: se sul cedolino è indicato come “SUP.ASS.” è assorbibile, quindi i prossimi aumenti del CCNL, fino a ${fmtEur(sm)} €, potrebbero non cambiare il tuo lordo.`;
    }
    case 'sanita-enti': {
      const v = r.voci.find(x => /fast|est\b|metasalute|sanimoda|cadiprof|faschim|fasa\b|sanilog|asim|san\.?arti|ente\s*bilat|ebt/i.test(x.descrizione || '') && x.trattenuta != null);
      if (!v) return null;
      return `Nella tua busta: “${v.descrizione}” ti costa ${fmtEur(v.trattenuta)} €/mese (${fmtEur(v.trattenuta * 12, 0)} €/anno). Controlla sul sito del fondo cosa ti rimborsa: è già pagato.`;
    }
    case 'controlla-annualmente': {
      const p = r.progressivi || {};
      if (p.impIrpef == null) return null;
      return `I tuoi numeri da ritrovare: a ${ctx.periodo} risultano ${fmtEur(p.impIrpef)} € di imponibile IRPEF e ${fmtEur(p.irpefPagata)} € di IRPEF già pagata da inizio anno. Sono le cifre che a marzo dovranno tornare nella Certificazione Unica.`;
    }
    case 'riposi-limiti': {
      const ore = r.orario && r.orario.oreOrdinarie;
      if (!ore) return null;
      return `Nel tuo mese risultano ${fmtEur(ore)} ore ordinarie (~${fmtEur(ore / 4.33, 0)} a settimana): il tetto di legge, straordinari compresi, è una media di 48 ore a settimana.`;
    }
    case 'minimi-rinnovi': {
      const pb = r.elementi && r.elementi.pagaBase;
      if (!pb) return null;
      return `La tua paga base attuale è ${fmtEur(pb)} €${r.dipendente.livello ? ` (livello ${r.dipendente.livello})` : ''}: è il numero da confrontare con le tabelle del prossimo rinnovo, tranche per tranche.`;
    }
    default: return null;
  }
}
function renderConsigli() {
  const ctx = ctxCuriosita();
  $('#view-consigli').innerHTML = `
  <div class="card"><h2>Extra</h2>
  <p class="muted">Curiosità da sapere per essere trasparenti e capire come funzionano le cose: come stanno i fatti, cosa cambia con ogni scelta e dove verificarlo. ${ctx ? 'Dove possibile, i calcoli sono fatti sui numeri della tua busta.' : 'Importa una busta e i calcoli verranno fatti sui tuoi numeri.'}</p>
  ${CONSIGLI.map(c => {
    const pers = curiositaPersonale(c.id, ctx);
    const persHtml = pers ? `<div class="finding info"><span class="lvchip info">I tuoi numeri</span><div><p>${pers}</p></div></div>` : '';
    return `<details class="consiglio"><summary>${esc(c.titolo)}</summary>${c.semplice ? `<p><b>In breve:</b> ${esc(c.semplice)}</p>` : ''}${persHtml}${c.testo.map(p => `<p>${esc(p)}</p>`).join('')}${fontiHTML(c.fonti)}</details>`;
  }).join('')}
  </div>
  <div class="card"><h2>Dizionario della busta paga</h2>
    <p class="muted small">Le stesse spiegazioni che trovi toccando le “i” nell’app.</p>
    ${Object.values(GLOSSARIO).map(g => `<details class="legge"><summary>${esc(g.nome)}</summary><p>${esc(g.testo)}</p></details>`).join('')}
  </div>
  <div class="card"><h2>Esplora i CCNL in archivio</h2>
    <label class="field">Contratto<select id="extra-ccnl">${allCcnl().map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select></label>
    <div id="extra-ccnl-info" style="margin-top:10px"></div>
    <p class="muted small">In Italia esistono oltre 1.000 CCNL depositati. Se il tuo non c’è, puoi aggiungerlo dal menu ⋯ → Backup dei dati → Editor CCNL copiando i valori dal testo ufficiale.</p>
  </div>
  <div class="card"><h2>Fonti ufficiali</h2>
    ${Object.values(FONTI).map(f => `<div class="fonte-item"><a href="${esc(f.url)}" target="_blank" rel="noopener"><b>${esc(f.label)}</b></a><br><span class="muted small">${esc(f.cosa)}</span></div>`).join('')}
  </div>`;
  const sel = $('#extra-ccnl');
  const paint = () => { const c = ccnlById(sel.value); $('#extra-ccnl-info').innerHTML = c ? ccnlInfoCard(c, null) : ''; };
  sel.addEventListener('change', paint); paint();
}

/* ============================================================
   GUIDA E FONTI
   ============================================================ */
function renderGuida() {
  $('#view-guida').innerHTML = `
  <div class="card"><h2>I tuoi diritti minimi (valgono sempre)</h2>
  <p class="muted small">Questi sono i minimi di LEGGE: il CCNL può solo migliorarli, mai peggiorarli.</p>
  ${LEGGE.map(l => `<details class="legge"><summary>${esc(l.titolo)}</summary><p>${esc(l.testo)}</p>${fontiHTML(l.fonti)}</details>`).join('')}
  </div>`;
}

/* ============================================================
   IL PROGETTO
   ============================================================ */
function renderProgetto() {
  $('#view-progetto').innerHTML = `
  <div class="card"><h2>Perché esiste BustaChiara</h2>
    <p>La busta paga è uno dei documenti più importanti della vita di chi lavora, ed è scritta in un linguaggio che quasi nessuno ha mai studiato. Il risultato è che tanti — soprattutto chi è al primo impiego — firmano, incassano e sperano che i conti siano giusti. Gli errori in busta esistono, sono più frequenti di quanto si pensi, e quasi sempre nessuno li cerca.</p>
    <p>BustaChiara nasce per una cosa sola: metterti in condizione di <b>capire</b> la tua busta e di <b>controllarla</b>, senza dover essere un consulente del lavoro e senza dover consegnare i tuoi dati a qualcun altro.</p>
    <p>Il progetto è nato anche per evitare di inviare la propria busta paga a <b>ChatGPT, ad altre intelligenze artificiali o a servizi online</b>. Non dovrebbe essere necessario condividere stipendio, codice fiscale, assenze, prestiti o informazioni sanitarie soltanto per capire un cedolino.</p>
  </div>
  <div class="card"><h2>Un progetto Open Source</h2>
    <p>BustaChiara è un progetto <b>Open Source</b>: il codice è pubblico e chiunque può contribuire a rendere il servizio più chiaro, preciso e accessibile.</p>
    <p>Puoi aiutare segnalando un problema, proponendo una funzione, migliorando le spiegazioni, verificando un CCNL o inviando direttamente una modifica al codice. <b>Ogni persona che contribuirà concretamente al progetto verrà riconosciuta nella lista dei contributori.</b></p>
    <p><a href="https://github.com/MarvinBonazzo/bustachiara" target="_blank" rel="noopener"><b>Apri il progetto su GitHub →</b></a></p>
  </div>
  <div class="card"><h2>Privacy — come funziona davvero</h2>
    <p>Una busta paga contiene l’elenco più sensibile di informazioni che esista su di te: quanto guadagni, dove lavori, il tuo codice fiscale, i tuoi prestiti (cessioni del quinto), a volte perfino dati sulla salute (malattie, permessi 104). Caricarla su un servizio online — o incollarla in una chat con un’intelligenza artificiale — significa affidare tutto questo a un’azienda terza, alle sue policy e ai suoi archivi.</p>
    <p>Il codice attuale <b>non invia il documento né i dati estratti</b>: PDF, immagini e analisi restano su questo dispositivo. La <b>Content-Security-Policy</b> blocca i servizi di terze parti, ma consente le risorse della stessa origine necessarie a caricare e aggiornare la PWA. I motori PDF e OCR sono inclusi nell’app e funzionano anche offline.</p>
    <p>I dati stanno nel <b>localStorage del browser</b> di questo dispositivo. Cancellando i dati di navigazione del sito si cancellano anche le buste archiviate: fai backup periodici dalla scheda <b>Backup</b>.</p>
    <p>Il file originale del PDF <b>non viene salvato</b>: conserviamo soltanto i dati estratti che confermi. L’anteprima usata durante la verifica rimane temporaneamente in memoria e viene eliminata quando esci dalla schermata.</p>
  </div>
  <div class="card"><h2>I principi</h2>
    <p><b>Trasparenza:</b> ogni controllo mostra la formula usata; ogni valore normativo cita la fonte e il link per verificarlo. Dove i dati interni potrebbero essere invecchiati (i CCNL si rinnovano), l’app lo dichiara invece di fingere certezza.</p>
    <p><b>Obiettività:</b> l’app non ti dice cosa scegliere (per esempio sul TFR): ti mostra cosa cambia con ogni opzione, chi ci guadagna cosa, e ti lascia decidere.</p>
    <p><b>Accessibilità:</b> deve poterla capire anche chi è al primo contratto. Per questo esistono il Riassunto, il dizionario dei termini e le “i” di spiegazione ovunque.</p>
    <p><b>Nessun interesse:</b> non c’è niente in vendita, nessun fondo o servizio da consigliarti, nessun dato da monetizzare.</p>
  </div>
  <div class="card"><h2>I limiti, dichiarati</h2>
    <p><b>Le intelligenze artificiali possono sbagliare e anche BustaChiara può sbagliare.</b> Confronta sempre i dati estratti con il documento originale, soprattutto quando l’app indica un valore da controllare.</p>
    <p>BustaChiara è uno strumento informativo: non sostituisce sindacati, CAF, patronati o consulenti del lavoro — anzi, ti indica quando e come rivolgerti a loro. L’archivio interno copre i principali CCNL e le regole fiscali fino al 2026: per tutto il resto trovi i link alle fonti ufficiali e un editor per aggiungere il tuo contratto.</p>
  </div>`;
}

/* ============================================================
   BACKUP E STRUMENTI LOCALI
   ============================================================ */
function renderImpostazioni() {
  const custom = Store.data.customCcnl || [];
  $('#view-impostazioni').innerHTML = `
  <div class="card"><h2>Backup e trasferimento</h2>
    <div class="btnrow">
      <button class="primary" id="btn-export">Esporta tutto (JSON)</button>
      <button class="ghost" id="btn-import-json">Importa backup</button>
      <input type="file" id="json-input" accept="application/json" aria-label="Scegli un backup JSON di BustaChiara" hidden>
      <button class="danger" id="btn-wipe">Cancella tutti i dati</button>
    </div>
    <p class="muted small">L’export contiene le buste in chiaro: trattalo come un documento riservato.</p>
  </div>
  <div class="card"><h2>Aiuta il parser senza inviare il PDF</h2>
    <p>Le correzioni vengono ricordate solo su questo dispositivo. Il pacchetto per contribuire rimuove identità e file, cancella gli estratti testuali e trasforma gli importi mantenendo le relazioni matematiche.</p>
    <div class="btnrow"><button class="ghost" id="btn-export-fixtures">Controlla ed esporta fixture</button></div>
    <p class="muted small">Correzioni apprese: <b>${(Store.data.voiceAliases || []).length}</b> · profili locali di formato: <b>${(Store.data.layoutProfiles || []).length}</b>. I profili non contengono PDF, nomi, importi o testo del cedolino.</p>
  </div>
  <div class="card"><h2>Editor CCNL personalizzato</h2>
    <p class="muted small">Copia i valori dal testo del tuo CCNL (archivio CNEL o sindacati) e avrai i controlli su misura.</p>
    <div class="grid">
      <label class="field">Nome contratto<input id="cc-nome" placeholder="es. CCNL Panificazione"></label>
      <label class="field">Codici CNEL (virgola)<input id="cc-cnel" placeholder="es. H123"></label>
      <label class="field">Parole chiave riconoscimento<input id="cc-match" placeholder="es. panificaz, forno"></label>
      <label class="field">Ferie (gg/anno)<input id="cc-ferie" inputmode="numeric"></label>
      <label class="field">ROL (ore/anno a regime)<input id="cc-rol" inputmode="numeric"></label>
      <label class="field">Ex festività (ore/anno)<input id="cc-exf" inputmode="numeric"></label>
      <label class="field">Mensilità (13 o 14)<input id="cc-mens" inputmode="numeric"></label>
      <label class="field">Divisore orario<input id="cc-div" inputmode="numeric" placeholder="es. 168, 172, 173"></label>
      <label class="field">Fondo pensione<input id="cc-fondo" placeholder="es. Fon.Te."></label>
      <label class="field">Contributo datore %<input id="cc-datore" placeholder="es. 0,55"></label>
    </div>
    <label class="field" style="margin-top:8px">Minimi tabellari (livello=importo, separati da ;)<input id="cc-minimi" placeholder="4=1688,98; 5=1550,00"></label>
    <div class="btnrow"><button class="primary" id="btn-cc-save">Salva CCNL</button></div>
    ${custom.length ? `<h3>I tuoi CCNL</h3>${custom.map((c, i) => `<div class="fonte-item">${esc(c.nome)} <button class="danger del-cc" data-i="${i}" style="float:right;padding:2px 10px">×</button></div>`).join('')}` : ''}
  </div>
  <div class="card"><h2>Aggiornamento delle regole</h2>
    <p class="muted">Le regole fiscali incorporate coprono il <b>2024, 2025 e 2026</b>. L’indice ufficiale contiene <b>${typeof CNEL_INDEX_META !== 'undefined' ? CNEL_INDEX_META.codes : 'oltre 1.000'} codici CNEL</b> ed è rigenerabile dagli Open Data; per i principali contratti l’app conserva anche regole dettagliate. Scaglioni, bonus, minimi e aliquote possono cambiare: il testo ufficiale resta la fonte che fa fede.</p>
    ${fontiHTML(['ade', 'inps', 'cnel'])}
  </div>`;
  $('#btn-export').addEventListener('click', () => {
    downloadJson('bustachiara-backup-' + new Date().toISOString().slice(0, 10) + '.json', Store.data);
  });
  $('#btn-export-fixtures').addEventListener('click', () => {
    if (!Store.data.records.length && !(Store.data.voiceAliases || []).length && !(Store.data.layoutProfiles || []).length) { toast('Non ci sono ancora correzioni o buste da esportare.'); return; }
    openContributionPreview();
  });
  $('#btn-import-json').addEventListener('click', () => $('#json-input').click());
  $('#json-input').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.records)) throw new Error('formato non valido');
      const ids = new Set(Store.data.records.map(r => r.id));
      let n = 0;
      for (const r of d.records) if (!ids.has(r.id)) { Store.data.records.push(r); n++; }
      Store.data.customCcnl = [...(Store.data.customCcnl || []), ...((d.customCcnl || []).filter(c => !(Store.data.customCcnl || []).some(x => x.id === c.id)))];
      for (const alias of d.voiceAliases || []) {
        if (!(Store.data.voiceAliases || []).some(existing => existing.software === alias.software && existing.key === alias.key)) Store.data.voiceAliases.push(alias);
      }
      for (const profile of d.layoutProfiles || []) {
        const current = (Store.data.layoutProfiles || []).find(existing => existing.key === profile.key);
        if (!current) Store.data.layoutProfiles.push(profile);
        else if ((profile.samples || 0) > (current.samples || 0)) Store.data.layoutProfiles[Store.data.layoutProfiles.indexOf(current)] = profile;
      }
      Store.save(); renderImporta(); renderImpostazioni();
      toast(`Import completato: ${n} buste aggiunte.`);
    } catch (err) { toast('Backup non valido: ' + err.message); }
  });
  $('#btn-wipe').addEventListener('click', () => {
    if (!confirm('Cancellare TUTTE le buste e i CCNL personalizzati da questo dispositivo? (irreversibile senza backup)')) return;
    Store.data = { records: [], customCcnl: [], voiceAliases: [], layoutProfiles: [] }; Store.save();
    renderImporta(); renderImpostazioni(); toast('Dati cancellati.');
  });
  $('#btn-cc-save').addEventListener('click', () => {
    const g = id => $('#' + id).value.trim();
    const nome = g('cc-nome'); if (!nome) { toast('Serve almeno il nome del contratto.'); return; }
    const minimi = {};
    g('cc-minimi').split(/[;\n]/).forEach(s => { const m = s.split('='); if (m.length === 2 && m[0].trim()) { const v = flexNum(m[1]); if (v != null) minimi[m[0].trim()] = v; } });
    const c = {
      id: 'custom-' + uid(), nome: nome + ' (personalizzato)',
      cnel: g('cc-cnel') ? g('cc-cnel').toUpperCase().split(/\s*,\s*/) : [],
      matchSrc: g('cc-match') ? g('cc-match').split(/\s*,\s*/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : [],
      firmatari: '', personalizzato: true,
      ferie: { giorni: flexNum(g('cc-ferie')) || 20, nota: 'Inserito manualmente.', verificato: true },
      rol: { ore: flexNum(g('cc-rol')) || 0, verificato: true },
      exFest: { ore: flexNum(g('cc-exf')) || 0, verificato: true },
      mensilita: flexNum(g('cc-mens')) || 13,
      divisoreOrario: flexNum(g('cc-div')) || null, divisoreGiorni: 26,
      fondoPensione: g('cc-fondo') ? { nome: g('cc-fondo'), datore: g('cc-datore') || null, fonte: 'covip', verificato: true } : null,
      minimi: { aggiornatoA: 'inserimento manuale ' + new Date().toISOString().slice(0, 10), livelli: minimi, verificato: true },
      fontiTesto: ['cnel'],
    };
    Store.data.customCcnl.push(c); Store.save(); renderImpostazioni(); toast('CCNL salvato: ora è selezionabile in verifica.');
  });
  $$('.del-cc').forEach(b => b.addEventListener('click', () => {
    Store.data.customCcnl.splice(+b.dataset.i, 1); Store.save(); renderImpostazioni();
  }));
}

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function scrubContributionText(value) {
  return String(value || '')
    .replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi, '[CF]')
    .replace(/\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b/gi, '[IBAN]')
    .replace(/\b\d{11}\b/g, '[ID]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+39[ .-]?)?(?:\d[ .-]?){9,10}\b/g, '[TELEFONO]')
    .replace(/\b[A-ZÀ-Ù][A-ZÀ-Ù' &.-]{2,}\s+(?:S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?A\.?S\.?|S\.?N\.?C\.?|COOP(?:ERATIVA)?)\b/gi, '[AZIENDA]');
}
function scaleFixtureMoney(clone, factor) {
  const round = value => Math.round(value * factor * 100) / 100;
  const paths = [
    'elementi.pagaBase', 'elementi.contingenza', 'elementi.superminimo', 'elementi.scatti', 'elementi.totale',
    'orario.pagaOraria', 'orario.pagaGiornaliera', 'totali.competenze', 'totali.trattenute', 'totali.arrotondamento', 'totali.netto',
    'tfr.retribUtile', 'tfr.quotaMese', 'tfr.fondo3112', 'tfr.rivalutazione', 'tfr.impRivalutazione', 'tfr.quotaAnno', 'tfr.aFondi', 'tfr.anticipi',
    'progressivi.impInps', 'progressivi.impIrpef', 'progressivi.irpefPagata', 'progressivi.impInail',
  ];
  for (const path of paths) { const value = getPath(clone, path); if (typeof value === 'number') setPath(clone, path, round(value)); }
  for (const voice of clone.voci || []) for (const key of ['base', 'trattenuta', 'competenza', 'costoAzienda']) if (typeof voice[key] === 'number') voice[key] = round(voice[key]);
  if (clone.totali && clone.totali.competenze != null && clone.totali.trattenute != null) {
    clone.totali.netto = Math.round((clone.totali.competenze - clone.totali.trattenute + (clone.totali.arrotondamento || 0)) * 100) / 100;
  }
  delete clone.derivati;
  if (clone.meta && clone.meta.reconciliation) {
    if (clone.meta.reconciliation.voiceSums) for (const key of ['competenze', 'trattenute']) if (typeof clone.meta.reconciliation.voiceSums[key] === 'number') clone.meta.reconciliation.voiceSums[key] = round(clone.meta.reconciliation.voiceSums[key]);
    for (const item of clone.meta.reconciliation.alternatives || []) for (const key of ['competenze', 'trattenute', 'arrotondamento', 'netto']) if (typeof item[key] === 'number') item[key] = round(item[key]);
    // Le differenze dei controlli possono ricostruire importi reali: il punteggio
    // resta utile alla fixture, i dettagli numerici vengono rigenerati dal parser.
    delete clone.meta.reconciliation.checks;
  }
  for (const candidates of Object.values(clone.meta && clone.meta.candidates || {})) {
    for (const candidate of candidates || []) if (typeof candidate.value === 'number') candidate.value = round(candidate.value);
  }
}
function anonymizeFixture(record, factor = .93) {
  const clone = JSON.parse(JSON.stringify(record));
  delete clone.id;
  clone.azienda = {};
  clone.dipendente = {
    livello: clone.dipendente && clone.dipendente.livello || null,
    qualifica: clone.dipendente && clone.dipendente.qualifica || null,
  };
  if (clone.meta) {
    delete clone.meta.fileName;
    delete clone.meta.importedAt;
    for (const meta of Object.values(clone.meta.fields || {})) { delete meta.snippet; delete meta.label; }
    for (const candidates of Object.values(clone.meta.candidates || {})) for (const candidate of candidates) { delete candidate.snippet; delete candidate.label; }
  }
  for (const voice of clone.voci || []) {
    voice.descrizione = scrubContributionText(voice.descrizione);
    voice.descrizioneOriginale = scrubContributionText(voice.descrizioneOriginale);
    if (voice.rifTesto) voice.rifTesto = scrubContributionText(voice.rifTesto);
    if (voice.meta && voice.meta.visual) delete voice.meta.visual.snippet;
  }
  scaleFixtureMoney(clone, factor);
  return clone;
}

function createContributionPackage() {
  const factor = .82 + Math.random() * .34;
  const aliases = (Store.data.voiceAliases || []).map(({ software, key, originale, descrizione, categoria, nome }) => ({
    software: scrubContributionText(software), key: scrubContributionText(key), originale: scrubContributionText(originale),
    descrizione: scrubContributionText(descrizione), categoria, nome: scrubContributionText(nome),
  }));
  const fixtures = Store.data.records.map(record => anonymizeFixture(record, factor));
  return {
    contribution: { schema: 'bustachiara-anonymized-fixtures-v2', generatedAt: new Date().toISOString(), aliases, fixtures },
    report: {
      fixtures: fixtures.length, aliases: aliases.length,
      voices: fixtures.reduce((sum, record) => sum + (record.voci || []).length, 0),
      customDescriptions: fixtures.reduce((sum, record) => sum + (record.voci || []).filter(voice => !voice.codice || /gestionale|aziendale/i.test(voice.descrizione || '')).length, 0),
    },
  };
}
function openContributionPreview() {
  const result = createContributionPackage();
  const report = result.report;
  openInfo('Controllo privacy del contributo', `
    <div class="privacy-checklist">
      <p><b>${report.fixtures}</b> fixture · <b>${report.voices}</b> voci · <b>${report.aliases}</b> correzioni locali</p>
      <p>✓ Nomi, codice fiscale, azienda, identificativi e nome file rimossi.</p>
      <p>✓ Estratti testuali della pagina eliminati; restano soltanto coordinate anonime.</p>
      <p>✓ Importi trasformati con un fattore casuale mantenendo la quadratura.</p>
      <p>${report.customDescriptions ? `⚠ Restano ${report.customDescriptions} causali proprietarie: leggile nel JSON prima di pubblicarlo.` : '✓ Nessuna causale proprietaria evidente.'}</p>
    </div>
    <div class="btnrow"><button class="primary" id="confirm-fixture-export">Crea il file da controllare</button><button class="ghost" id="cancel-fixture-export">Annulla</button></div>`);
  $('#confirm-fixture-export').addEventListener('click', () => {
    downloadJson('bustachiara-fixtures-anonime-' + new Date().toISOString().slice(0, 10) + '.json', result.contribution);
    closeInfo(); toast('Fixture creata: aprila e rileggila prima di condividerla.');
  });
  $('#cancel-fixture-export').addEventListener('click', closeInfo);
}

/* ---------- menu "altro" ---------- */
function openMenu() {
  $('#app-menu').hidden = false;
  $('#menu-btn').setAttribute('aria-expanded', 'true');
  const first = $('#app-menu .menu-item:not([hidden])'); if (first) first.focus();
}
function closeMenu() {
  const menu = $('#app-menu'); if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

/* ============================================================
   INSTALLAZIONE PWA
   ============================================================ */
let installPromptEvent = null;
const inStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
function aggiornaPulsanteInstallazione() {
  const b = $('#install-btn');
  if (!b) return;
  const servitaDalWeb = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  b.hidden = !servitaDalWeb || inStandalone();
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  aggiornaPulsanteInstallazione();
});
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  aggiornaPulsanteInstallazione();
  toast('BustaChiara è installata e pronta anche offline.');
});
async function installaApp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const android = /android/i.test(navigator.userAgent);
  const mac = /macintosh|mac os x/i.test(navigator.userAgent);
  const suggerimento = ios
    ? 'Su questo dispositivo: apri BustaChiara in Safari, tocca Condividi e scegli “Aggiungi alla schermata Home”.'
    : android
      ? 'Su questo dispositivo: usa “Installa ora” qui sotto oppure il menu ⋮ di Chrome → “Installa app”.'
      : mac
        ? 'Su questo Mac: in Safari scegli File → “Aggiungi al Dock”; con Chrome o Edge usa “Installa ora”.'
        : 'Su questo computer: usa “Installa ora” oppure l’icona di installazione nella barra degli indirizzi di Chrome o Edge.';
  const promptDisponibile = !!installPromptEvent;
  openInfo('Installa BustaChiara', `
    <div class="finding info"><span class="lvchip info">Per te</span><div><p>${suggerimento}</p></div></div>
    ${promptDisponibile ? '<div class="btnrow"><button class="primary" id="avvia-installazione">Installa ora</button></div>' : ''}
    <h4>iPhone e iPad</h4>
    <p>Apri il sito con <b>Safari</b> → tocca <b>Condividi</b> (il quadrato con la freccia) → scorri e scegli <b>Aggiungi alla schermata Home</b> → tocca <b>Aggiungi</b>.</p>
    <h4>Android</h4>
    <p>Apri il sito con <b>Chrome</b> → tocca il menu <b>⋮</b> → scegli <b>Installa app</b> o <b>Aggiungi alla schermata Home</b> → conferma. Se compare “Installa ora” qui sopra, puoi usare direttamente quello.</p>
    <h4>PC Windows o Linux</h4>
    <p>Apri il sito con <b>Chrome</b> o <b>Microsoft Edge</b> → clicca l’icona di installazione nella barra degli indirizzi, oppure apri il menu del browser e scegli <b>Installa BustaChiara</b>.</p>
    <h4>Mac</h4>
    <p>Con <b>Safari 17 o successivo</b>: menu <b>File → Aggiungi al Dock</b>. Con Chrome o Edge: usa l’icona di installazione nella barra degli indirizzi o il menu <b>Installa BustaChiara</b>.</p>
    <p><b>Dopo l’installazione</b>, l’app compare insieme alle altre applicazioni e continua a funzionare offline. Serve una connessione solo alla prima apertura e per ricevere gli aggiornamenti.</p>
    <p class="muted small">Non serve cercarla su App Store o Play Store: BustaChiara è una PWA e si installa direttamente dal sito. I dati restano separati su ogni dispositivo, quindi usa il menu ⋯ → Backup dei dati → Esporta tutto per trasferirli.</p>`);
  if (promptDisponibile) {
    const b = $('#avvia-installazione');
    if (b) b.addEventListener('click', async () => {
      const evento = installPromptEvent;
      closeInfo();
      if (!evento) return;
      await evento.prompt();
      installPromptEvent = null;
      aggiornaPulsanteInstallazione();
    });
  }
}

/* ============================================================
   AVVIO
   ============================================================ */
(function boot() {
  try {
    if (typeof pdfjsLib !== 'undefined') {
      const blob = new Blob([b64ToText(PDF_WORKER_B64)], { type: 'text/javascript' });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    }
  } catch (e) { console.warn('pdf.js worker non inizializzato:', e); }
  Store.load();

  // controlli barra superiore
  $('#brand-home').addEventListener('click', (e) => { e.preventDefault(); navigateTo('importa'); });
  $('#menu-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#app-menu').hidden ? openMenu() : closeMenu(); });
  $('#app-menu').addEventListener('click', (e) => {
    const item = e.target.closest('[data-view]'); if (!item) return;
    navigateTo(item.dataset.view);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeMenu(); });
  $('#install-btn').addEventListener('click', () => { closeMenu(); installaApp(); });
  $('#privacy-badge').addEventListener('click', () => openInfo('Come proteggiamo i tuoi dati', '<p>Il codice attuale elabora PDF, foto e numeri <b>interamente su questo dispositivo</b> e non invia il documento né i dati estratti.</p><p>La Content-Security-Policy blocca i servizi di terze parti; permette soltanto le risorse della stessa origine necessarie a caricare e aggiornare la PWA. Il PDF originale non viene salvato: restano soltanto i dati che confermi.</p><p class="muted small">La cronologia è nella memoria di questo browser. Per non perderla, crea periodicamente un backup dal menu ⋯ → Backup dei dati.</p>'));
  try { history.scrollRestoration = 'manual'; } catch (e) { /* browser datato */ }
  window.addEventListener('popstate', handleHistoryPopState);
  aggiornaPulsanteInstallazione();

  // popover: apertura da qualsiasi "i" e chiusura
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('.ibtn'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.vocei != null) {
      const v = detailVoci[+b.dataset.vocei];
      if (v) { const s = spiegaVoce(v); openInfo(s.nome + (v.descrizione && v.descrizione !== s.nome ? ` (“${v.descrizione}”)` : ''), vociInfoHtml(v)); }
      return;
    }
    const g = GLOSSARIO[b.dataset.info];
    if (g) openInfo(g.nome, `<p>${esc(g.testo)}</p>`);
  });
  $('#popover-close').addEventListener('click', closeInfo);
  $('#popover-backdrop').addEventListener('click', closeInfo);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); closeInfo(); }
    if (e.key === 'Tab' && !$('#popover').hidden) {
      const focusabili = $$('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])', $('#popover-card')).filter(x => !x.disabled);
      if (!focusabili.length) return;
      const first = focusabili[0], last = focusabili[focusabili.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  try {
    if (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)) {
      // PWA: manifest e icona vengono collegati solo quando l'app è servita via web
      // (nel file singolo aperto con doppio clic non servono e darebbero solo warning)
      const lm = document.createElement('link'); lm.rel = 'manifest'; lm.href = 'manifest.webmanifest'; document.head.appendChild(lm);
      const li = document.createElement('link'); li.rel = 'apple-touch-icon'; li.href = 'icons/apple-touch-icon.png'; document.head.appendChild(li);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                toast('È disponibile una versione più recente. Si attiverà alla prossima apertura.');
              }
            });
          });
        }).catch(() => { /* senza sw.js accanto: nessun problema */ });
      }
    }
  } catch (e) { /* ambienti senza service worker */ }
  renderImporta(); renderConsigli(); renderGuida(); renderProgetto(); renderImpostazioni();
  const initialHistoryState = restoreHistoryEntry();
  const requestedView = location.hash.replace(/^#/, '');
  let initialView = APP_VIEWS.has(requestedView) && requestedView !== 'verifica' ? requestedView : 'importa';
  const initialRecordId = initialHistoryState && initialHistoryState.view === initialView ? initialHistoryState.recordId || null : null;
  if (!renderRoute(initialView, initialRecordId)) initialView = 'importa';
  showView(initialView, { historyMode: 'replace', recordId: initialRecordId });
})();
