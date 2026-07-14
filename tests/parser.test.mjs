import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { console };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../src/cnel-index.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../src/parser-sectors.js', import.meta.url), 'utf8') + '\nthis.SectorsUnderTest = { parserSectorForText, parserSectorVoiceHints };', context);
vm.runInContext(readFileSync(new URL('../src/parser.js', import.meta.url), 'utf8') + '\nthis.ParserUnderTest = Parser;', context);
vm.runInContext(readFileSync(new URL('../src/data.js', import.meta.url), 'utf8') + '\nthis.DataUnderTest = { CCNL_DB, classificaVoce, semanticVoiceMatch, semanticSimilarity };', context);
vm.runInContext(readFileSync(new URL('../src/checks.js', import.meta.url), 'utf8') + '\nthis.ChecksUnderTest = eseguiControlli;', context);
const Parser = context.ParserUnderTest;
const Data = context.DataUnderTest;
const Sectors = context.SectorsUnderTest;

function page(rows) {
  return rows.flatMap(([y, cells]) => cells.map(([x, str, width]) => ({
    str,
    x,
    y,
    w: width ?? Math.max(8, String(str).length * 4.5),
  })));
}

function approx(actual, expected, epsilon = 0.01) {
  assert.ok(actual != null && Math.abs(actual - expected) <= epsilon, `atteso ${expected}, ricevuto ${actual}`);
}

function getPath(value, path) {
  return path.split('.').reduce((current, key) => current == null ? current : current[key], value);
}

assert.equal(Parser.itNum('1.234,56'), 1234.56);
assert.equal(Parser.itNum('1234.56'), 1234.56);
assert.equal(Parser.itNum('(45,20)'), -45.2);
assert.equal(Parser.itNum('9.84122'), 9.84122);
assert.equal(Parser.itNum('1.234'), 1234);

