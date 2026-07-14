/* ============================================================
   BustaChiara — Parser cedolini
   Input: per ogni pagina, gli item testuali di pdf.js
   { str, x, y, w } (y crescente verso l'alto in pdf.js).
   Output: { record, warnings } — SEMPRE da confermare a schermo.
   ============================================================ */

const MESI_IT = { gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6, luglio:7, agosto:8, settembre:9, ottobre:10, novembre:11, dicembre:12 };
const NUM_RE = /^\(?\s*-?\d{1,3}(?:\.\d{3})*(?:,\d{1,5})\s*\)?\s*€?$/;
const NUM_ANY_RE = /-?\d{1,3}(?:\.\d{3})*(?:,\d{1,5})/g;

function itNum(s) {
  if (s == null) return null;
  s = String(s).trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const m = s.replace(/[()€\s-]/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,5})?$/.test(m)) return null;
  const v = parseFloat(m.replace(/\./g, '').replace(',', '.'));
  return neg ? -v : v;
}
function fmtEur(v, dec = 2) {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/* Etichette Zucchetti: gli spazi del font piccolo si estraggono come "s".
   L(...parole) crea una regex tollerante a entrambe le forme. */
function L(...words) {
  return new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s.s]{0,3}'), 'i');
}

/* Raggruppa gli item in righe per coordinata y (tolleranza), ordina per x. */
function buildLines(items, tol = 3.5) {
  const rows = [];
  for (const it of items) {
    const s = (it.str || '').trim();
    if (!s) continue;
    let row = rows.find(r => Math.abs(r.y - it.y) <= tol);
    if (!row) { row = { y: it.y, cells: [] }; rows.push(row); }
    row.cells.push({ x: it.x, w: it.w || 0, str: s });
  }
  rows.sort((a, b) => b.y - a.y); // dall'alto verso il basso
  for (const r of rows) {
    r.cells.sort((a, b) => a.x - b.x);
    r.text = r.cells.map(c => c.str).join(' ');
  }
  return rows;
}

function findLine(lines, re, from = 0) {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].text)) return i;
  return -1;
}
function cellCenter(c) { return c.x + (c.w || 0) / 2; }

/* Valore numerico più vicino (in x) a una etichetta, cercando nelle righe successive. */
function numberBelow(lines, li, labelCell, maxRows = 3, maxDx = 70) {
  for (let j = li + 1; j <= Math.min(li + maxRows, lines.length - 1); j++) {
    let best = null, bestDx = maxDx;
    for (const c of lines[j].cells) {
      if (!NUM_RE.test(c.str)) continue;
      const dx = Math.abs(cellCenter(c) - cellCenter(labelCell));
      if (dx < bestDx) { bestDx = dx; best = c; }
    }
    if (best) return itNum(best.str);
  }
  return null;
}

function parsePeriodo(text) {
  let m = text.match(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\b/i);
  if (m) return { mese: MESI_IT[m[1].toLowerCase()], anno: +m[2], label: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] };
  m = text.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (m) return { mese: +m[1], anno: +m[2], label: m[1] + '/' + m[2] };
  return null;
}

