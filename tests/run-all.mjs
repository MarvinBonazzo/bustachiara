#!/usr/bin/env node
/* Esegue in sequenza tutte le suite tests/*.test.mjs e si ferma al primo errore. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(DIR).filter((f) => f.endsWith('.test.mjs')).sort();

for (const suite of suites) {
  const { status } = spawnSync(process.execPath, [join(DIR, suite)], { stdio: 'inherit' });
  if (status !== 0) { console.error(`\nFALLITO → tests/${suite}`); process.exit(status ?? 1); }
}
console.log(`\nTutte le ${suites.length} suite superate.`);
