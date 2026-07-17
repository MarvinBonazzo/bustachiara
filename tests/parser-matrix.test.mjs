import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { console };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../src/cnel-index.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../src/parser-sectors.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../src/parser.js', import.meta.url), 'utf8') + '\nthis.ParserUnderMatrixTest = Parser;', context);
vm.runInContext(readFileSync(new URL('../src/data.js', import.meta.url), 'utf8') + '\nthis.DataUnderMatrixTest = { CCNL_DB, classificaVoce };', context);

const Parser = context.ParserUnderMatrixTest;
const Data = context.DataUnderMatrixTest;
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/parser-sector-matrix.json', import.meta.url), 'utf8'));

function page(rows) {
  return rows.flatMap(([y, cells]) => cells.map(([x, str, width]) => ({
    str,
    x,
    y,
    w: width ?? Math.max(8, String(str).length * 4.5),
  })));
}

function getPath(value, path) {
  return path.split('.').reduce((current, key) => current == null ? current : current[key], value);
}

function approx(actual, expected, message, epsilon = 0.02) {
  assert.ok(
    actual != null && Math.abs(Number(actual) - expected) <= epsilon,
    `${message}: atteso ${expected}, ricevuto ${actual}`,
  );
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function assertExpectedPath(record, fixture, path, expected) {
  const actual = getPath(record, path);
  if (typeof expected === 'number') approx(actual, expected, `${fixture.id}: ${path}`);
  else assert.equal(actual, expected, `${fixture.id}: ${path}`);
}

function assertExpectedVoice(record, fixture, expectation) {
  const needle = normalized(expectation.match);
  const voice = record.voci.find(item => normalized(item.descrizione).includes(needle));
  assert.ok(voice, `${fixture.id}: voce non riconosciuta: ${expectation.match}\n${JSON.stringify(record.voci, null, 2)}`);
  if (expectation.side) approx(voice[expectation.side], expectation.amount, `${fixture.id}: importo ${expectation.match}`);
  if (expectation.class) {
    const classified = Data.classificaVoce(voice).nome;
    assert.equal(
      normalized(classified),
      normalized(expectation.class),
      `${fixture.id}: classificazione ${expectation.match} (ricevuto: ${classified})`,
    );
  }
}

const results = [];
const failures = [];
for (const fixture of fixtures) {
  const parsed = fixture.type === 'text'
    ? Parser.parseFreeText(fixture.text)
    : Parser.parsePdfPages(fixture.pages.map(rows => page(rows)));
  try {
    for (const [path, expected] of Object.entries(fixture.expected || {})) {
      assertExpectedPath(parsed.record, fixture, path, expected);
    }
    for (const voice of fixture.voices || []) assertExpectedVoice(parsed.record, fixture, voice);
    if (fixture.expectedVoiceCount != null) {
      assert.equal(
        parsed.record.voci.length,
        fixture.expectedVoiceCount,
        `${fixture.id}: righe non retributive interpretate come voci\n${JSON.stringify(parsed.record.voci, null, 2)}`,
      );
    }
    if (fixture.quadrature) {
      const quadrature = Parser.quadraturaTotali(parsed.record.totali);
      assert.equal(quadrature.completa, true, `${fixture.id}: quadratura incompleta`);
      assert.equal(quadrature.ok, true, `${fixture.id}: quadratura fallita: ${JSON.stringify(quadrature)}`);
    }
    if (fixture.expected && fixture.expected['ccnl.cnel']) {
      const contract = Parser.trovaCcnl(parsed.record, Data.CCNL_DB);
      assert.ok(contract, `${fixture.id}: codice CNEL estratto ma contratto non risolto`);
    }
  } catch (error) {
    failures.push(`${fixture.id}: ${String(error && error.message || error).split('\n')[0]}`);
  }
  if (process.env.PARSER_MATRIX_REPORT === '1') {
    console.log(JSON.stringify({
      id: fixture.id,
      sector: parsed.record.meta.settore,
      voices: parsed.record.voci.map(voice => ({
        description: voice.descrizione,
        class: Data.classificaVoce(voice).nome,
        competence: voice.competenza,
        deduction: voice.trattenuta,
      })),
    }));
  }
  results.push({ id: fixture.id, family: fixture.family, voices: parsed.record.voci.length });
}

assert.ok(fixtures.length >= 14, `matrice troppo piccola: ${fixtures.length}`);
assert.ok(new Set(fixtures.map(fixture => fixture.family)).size >= 14, 'ogni fixture deve coprire una famiglia distinta');
assert.ok(fixtures.some(fixture => fixture.type === 'pages'), 'manca un PDF testuale simulato a coordinate');
assert.ok(fixtures.some(fixture => fixture.id.includes('ocr-rumoroso')), 'manca un caso OCR rumoroso');
assert.equal(failures.length, 0, `matrice parser fallita (${failures.length}/${fixtures.length}):\n- ${failures.join('\n- ')}`);

console.log(`OK — matrice parser: ${results.length} cedolini sintetici, ${results.reduce((sum, result) => sum + result.voices, 0)} voci estratte`);