const jet = Parser.parsePdfPages([page([
  [800, [[25, 'AZIENDA DIMOSTRATIVA S.R.L.'], [260, 'MESE DI RETRIBUZIONE']]],
  [786, [[260, 'GIUGNO 2026']]],
  [770, [[258, 'GG. LAVORATI'], [335, 'ORE LAVORATE']]],
  [758, [[270, '23'], [340, '153,41']]],
  [740, [[30, 'MARIO ESEMPIO']]],
  [728, [[30, 'COD.DIP.'], [72, 'LIVELLO'], [120, 'DESCRIZIONE QUALIFICA'], [370, 'Codice CNEL']]],
  [716, [[30, '000123 4'], [120, 'OPERAI'], [370, 'H05Y']]],
  [700, [[30, 'CODICE FISCALE'], [125, 'ASSUNZIONE']]],
  [688, [[30, 'RSSMRA80A01H501U'], [125, '01/02/2020']]],
  [660, [[27, 'Elementi retributivi']]],
  [648, [[27, 'PAGA BASE CONGLOB.'], [100, 'CONTINGENZA']]],
  [636, [[27, '1.167,75000'], [100, '524,94000']]],
  [620, [[27, 'RETRIBUZIONE MENSILE']]],
  [608, [[27, '1.692,69']]],
  [602, [[90, 'RETRIBUZIONE GIORNALIERA'], [166, 'RETRIBUZIONE ORARIA']]],
  [596, [[90, '65,10346'], [166, '9,84122']]],
  [590, [[268, 'Ferie e permessi'], [372, 'RESIDUO AP.'], [411, 'MATURATI'], [445, 'GODUTI A.C.'], [480, 'GODUTI A.P.'], [530, 'TI RIMANGONO (SALDO)']]],
  [578, [[268, 'Ferie'], [346, '(ORE)'], [411, '86,42'], [445, '28,33'], [482, '31,70'], [538, '58,08']]],
  [566, [[268, 'ROL'], [346, '(ORE)'], [381, '6,66'], [411, '16,00'], [538, '22,66']]],
  [540, [[30, 'VOCE'], [52, 'DESCRIZIONE'], [265, 'Unità di Misura'], [305, 'Quantità'], [357, 'BASE'], [408, 'TRATTENUTE'], [477, 'COMPETENZE']]],
  [526, [[30, '0'], [50, 'Retribuzione ordinaria'], [264, 'GIORNI'], [306, '24,000'], [349, '65,10346'], [482, '1.562,48']]],
  [512, [[30, '22'], [50, 'Magg. per riposo settimanale non di domenica (10%)'], [269, 'ORE'], [306, '13,340'], [352, '0,98412'], [488, '13,13']]],
  [505, [[30, '24'], [50, 'Magg.per festività - Pubb.Eserc. Stab.baln. (120%)'], [269, 'ORE'], [306, '13,340'], [350, '11,80947'], [485, '157,54']]],
  [498, [[30, '819'], [50, 'Rata addizionale comunale'], [237, '2026'], [419, '2,14']]],
  [484, [[122, '1'], [136, '2'], [149, '3'], [163, '4'], [177, '5'], [191, '6'], [204, '7'], [218, '8'], [232, '9'], [245, '10'], [546, 'Totale']]],
  [470, [[30, 'Causale presenze/assenze']]],
  [450, [[39, 'Ore lavorate ordinarie'], [549, '153,41']]],
  [420, [[28, 'Contributi'], [206, 'DESCRIZIONE CONTRIBUTO'], [294, 'ALIQ.'], [320, 'IMPONIBILE'], [351, 'IMPORTO']]],
  [408, [[206, 'INPS'], [294, '9,190'], [320, '2.145,00'], [351, '197,13']]],
  [396, [[206, 'FONDO INTEGR. SALARIALE - FIS', 76], [294, '0,267'], [320, '2.145,00'], [351, '5,73']]],
  [370, [[28, 'IRPEF'], [86, 'IMPONIBILE FISCALE'], [148, 'IRPEF LORDA'], [196, 'IRPEF + IMP. SOST.']]],
  [358, [[86, '1.791,43'], [148, '412,03'], [196, '144,89']]],
  [346, [[86, 'DETR. LAV.DIPENDENTE'], [125, 'U.D.']]],
  [334, [[86, '193,57'], [125, '82,19']]],
  [320, [[468, 'TOTALE COMPETENZE']]],
  [308, [[85, 'IMPONIBILE FISCALE'], [149, 'IMPONIBILE INPS PROGR.'], [468, '2.145,48']]],
  [296, [[85, '10.559,55'], [149, '12.107,00']]],
  [284, [[468, 'TOTALE TRATTENUTE']]],
  [272, [[468, '376,45']]],
  [260, [[85, 'TFR DEL MESE'], [140, 'RETRIBUZIONE UTILE TFR'], [468, 'ARROTONDAMENTO']]],
  [248, [[85, '135,55'], [140, '1.974,81'], [468, '0,36']]],
  [236, [[85, 'OGGI IN AZIENDA HAI'], [468, 'NETTO IN BUSTA']]],
  [224, [[85, '1.436,47'], [468, '1.769,00']]],
])]);

assert.equal(jet.record.meta.software, 'Jet HR');
assert.equal(jet.record.meta.settore, 'privato-lul');
assert.equal(jet.record.documento.tipo, 'ordinario');
assert.equal(jet.record.dipendente.livello, '4');
assert.equal(jet.record.dipendente.qualifica, 'OPERAI');
assert.equal(jet.record.ccnl.cnel, 'H05Y');
assert.equal(jet.record.dipendente.dataAssunzione, '01/02/2020');
assert.equal(jet.record.voci.some(v => v.codice === '0' && v.descrizione === 'Retribuzione ordinaria'), true);
assert.equal(jet.record.voci.some(v => /FIS/i.test(v.descrizione) && v.trattenuta === 5.73), true);
assert.equal(jet.record.voci.some(v => v.codice === '1' && !v.descrizione), false);
assert.equal(jet.record.voci.some(v => v.competenza === 30 && !v.descrizione), false);
approx(jet.record.elementi.totale, 1692.69);
approx(jet.record.orario.oreOrdinarie, 153.41);
approx(jet.record.orario.giorniLavorati, 23);
approx(jet.record.orario.pagaOraria, 9.84122, 0.00001);
approx(jet.record.derivati.retribuzione.oraria, 9.84122, 0.00001);
approx(jet.record.totali.netto, 1769);
approx(jet.record.ratei.ferie.godutoAp, 31.7);
approx(jet.record.tfr.fondo3112, 1436.47);
approx(jet.record.derivati.ulterioreDetrazione, 82.19);
approx(jet.record.derivati.ritenuteIrpef, 144.89);
assert.equal(jet.record.meta.qualita.livello, 'alta');
assert.equal(jet.record.voci.find(v => v.codice === '0').meta.visual.page, 0);
assert.ok(jet.record.voci.find(v => v.codice === '0').meta.visual.bbox.w > 0);
assert.equal(jet.record.voci.every(v => v.meta && v.meta.visual && v.meta.visual.bbox), true, 'ogni voce estratta a coordinate deve rimandare alla sua sorgente');
assert.ok(jet.record.meta.reconciliation.score >= 70, JSON.stringify({ reconciliation: jet.record.meta.reconciliation, voices: jet.record.voci.map(v => ({ d:v.descrizione,b:v.base,q:v.rifQta,u:v.rifUnita,t:v.trattenuta,c:v.competenza })) }));

