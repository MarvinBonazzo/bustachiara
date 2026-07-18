import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const context = vm.createContext({ console });
vm.runInContext(
  readFileSync(new URL('../src/data.js', import.meta.url), 'utf8')
    + '\nthis.DataExplanationsUnderTest = { FONTI, FISCO, VOCI_CODICI, VOCI_PATTERN, completaSpiegazioneVoce, classificaVoce };',
  context,
);

const Data = context.DataExplanationsUnderTest;
const samples = [
  { voce: { codice: 'Z00001', descrizione: 'Retribuzione ordinaria', competenza: 1200 }, nome: 'Retribuzione ordinaria' },
  { voce: { codice: 'F09110', descrizione: 'Addizionale regionale', trattenuta: 35 }, nome: 'Addizionale regionale (a rate)' },
  { voce: { descrizione: 'Addizionale comunale saldo 2025', trattenuta: 20 }, nome: 'Addizionale comunale' },
  { voce: { descrizione: 'INPS IVS', trattenuta: 180 }, nome: 'Contributi INPS (IVS)' },
  { voce: { descrizione: 'Fondo integrazione salariale', trattenuta: 4 }, nome: 'Contributo FIS' },
  { voce: { descrizione: 'T.F.R. quota anno', rifQta: 100 }, nome: 'TFR' },
  { voce: { descrizione: 'Causale aziendale X91', competenza: 22 }, nome: 'Competenza aziendale' },
  { voce: { descrizione: '', rifQta: 3 }, nome: 'Riga senza descrizione' },
  { voce: { descrizione: 'Addizionale regionale IRPEF saldo 2025', trattenuta: 18 }, nome: 'Addizionale regionale' },
  { voce: { descrizione: 'Addizionale comunale IRPEF acconto', trattenuta: 7 }, nome: 'Addizionale comunale' },
  { voce: { descrizione: 'Carenza malattia c/ditta', competenza: 90 }, nome: 'Carenza malattia' },
  { voce: { descrizione: 'Imponibile IRPEF del mese', rifQta: 1500 }, nome: 'Imponibile IRPEF' },
  { voce: { descrizione: 'IRPEF lorda', rifQta: 310 }, nome: 'IRPEF lorda' },
  { voce: { descrizione: 'Detrazioni IRPEF lavoro dipendente', rifQta: 120 }, nome: 'Detrazioni' },
  { voce: { descrizione: 'Bonus IRPEF trattamento integrativo', competenza: 100 }, nome: 'Trattamento integrativo' },
];

for (const sample of samples) {
  const info = Data.classificaVoce(sample.voce);
  assert.equal(info.nome, sample.nome);
  assert.match(info.cosa, /Perché (?:compare|esiste):/i, `${sample.nome} deve spiegare anche perché la riga compare`);
}

const wholeDictionary = [...Object.values(Data.VOCI_CODICI), ...Data.VOCI_PATTERN];
for (const entry of wholeDictionary) {
  const complete = Data.completaSpiegazioneVoce(entry);
  assert.match(complete.cosa, /Perché (?:compare|esiste):/i, `${entry.nome} non spiega perché esiste`);
}

assert.deepEqual(Array.from(Data.classificaVoce(samples[1].voce).fonti), ['finanze']);
assert.deepEqual(Array.from(Data.classificaVoce(samples[2].voce).fonti), ['finanzeComune']);
assert.deepEqual(Array.from(Data.classificaVoce(samples[3].voce).fonti), ['inpsEstratto']);
assert.deepEqual(Array.from(Data.classificaVoce(samples[4].voce).fonti), ['inpsFis']);

const directSources = ['cnel', 'inps', 'inpsEstratto', 'inpsFis', 'inpsTfr', 'inpsMalattia', 'inpsCongedi', 'ade', 'adeLavoro', 'bilancio2026', 'finanze', 'finanzeComune', 'inl', 'inail', 'istat'];
for (const id of directSources) {
  assert.ok(Data.FONTI[id], `fonte ${id} mancante`);
  assert.match(Data.FONTI[id].url, /^https:\/\//, `fonte ${id} non HTTPS`);
  assert.ok(new URL(Data.FONTI[id].url).pathname.length > 1, `fonte ${id} troppo generica`);
}

assert.match(Data.FONTI.finanze.url, /addregirpef\/download\/tabella\.htm$/);
assert.match(Data.FONTI.finanzeComune.url, /nuova_addcomirpef\/download\/tabella\.htm$/);
assert.equal(Data.FISCO[2026].impSostRinnovi.sogliaReddito, 33000);

const premio = Data.classificaVoce({ descrizione: 'Premio di risultato', competenza: 1000 });
assert.match(premio.cosa, /2026 e 2027/);
assert.match(premio.cosa, /1%/);
assert.match(premio.cosa, /5\.000/);

const pasto = Data.classificaVoce({ descrizione: 'Buoni pasto elettronici', competenza: 200 });
assert.match(pasto.cosa, /4 €/);
assert.match(pasto.cosa, /10 €/);
assert.doesNotMatch(pasto.cosa, /8 €/);

console.log(`OK — ${wholeDictionary.length} voci spiegate e ${directSources.length} fonti operative specifiche`);
