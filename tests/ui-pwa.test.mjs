import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const uiSource = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

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

const voiceContext = {
  esc: value => String(value),
  aliasKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  fmtEur: value => Number(value).toFixed(2).replace('.', ','),
  spiegaVoce: voice => ({ nome: voice.nome, cat: voice.cat, cosa: voice.cosa, controlla: '' }),
  spiegazioneBreveVoce: (_voice, explanation) => explanation.cosa,
  controlloUtileVoce: () => '',
};
vm.createContext(voiceContext);
vm.runInContext(sourceBetween('function vociTableHTML', 'function importoVoci') + '\nthis.vociTableUnderTest = vociTableHTML;', voiceContext);
const voicesHtml = voiceContext.vociTableUnderTest({ voci: [
  { descrizione: 'Retribuzione ordinaria', nome: 'Retribuzione ordinaria', cat: 'competenza', cosa: 'È la paga normale del mese.', competenza: 1600 },
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
vm.runInContext(readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8'), serviceWorkerContext);
let activation;
serviceWorkerContext.handlers.activate({ waitUntil(promise) { activation = promise; } });
await activation;
assert.deepEqual(serviceWorkerContext.deleted, ['bustachiara-v9-evidenze-valore', 'bustachiara-v10-ocr-locale']);

console.log('OK — regressioni Riassunto e cache PWA');