const fipe = Parser.trovaCcnl(jet.record, Data.CCNL_DB);
assert.equal(fipe.id, 'pubblici-esercizi-fipe');
assert.equal(Data.classificaVoce(jet.record.voci.find(v => v.codice === '0')).nome, 'Retribuzione ordinaria');
assert.equal(Data.classificaVoce(jet.record.voci.find(v => v.codice === '22')).nome, 'Maggiorazione per riposo settimanale spostato');
assert.equal(Data.classificaVoce(jet.record.voci.find(v => v.codice === '819')).nome, 'Addizionale comunale');
assert.equal(Data.classificaVoce({ descrizione: 'INPS CONTR.CIGS L.234/2021', trattenuta: 3.25 }).nome, 'Contributo CIGS');
assert.equal(Data.classificaVoce({ descrizione: 'Ind. turno', competenza: 50 }).nome, 'Indennità di turno');
assert.equal(Data.classificaVoce({ descrizione: 'Permesso L.104', competenza: 80 }).nome, 'Permesso tutelato');
assert.equal(Data.classificaVoce({ descrizione: 'Retnbuzione ordmana', competenza: 1500 }).nome, 'Retribuzione ordinaria', JSON.stringify({ match: Data.semanticVoiceMatch('Retnbuzione ordmana'), score: Data.semanticSimilarity('Retnbuzione ordmana', 'retribuzione ordinaria') }));
assert.equal(jet.record.voci.filter(v => /identificare|senza descrizione/i.test(Data.classificaVoce(v).nome)).length, 0);

const jetChecks = context.ChecksUnderTest(jet.record, fipe, []);
const holidayCheck = jetChecks.find(finding => /Lavoro festivo/.test(finding.titolo));
assert.equal(holidayCheck.livello, 'ok');
assert.match(holidayCheck.titolo, /20%/);
assert.doesNotMatch(holidayCheck.dettaglio, /SENZA maggiorazione/i);
const holidayAccrualCheck = jetChecks.find(finding => /Maturazione ferie|Ferie esposte in ore/.test(finding.titolo));
assert.match(holidayAccrualCheck.titolo, /ore\/anno/);
assert.doesNotMatch(holidayAccrualCheck.titolo, /gg\/anno/);

const roundedNet = Parser.quadraturaTotali({ competenze: 2145.48, trattenute: 376.45, arrotondamento: 0.36, netto: 1769 });
assert.equal(roundedNet.ok, true);
assert.equal(roundedNet.modalita, 'netto-arrotondato');
const paidHolidayOnly = Parser.derivaIndice({
  voci: [{ descrizione: "Festivita'", rifUnita: 'GIORNI', rifQta: 2, base: 65.10346, competenza: 130.21 }],
  orario: { pagaOraria: 9.84122 },
});
assert.equal(paidHolidayOnly.festivo, undefined, 'una festività retribuita a giorni non è una tariffa festiva oraria');

