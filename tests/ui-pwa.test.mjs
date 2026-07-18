import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const templateSource = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
const serviceWorkerSource = readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  const from = uiSource.indexOf(start);
  const to = uiSource.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `blocco UI non trovato: ${start}`);
  return uiSource.slice(from, to);
}

const commentsContext = {
  fmtEur: value => Number(value).toFixed(2).replace('.', ','),
  recSorted: () => [],
  employerKey: () => '',
  tipoCedolino: () => 'ordinario',
  periodoKey: () => 0,
  periodoLabel: () => '',
};
vm.createContext(commentsContext);
vm.runInContext(
  sourceBetween('function importoVoci', 'function commentiSempliciHTML')
    + '\nthis.commentiSempliciUnderTest = commentiSemplici;',
  commentsContext,
);
const comments = commentsContext.commentiSempliciUnderTest({
  id: 'fixture',
  voci: [{ descrizione: 'Magg. per riposo settimanale non di domenica (10%)', competenza: 13.13 }],
  ratei: {},
  tfr: {},
  totali: {},
});
assert.equal(comments[0].title, 'Riposo settimanale');
assert.doesNotMatch(comments[0].text, /legate alle domeniche/i);

const broadComments = commentsContext.commentiSempliciUnderTest({
  id: 'broad',
  voci: [
    { descrizione: 'Straordinario 25 per cento', competenza: 125, rifQta: 10 },
    { descrizione: 'Indennita malattia INPS', competenza: 180 },
    { descrizione: 'Cessione del quinto', trattenuta: 210 },
  ],
  derivati: { ivs: { importo: 172 }, ritenuteIrpef: 280, addRegionale: 22, addComunale: 9 },
  ratei: { ferie: { saldo: 12, unita: 'GG' }, permessi: { saldo: 18, unita: 'ORE' } },
  tfr: { quotaMese: 115 },
  totali: { competenze: 2200, trattenute: 650, netto: 1550 },
});
for (const title of ['Ore in più', 'Assenze pagate', 'Dal lordo al netto', 'Contributi', 'Imposte', 'Prestiti o trattenute personali', 'Riposo disponibile', 'Permessi disponibili', 'TFR']) {
  assert.ok(broadComments.some(comment => comment.title === title), `commento ampio mancante: ${title}`);
}
assert.ok(broadComments.length <= 12);

const attendanceComments = commentsContext.commentiSempliciUnderTest({
  id: 'attendance-hours',
  presenze: { righe: [{ descrizione: 'Ferie/Permessi/Banca ore', tipo: 'assenza', totale: 20.01, unita: 'ORE' }] },
  voci: [{ descrizione: 'Ferie godute', rifQta: 20.01, rifUnita: 'ORE' }],
  ratei: {}, tfr: {}, totali: {},
});
const attendanceComment = attendanceComments.find(comment => comment.title === 'Assenze pagate');
assert.ok(attendanceComment, 'la tabella presenze deve generare un commento semplice');
assert.match(attendanceComment.text, /20,01 ore/i);
assert.doesNotMatch(attendanceComment.text, /20,01 €/i, 'una quantità in ore non deve essere presentata come denaro');

