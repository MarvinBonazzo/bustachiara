/*
 * Secondo OCR locale, caricato solo quando Tesseract resta poco affidabile.
 *
 * PP-OCRv5 e ONNX Runtime vengono richiesti esclusivamente da ./ai/ sullo stesso
 * dominio della PWA. Nessuna immagine, parola o metadato viene inviato in rete.
 * Se gli asset non sono disponibili (per esempio al primo uso senza rete), il
 * chiamante conserva senza errori il risultato Tesseract.
 */
const AiOcr = (() => {
  'use strict';

  const FILES = Object.freeze({
    runtime: 'ort.wasm.min.js',
    detector: 'ppocrv5-mobile-det.onnx',
    recognizer: 'ppocrv5-latin-rec.onnx',
    characters: 'ppocrv5-latin-chars.json',
  });
  const DETECTOR_LONG_SIDE = 960;
  const DETECTOR_THRESHOLD = 0.30;
  const DETECTOR_BOX_THRESHOLD = 0.55;
  // Un cedolino fitto può superare 200 celle testuali; il limite protegge da
  // immagini patologiche senza troncare i layout reali osservati nei test.
  const MAX_TEXT_BOXES = 260;
  const state = { initPromise: null, detector: null, recognizer: null, characters: null, disabled: false };

  function assetBase() {
    if (typeof document === 'undefined' || !document.baseURI) throw new Error('documento non disponibile');
    return new URL('./ai/', document.baseURI).href;
  }

  function assetUrl(name) { return new URL(name, assetBase()).href; }

  function appendLocalScript(url) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === url);
      if (existing) {
        if (globalThis.ort) return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('runtime OCR locale non disponibile')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.bustachiaraLocalAi = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('runtime OCR locale non disponibile'));
      document.head.appendChild(script);
    });
  }

  async function initialize() {
    if (state.detector && state.recognizer && state.characters) return state;
    if (state.disabled) throw new Error('OCR locale disattivato per questa sessione');
    if (!state.initPromise) state.initPromise = (async () => {
      if (!globalThis.ort) await appendLocalScript(assetUrl(FILES.runtime));
      if (!globalThis.ort || !ort.InferenceSession || !ort.Tensor) throw new Error('ONNX Runtime non inizializzato');

      // Un solo thread evita i requisiti cross-origin-isolation e funziona anche su iOS.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = assetBase();

      const charsResponse = await fetch(assetUrl(FILES.characters), { cache: 'force-cache', credentials: 'same-origin' });
      if (!charsResponse.ok) throw new Error(`alfabeto OCR non disponibile (${charsResponse.status})`);
      const characters = await charsResponse.json();
      if (!Array.isArray(characters) || characters.length !== 836) throw new Error('alfabeto OCR non valido');

      const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const detector = await ort.InferenceSession.create(assetUrl(FILES.detector), options);
      const recognizer = await ort.InferenceSession.create(assetUrl(FILES.recognizer), options);
      state.detector = detector;
      state.recognizer = recognizer;
      state.characters = characters;
      return state;
    })().catch(error => {
      state.disabled = true;
      state.initPromise = null;
      console.info('BustaChiara: secondo OCR locale non disponibile; continuo con Tesseract.', error && error.message ? error.message : error);
      throw error;
    });
    return state.initPromise;
  }

  function createCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function canvasContext(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas 2D non disponibile');
    return context;
  }

  function detectorInput(source) {
    const originalWidth = Math.max(1, source.width || source.videoWidth || 1);
    const originalHeight = Math.max(1, source.height || source.videoHeight || 1);
    const scale = Math.min(1, DETECTOR_LONG_SIDE / Math.max(originalWidth, originalHeight));
    const width = Math.max(32, Math.round((originalWidth * scale) / 32) * 32);
    const height = Math.max(32, Math.round((originalHeight * scale) / 32) * 32);
    const canvas = createCanvas(width, height);
    const context = canvasContext(canvas);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const plane = width * height;
    const tensor = new Float32Array(plane * 3);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    for (let i = 0, pixel = 0; pixel < plane; pixel++, i += 4) {
      // I modelli Paddle dichiarano DecodeImage in BGR.
      tensor[pixel] = (pixels[i + 2] / 255 - mean[0]) / std[0];
      tensor[plane + pixel] = (pixels[i + 1] / 255 - mean[1]) / std[1];
      tensor[plane * 2 + pixel] = (pixels[i] / 255 - mean[2]) / std[2];
    }
    return { data: tensor, dims: [1, 3, height, width], width, height, originalWidth, originalHeight };
  }

  function verticalOverlap(a, b) {
    const overlap = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return overlap / Math.max(1, Math.min(a.y1 - a.y0, b.y1 - b.y0));
  }

  function mergeAdjacentBoxes(boxes) {
    const sorted = boxes.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const merged = [];
    for (const box of sorted) {
      const previous = merged[merged.length - 1];
      const previousHeight = previous ? previous.y1 - previous.y0 : 0;
      const boxHeight = box.y1 - box.y0;
      const gap = previous ? box.x0 - previous.x1 : Infinity;
      const sameLine = previous && verticalOverlap(previous, box) >= 0.58
        && gap >= -Math.min(previousHeight, boxHeight) * 0.15
        && gap <= Math.max(4, Math.min(previousHeight, boxHeight) * 0.72);
      if (sameLine) {
        previous.x0 = Math.min(previous.x0, box.x0);
        previous.y0 = Math.min(previous.y0, box.y0);
        previous.x1 = Math.max(previous.x1, box.x1);
        previous.y1 = Math.max(previous.y1, box.y1);
        previous.score = Math.max(previous.score, box.score);
      } else merged.push({ ...box });
    }
    return merged;
  }

  /* Post-processing DB essenziale e prudente: componenti connesse, soglia di
     confidenza, espansione del riquadro e fusione dei frammenti sulla stessa riga. */
  function extractTextBoxes(probabilities, width, height, originalWidth = width, originalHeight = height) {
    const size = width * height;
    if (!probabilities || probabilities.length < size || !width || !height) return [];
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    const candidates = [];

    for (let start = 0; start < size; start++) {
      if (visited[start] || probabilities[start] < DETECTOR_THRESHOLD) continue;
      visited[start] = 1;
      let head = 0, tail = 1;
      queue[0] = start;
      let minX = width, minY = height, maxX = 0, maxY = 0, count = 0, confidence = 0;
      while (head < tail) {
        const index = queue[head++];
        const y = Math.floor(index / width), x = index - y * width;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        confidence += probabilities[index]; count++;
        const push = neighbour => {
          if (!visited[neighbour] && probabilities[neighbour] >= DETECTOR_THRESHOLD) {
            visited[neighbour] = 1;
            queue[tail++] = neighbour;
          }
        };
        if (x > 0) push(index - 1);
        if (x + 1 < width) push(index + 1);
        if (y > 0) push(index - width);
        if (y + 1 < height) push(index + width);
      }
      const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
      const score = confidence / Math.max(1, count);
      if (count < 10 || boxWidth < 3 || boxHeight < 3 || score < DETECTOR_BOX_THRESHOLD) continue;
      const padX = Math.max(2, Math.round(boxWidth * 0.08));
      const padY = Math.max(2, Math.round(boxHeight * 0.18));
      candidates.push({
        x0: Math.max(0, minX - padX), y0: Math.max(0, minY - padY),
        x1: Math.min(width, maxX + 1 + padX), y1: Math.min(height, maxY + 1 + padY), score,
      });
    }

    const sx = originalWidth / width, sy = originalHeight / height;
    return mergeAdjacentBoxes(candidates)
      .sort((a, b) => b.score - a.score || ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0)))
      .slice(0, MAX_TEXT_BOXES)
      .map(box => ({
        x0: Math.max(0, box.x0 * sx), y0: Math.max(0, box.y0 * sy),
        x1: Math.min(originalWidth, box.x1 * sx), y1: Math.min(originalHeight, box.y1 * sy),
        score: box.score,
      }))
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  }

  function recognitionInput(source, box) {
    const sourceWidth = Math.max(1, source.width || source.videoWidth || 1);
    const sourceHeight = Math.max(1, source.height || source.videoHeight || 1);
    const x = Math.max(0, Math.floor(box.x0)), y = Math.max(0, Math.floor(box.y0));
    const cropWidth = Math.max(1, Math.min(sourceWidth - x, Math.ceil(box.x1) - x));
    const cropHeight = Math.max(1, Math.min(sourceHeight - y, Math.ceil(box.y1) - y));
    const resizedWidth = Math.max(8, Math.min(1280, Math.ceil((cropWidth / cropHeight) * 48)));
    const tensorWidth = Math.max(320, Math.min(1280, Math.ceil(resizedWidth / 32) * 32));
    const canvas = createCanvas(resizedWidth, 48);
    const context = canvasContext(canvas);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, resizedWidth, 48);
    context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, resizedWidth, 48);
    const pixels = context.getImageData(0, 0, resizedWidth, 48).data;
    const plane = tensorWidth * 48;
    const tensor = new Float32Array(plane * 3); // lo zero è il padding previsto dal modello
    for (let yy = 0; yy < 48; yy++) {
      for (let xx = 0; xx < resizedWidth; xx++) {
        const sourceIndex = (yy * resizedWidth + xx) * 4;
        const targetIndex = yy * tensorWidth + xx;
        tensor[targetIndex] = pixels[sourceIndex + 2] / 127.5 - 1;
        tensor[plane + targetIndex] = pixels[sourceIndex + 1] / 127.5 - 1;
        tensor[plane * 2 + targetIndex] = pixels[sourceIndex] / 127.5 - 1;
      }
    }
    return { data: tensor, dims: [1, 3, 48, tensorWidth], width: tensorWidth };
  }

  function decodeCtc(values, dims, characters, batchIndex = 0) {
    if (!values || !Array.isArray(dims) || dims.length !== 3) return { text: '', confidence: 0 };
    const batches = dims[0], timesteps = dims[1], classes = dims[2];
    if (batchIndex < 0 || batchIndex >= batches || classes !== characters.length + 2) return { text: '', confidence: 0 };
    const offset = batchIndex * timesteps * classes;
    let previous = -1, text = '', confidenceSum = 0, confidenceCount = 0;
    for (let timestep = 0; timestep < timesteps; timestep++) {
      const row = offset + timestep * classes;
      let bestIndex = 0, bestValue = -Infinity, sum = 0;
      for (let klass = 0; klass < classes; klass++) {
        const value = values[row + klass];
        if (value > bestValue) { bestValue = value; bestIndex = klass; }
        sum += value;
      }
      let probability = bestValue;
      if (bestValue < 0 || bestValue > 1 || sum < 0.85 || sum > 1.15) {
        let expSum = 0;
        for (let klass = 0; klass < classes; klass++) expSum += Math.exp(values[row + klass] - bestValue);
        probability = 1 / Math.max(1, expSum);
      }
      if (bestIndex !== 0 && bestIndex !== previous) {
        const character = bestIndex === characters.length + 1 ? ' ' : characters[bestIndex - 1];
        if (character != null) {
          text += character;
          confidenceSum += probability;
          confidenceCount++;
        }
      }
      previous = bestIndex;
    }
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      confidence: confidenceCount ? confidenceSum / confidenceCount : 0,
    };
  }

  function splitRecognizedLine(text, bbox, confidence) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    const matches = [...cleaned.matchAll(/\S+/g)];
    const width = Math.max(1, bbox.x1 - bbox.x0);
    return matches.map(match => ({
      text: match[0],
      confidence: Math.max(0, Math.min(100, confidence * 100)),
      bbox: {
        x0: bbox.x0 + (match.index / cleaned.length) * width,
        y0: bbox.y0,
        x1: bbox.x0 + ((match.index + match[0].length) / cleaned.length) * width,
        y1: bbox.y1,
      },
    }));
  }

  async function recognizeBoxes(source, boxes, engine, status) {
    const groups = new Map();
    for (const box of boxes) {
      const input = recognitionInput(source, box);
      if (!groups.has(input.width)) groups.set(input.width, []);
      groups.get(input.width).push({ box, input });
    }
    const words = [];
    let completed = 0;
    for (const [width, entries] of groups) {
      for (let start = 0; start < entries.length; start += 8) {
        const batch = entries.slice(start, start + 8);
        const itemLength = 3 * 48 * width;
        const values = new Float32Array(itemLength * batch.length);
        batch.forEach((entry, index) => values.set(entry.input.data, itemLength * index));
        const tensor = new ort.Tensor('float32', values, [batch.length, 3, 48, width]);
        const outputMap = await engine.recognizer.run({ [engine.recognizer.inputNames[0]]: tensor });
        const output = outputMap[engine.recognizer.outputNames[0]];
        batch.forEach((entry, index) => {
          const decoded = decodeCtc(output.data, output.dims, engine.characters, index);
          if (decoded.text && decoded.confidence >= 0.42) words.push(...splitRecognizedLine(decoded.text, entry.box, decoded.confidence));
        });
        completed += batch.length;
        status && status('secondo motore locale: riconosco le righe…', completed / Math.max(1, boxes.length));
      }
    }
    return words;
  }

  function ocrMetrics(data) {
    const words = (data && data.words || []).filter(word => word && String(word.text || '').trim());
    const confidences = words.map(word => Number(word.confidence)).filter(Number.isFinite);
    const mean = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;
    const weakRatio = confidences.length ? confidences.filter(value => value < 60).length / confidences.length : 1;
    return { count: words.length, mean, weakRatio };
  }

  function shouldUseSpecialist(data) {
    const metrics = ocrMetrics(data);
    return metrics.count < 45 || metrics.mean < 76 || metrics.weakRatio > 0.25;
  }

  function normalizedToken(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function overlapRatio(a, b) {
    if (!a || !b) return 0;
    const intersection = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
      * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const areaA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
    const areaB = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    return intersection / Math.min(areaA, areaB);
  }

  function mergeSpecialist(base, specialist) {
    const words = [...(base && base.words || [])];
    const alternatives = [];
    for (const candidate of specialist && specialist.words || []) {
      if (!candidate.text || !candidate.bbox || candidate.confidence < 55 || candidate.text.length > 80) continue;
      let bestIndex = -1, bestOverlap = 0;
      for (let index = 0; index < words.length; index++) {
        const overlap = overlapRatio(words[index].bbox, candidate.bbox);
        if (overlap > bestOverlap) { bestOverlap = overlap; bestIndex = index; }
      }
      if (bestIndex >= 0 && bestOverlap >= 0.32) {
        const existing = words[bestIndex];
        const same = normalizedToken(existing.text) === normalizedToken(candidate.text);
        // Le confidenze dei due motori non sono calibrate sulla stessa scala:
        // un punteggio Paddle più alto non autorizza a cambiare una parola
        // diversa. Il candidato resta disponibile per diagnostica/verifica.
        if (same && candidate.confidence > (existing.confidence || 0)) words[bestIndex] = candidate;
        else if (!same) alternatives.push({ existing, candidate, overlap: bestOverlap });
      } else if (candidate.confidence >= 68) words.push(candidate);
    }
    words.sort((a, b) => ((a.bbox && a.bbox.y0) || 0) - ((b.bbox && b.bbox.y0) || 0)
      || ((a.bbox && a.bbox.x0) || 0) - ((b.bbox && b.bbox.x0) || 0));
    return Object.assign({}, base, {
      words,
      text: words.map(word => word.text).join(' '),
      _specialistUsed: Boolean(specialist && specialist.words && specialist.words.length),
      _specialistAlternatives: alternatives,
    });
  }

  async function recognize(source, status) {
    const engine = await initialize();
    status && status('secondo motore locale: individuo le righe…', 0.02);
    const input = detectorInput(source);
    const tensor = new ort.Tensor('float32', input.data, input.dims);
    const outputMap = await engine.detector.run({ [engine.detector.inputNames[0]]: tensor });
    const output = outputMap[engine.detector.outputNames[0]];
    const dims = output.dims || [];
    const mapHeight = dims[dims.length - 2], mapWidth = dims[dims.length - 1];
    const boxes = extractTextBoxes(output.data, mapWidth, mapHeight, input.originalWidth, input.originalHeight);
    if (!boxes.length) return { text: '', words: [] };
    const words = await recognizeBoxes(source, boxes, engine, status);
    return { text: words.map(word => word.text).join(' '), words };
  }

  return {
    recognize,
    shouldUseSpecialist,
    mergeSpecialist,
    // Funzioni pure mantenute visibili per i test di regressione, non usate dalla UI.
    _test: { decodeCtc, extractTextBoxes, mergeAdjacentBoxes, splitRecognizedLine, ocrMetrics, overlapRatio },
  };
})();