const zucchetti = Parser.parsePdfPages([
  page([
    [800, [[27, 'CodicesAzienda'], [86, 'RagionesSociale']]],
    [788, [[25, '000111'], [85, 'AZIENDA ESEMPIO S.R.L.']]],
    [750, [[433, 'PERIODOsDIsRETRIBUZIONE']]],
    [738, [[431, 'Giugno 2026']]],
    [716, [[31, 'Codicesdipendente'], [98, 'COGNOMEsEsNOME'], [448, 'CodicesFiscale']]],
    [704, [[29, '0000001'], [99, 'PERSONA DI ESEMPIO'], [449, 'RSSMRA80A01H501U']]],
    [688, [[77, 'DatasAssunzione'], [259, "4' Livello"]]],
    [676, [[77, '06-01-2025']]],
    [648, [[294, 'CNEL H052']]],
    [636, [[294, 'Alberghi Imprese Confcommercio']]],
    [620, [[75, 'PAGA BASE'], [155, 'SUP.ASS.']]],
    [608, [[107, '1.688,98000'], [196, '311,02000']]],
    [590, [[52, 'ELEMENTIsDELLAs RETRIBUZIONE'], [520, 'TOTALE']]],
    [578, [[525, '2.000,00000']]],
    [558, [[86, 'VOCIsVARIABILIsDELsMESE'], [251, 'IMPORTOsBASE'], [352, 'RIFERIMENTO'], [448, 'TRATTENUTE'], [518, 'COMPETENZE']]],
    [544, [[25, '* * Z00001 Retribuzione'], [281, '11,62791'], [364, '154,00000'], [404, 'ORE'], [537, '1.790,70']]],
    [530, [[25, 'F02000 Imponibile fiscale'], [281, '2.310,00']]],
    [516, [[25, 'F03020 Ritenute IRPEF'], [448, '300,00']]],
  ]),
  page([
    [800, [[27, 'CodicesAzienda'], [86, 'RagionesSociale']]],
    [788, [[25, '000111'], [85, 'AZIENDA ESEMPIO S.R.L.']]],
    [558, [[86, 'VOCIsVARIABILIsDELsMESE'], [251, 'IMPORTOsBASE'], [352, 'RIFERIMENTO'], [448, 'TRATTENUTE'], [518, 'COMPETENZE']]],
    [544, [[25, 'F09150 Rata trattamento integrativo'], [448, '10,68'], [537, '10,69']]],
    [526, [[69, 'Retribuzione utile T.F.R.'], [283, '2.731,02']]],
    [514, [[69, 'Quota T.F.R.'], [290, '188,64']]],
    [240, [[28, 'PROGRESSIVI'], [92, 'Imp. INPS'], [165, 'Imp. INAIL'], [240, 'Imp. IRPEF'], [308, 'IRPEF pagata']]],
    [226, [[94, '16.230,00'], [169, '16.230,00'], [245, '13.881,42'], [326, '1.618,53']]],
    [210, [[28, 'T.F.R.'], [67, 'F.do 31/12'], [166, 'Rivalutaz.'], [253, 'Imp.rival.'], [341, 'Quota anno']]],
    [196, [[74, '1.362,75'], [181, '36,27'], [271, '6,17'], [350, '1.121,03']]],
    [180, [[28, 'RATEI'], [423, 'TOTALEsCOMPETENZE'], [547, '2.858,03']]],
    [168, [[122, 'Residuo AP'], [188, 'Maturato'], [252, 'Goduto'], [317, 'Saldo']]],
    [156, [[30, 'Ferie'], [122, '9,45666'], [188, '13,00000'], [252, '13,20000'], [317, '9,25666'], [374, 'GG.']]],
    [144, [[30, 'Permessi'], [122, '39,78500'], [188, '52,00000'], [252, '37,00000'], [317, '54,78500'], [374, 'ORE'], [425, 'ARROTONDAMENTO'], [562, '0,63']]],
    [132, [[424, 'TOTALEsTRATTENUTE'], [553, '582,66']]],
    [120, [[487, 'NETTOsDELsMESE']]],
    [108, [[510, '2.276,00']]],
  ]),
]);