const voiceContext = {
  esc: value => String(value),
  aliasKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  fmtEur: value => Number(value).toFixed(2).replace('.', ','),
  spiegaVoce: voice => ({ nome: voice.nome, cat: voice.cat, cosa: voice.cosa, controlla: '' }),
  spiegazioneBreveVoce: (_voice, explanation) => explanation.cosa,
  controlloUtileVoce: voice => voice.warning || '',
};
vm.createContext(voiceContext);
vm.runInContext(sourceBetween('function vociTableHTML', 'function importoVoci') + '\nthis.vociTableUnderTest = vociTableHTML;', voiceContext);
const voicesHtml = voiceContext.vociTableUnderTest({ voci: [
  { descrizione: 'Retribuzione ordinaria', nome: 'Retribuzione ordinaria', cat: 'competenza', cosa: 'È la paga normale del mese.', competenza: 1600, warning: 'Il calcolo base × quantità non coincide con l’importo: confronta questa riga col documento.' },
  { descrizione: 'Contributo INPS', nome: 'Contributi INPS', cat: 'trattenuta', cosa: 'Serve a pensione e tutele.', trattenuta: 147 },
  { descrizione: 'Ore lavorate', nome: 'Ore lavorate', cat: 'dato', cosa: 'Indica le ore del mese.' },
  { descrizione: 'Recupero competenza', nome: 'Recupero competenza', cat: 'competenza', cosa: 'Corregge una somma precedente.', competenza: -50 },
] });
assert.equal((voicesHtml.match(/class="voce-row/g) || []).length, 4, 'Dettaglio deve mostrare ogni voce');
assert.match(voicesHtml, /È la paga normale del mese/);
assert.match(voicesHtml, /Serve a pensione e tutele/);
assert.match(voicesHtml, /− 50,00 €/);
assert.doesNotMatch(voicesHtml, /\+ -50,00/);
assert.doesNotMatch(voicesHtml, /<th|Rif\.|Importo base/i, 'Dettaglio non deve riproporre colonne tecniche');
assert.doesNotMatch(voicesHtml, /Contributo INPS/, 'il nome originale quasi identico non va ripetuto');
assert.match(voicesHtml, /voice-ledger-group competenza/);
assert.match(voicesHtml, /voice-ledger-group trattenuta/);
assert.match(voicesHtml, /voice-ledger-group dato/);
assert.match(voicesHtml, /Competenze/);
assert.match(voicesHtml, /Trattenute/);
assert.match(voicesHtml, /Dati di calcolo/);
assert.match(voicesHtml, /class="voice-ledger-check" data-edit-voice="0"/);
assert.match(voicesHtml, /Correggi/);

const summarySource = sourceBetween('function renderRiassunto', 'function renderDettaglioCompleto');
const detailSource = sourceBetween('function renderDettaglioCompleto', 'function bindDettaglioCommon');
assert.match(summarySource, /<h2>Riassunto dei dati<\/h2>/, 'la lettura semplice deve stare nel Riassunto');
assert.doesNotMatch(detailSource, /<h2>In parole semplici<\/h2>/, 'il Dettaglio non deve duplicare la lettura semplice');
assert.match(detailSource, /Cedolino dettagliato/);
assert.match(detailSource, /Tutte le voci/);
assert.match(detailSource, /Tocca la voce se vuoi approfondire\./);
assert.match(detailSource, /SourcePreviewCache\.get\(record\.id\)/, 'Modifica dati deve riusare l’originale tenuto in RAM');
assert.match(detailSource, /target-edit/, 'la correzione deve portare alla riga esatta');

const importChoiceSource = sourceBetween('function proponiDopoImport', 'function startVerifica');
assert.match(importChoiceSource, /classification\.inScope === false/);
assert.match(importChoiceSource, /non lo analizzerà e non lo salverà/);
assert.match(importChoiceSource, />Salva e analizza<\/button>/);
assert.match(importChoiceSource, />Controlla i dati<\/button>/);
assert.match(importChoiceSource, /completaSalvataggio\(record\)/, 'Salva e analizza deve aprire il Riassunto');
const voiceExplanationSource = sourceBetween('function vociInfoHtml', 'function controlloUtileVoce');
assert.match(voiceExplanationSource, /spiegazioneCompletaVoce\(v, s\)/, 'aprendo una voce deve comparire anche il motivo per cui esiste');
assert.match(voiceExplanationSource, /function spiegazioneCompletaVoce/);
assert.match(templateSource, />Dettagliato<\/button>/);
assert.match(templateSource, /id="screen-nav"[\s\S]*id="nav-back"[\s\S]*id="nav-forward"/, 'devono esserci i comandi Indietro e Avanti');
assert.match(uiSource, /window\.addEventListener\('popstate'/, 'le frecce del browser devono ripristinare la schermata');
assert.match(uiSource, /history\.back\(\)/);
assert.match(uiSource, /history\.forward\(\)/);
assert.match(uiSource, /sessionStorage\.setItem\(APP_HISTORY_STORAGE_PREFIX/, 'la posizione massima dell’app deve sopravvivere al reload della scheda');
assert.match(uiSource, /window\.addEventListener\('popstate', handleHistoryPopState\)/);
assert.match(uiSource, /\['#topbar', '#screen-nav', '#tabs', 'main', 'footer'\]/, 'i comandi di navigazione devono essere disattivati dietro ai popup');
assert.match(cssSource, /#screen-nav button/);
assert.match(cssSource, /td\[data-label="Trattenuta"\][^{]*\{[^}]*background:\s*var\(--alert-bg\)/s);
assert.match(cssSource, /td\[data-label="Competenza"\][^{]*\{[^}]*background:\s*var\(--ok-bg\)/s);

const navSessionValues = new Map();
const navSessionStorage = {
  getItem(key) { return navSessionValues.has(key) ? navSessionValues.get(key) : null; },
  setItem(key, value) { navSessionValues.set(key, String(value)); },
};
const navHistory = {
  entries: [], index: -1, pushes: [], replacements: [],
  get state() { return this.index >= 0 ? this.entries[this.index].state : null; },
  pushState(state, _title, url) {
    this.entries.splice(this.index + 1);
    this.entries.push({ state: { ...state }, url });
    this.index += 1;
    this.pushes.push({ state: { ...state }, url });
  },
  replaceState(state, _title, url) {
    const entry = { state: { ...state }, url };
    if (this.index < 0) { this.entries.push(entry); this.index = 0; }
    else this.entries[this.index] = entry;
    this.replacements.push({ state: { ...state }, url });
  },
  back() { if (this.index > 0) this.index -= 1; return this.state; },
  forward() { if (this.index + 1 < this.entries.length) this.index += 1; return this.state; },
};

function createNavigationRuntime() {
  const navViews = ['importa', 'guida', 'consigli'].map(name => ({
    id: `view-${name}`,
    classList: { add() {}, remove() {} },
  }));
  const navTabs = navViews.map(view => ({
    dataset: { view: view.id.replace('view-', '') },
    classList: { toggle() {} },
    setAttribute() {}, removeAttribute() {},
  }));
  const navBack = { disabled: false };
  const navForward = { disabled: false };
  const context = {
    history: navHistory,
    sessionStorage: navSessionStorage,
    crypto: { randomUUID: () => 'test-navigation-trail' },
    window: { scrollTo() {} },
    Store: { data: { records: [] } },
    closeInfo() {},
    renderImporta() {}, renderGuida() {}, renderConsigli() {}, renderProgetto() {}, renderImpostazioni() {},
    renderVerifica() {}, renderDettaglio() {}, renderRiassunto() {},
    $: selector => selector === '#tabs' ? { addEventListener() {} }
      : selector === '#nav-back' ? navBack
        : selector === '#nav-forward' ? navForward
          : navViews.find(view => `#${view.id}` === selector) || null,
    $$: selector => selector === '.view' ? navViews : selector === '#tabs .tab' ? navTabs : [],
    recSorted: () => [],
  };
  vm.createContext(context);
  vm.runInContext(
    sourceBetween('/* ---------- navigazione ---------- */', '/* ============================================================\n   IMPORTA')
      + '\nthis.navigationUnderTest = { showView, restoreHistoryEntry, handleHistoryPopState };',
    context,
  );
  return { api: context.navigationUnderTest, back: navBack, forward: navForward };
}

const firstNavigationRuntime = createNavigationRuntime();
firstNavigationRuntime.api.restoreHistoryEntry();
firstNavigationRuntime.api.showView('importa', { historyMode: 'replace' });
assert.equal(navHistory.replacements.length, 1);
assert.equal(navHistory.state.view, 'importa');
assert.equal(firstNavigationRuntime.back.disabled, true);
firstNavigationRuntime.api.showView('guida');
assert.equal(navHistory.pushes.length, 1);
assert.equal(navHistory.state.position, 1);
assert.equal(firstNavigationRuntime.back.disabled, false);
firstNavigationRuntime.api.showView('guida');
assert.equal(navHistory.pushes.length, 1, 'riaprire la stessa schermata non deve duplicare la cronologia');
firstNavigationRuntime.api.showView('consigli');
assert.equal(navHistory.pushes.length, 2);
assert.equal(navHistory.state.position, 2);

// popstate verso la schermata precedente: "Avanti" deve conoscere la voce già esistente.
firstNavigationRuntime.api.handleHistoryPopState({ state: navHistory.back() });
assert.equal(navHistory.state.view, 'guida');
assert.equal(firstNavigationRuntime.back.disabled, false);
assert.equal(firstNavigationRuntime.forward.disabled, false, 'dopo popstate deve essere disponibile la schermata Avanti dell’app');

// Simula un reload reale: nuovo runtime JS, stessa entry History e stesso sessionStorage della scheda.
const reloadedNavigationRuntime = createNavigationRuntime();
const reloadedState = reloadedNavigationRuntime.api.restoreHistoryEntry();
reloadedNavigationRuntime.api.showView(reloadedState.view, { historyMode: 'replace' });
assert.equal(navHistory.state.position, 1, 'il reload non deve azzerare la posizione corrente');
assert.equal(reloadedNavigationRuntime.back.disabled, false);
assert.equal(reloadedNavigationRuntime.forward.disabled, false, 'il reload non deve dimenticare la schermata Avanti');

reloadedNavigationRuntime.api.handleHistoryPopState({ state: navHistory.forward() });
assert.equal(navHistory.state.view, 'consigli');
assert.equal(navHistory.state.position, 2);
assert.equal(reloadedNavigationRuntime.forward.disabled, true, 'all’ultima schermata dell’app Avanti deve disattivarsi');

// Un nuovo push dopo Indietro tronca davvero la vecchia diramazione Avanti.
reloadedNavigationRuntime.api.handleHistoryPopState({ state: navHistory.back() });
reloadedNavigationRuntime.api.showView('importa');
assert.equal(navHistory.entries.length, 3);
assert.equal(navHistory.entries[2].state.view, 'importa');
assert.equal(reloadedNavigationRuntime.forward.disabled, true);

assert.doesNotMatch(uiSource, /vieta al browser qualunque connessione di rete/, 'la CSP consente risorse same-origin e non va descritta come isolamento totale dalla rete');
assert.match(uiSource, /non invia il documento né i dati estratti/);
assert.match(uiSource, /blocca i servizi di terze parti/);
assert.match(uiSource, /Le intelligenze artificiali possono sbagliare e anche BustaChiara può sbagliare/);

const profileContext = {
  Store: { data: { layoutProfiles: [] } },
  aliasKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  getPath: (object, path) => path.split('.').reduce((value, key) => value == null ? value : value[key], object),
};
vm.createContext(profileContext);
vm.runInContext(sourceBetween('function localProfileHash', 'function applicaAliasLocali')
  + '\nthis.profileFns = { imparaProfiloLayout, applicaProfiloLayout };', profileContext);
profileContext.profileFns.imparaProfiloLayout({
  azienda: { nome: 'Datore riservato SRL' }, ccnlId: 'turismo', ccnl: { cnel: 'H052' },
  meta: { software: 'Zucchetti', settore: 'privato-lul', fields: { 'totali.netto': { confidence: 1, confirmed: true } } },
  totali: { netto: 1500 },
});
const storedProfile = profileContext.Store.data.layoutProfiles[0];
assert.ok(storedProfile && storedProfile.key);
assert.doesNotMatch(JSON.stringify(storedProfile), /Datore riservato/i, 'il profilo non deve salvare il nome del datore');
const nextRecord = { azienda: { nome: 'Datore riservato SRL' }, ccnl: {}, meta: { software: 'Zucchetti', settore: 'privato-lul', fields: {} }, totali: { netto: 1510 } };
profileContext.profileFns.applicaProfiloLayout(nextRecord);
assert.equal(nextRecord.ccnlId, 'turismo');
assert.equal(nextRecord.ccnl.cnel, 'H052');

const unconfirmed = {
  azienda: { nome: 'Datore non confermato SPA' }, ccnl: {},
  meta: { software: 'INAZ', settore: 'privato-lul', fields: { 'totali.netto': { confidence: .1, confirmed: false } } },
  totali: { netto: 1200 },
};
profileContext.profileFns.imparaProfiloLayout(unconfirmed);
profileContext.profileFns.imparaProfiloLayout(unconfirmed);
const nextUnconfirmed = { azienda: { nome: 'Datore non confermato SPA' }, ccnl: {}, meta: { software: 'INAZ', settore: 'privato-lul', fields: { 'totali.netto': { confidence: .1 } } }, totali: { netto: 1210 } };
profileContext.profileFns.applicaProfiloLayout(nextUnconfirmed);
assert.equal(nextUnconfirmed.meta.fields['totali.netto'].confidence, .1, 'un campo mai confermato non deve ottenere fiducia dal profilo');

const flowContext = { Parser: { derivaIndice: () => ({}) } };
vm.createContext(flowContext);
vm.runInContext(
  sourceBetween('function calcolaFlussoStipendio', 'function flussoStipendioHTML')
    + '\nthis.calcolaFlussoUnderTest = calcolaFlussoStipendio;',
  flowContext,
);
const flow = flowContext.calcolaFlussoUnderTest({
  totali: { competenze: 2000, netto: 1500, trattenute: null, arrotondamento: 0 },
  derivati: {},
});
assert.equal(flow.trattenute, 500);
assert.equal(flow.totale, 2000);

const serviceWorkerContext = {
  deleted: [],
  handlers: {},
  self: {
    addEventListener(type, handler) { serviceWorkerContext.handlers[type] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches: {
    keys: async () => ['bustachiara-v9-evidenze-valore', 'bustachiara-v10-ocr-locale', 'altra-pwa-cache'],
    delete: async key => { serviceWorkerContext.deleted.push(key); return true; },
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    match: async () => null,
  },
  fetch: async () => { throw new Error('fetch inatteso nel test di attivazione'); },
  URL,
  location: { origin: 'https://example.test' },
};
vm.createContext(serviceWorkerContext);
vm.runInContext(serviceWorkerSource, serviceWorkerContext);
let activation;
serviceWorkerContext.handlers.activate({ waitUntil(promise) { activation = promise; } });
await activation;
assert.deepEqual(serviceWorkerContext.deleted, ['bustachiara-v9-evidenze-valore', 'bustachiara-v10-ocr-locale']);
assert.match(serviceWorkerSource, /bustachiara-v15-navigazione-parser-fonti/);

console.log('OK — regressioni Riassunto e cache PWA');
