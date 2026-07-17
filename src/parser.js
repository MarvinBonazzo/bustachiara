// BustaChiara — parser multi-layout per cedolini italiani.
// Lavora su testo e coordinate pdf.js. Ogni risultato resta da confermare.

const MESI_IT = { gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6, luglio:7, agosto:8, settembre:9, ottobre:10, novembre:11, dicembre:12 };
const MONTH_RE = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const NUM_TOKEN_RE = /^\(?\s*[+\-−]?\s*(?:\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,5})?|\d+(?:[,.]\d{1,5})?)\s*\)?\s*€?$/;
const NUM_ANY_RE = /[+\-−]?\s*(?:\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,5})?|\d+(?:[,.]\d{1,5})?)/g;
const CODE_TOKEN_RE = /^(?=.{1,12}$)(?=.*\d)[A-Z0-9][A-Z0-9./_-]*$/i;
const UNIT_RE = /^(?:ORE?|H|GG\.?|GIORNI?|NR\.?|N|%|PERC\.?|MESI?|RATEI?|SETT\.?|EURO|€)$/i;
// L'archivio ufficiale corrente usa codici di quattro caratteri: una lettera
// iniziale, tre caratteri alfanumerici e almeno una cifra. L'ultimo vincolo
// evita falsi positivi come la parola "CCNL" accanto all'etichetta CNEL.
const CNEL_CODE_RE = /^(?=[A-Z0-9]{4}$)(?=.*\d)[A-Z][A-Z0-9]{3}$/;
const CELL_SPAN_CACHE = new WeakMap();

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, key) => value == null ? value : value[key], object);
}

function setPathValue(object, path, value) {
  const keys = String(path).split('.');
  let current = object;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function addCandidate(rec, path, value, evidence = {}) {
  if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return;
  rec.meta.candidates = rec.meta.candidates || {};
  const list = rec.meta.candidates[path] || (rec.meta.candidates[path] = []);
  const normalized = typeof value === 'number' ? Number(value.toFixed(5)) : String(value).trim();
  const existing = list.find(candidate => candidate.value === normalized);
  const item = {
    value: normalized,
    confidence: Math.max(0, Math.min(1, Number(evidence.confidence) || 0.5)),
    source: evidence.source || rec.meta.fonte || 'parser',
    method: evidence.method || 'euristica',
    label: evidence.label || '',
    page: evidence.page == null ? null : evidence.page,
    bbox: evidence.bbox || null,
    snippet: evidence.snippet || '',
  };
  if (!existing) list.push(item);
  else if (item.confidence > existing.confidence) Object.assign(existing, item);
}

function markField(rec, path, evidence = {}) {
  rec.meta.fields = rec.meta.fields || {};
  const current = rec.meta.fields[path];
  const next = {
    confidence: Math.max(0, Math.min(1, Number(evidence.confidence) || 0.5)),
    source: evidence.source || rec.meta.fonte || 'parser',
    method: evidence.method || 'euristica',
    label: evidence.label || '',
    inferred: !!evidence.inferred,
    page: evidence.page == null ? (current && current.page != null ? current.page : null) : evidence.page,
    bbox: evidence.bbox || (current && current.bbox) || null,
    snippet: evidence.snippet || (current && current.snippet) || '',
    visualTarget: evidence.visualTarget || (current && current.visualTarget) || null,
    confirmed: !!evidence.confirmed,
  };
  if (!current || next.confidence >= current.confidence) rec.meta.fields[path] = next;
  else if ((next.bbox || next.snippet) && !current.bbox) Object.assign(current, {
    page: next.page, bbox: next.bbox, snippet: next.snippet,
  });
}

function itNum(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\u00a0/g, ' ').replace(/−/g, '-');
  if (!NUM_TOKEN_RE.test(s)) return null;
  const negative = /^\s*\(/.test(s) || /-/.test(s);
  s = s.replace(/[()€+\-\s]/g, '');
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  let normalized;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    normalized = s.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3)) normalized = parts.join('');
    else normalized = s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}