assert.equal(zucchetti.record.meta.software, 'Zucchetti');
assert.equal(zucchetti.record.azienda.nome, 'AZIENDA ESEMPIO S.R.L.');
assert.equal(zucchetti.record.dipendente.livello, '4');
assert.equal(zucchetti.record.ccnl.cnel, 'H052');
assert.equal(zucchetti.record.voci.some(v => v.codice === 'Z00001' && v.descrizione === 'Retribuzione'), true);
assert.equal(zucchetti.record.voci.some(v => v.codice === 'F09150'), true);
approx(zucchetti.record.tfr.retribUtile, 2731.02);
approx(zucchetti.record.tfr.quotaMese, 188.64);
approx(zucchetti.record.tfr.fondo3112, 1362.75);
approx(zucchetti.record.progressivi.impInps, 16230);
approx(zucchetti.record.progressivi.impIrpef, 13881.42);
approx(zucchetti.record.ratei.ferie.saldo, 9.25666);
approx(zucchetti.record.totali.netto, 2276);
assert.equal(zucchetti.record.meta.qualita.livello, 'alta');

const genericOcr = Parser.parseFreeText(`
CEDOLINO PAGA 06/2026
Codice fiscale RSSMRA80A01H501U
10 Indennità di turno 100,00
Contributo INPS 2.000,00 184,00
Totale competenze 2.100,00
Totale trattenute 500,00
Netto a pagare 1.600,00
`);
assert.equal(genericOcr.record.periodo.mese, 6);
assert.equal(genericOcr.record.voci.some(v => /Indennità di turno/i.test(v.descrizione)), true);
approx(genericOcr.record.totali.netto, 1600);

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/general-layouts.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) {
  const result = fixture.type === 'text'
    ? Parser.parseFreeText(fixture.text)
    : Parser.parsePdfPages(fixture.pages.map(rows => page(rows)));
  for (const [path, expected] of Object.entries(fixture.expected)) {
    const actual = getPath(result.record, path);
    if (typeof expected === 'number') approx(actual, expected, 0.02);
    else assert.equal(actual, expected, `${fixture.id}: ${path}`);
  }
}

const officialOnly = Parser.trovaCcnl({ ccnl: { cnel: 'T271' } }, Data.CCNL_DB);
assert.equal(officialOnly.id, 'cnel-t271');
assert.equal(officialOnly.officialOnly, true);
assert.match(officialOnly.nome, /FISM|infanzia|scuol/i);

const ccnlSuggestions = Parser.suggerisciCcnl({ ccnl: { descrizione: 'Pubblici esercizi e stabilimenti balneari' }, meta: { settore: 'privato-lul' } }, Data.CCNL_DB);
assert.equal(ccnlSuggestions[0].contract.id, 'pubblici-esercizi-fipe');
assert.match(ccnlSuggestions[0].reasons.join(' '), /denominazione|parole/i);

const thirteenth = Parser.parseFreeText('CEDOLINO TREDICESIMA MENSILITA\nDICEMBRE 2026\nTOTALE COMPETENZE 1.500,00\nTOTALE TRATTENUTE 300,00\nNETTO 1.200,00');
assert.equal(thirteenth.record.documento.tipo, 'tredicesima');

const sectorSamples = {
  'pubblico-noipa': 'NoiPA cedolino unico — competenze fisse',
  domestico: 'Lavoro domestico COLF — indennità vitto e alloggio',
  edilizia: 'Cassa Edile — accantonamento GNF',
  agricoltura: 'Operaio agricolo — giornate agricole',
  marittimo: 'Gente di mare — giorni imbarco e indennità di navigazione',
  'spettacolo-sportivo': 'Fondo pensione lavoratori spettacolo ex ENPALS',
  dirigenti: 'Qualifica dirigente — PREVINDAI e FASDAC',
  'cessazione-conguaglio': 'Fine rapporto — data cessazione e conguaglio fiscale',
};
for (const [sector, sample] of Object.entries(sectorSamples)) assert.equal(Sectors.parserSectorForText(sample).id, sector);
assert.ok(Sectors.parserSectorVoiceHints().length >= 30);

console.log('OK — parser multi-layout, riconciliazione, CCNL, OCR e 9 moduli di settore');
