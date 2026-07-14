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
function primaFrase(t) { const i = (t || '').indexOf('. '); return i > 20 ? t.slice(0, i + 1) : (t || ''); }
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
  data: { records: [], customCcnl: [], voiceAliases: [] },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && Array.isArray(d.records)) {
        this.data = Object.assign(this.data, d);
        delete this.data.prefs; // migrazione: la vecchia modalità semplificata non esiste più
        this.data.voiceAliases = Array.isArray(d.voiceAliases) ? d.voiceAliases : [];
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
  ['#topbar', '#tabs', 'main', 'footer'].forEach(s => {
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
  ['#topbar', '#tabs', 'main', 'footer'].forEach(s => {
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
  const catKey = s.cat === 'trattenuta' ? 'trattenuta' : (s.cat === 'competenza' ? 'competenza' : 'dato');
  const catG = GLOSSARIO[catKey];
  return `<p class="muted small">${esc(catG ? catG.nome + ': ' + primaFrase(catG.testo) : '')}</p>
    <p>${esc(s.cosa)}</p>
    ${s.controlla ? `<p><b>Da controllare:</b> ${esc(s.controlla)}</p>` : ''}
    ${fontiHTML(s.fonti)}`;
}

/* ---------- spiegazione voci ---------- */
function spiegaVoce(v) {
  return classificaVoce(v);
}

/* ---------- navigazione ---------- */
let currentDetailId = null;
let draft = null; // { record, warnings } in verifica
function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $('#view-' + name); if (el) el.classList.add('active');
  $$('#tabs .tab').forEach(b => {
    const active = b.dataset.view === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0 });
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  if (b.id === 'riassunto-btn') return;
  const v = b.dataset.view;
  // le viste dipendenti dai dati vengono ridisegnate a ogni apertura
  if (v === 'dettaglio') renderDettaglio(currentDetailId || (recSorted().slice(-1)[0] || {}).id);
  else if (v === 'importa') renderImporta();
  else if (v === 'consigli') renderConsigli();
  showView(v);
});

/* ============================================================
   IMPORTA
   ============================================================ */
function renderImporta() {
  const recs = recSorted();
  const last = recs[recs.length - 1];
  const conNetto = recs.filter(r => r.totali.netto != null);
  const media = conNetto.length ? conNetto.reduce((s, r) => s + r.totali.netto, 0) / conNetto.length : 0;
  const archivio = !recs.length ? `
  <div class="card steps-card">
    <p class="eyebrow">COME FUNZIONA</p>
    <h2>Dal documento alle risposte, in tre passi</h2>
    <div class="steps">
      <div class="step"><span>1</span><div><b>Leggo</b><p>Estraggo voci, totali, TFR, ferie e contratto dal tuo file.</p></div></div>
      <div class="step"><span>2</span><div><b>Tu verifichi</b><p>Confermi o correggi i dati: resti sempre tu ad avere l’ultima parola.</p></div></div>
      <div class="step"><span>3</span><div><b>Faccio chiarezza</b><p>Spiego le voci, rifaccio i conti e segnalo cosa merita attenzione.</p></div></div>
    </div>
  </div>` : `
  <div class="kpis">
    <div class="kpi"><div class="v">${fmtEur(last.totali.netto)} €</div><div class="l">Ultimo netto (${esc(periodoLabel(last.periodo))}) ${iBtn('netto')}</div></div>
    <div class="kpi"><div class="v">${fmtEur(media)} €</div><div class="l">Netto medio</div></div>
    ${last.tfr && last.tfr.fondo3112 != null ? `<div class="kpi"><div class="v">${fmtEur((last.tfr.fondo3112 || 0) + (last.tfr.quotaAnno || 0))} €</div><div class="l">TFR stimato ad oggi ${iBtn('tfr')}</div></div>` : ''}
    <div class="kpi"><div class="v">${recs.length}</div><div class="l">Buste archiviate</div></div>
  </div>
  ${conNetto.length >= 2 ? `<div class="card"><h2>Andamento del netto</h2>${sparkSVG(recs)}</div>` : ''}
  <div class="card"><h2>Le tue buste</h2>
    ${[...recs].reverse().map((r, idx, arr) => {
      const prev = [...recs].reverse().find(candidate => periodoKey(candidate.periodo) < periodoKey(r.periodo)
        && employerKey(candidate) === employerKey(r) && tipoCedolino(candidate) === tipoCedolino(r));
      const delta = prev && prev.totali.netto != null && r.totali.netto != null ? r.totali.netto - prev.totali.netto : null;
      return `<div class="rec-card" data-id="${esc(r.id)}">
        <div><div class="per">${esc(periodoLabel(r.periodo))} <span class="badge dato">${esc(tipoCedolinoLabel(r))}</span></div><div class="muted small">${esc(r.azienda.nome || '')}</div></div>
        <div style="text-align:right"><div class="netto">${fmtEur(r.totali.netto)} €</div>
        ${delta != null ? `<div class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'} ${fmtEur(Math.abs(delta))} € vs mese prec.</div>` : ''}</div>
      </div>`;
    }).join('')}
    <p class="muted small">Tocca una busta per aprirne l’analisi completa.</p>
  </div>
  <div class="card"><h2>Dove sono salvati questi dati</h2>
    <p>Tutto quello che vedi qui è salvato <b>solo nella memoria del browser di questo dispositivo</b> (si chiama localStorage): niente cloud, niente account, nessun server. In pratica:</p>
    <p class="muted">— Se apri l’app su un altro dispositivo o con un altro browser, lì l’archivio parte vuoto: ogni browser ha il suo, separato.<br>
    — Se usi una finestra in incognito/privata, i dati spariscono quando la chiudi.<br>
    — Se cancelli i dati di navigazione (cronologia/siti) del browser, cancelli anche questo archivio.<br>
    — Per fare un backup o portare i dati altrove: scheda <b>Backup → Esporta tutto</b> (scarica un file JSON, da custodire come un documento riservato) e poi <b>Importa backup</b> sull’altro dispositivo.</p>
  </div>`;
  $('#view-importa').innerHTML = `
  <div class="card import-hero">
    <div class="hero-copy">
      <p class="eyebrow">BUSTA PAGA CHIARA, LETTERALMENTE</p>
      <h2>Porta chiarezza nei numeri del tuo stipendio.</h2>
      <p>Importa la busta paga: BustaChiara traduce le voci, ricontrolla i calcoli e ti indica cosa approfondire, in parole comprensibili.</p>
      <div class="trust-row" aria-label="Garanzie di privacy e funzionamento">
        <span>🔒 Nessun caricamento</span><span>✈️ Funziona offline</span><span>✓ Verifica prima di salvare</span>
      </div>
    </div>
    <div id="dropzone" role="button" tabindex="0" aria-describedby="dropzone-help">
      <div class="dz-icon"></div>
      <p><b>Scegli la tua busta paga</b><br><span class="drop-secondary">oppure trascinala qui</span><br><span id="dropzone-help" class="muted small">PDF, scansione o foto · tutto viene letto su questo dispositivo</span></p>
      <input type="file" id="file-input" accept="application/pdf,image/*" aria-label="Scegli un PDF o un'immagine della busta paga" hidden>
    </div>
    <div id="import-status" role="status" aria-live="polite" style="display:none; margin-top:12px">
      <p id="import-msg" class="muted"></p><progress id="import-bar" max="1" value="0"></progress>
    </div>
    <div class="btnrow">
      <button class="ghost" id="btn-manual">Inserimento manuale</button>
      <button class="demo-link" id="btn-demo">Prima voglio vedere un esempio →</button>
    </div>
  </div>
  ${archivio}`;
  const dz = $('#dropzone'), fi = $('#file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); fi.value = ''; });
  $('#btn-manual').addEventListener('click', () => startVerifica(emptyRecord(), ['Inserimento manuale: compila i campi che hai, non serve riempirli tutti.']));
  $('#btn-demo').addEventListener('click', () => startVerifica(demoRecord(), ['Busta di ESEMPIO (dati inventati ma coerenti): usala per esplorare l’app.'], [demoPreviewDataUrl()]));
  $('#view-importa').onclick = (e) => {
    const c = e.target.closest('.rec-card'); if (!c) return;
    renderDettaglio(c.dataset.id); showView('dettaglio');
  };
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
        startVerifica(record, warnings, previews);
      } else {
        importStatus('PDF senza testo (scansione): avvio la lettura ottica locale…', 0.15);
        const canvases = [];
        for (let p = 1; p <= pdf.numPages; p++) canvases.push(await renderPage(await pdf.getPage(p), 2.6));
        const { record, warnings, previewPages } = await parseDaOcr(canvases, (m, f) => importStatus('Lettura ottica: ' + m, 0.15 + 0.8 * (f || 0)));
        record.meta.fileName = file.name;
        startVerifica(record, warnings, previewPages);
      }
    } else if (/^image\//.test(file.type)) {
      importStatus('Preparo l’immagine…', 0.1);
      const canvas = await imageToCanvas(file);
      const { record, warnings, previewPages } = await parseDaOcr([canvas], (m, f) => importStatus('Lettura ottica: ' + m, 0.1 + 0.85 * (f || 0)));
      record.meta.fileName = file.name;
      startVerifica(record, warnings, previewPages);
    } else {
      toast('Formato non supportato: usa PDF o immagine.');
    }
  } catch (err) {
    console.error(err);
    importStatus('Errore: ' + err.message, 0);
    toast('Non sono riuscito a leggere il file: prova con l’inserimento manuale.');
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
  for (const word of secondary.words || []) {
    if (!word.text || !word.bbox) continue;
    const cx = (word.bbox.x0 + word.bbox.x1) / 2, cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const duplicateIndex = words.findIndex(existing => {
      if (!existing.bbox) return false;
      const ex = (existing.bbox.x0 + existing.bbox.x1) / 2, ey = (existing.bbox.y0 + existing.bbox.y1) / 2;
      const tolerance = Math.max(8, word.bbox.y1 - word.bbox.y0);
      return Math.abs(cx - ex) <= tolerance && Math.abs(cy - ey) <= tolerance
        && aliasKey(existing.text) === aliasKey(word.text);
    });
    if (duplicateIndex < 0) words.push(word);
    else if ((word.confidence || 0) > (words[duplicateIndex].confidence || 0)) words[duplicateIndex] = word;
  }
  return Object.assign({}, primary, { words, text: words.map(word => word.text).join(' ') });
}

async function ocrDataMulti(canvas, status) {
  const primary = await ocrData(canvas, (message, progress) => status && status('passaggio 1/2: ' + message, (progress || 0) * .62), '3');
  const usable = (primary.words || []).filter(word => word.text && word.text.trim());
  const mean = usable.length ? usable.reduce((sum, word) => sum + (word.confidence || 0), 0) / usable.length : 0;
  const needsSecondPass = mean < 78 || usable.length < 55;
  if (!needsSecondPass) return primary;
  status && status('passaggio 2/2: miglioro contrasto e tabelle…', .64);
  const thresholded = localThresholdCanvas(canvas);
  const secondary = await ocrData(thresholded, (message, progress) => status && status('passaggio 2/2: ' + message, .64 + (progress || 0) * .36), '6');
  return mergeOcrPasses(primary, secondary);
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
/* Pipeline completa: una o più immagini → record da verificare. */
async function parseDaOcr(canvases, status) {
  const pagineItems = [];
  const pageSizes = [];
  const previewPages = [];
  const corrections = [];
  let testo = '';
  for (let i = 0; i < canvases.length; i++) {
    const prepared = prepareOcrCanvas(canvases[i]);
    previewPages.push(canvasPreviewDataUrl(prepared));
    const scale = 600 / Math.max(prepared.width, 1);
    pageSizes.push({ width: 600, height: prepared.height * scale });
    if (prepared._ocrCorrections && prepared._ocrCorrections.length) corrections.push(`pagina ${i + 1}: ${prepared._ocrCorrections.join(', ')}`);
    const data = await ocrDataMulti(prepared, (m, f) => status && status(`${canvases.length > 1 ? 'pagina ' + (i + 1) + '/' + canvases.length + ': ' : ''}${m}`, ((i + (f || 0)) / canvases.length)));
    const items = ocrToItems(data, prepared);
    pagineItems.push(items);
    // testo ricostruito dalle parole già ripulite dal rumore, riga per riga
    const perRiga = new Map();
    for (const it of items) {
      const k = Math.round(it.y / 3);
      if (!perRiga.has(k)) perRiga.set(k, []);
      perRiga.get(k).push(it);
    }
    testo += [...perRiga.entries()].sort((a, b) => b[0] - a[0])
      .map(([, cs]) => cs.sort((a, b) => a.x - b.x).map(c => c.str).join(' ')).join('\n') + '\n';
  }
  const daCoordinate = Parser.parsePdfPages(pagineItems, { source: 'ocr', pageSizes });
  const daTesto = Parser.parseFreeText(testo);
  const esito = unisciEstrazioni(daCoordinate, daTesto);
  esito.warnings = ['Lettura ottica (OCR): i numeri possono contenere errori di lettura, controlla TUTTI i campi prima di salvare.',
    ...(corrections.length ? [`Correzioni automatiche immagine — ${corrections.join('; ')}.`] : []),
    ...esito.warnings.filter(w => !/precisione limitata/.test(w))];
  esito.previewPages = previewPages;
  return esito;
}

/* ============================================================
   VERIFICA (conferma/correzione prima del salvataggio)
   ============================================================ */
function emptyRecord() {
  const now = new Date();
  return { documento: { tipo: 'ordinario' }, periodo: { mese: now.getMonth() + 1, anno: now.getFullYear() }, azienda: {}, dipendente: {}, ccnl: {}, elementi: { altri: [] }, orario: {}, voci: [], tfr: {}, progressivi: {}, ratei: {}, totali: {}, meta: { fonte: 'manuale', software: 'inserimento manuale', settore: 'privato-lul', fields: {}, candidates: {}, reconciliation: {}, pageSizes: [] } };
}
function startVerifica(record, warnings, previewPages = []) {
  if (!record.id) record.id = uid();
  applicaAliasLocali(record);
  Parser.ripulisciRecord(record);
  record.meta = record.meta || { fonte: 'manuale' };
  record.meta.qualita = Parser.valutaQualita(record);
  const hit = Parser.trovaCcnl(record, CCNL_DB, Store.data.customCcnl.map(reviveCustom));
  if (hit && !record.ccnlId) record.ccnlId = hit.id;
  draft = { record, warnings: warnings || [], previewPages: previewPages || [], activeSource: null };
  renderVerifica();
  showView('verifica');
}
const FIELD_GROUPS = [
  { titolo: 'Periodo e persone', fields: [
    ['periodo.mese', 'Mese (1–12)'], ['periodo.anno', 'Anno'], ['dipendente.nome', 'Dipendente'], ['dipendente.cf', 'Codice fiscale'],
    ['dipendente.livello', 'Livello'], ['dipendente.qualifica', 'Qualifica'], ['dipendente.dataAssunzione', 'Data assunzione'], ['azienda.nome', 'Azienda'],
  ]},
  { titolo: 'Elementi della retribuzione (mensili)', info: 'elementi', fields: [
    ['elementi.pagaBase', 'Paga base €'], ['elementi.contingenza', 'Contingenza €'], ['elementi.superminimo', 'Superminimo €'],
    ['elementi.scatti', 'Scatti anzianità €'], ['elementi.totale', 'Totale elementi €'], ['orario.oreOrdinarie', 'Ore ordinarie lavorate'],
    ['orario.giorniLavorati', 'Giorni lavorati'], ['orario.pagaOraria', 'Tariffa oraria €'], ['orario.pagaGiornaliera', 'Tariffa giornaliera €'],
  ]},
  { titolo: 'Totali del mese', info: 'netto', fields: [
    ['totali.competenze', 'Totale competenze €'], ['totali.trattenute', 'Totale trattenute €'], ['totali.arrotondamento', 'Arrotondamento €'], ['totali.netto', 'NETTO €'],
  ]},
  { titolo: 'TFR', info: 'tfr', fields: [
    ['tfr.retribUtile', 'Retribuzione utile TFR €'], ['tfr.quotaMese', 'Quota TFR mese €'], ['tfr.fondo3112', 'Fondo TFR al 31/12 €'],
    ['tfr.rivalutazione', 'Rivalutazione €'], ['tfr.quotaAnno', 'Quota anno €'], ['tfr.aFondi', 'TFR a fondi €'],
  ]},
  { titolo: 'Ferie e permessi (ratei)', info: 'saldo', fields: [
    ['ratei.ferie.residuoAp', 'Ferie: residuo AP'], ['ratei.ferie.maturato', 'Ferie: maturate'], ['ratei.ferie.goduto', 'Ferie: godute anno corrente'], ['ratei.ferie.godutoAp', 'Ferie: godute anni precedenti'], ['ratei.ferie.saldo', 'Ferie: saldo'],
    ['ratei.permessi.residuoAp', 'Permessi: residuo AP'], ['ratei.permessi.maturato', 'Permessi: maturati'], ['ratei.permessi.goduto', 'Permessi: goduti anno corrente'], ['ratei.permessi.godutoAp', 'Permessi: goduti anni precedenti'], ['ratei.permessi.saldo', 'Permessi: saldo'],
  ]},
  { titolo: 'Progressivi annui', info: 'progressivi', fields: [
    ['progressivi.impInps', 'Imponibile INPS progressivo €'], ['progressivi.impIrpef', 'Imponibile IRPEF progressivo €'], ['progressivi.irpefPagata', 'IRPEF pagata €'],
  ]},
];
const NUM_FIELDS = new Set(FIELD_GROUPS.flatMap(g => g.fields.map(f => f[0])).filter(p => !/nome|cf|qualifica|dataAssunzione|livello/.test(p)));

function sourceButton(path, label = 'Mostra nel documento') {
  const meta = draft && draft.record && draft.record.meta && draft.record.meta.fields && draft.record.meta.fields[path];
  if (!meta || !meta.bbox || meta.page == null || !(draft.previewPages || [])[meta.page]) return '';
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
  $('#view-verifica').innerHTML = `
  <div class="verify-layout ${draft.previewPages && draft.previewPages.length ? 'with-document' : ''}">
  ${sourceViewerHtml()}
  <div class="card verify-form">
    <h2>Verifica i dati estratti</h2>
    <div class="finding ${qualityClass}"><span class="lvchip ${qualityClass}">${qualityLabel}</span><div>
      <p><b>Affidabilità stimata ${quality.score}/100</b>${software} · ${r.voci.length} voci riconosciute.</p>
      <p class="muted small">È una stima tecnica, non una garanzia: conferma soprattutto netto, trattenute, ore e CCNL.</p>
    </div></div>
    ${draft.warnings.map(w => `<div class="finding warn"><span class="lvchip warn">Nota</span><div><p>${esc(w)}</p></div></div>`).join('')}
    <p class="muted">Correggi quello che non torna: i controlli valgono quanto i dati che confermi. I numeri accettano sia 1.234,56 che 1234.56.</p>
    <h3>Documento</h3>
    <div class="grid">
      <label class="field">Tipo cedolino<select id="f-doc-type">${Object.entries(TIPO_CEDOLINO).map(([value, label]) => `<option value="${value}" ${tipoCedolino(r) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field">Formato rilevato<input value="${esc((r.meta && r.meta.software) || 'non identificato')}" readonly></label>
      <label class="field">Famiglia<input value="${esc((r.meta && r.meta.settore) || 'privato-lul')}" readonly></label>
    </div>
    <h3>Contratto (CCNL) ${iBtn('ccnl')}</h3>
    <div class="grid">
      <label class="field">CCNL applicato<select id="f-ccnl"><option value="">— non identificato —</option>${ccnlOpts}</select></label>
      <label class="field">Codice CNEL (dal cedolino)${confidenceBadge('ccnl.cnel')}${sourceButton('ccnl.cnel')}<input data-k="ccnl.cnel" value="${esc(r.ccnl.cnel || '')}" placeholder="es. H052"></label>
      <label class="field">Descrizione contratto${confidenceBadge('ccnl.descrizione')}${sourceButton('ccnl.descrizione')}<input data-k="ccnl.descrizione" value="${esc(r.ccnl.descrizione || '')}"></label>
    </div>
    ${ccnlSuggestions.length ? `<div class="ccnl-suggestions"><p class="muted small"><b>Contratti più probabili</b> — scegli solo se la descrizione coincide col cedolino.</p>${ccnlSuggestions.map(item => `<button type="button" class="ccnl-suggestion ${r.ccnlId === item.contract.id ? 'selected' : ''}" data-ccnl-suggest="${esc(item.contract.id)}"><span>${esc(item.contract.nome)}</span><small>${Math.round(item.score * 100)}% · ${esc(item.reasons.join('; '))}</small></button>`).join('')}</div>` : ''}
    ${FIELD_GROUPS.map(g => `<h3>${esc(g.titolo)} ${g.info ? iBtn(g.info) : ''}</h3><div class="grid">${g.fields.map(([k, lab]) => {
      const v = getPath(r, k);
      return `<label class="field">${esc(lab)}${confidenceBadge(k)}${sourceButton(k)}<input data-k="${k}" value="${v == null ? '' : esc(NUM_FIELDS.has(k) && typeof v === 'number' ? fmtEur(v, /mese|anno$/.test(k) && k.startsWith('periodo') ? 0 : 2) : v)}"></label>`;
    }).join('')}</div>`).join('')}
    <h3>Voci del cedolino <span class="muted small">(tocca × per eliminare una riga letta male)</span></h3>
    <div class="tablewrap"><table class="voci" id="voci-edit">
      <thead><tr><th>Codice</th><th>Descrizione</th><th>Tipo</th><th class="num">Base ${iBtn('base')}</th><th class="num">Rif. ${iBtn('riferimento')}</th><th>Unità</th><th class="num">Trattenuta ${iBtn('trattenuta')}</th><th class="num">Competenza ${iBtn('competenza')}</th><th></th></tr></thead>
      <tbody></tbody>
    </table></div>
    <div class="btnrow">
      <button class="ghost" id="btn-add-voce">+ Aggiungi voce</button>
    </div>
    <div id="live-quadratura" style="margin-top:10px"></div>
    <div class="btnrow">
      <button class="primary" id="btn-salva">Salva e analizza</button>
      <button class="ghost" id="btn-annulla">Annulla</button>
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
    if (!matchMedia('(max-width: 640px)').matches && path && draft.record.meta.fields[path]) showSourceEvidence(draft.record.meta.fields[path]);
  });
  $('#btn-add-voce').addEventListener('click', () => { draft.record.voci.push({ codice: '', descrizione: '', base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null }); renderVociEdit(); });
  $('#btn-salva').addEventListener('click', salvaDraft);
  $('#btn-annulla').addEventListener('click', () => { draft = null; showView(Store.data.records.length ? 'dettaglio' : 'importa'); });
  liveQuadratura();
}
function renderVociEdit() {
  const tb = $('#voci-edit tbody');
  tb.innerHTML = draft.record.voci.map((v, i) => `<tr data-i="${i}">
    <td data-label="Codice"><input class="code" data-vk="codice" aria-label="Codice voce" value="${esc(v.codice || '')}"></td>
    <td data-label="Descrizione"><div class="voice-description-stack"><div class="voice-description-edit"><input class="desc" data-vk="descrizione" aria-label="Descrizione voce" value="${esc(v.descrizione || '')}">${v.meta && v.meta.visual && draft.previewPages[v.meta.visual.page] ? `<button type="button" class="source-btn" data-source-voice="${i}" aria-label="Mostra la voce nel documento">⌖</button>` : ''}</div><div class="voice-check" data-voice-check="${i}" hidden></div></div></td>
    <td data-label="Tipo"><select data-vk="categoriaManuale" aria-label="Conferma il tipo di voce"><option value="">Automatico</option><option value="competenza" ${v.categoriaManuale === 'competenza' ? 'selected' : ''}>Competenza</option><option value="trattenuta" ${v.categoriaManuale === 'trattenuta' ? 'selected' : ''}>Trattenuta</option><option value="dato" ${v.categoriaManuale === 'dato' ? 'selected' : ''}>Dato</option></select></td>
    <td class="num" data-label="Base"><input data-vk="base" aria-label="Base" value="${v.base == null ? '' : esc(fmtEur(v.base, 5).replace(/(,\d*?)0+$/, '$1').replace(/,$/, ''))}"></td>
    <td class="num" data-label="Quantità"><input data-vk="rifQta" aria-label="Quantità" value="${v.rifQta == null ? '' : esc(fmtEur(v.rifQta, 5).replace(/(,\d*?)0+$/, '$1').replace(/,$/, ''))}"></td>
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
    const amount = Math.abs(voice.competenza ?? voice.trattenuta ?? 0);
    const expected = Math.abs((voice.base || 0) * (voice.rifQta || 0) * (/^%$/.test(voice.rifUnita || '') ? .01 : 1));
    item.hidden = false;
    item.classList.add(check.ok ? 'ok' : 'warn');
    item.textContent = check.ok
      ? `✓ Calcolo coerente: ${fmtEur(expected)} €`
      : `Da controllare: base × quantità = ${fmtEur(expected)} €, importo ${fmtEur(amount)} € (scarto ${fmtEur(check.delta)} €)`;
  }
  (draft.record.voci || []).forEach((voice, index) => {
    if (checked.has(index)) return;
    const item = $(`[data-voice-check="${index}"]`, $('#view-verifica')); if (!item) return;
    item.hidden = false; item.classList.add('info');
    item.textContent = 'Controllo riga non applicabile: base o quantità non sono presenti.';
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
  let html = `<p class="muted small">Somma voci → competenze <b>${fmtEur(sumC)}</b> € · trattenute <b>${fmtEur(sumT)}</b> €</p>`;
  if (t.competenze != null && t.trattenute != null && t.netto != null) {
    const quadratura = Parser.quadraturaTotali(t);
    const message = quadratura.ok
      ? (quadratura.modalita === 'netto-arrotondato'
        ? `Il netto è coerente: competenze − trattenute = ${fmtEur(quadratura.base)} €, scarto di arrotondamento ${fmtEur(quadratura.scarto)} €.`
        : 'Il netto quadra con i totali.')
      : `Il risultato più vicino è <b>${fmtEur(quadratura.atteso)}</b> €, ma il netto indicato è <b>${fmtEur(t.netto)}</b> €.`;
    html += `<div class="finding ${quadratura.ok ? 'ok' : 'alert'}"><span class="lvchip ${quadratura.ok ? 'ok' : 'alert'}">${quadratura.ok ? 'OK' : 'Attenzione'}</span><div><p>${message}</p></div></div>`;
  }
  const consistency = Parser.valutaCoerenza(r);
  if (consistency.score != null) {
    const failed = consistency.checks.filter(check => !check.ok).map(check => reconciliationCheckLabel(check, r));
    const visibleFailed = failed.slice(0, 3);
    html += `<div class="reconciliation-summary"><b>Coerenza globale ${consistency.score}/100</b><span>${consistency.passed}/${consistency.total} vincoli superati${visibleFailed.length ? ` · da verificare: ${esc(visibleFailed.join(', '))}${failed.length > visibleFailed.length ? ` e altri ${failed.length - visibleFailed.length}` : ''}` : ''}</span></div>`;
  }
  const alternatives = r.meta && r.meta.reconciliation && r.meta.reconciliation.alternatives || [];
  const ambiguous = alternatives.length > 1 && alternatives[0].score - alternatives[1].score < .9;
  if (ambiguous) {
    html += `<div class="total-alternatives"><p><b>Più letture plausibili dei totali</b><br><span class="muted small">Scegli confrontando il documento: nessuna alternativa viene nascosta.</span></p>${alternatives.map((item, index) => `<button type="button" data-total-alternative="${index}" class="${index === 0 ? 'selected' : ''}"><b>${index + 1}</b><span>Comp. ${fmtEur(item.competenze)} · Tratt. ${fmtEur(item.trattenute)} · Netto ${fmtEur(item.netto)}</span><small>${esc((item.reasons || []).join(', ') || 'candidato da etichette')}</small></button>`).join('')}</div>`;
  }
  $('#live-quadratura').innerHTML = html;
  updateVoiceCheckBadges(consistency);
}
function salvaDraft() {
  const r = draft.record;
  if (!r.periodo || !r.periodo.anno || !r.periodo.mese) { toast('Indica mese e anno del cedolino.'); return; }
  r.periodo.label = periodoLabel(r.periodo);
  const dup = Store.data.records.find(x => x.id !== r.id && recordIdentityKey(x) === recordIdentityKey(r));
  if (dup && !confirm(`Esiste già un cedolino ${tipoCedolinoLabel(r).toLowerCase()} di ${r.azienda.nome || 'questa azienda'} per ${r.periodo.label}: lo sostituisco?`)) return;
  if (dup) Store.data.records = Store.data.records.filter(x => x.id !== dup.id);
  r.derivati = Parser.derivaIndice(r);
  imparaCorrezioni(r);
  r.meta.importedAt = new Date().toISOString();
  const i = Store.data.records.findIndex(x => x.id === r.id);
  if (i >= 0) Store.data.records[i] = r; else Store.data.records.push(r);
  Store.save();
  draft = null;
  currentDetailId = r.id;
  renderImporta();
  renderDettaglio(r.id);
  showView('dettaglio');
  toast('Busta salvata nella cronologia (solo su questo dispositivo).');
}

/* ============================================================
   DETTAGLIO
   ============================================================ */
function selettorePeriodo(r) {
  const recs = recSorted();
  if (recs.length < 2) return '';
  return `<label class="field" style="max-width:220px;margin-bottom:8px">Mese archiviato
    <select id="sel-periodo">${recs.map(x => `<option value="${esc(x.id)}" ${x.id === r.id ? 'selected' : ''}>${esc(periodoLabel(x.periodo))} · ${esc(tipoCedolinoLabel(x))}${x.azienda && x.azienda.nome ? ` · ${esc(x.azienda.nome)}` : ''}</option>`).join('')}</select>
  </label>`;
}
function renderDettaglio(id) {
  const r = Store.data.records.find(x => x.id === id);
  const el = $('#view-dettaglio');
  currentDetailId = id || null;
  if (!r) { el.innerHTML = `<div class="card"><h2>Nessuna busta selezionata</h2><p class="muted">Importa una busta paga per vedere qui l’analisi completa.</p><div class="btnrow"><button class="primary" id="dt-go-import">Importa una busta</button></div></div>`; const b = $('#dt-go-import'); if (b) b.addEventListener('click', () => showView('importa')); return; }
  const ccnl = r.ccnlId ? ccnlById(r.ccnlId) : Parser.trovaCcnl(r, CCNL_DB, Store.data.customCcnl.map(reviveCustom));
  const findings = eseguiControlli(r, ccnl, Store.data.records);
  detailVoci = r.voci;
  renderDettaglioCompleto(el, r, ccnl, findings);
  const sel = $('#sel-periodo');
  if (sel) sel.addEventListener('change', () => renderDettaglio(sel.value));
}

const LV_LABEL = { ok: 'OK', info: 'Info', warn: 'Verifica', alert: 'Anomalia' };
/* Sezione richiudibile del Dettaglio (aperta di default) */
function sez(titleHtml, bodyHtml, open = true) {
  return `<details class="card sez" ${open ? 'open' : ''}><summary><h2>${titleHtml}</h2></summary><div class="sez-body">${bodyHtml}</div></details>`;
}
function findingHTML(f) {
  return `<div class="finding ${f.livello}"><span class="lvchip ${f.livello}">${LV_LABEL[f.livello]}</span><div>
    <h4>${esc(f.titolo)} <span class="badge dato">${esc(f.area)}</span></h4><p>${esc(f.dettaglio)}</p>
    ${f.formula ? `<p class="formula">${esc(f.formula)}</p>` : ''}${fontiHTML(f.fonti)}
  </div></div>`;
}
function vociTableHTML(r) {
  return `<div class="tablewrap"><table class="voci"><thead><tr><th class="col-code">Codice</th><th>Descrizione</th><th class="num col-base">Base ${iBtn('base')}</th><th class="num col-rif">Rif. ${iBtn('riferimento')}</th><th class="num">Trattenuta ${iBtn('trattenuta')}</th><th class="num">Competenza ${iBtn('competenza')}</th><th></th></tr></thead>
  <tbody>${r.voci.map((v, i) => {
    const s = spiegaVoce(v);
    return `<tr class="voce-row" data-vocei="${i}"><td class="col-code">${esc(v.codice || '')}</td><td>${esc(v.descrizione)} <span class="badge ${s.cat === 'trattenuta' ? 'tratt' : s.cat === 'competenza' ? 'comp' : 'dato'}">${s.cat}</span></td>
    <td class="num col-base">${v.base != null ? fmtEur(v.base, 5).replace(/(,\d\d)\d*$/, '$1') : ''}</td><td class="num col-rif">${v.rifQta != null ? fmtEur(v.rifQta, 2) + ' ' + esc(v.rifUnita || (v.rifTesto || '')) : esc(v.rifTesto || '')}</td>
    <td class="num">${v.trattenuta != null ? fmtEur(v.trattenuta) : ''}</td><td class="num">${v.competenza != null ? fmtEur(v.competenza) : (v.costoAzienda != null ? '(' + fmtEur(v.costoAzienda) + ' a carico azienda)' : '')}</td>
    <td><button class="ibtn" data-vocei="${i}" title="Spiegazione">i</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderDettaglioCompleto(el, r, ccnl, findings) {
  const nAnom = findings.filter(f => f.livello === 'alert').length, nWarn = findings.filter(f => f.livello === 'warn').length;
  const urgenti = findings.filter(f => f.livello === 'alert' || f.livello === 'warn');
  el.innerHTML = `
  ${selettorePeriodo(r)}
  ${urgenti.length ? `<div class="card" style="border-left:4px solid var(--${nAnom ? 'alert' : 'warn'})">
    <h2 style="color:var(--${nAnom ? 'alert' : 'warn'})">Da controllare in questa busta</h2>
    <p class="muted small">Cosa non torna, cosa verificare e come muoverti. Il resto dell’analisi è qui sotto.</p>
    ${urgenti.map(findingHTML).join('')}
    <p class="muted small">Come muoverti: 1) chiedi all’ufficio paghe o a chi elabora i cedolini (spesso è un errore materiale); 2) se la risposta non convince, sindacato o CAF controllano gratis; 3) per i casi gravi c’è l’Ispettorato del Lavoro.</p>
  </div>` : ''}
  <div class="card">
    <h2>${esc(periodoLabel(r.periodo))} ${r.meta && r.meta.fonte !== 'pdf' ? `<span class="badge dato">${esc(r.meta.fonte)}</span>` : ''}</h2>
    <div class="kv">
      <div><b>Dipendente</b>${esc(r.dipendente.nome || '—')}</div>
      <div><b>Azienda</b>${esc(r.azienda.nome || '—')}</div>
      <div><b>CCNL ${iBtn('ccnl')}</b>${esc(ccnl ? ccnl.nome : (r.ccnl.descrizione || 'non identificato'))}${r.ccnl.cnel ? ` <span class="badge dato">CNEL ${esc(r.ccnl.cnel)}</span>` : ''}</div>
      <div><b>Inquadramento ${iBtn('livello')}</b>${esc([r.dipendente.qualifica, r.dipendente.livello ? r.dipendente.livello + '° livello' : ''].filter(Boolean).join(' · ') || '—')}</div>
      <div><b>Assunzione</b>${esc(r.dipendente.dataAssunzione || '—')}</div>
      <div><b>Ore ordinarie</b>${r.orario.oreOrdinarie != null ? fmtEur(r.orario.oreOrdinarie) : '—'}</div>
    </div>
    <div class="btnrow">
      <button class="ghost" id="btn-edit">Modifica dati</button>
      <button class="ghost" id="btn-print">Stampa / salva PDF</button>
      <button class="danger" id="btn-del">Elimina</button>
    </div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="v">${fmtEur(r.totali.netto)} €</div><div class="l">Netto ${iBtn('netto')}</div></div>
    <div class="kpi"><div class="v">${fmtEur(r.totali.competenze)} €</div><div class="l">Competenze ${iBtn('competenza')}</div></div>
    <div class="kpi"><div class="v">${fmtEur(r.totali.trattenute)} €</div><div class="l">Trattenute ${iBtn('trattenuta')}</div></div>
    ${r.tfr && r.tfr.fondo3112 != null ? `<div class="kpi"><div class="v">${fmtEur(r.tfr.fondo3112)} €</div><div class="l">TFR al 31/12 ${iBtn('tfr')}</div></div>` : ''}
    ${r.ratei && r.ratei.ferie ? `<div class="kpi"><div class="v">${fmtEur(r.ratei.ferie.saldo, 1)}</div><div class="l">Ferie residue (${/^(?:ORE|ORA|H)$/i.test(r.ratei.ferie.unita || '') ? 'h' : 'gg'}) ${iBtn('ferie')}</div></div>` : ''}
    ${r.ratei && r.ratei.permessi ? `<div class="kpi"><div class="v">${fmtEur(r.ratei.permessi.saldo, 1)}</div><div class="l">Permessi residui (h) ${iBtn('rol')}</div></div>` : ''}
  </div>
  ${sez('Le voci, spiegate una per una', `<p class="muted small">Tocca la “i” di una voce per capire cos’è, come si calcola e cosa controllare.</p>${vociTableHTML(r)}`)}
  ${elementiCard(r)}
  ${tfrCard(r)}
  ${rateiCard(r)}
  ${progressiviCard(r)}
  ${ccnl ? ccnlInfoCard(ccnl, r) : sez('CCNL non identificato', `<p class="muted">Selezionalo in “Modifica dati” per attivare i confronti su ferie, permessi e minimi.</p>${fontiHTML(['cnel'])}`)}
  ${sez(`Informazioni generali — controlli automatici <span class="muted small">(${findings.length} verifiche: ${nAnom} anomalie, ${nWarn} da controllare)</span>`,
    `<p class="muted small">Ogni controllo mostra la formula usata e dove verificare di persona. Un esito “Verifica” non è una condanna: è un punto da chiarire con ufficio paghe, sindacato o consulente.</p>
    ${findings.map(findingHTML).join('')}`)}`;
  bindDettaglioCommon(el, r);
}

function bindDettaglioCommon(el, r) {
  const be = $('#btn-edit'); if (be) be.addEventListener('click', () => startVerifica(JSON.parse(JSON.stringify(r)), ['Stai modificando una busta già salvata.']));
  const bp = $('#btn-print'); if (bp) bp.addEventListener('click', () => window.print());
  const bd = $('#btn-del'); if (bd) bd.addEventListener('click', () => {
    if (!confirm('Eliminare questa busta dalla cronologia locale?')) return;
    Store.data.records = Store.data.records.filter(x => x.id !== r.id); Store.save();
    renderImporta();
    showView('importa');
    toast('Busta eliminata.');
  });
}
function elementiCard(r) {
  const e = r.elementi || {};
  const rows = [['Paga base', e.pagaBase, 'pagabase'], ['Contingenza', e.contingenza, 'contingenza'], ['Superminimo', e.superminimo, 'superminimo'], ['Scatti anzianità', e.scatti, 'scatti'], ['E.D.R.', e.edr, null], ['Totale', e.totale, 'elementi']].filter(x => x[1] != null);
  if (!rows.length && !r.orario.prossimoScatto) return '';
  return sez(`Elementi fissi della retribuzione ${iBtn('elementi')}`,
  `<p class="muted small">Sono i “mattoni” fissi della tua paga mensile: da qui nasce la paga oraria (totale ÷ divisore del contratto). Tocca la “i” accanto a ogni nome per capirlo.</p>
  <div class="kv">
    ${rows.map(([l, v, k]) => `<div><b>${l} ${k ? iBtn(k) : ''}</b>${fmtEur(v)} €</div>`).join('')}
    ${r.orario.prossimoScatto ? `<div><b>Prossimo scatto anzianità ${iBtn('scatti')}</b>${esc(r.orario.prossimoScatto)}</div>` : ''}
  </div>`);
}
function tfrCard(r) {
  const t = r.tfr || {};
  if (t.retribUtile == null && t.fondo3112 == null && t.quotaAnno == null) return '';
  return sez(`TFR — la tua liquidazione ${iBtn('tfr')}`,
  `<p class="muted small">Ogni mese una parte di stipendio viene messa da parte: la ricevi quando il rapporto finisce (o va al fondo pensione, se hai scelto così). Formula: retribuzione utile ÷ 13,5 − 0,50% dell’imponibile INPS.</p>
  <div class="kv">
    ${t.retribUtile != null ? `<div><b>Retribuzione utile (mese) ${iBtn('retribuzioneUtileTfr')}</b>${fmtEur(t.retribUtile)} €</div>` : ''}
    ${t.quotaMese != null ? `<div><b>Quota del mese</b>${fmtEur(t.quotaMese)} €</div>` : ''}
    ${t.fondo3112 != null ? `<div><b>Accantonato al 31/12</b>${fmtEur(t.fondo3112)} €</div>` : ''}
    ${t.rivalutazione != null ? `<div><b>Rivalutazione ${iBtn('rivalutazioneTfr')}</b>${fmtEur(t.rivalutazione)} €</div>` : ''}
    ${t.quotaAnno != null ? `<div><b>Quota anno in corso</b>${fmtEur(t.quotaAnno)} €</div>` : ''}
    <div><b>Destinazione</b>${t.aFondi ? 'Fondo pensione (' + fmtEur(t.aFondi) + ' €)' : 'In azienda'}</div>
  </div>
  <p class="muted small">Per la scelta azienda/fondo pensione vedi la scheda Extra.</p>${fontiHTML(['normattiva', 'covip'])}`);
}
function rateiCard(r) {
  const rt = r.ratei || {};
  if (!rt.ferie && !rt.permessi) return '';
  const riga = (nome, d, unita, key) => d ? `<div><b>${nome} ${iBtn(key)}</b>
    residuo anno prec. ${iBtn('residuoAp')} ${fmtEur(d.residuoAp, 1)} · maturato ${iBtn('maturato')} ${fmtEur(d.maturato, 1)} · goduto ${iBtn('goduto')} ${fmtEur(d.goduto, 1)} · <b>saldo ${iBtn('saldo')} ${fmtEur(d.saldo, 1)} ${unita}</b></div>` : '';
  return sez(`Ferie e permessi (ratei) ${iBtn('rateo')}`,
  `<p class="muted small">Quanto riposo pagato hai accumulato, usato e quanto te ne resta.</p>
  <div class="kv" style="grid-template-columns:1fr">
    ${riga('Ferie', rt.ferie, /^(?:ORE|ORA|H)$/i.test((rt.ferie && rt.ferie.unita) || '') ? 'ore' : 'giorni', 'ferie')}
    ${riga('Permessi (ROL)', rt.permessi, 'ore', 'rol')}
    ${riga('Ex festività', rt.exFestivita, 'ore', 'exfestivita')}
  </div>`);
}
function progressiviCard(r) {
  const p = r.progressivi || {};
  if (p.impInps == null && p.impIrpef == null) return '';
  return sez(`Totali da inizio anno ${iBtn('progressivi')}`,
  `<div class="kv">
    ${p.impInps != null ? `<div><b>Imponibile INPS ${iBtn('imponibile')}</b>${fmtEur(p.impInps)} €</div>` : ''}
    ${p.impIrpef != null ? `<div><b>Imponibile IRPEF ${iBtn('irpef')}</b>${fmtEur(p.impIrpef)} €</div>` : ''}
    ${p.irpefPagata != null ? `<div><b>IRPEF già pagata</b>${fmtEur(p.irpefPagata)} €</div>` : ''}
    ${p.impInail != null ? `<div><b>Imponibile INAIL</b>${fmtEur(p.impInail)} €</div>` : ''}
  </div>
  <p class="muted small">Servono per il conguaglio ${iBtn('conguaglio')} di fine anno e per confrontare la Certificazione Unica ${iBtn('cu')} a marzo.</p>`);
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
   GRAFICO ANDAMENTO
   ============================================================ */
function sparkSVG(recs) {
  const pts = recs.filter(r => r.totali.netto != null);
  const W = 900, H = 150, P = 26;
  const vs = pts.map(r => r.totali.netto);
  const min = Math.min(...vs) * 0.97, max = Math.max(...vs) * 1.03;
  const x = i => P + (W - 2 * P) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = v => H - P - (H - 2 * P) * ((v - min) / (max - min || 1));
  const line = vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="andamento netto">
    <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5"/>
    ${vs.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="var(--brand)"><title>${esc(periodoLabel(pts[i].periodo))}: ${fmtEur(v)} €</title></circle>`).join('')}
    ${vs.map((v, i) => (pts.length <= 14 || i % 2 === 0) ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9.5" text-anchor="middle" fill="var(--muted)">${esc((MESI_NOMI[pts[i].periodo.mese] || '').slice(0, 3))} ${String(pts[i].periodo.anno).slice(2)}</text>` : '').join('')}
  </svg>`;
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
    <p class="muted small">In Italia esistono oltre 1.000 CCNL depositati. Se il tuo non c’è, puoi aggiungerlo da Backup → Editor CCNL copiando i valori dal testo ufficiale.</p>
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
    <p><a href="https://github.com/ShivenBonazzo/bustachiara" target="_blank" rel="noopener"><b>Apri il progetto su GitHub →</b></a></p>
  </div>
  <div class="card"><h2>Privacy — come funziona davvero</h2>
    <p>Una busta paga contiene l’elenco più sensibile di informazioni che esista su di te: quanto guadagni, dove lavori, il tuo codice fiscale, i tuoi prestiti (cessioni del quinto), a volte perfino dati sulla salute (malattie, permessi 104). Caricarla su un servizio online — o incollarla in una chat con un’intelligenza artificiale — significa affidare tutto questo a un’azienda terza, alle sue policy e ai suoi archivi.</p>
    <p>Questa pagina ha una <b>Content-Security-Policy</b> che vieta al browser qualunque connessione di rete: anche volendo, il codice non potrebbe inviare nulla. I motori PDF e OCR sono già inclusi nell’app e funzionano anche offline.</p>
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
    <p class="muted small">Alias appresi: <b>${(Store.data.voiceAliases || []).length}</b>. Prima dell’esportazione vedrai un riepilogo privacy; le causali proprietarie vanno comunque ricontrollate.</p>
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
    if (!Store.data.records.length && !(Store.data.voiceAliases || []).length) { toast('Non ci sono ancora correzioni o buste da esportare.'); return; }
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
      Store.save(); renderImporta(); renderImpostazioni();
      toast(`Import completato: ${n} buste aggiunte.`);
    } catch (err) { toast('Backup non valido: ' + err.message); }
  });
  $('#btn-wipe').addEventListener('click', () => {
    if (!confirm('Cancellare TUTTE le buste e i CCNL personalizzati da questo dispositivo? (irreversibile senza backup)')) return;
    Store.data = { records: [], customCcnl: [], voiceAliases: [] }; Store.save();
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

/* ============================================================
   BUSTA DI ESEMPIO (dati inventati ma internamente coerenti)
   ============================================================ */
function demoRecord() {
  return enrichDemoRecord({
    id: uid(),
    documento: { tipo: 'ordinario' },
    periodo: { mese: 6, anno: 2026, label: 'Giugno 2026' },
    azienda: { nome: 'ALBERGO ESEMPIO S.R.L.', cf: '01234567890' },
    dipendente: { nome: 'MARIO ROSSI', cf: 'RSSMRA90A01H501X', livello: '4', qualifica: 'IMP', dataAssunzione: '06-01-2025' },
    ccnl: { cnel: 'H052', descrizione: 'Alberghi Imprese Confcommercio' },
    ccnlId: 'turismo-confcommercio',
    elementi: { pagaBase: 1688.98, superminimo: 311.02, totale: 2000.00, altri: [] },
    orario: { oreOrdinarie: 160, prossimoScatto: '2-2028' },
    voci: [
      { codice: 'Z00001', descrizione: 'Retribuzione', base: 11.62791, rifQta: 160, rifUnita: 'ORE', trattenuta: null, competenza: 1860.47 },
      { codice: 'Z00250', descrizione: 'Ferie godute', base: 11.62791, rifQta: 8, rifUnita: 'ORE', trattenuta: null, competenza: 93.02 },
      { codice: 'Z00255', descrizione: 'Permessi Rol goduti', base: 11.62791, rifQta: 4, rifUnita: 'ORE', trattenuta: null, competenza: 46.51 },
      { codice: 'Z50000', descrizione: "13ma Mensilita'", base: 11.62791, rifQta: 14.33333, rifUnita: 'ORE', trattenuta: null, competenza: 166.67 },
      { codice: 'Z50022', descrizione: "14ma Mensilita'", base: 11.62791, rifQta: 14.33333, rifUnita: 'ORE', trattenuta: null, competenza: 166.67 },
      { codice: '000030', descrizione: 'Straordinario 15%', base: 13.3721, rifQta: 4, rifUnita: 'ORE', trattenuta: null, competenza: 53.49 },
      { codice: 'Z31210', descrizione: 'Contributo Fondo FAST', base: null, rifQta: null, rifUnita: '', trattenuta: 2.00, competenza: null },
      { codice: 'Z00000', descrizione: 'Contributo IVS', base: 2387.00, rifQta: 9.19, rifUnita: '%', trattenuta: 219.36, competenza: null },
      { codice: 'Z00054', descrizione: 'FIS D.Lgs.148/2015 fino 15 dip', base: 2387.00, rifQta: 0.26667, rifUnita: '%', trattenuta: 6.37, competenza: null },
      { codice: 'F02000', descrizione: 'Imponibile IRPEF', base: 2161.10, rifQta: null, rifUnita: '', trattenuta: null, competenza: null },
      { codice: 'F02010', descrizione: 'IRPEF lorda', base: 497.05, rifQta: null, rifUnita: '', trattenuta: null, competenza: null },
      { codice: 'F02500', descrizione: 'Detrazioni lav.dip.', base: 180.35, rifQta: null, rifUnita: '', trattenuta: null, competenza: null },
      { codice: 'F02801', descrizione: 'Ulteriore detrazione L.207/24', base: 83.33, rifQta: null, rifUnita: '', trattenuta: null, competenza: null },
      { codice: 'F03020', descrizione: 'Ritenute IRPEF', base: null, rifQta: null, rifUnita: '', trattenuta: 233.37, competenza: null },
      { codice: 'F09110', descrizione: 'Addizionale regionale', base: null, rifQta: null, rifUnita: '', trattenuta: 20.00, competenza: null },
    ],
    tfr: { retribUtile: 2386.83, quotaMese: 164.86, fondo3112: 900.00, rivalutazione: 20.00, quotaAnno: 989.16, aFondi: null },
    progressivi: { impInps: 14322.00, impIrpef: 12966.60, irpefPagata: 1400.22 },
    ratei: { ferie: { residuoAp: 4, maturato: 13, goduto: 6, saldo: 11, unita: 'GG' }, permessi: { residuoAp: 10, maturato: 52, goduto: 20, saldo: 42, unita: 'ORE' } },
    totali: { competenze: 2386.83, trattenute: 481.10, arrotondamento: 0.27, netto: 1906.00 },
    meta: { fonte: 'esempio', software: 'Zucchetti (simulato)', settore: 'privato-lul', fields: {}, candidates: {}, reconciliation: {}, pageSizes: [] },
  });
}

function enrichDemoRecord(record) {
  record.meta.pageSizes = [{ width: 600, height: 842 }];
  const evidence = {
    'ccnl.cnel': [48, 694, 220, 20], 'ccnl.descrizione': [48, 668, 300, 20],
    'dipendente.nome': [48, 720, 220, 20], 'dipendente.cf': [318, 720, 220, 20],
    'elementi.pagaBase': [48, 600, 150, 22], 'elementi.superminimo': [210, 600, 150, 22], 'elementi.totale': [372, 600, 150, 22],
    'totali.competenze': [310, 132, 220, 22], 'totali.trattenute': [310, 104, 220, 22], 'totali.netto': [310, 64, 220, 26],
  };
  for (const [path, [x, y, w, h]] of Object.entries(evidence)) record.meta.fields[path] = {
    confidence: .96, source: 'esempio', method: 'testo-coordinate', page: 0, bbox: { x, y, w, h }, snippet: 'Documento dimostrativo',
  };
  (record.voci || []).forEach((voice, index) => {
    if (index > 8) return;
    voice.meta = { source: 'esempio', confidence: .98, visual: { page: 0, bbox: { x: 44, y: 523 - index * 31, w: 500, h: 26 }, snippet: voice.descrizione } };
    voice.descrizioneOriginale = voice.descrizione;
  });
  return record;
}

function demoPreviewDataUrl() {
  const rows = [
    ['Z00001', 'Retribuzione', '1.860,47'], ['Z00250', 'Ferie godute', '93,02'], ['Z00255', 'Permessi ROL', '46,51'],
    ['Z50000', '13ma mensilità', '166,67'], ['Z50022', '14ma mensilità', '166,67'], ['000030', 'Straordinario 15%', '53,49'],
    ['Z31210', 'Fondo FAST', '-2,00'], ['Z00000', 'Contributo IVS', '-219,36'], ['F03020', 'Ritenute IRPEF', '-233,37'],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="842" viewBox="0 0 600 842">
    <rect width="600" height="842" fill="#fff"/><rect x="30" y="30" width="540" height="782" rx="4" fill="none" stroke="#b8c5c0"/>
    <text x="48" y="68" font-family="Arial" font-size="23" font-weight="700" fill="#12382c">CEDOLINO PAGA — ESEMPIO</text>
    <text x="48" y="92" font-family="Arial" font-size="12" fill="#557069">Dati interamente inventati</text>
    <text x="48" y="118" font-family="Arial" font-size="12">MARIO ROSSI</text><text x="318" y="118" font-family="Arial" font-size="12">RSSMRA90A01H501X</text>
    <text x="48" y="144" font-family="Arial" font-size="12">CNEL H052</text><text x="48" y="170" font-family="Arial" font-size="12">Alberghi Imprese Confcommercio</text>
    <line x1="48" y1="190" x2="550" y2="190" stroke="#ccd6d2"/>
    <text x="48" y="216" font-family="Arial" font-size="11" fill="#557069">PAGA BASE</text><text x="210" y="216" font-family="Arial" font-size="11" fill="#557069">SUPERMINIMO</text><text x="372" y="216" font-family="Arial" font-size="11" fill="#557069">TOTALE ELEMENTI</text>
    <text x="48" y="238" font-family="Arial" font-size="14" font-weight="700">1.688,98</text><text x="210" y="238" font-family="Arial" font-size="14" font-weight="700">311,02</text><text x="372" y="238" font-family="Arial" font-size="14" font-weight="700">2.000,00</text>
    <text x="48" y="278" font-family="Arial" font-size="11" font-weight="700">CODICE</text><text x="132" y="278" font-family="Arial" font-size="11" font-weight="700">DESCRIZIONE</text><text x="500" y="278" text-anchor="end" font-family="Arial" font-size="11" font-weight="700">IMPORTO</text>
    ${rows.map((row, index) => `<g transform="translate(0 ${index * 31})"><line x1="48" y1="292" x2="550" y2="292" stroke="#e5ebe8"/><text x="48" y="313" font-family="Arial" font-size="11">${row[0]}</text><text x="132" y="313" font-family="Arial" font-size="11">${row[1]}</text><text x="500" y="313" text-anchor="end" font-family="Arial" font-size="11">${row[2]}</text></g>`).join('')}
    <line x1="300" y1="680" x2="550" y2="680" stroke="#8da69c"/><text x="310" y="706" font-family="Arial" font-size="12">TOTALE COMPETENZE</text><text x="530" y="706" text-anchor="end" font-family="Arial" font-size="12" font-weight="700">2.386,83</text>
    <text x="310" y="734" font-family="Arial" font-size="12">TOTALE TRATTENUTE</text><text x="530" y="734" text-anchor="end" font-family="Arial" font-size="12" font-weight="700">481,10</text>
    <rect x="300" y="748" width="250" height="42" rx="5" fill="#e9f5ef"/><text x="310" y="774" font-family="Arial" font-size="14" font-weight="700" fill="#075b42">NETTO IN BUSTA</text><text x="530" y="774" text-anchor="end" font-family="Arial" font-size="14" font-weight="700" fill="#075b42">1.906,00</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}


/* ============================================================
   RIASSUNTO IN PAROLE SEMPLICISSIME
   ============================================================ */
function apriRiassunto() {
  const r = Store.data.records.find(x => x.id === currentDetailId) || recSorted().slice(-1)[0];
  if (!r) { openInfo('Il tuo mese in breve', '<p>Non c’è ancora nessuna busta salvata. Vai su Home, carica la tua busta paga e qui troverai il riassunto del mese in poche righe semplici.</p>'); return; }
  const t = r.totali || {};
  let contributi = 0, tasse = 0, altre = 0;
  for (const v of r.voci) {
    if (!v.trattenuta) continue;
    const dsc = v.descrizione || '';
    if (/ivs|inps|fis\b|cigs|contribut/i.test(dsc) && !/fondo\s|fast|est\b|ebt|bilat|sanit/i.test(dsc)) contributi += v.trattenuta;
    else if (/irpef|addizionale|imposta|integrativ/i.test(dsc)) tasse += v.trattenuta;
    else altre += v.trattenuta;
  }
  const ccnl = r.ccnlId ? ccnlById(r.ccnlId) : null;
  const anomalie = eseguiControlli(r, ccnl, Store.data.records).filter(f => f.livello === 'alert').length;
  const p = [];
  if (t.competenze != null) p.push(`Il tuo stipendio di partenza questo mese era di <b>${fmtEur(t.competenze)} €</b>. È la cifra piena, prima di togliere qualsiasi cosa.`);
  // barra: dove vanno i tuoi soldi
  if (t.competenze && t.netto != null) {
    const tot = t.competenze;
    const seg = [
      { cls: 'soldi-netto', val: t.netto, nome: 'A te (netto)' },
      { cls: 'soldi-contributi', val: contributi, nome: 'Pensione e tutele (INPS)' },
      { cls: 'soldi-tasse', val: tasse, nome: 'Tasse' },
      { cls: 'soldi-altre', val: altre, nome: 'Piccole quote' },
    ].filter(s => s.val > 0);
    const colori = { 'soldi-netto': 'var(--brand)', 'soldi-contributi': '#e08a2e', 'soldi-tasse': '#d0342c', 'soldi-altre': '#b9b9c0' };
    p.push(`<b>Dove vanno i tuoi soldi:</b>
      <div class="soldi-bar">${seg.map(s => `<div class="${s.cls}" style="width:${(s.val / tot * 100).toFixed(1)}%" title="${esc(s.nome)}: ${fmtEur(s.val)} €"></div>`).join('')}</div>
      <span class="soldi-legenda">${seg.map(s => `<span><span class="dot" style="background:${colori[s.cls]}"></span>${esc(s.nome)}: <b>${fmtEur(s.val)} €</b> (${fmtEur(s.val / tot * 100, 0)}%)</span>`).join('')}</span>`);
  }
  if (t.trattenute != null) p.push(`In tutto sono stati tolti <b>${fmtEur(t.trattenute)} €</b>: una parte va messa da parte per la tua futura pensione, una parte sono tasse, e pochi euro sono piccole quote (per esempio l’assicurazione sanitaria del tuo contratto).`);
  if (t.netto != null) p.push(`Sul conto ti sono arrivati <b>${fmtEur(t.netto)} €</b>: questo è il famoso “netto”.`);
  if (r.ratei && r.ratei.ferie) p.push(`Hai ancora <b>${fmtEur(r.ratei.ferie.saldo, 1)} giorni di ferie</b>${r.ratei.permessi ? ` e <b>${fmtEur(r.ratei.permessi.saldo, 1)} ore di permessi</b>` : ''} da usare. Sono giorni e ore pagate: usarle non ti costa nulla.`);
  if (r.tfr && (r.tfr.fondo3112 != null || r.tfr.quotaAnno != null)) {
    const tot = (r.tfr.fondo3112 || 0) + (r.tfr.quotaAnno || 0);
    p.push(`C’è anche un salvadanaio che non vedi in busta: la liquidazione (TFR). Finora dentro ci sono circa <b>${fmtEur(tot, 0)} €</b>${r.tfr.aFondi ? ', custoditi in un fondo pensione' : ', custoditi dall’azienda'}. Li ricevi quando cambi lavoro o vai in pensione.`);
  }
  p.push(anomalie
    ? `<b>Attenzione:</b> ${anomalie === 1 ? 'c’è una cosa che non torna' : 'ci sono ' + anomalie + ' cose che non tornano'} in questa busta. Aprila nella scheda Dettaglio: la spiegazione è in cima.`
    : `Buone notizie: i conti di questa busta tornano. I controlli automatici non hanno trovato niente di strano.`);
  openInfo(`Il tuo mese in breve — ${periodoLabel(r.periodo)}`, p.map(x => `<p>${x}</p>`).join(''));
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
    <p class="muted small">Non serve cercarla su App Store o Play Store: BustaChiara è una PWA e si installa direttamente dal sito. I dati restano separati su ogni dispositivo, quindi usa Backup → Esporta tutto per trasferirli.</p>`);
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
  $('#riassunto-btn').addEventListener('click', apriRiassunto);
  $('#progetto-btn').addEventListener('click', () => showView('progetto'));
  $('#install-btn').addEventListener('click', installaApp);
  $('#privacy-badge').addEventListener('click', () => openInfo('100% privacy', '<p>PDF, foto e numeri vengono elaborati <b>interamente su questo dispositivo</b>. Non c’è un account e non c’è un server a cui inviare la busta paga.</p><p>La Content-Security-Policy blocca le connessioni esterne durante l’analisi. Il PDF originale non viene salvato; restano soltanto i dati che confermi.</p><p class="muted small">La cronologia è nella memoria di questo browser. Per non perderla, crea periodicamente un backup dalla sezione Backup.</p>'));
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
  document.body.addEventListener('click', (e) => {
    const row = e.target.closest('tr.voce-row'); if (!row || e.target.closest('.ibtn')) return;
    const v = detailVoci[+row.dataset.vocei];
    if (v) { const s = spiegaVoce(v); openInfo(s.nome + (v.descrizione && v.descrizione !== s.nome ? ` (“${v.descrizione}”)` : ''), vociInfoHtml(v)); }
  });
  $('#popover-close').addEventListener('click', closeInfo);
  $('#popover-backdrop').addEventListener('click', closeInfo);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInfo();
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
  showView('importa');
})();
