#!/usr/bin/env node
/*
 * Genera l'indice compatto dei CCNL partendo dagli Open Data ufficiali CNEL.
 * Uso:
 *   node scripts/update-cnel.mjs
 *   node scripts/update-cnel.mjs --input percorso/al/file.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'src', 'cnel-index.js');
const SOURCE_URL = 'https://az-apim-cne-sa-0002-lgc-we.azure-api.net/ricerca-api/ricerca/pubblica/open-data?type=ARCHIVIO_CORRENTE';

const inputIndex = process.argv.indexOf('--input');
let raw;
if (inputIndex >= 0 && process.argv[inputIndex + 1]) {
  raw = await readFile(resolve(process.argv[inputIndex + 1]), 'utf8');
} else {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'BustaChiara-open-source/1.0',
      referer: 'https://www.cnel.it/archivio-contratti/contratti-open-data',
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`CNEL ha risposto ${response.status} ${response.statusText}`);
  raw = await response.text();
}

const payload = JSON.parse(raw);
if (!payload || !Array.isArray(payload.data)) throw new Error('Formato Open Data CNEL inatteso: manca data[].');

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const timestamp = row => Date.parse(row.dataStipula || row.dataDecorrenza || '1900-01-01') || 0;
const titleScore = row => {
  const title = clean(row.titolo);
  let score = timestamp(row) / 1e12;
  if (/\bCCNL\b|contratto collettivo nazionale/i.test(title)) score += 30;
  if (/rinnovo|ipotesi di accordo/i.test(title)) score += 10;
  if (/avviso comune|verbale di incontro|adeguamento dei minimi|covid|proroga/i.test(title)) score -= 25;
  if (row.dataScadenzaContrattuale) score += 4;
  return score;
};

const grouped = new Map();
for (const row of payload.data) {
  const code = clean(row.codiceCcnl).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2,4}$/.test(code)) continue;
  if (!grouped.has(code)) grouped.set(code, []);
  grouped.get(code).push(row);
}

const index = {};
for (const code of [...grouped.keys()].sort()) {
  const rows = grouped.get(code).sort((a, b) => titleScore(b) - titleScore(a));
  const chosen = rows[0];
  const sectors = [...new Set(rows.flatMap(row => row.settoriDescrizione || []).map(clean).filter(Boolean))].slice(0, 3);
  const aliases = [...new Set(rows.map(row => clean(row.titolo)).filter(Boolean))]
    .sort((a, b) => a.length - b.length)
    .slice(0, 4);
  index[code] = {
    n: clean(chosen.titolo) || `CCNL ${code}`,
    s: sectors,
    d: clean(chosen.dataDecorrenza),
    e: clean(chosen.dataScadenzaContrattuale),
    a: aliases,
  };
}

const generatedAt = new Date().toISOString().slice(0, 10);
const output = `/* Generato da scripts/update-cnel.mjs dagli Open Data CNEL (IODL 2.0).\n` +
  `   Aggiornato: ${generatedAt}. Non modificare a mano. */\n` +
  `const CNEL_INDEX_META = ${JSON.stringify({ generatedAt, source: SOURCE_URL, records: payload.data.length, codes: Object.keys(index).length })};\n` +
  `const CNEL_INDEX = ${JSON.stringify(index)};\n`;
await writeFile(OUTPUT, output, 'utf8');
console.log(`OK -> ${OUTPUT}: ${payload.data.length} record, ${Object.keys(index).length} codici CNEL`);
