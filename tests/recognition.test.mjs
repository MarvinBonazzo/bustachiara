import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `blocco non trovato: ${start}`);
  return source.slice(from, to);
};

const multiOcr = between('async function ocrDataMulti', '/* Converte le parole OCR');
assert.match(multiOcr, /localThresholdCanvas\(canvas\)/, 'manca la seconda lettura a contrasto alternativo');
assert.match(multiOcr, /AiOcr\.recognize\(canvas/, 'manca PP-OCR locale');
assert.doesNotMatch(multiOcr, /shouldUseSpecialist/, 'PP-OCR non deve partire soltanto dopo una soglia euristica');
assert.match(multiOcr, /_specialistResult/, 'l’esito indipendente deve restare disponibile al consenso');
assert.match(multiOcr, /_primaryResult/, 'la prima lettura Tesseract deve restare indipendente');
assert.match(multiOcr, /_secondaryResult/, 'la seconda lettura Tesseract deve restare indipendente');

const mergeContext = { aliasKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '') };
vm.createContext(mergeContext);
vm.runInContext(between('function mergeOcrPasses', 'async function ocrDataMulti') + '\nthis.mergePasses = mergeOcrPasses;', mergeContext);
const mergedTokens = mergeContext.mergePasses(
  { words: [{ text: '1500,00', confidence: 70, bbox: { x0: 10, y0: 10, x1: 70, y1: 25 } }] },
  { words: [{ text: '1508,00', confidence: 91, bbox: { x0: 10, y0: 10, x1: 70, y1: 25 } }] },
);
assert.equal(mergedTokens.words.length, 1, 'due numeri diversi nella stessa bbox non devono diventare due token');
assert.equal(mergedTokens.words[0].text, '1508,00');
assert.equal(mergedTokens._passAlternatives.length, 1, 'il conflitto deve restare diagnosticabile');

const parseOcr = between('async function parseDaOcr', '/* ============================================================\n   VERIFICA');
assert.match(parseOcr, /engineExtractions\s*=\s*\[parseEngine\(primaryPages[^\]]+parseEngine\(secondaryPages/s);
assert.match(parseOcr, /engineExtractions\.push\(parseEngine\(specialistPages/);
assert.doesNotMatch(parseOcr, /\[daCoordinate,\s*daTesto\]/, 'coordinate e testo non devono valere come due motori OCR');

const context = {
  getPath: (object, path) => path.split('.').reduce((value, key) => value == null ? value : value[key], object),
  setPath: (object, path, value) => {
    const keys = path.split('.'); let current = object;
    for (const key of keys.slice(0, -1)) current = current[key] || (current[key] = {});
    current[keys.at(-1)] = value;
  },
  aliasKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  Parser: {
    fieldConfidence: (record, path) => Number(record.meta?.fields?.[path]?.confidence) || 0,
    derivaIndice: () => ({}),
    valutaCoerenza: () => ({ score: 100, checks: [] }),
    valutaQualita: () => ({ score: 100 }),
    ripulisciRecord: record => record,
  },
};
vm.createContext(context);
vm.runInContext(between('function scoreEstrazione', '/* Pipeline completa:')
  + '\nthis.mergeMany = unisciEstrazioniMultiple;', context);

function extraction(net, confidence) {
  return { record: {
    periodo: { mese: 10, anno: 2026 }, azienda: {}, dipendente: {}, ccnl: {}, elementi: {}, orario: {},
    voci: [{ descrizione: 'Retribuzione ordinaria', competenza: 1900, meta: { confidence } }],
    totali: { competenze: 1900, trattenute: 400, netto: net }, tfr: {}, progressivi: {}, ratei: {}, derivati: {},
    meta: { fields: { 'totali.netto': { confidence } } },
  }, warnings: [] };
}

const agreed = context.mergeMany([extraction(1500, .72), extraction(1500, .76), extraction(1508, .99)]);
assert.equal(agreed.record.totali.netto, 1500, 'due letture concordi devono prevalere su una lettura isolata');
assert.match(agreed.record.meta.fields['totali.netto'].method, /consenso di 2 letture/i);
assert.equal(agreed.record.meta.recognition.readers, 3);

const conflict = context.mergeMany([extraction(1500, .7), extraction(1508, .71)]);
assert.equal(conflict.record.meta.consensusConflicts['totali.netto'].length, 2, 'il conflitto non deve essere nascosto');
assert.ok(conflict.record.meta.fields['totali.netto'].confidence <= .62, 'un conflitto deve abbassare la fiducia');

console.log('OK — tre OCR, consenso indipendente e conflitti visibili');
