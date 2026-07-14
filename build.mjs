#!/usr/bin/env node
/* Assembla BustaChiara.html: un unico file autonomo e offline. */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const src = (f) => join(ROOT, 'src', f);
const vend = (f) => join(ROOT, 'vendor', f);

const jsSafe = (s) => s.replace(/<\/script/gi, '<\\/script');
const b64 = (f) => readFileSync(f).toString('base64');

let html = readFileSync(src('template.html'), 'utf8');

const parts = {
  '/*__CSS__*/': readFileSync(src('app.css'), 'utf8'),
  '/*__PDF_JS__*/': jsSafe(readFileSync(vend('pdf.min.js'), 'utf8')),
  '/*__TESS_JS__*/': jsSafe(readFileSync(vend('tesseract.min.js'), 'utf8')),
  '__PDF_WORKER_B64__': b64(vend('pdf.worker.min.js')),
  '__TESS_WORKER_B64__': b64(vend('tesseract-worker.min.js')),
  '__TESS_CORE_B64__': b64(vend('tesseract-core-simd-lstm.wasm.js')),
  '__ITA_B64__': b64(vend('ita.traineddata.gz')),
  '/*__DATA__*/': jsSafe(readFileSync(src('data.js'), 'utf8')),
  '/*__PARSER__*/': jsSafe(readFileSync(src('parser.js'), 'utf8')),
  '/*__CHECKS__*/': jsSafe(readFileSync(src('checks.js'), 'utf8')),
  '/*__UI__*/': jsSafe(readFileSync(src('ui.js'), 'utf8')),
};

for (const [token, content] of Object.entries(parts)) {
  const i = html.indexOf(token);
  if (i === -1) { console.error('Token mancante nel template:', token); process.exit(1); }
  html = html.slice(0, i) + content + html.slice(i + token.length);
}

const out = join(ROOT, 'BustaChiara.html');
writeFileSync(out, html);
console.log('OK →', out, (statSync(out).size / 1048576).toFixed(1), 'MB');

// Versione PWA: stessa app come index.html accanto a manifest, sw.js e icone.
// La cartella pwa/ è pronta da pubblicare così com'è (es. GitHub Pages).
writeFileSync(join(ROOT, 'pwa', 'index.html'), html);
console.log('OK →', join(ROOT, 'pwa', 'index.html'), '(PWA)');