/* ---------- Parser principale (layout Zucchetti + euristiche generiche) ---------- */
function parsePdfPages(pages) {
  const warnings = [];
  const allLines = pages.map(items => buildLines(items));
  const fullText = allLines.map(ls => ls.map(l => l.text).join('\n')).join('\n');

  const rec = {
    periodo: parsePeriodo(fullText),
    azienda: {}, dipendente: {}, ccnl: {}, elementi: { altri: [] },
    orario: {}, voci: [], tfr: {}, progressivi: {}, ratei: {}, totali: {},
    meta: { fonte: 'pdf', software: /zucchetti/i.test(fullText) ? 'Zucchetti' : 'sconosciuto' },
  };
  if (!rec.periodo) warnings.push('Periodo di retribuzione non riconosciuto: inseriscilo a mano.');

  // Codice fiscale dipendente (16 char) e azienda (11 cifre)
  const cfDip = fullText.match(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/);
  if (cfDip) rec.dipendente.cf = cfDip[0];
  const cfAz = fullText.match(/\b\d{11}\b/);
  if (cfAz) rec.azienda.cf = cfAz[0];

  // CNEL + descrizione contratto (ripulita da eventuali numeri della riga dati)
  const cnel = fullText.match(/CNEL\s+([A-Z]\d{2,3}[A-Z0-9]?)\b\s*([^\n]*(?:\n[^\n]*)?)/i);
  if (cnel) {
    rec.ccnl.cnel = cnel[1].toUpperCase();
    const descr = (cnel[2] || '').replace(/[\d.,%\s]+/g, ' ').trim().split('\n')[0]
      .replace(/\s{2,}/g, ' ').trim();
    const m = (cnel[2] || '').match(/([A-Za-zÀ-ù][A-Za-zÀ-ù .'-]{5,})/);
    rec.ccnl.descrizione = m ? m[1].trim() : (descr || null);
  }

  // Livello e qualifica
  const liv = fullText.match(/(\d+)\s*(?:['°ª^]|\b)\s*Livello/i);
  if (liv) rec.dipendente.livello = liv[1];
  const qual = fullText.match(/\b(IMP|IMPIEGATO|OPE|OPERAIO|QUA|QUADRO|DIR|DIRIGENTE|APP|APPRENDISTA)\b/);
  if (qual) rec.dipendente.qualifica = qual[1];

  const lines0 = allLines[0] || [];

  // Ragione sociale: riga con l'etichetta, valore dopo il codice azienda
  let i = findLine(lines0, L('Ragione', 'Sociale'));
  if (i >= 0 && lines0[i + 1]) {
    const cells = lines0[i + 1].cells.filter(c => !/^\d{4,}$/.test(c.str));
    if (cells.length) rec.azienda.nome = cells.map(c => c.str).join(' ').trim();
  }

  // Nome dipendente: riga sotto COGNOME E NOME
  i = findLine(lines0, L('COGNOME', 'E', 'NOME'));
  if (i >= 0 && lines0[i + 1]) {
    const cells = lines0[i + 1].cells.filter(c => /^[A-ZÀ-Ù' ]{2,}$/.test(c.str) && !/^\d/.test(c.str) && c.str.length > 2 && !/^[A-Z]{6}\d/.test(c.str));
    if (cells.length) rec.dipendente.nome = cells.map(c => c.str).join(' ').trim();
  }

  // Date: nascita e assunzione (dd-mm-yyyy) nelle prime righe dopo l'etichetta
  i = findLine(lines0, L('Data', 'di', 'Nascita'));
  if (i >= 0) {
    const dates = [];
    for (let j = i; j < Math.min(i + 3, lines0.length); j++) {
      for (const m of lines0[j].text.matchAll(/\b(\d{2})-(\d{2})-(\d{4})\b/g)) dates.push(m[0]);
    }
    if (dates[0]) rec.dipendente.dataNascita = dates[0];
    if (dates[1]) rec.dipendente.dataAssunzione = dates[1];
  }

  // Elementi della retribuzione: etichette e valori a 3+ decimali
  const elemLabels = [
    { re: /^PAGA\s*BASE/i, k: 'pagaBase', nome: 'Paga base' },
    { re: /^CONTINGENZA/i, k: 'contingenza', nome: 'Contingenza' },
    { re: /^SUP\.?\s*ASS/i, k: 'superminimo', nome: 'Superminimo assorbibile' },
    { re: /^SUPERMINIMO/i, k: 'superminimo', nome: 'Superminimo' },
    { re: /^SCATTI/i, k: 'scatti', nome: 'Scatti anzianità' },
    { re: /^E\.?D\.?R/i, k: 'edr', nome: 'E.D.R.' },
    { re: /^TERZO\s*ELEM/i, k: 'terzoElemento', nome: 'Terzo elemento' },
  ];
  for (const lines of allLines) {
    for (let li = 0; li < lines.length; li++) {
      for (const c of lines[li].cells) {
        for (const el of elemLabels) {
          if (el.re.test(c.str) && rec.elementi[el.k] == null) {
            const v = numberBelow(lines, li, c, 2, 90);
            if (v != null) rec.elementi[el.k] = v;
          }
        }
      }
      if (rec.elementi.totale == null) {
        const totCell = lines[li].cells.find(c => /^TOTALE$/i.test(c.str));
        if (totCell) {
          const v = numberBelow(lines, li, totCell, 2, 130);
          if (v != null && v > 100) rec.elementi.totale = v;
        }
      }
    }
    if (rec.elementi.totale != null) break;
  }
  // Prossimo scatto
  const scatto = fullText.match(/PROSSIMO\s*SCATTO[\s\S]{0,40}?\b(\d{1,2}-\d{4})\b/i) || fullText.match(/\b(\d{1,2}-20\d{2})\b(?=[\s\S]{0,80}TOTALE)/);
  if (scatto) rec.orario.prossimoScatto = scatto[1];

  // Ore ordinarie lavorate (riga dati sotto LAVORATO)
  const lav = fullText.match(/Ore\s*ordinarie[\s\S]{0,220}?\b(\d{2,3},\d{2})\b/i);
  if (lav) rec.orario.oreOrdinarie = itNum(lav[1]);

  /* ---- Tabella VOCI ---- */
  const CODE_RE = /^[A-Z0-9]{5,6}$/;
  const isCodeCell = c => CODE_RE.test(c.str) && /\d/.test(c.str);
  const UNIT_RE = /^(ORE|GG\.?|%|NR\.?|H)$/i;
  for (const lines of allLines) {
    let hi = findLine(lines, L('VOCI', 'VARIABILI'));
    const heads = {};
    if (hi >= 0) {
      for (const c of lines[hi].cells) {
        if (L('IMPORTO', 'BASE').test(c.str)) heads.base = cellCenter(c);
        else if (/RIFERIMENTO/i.test(c.str)) heads.rif = cellCenter(c);
        else if (/TRATTENUTE/i.test(c.str)) heads.tratt = cellCenter(c);
        else if (/COMPETENZE/i.test(c.str)) heads.comp = cellCenter(c);
        else if (L('VOCI', 'VARIABILI').test(c.str)) heads.desc = cellCenter(c);
      }
    }
    // Fallback (essenziale per gli screenshot): se l'intestazione manca o è
    // incompleta, ricava i centri colonna dai numeri delle righe con codice,
    // usando le unità (ORE/GG/%) come ancora della colonna "riferimento".
    const primaRigaCodice = (() => {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].cells.some(isCodeCell) && lines[i].cells.some(c => NUM_RE.test(c.str))) return i;
      }
      return -1;
    })();
    if ((hi < 0 || heads.base == null || heads.comp == null) && primaRigaCodice >= 0) {
      if (hi < 0) hi = primaRigaCodice - 1;
      const centri = [], unita = [];
      for (let i = primaRigaCodice; i < lines.length; i++) {
        if (!lines[i].cells.some(isCodeCell)) continue;
        for (const c of lines[i].cells) {
          if (NUM_RE.test(c.str)) centri.push(cellCenter(c));
          else if (UNIT_RE.test(c.str)) unita.push(cellCenter(c));
        }
      }
      centri.sort((a, b) => a - b);
      const cluster = [];
      for (const x of centri) {
        const ult = cluster[cluster.length - 1];
        if (ult && x - ult.max < 30) { ult.sum += x; ult.n++; ult.max = x; }
        else cluster.push({ sum: x, n: 1, max: x });
      }
      const cs = cluster.filter(c => c.n >= 2).map(c => c.sum / c.n);
      if (cs.length >= 2) {
        let rifIdx = -1;
        if (unita.length) {
          const um = unita.reduce((a, b) => a + b, 0) / unita.length;
          let best = 1e9;
          cs.forEach((x, i) => { const d = um - x; if (d > -12 && d < best) { best = d; rifIdx = i; } });
        }
        if (heads.comp == null) heads.comp = cs[cs.length - 1];
        if (rifIdx >= 0) {
          if (heads.rif == null) heads.rif = cs[rifIdx];
          if (heads.base == null && rifIdx >= 1) heads.base = cs[rifIdx - 1];
          if (heads.tratt == null) for (let i = rifIdx + 1; i < cs.length - 1; i++) { heads.tratt = cs[i]; break; }
        } else if (cs.length >= 4) {
          if (heads.base == null) heads.base = cs[0];
          if (heads.rif == null) heads.rif = cs[1];
          if (heads.tratt == null) heads.tratt = cs[2];
        } else if (heads.base == null) heads.base = cs[0];
        if (heads.desc == null && heads.base != null) heads.desc = Math.max(0, heads.base - 150);
      }
    }
    if (hi < 0 && heads.base == null && heads.comp == null) continue;
    if (heads.comp == null || heads.base == null) { warnings.push('Intestazioni della tabella voci non riconosciute: controlla le voci estratte.'); }
    const stopRe = /^(CONGUAGLIO|PROGRESSIVI|T\.?F\.?R\.?|RATEI|COMUNICAZIONI)\b/i;
    for (let li = Math.max(0, hi + 1); li < lines.length; li++) {
      const ln = lines[li];
      if (stopRe.test(ln.text.replace(/[\ss]+/g, ' ').trim()) && ln.cells.length <= 2) break;
      const cells = ln.cells.filter(c => c.str !== '*' && !/^\*+$/.test(c.str));
      if (!cells.length) continue;
      // righe informative senza codice (sezione TFR/INAIL in coda alle voci)
      const flat = cells.map(c => c.str).join(' ');
      if (/retribuzione\s+utile\s+t\.?f\.?r/i.test(flat)) { rec.tfr.retribUtile = firstNum(cells); continue; }
      if (/^quota\s+t\.?f\.?r/i.test(flat.trim())) { rec.tfr.quotaMese = firstNum(cells); continue; }
      if (/imp\.?\s*inail/i.test(flat)) { rec.orario.impInail = firstNum(cells); continue; }

      const codeCell = cells.find(c => isCodeCell(c) && (heads.base == null || cellCenter(c) < heads.base - 60));
      if (!codeCell) continue;
      const cleanCells = cells.filter(c => !/^[()]+$/.test(c.str));
      const voce = { codice: codeCell.str, descrizione: '', base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null, cDitta: false };
      const descParts = [], rifText = [];
      for (const c of cleanCells) {
        if (c === codeCell) continue;
        const cc = cellCenter(c);
        const isNum = NUM_RE.test(c.str);
        const zone = nearestZone(cc, heads);
        if (!isNum) {
          if (/^C\/?Ditta$/i.test(c.str)) { voce.cDitta = true; continue; }
          if (UNIT_RE.test(c.str)) { voce.rifUnita = c.str.replace('.', ''); continue; }
          if (zone === 'rif' || zone === 'tratt') { rifText.push(c.str); continue; }
          if (cc < (heads.base != null ? heads.base - 40 : 1e9)) descParts.push(c.str);
          else rifText.push(c.str);
          continue;
        }
        const v = itNum(c.str);
        if (zone === 'base') voce.base = v;
        else if (zone === 'rif') voce.rifQta = v;
        else if (zone === 'tratt') voce.trattenuta = v;
        else if (zone === 'comp') voce.competenza = v;
        else descParts.push(c.str);
      }
      voce.descrizione = descParts.join(' ').trim();
      if (rifText.length) voce.rifTesto = rifText.join(' ');
      // parentesi = costo azienda
      if (voce.cDitta && voce.competenza != null) { voce.costoAzienda = Math.abs(voce.competenza); voce.competenza = null; }
      rec.voci.push(voce);
    }
  }
  function firstNum(cells) { for (const c of cells) { const v = itNum(c.str); if (v != null) return v; } return null; }
  function nearestZone(x, heads) {
    let best = null, bd = 1e9;
    for (const [k, hx] of Object.entries(heads)) {
      if (hx == null) continue;
      const d = Math.abs(x - hx);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /* ---- Totali ---- */
  for (const lines of allLines) {
    for (let li = 0; li < lines.length; li++) {
      const t = lines[li].text;
      if (L('TOTALE', 'COMPETENZE').test(t)) rec.totali.competenze = lastNumInLine(lines[li]) ?? rec.totali.competenze;
      if (L('TOTALE', 'TRATTENUTE').test(t)) rec.totali.trattenute = lastNumInLine(lines[li]) ?? rec.totali.trattenute;
      if (/ARROTONDAMENTO/i.test(t)) rec.totali.arrotondamento = lastNumInLine(lines[li]) ?? rec.totali.arrotondamento;
      if (L('NETTO', 'DEL', 'MESE').test(t)) {
        let v = lastNumInLine(lines[li]);
        if (v == null) for (let j = li + 1; j <= li + 2 && j < lines.length; j++) { v = lastNumInLine(lines[j]); if (v != null) break; }
        if (v != null) rec.totali.netto = v;
      }
    }
  }
  function lastNumInLine(line) {
    for (let k = line.cells.length - 1; k >= 0; k--) { const v = itNum(line.cells[k].str); if (v != null) return v; }
    return null;
  }

  /* ---- Progressivi / TFR / Ratei (etichette con valori sotto) ---- */
  const progLabels = [
    [L('Imp', 'INPS'), 'impInps'], [L('Imp', 'INAIL'), 'impInail'],
    [L('Imp', 'IRPEF'), 'impIrpef'], [L('IRPEF', 'pagata'), 'irpefPagata'],
  ];
  const tfrLabels = [
    [L('F', 'do', '31/12'), 'fondo3112'], [/Rivalutaz/i, 'rivalutazione'],
    [L('Imp', 'rival'), 'impRivalutazione'], [L('Quota', 'anno'), 'quotaAnno'],
    [L('TFR', 'a', 'fondi'), 'aFondi'], [/Anticipi/i, 'anticipi'],
  ];
  /* Assegna i valori sotto una riga di etichette in modo UNO-A-UNO:
     ogni numero va solo all'etichetta più vicina, così le colonne vuote
     (es. "TFR a fondi", "Anticipi") restano vuote. */
  function assignGroup(lines, li, defs, out) {
    const labelCells = [];
    for (const c of lines[li].cells) for (const [re, k] of defs) if (re.test(c.str) && out[k] == null) labelCells.push({ c, k });
    if (!labelCells.length) return;
    for (let j = li + 1; j <= Math.min(li + 2, lines.length - 1); j++) {
      if (/TOTALE|NETTO|ARROTOND/i.test(lines[j].text)) continue; // colonna dei totali a destra
      const numCells = lines[j].cells.filter(c => NUM_RE.test(c.str));
      if (!numCells.length) continue;
      const pairs = [];
      for (const lc of labelCells) for (const nc of numCells) {
        const dx = Math.abs(cellCenter(nc) - cellCenter(lc.c));
        if (dx <= 60) pairs.push({ lc, nc, dx });
      }
      pairs.sort((a, b) => a.dx - b.dx);
      const usedL = new Set(), usedN = new Set();
      for (const p of pairs) {
        if (usedL.has(p.lc) || usedN.has(p.nc)) continue;
        usedL.add(p.lc); usedN.add(p.nc);
        out[p.lc.k] = itNum(p.nc.str);
      }
      if (usedL.size) return;
    }
  }
  for (const lines of allLines) {
    for (let li = 0; li < lines.length; li++) {
      assignGroup(lines, li, progLabels, rec.progressivi);
      assignGroup(lines, li, tfrLabels, rec.tfr);
      // Ratei: Ferie / Permessi / ROL — 4 numeri: residuo AP, maturato, goduto, saldo
      const first = lines[li].cells[0];
      if (first && /^(Ferie|Permessi|Rol|ROL|Ex\s*fest)/i.test(first.str)) {
        const nums = lines[li].cells.map(c => itNum(c.str)).filter(v => v != null);
        const unit = /GG/i.test(lines[li].text) ? 'GG' : (/ORE/i.test(lines[li].text) ? 'ORE' : '');
        if (nums.length >= 4) {
          const k = /ferie/i.test(first.str) ? 'ferie' : (/permessi|rol/i.test(first.str) ? 'permessi' : 'exFestivita');
          rec.ratei[k] = { residuoAp: nums[0], maturato: nums[1], goduto: nums[2], saldo: nums[3], unita: unit };
        }
      }
    }
  }

  /* ---- Indice derivato dalle voci (per i controlli) ---- */
  rec.derivati = derivaIndice(rec);
  return { record: rec, warnings };
}

/* Estrae i valori chiave dalle voci, per codice Zucchetti o per descrizione. */
function derivaIndice(rec) {
  const d = {};
  const by = (test) => rec.voci.find(v => test(v));
  const code = (c) => by(v => v.codice === c);
  const desc = (re) => by(v => re.test(v.descrizione));

  const vImp = code('F02000') || desc(/imponibile\s+(irpef|fiscale)(?!.*tass)/i);
  d.imponibileIrpef = vImp ? vImp.base : null;
  const vLorda = by(v => (v.codice === 'F02010') || (/irpef\s+lorda/i.test(v.descrizione) && !/tass/i.test(v.descrizione)));
  d.irpefLorda = vLorda ? (vLorda.base ?? vLorda.trattenuta) : null;
  const vDetr = code('F02500') || desc(/detrazioni\s+lav/i);
  d.detrazioni = vDetr ? (vDetr.base ?? vDetr.competenza) : null;
  const vUlt = code('F02801') || desc(/ulteriore\s+detrazione/i);
  d.ulterioreDetrazione = vUlt ? (vUlt.base ?? vUlt.competenza) : null;
  const vRit = code('F03020') || by(v => /ritenute?\s+irpef/i.test(v.descrizione) && !/tass/i.test(v.descrizione));
  d.ritenuteIrpef = vRit ? vRit.trattenuta : null;
  const vIvs = code('Z00000') || desc(/\bIVS\b|contributo.*inps|f\.?p\.?l\.?d/i);
  if (vIvs) d.ivs = { imponibile: vIvs.base, perc: vIvs.rifQta, importo: vIvs.trattenuta };
  const vFis = code('Z00054') || desc(/\bFIS\b/i);
  if (vFis) d.fis = { imponibile: vFis.base, perc: vFis.rifQta, importo: vFis.trattenuta };
  const vTratt13 = desc(/13.?ma|tredicesima/i); if (vTratt13) d.rateo13 = vTratt13.competenza;
  const vTratt14 = desc(/14.?ma|quattordicesima/i); if (vTratt14) d.rateo14 = vTratt14.competenza;
  const vSost = code('F03325') || desc(/imposta\s+sostitutiva.*(rinnov|199)/i);
  if (vSost) d.impSostRinnovi = vSost.trattenuta;
  const vSostImp = code('F03320') || desc(/imponibile\s+rinnovi/i);
  if (vSostImp) d.impRinnovi = vSostImp.base;
  const vRetr = code('Z00001') || desc(/^retribuzione$|retribuzione\s+ordinaria/i);
  if (vRetr) d.retribuzione = { oraria: vRetr.base, ore: vRetr.rifQta, importo: vRetr.competenza };
  const vAddR = code('F09110') || desc(/addizionale\s+regionale/i);
  if (vAddR) d.addRegionale = vAddR.trattenuta;
  const vAddC = code('F09101') || desc(/addizionale\s+comunale/i);
  if (vAddC) d.addComunale = vAddC.trattenuta;
  const vDom = desc(/domenical/i);
  if (vDom) d.domenicale = { oraria: vDom.base, ore: vDom.rifQta, importo: vDom.competenza };
  const vFest = by(v => /festiv/i.test(v.descrizione) && v.competenza != null && !/ex\s*fest/i.test(v.descrizione));
  if (vFest) d.festivo = { oraria: vFest.base, ore: vFest.rifQta, importo: vFest.competenza };
  return d;
}

/* ---------- Parser da testo libero (OCR / altri formati) ---------- */
function parseFreeText(text) {
  const warnings = ['Estrazione da testo/OCR: precisione limitata, controlla TUTTI i campi.'];
  const rec = {
    periodo: parsePeriodo(text),
    azienda: {}, dipendente: {}, ccnl: {}, elementi: { altri: [] },
    orario: {}, voci: [], tfr: {}, progressivi: {}, ratei: {}, totali: {},
    meta: { fonte: 'ocr', software: 'sconosciuto' },
  };
  const cf = text.match(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/);
  if (cf) rec.dipendente.cf = cf[0];
  const cnel = text.match(/CNEL\s+([A-Z]\d{2,3}[A-Z0-9]?)/i);
  if (cnel) rec.ccnl.cnel = cnel[1].toUpperCase();
  const liv = text.match(/(\d+)\s*['°ª^]?\s*livello/i);
  if (liv) rec.dipendente.livello = liv[1];

  const grab = (re) => { const m = text.match(re); return m ? itNum(m[1]) : null; };
  rec.totali.netto = grab(/netto(?:\s+(?:del\s+mese|a\s+pagare|in\s+busta))?\D{0,20}((?:\d{1,3}\.)*\d{1,3},\d{2})/i);
  rec.totali.competenze = grab(/tot(?:ale)?\.?\s*competenze\D{0,20}((?:\d{1,3}\.)*\d{1,3},\d{2})/i);
  rec.totali.trattenute = grab(/tot(?:ale)?\.?\s*(?:trattenute|ritenute)\D{0,20}((?:\d{1,3}\.)*\d{1,3},\d{2})/i);

  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (line.length < 8) continue;
    const nums = (line.match(NUM_ANY_RE) || []).map(itNum).filter(v => v != null);
    if (!nums.length) continue;
    let descr = line.replace(NUM_ANY_RE, ' ').replace(/[|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (descr.length < 3 || /totale|netto|imponibile\s*$/i.test(descr)) continue;
    if (!/[a-zà-ù]/i.test(descr)) continue;
    // righe di intestazione/elementi fissi: non sono voci
    if (/paga base|sup\.?\s*ass|contingenza|elementi della|settimane|minimale|voci variabili|riferimento|competenze\s+trattenute|codice fiscale|cognome/i.test(descr)) continue;
    if (descr.replace(/[^A-Za-zÀ-ù]/g, '').length < 4) continue;
    // codice voce a inizio riga (es. Z00001, 003500, F02010)
    let codice = '';
    const mc = descr.match(/^\W{0,3}([A-Z0-9]{5,6})\s+(?=[A-Za-zÀ-ù])/);
    if (mc && /\d/.test(mc[1])) { codice = mc[1]; descr = descr.slice(mc.index + mc[0].length); }
    descr = descr.replace(/^[^A-Za-zÀ-ù]{1,4}\s*/, '').replace(/\s*(ORE|GG\.?|%)\s*$/i, '').trim();
    const isTratt = /(irpef|contribut|trattenut|addizionale|sindac|cession|f\.a\.p|ivs|fis\b)/i.test(descr);
    const voce = { codice, descrizione: descr.slice(0, 60), base: null, rifQta: null, rifUnita: '', trattenuta: null, competenza: null };
    if (nums.length === 1) { if (isTratt) voce.trattenuta = nums[0]; else voce.competenza = nums[0]; }
    else if (nums.length === 2) { voce.base = nums[0]; if (isTratt) voce.trattenuta = nums[1]; else voce.competenza = nums[1]; }
    else { voce.base = nums[0]; voce.rifQta = nums[1]; if (isTratt) voce.trattenuta = nums[nums.length - 1]; else voce.competenza = nums[nums.length - 1]; }
    rec.voci.push(voce);
    if (rec.voci.length >= 40) break;
  }
  rec.derivati = derivaIndice(rec);
  return { record: rec, warnings };
}

/* Trova il CCNL nel database: prima per codice CNEL, poi per parole chiave. */
function trovaCcnl(rec, db, custom = []) {
  const all = [...custom, ...db];
  const cn = (rec.ccnl && rec.ccnl.cnel || '').toUpperCase();
  if (cn) { const hit = all.find(c => (c.cnel || []).includes(cn)); if (hit) return hit; }
  const testo = [rec.ccnl && rec.ccnl.descrizione, rec.ccnl && rec.ccnl.nomeManuale].filter(Boolean).join(' ');
  if (testo) for (const c of all) if ((c.match || []).some(re => re.test(testo))) return c;
  return null;
}

/* eslint-disable no-unused-vars */
const Parser = { parsePdfPages, parseFreeText, trovaCcnl, itNum, fmtEur, buildLines, MESI_IT, derivaIndice };
