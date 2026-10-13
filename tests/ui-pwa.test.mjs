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

const fmtEurTest = (value, dec = 2) => {
  const [int, frac] = Math.abs(Number(value)).toFixed(dec).split('.');
  return (Number(value) < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (frac ? ',' + frac : '');
};

// ---------- Riassunto: extra del mese, ferie/permessi usati, TFR ----------
const summaryContext = {
  fmtEur: fmtEurTest, MESI_NOMI: ['', 'Gennaio'],
  recSorted: () => [], employerKey: () => '', tipoCedolino: () => 'ordinario', periodoKey: () => 0, periodoLabel: () => '',
  spiegaVoce: voice => ({ nome: voice.nome || voice.descrizione, cat: voice.cat }),
  Parser: { calcoloVoce: () => null },
};
vm.createContext(summaryContext);
vm.runInContext(
  sourceBetween('const isOre = ', 'function testoControlloSemplice')
    + '\nthis.fns = { extraDelMese, usatoNelMese, tfrSemplice, nomeSemplice, rimanenteVoce, calcoloVoceParti, importoFirmato };',
  summaryContext,
);
const S = summaryContext.fns;
const extra = S.extraDelMese({ voci: [
  { descrizione: 'Straordinario 25 per cento', competenza: 125, rifQta: 10 },
  { descrizione: "13ma Mensilita'", competenza: 166.67 },
  { descrizione: 'Retribuzione', competenza: 1800 },
] });
assert.deepEqual([...extra.map(item => item.title)], ['Straordinari', 'Pezzi di tredicesima e quattordicesima']);
assert.match(extra[0].sub, /10 ore/);
assert.equal(S.usatoNelMese({ voci: [{ descrizione: 'Ferie godute', rifQta: 8, rifUnita: 'ORE' }] }, /ferie\s+god/i), '8 ore');
assert.equal(S.usatoNelMese({ voci: [{ descrizione: 'Ferie godute', competenza: 90 }] }, /ferie\s+god/i), '', 'senza quantità non si inventano ore');
const tfr = S.tfrSemplice({ tfr: { quotaMese: 164.86, fondo3112: 900, rivalutazione: 20, quotaAnno: 989.16 } });
assert.equal(tfr.quotaMese, 164.86);
assert.equal(Math.round(tfr.totale * 100), 190916, 'TFR se lasciassi oggi = fondo al 31/12 + rivalutazione + quota anno');
assert.equal(S.tfrSemplice({ tfr: {} }), null);
assert.equal(S.tfrSemplice({ tfr: { quotaMese: 100 } }).totale, null, 'senza fondo non si stima il totale');

// ---------- Voci: nomi semplici, conto e rimanenze ----------
assert.equal(S.nomeSemplice({ descrizione: 'Retribuzione', rifUnita: 'ORE', rifQta: 160, competenza: 1860.47 }), 'Ore lavorate');
assert.equal(S.nomeSemplice({ descrizione: 'Ferie godute', competenza: 93 }), 'Ferie usate');
assert.equal(S.nomeSemplice({ descrizione: 'Permessi Rol goduti', competenza: 46 }), 'Permessi usati');
assert.equal(S.nomeSemplice({ descrizione: "13ma Mensilita'", rifUnita: 'ORE', rifQta: 14.33, competenza: 166 }), 'Pezzo di tredicesima');
assert.equal(S.nomeSemplice({ descrizione: 'Contributo IVS', trattenuta: 219 }), 'Pensione (INPS)');
assert.equal(S.nomeSemplice({ descrizione: 'Ritenute IRPEF', trattenuta: 233 }), 'Tasse allo Stato (IRPEF)');
assert.equal(S.nomeSemplice({ descrizione: 'Voce aziendale XYZ', nome: 'Voce aziendale XYZ', competenza: 10 }), 'Voce aziendale XYZ', 'le voci sconosciute tengono il nome originale');
assert.equal(S.rimanenteVoce({ descrizione: 'Ferie godute', competenza: 93 }, { ratei: { ferie: { saldo: 11, unita: 'GG' } } }), 'Ti restano ancora 11 giorni di ferie');
assert.equal(S.rimanenteVoce({ descrizione: 'Permessi Rol goduti', competenza: 46 }, { ratei: { permessi: { saldo: 42, unita: 'ORE' } } }), 'Ti restano ancora 42 ore di permesso');
summaryContext.Parser.calcoloVoce = () => ({ ok: true, amount: 1860.47 });
const parts = S.calcoloVoceParti({ descrizione: 'Retribuzione', base: 11.62791, rifQta: 160, rifUnita: 'ORE', competenza: 1860.47 }, {});
assert.deepEqual([...parts.map(p => p.v || p.op)], ['160 ore', '×', '11,63 €', '=', '1.860,47 €']);
summaryContext.Parser.calcoloVoce = () => ({ ok: false });
assert.equal(S.calcoloVoceParti({ descrizione: 'Retribuzione', base: 10, rifQta: 160, rifUnita: 'ORE', competenza: 999 }, {}), null, 'un conto che non torna non va mostrato');
const irpef = S.calcoloVoceParti({ descrizione: 'Ritenute IRPEF', trattenuta: 233.37 }, { derivati: { irpefLorda: 497.05, detrazioni: 180.35, ulterioreDetrazione: 83.33 } });
assert.deepEqual([...irpef.map(p => p.v || p.op)], ['497,05 €', '−', '180,35 €', '−', '83,33 €', '=', '233,37 €']);
assert.equal(S.importoFirmato(-50, false), '− 50,00 €');
assert.equal(S.importoFirmato(1860.47, false), '1.860,47 €');

const summarySource = sourceBetween('function renderRiassunto', 'function vociHTML');
const detailSource = sourceBetween('function vociHTML', 'function openRecordEditor');
assert.match(summarySource, /Dal lordo al netto|flussoHTML\(r\)/);
assert.match(summarySource, /TFR, il tuo salvadanaio/);
assert.match(summarySource, /Se lasciassi l’azienda oggi/);
assert.ok(summarySource.indexOf('controlliSempliciHTML(findings)') > summarySource.indexOf('summary-voci'), 'i controlli vanno in fondo al Riassunto');
assert.doesNotMatch(summarySource, /<details/, 'il Riassunto mostra tutto senza finestre da aprire');
assert.match(detailSource, /Quanto hai guadagnato/);
assert.match(detailSource, /Quanto ti hanno tolto/);
assert.doesNotMatch(detailSource, /Dati di calcolo/, 'i dati di calcolo non sono una sezione delle Voci');
assert.match(detailSource, /<details class="gruppo/);
assert.match(detailSource, /<details class="voce">/);
assert.match(detailSource, /data-edit-voice/);
assert.match(uiSource, /SourcePreviewCache\.get\(record\.id\)/, 'Modifica dati deve riusare l’originale tenuto in RAM');
assert.match(uiSource, /target-edit/, 'la correzione deve portare alla riga esatta');
assert.doesNotMatch(readFileSync(new URL('../src/checks.js', import.meta.url), 'utf8'), /Taglio del cuneo assente/);

const importChoiceSource = sourceBetween('function proponiDopoImport', 'function startVerifica');
assert.match(importChoiceSource, /classification\.inScope === false/);
assert.match(importChoiceSource, /non lo analizzerà e non lo salverà/);
assert.match(importChoiceSource, />Salva e analizza<\/button>/);
assert.match(importChoiceSource, />Controlla i dati<\/button>/);
assert.match(importChoiceSource, /completaSalvataggio\(record\)/, 'Salva e analizza deve aprire il Riassunto');
const voiceExplanationSource = sourceBetween('function vociInfoHtml', 'function controlloUtileVoce');
assert.match(voiceExplanationSource, /spiegazioneCompletaVoce\(v, s\)/, 'aprendo una voce deve comparire anche il motivo per cui esiste');
assert.match(voiceExplanationSource, /function spiegazioneCompletaVoce/);
assert.match(uiSource, /window\.addEventListener\('popstate'/, 'le frecce del browser devono ripristinare la schermata');
assert.match(uiSource, /sessionStorage\.setItem\(APP_HISTORY_STORAGE_PREFIX/, 'la posizione massima dell’app deve sopravvivere al reload della scheda');
assert.match(uiSource, /window\.addEventListener\('popstate', handleHistoryPopState\)/);
assert.match(uiSource, /\['#topbar', 'main', 'footer'\]/, 'intestazione e contenuto devono essere disattivati dietro ai popup');
assert.match(templateSource, />Riassunto<\/button>[\s\S]*>Voci<\/button>/, 'la navigazione principale ha solo Riassunto e Voci');
assert.match(cssSource, /body\[data-view="importa"\] #tabs/, 'la Home non mostra la navigazione');
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
  sourceBetween('const FLOW_COLORS', 'function flussoHTML')
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
assert.match(serviceWorkerSource, /const CACHE = 'bustachiara-v\d+-[a-z0-9-]+';/);

console.log('OK — regressioni Riassunto e cache PWA');