function fmtEur(v, dec = 2) {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Alcuni PDF Zucchetti estraggono gli spazi come una "s" minuscola.
function normalizzaTesto(value) {
  return String(value || '')
    .replace(/([A-Za-zÀ-ù])s(?=[A-ZÀ-ÖØ-Þ])/g, '$1 ')
    .replace(/[_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCnelCode(value) {
  const text = normalizzaTesto(value).toUpperCase();
  const labels = [...text.matchAll(/\b(?:CODICE\s*)?CNEL\b/g)];
  for (const label of labels) {
    // Nei cedolini a colonne il codice può essere nella riga successiva e
    // l'intestazione può proseguire con la parola CCNL. Cerchiamo quindi una
    // finestra breve e scartiamo ogni token che non ha il formato ufficiale.
    const afterLabel = text.slice(label.index + label[0].length, label.index + label[0].length + 140);
    const candidates = afterLabel.match(/\b[A-Z][A-Z0-9]{3}\b/g) || [];
    const code = candidates.find(candidate => CNEL_CODE_RE.test(candidate));
    if (code) return code;
  }
  return null;
}

function plain(value) {
  return normalizzaTesto(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function L(...words) {
  const source = words.map(word => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.s]{0,3}');
  return new RegExp(source, 'i');
}

function buildLines(items, tol = 3.5) {
  const rows = [];
  for (const item of items || []) {
    const str = String(item.str || '').trim();
    if (!str) continue;
    let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= tol);
    if (!row) {
      row = { y: item.y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x: Number(item.x) || 0, y: Number(item.y) || 0, w: Number(item.w) || 0, h: Math.abs(Number(item.h) || 10), str });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) {
    row.cells.sort((a, b) => a.x - b.x);
    row.text = row.cells.map(cell => cell.str).join(' ');
    row.normalized = normalizzaTesto(row.text);
    row.plain = plain(row.text);
  }
  return rows;
}

function lineBBox(line) {
  const cells = line && line.cells || [];
  if (!cells.length) return null;
  const x = Math.min(...cells.map(cell => cell.x));
  const right = Math.max(...cells.map(cell => cell.x + (cell.w || 0)));
  const h = Math.max(8, ...cells.map(cell => cell.h || 0));
  return { x, y: line.y - h * .25, w: Math.max(6, right - x), h: h * 1.45 };
}

function visualEvidence(line) {
  return line ? { page: line.page == null ? null : line.page, bbox: lineBBox(line), snippet: normalizzaTesto(line.text).slice(0, 180) } : {};
}

function cellsBBox(cells) {
  if (!cells || !cells.length) return null;
  const x = Math.min(...cells.map(cell => cell.x));
  const right = Math.max(...cells.map(cell => cell.x + (cell.w || 0)));
  const bottom = Math.min(...cells.map(cell => cell.y - Math.max(6, cell.h || 0) * .28));
  const top = Math.max(...cells.map(cell => cell.y + Math.max(6, cell.h || 0) * 1.14));
  return { x, y: bottom, w: Math.max(6, right - x), h: Math.max(8, top - bottom) };
}

function spanForCells(line, cells, quality = 1) {
  return {
    line,
    cells,
    bbox: cellsBBox(cells),
    text: normalizzaTesto(cells.map(cell => cell.str).join(' ')),
    quality,
  };
}

function contiguousCellSpans(line, maxCells = 8) {
  if (maxCells === 8 && line && CELL_SPAN_CACHE.has(line)) return CELL_SPAN_CACHE.get(line);
  const cells = line && line.cells || [];
  const spans = [];
  for (let start = 0; start < cells.length; start++) {
    for (let end = start; end < Math.min(cells.length, start + maxCells); end++) {
      const selected = cells.slice(start, end + 1);
      const bbox = cellsBBox(selected);
      if (bbox && bbox.w > 380) break;
      spans.push(spanForCells(line, selected));
    }
  }
  if (maxCells === 8 && line) CELL_SPAN_CACHE.set(line, spans);
  return spans;
}

function sameNumber(a, b) {
  if (a == null || b == null || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Math.abs(Number(a) - Number(b)) <= Math.max(.00001, Math.abs(Number(b)) * .000001);
}

function numericTokens(value) {
  const matches = String(value || '').match(new RegExp(NUM_ANY_RE.source, 'g')) || [];
  return matches.map(itNum).filter(number => number != null);
}

function fieldValueMatch(path, value, candidate) {
  const text = normalizzaTesto(candidate);
  const normalized = plain(text);
  if (!text) return 0;

  if (path === 'periodo.mese') {
    const month = Object.entries(MESI_IT).find(([, number]) => number === Number(value));
    if (month && new RegExp(`\\b${month[0]}\\b`, 'i').test(text)) return .99;
    const number = String(Number(value));
    if (new RegExp(`(?:^|\\D)0?${number}(?:[\\/.-]\\d{2,4}|\\D|$)`).test(text)) return .9;
    return 0;
  }
  if (path === 'periodo.anno') {
    return new RegExp(`(?:^|\\D)${String(value)}(?:\\D|$)`).test(text) ? .97 : 0;
  }

  const directNumber = itNum(text);
  const expectedNumber = typeof value === 'number' || /^\s*[+\-−]?\d+(?:[.,]\d+)?\s*$/.test(String(value)) ? itNum(value) : null;
  if (expectedNumber != null) {
    if (sameNumber(directNumber, expectedNumber)) return .995;
    if (numericTokens(text).some(number => sameNumber(number, expectedNumber))) return .9;
    return 0;
  }

  const expected = plain(value);
  const compactExpected = expected.replace(/[^A-Z0-9]/g, '');
  const compactCandidate = normalized.replace(/[^A-Z0-9]/g, '');
  if (!compactExpected) return 0;
  if (compactCandidate === compactExpected) return 1;
  if (compactCandidate.includes(compactExpected)) {
    if (/\.cf$/.test(path) && compactExpected.length === 16) return .98;
    if (path === 'ccnl.cnel' && compactExpected.length >= 4) return .97;
    if (compactExpected.length >= 6 && compactExpected.length / compactCandidate.length >= .52) return .94;
  }
  if (compactExpected.includes(compactCandidate) && compactCandidate.length >= 6 && compactCandidate.length / compactExpected.length >= .86) return .88;
  return 0;
}

function fieldValueLocation(path, value, candidate) {
  const text = normalizzaTesto(candidate);
  if (!text) return null;
  if (path === 'periodo.mese') {
    const month = Object.entries(MESI_IT).find(([, number]) => number === Number(value));
    const word = month ? new RegExp(`\\b${month[0]}\\b`, 'i').exec(text) : null;
    if (word) return { start: word.index, end: word.index + word[0].length };
    const number = new RegExp(`(?:^|\\D)(0?${Number(value)})(?=[\\/.-]\\d{2,4}|\\D|$)`).exec(text);
    if (number) return { start: number.index + number[0].indexOf(number[1]), end: number.index + number[0].indexOf(number[1]) + number[1].length };
    return null;
  }
  if (path === 'periodo.anno') {
    const year = new RegExp(`(?:^|\\D)(${String(value)})(?:\\D|$)`).exec(text);
    if (year) return { start: year.index + year[0].indexOf(year[1]), end: year.index + year[0].indexOf(year[1]) + year[1].length };
    return null;
  }

  const expectedNumber = typeof value === 'number' || /^\s*[+\-−]?\d+(?:[.,]\d+)?\s*$/.test(String(value)) ? itNum(value) : null;
  if (expectedNumber != null) {
    for (const match of text.matchAll(new RegExp(NUM_ANY_RE.source, 'g'))) {
      if (sameNumber(itNum(match[0]), expectedNumber)) return { start: match.index, end: match.index + match[0].length };
    }
    return null;
  }

  const expected = plain(value);
  const normalized = plain(text);
  const index = normalized.indexOf(expected);
  if (index >= 0 && expected.length >= 2) return { start: index, end: index + expected.length };
  const compactExpected = expected.replace(/[^A-Z0-9]/g, '');
  if (!compactExpected) return null;
  const compactText = normalized.replace(/[^A-Z0-9]/g, '');
  const compactIndex = compactText.indexOf(compactExpected);
  if (compactIndex < 0) return null;
  let seen = 0, start = -1, end = normalized.length;
  for (let index = 0; index < normalized.length; index++) {
    if (!/[A-Z0-9]/.test(normalized[index])) continue;
    if (seen === compactIndex) start = index;
    seen++;
    if (seen === compactIndex + compactExpected.length) { end = index + 1; break; }
  }
  return start >= 0 ? { start, end } : null;
}

function refineSpanToValue(span, path, value) {
  for (const cell of span.cells) {
    const text = normalizzaTesto(cell.str);
    const location = fieldValueLocation(path, value, text);
    if (!location || location.end <= location.start || !text.length) continue;
    const startRatio = location.start / text.length;
    const endRatio = location.end / text.length;
    const refined = Object.assign({}, cell, {
      x: cell.x + (cell.w || 0) * startRatio,
      w: Math.max(3, (cell.w || 0) * (endRatio - startRatio)),
      str: text.slice(location.start, location.end),
    });
    return spanForCells(span.line, [refined], span.quality);
  }
  return span;
}

function matchingValueSpans(line, path, value) {
  const matches = contiguousCellSpans(line).map(span => {
    span.quality = fieldValueMatch(path, value, span.text);
    return span.quality > 0 ? refineSpanToValue(span, path, value) : span;
  }).filter(span => span.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.cells.length - b.cells.length || a.bbox.w - b.bbox.w);

  const selected = [];
  for (const match of matches) {
    const overlaps = selected.some(other => {
      const left = Math.max(match.bbox.x, other.bbox.x);
      const right = Math.min(match.bbox.x + match.bbox.w, other.bbox.x + other.bbox.w);
      return right > left && (right - left) / Math.min(match.bbox.w, other.bbox.w) > .75;
    });
    if (!overlaps) selected.push(match);
  }
  return selected;
}

function matchingLabelSpans(line, regex) {
  const matches = contiguousCellSpans(line).filter(span => {
    regex.lastIndex = 0;
    return regex.test(span.text);
  }).sort((a, b) => a.cells.length - b.cells.length || a.bbox.w - b.bbox.w);
  if (matches.length) return matches.filter((match, index) => index === 0 || !matches.slice(0, index).some(other => {
    const left = Math.max(match.bbox.x, other.bbox.x);
    const right = Math.min(match.bbox.x + match.bbox.w, other.bbox.x + other.bbox.w);
    return right > left;
  }));
  regex.lastIndex = 0;
  return regex.test(normalizzaTesto(line.text)) ? [spanForCells(line, line.cells, .75)] : [];
}

function horizontalGap(a, b) {
  if (!a || !b) return Infinity;
  if (a.x + a.w < b.x) return b.x - (a.x + a.w);
  if (b.x + b.w < a.x) return a.x - (b.x + b.w);
  return 0;
}

function findLine(lines, re, from = 0) {
  for (let i = Math.max(0, from); i < lines.length; i++) {
    re.lastIndex = 0;
    if (re.test(lines[i].normalized || lines[i].text)) return i;
  }
  return -1;
}

function cellCenter(cell) {
  return cell.x + (cell.w || 0) / 2;
}

function numericCells(line) {
  return (line && line.cells || []).filter(cell => itNum(cell.str) != null);
}

function lastNumInLine(line) {
  const cells = line && line.cells || [];
  for (let i = cells.length - 1; i >= 0; i--) {
    const n = itNum(cells[i].str);
    if (n != null) return n;
  }
  return null;
}

function numberBelow(lines, lineIndex, labelCell, maxRows = 3, maxDx = 80) {
  for (let j = lineIndex + 1; j <= Math.min(lineIndex + maxRows, lines.length - 1); j++) {
    let best = null;
    let distance = maxDx;
    for (const cell of numericCells(lines[j])) {
      const dx = Math.abs(cellCenter(cell) - cellCenter(labelCell));
      if (dx < distance) {
        best = cell;
        distance = dx;
      }
    }
    if (best) return itNum(best.str);
  }
  return null;
}

function numberForLabel(lines, lineIndex, labelCell, options = {}) {
  const minX = options.allowLeft ? -Infinity : labelCell.x - 8;
  let best = null;
  let distance = options.sameLineDx || 180;
  for (const cell of numericCells(lines[lineIndex])) {
    if (cell === labelCell || cell.x < minX) continue;
    const dx = Math.abs(cellCenter(cell) - cellCenter(labelCell));
    if (dx < distance) {
      best = cell;
      distance = dx;
    }
  }
  if (best) return itNum(best.str);
  return numberBelow(lines, lineIndex, labelCell, options.maxRows || 3, options.belowDx || 90);
}

function valueNearColumn(lines, lineIndex, labelCell, options = {}) {
  const rows = options.above ? [lineIndex - 1, lineIndex - 2] : [lineIndex + 1, lineIndex + 2];
  const maxDx = options.maxDx || 65;
  for (const rowIndex of rows) {
    if (rowIndex < 0 || rowIndex >= lines.length) continue;
    let best = null;
    let distance = maxDx;
    for (const cell of lines[rowIndex].cells) {
      const dx = Math.abs(cellCenter(cell) - cellCenter(labelCell));
      if (dx < distance) {
        best = cell;
        distance = dx;
      }
    }
    if (best) return best.str.trim();
  }
  return null;
}

function parsePeriodo(text) {
  let match = normalizzaTesto(text).match(new RegExp('\\b(' + MONTH_RE + ')\\s+(20\\d{2})\\b', 'i'));
  if (match) {
    const month = match[1].toLowerCase();
    return { mese: MESI_IT[month], anno: Number(match[2]), label: month[0].toUpperCase() + month.slice(1) + ' ' + match[2] };
  }
  match = String(text || '').match(/\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/);
  if (match) return { mese: Number(match[1]), anno: Number(match[2]), label: match[1] + '/' + match[2] };
  match = normalizzaTesto(text).match(/\b(?:PERIODO|MESE)\D{0,16}(20\d{2})[\/-](0[1-9]|1[0-2])\b/i);
  if (match) return { mese: Number(match[2]), anno: Number(match[1]), label: match[2] + '/' + match[1] };
  return null;
}

function rilevaTipoCedolino(text) {
  const p = plain(text);
  if (/CESSAZIONE|FINE RAPPORTO|LIQUIDAZIONE TFR|INDENNITA SOSTITUTIVA.*PREAVVISO/.test(p)) return 'cessazione';
  if (/CEDOLINO.*(?:13|TREDICESIMA)|TREDICESIMA MENSILITA|GRATIFICA NATALIZIA/.test(p) && !/RATEO|MATURAT/.test(p)) return 'tredicesima';
  if (/CEDOLINO.*(?:14|QUATTORDICESIMA)|QUATTORDICESIMA MENSILITA/.test(p) && !/RATEO|MATURAT/.test(p)) return 'quattordicesima';
  if (/CONGUAGLIO (?:FISCALE|PREVIDENZIALE|ANNUALE)|RICALCOLO IRPEF/.test(p)) return 'conguaglio';
  if (/CEDOLINO.*ARRETRAT|ARRETRATI (?:CCNL|CONTRATTUALI)|DIFFERENZE RETRIBUTIVE/.test(p)) return 'arretrati';
  if (/CEDOLINO.*PREMIO|PREMIO (?:DI RISULTATO|PRODUZIONE)|EROGAZIONE PREMIO/.test(p)) return 'premio';
  if (/RETTIFICA|CEDOLINO SOSTITUTIVO|STORNO CEDOLINO/.test(p)) return 'rettifica';
  return 'ordinario';
}

function rilevaSoftware(text) {
  const p = plain(text);
  if (/JET\s*HR|MESE DI RETRIBUZIONE/.test(p) && /TI RIMANGONO|CAUSALE PRESENZE/.test(p)) return 'Jet HR';
  if (/ZUCCHETTI|VOCI VARIABILI DEL MESE/.test(p)) return 'Zucchetti';
  if (/TEAM\s*SYSTEM|TEAMSYSTEM|LYNFA|GECOM/.test(p)) return 'TeamSystem / LYNFA';
  if (/\bINAZ\b|PAGHE WEB INAZ|HR INAZ/.test(p)) return 'INAZ';
  if (/CENTRO PAGHE|CPW|PAGHE OPEN/.test(p)) return 'Centro Paghe';
  if (/NOIPA|CEDOLINO UNICO|RATA DI RIFERIMENTO|ID CEDOLINO/.test(p)) return 'NoiPA';
  if (/JOB\s*SISTEMI|SISTEMI SPA|JOB PAGHE/.test(p)) return 'Sistemi JOB';
  if (/ADP\s*(?:GLOBALVIEW|WORKFORCE)|ADP ITALIA/.test(p)) return 'ADP';
  if (/SAP\s*(?:HCM|SUCCESSFACTORS)|HR PAYROLL SAP/.test(p)) return 'SAP';
  if (/CASSA\s+EDILE|MUT EDILCONNECT|ACCANTONAMENTO\s+GNF/.test(p)) return 'Cassa Edile / edilizia';
  if (/CEDOLINO\s+PAGA\s*\((?:AD ORE|MENSILE)\)|DATORE DI LAVORO.*LAVORATRIC|RETRIBUZIONE NETTA.*SETTIMANE LAVORATE/.test(p)) return 'Lavoro domestico';
  return 'layout non identificato';
}

function recordVuoto(fonte, software) {
  return {
    documento: { tipo: 'ordinario' },
    periodo: null,
    azienda: {},
    dipendente: {},
    ccnl: {},
    elementi: { altri: [] },
    orario: {},
    voci: [],
    tfr: {},
    progressivi: {},
    ratei: {},
    totali: {},
    meta: { fonte, software, settore: null, inferiti: [], fields: {}, candidates: {}, consistency: {}, reconciliation: {}, pageSizes: [] },
  };
}

function setIfEmpty(target, key, value) {
  if (value != null && value !== '' && target[key] == null) target[key] = value;
}

function extractIdentity(rec, allLines, fullText) {
  const lines = allLines[0] || [];
  const software = rec.meta.software;

  const cfMatches = [...String(fullText).toUpperCase().matchAll(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g)];
  if (cfMatches.length) rec.dipendente.cf = cfMatches[cfMatches.length - 1][0];
  const vat = String(fullText).match(/\b\d{11}\b/);
  if (vat) rec.azienda.cf = vat[0];

  if (software === 'Jet HR') {
    const first = lines[0] && lines[0].cells.find(cell => cell.x < 220 && /[A-Za-zÀ-ù]/.test(cell.str));
    if (first) rec.azienda.nome = first.str.trim();

    let i = findLine(lines, /COD\.?\s*DIP.*LIVELLO/i);
    if (i >= 0) {
      const previous = lines[i - 1];
      if (previous) {
        const name = previous.cells.filter(cell => cell.x < 330 && /[A-Za-zÀ-ù]{2}/.test(cell.str)).map(cell => cell.str).join(' ').trim();
        if (name && !/RIFERIMENTI|BANCA/i.test(name)) rec.dipendente.nome = name;
      }
      const levelLabel = lines[i].cells.find(cell => /LIVELLO/i.test(normalizzaTesto(cell.str)));
      const qualLabel = lines[i].cells.find(cell => /QUALIFICA/i.test(normalizzaTesto(cell.str)));
      if (levelLabel) {
        const rawLevel = valueNearColumn(lines, i, levelLabel);
        const tokens = rawLevel && rawLevel.match(/[A-Z0-9][A-Z0-9.-]{0,7}/gi);
        setIfEmpty(rec.dipendente, 'livello', tokens && tokens[tokens.length - 1]);
      }
      if (qualLabel) setIfEmpty(rec.dipendente, 'qualifica', valueNearColumn(lines, i, qualLabel));
    }
  }

  const companyLabels = [/RAGIONE\s*SOCIALE/i, /^AZIENDA$/i, /DATORE\s+DI\s+LAVORO/i];
  for (const re of companyLabels) {
    const i = findLine(lines, re);
    if (i < 0) continue;
    const label = lines[i].cells.find(cell => re.test(normalizzaTesto(cell.str))) || lines[i].cells[0];
    const value = valueNearColumn(lines, i, label, { maxDx: 170 });
    if (value && /[A-Za-zÀ-ù]{2}/.test(value) && !/CODICE|MATRICOLA/i.test(value)) {
      setIfEmpty(rec.azienda, 'nome', value.replace(/^\d+\s+/, '').trim());
      break;
    }
  }

  const nameLabels = [/COGNOME\s+E\s+NOME/i, /^DIPENDENTE$/i, /NOMINATIVO/i, /^LAVORATORE$/i];
  for (const re of nameLabels) {
    const i = findLine(lines, re);
    if (i < 0) continue;
    const label = lines[i].cells.find(cell => re.test(normalizzaTesto(cell.str))) || lines[i].cells[0];
    const value = valueNearColumn(lines, i, label, { maxDx: 180 });
    if (value && /[A-Za-zÀ-ù]{2}/.test(value) && !/CODICE|FISCALE/i.test(value)) {
      setIfEmpty(rec.dipendente, 'nome', value);
      break;
    }
  }

  const columnDefinitions = [
    { re: /CODICE\s*CNEL/i, target: rec.ccnl, key: 'cnel', clean: value => {
      const candidates = String(value).toUpperCase().match(/\b[A-Z][A-Z0-9]{3}\b/g) || [];
      return candidates.find(candidate => CNEL_CODE_RE.test(candidate));
    } },
    { re: /(?:DATA\s+)?ASSUNZIONE/i, target: rec.dipendente, key: 'dataAssunzione', clean: value => String(value).match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/)?.[0] },
    { re: /^LIVELLO$/i, target: rec.dipendente, key: 'livello', clean: value => {
      const text = String(value).trim();
      if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(text)) return null;
      const tokens = text.match(/[A-Z0-9][A-Z0-9.-]{0,7}/gi);
      return tokens && tokens.length ? tokens[tokens.length - 1] : null;
    } },
    { re: /QUALIFICA/i, target: rec.dipendente, key: 'qualifica', clean: value => String(value).trim() },
  ];
  for (const linesPage of allLines) {
    for (let i = 0; i < linesPage.length; i++) {
      for (const def of columnDefinitions) {
        for (const cell of linesPage[i].cells) {
          if (!def.re.test(normalizzaTesto(cell.str))) continue;
          const raw = valueNearColumn(linesPage, i, cell, { maxDx: 85 });
          const value = raw && def.clean(raw);
          setIfEmpty(def.target, def.key, value);
        }
      }
    }
  }

  if (!rec.ccnl.cnel) {
    const cnel = extractCnelCode(fullText);
    if (cnel) rec.ccnl.cnel = cnel;
  }
  const levelBefore = normalizzaTesto(fullText).match(/\b([A-Z]?\d[A-Z0-9.-]{0,7})\s*(?:['°ª^]\s*)?LIVELLO\b/i);
  const levelAfter = normalizzaTesto(fullText).match(/\b(?:LIVELLO|INQUADRAMENTO)[ \t]*[:.-]?[ \t]*([A-Z]?\d[A-Z0-9.-]{0,7})\b/i);
  if (levelBefore) rec.dipendente.livello = levelBefore[1];
  else if (!rec.dipendente.livello && levelAfter) rec.dipendente.livello = levelAfter[1];
  const qualification = normalizzaTesto(fullText).match(/\b(IMPIEGAT[OA]|OPERAI[OA]?|QUADRO|DIRIGENTE|APPRENDISTA|SOCI[OA]|COADIUVANTE|DOMESTIC[OA])\b/i);
  if (qualification) setIfEmpty(rec.dipendente, 'qualifica', qualification[1].toUpperCase());

  const ccnlDescription = normalizzaTesto(fullText).match(/\b(?:CCNL|CONTRATTO\s+APPLICATO)\s*[:.-]?\s*([A-Za-zÀ-ù][^\n]{4,80})/i);
  if (ccnlDescription) {
    let value = ccnlDescription[1].replace(/\b[A-Z]\d{2,3}[A-Z0-9]?\b/g, '').replace(/\s{2,}/g, ' ').trim();
    if (value && !/^APPLICATO$/i.test(value)) rec.ccnl.descrizione = value;
  }
}

function extractElements(rec, allLines) {
  const definitions = [
    { re: /^(?:PAGA\s*BASE|MINIMO\s+TABELLARE|PAGA\s+BASE\s+CONGLOB)/i, key: 'pagaBase', name: 'Paga base' },
    { re: /^CONTINGENZA/i, key: 'contingenza', name: 'Contingenza' },
    { re: /^(?:SUP\.?\s*ASS|SUPERMINIMO)/i, key: 'superminimo', name: 'Superminimo' },
    { re: /^SCATTI/i, key: 'scatti', name: 'Scatti di anzianità' },
    { re: /^E\.?\s*D\.?\s*R\.?\b/i, key: 'edr', name: 'E.D.R.' },
    { re: /^TERZO\s+ELEM/i, key: 'terzoElemento', name: 'Terzo elemento' },
    { re: /INDENNITA\s+DI\s+FUNZIONE/i, key: 'indennitaFunzione', name: 'Indennità di funzione' },
  ];
  const sectionStartRe = /ELEMENTI (?:RETRIBUTIVI|DELLA RETRIBUZIONE)|DATI RETRIBUTIVI/i;
  const tableStartRe = /VOCI VARIABILI|\bVOCE\b.*\bDESCRIZIONE\b/i;

  for (const lines of allLines) {
    let start = findLine(lines, sectionStartRe);
    let end = findLine(lines, tableStartRe, Math.max(0, start));
    if (start < 0) start = 0;
    if (end < 0) end = Math.min(lines.length, start + 45);
    for (let i = start; i < end; i++) {
      for (const cell of lines[i].cells) {
        const text = normalizzaTesto(cell.str);
        for (const def of definitions) {
          if (rec.elementi[def.key] != null || !def.re.test(text)) continue;
          const value = numberForLabel(lines, i, cell, { maxRows: 3, belowDx: 100 });
          if (value != null) rec.elementi[def.key] = value;
        }
        if (rec.elementi.totale == null && /^(?:RETRIBUZIONE\s+MENSILE|TOTALE\s+(?:ELEMENTI|RETRIBUZIONE)|TOTALE)$/i.test(text)) {
          const value = numberForLabel(lines, i, cell, { maxRows: 3, belowDx: 130 });
          if (value != null && Math.abs(value) > 10) rec.elementi.totale = value;
        }
      }
    }
  }
}

function findTableHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const text = normalizzaTesto(lines[i].text);
    if (/VOCI\s+VARIABILI(?:\s+DEL\s+MESE)?/i.test(text)) return i;
    if (/\bVOCE\b.*\bDESCRIZIONE\b/i.test(text) && /COMPETENZE|IMPORTO|TRATTENUTE|RITENUTE/i.test(text)) return i;
    if (/\bCODICE\b.*\bDESCRIZIONE\b/i.test(text) && /COMPETENZE|IMPORTO|TRATTENUTE|RITENUTE/i.test(text)) return i;
    if (/COMPETENZE\s+FISSE|COMPETENZE\s+ACCESSORIE/i.test(text) && /TRATTENUTE|RITENUTE/i.test(text)) return i;
    if (/DESCRIZIONE/i.test(text) && /Q(?:UA)?NTIT[AÀ]|ORE|GIORNI/i.test(text) && /IMPORTO|TOTALE/i.test(text)) return i;
  }
  return -1;
}

function tableHeads(lines, headerIndex) {
  const heads = {};
  for (let row = headerIndex; row <= Math.min(headerIndex + 1, lines.length - 1); row++) {
    for (const cell of lines[row].cells) {
      const text = normalizzaTesto(cell.str);
      const center = cellCenter(cell);
      if (/IMPORTO\s*BASE|TARIFFA|VALORE\s*UNITARIO|^BASE$/i.test(text)) heads.base = center;
      else if (/RIFERIMENTO|QUANTITA|Q\.?TA/i.test(plain(text))) heads.rif = center;
      else if (/TRATTENUTE|RITENUTE|DEBITI/i.test(text)) heads.tratt = center;
      else if (/COMPETENZE|ACCREDITI/i.test(text)) heads.comp = center;
      else if (/UNITA(?:\s+DI\s+MISURA)?/i.test(plain(text))) heads.unit = center;
      else if (/DESCRIZIONE|VOCI\s+VARIABILI/i.test(text)) heads.desc = center;
      else if (/^VOCE$|^CODICE$/i.test(text)) heads.code = center;
    }
  }
  return heads;
}

function nearestZone(x, heads) {
  let best = null;
  let distance = Infinity;
  for (const key of ['base', 'rif', 'tratt', 'comp']) {
    if (heads[key] == null) continue;
    const dx = Math.abs(x - heads[key]);
    if (dx < distance) {
      best = key;
      distance = dx;
    }
  }
  return best;
}

function splitCodeAndDescription(cells, heads) {
  const leftLimit = heads.base != null ? heads.base - 32 : (heads.rif != null ? heads.rif - 80 : Infinity);
  const left = cells.filter(cell => cellCenter(cell) < leftLimit);
  for (const cell of left) {
    const cleaned = normalizzaTesto(cell.str).replace(/^(?:\*\s*)+/, '').trim();
    const merged = cleaned.match(/^([A-Z0-9][A-Z0-9./_-]{0,11})\s+(.+)$/i);
    if (merged && CODE_TOKEN_RE.test(merged[1])) {
      return { code: merged[1].toUpperCase(), codeCell: cell, mergedDescription: merged[2].trim() };
    }
    if (CODE_TOKEN_RE.test(cleaned)) return { code: cleaned.toUpperCase(), codeCell: cell, mergedDescription: '' };
  }
  return null;
}

function inferTableHeads(lines, headerIndex, heads) {
  if (heads.base != null && heads.comp != null) return heads;
  const centers = [];
  for (let i = headerIndex + 1; i < Math.min(lines.length, headerIndex + 35); i++) {
    const split = splitCodeAndDescription(lines[i].cells, heads);
    if (!split) continue;
    for (const cell of numericCells(lines[i])) {
      if (cell !== split.codeCell) centers.push(cellCenter(cell));
    }
  }
  centers.sort((a, b) => a - b);
  const clusters = [];
  for (const x of centers) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.max < 24) {
      last.sum += x;
      last.count++;
      last.max = x;
    } else {
      clusters.push({ sum: x, count: 1, max: x });
    }
  }
  const columns = clusters.filter(cluster => cluster.count >= 2).map(cluster => cluster.sum / cluster.count);
  if (!columns.length) return heads;
  if (heads.comp == null) heads.comp = columns[columns.length - 1];
  if (heads.base == null) heads.base = columns[0];
  if (heads.rif == null && columns.length >= 2) heads.rif = columns[1];
  if (heads.tratt == null && columns.length >= 3) heads.tratt = columns[columns.length - 2];
  return heads;
}

function parseTableRow(line, heads) {
  const cells = line.cells.filter(cell => !/^\*+$/.test(cell.str.trim()) && !/^[()]+$/.test(cell.str.trim()));
  let split = splitCodeAndDescription(cells, heads);
  if (!split) {
    const firstNumericX = numericCells(line).reduce((min, cell) => Math.min(min, cell.x), Infinity);
    const textCells = cells.filter(cell => itNum(cell.str) == null && /[A-Za-zÀ-ù]{2}/.test(cell.str)
      && cell.x < firstNumericX && !UNIT_RE.test(normalizzaTesto(cell.str)));
    const description = normalizzaTesto(textCells.map(cell => cell.str).join(' '));
    if (!description || !numericCells(line).length
      || /^(?:CODICE|VOCE|DESCRIZIONE|COMPETENZE|TRATTENUTE|RITENUTE|TOTALE|NETTO|IMPORTO\s+NETTO|RETRIBUZIONE\s+NETTA|GIORNI|ORE)\b/i.test(description)) return null;
    split = { code: '', codeCell: null, mergedDescription: description };
  }
  const voce = {
    codice: split.code,
    descrizione: split.mergedDescription,
    base: null,
    rifQta: null,
    rifUnita: '',
    trattenuta: null,
    competenza: null,
    cDitta: false,
  };
  const description = [];
  const referenceText = [];
  const leftLimit = heads.base != null ? heads.base - 32 : Infinity;

  for (const cell of cells) {
    if (cell === split.codeCell) continue;
    const text = normalizzaTesto(cell.str);
    const center = cellCenter(cell);
    const number = itNum(text);
    if (/^C\/?\s*DITTA$/i.test(text)) {
      voce.cDitta = true;
      continue;
    }
    if (UNIT_RE.test(text)) {
      voce.rifUnita = text.replace('.', '').toUpperCase();
      continue;
    }
    if (number == null) {
      if (center < leftLimit && !split.mergedDescription.includes(text)) description.push(text);
      else referenceText.push(text);
      continue;
    }
    const zone = nearestZone(center, heads);
    if (zone === 'base') voce.base = number;
    else if (zone === 'rif') voce.rifQta = number;
    else if (zone === 'tratt') voce.trattenuta = number;
    else if (zone === 'comp') voce.competenza = number;
    else if (center < leftLimit) referenceText.push(text);
  }

  voce.descrizione = [voce.descrizione, ...description].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (referenceText.length) voce.rifTesto = referenceText.join(' ');
  if (voce.cDitta && voce.competenza != null) {
    voce.costoAzienda = Math.abs(voce.competenza);
    voce.competenza = null;
  }
  if (!voce.descrizione && voce.base == null && voce.rifQta == null && voce.trattenuta == null && voce.competenza == null) return null;
  const amount = voce.competenza ?? voce.trattenuta;
  const calculated = voce.base != null && voce.rifQta != null
    ? Math.abs(voce.base * voce.rifQta * (voce.rifUnita === '%' ? .01 : 1)) : null;
  const rowMatches = amount != null && calculated != null && Math.abs(Math.abs(amount) - calculated) <= Math.max(0.06, Math.abs(amount) * 0.015);
  voce.descrizioneOriginale = voce.descrizione;
  voce.meta = {
    source: 'coordinate',
    confidence: Math.min(0.98, 0.48 + (voce.codice ? 0.12 : 0) + (voce.descrizione ? 0.14 : 0)
      + (amount != null ? 0.12 : 0) + (rowMatches ? 0.12 : 0)),
    rowMatches,
    visual: visualEvidence(line),
  };
  return voce;
}

function sameVoice(a, b) {
  return a.codice === b.codice
    && plain(a.descrizione) === plain(b.descrizione)
    && a.base === b.base
    && a.rifQta === b.rifQta
    && a.trattenuta === b.trattenuta
    && a.competenza === b.competenza;
}

function extractVoices(rec, allLines, warnings) {
  for (const lines of allLines) {
    const headerIndex = findTableHeader(lines);
    if (headerIndex < 0) continue;
    const heads = inferTableHeads(lines, headerIndex, tableHeads(lines, headerIndex));
    if (heads.base == null || (heads.comp == null && heads.tratt == null)) {
      warnings.push('Le colonne della tabella voci sono state riconosciute solo in parte: controlla gli importi delle singole righe.');
    }
    const stopRe = /^(?:CONTRIBUTI|CONGUAGLIO|PROGRESSIVI|T\.?\s*F\.?\s*R\.?|RATEI|FERIE\s+E\s+PERMESSI|IRPEF|RITENUTE\s+FISCALI|DETRAZIONI|TOTALI|RIEPILOGO|COMUNICAZIONI|CAUSALE\s+PRESENZE)\b/i;
    let consecutiveMisses = 0;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const text = normalizzaTesto(lines[i].text);
      if (i > headerIndex + 2 && stopRe.test(text)) break;
      if (/^X\s*=|L['’]EVENTO\s+CONTINUA|CAUSALE\s+PRESENZE/i.test(text)) break;
      if (numericCells(lines[i]).length >= 10 && /TOTALE/i.test(text)) break;
      if (/RETRIBUZIONE\s+UTILE\s+T\.?\s*F\.?\s*R\.?/i.test(text)) {
        const value = lastNumInLine(lines[i]);
        if (value != null) rec.tfr.retribUtile = value;
        continue;
      }
      if (/^QUOTA\s+T\.?\s*F\.?\s*R\.?/i.test(text.trim())) {
        const value = lastNumInLine(lines[i]);
        if (value != null) rec.tfr.quotaMese = value;
        continue;
      }
      if (/^IMP\.?\s*INAIL/i.test(text.trim())) {
        const value = numericCells(lines[i]).map(cell => itNum(cell.str))[0];
        if (value != null) rec.orario.impInail = value;
        continue;
      }
      const voice = parseTableRow(lines[i], heads);
      if (!voice) {
        consecutiveMisses++;
        if (consecutiveMisses > 14 && rec.voci.length) break;
        continue;
      }
      consecutiveMisses = 0;
      if (!rec.voci.some(existing => sameVoice(existing, voice))) rec.voci.push(voice);
    }
  }
}

function addSyntheticVoice(rec, voice) {
  const voiceAmount = voice.competenza ?? voice.trattenuta;
  const duplicate = rec.voci.some(existing =>
    (voice.codice && existing.codice === voice.codice)
    || (plain(existing.descrizione) === plain(voice.descrizione)
      && ((existing.competenza ?? existing.trattenuta) === voiceAmount
        || (existing.base === voice.base && existing.trattenuta === voice.trattenuta && existing.competenza === voice.competenza))));
  if (!duplicate) {
    if (!voice.descrizioneOriginale) voice.descrizioneOriginale = voice.descrizione || '';
    if (!voice.meta) voice.meta = { source: rec.meta.fonte === 'ocr' ? 'ocr-testo' : 'sezione-etichettata', confidence: rec.meta.fonte === 'ocr' ? 0.56 : 0.76 };
    rec.voci.push(voice);
  }
}

/*
 * Recupera righe economiche anche quando il cedolino non espone una vera tabella
 * codice/descrizione/base/quantità. È il caso tipico di NoiPA, lavoro domestico,
 * alcuni cedolini edili e prospetti semplificati prodotti dai piccoli studi.
 */
function extractLabeledFinancialLines(rec, allLines) {
  const economicLabel = /\b(?:STIPENDIO|RETRIBUZIONE|PAGA|COMPENSO|INDENNIT[AÀ]|STRAORDINAR|FESTIV|NOTTURN|FERIE|PERMESS|MALATT|MATERNIT|CONGED|INFORTUN|ARRETRAT|PREMIO|RIMBORS|TRASFERT|TRATTAMENTO\s+INTEGRATIVO|CONTRIBUT|INPS|IVS|IRPEF|ADDIZIONAL|SINDACAL|CESSION|PIGNOR|PRESTITO|TFR)\b/i;
  const excluded = /\b(?:TOTALE|NETTO|IMPONIBILE|DETRAZION|ALIQUOTA|RESIDUO|MATURAT|GODUT|SALDO|PROGRESSIV|ELEMENTI\s+RETRIBUTIVI|RETRIBUZIONE\s+UTILE)\b/i;
  const deduction = /\b(?:TRATTENUT|RITENUT|CONTRIBUT|INPS|IVS|IRPEF|ADDIZIONAL|SINDACAL|CESSION|PIGNOR|PRESTITO|RECUPERO)\b/i;
  for (const lines of allLines) {
    for (const line of lines) {
      const text = normalizzaTesto(line.text);
      if (!economicLabel.test(text) || excluded.test(text)) continue;
      const values = numericCells(line).map(cell => ({ x: cellCenter(cell), value: itNum(cell.str) }))
        .filter(item => item.value != null);
      if (!values.length) continue;
      const firstNumberX = Math.min(...values.map(item => item.x));
      let description = normalizzaTesto(line.cells
        .filter(cell => itNum(cell.str) == null && cellCenter(cell) < firstNumberX && !UNIT_RE.test(normalizzaTesto(cell.str)))
        .map(cell => cell.str).join(' '));
      description = description.replace(/^\s*[A-Z0-9./_-]{1,12}\s+(?=[A-Za-zÀ-ù])/, '').trim();
      if (!description || !economicLabel.test(description)) continue;
      if (/^(?:FERIE|PERMESSI|R\.?O\.?L\.?|EX\s*FEST)\s*\(?(?:ORE|GG|GIORNI)?\)?$/i.test(description) && values.length >= 4) continue;
      const amount = values[values.length - 1].value;
      if (Math.abs(amount) > 1000000) continue;
      const voice = { codice: '', descrizione: description, base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null };
      if (values.length >= 3) {
        const inputs = values.slice(0, -1).map(item => item.value);
        const percent = inputs.find(value => value > 0 && value <= 100);
        const monetaryBase = inputs.find(value => Math.abs(value) > 100);
        if (deduction.test(description) && percent != null && monetaryBase != null && percent !== monetaryBase) {
          voice.base = monetaryBase; voice.rifQta = percent; voice.rifUnita = '%';
        } else {
          voice.base = values[0].value;
          voice.rifQta = values[1].value;
        }
      } else if (values.length === 2 && Math.abs(values[0].value) < 400) {
        voice.rifQta = values[0].value;
      }
      if (deduction.test(description)) voice.trattenuta = Math.abs(amount);
      else voice.competenza = amount;
      voice.meta = { source: 'riga-etichettata', confidence: values.length >= 2 ? 0.7 : 0.62, visual: visualEvidence(line) };
      addSyntheticVoice(rec, voice);
    }
  }
}

function extractContributionTables(rec, allLines) {
  for (const lines of allLines) {
    const start = findLine(lines, /^CONTRIBUTI\b/i);
    if (start < 0) continue;
    let end = findLine(lines, /^(?:IRPEF|RITENUTE\s+FISCALI|TOTALI)\b/i, start + 1);
    if (end < 0) end = Math.min(lines.length, start + 18);
    for (let i = start + 1; i < end; i++) {
      const textCells = lines[i].cells.filter(cell => /[A-Za-zÀ-ù]{2}/.test(cell.str) && !/IMPONIBILE|TOTALE|ALIQUOTA|IMPORTO|DESCRIZIONE/i.test(normalizzaTesto(cell.str)));
      for (const descriptionCell of textCells) {
        const numbers = lines[i].cells
          .filter(cell => cell.x > descriptionCell.x + descriptionCell.w - 2)
          .map(cell => ({ cell, value: itNum(cell.str) }))
          .filter(item => item.value != null);
        if (numbers.length < 2) continue;
        const values = numbers.map(item => item.value);
        addSyntheticVoice(rec, {
          codice: '',
          descrizione: normalizzaTesto(descriptionCell.str),
          base: values.length >= 3 ? values[values.length - 2] : values[0],
          rifQta: values.length >= 3 ? values[values.length - 3] : null,
          rifUnita: values.length >= 3 ? '%' : '',
          trattenuta: values[values.length - 1],
          competenza: null,
          meta: { source: 'coordinate', confidence: .84, visual: visualEvidence(lines[i]) },
        });
      }
    }
  }
}

function extractFiscalSummary(rec, allLines) {
  const definitions = [
    { re: /^IMPONIBILE\s+FISCALE$/i, code: 'F02000', description: 'Imponibile fiscale', field: 'base' },
    { re: /^IRPEF\s+LORDA$/i, code: 'F02010', description: 'IRPEF lorda', field: 'base' },
    { re: /^IRPEF\s*\+\s*IMP\.?\s*SOST\.?$/i, code: 'F03020', description: 'Ritenute IRPEF e imposta sostitutiva', field: 'trattenuta' },
    { re: /DETR\.?\s+LAV\.?\s*DIPENDENTE/i, code: 'F02500', description: 'Detrazioni lavoro dipendente', field: 'base' },
    { re: /^U\.?\s*D\.?$/i, code: 'F02801', description: 'Ulteriore detrazione', field: 'base' },
  ];
  for (const lines of allLines) {
    for (let i = 0; i < lines.length; i++) {
      for (const cell of lines[i].cells) {
        const text = normalizzaTesto(cell.str);
        for (const def of definitions) {
          if (!def.re.test(text)) continue;
          const value = numberBelow(lines, i, cell, 2, 65);
          if (value == null) continue;
          const voice = { codice: def.code, descrizione: def.description, base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null };
          voice[def.field] = value;
          voice.meta = { source: 'coordinate', confidence: .82, visual: visualEvidence(lines[i]) };
          addSyntheticVoice(rec, voice);
        }
      }
    }
  }
}

function extractTotals(rec, allLines) {
  const definitions = [
    { re: /TOTALE\s+COMPETENZE|TOTALE\s+SPETTANZE|TOTALE\s+LORDO/i, key: 'competenze' },
    { re: /TOTALE\s+(?:TRATTENUTE|RITENUTE)|TOTALE\s+DEDUZIONI/i, key: 'trattenute' },
    { re: /ARROTONDAMENTO/i, key: 'arrotondamento' },
    { re: /(?:NETTO(?:\s+DEL\s+MESE|\s+IN\s+BUSTA|\s+A\s+PAGARE|\s+PAGATO)?|RETRIBUZIONE\s+NETTA|IMPORTO\s+NETTO)/i, key: 'netto' },
  ];
  for (let page = 0; page < allLines.length; page++) {
    const lines = allLines[page];
    for (let i = 0; i < lines.length; i++) {
      for (const def of definitions) {
        // Molti PDF spezzano "TOTALE COMPETENZE" in due celle e stampano il
        // valore una o due righe più in basso, mentre a sinistra inizia già il
        // riquadro progressivi. Cerchiamo quindi l'intera etichetta come span
        // contiguo e usiamo la sua colonna, non soltanto una singola cella.
        const labels = matchingLabelSpans(lines[i], def.re);
        for (const label of labels) {
          const labelCell = { x: label.bbox.x, w: label.bbox.w };
          const value = numberForLabel(lines, i, labelCell, { maxRows: 4, belowDx: 120, sameLineDx: 240 });
          if (value != null) addCandidate(rec, 'totali.' + def.key, value, {
            confidence: rec.meta.fonte === 'ocr' ? 0.66 : 0.9,
            source: rec.meta.fonte,
            method: 'etichetta-coordinate',
            label: label.text, page,
            bbox: label.bbox, snippet: normalizzaTesto(lines[i].text).slice(0, 180),
          });
        }
        if (def.re.test(normalizzaTesto(lines[i].text))) {
          const value = lastNumInLine(lines[i]);
          if (value != null) addCandidate(rec, 'totali.' + def.key, value, {
            confidence: rec.meta.fonte === 'ocr' ? 0.52 : 0.68,
            source: rec.meta.fonte,
            method: 'ultimo-numero-riga',
            label: normalizzaTesto(lines[i].text).slice(0, 100), page,
            bbox: lineBBox(lines[i]), snippet: normalizzaTesto(lines[i].text).slice(0, 180),
          });
        }
      }
    }
  }
}

function resolveTotalCandidates(rec) {
  const lists = {};
  for (const key of ['competenze', 'trattenute', 'arrotondamento', 'netto']) {
    const candidates = (rec.meta.candidates['totali.' + key] || []).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
    if (candidates.length) lists[key] = candidates;
  }
  const comp = lists.competenze || [{ value: null, confidence: 0 }];
  const trat = lists.trattenute || [{ value: null, confidence: 0 }];
  const nett = lists.netto || [{ value: null, confidence: 0 }];
  const arro = lists.arrotondamento || [{ value: 0, confidence: 0.25, source: 'default', method: 'default' }];
  const voiceCompetences = (rec.voci || []).filter(voice => voice.competenza != null);
  const voiceDeductions = (rec.voci || []).filter(voice => voice.trattenuta != null);
  const sumCompetences = voiceCompetences.reduce((sum, voice) => sum + Number(voice.competenza || 0), 0);
  const sumDeductions = voiceDeductions.reduce((sum, voice) => sum + Number(voice.trattenuta || 0), 0);
  const ranked = [];
  for (const c of comp) for (const t of trat) for (const n of nett) for (const a of arro) {
    let score = c.confidence + t.confidence + n.confidence + a.confidence * 0.25;
    const reasons = [];
    if (c.value != null && t.value != null && n.value != null) {
      const delta = Math.min(Math.abs(c.value - t.value - n.value), Math.abs(c.value - t.value + (a.value || 0) - n.value));
      if (delta <= 0.05) { score += 2.4; reasons.push('quadratura esatta del netto'); }
      else if (delta <= 0.55) { score += 1.7; reasons.push('quadratura compatibile con arrotondamento'); }
      else score += Math.max(-2.5, 0.5 - Math.log10(delta + 0.01));
    }
    if (c.value != null && voiceCompetences.length >= 2 && sumCompetences > 0) {
      const delta = Math.abs(c.value - sumCompetences);
      const ratio = delta / Math.max(1, Math.abs(c.value));
      if (ratio <= .002) { score += 1.15; reasons.push('somma delle competenze'); }
      else if (ratio <= .03) score += .35;
      else if (ratio > .45) score -= .45;
    }
    if (t.value != null && voiceDeductions.length >= 2 && sumDeductions > 0) {
      const delta = Math.abs(t.value - sumDeductions);
      const ratio = delta / Math.max(1, Math.abs(t.value));
      if (ratio <= .002) { score += 1.15; reasons.push('somma delle trattenute'); }
      else if (ratio <= .03) score += .35;
      else if (ratio > .45) score -= .45;
    }
    if (c.value != null && n.value != null && (c.value < n.value || c.value < 0 || n.value < 0)) score -= 1.2;
    if (t.value != null && (t.value < 0 || (c.value != null && t.value > c.value * 1.15))) score -= 1.2;
    ranked.push({ score, c, t, n, a, reasons });
  }
  ranked.sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return;
  for (const [key, candidate] of [['competenze', best.c], ['trattenute', best.t], ['netto', best.n], ['arrotondamento', best.a]]) {
    if (candidate.value == null || (key === 'arrotondamento' && candidate.source === 'default')) continue;
    rec.totali[key] = candidate.value;
    markField(rec, 'totali.' + key, candidate);
  }
  const seen = new Set();
  rec.meta.reconciliation = rec.meta.reconciliation || {};
  rec.meta.reconciliation.voiceSums = { competenze: Number(sumCompetences.toFixed(2)), trattenute: Number(sumDeductions.toFixed(2)) };
  rec.meta.reconciliation.alternatives = ranked.filter(item => {
    const key = [item.c.value, item.t.value, item.a.value, item.n.value].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3).map((item, index) => ({
    rank: index + 1, score: Number(item.score.toFixed(3)),
    competenze: item.c.value, trattenute: item.t.value, arrotondamento: item.a.value, netto: item.n.value,
    reasons: item.reasons,
  }));
}

function assignLabelGroups(lines, lineIndex, definitions, output) {
  const labels = [];
  for (const cell of lines[lineIndex].cells) {
    for (const def of definitions) {
      if (output[def.key] != null || !def.re.test(normalizzaTesto(cell.str))) continue;
      labels.push({ cell, key: def.key });
    }
  }
  if (!labels.length) return;
  for (let j = lineIndex + 1; j <= Math.min(lineIndex + 3, lines.length - 1); j++) {
    const pairs = [];
    for (const label of labels) {
      for (const numberCell of numericCells(lines[j])) {
        const dx = Math.abs(cellCenter(numberCell) - cellCenter(label.cell));
        if (dx <= 72) pairs.push({ label, numberCell, dx });
      }
    }
    pairs.sort((a, b) => a.dx - b.dx);
    const usedLabels = new Set();
    const usedNumbers = new Set();
    for (const pair of pairs) {
      if (usedLabels.has(pair.label) || usedNumbers.has(pair.numberCell)) continue;
      output[pair.label.key] = itNum(pair.numberCell.str);
      usedLabels.add(pair.label);
      usedNumbers.add(pair.numberCell);
    }
    if (usedLabels.size) return;
  }
}

function extractProgressivesAndTfr(rec, allLines) {
  const progressives = [
    { re: /(?:IMPONIBILE|IMP\.?)\s+INPS(?:\s+PROGR\.?)?/i, key: 'impInps' },
    { re: /(?:IMPONIBILE|IMP\.?)\s+(?:IRPEF|FISCALE)(?:\s+PROGR\.?)?/i, key: 'impIrpef' },
    { re: /IRPEF\s+PAGATA/i, key: 'irpefPagata' },
    { re: /(?:IMPONIBILE|IMP\.?)\s+INAIL(?:\s+PROGR\.?)?/i, key: 'impInail' },
  ];
  const tfr = [
    { re: /RETRIBUZIONE\s+UTILE\s+T\.?\s*F\.?\s*R\.?/i, key: 'retribUtile' },
    { re: /T\.?\s*F\.?\s*R\.?\s+DEL\s+MESE|QUOTA\s+T\.?\s*F\.?\s*R\.?/i, key: 'quotaMese' },
    { re: /(?:FONDO|F\.?\s*DO)\s+(?:AL\s+)?31[\/-]12|TFR\s+AL\s+31[\/-]12|OGGI\s+IN\s+AZIENDA\s+HAI/i, key: 'fondo3112' },
    { re: /RIVALUTAZ/i, key: 'rivalutazione' },
    { re: /(?:IMPOSTA|IMP\.?)\s*RIVAL/i, key: 'impRivalutazione' },
    { re: /QUOTA\s+ANNO/i, key: 'quotaAnno' },
    { re: /TFR\s+A\s+FONDI|VERSATO\s+AL\s+FONDO/i, key: 'aFondi' },
    { re: /ANTICIPI/i, key: 'anticipi' },
  ];
  for (const lines of allLines) {
    for (let i = 0; i < lines.length; i++) {
      assignLabelGroups(lines, i, progressives, rec.progressivi);
      assignLabelGroups(lines, i, tfr, rec.tfr);
    }
  }
}

function headerMapForRatei(line) {
  const map = {};
  for (const cell of line.cells) {
    const text = normalizzaTesto(cell.str);
    if (/RESIDUO\s*(?:A\.?\s*P\.?|PRECEDENTE)|ANNO\s+PREC/i.test(text)) map.residuoAp = cellCenter(cell);
    else if (/MATURAT/i.test(text)) map.maturato = cellCenter(cell);
    else if (/GODUT[IO]\s*(?:A\.?\s*C\.?|CORRENTE)/i.test(text)) map.goduto = cellCenter(cell);
    else if (/GODUT[IO]\s*(?:A\.?\s*P\.?|PRECEDENTE)/i.test(text)) map.godutoAp = cellCenter(cell);
    else if (/SALDO|RIMANGONO|RESIDUO\s*FINALE/i.test(text)) map.saldo = cellCenter(cell);
    else if (/GODUT[IO]|FRUIT[IO]/i.test(text)) map.goduto = cellCenter(cell);
  }
  return map;
}

function extractAccruals(rec, allLines) {
  for (const lines of allLines) {
    let section = findLine(lines, /FERIE\s+E\s+PERMESSI|\bRATEI\b/i);
    if (section < 0) continue;
    let headers = {};
    for (let i = section; i < Math.min(lines.length, section + 5); i++) {
      const candidate = headerMapForRatei(lines[i]);
      if (Object.keys(candidate).length >= Object.keys(headers).length) headers = candidate;
    }
    for (let i = section + 1; i < Math.min(lines.length, section + 24); i++) {
      const first = lines[i].cells[0];
      if (!first || !/^(FERIE|PERMESSI|ROL|R\.O\.L\.|EX\s*FEST)/i.test(normalizzaTesto(first.str))) continue;
      const key = /FERIE/i.test(first.str) ? 'ferie' : (/EX\s*FEST/i.test(first.str) ? 'exFestivita' : 'permessi');
      const result = { residuoAp: null, maturato: null, goduto: null, saldo: null, unita: /\bGG\b|GIORNI/i.test(lines[i].text) ? 'GG' : (/\bORE\b/i.test(lines[i].text) ? 'ORE' : '') };
      if (Object.keys(headers).length >= 3) {
        for (const cell of numericCells(lines[i])) {
          let bestKey = null;
          let distance = 42;
          for (const [headerKey, x] of Object.entries(headers)) {
            const dx = Math.abs(cellCenter(cell) - x);
            if (dx < distance) {
              bestKey = headerKey;
              distance = dx;
            }
          }
          if (bestKey) result[bestKey] = itNum(cell.str);
        }
      } else {
        const numbers = numericCells(lines[i]).map(cell => itNum(cell.str));
        if (numbers.length >= 4) [result.residuoAp, result.maturato, result.goduto, result.saldo] = numbers.slice(-4);
      }
      if (Object.values(result).some(value => typeof value === 'number')) rec.ratei[key] = result;
    }
  }
}

function extractHours(rec, allLines, fullText) {
  for (const lines of allLines) {
    for (let i = 0; i < lines.length; i++) {
      for (const cell of lines[i].cells) {
        const label = normalizzaTesto(cell.str);
        if (/RETRIBUZIONE\s+ORARIA|PAGA\s+ORARIA|TARIFFA\s+ORARIA/i.test(label)) {
          const value = numberForLabel(lines, i, cell, { maxRows: 3, belowDx: 80, sameLineDx: 130 });
          if (value != null) rec.orario.pagaOraria = value;
          continue;
        }
        if (/RETRIBUZIONE\s+GIORNALIERA|PAGA\s+GIORNALIERA|TARIFFA\s+GIORNALIERA/i.test(label)) {
          const value = numberForLabel(lines, i, cell, { maxRows: 3, belowDx: 80, sameLineDx: 130 });
          if (value != null) rec.orario.pagaGiornaliera = value;
          continue;
        }
        if (/(?:GG\.?|GIORNI?)\s+LAVORATI/i.test(label)) {
          const value = numberForLabel(lines, i, cell, { maxRows: 3, belowDx: 55, sameLineDx: 90 });
          if (value != null) rec.orario.giorniLavorati = value;
          continue;
        }
        if (/ORE\s+(?:ORDINARIE\s+)?LAVORATE|ORE\s+LAVORATE\s+ORDINARIE/i.test(label)) {
          const sameLine = lines[i].cells.filter(candidate => candidate.x > cell.x).map(candidate => itNum(candidate.str)).filter(value => value != null);
          const value = sameLine.length ? sameLine[sameLine.length - 1] : numberBelow(lines, i, cell, 2, 100);
          if (value != null) rec.orario.oreOrdinarie = value;
        }
      }
    }
  }
  const nextStep = normalizzaTesto(fullText).match(/PROSSIMO\s+SCATTO[\s\S]{0,50}?\b(\d{1,2}[\/-]\d{2,4})\b/i);
  if (nextStep) rec.orario.prossimoScatto = nextStep[1];
}

const VISUAL_FIELD_LABELS = [
  { paths: ['periodo.mese', 'periodo.anno'], re: /PERIODO|MESE\s+DI\s+RETRIBUZIONE|RATA\s+DI\s+RIFERIMENTO/i },
  { paths: ['dipendente.nome'], re: /COGNOME.*NOME|NOME.*COGNOME|LAVORAT(?:ORE|RICE)/i },
  { paths: ['dipendente.cf'], re: /CODICE\s+FISCALE|COD\.?(?:ICE)?\s*FISC/i },
  { paths: ['dipendente.livello'], re: /\bLIVELLO\b|INQUADRAMENTO/i },
  { paths: ['dipendente.qualifica'], re: /QUALIFICA|MANSIONE/i },
  { paths: ['dipendente.dataAssunzione'], re: /DATA\s+ASSUNZIONE|ASSUNZIONE/i },
  { paths: ['azienda.nome'], re: /RAGIONE\s+SOCIALE|DATORE\s+DI\s+LAVORO|AZIENDA/i },
  { paths: ['azienda.cf'], re: /CODICE\s+FISCALE.*P\.?\s*IVA|PARTITA\s+IVA|C\.?F\.?\s+AZIENDA/i },
  { paths: ['ccnl.cnel', 'ccnl.descrizione'], re: /CODICE\s+CNEL|\bCNEL\b|CONTRATTO\s+APPLICATO|\bCCNL\b/i },
  { paths: ['elementi.pagaBase'], re: /PAGA\s+BASE|STIPENDIO\s+TABELLARE|MINIMO\s+CONTRATTUALE/i },
  { paths: ['elementi.contingenza'], re: /CONTINGENZA/i },
  { paths: ['elementi.superminimo'], re: /SUPERMINIMO|SUP\.?\s*ASS/i },
  { paths: ['elementi.scatti'], re: /SCATTI?\s+(?:DI\s+)?ANZIANIT/i },
  { paths: ['elementi.totale'], re: /TOTALE\s+ELEMENTI|RETRIBUZIONE\s+MENSILE/i },
  { paths: ['orario.oreOrdinarie'], re: /ORE\s+(?:ORDINARIE\s+)?LAVORATE/i },
  { paths: ['orario.giorniLavorati'], re: /GIORNI?\s+LAVORATI|GG\.?\s+LAVORATI/i },
  { paths: ['orario.pagaOraria'], re: /RETRIBUZIONE\s+ORARIA|PAGA\s+ORARIA|TARIFFA\s+ORARIA/i },
  { paths: ['orario.pagaGiornaliera'], re: /RETRIBUZIONE\s+GIORNALIERA|PAGA\s+GIORNALIERA/i },
  { paths: ['totali.competenze'], re: /TOTALE\s+(?:COMPETENZE|SPETTANZE|LORDO)/i },
  { paths: ['totali.trattenute'], re: /TOTALE\s+(?:TRATTENUTE|RITENUTE|DEDUZIONI)/i },
  { paths: ['totali.arrotondamento'], re: /ARROTONDAMENTO/i },
  { paths: ['totali.netto'], re: /NETTO(?:\s+DEL\s+MESE|\s+IN\s+BUSTA|\s+A\s+PAGARE)?|RETRIBUZIONE\s+NETTA|IMPORTO\s+NETTO/i },
  { paths: ['tfr.retribUtile'], re: /RETRIBUZIONE\s+UTILE\s+T\.?\s*F\.?\s*R/i },
  { paths: ['tfr.quotaMese'], re: /TFR\s+DEL\s+MESE|QUOTA\s+T\.?\s*F\.?\s*R/i },
  { paths: ['tfr.fondo3112'], re: /TFR\s+AL\s+31[\/-]12|FONDO\s+(?:AL\s+)?31[\/-]12|OGGI\s+IN\s+AZIENDA\s+HAI/i },
  { paths: ['tfr.rivalutazione'], re: /RIVALUTAZ(?:IONE|\.)/i },
  { paths: ['tfr.quotaAnno'], re: /QUOTA\s+ANNO/i },
  { paths: ['tfr.aFondi'], re: /TFR\s+(?:A|AI)\s+FOND/i },
  { paths: ['progressivi.impInps'], re: /IMPONIBILE\s+INPS\s+PROGR|PROGRESSIVI.*IMP\.?\s*INPS/i },
  { paths: ['progressivi.impIrpef'], re: /IMPONIBILE\s+(?:IRPEF|FISCALE)\s+PROGR|PROGRESSIVI.*IMP\.?\s*IRPEF/i },
  { paths: ['progressivi.irpefPagata'], re: /IRPEF\s+PAGATA/i },
  { paths: ['ratei.ferie.residuoAp', 'ratei.ferie.maturato', 'ratei.ferie.goduto', 'ratei.ferie.godutoAp', 'ratei.ferie.saldo'], re: /^\s*FERIE\b/i },
  { paths: ['ratei.permessi.residuoAp', 'ratei.permessi.maturato', 'ratei.permessi.goduto', 'ratei.permessi.godutoAp', 'ratei.permessi.saldo'], re: /^\s*(?:PERMESSI|ROL|R\.O\.L\.)\b/i },
];

function anchoredValueEvidence(path, value, allLines, regex) {
  const ranked = [];
  for (const lines of allLines) {
    for (let labelIndex = 0; labelIndex < lines.length; labelIndex++) {
      const labelLine = lines[labelIndex];
      const labels = matchingLabelSpans(labelLine, regex);
      for (const label of labels) {
        const first = Math.max(0, labelIndex - 2);
        const last = Math.min(lines.length - 1, labelIndex + 6);
        for (let valueIndex = first; valueIndex <= last; valueIndex++) {
          const valueLine = lines[valueIndex];
          const vertical = Math.abs(valueLine.y - labelLine.y);
          if (vertical > 96) continue;
          for (const candidate of matchingValueSpans(valueLine, path, value)) {
            const labelCenter = label.bbox.x + label.bbox.w / 2;
            const valueCenter = candidate.bbox.x + candidate.bbox.w / 2;
            const rowDelta = valueIndex - labelIndex;
            let score = (1 - candidate.quality) * 90
              + vertical * .72
              + horizontalGap(label.bbox, candidate.bbox) * .18
              + Math.abs(labelCenter - valueCenter) * .045
              + Math.abs(rowDelta) * 1.8
              + candidate.cells.length * .15;
            if (rowDelta === 0) {
              if (candidate.bbox.x >= label.bbox.x - 3) score -= 9;
              if (horizontalGap(label.bbox, candidate.bbox) === 0) score -= 4;
            } else if (rowDelta > 0) {
              score -= 5;
              if (Math.abs(labelCenter - valueCenter) < 55) score -= 4;
            } else {
              score += 5;
            }
            ranked.push({ candidate, score });
          }
        }
      }
    }
  }
  ranked.sort((a, b) => a.score - b.score || b.candidate.quality - a.candidate.quality || a.candidate.bbox.w - b.candidate.bbox.w);
  return ranked.length ? ranked[0].candidate : null;
}

function uniqueValueEvidence(path, value, allLines) {
  const candidates = [];
  for (const lines of allLines) {
    for (const line of lines) {
      for (const candidate of matchingValueSpans(line, path, value)) {
        if (candidate.quality >= .97) candidates.push(candidate);
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.quality - a.quality || a.bbox.w - b.bbox.w);
  const bestByLocation = [];
  for (const candidate of candidates) {
    if (bestByLocation.some(other => other.line.page === candidate.line.page
      && Math.abs(other.bbox.x - candidate.bbox.x) < 2
      && Math.abs(other.bbox.y - candidate.bbox.y) < 2)) continue;
    bestByLocation.push(candidate);
  }
  return bestByLocation.length === 1 ? bestByLocation[0] : null;
}

function attachVisualEvidence(rec, allLines) {
  for (const definition of VISUAL_FIELD_LABELS) {
    for (const path of definition.paths) {
      const value = getPathValue(rec, path);
      if (value == null || value === '') continue;
      const current = rec.meta.fields[path];
      const match = anchoredValueEvidence(path, value, allLines, definition.re)
        || uniqueValueEvidence(path, value, allLines);
      if (!match) {
        if (current && current.visualTarget !== 'value') {
          current.page = null;
          current.bbox = null;
          current.snippet = '';
        }
        continue;
      }
      if (!current) markField(rec, path, {
        confidence: rec.meta.fonte === 'ocr' ? .56 : .8,
        source: rec.meta.fonte,
        method: 'valore-coordinate',
      });
      Object.assign(rec.meta.fields[path], {
        page: match.line.page == null ? null : match.line.page,
        bbox: match.bbox,
        snippet: match.text.slice(0, 180),
        visualTarget: 'value',
        visualConfidence: match.quality,
      });
    }
  }
}

function inferMissingTotal(rec, warnings) {
  const t = rec.totali;
  const rounding = t.arrotondamento || 0;
  const present = ['competenze', 'trattenute', 'netto'].filter(key => t[key] != null);
  if (present.length !== 2) return;
  if (t.netto == null) t.netto = t.competenze - t.trattenute + rounding;
  else if (t.competenze == null) t.competenze = t.netto + t.trattenute - rounding;
  else if (t.trattenute == null) t.trattenute = t.competenze + rounding - t.netto;
  const inferred = ['competenze', 'trattenute', 'netto'].find(key => !present.includes(key));
  rec.meta.inferiti.push('totali.' + inferred);
  markField(rec, 'totali.' + inferred, { confidence: 0.58, source: 'vincolo-matematico', method: 'quadratura', inferred: true });
  warnings.push('Il ' + inferred + ' non era leggibile ed è stato ricavato matematicamente dagli altri totali: verificalo sul cedolino.');
}

function quadraturaTotali(totals) {
  const t = totals || {};
  if (t.competenze == null || t.trattenute == null || t.netto == null) return { completa: false, ok: false };
  const base = t.competenze - t.trattenute;
  const rounding = t.arrotondamento || 0;
  const withRounding = base + rounding;
  const deltaWithRounding = Math.abs(withRounding - t.netto);
  const deltaBase = Math.abs(base - t.netto);
  if (deltaWithRounding <= 0.05) {
    return { completa: true, ok: true, modalita: 'arrotondamento-dichiarato', atteso: withRounding, base, scarto: deltaWithRounding };
  }
  if (deltaBase <= 0.05 || (Number.isInteger(t.netto) && deltaBase <= 0.51)) {
    return { completa: true, ok: true, modalita: 'netto-arrotondato', atteso: base, base, scarto: deltaBase };
  }
  return {
    completa: true,
    ok: false,
    modalita: deltaWithRounding < deltaBase ? 'arrotondamento-dichiarato' : 'senza-arrotondamento',
    atteso: deltaWithRounding < deltaBase ? withRounding : base,
    base,
    scarto: Math.min(deltaWithRounding, deltaBase),
  };
}

function valutaCoerenza(rec) {
  const checks = [];
  const quadratura = quadraturaTotali(rec.totali);
  if (quadratura.completa) checks.push({ id: 'totali', ok: quadratura.ok, delta: quadratura.scarto, weight: 4 });
  const sumCompetences = (rec.voci || []).reduce((sum, voice) => sum + Number(voice.competenza || 0), 0);
  const sumDeductions = (rec.voci || []).reduce((sum, voice) => sum + Number(voice.trattenuta || 0), 0);
  const competenceRows = (rec.voci || []).filter(voice => voice.competenza != null).length;
  const deductionRows = (rec.voci || []).filter(voice => voice.trattenuta != null).length;
  if (rec.totali.competenze != null && competenceRows >= 2 && sumCompetences > 0) {
    const delta = Math.abs(rec.totali.competenze - sumCompetences);
    checks.push({ id: 'somma-competenze', ok: delta <= Math.max(.08, rec.totali.competenze * .015), delta, weight: 2 });
  }
  if (rec.totali.trattenute != null && deductionRows >= 2 && sumDeductions > 0) {
    const delta = Math.abs(rec.totali.trattenute - sumDeductions);
    checks.push({ id: 'somma-trattenute', ok: delta <= Math.max(.08, rec.totali.trattenute * .015), delta, weight: 2 });
  }
  for (let i = 0; i < (rec.voci || []).length; i++) {
    const voice = rec.voci[i];
    const amount = voice.competenza ?? voice.trattenuta;
    if (voice.base == null || voice.rifQta == null || amount == null) continue;
    const expected = Math.abs(voice.base * voice.rifQta * (/^%$/.test(voice.rifUnita || '') ? .01 : 1));
    const delta = Math.abs(expected - Math.abs(amount));
    const tolerance = Math.max(0.08, Math.abs(amount) * 0.02);
    checks.push({ id: 'voce.' + i, ok: delta <= tolerance, delta, weight: 1 });
    voice.meta = voice.meta || {};
    voice.meta.rowMatches = delta <= tolerance;
    if (voice.meta.confidence == null) voice.meta.confidence = delta <= tolerance ? 0.82 : 0.58;
  }
  for (const key of ['ferie', 'permessi', 'exFestivita']) {
    const rateo = rec.ratei && rec.ratei[key];
    if (!rateo || rateo.residuoAp == null || rateo.maturato == null || rateo.goduto == null || rateo.saldo == null) continue;
    const expected = rateo.residuoAp + rateo.maturato - rateo.goduto - (rateo.godutoAp || 0);
    const delta = Math.abs(expected - rateo.saldo);
    checks.push({ id: 'ratei.' + key, ok: delta <= 0.08, delta, weight: 2 });
  }
  if (rec.elementi && rec.elementi.totale != null && rec.orario && rec.orario.pagaOraria > 0) {
    const divisore = rec.elementi.totale / rec.orario.pagaOraria;
    const plausible = divisore >= 120 && divisore <= 230;
    checks.push({ id: 'paga-oraria', ok: plausible, delta: plausible ? 0 : Math.min(Math.abs(divisore - 168), Math.abs(divisore - 173)), weight: 1 });
  }
  const derived = derivaIndice(rec);
  if (derived.imponibileIrpef != null && rec.totali.competenze != null) {
    const plausible = derived.imponibileIrpef >= 0 && derived.imponibileIrpef <= rec.totali.competenze * 1.35;
    checks.push({ id: 'imponibile-irpef', ok: plausible, delta: plausible ? 0 : Math.abs(derived.imponibileIrpef - rec.totali.competenze), weight: 1 });
  }
  if (rec.tfr && rec.tfr.retribUtile > 0 && rec.tfr.quotaMese > 0) {
    const expected = rec.tfr.retribUtile / 13.5;
    const delta = Math.abs(rec.tfr.quotaMese - expected);
    checks.push({ id: 'quota-tfr', ok: delta <= Math.max(3, expected * .08), delta, weight: 1 });
  }
  const weight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passed = checks.filter(check => check.ok).reduce((sum, check) => sum + check.weight, 0);
  const result = {
    score: weight ? Math.round(passed / weight * 100) : null,
    checks,
    total: checks.length,
    passed: checks.filter(check => check.ok).length,
  };
  if (rec.meta) {
    rec.meta.reconciliation = rec.meta.reconciliation || {};
    rec.meta.reconciliation.checks = checks;
    rec.meta.reconciliation.score = result.score;
  }
  return result;
}

function annotateFields(rec) {
  const paths = [
    'periodo', 'azienda.nome', 'azienda.cf', 'dipendente.nome', 'dipendente.cf', 'dipendente.livello',
    'dipendente.qualifica', 'dipendente.dataAssunzione', 'ccnl.cnel', 'ccnl.descrizione',
    'elementi.pagaBase', 'elementi.contingenza', 'elementi.superminimo', 'elementi.scatti', 'elementi.totale',
    'orario.oreOrdinarie', 'orario.giorniLavorati', 'orario.pagaOraria', 'orario.pagaGiornaliera',
    'totali.competenze', 'totali.trattenute', 'totali.arrotondamento', 'totali.netto',
    'tfr.retribUtile', 'tfr.quotaMese', 'tfr.fondo3112', 'tfr.quotaAnno',
    'progressivi.impInps', 'progressivi.impIrpef', 'progressivi.irpefPagata',
  ];
  const baseConfidence = rec.meta.fonte === 'ocr' ? 0.58 : (rec.meta.fonte === 'pdf' ? 0.82 : 0.5);
  for (const path of paths) {
    if (getPathValue(rec, path) == null || rec.meta.fields[path]) continue;
    markField(rec, path, {
      confidence: path === 'dipendente.cf' || path === 'ccnl.cnel' ? Math.min(0.97, baseConfidence + 0.12) : baseConfidence,
      source: rec.meta.fonte,
      method: rec.meta.fonte === 'ocr' ? 'ocr-euristica' : 'testo-coordinate',
    });
  }
}

function fieldConfidence(rec, path) {
  const meta = rec && rec.meta && rec.meta.fields && rec.meta.fields[path];
  return meta ? meta.confidence : null;
}

function valutaQualita(rec) {
  let score = 0;
  const details = [];
  if (rec.periodo) score += 10;
  if (rec.dipendente.nome) score += 5;
  if (rec.dipendente.cf) score += 5;
  if (rec.azienda.nome) score += 4;
  if (rec.ccnl.cnel || rec.ccnl.descrizione) score += 6;
  if (rec.elementi.totale != null) score += 6;
  if (rec.elementi.pagaBase != null) score += 4;
  score += Math.min(10, rec.voci.length * 2);
  const structured = rec.voci.filter(voice => voice.competenza != null || voice.trattenuta != null);
  score += Math.min(10, structured.length * 2);
  for (const key of ['competenze', 'trattenute', 'netto']) if (rec.totali[key] != null) score += 8;
  const quadratura = quadraturaTotali(rec.totali);
  if (quadratura.completa) {
    if (quadratura.ok) {
      score += 6;
      details.push('Quadratura del netto riuscita');
    } else {
      details.push('Quadratura del netto da controllare (scarto ' + fmtEur(quadratura.scarto) + ' €)');
    }
  }
  if (rec.tfr.quotaMese != null || rec.tfr.retribUtile != null) score += 4;
  if (rec.ratei.ferie || rec.ratei.permessi) score += 3;
  if (rec.progressivi.impInps != null || rec.progressivi.impIrpef != null) score += 3;
  const consistency = rec.meta && rec.meta.consistency && rec.meta.consistency.score;
  if (consistency != null) score += consistency >= 85 ? 5 : (consistency < 50 ? -8 : 0);
  if (rec.meta.fonte === 'ocr') score = Math.min(score, 85);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 75 ? 'alta' : (score >= 45 ? 'media' : 'bassa');
  return { score, livello: level, dettagli: details };
}

function isCalendarArtifact(voice) {
  if (!voice || String(voice.descrizione || '').trim()) return false;
  const code = String(voice.codice || '').trim();
  if (!/^\d{1,2}$/.test(code)) return false;
  const values = [Number(code), voice.base, voice.rifQta, voice.trattenuta, voice.competenza]
    .filter(value => value != null && Number.isFinite(Number(value)))
    .map(Number);
  return values.length >= 4 && values.every(value => Number.isInteger(value) && value >= 1 && value <= 31);
}

function ripulisciVoci(rec) {
  rec.voci = (rec.voci || []).filter(voice => voice && (voice.descrizione || voice.codice) && !isCalendarArtifact(voice));
  return rec;
}

function ripulisciRecord(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  rec.documento = rec.documento || { tipo: 'ordinario' };
  rec.meta = rec.meta || { fonte: 'sconosciuta', software: 'layout non identificato', inferiti: [] };
  rec.meta.settore = rec.meta.settore || 'privato-lul';
  rec.meta.fields = rec.meta.fields || {};
  rec.meta.candidates = rec.meta.candidates || {};
  rec.meta.reconciliation = rec.meta.reconciliation || {};
  rec.meta.pageSizes = rec.meta.pageSizes || [];
  ripulisciVoci(rec);
  annotateFields(rec);
  rec.meta.consistency = valutaCoerenza(rec);
  rec.derivati = derivaIndice(rec);
  rec.meta.qualita = valutaQualita(rec);
  return rec;
}

function finalizzaRecord(rec, warnings, allLines = null) {
  resolveTotalCandidates(rec);
  inferMissingTotal(rec, warnings);
  if (allLines) attachVisualEvidence(rec, allLines);
  ripulisciVoci(rec);
  annotateFields(rec);
  rec.meta.consistency = valutaCoerenza(rec);
  rec.derivati = derivaIndice(rec);
  rec.meta.qualita = valutaQualita(rec);
  if (!rec.periodo) warnings.push('Periodo di retribuzione non riconosciuto: inseriscilo a mano.');
  if (!rec.voci.length) warnings.push('Non sono state riconosciute righe della tabella voci: compila o controlla le voci manualmente.');
  if (rec.totali.netto == null) warnings.push('Netto non riconosciuto: controllalo e inseriscilo manualmente.');
  if (rec.meta.qualita.livello === 'bassa') warnings.push('Affidabilità di estrazione bassa: controlla ogni campo prima di salvare.');
  return { record: rec, warnings: [...new Set(warnings)] };
}

function parsePdfPages(pages, options = {}) {
  const warnings = [];
  const allLines = (pages || []).map(items => buildLines(items));
  allLines.forEach((lines, page) => lines.forEach(line => { line.page = page; }));
  const fullText = allLines.map(lines => lines.map(line => line.text).join('\n')).join('\n');
  const source = options.source === 'ocr' ? 'ocr' : 'pdf';
  const rec = recordVuoto(source, rilevaSoftware(fullText));
  rec.documento.tipo = rilevaTipoCedolino(fullText);
  rec.meta.settore = typeof parserSectorForText === 'function' ? parserSectorForText(fullText).id : 'privato-lul';
  rec.meta.pageSizes = Array.isArray(options.pageSizes) ? options.pageSizes : [];
  rec.periodo = parsePeriodo(fullText);

  extractIdentity(rec, allLines, fullText);
  extractElements(rec, allLines);
  extractVoices(rec, allLines, warnings);
  extractLabeledFinancialLines(rec, allLines);
  extractContributionTables(rec, allLines);
  extractFiscalSummary(rec, allLines);
  extractTotals(rec, allLines);
  extractProgressivesAndTfr(rec, allLines);
  extractAccruals(rec, allLines);
  extractHours(rec, allLines, fullText);
  return finalizzaRecord(rec, warnings, allLines);
}

function textGrabNumber(text, regex) {
  const match = normalizzaTesto(text).match(regex);
  return match ? itNum(match[1]) : null;
}

function parseFreeText(text) {
  const warnings = ['Estrazione da testo/OCR: precisione limitata, controlla tutti i campi.'];
  const normalized = normalizzaTesto(text);
  const rec = recordVuoto('ocr', rilevaSoftware(normalized));
  rec.documento.tipo = rilevaTipoCedolino(normalized);
  rec.meta.settore = typeof parserSectorForText === 'function' ? parserSectorForText(normalized).id : 'privato-lul';
  rec.periodo = parsePeriodo(normalized);

  const cf = normalized.toUpperCase().match(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/);
  if (cf) rec.dipendente.cf = cf[0];
  const cnel = extractCnelCode(normalized);
  if (cnel) rec.ccnl.cnel = cnel;
  const level = normalized.match(/\bLIVELLO\s*[:.-]?\s*([A-Z0-9.-]{1,8})\b/i)
    || normalized.match(/\b([A-Z0-9.-]{1,8})\s*LIVELLO\b/i);
  if (level) rec.dipendente.livello = level[1];

  rec.totali.netto = textGrabNumber(normalized, /(?:NETTO(?:\s+(?:DEL\s+MESE|A\s+PAGARE|IN\s+BUSTA|PAGATO))?|RETRIBUZIONE\s+NETTA|IMPORTO\s+NETTO)\D{0,28}([+\-−]?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2})/i);
  rec.totali.competenze = textGrabNumber(normalized, /TOT(?:ALE)?\.?\s*(?:COMPETENZE|SPETTANZE|LORDO)\D{0,28}([+\-−]?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2})/i);
  rec.totali.trattenute = textGrabNumber(normalized, /TOT(?:ALE)?\.?\s*(?:TRATTENUTE|RITENUTE|DEDUZIONI)\D{0,28}([+\-−]?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2})/i);

  for (const raw of String(text || '').split(/\n/)) {
    const line = normalizzaTesto(raw);
    if (line.length < 5) continue;
    // Intestazioni con date, codici o livelli contengono numeri ma non sono
    // righe economiche. Vanno escluse prima di rimuovere le cifre, altrimenti
    // "PERIODO 09/2026" diventerebbe una falsa competenza da 2.026 euro.
    if (/^(?:PERIODO|MESE|RATA\s+DI\s+RIFERIMENTO|CODICE\s+CNEL|CCNL\b.*CODICE\s+CNEL|MATRICOLA|CODICE\s+FISCALE|LIVELLO\b)/i.test(line)) continue;
    const hasYear = /\b(?:19|20)\d{2}\b/.test(line);
    const headingText = line.replace(/0/g, 'O');
    const looksLikePeriodHeading = /\b(?:GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE|PERIODO|CED\s*O?LINO|RATA\s+DI\s+RIFERIMENTO)\b/i.test(headingText);
    if (hasYear && looksLikePeriodHeading && !/[,.]\d{2}\b/.test(line)) continue;
    // Titoli come "CEDOLINO PART TIME 60%" non sono una riga economica.
    if (/^(?:CED\s*O?LINO|BUSTA\s+PAGA|PROSPETTO\s+PAGA|LIBRO\s+UNICO)\b/i.test(headingText) && !/[,.]\d{2}\b/.test(line)) continue;
    // 730 è spesso il nome dell'assistenza fiscale, non un importo. Lo
    // proteggiamo durante il riconoscimento numerico e lo ripristiniamo dopo.
    const protectedLine = line.replace(/\b730\b(?=\s|$)/g, 'MODSETTETRENTA');
    const matches = protectedLine.match(NUM_ANY_RE) || [];
    const numbers = matches.map(itNum).filter(value => value != null);
    if (!numbers.length) continue;
    let description = protectedLine.replace(NUM_ANY_RE, ' ').replace(/MODSETTETRENTA/g, '730').replace(/[|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!/[A-Za-zÀ-ù]{3}/.test(description)) continue;
    if (/TOTALE|\bNETTO\b|RETRIBUZIONE\s+NETTA|IMPORTO\s+NETTO|ELEMENTI\s+RETRIBUTIVI|VOCI\s+VARIABILI|RIFERIMENTO|CODICE\s+(?:FISCALE|CNEL)|COGNOME\s+E\s+NOME/i.test(description)
      || /^(?:PAGA\s+BASE|CONTINGENZA|SUPERMINIMO)$/i.test(description)) continue;

    let code = '';
    const codeMatch = description.replace(/^(?:\*\s*)+/, '').match(/^([A-Z0-9][A-Z0-9./_-]{0,11})\s+(.+)$/i);
    if (codeMatch && CODE_TOKEN_RE.test(codeMatch[1])) {
      code = codeMatch[1].toUpperCase();
      description = codeMatch[2];
    }
    description = description.replace(/^[^A-Za-zÀ-ù]{1,4}/, '').replace(/\s*(?:ORE?|GG\.?|GIORNI?|RATEI?|%)\s*$/i, '').trim();
    if (description.length < 3) continue;
    const explicitCredit = /\b(?:A\s+CREDITO|CREDITO|RIMBORSO|RESTITUZIONE)\b/i.test(description);
    const wageReplacement = /\b(?:INTEGRAZIONE\s+SALARIALE|ASSEGNO\s+(?:ORDINARIO|FIS)|INDENNIT[AÀ]\s+(?:DI\s+)?(?:MALATTIA|MATERNIT[AÀ]|PATERNIT[AÀ]|INFORTUNIO))\b/i.test(description);
    const explicitDeduction = /\b(?:CONTRIBUTO|TRATTENUTA|RITENUTA)\b/i.test(description);
    const isCredit = explicitCredit || (wageReplacement && !explicitDeduction);
    const isDeduction = !isCredit && /IRPEF|CONTRIBUT|TRATTENUT|RITENUT|ADDIZIONALE|SINDAC|CESSION|PIGNOR|IVS|FIS\b|INPS/i.test(description);
    const voice = { codice: code, descrizione: description.slice(0, 100), base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null };
    if (numbers.length === 1) {
      if (isDeduction) voice.trattenuta = numbers[0];
      else voice.competenza = numbers[0];
    } else if (numbers.length === 2) {
      voice.base = numbers[0];
      if (isDeduction) voice.trattenuta = numbers[1];
      else voice.competenza = numbers[1];
    } else {
      voice.base = numbers[0];
      voice.rifQta = numbers[1];
      if (isDeduction) voice.trattenuta = numbers[numbers.length - 1];
      else voice.competenza = numbers[numbers.length - 1];
    }
    addSyntheticVoice(rec, voice);
    if (rec.voci.length >= 80) break;
  }
  return finalizzaRecord(rec, warnings);
}

function derivaIndice(rec) {
  const d = {};
  const voices = rec.voci || [];
  const by = test => voices.find(voice => test(voice));
  const code = value => by(voice => String(voice.codice || '').toUpperCase() === value);
  const desc = re => by(voice => re.test(voice.descrizione || ''));

  const taxable = code('F02000') || desc(/IMPONIBILE\s+(?:IRPEF|FISCALE)(?!.*TASS)/i);
  d.imponibileIrpef = taxable ? (taxable.base ?? taxable.rifQta) : null;
  const grossTax = code('F02010') || desc(/IRPEF\s+LORDA/i);
  d.irpefLorda = grossTax ? (grossTax.base ?? grossTax.trattenuta) : null;
  const deduction = code('F02500') || desc(/DETRAZIONI?\s+(?:LAV|LAVORO)/i);
  d.detrazioni = deduction ? (deduction.base ?? deduction.competenza) : null;
  const extraDeduction = code('F02801') || desc(/ULTERIORE\s+DETRAZIONE/i);
  d.ulterioreDetrazione = extraDeduction ? (extraDeduction.base ?? extraDeduction.competenza) : null;
  const withholding = code('F03020') || desc(/RITENUTE?\s+IRPEF/i);
  d.ritenuteIrpef = withholding ? withholding.trattenuta : null;

  const social = code('Z00000') || desc(/\bIVS\b|CONTRIBUTO.*INPS|F\.?\s*P\.?\s*L\.?\s*D\.?|^INPS$/i);
  if (social) d.ivs = { imponibile: social.base, perc: social.rifQta, importo: social.trattenuta };
  const fis = code('Z00054') || desc(/\bFIS\b|FONDO\s+INTEGR.*SALARIALE/i);
  if (fis) d.fis = { imponibile: fis.base, perc: fis.rifQta, importo: fis.trattenuta };
  const thirteenth = desc(/13.?MA|TREDICESIMA/i);
  if (thirteenth) d.rateo13 = thirteenth.competenza;
  const fourteenth = desc(/14.?MA|QUATTORDICESIMA/i);
  if (fourteenth) d.rateo14 = fourteenth.competenza;
  const ordinary = code('Z00001') || code('0') || desc(/^(?:RETRIBUZIONE|PAGA|LAVORO)\s+(?:ORDINARIA|NORMALE)$/i);
  if (ordinary) {
    const unit = String(ordinary.rifUnita || '').toUpperCase();
    d.retribuzione = {
      oraria: /^(?:ORE|ORA|H)$/.test(unit) ? ordinary.base : (rec.orario && rec.orario.pagaOraria != null ? rec.orario.pagaOraria : null),
      giornaliera: /^(?:GG|GIORNO|GIORNI)$/.test(unit) ? ordinary.base : (rec.orario && rec.orario.pagaGiornaliera != null ? rec.orario.pagaGiornaliera : null),
      quantita: ordinary.rifQta,
      unita: unit,
      importo: ordinary.competenza,
    };
  }
  const regional = code('F09110') || desc(/ADDIZ(?:IONALE|\.)?\s*(?:REGION|REG\.)/i);
  if (regional) d.addRegionale = regional.trattenuta;
  const municipal = code('F09101') || desc(/ADDIZ(?:IONALE|\.)?\s*(?:COMUN|COM\.)/i);
  if (municipal) d.addComunale = municipal.trattenuta;
  const sunday = desc(/DOMENICAL/i);
  if (sunday) d.domenicale = { oraria: sunday.base, ore: sunday.rifQta, importo: sunday.competenza };
  const holiday = by(voice => /MAGG.*FESTIV|LAVORO\s+FESTIV|FESTIV.*MAGG/i.test(voice.descrizione || '') && voice.competenza != null)
    || by(voice => /FESTIV/i.test(voice.descrizione || '') && /^(?:ORE|ORA|H)$/i.test(voice.rifUnita || '') && voice.competenza != null && !/EX\s*FEST/i.test(voice.descrizione || ''));
  if (holiday) d.festivo = { oraria: holiday.base, ore: holiday.rifQta, importo: holiday.competenza, descrizione: holiday.descrizione };
  return d;
}

function trovaCcnl(rec, db, custom = []) {
  const all = [...custom, ...db];
  const cnel = String(rec.ccnl && rec.ccnl.cnel || '').toUpperCase();
  if (cnel) {
    const exact = all.find(contract => (contract.cnel || []).map(String).map(code => code.toUpperCase()).includes(cnel));
    if (exact) return exact;
    const official = cnelContractByCode(cnel);
    if (official) return official;
  }
  const suggestions = suggerisciCcnl(rec, db, custom, 3);
  if (suggestions.length) {
    const first = suggestions[0], second = suggestions[1];
    if (first.score >= .82 && (!second || first.score - second.score >= .14)) return first.contract;
  }
  return null;
}

const CCNL_STOPWORDS = new Set(['CCNL', 'CONTRATTO', 'COLLETTIVO', 'NAZIONALE', 'LAVORO', 'DIPENDENTI', 'AZIENDE', 'AZIENDA', 'SETTORE', 'DELLA', 'DELLE', 'DEGLI', 'PER', 'CON', 'NEL', 'DAL']);
function ccnlTokens(value) {
  return plain(value).split(/[^A-Z0-9]+/).filter(token => token.length >= 4 && !CCNL_STOPWORDS.has(token));
}

function suggerisciCcnl(rec, db, custom = [], limit = 3) {
  const all = [...custom, ...db];
  const code = String(rec.ccnl && rec.ccnl.cnel || '').trim().toUpperCase();
  const text = [rec.ccnl && rec.ccnl.descrizione, rec.ccnl && rec.ccnl.nomeManuale, rec.meta && rec.meta.settore].filter(Boolean).join(' ');
  const tokens = ccnlTokens(text);
  const suggestions = [];
  for (const contract of all) {
    let score = 0;
    const reasons = [];
    if (code && (contract.cnel || []).map(String).map(item => item.toUpperCase()).includes(code)) {
      score = 1; reasons.push(`codice CNEL ${code} esatto`);
    }
    let regexHits = 0;
    for (const re of contract.match || []) {
      re.lastIndex = 0;
      if (text && re.test(text)) regexHits++;
    }
    if (regexHits) {
      score = Math.max(score, Math.min(.9, .62 + regexHits * .09));
      reasons.push(regexHits === 1 ? 'denominazione compatibile' : `${regexHits} segnali nella denominazione`);
    }
    const haystack = plain([contract.nome, contract.firmatari, ...(contract.cnel || [])].join(' '));
    const tokenHits = tokens.filter(token => haystack.includes(token));
    if (tokenHits.length) {
      score = Math.max(score, .42 + .45 * tokenHits.length / Math.max(2, tokens.length));
      reasons.push(`parole: ${tokenHits.slice(0, 3).join(', ').toLowerCase()}`);
    }
    if (score >= .42) suggestions.push({ contract, score: Math.min(1, score), reasons });
  }
  if (typeof CNEL_INDEX !== 'undefined' && tokens.length >= 2) {
    for (const [officialCode, entry] of Object.entries(CNEL_INDEX)) {
      if (all.some(contract => (contract.cnel || []).map(String).map(item => item.toUpperCase()).includes(officialCode))) continue;
      const haystack = plain([entry.n, ...(entry.a || []), ...(entry.s || [])].join(' '));
      const hits = tokens.filter(token => haystack.includes(token));
      if (hits.length < 2) continue;
      const score = Math.min(.86, .38 + .5 * hits.length / tokens.length);
      if (score < .55) continue;
      suggestions.push({ contract: cnelContractByCode(officialCode), score, reasons: [`parole ufficiali CNEL: ${hits.slice(0, 3).join(', ').toLowerCase()}`] });
    }
  }
  const unique = new Map();
  for (const suggestion of suggestions.sort((a, b) => b.score - a.score)) {
    if (!suggestion.contract || unique.has(suggestion.contract.id)) continue;
    unique.set(suggestion.contract.id, suggestion);
  }
  return [...unique.values()].slice(0, Math.max(1, limit)).map(item => Object.assign(item, { score: Number(item.score.toFixed(2)) }));
}

function cnelContractByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || typeof CNEL_INDEX === 'undefined' || !CNEL_INDEX[normalized]) return null;
  const entry = CNEL_INDEX[normalized];
  return {
    id: 'cnel-' + normalized.toLowerCase(),
    nome: entry.n || ('CCNL ' + normalized),
    cnel: [normalized],
    match: [],
    settoreUfficiale: (entry.s || []).join(' · '),
    decorrenza: entry.d || null,
    scadenza: entry.e || null,
    officialOnly: true,
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
    note: 'Contratto identificato nell’Open Data ufficiale CNEL. BustaChiara non possiede ancora le regole economiche dettagliate di questo CCNL: nome e codice sono ufficiali, i controlli contrattuali specifici restano disattivati.',
  };
}

function findOfficialCcnlByText(value) {
  if (typeof CNEL_INDEX === 'undefined') return null;
  const normalized = plain(value).replace(/\b(?:CCNL|CONTRATTO|COLLETTIVO|NAZIONALE|LAVORO|DIPENDENTI|AZIENDE|PER|DEL|DELLA|DEI|NEL|SETTORE)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(' ').filter(token => token.length >= 5);
  if (tokens.length < 2) return null;
  let best = null;
  for (const [code, entry] of Object.entries(CNEL_INDEX)) {
    const haystack = plain([entry.n, ...(entry.a || []), ...(entry.s || [])].join(' '));
    const hits = tokens.filter(token => haystack.includes(token)).length;
    const score = hits / tokens.length;
    if (hits >= 2 && score >= 0.66 && (!best || score > best.score)) best = { code, score };
  }
  return best ? cnelContractByCode(best.code) : null;
}

// eslint-disable-next-line no-unused-vars
const Parser = { parsePdfPages, parseFreeText, trovaCcnl, suggerisciCcnl, cnelContractByCode, itNum, fmtEur, buildLines, MESI_IT, derivaIndice, valutaQualita, valutaCoerenza, fieldConfidence, normalizzaTesto, ripulisciRecord, quadraturaTotali, rilevaTipoCedolino };
