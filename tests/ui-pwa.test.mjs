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
assert.deepEqual(serviceWorkerContext.deleted, ['bustachiara-v9-evidenze-valore']);

console.log('OK — regressioni Riassunto e cache PWA');
