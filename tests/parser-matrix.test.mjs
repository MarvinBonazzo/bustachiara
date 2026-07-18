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

const results = [];
const failures = [];
let assertionsRun = 0;
let assertionsPassed = 0;

function verify(fixture, label, assertion) {
  assertionsRun++;
  try {
    assertion();
    assertionsPassed++;
    return true;
  } catch (error) {
    failures.push(`${fixture.id} — ${label}: ${String(error && error.message || error).split('\n')[0]}`);
    return false;
  }
}

for (const fixture of fixtures) {
  const parsed = fixture.type === 'text'
    ? Parser.parseFreeText(fixture.text)
    : Parser.parsePdfPages(fixture.pages.map(rows => page(rows)));
  for (const [path, expected] of Object.entries(fixture.expected || {})) {
    verify(fixture, path, () => {
      assertExpectedPath(parsed.record, fixture, path, expected);
    });
  }
  for (const expectation of fixture.voices || []) {
    const needle = normalized(expectation.match);
    const voice = parsed.record.voci.find(item => normalized(item.descrizione).includes(needle));
    const found = verify(fixture, `voce ${expectation.match}`, () => {
      assert.ok(voice, `${fixture.id}: voce non riconosciuta: ${expectation.match}\n${JSON.stringify(parsed.record.voci, null, 2)}`);
    });
    if (found && expectation.side) {
      verify(fixture, `importo ${expectation.match}`, () => {
        approx(voice[expectation.side], expectation.amount, `${fixture.id}: importo ${expectation.match}`);
      });
    }
    if (found && expectation.class) {
      verify(fixture, `classificazione ${expectation.match}`, () => {
        const classified = Data.classificaVoce(voice).nome;
        assert.equal(
          normalized(classified),
          normalized(expectation.class),
          `${fixture.id}: classificazione ${expectation.match} (ricevuto: ${classified})`,
        );
      });
    }
    if (found && expectation.page != null) {
      verify(fixture, `pagina sorgente ${expectation.match}`, () => {
        assert.equal(voice.meta && voice.meta.visual && voice.meta.visual.page, expectation.page);
      });
    }
    if (found) {
      for (const [path, expected] of Object.entries(expectation.fields || {})) {
        verify(fixture, `${expectation.match}: ${path}`, () => {
          assertExpectedPath(voice, fixture, path, expected);
        });
      }
    }
  }
  if (fixture.expectedVoiceCount != null) {
    verify(fixture, 'numero voci', () => {
      assert.equal(
        parsed.record.voci.length,
        fixture.expectedVoiceCount,
        `${fixture.id}: righe non retributive interpretate come voci\n${JSON.stringify(parsed.record.voci, null, 2)}`,
      );
    });
  }
  if (fixture.quadrature) {
    const quadrature = Parser.quadraturaTotali(parsed.record.totali);
    verify(fixture, 'quadratura completa', () => {
      assert.equal(quadrature.completa, true, `${fixture.id}: quadratura incompleta`);
    });
    verify(fixture, 'quadratura corretta', () => {
      assert.equal(quadrature.ok, true, `${fixture.id}: quadratura fallita: ${JSON.stringify(quadrature)}`);
    });
  }
  if (fixture.expected && fixture.expected['ccnl.cnel']) {
    verify(fixture, 'risoluzione CCNL', () => {
      const contract = Parser.trovaCcnl(parsed.record, Data.CCNL_DB);
      assert.ok(contract, `${fixture.id}: codice CNEL estratto ma contratto non risolto`);
    });
  }
  if (fixture.type === 'pages') {
    verify(fixture, 'evidenze visive delle voci', () => {
      assert.equal(parsed.record.voci.every(voice => voice.meta
        && voice.meta.source === 'coordinate'
        && voice.meta.visual
        && voice.meta.visual.bbox
        && voice.meta.visual.bbox.w > 0
        && voice.meta.visual.bbox.h > 0), true);
    });
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

// Una descrizione isolata tra due righe economiche può essere la continuazione
// della precedente oppure l'intestazione della successiva. La distanza verticale
// e la presenza della descrizione sulla riga numerica devono decidere senza
// contaminare la voce sbagliata.
const wrappedDescriptions = Parser.parsePdfPages([page([
  [800, [[30, 'CEDOLINO PAGA OTTOBRE 2026']]],
  [700, [[30, 'CODICE'], [80, 'DESCRIZIONE'], [390, 'DATO BASE'], [510, 'COMPETENZE'], [610, 'TRATTENUTE']]],
  [680, [[30, '100'], [80, 'FONDO'], [390, '1.000,00'], [610, '10,00']]],
  [675, [[80, 'INTEGRATIVO PENSIONE']]],
  [650, [[30, '200'], [80, 'PREMIO PRODUZIONE'], [510, '50,00']]],
  [625, [[80, 'ADDIZIONALE REGIONALE']]],
  [620, [[30, '300'], [390, '2025'], [610, '23,58']]],
  [300, [[440, 'TOTALE COMPETENZE'], [550, '50,00']]],
  [280, [[440, 'TOTALE TRATTENUTE'], [550, '33,58']]],
  [260, [[460, 'NETTO IN BUSTA'], [550, '16,42']]],
])]);
const wrappedFund = wrappedDescriptions.record.voci.find(voice => voice.codice === '100');
const wrappedBonus = wrappedDescriptions.record.voci.find(voice => voice.codice === '200');
const preposedSurtax = wrappedDescriptions.record.voci.find(voice => voice.codice === '300');
assert.equal(wrappedFund && wrappedFund.descrizione, 'FONDO INTEGRATIVO PENSIONE');
assert.equal(wrappedBonus && wrappedBonus.descrizione, 'PREMIO PRODUZIONE',
  'la descrizione preposta alla riga successiva non deve finire nella voce precedente');
assert.equal(preposedSurtax && preposedSurtax.descrizione, 'ADDIZIONALE REGIONALE');

const equidistantPreposedDescription = Parser.parsePdfPages([page([
  [800, [[30, 'CEDOLINO PAGA OTTOBRE 2026']]],
  [700, [[30, 'CODICE'], [80, 'DESCRIZIONE'], [390, 'DATO BASE'], [510, 'COMPETENZE'], [610, 'TRATTENUTE']]],
  [680, [[30, '001'], [80, 'PAGA ORDINARIA'], [390, '1.500,00'], [510, '1.500,00']]],
  [660, [[80, 'INDENNITA SPECIALE']]],
  [640, [[30, '002'], [80, 'DI TURNO'], [510, '80,00']]],
  [300, [[440, 'TOTALE COMPETENZE'], [550, '1.580,00']]],
  [280, [[440, 'TOTALE TRATTENUTE'], [550, '380,00']]],
  [260, [[460, 'NETTO IN BUSTA'], [550, '1.200,00']]],
])]);
const ordinaryPay = equidistantPreposedDescription.record.voci.find(voice => voice.codice === '001');
const shiftAllowance = equidistantPreposedDescription.record.voci.find(voice => voice.codice === '002');
assert.equal(ordinaryPay && ordinaryPay.descrizione, 'PAGA ORDINARIA',
  'il testo equidistante non deve essere accodato automaticamente alla voce precedente');
assert.equal(shiftAllowance && shiftAllowance.descrizione, 'INDENNITA SPECIALE DI TURNO',
  'il complemento iniziale della riga numerica deve completare la descrizione isolata che lo precede');

assert.ok(fixtures.length >= 22, `matrice troppo piccola: ${fixtures.length}`);
assert.ok(new Set(fixtures.map(fixture => fixture.family)).size >= 22, 'ogni fixture deve coprire una famiglia distinta');
const coordinateFixtures = fixtures.filter(fixture => fixture.type === 'pages').length;
assert.ok(coordinateFixtures >= 6, `servono il layout coordinate storico e almeno cinque layout nuovi: presenti ${coordinateFixtures}`);
assert.ok(fixtures.some(fixture => fixture.id.includes('ocr-rumoroso')), 'manca un caso OCR rumoroso');
assert.equal(failures.length, 0, `matrice parser fallita (${failures.length} asserzioni):\n- ${failures.join('\n- ')}`);

const corpusPercentage = assertionsRun ? (assertionsPassed / assertionsRun * 100).toFixed(2).replace('.', ',') : '0,00';
console.log(
  `OK — matrice parser: ${results.length}/${results.length} cedolini sintetici; `
  + `${coordinateFixtures} fixture a coordinate; ${results.reduce((sum, result) => sum + result.voices, 0)} voci; `
  + `${assertionsPassed}/${assertionsRun} asserzioni (${corpusPercentage}% sul corpus di regressione, non una garanzia universale)`,
);

// I documenti simili a un cedolino ma fuori ambito sono un controllo bloccante.
await import('./non-payslip-gaps.test.mjs');
