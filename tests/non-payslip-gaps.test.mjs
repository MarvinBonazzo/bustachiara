import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { console };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../src/cnel-index.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../src/parser-sectors.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../src/parser.js', import.meta.url), 'utf8') + '\nthis.NonPayslipParser = Parser;', context);

const Parser = context.NonPayslipParser;
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/non-payslip-corpus.json', import.meta.url), 'utf8'));

assert.equal(fixtures.length, 6, 'il corpus negativo deve coprire sei famiglie documentali');
assert.equal(new Set(fixtures.map(item => item.document)).size, fixtures.length, 'ogni documento negativo deve essere distinto');
assert.equal(fixtures.every(item => item.desired === 'reject' && item.enforcement === 'blocking'), true);

const results = fixtures.map(fixture => {
  const parsed = Parser.parseFreeText(fixture.text);
  const totals = parsed.record.totali || {};
  const interpretedAsPayslip = parsed.record.voci.length > 0
    || totals.competenze != null
    || totals.trattenute != null
    || totals.netto != null;
  return {
    id: fixture.id,
    document: fixture.document,
    rejected: !interpretedAsPayslip,
    voices: parsed.record.voci.length,
    classification: parsed.record.meta && parsed.record.meta.documentClassification,
  };
});

const rejected = results.filter(result => result.rejected).length;
for (const result of results) {
  assert.equal(result.rejected, true, `${result.id}: documento fuori ambito interpretato come cedolino`);
  assert.equal(result.classification && result.classification.inScope, false, `${result.id}: classificazione fuori ambito assente`);
  assert.equal(result.classification && result.classification.confidence >= .95, true, `${result.id}: rifiuto non sufficientemente motivato`);
}

const payslipWithAttendance = Parser.parseFreeText(
  'CEDOLINO PAGA OTTOBRE 2026\n'
  + 'PROSPETTO PRESENZE\nOre ordinarie 168,00\n'
  + 'TOT. COMPETENZE 2.000,00\nTOT. TRATTENUTE 500,00\nNETTO IN BUSTA 1.500,00',
);
assert.equal(payslipWithAttendance.record.meta.documentClassification.inScope, true,
  'un cedolino con prospetto presenze incorporato non deve essere respinto');
assert.notEqual(payslipWithAttendance.record.documento.tipo, 'non-cedolino');
assert.equal(payslipWithAttendance.record.totali.competenze, 2000);
assert.equal(payslipWithAttendance.record.totali.trattenute, 500);
assert.equal(payslipWithAttendance.record.totali.netto, 1500);

console.log(`OK — corpus documenti non-cedolino: ${rejected}/${results.length} respinti (CU, 730, F24, contratto, presenze, pensione)`);
