import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { console, URL };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../src/ai-ocr.js', import.meta.url), 'utf8') + '\nthis.AiOcrUnderTest = AiOcr;', context);
const AiOcr = context.AiOcrUnderTest;

assert.equal(AiOcr.shouldUseSpecialist({ words: Array.from({ length: 60 }, (_, index) => ({ text: `v${index}`, confidence: 92 })) }), false);
assert.equal(AiOcr.shouldUseSpecialist({ words: Array.from({ length: 60 }, (_, index) => ({ text: `v${index}`, confidence: index < 20 ? 40 : 90 })) }), true);
assert.equal(AiOcr.shouldUseSpecialist({ words: [{ text: 'NETTO', confidence: 99 }] }), true);

const probabilities = new Float32Array(24 * 8);
for (let y = 2; y <= 5; y++) for (let x = 1; x <= 5; x++) probabilities[y * 24 + x] = 0.91;
for (let y = 1; y <= 4; y++) for (let x = 18; x <= 22; x++) probabilities[y * 24 + x] = 0.87;
const boxes = AiOcr._test.extractTextBoxes(probabilities, 24, 8, 240, 80);
assert.equal(boxes.length, 2);
assert.ok(boxes[0].x1 <= boxes[1].x0, JSON.stringify(boxes));
assert.ok(boxes.every(box => box.x0 >= 0 && box.y0 >= 0 && box.x1 <= 240 && box.y1 <= 80));

const ctcValues = new Float32Array([
  .01, .95, .02, .02,
  .01, .96, .02, .01,
  .97, .01, .01, .01,
  .01, .02, .94, .03,
]);
const decoded = AiOcr._test.decodeCtc(ctcValues, [1, 4, 4], ['a', 'b']);
assert.equal(decoded.text, 'ab');
assert.ok(Math.abs(decoded.confidence - 0.945) < 1e-6);
const lineWords = AiOcr._test.splitRecognizedLine('NETTO 1.234,56', { x0: 10, y0: 20, x1: 160, y1: 40 }, .9);
assert.deepEqual(Array.from(lineWords, word => word.text), ['NETTO', '1.234,56']);
assert.ok(lineWords[0].bbox.x1 < lineWords[1].bbox.x0);

const lowConfidenceTesseract = {
  words: [{ text: 'NE7TO', confidence: 42, bbox: { x0: 10, y0: 10, x1: 60, y1: 25 } }],
  text: 'NE7TO',
};
const specialist = {
  words: [
    { text: 'NETTO', confidence: 91, bbox: { x0: 10, y0: 10, x1: 60, y1: 25 } },
    { text: '1.234,56', confidence: 88, bbox: { x0: 80, y0: 10, x1: 145, y1: 25 } },
  ],
};
const merged = AiOcr.mergeSpecialist(lowConfidenceTesseract, specialist);
assert.deepEqual(Array.from(merged.words, word => word.text), ['NE7TO', '1.234,56']);
assert.equal(merged._specialistUsed, true);
assert.equal(merged._specialistAlternatives.length, 1);
assert.equal(merged._specialistAlternatives[0].candidate.text, 'NETTO');
const sameText = AiOcr.mergeSpecialist(
  { words: [{ text: 'NETTO', confidence: 42, bbox: { x0: 10, y0: 10, x1: 60, y1: 25 } }] },
  { words: [{ text: 'netto', confidence: 91, bbox: { x0: 10, y0: 10, x1: 60, y1: 25 } }] },
);
assert.equal(sameText.words[0].confidence, 91, 'la stessa parola può ricevere la geometria/confidenza migliore');

const hashes = {
  'ppocrv5-mobile-det.onnx': 'c8d9b07063420ce5365c74e42532de48238feeeedcdb7a330b195708bc38a93f',
  'ppocrv5-latin-rec.onnx': '20e6127d910ef10be0d0fe4a49e68d2474b07e83f57600cdd177b3edb561d194',
  'ppocrv5-latin-chars.json': '4ffbe0f87d09bf61bb2360a1529a25762544cc7cdf21a1b40994332e1331e00c',
  'ort.wasm.min.js': 'ea3a767b15df7dbe3d695ec9c182ca0f15b2ce7750156c6b70276e11c28997f0',
  'ort-wasm-simd-threaded.mjs': '0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3',
  'ort-wasm-simd-threaded.wasm': 'd1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6',
};
for (const [file, expected] of Object.entries(hashes)) {
  const contents = readFileSync(new URL(`../pwa/ai/${file}`, import.meta.url));
  assert.equal(createHash('sha256').update(contents).digest('hex'), expected, `${file}: hash inatteso`);
}

console.log('Test OCR AI locale: OK');
