/* ============================================================
   BustaChiara — Database normativo
   Tutte le cifre hanno una fonte e un livello di affidabilità:
   verificato:true  = dato normativo consolidato
   verificato:false = dato indicativo, VERIFICARE sul testo del
                      CCNL / circolare (link fornito)
   ============================================================ */

const FONTI = {
  cnel:      { label: 'CNEL — Archivio nazionale dei CCNL', url: 'https://www.cnel.it/Archivio-Contratti', cosa: 'Il testo ufficiale depositato di OGNI contratto collettivo. Cerca per codice CNEL (lo trovi sul cedolino, es. H052).' },
  inps:      { label: 'INPS', url: 'https://www.inps.it', cosa: 'Aliquote contributive (circolare di gennaio di ogni anno), estratto conto contributivo, Fondo di Garanzia TFR.' },
  ade:       { label: 'Agenzia delle Entrate', url: 'https://www.agenziaentrate.gov.it', cosa: 'IRPEF, detrazioni, Certificazione Unica, precompilata. Confronta ogni anno la CU con le buste paga.' },
  finanze:   { label: 'Dip. Finanze — Addizionali regionali e comunali', url: 'https://www.finanze.gov.it/it/fiscalita-regionale-e-locale/', cosa: 'Tabelle ufficiali delle aliquote di addizionale regionale e comunale, per regione e comune.' },
  normattiva:{ label: 'Normattiva — testi di legge', url: 'https://www.normattiva.it', cosa: 'Testo vigente di leggi e decreti citati in busta (D.lgs. 66/2003, art. 2120 c.c., L. 207/2024…).' },
  covip:     { label: 'COVIP — Vigilanza fondi pensione', url: 'https://www.covip.it', cosa: 'Comparatore ufficiale dei costi e dei rendimenti di TUTTI i fondi pensione. Da leggere prima di scegliere.' },
  inl:       { label: 'Ispettorato Nazionale del Lavoro', url: 'https://www.ispettorato.gov.it', cosa: 'Dove segnalare irregolarità retributive o contributive (anche in forma riservata).' },
  istat:     { label: 'ISTAT — indice FOI (rivalutazione TFR)', url: 'https://www.istat.it', cosa: 'Indice dei prezzi usato per rivalutare il TFR lasciato in azienda (1,5% + 75% dell’inflazione FOI).' },
  wikilabour:{ label: 'WikiLabour (CGIL)', url: 'https://www.wikilabour.it', cosa: 'Dizionario dei diritti del lavoro, spiegazioni pratiche voce per voce.' },
  cliclavoro:{ label: 'Cliclavoro (Min. Lavoro)', url: 'https://www.cliclavoro.gov.it', cosa: 'Portale del Ministero del Lavoro: contratti, dimissioni telematiche, servizi.' },
  fonte:     { label: 'Fon.Te. — Fondo pensione Commercio/Turismo/Servizi', url: 'https://www.fondofonte.it', cosa: 'Statuto, contributi datore/lavoratore, comparti e rendimenti del fondo negoziale del tuo settore.' },
  fast:      { label: 'Fondo FAST — sanità integrativa Turismo', url: 'https://www.fondofast.it', cosa: 'Prestazioni sanitarie integrative comprese nella tua iscrizione (rimborsi visite, diagnostica…). Se lo paghi in busta, USALO.' },
  est:       { label: 'Fondo EST — sanità integrativa Commercio', url: 'https://www.fondoest.it', cosa: 'Sanità integrativa del Terziario/Commercio.' },
  cometa:    { label: 'Cometa — fondo pensione metalmeccanici', url: 'https://www.cometafondo.it', cosa: 'Fondo negoziale dei metalmeccanici.' },
  filcams:   { label: 'FILCAMS CGIL', url: 'https://www.filcams.cgil.it', cosa: 'Sindacato commercio/turismo: tabelle retributive aggiornate e assistenza vertenze.' },
  fisascat:  { label: 'FISASCAT CISL', url: 'https://www.fisascat.it', cosa: 'Sindacato commercio/turismo: sintesi dei rinnovi e tabelle.' },
  uiltucs:   { label: 'UILTuCS', url: 'https://www.uiltucs.it', cosa: 'Sindacato commercio/turismo.' },
  federalberghi: { label: 'Federalberghi (parte datoriale CCNL Turismo)', url: 'https://www.federalberghi.it', cosa: 'Testo e circolari applicative del CCNL Turismo — Alberghi.' },
  fipe:      { label: 'FIPE — testo CCNL Pubblici Esercizi H05Y', url: 'https://www.fipe.it/2025/03/10/area-lavoro/ccnl-fipe-testo/ccnl-fipe-il-testo/', cosa: 'Pagina ufficiale FIPE del CCNL Pubblici Esercizi, Ristorazione collettiva e commerciale e Turismo, codice CNEL H05Y.' },
  confcommercio: { label: 'Confcommercio', url: 'https://www.confcommercio.it', cosa: 'Parte datoriale dei CCNL Terziario e Turismo.' },
  contrattocommercio: { label: 'Testo CCNL Terziario (commentato)', url: 'https://www.contrattocommercio.it', cosa: 'Articolato completo del CCNL Commercio/Terziario, articolo per articolo.' },
  patronato: { label: 'Patronato / CAF (INCA, ACLI, ITAL…)', url: 'https://www.inca.it', cosa: 'Controllo gratuito di buste paga, posizioni contributive, dimissioni, vertenze.' },
};

/* ---------- Regole fiscali e contributive per anno ---------- */
const FISCO = {
  2024: {
    irpef: [ { fino: 28000, aliq: 23 }, { fino: 50000, aliq: 35 }, { fino: Infinity, aliq: 43 } ],
    irpefFonte: 'D.lgs. 216/2023 (riforma primo modulo): 3 scaglioni.',
    detrazLavDip: { base: 1955, soglia1: 15000, soglia2: 28000, soglia3: 50000, quota2: 1910, extra2: 1190, bonus65: [25000, 35000] },
    cuneoContributivo: { attivo: true, testo: 'Nel 2024 il taglio del cuneo era CONTRIBUTIVO: −6% (redditi ≤ 35.000) o −7% (≤ 25.000) sui contributi IVS del lavoratore. Dal 2025 è stato sostituito da bonus/detrazione fiscale.' },
    bonusL207: null,
    trattIntegrativo: { importo: 1200, soglia: 15000 },
    ivs: 9.19, cigs: 0.30,
    tfrCoeff: 13.5, tfrRivalsa: 0.50,
  },
  2025: {
    irpef: [ { fino: 28000, aliq: 23 }, { fino: 50000, aliq: 35 }, { fino: Infinity, aliq: 43 } ],
    irpefFonte: 'L. 207/2024 (Bilancio 2025): aliquote 23/35/43 confermate.',
    detrazLavDip: { base: 1955, soglia1: 15000, soglia2: 28000, soglia3: 50000, quota2: 1910, extra2: 1190, bonus65: [25000, 35000] },
    bonusL207: { fasce: [ { fino: 8500, perc: 7.1 }, { fino: 15000, perc: 5.3 }, { fino: 20000, perc: 4.8 } ],
      ulteriore: { min: 20000, pieno: 32000, max: 40000, importo: 1000 },
      fonte: 'L. 207/2024, art. 1 c. 4–9: somma esente fino a 20.000 € di reddito; detrazione aggiuntiva 1.000 € (20–32 mila), decrescente fino a 40.000.' },
    trattIntegrativo: { importo: 1200, soglia: 15000 },
    ivs: 9.19, cigs: 0.30,
    tfrCoeff: 13.5, tfrRivalsa: 0.50,
  },
  2026: {
    irpef: [ { fino: 28000, aliq: 23 }, { fino: 50000, aliq: 33 }, { fino: Infinity, aliq: 43 } ],
    irpefFonte: 'L. 199/2025 (Bilancio 2026): seconda aliquota ridotta dal 35% al 33% (risparmio max ≈ 440 €/anno; sterilizzato sopra 200.000 € di reddito).',
    detrazLavDip: { base: 1955, soglia1: 15000, soglia2: 28000, soglia3: 50000, quota2: 1910, extra2: 1190, bonus65: [25000, 35000] },
    bonusL207: { fasce: [ { fino: 8500, perc: 7.1 }, { fino: 15000, perc: 5.3 }, { fino: 20000, perc: 4.8 } ],
      ulteriore: { min: 20000, pieno: 32000, max: 40000, importo: 1000 },
      fonte: 'Impianto L. 207/2024 confermato per il 2026 dalla L. 199/2025.' },
    trattIntegrativo: { importo: 1200, soglia: 15000 },
    impSostRinnovi: { aliq: 5, sogliaReddito: 28000, fonte: 'L. 199/2025 (Bilancio 2026): imposta sostitutiva 5% sugli incrementi retributivi dei rinnovi CCNL, per redditi fino a 28.000 €. In busta appare come “Imponibile rinnovi” + “Imposta sostitutiva”.' },
    ivs: 9.19, cigs: 0.30,
    tfrCoeff: 13.5, tfrRivalsa: 0.50,
  },
};

/* Detrazione lavoro dipendente annua (art. 13 TUIR) */
function detrazioneLavDip(anno, reddito) {
  const p = (FISCO[anno] || FISCO[2026]).detrazLavDip;
  let d = 0;
  if (reddito <= p.soglia1) d = p.base;
  else if (reddito <= p.soglia2) d = p.quota2 + p.extra2 * (p.soglia2 - reddito) / (p.soglia2 - p.soglia1);
  else if (reddito <= p.soglia3) d = p.quota2 * (p.soglia3 - reddito) / (p.soglia3 - p.soglia2);
  if (reddito > p.bonus65[0] && reddito <= p.bonus65[1]) d += 65;
  return Math.max(0, d);
}
function irpefLordaAnnua(anno, imponibile) {
  const sc = (FISCO[anno] || FISCO[2026]).irpef;
  let resto = imponibile, prec = 0, tot = 0;
  for (const s of sc) {
    const quota = Math.min(resto, s.fino - prec);
    if (quota <= 0) break;
    tot += quota * s.aliq / 100; resto -= quota; prec = s.fino;
  }
  return tot;
}
function ulterioreDetrazioneL207(anno, reddito) {
  const b = (FISCO[anno] || FISCO[2026]).bonusL207;
  if (!b) return 0;
  const u = b.ulteriore;
  if (reddito <= u.min || reddito > u.max) return 0;
  if (reddito <= u.pieno) return u.importo;
  return u.importo * (u.max - reddito) / (u.max - u.pieno);
}
function bonusL207Perc(anno, reddito) {
  const b = (FISCO[anno] || FISCO[2026]).bonusL207;
  if (!b) return 0;
  for (const f of b.fasce) if (reddito <= f.fino) return f.perc;
  return 0;
}

/* ---------- Diritti minimi di LEGGE (valgono per tutti, il CCNL può solo migliorarli) ---------- */
const LEGGE = [
  { id: 'ferie', titolo: 'Ferie: minimo di legge 4 settimane', testo: 'Il D.lgs. 66/2003 (art. 10) garantisce ALMENO 4 settimane di ferie retribuite l’anno: almeno 2 vanno godute nell’anno di maturazione, le altre 2 entro 18 mesi. Le ferie NON sono monetizzabili se non alla cessazione del rapporto. Il CCNL può darne di più (es. 26 giorni nel Turismo/Commercio).', fonti: ['normattiva', 'wikilabour'] },
  { id: 'riposi', titolo: 'Quanto puoi lavorare di fila: riposi e orario massimo', testo: 'La legge (D.lgs. 66/2003) fissa tre limiti. 1) Tra la fine di un turno e l’inizio del successivo devono passare almeno 11 ore. 2) Ogni 7 giorni hai diritto a un riposo di almeno 24 ore consecutive: in pratica, di regola, non più di 6 giorni di lavoro di fila (in alcuni settori, come il turismo, il riposo può essere spostato e cumulato su un periodo di 14 giorni: chiedi come è regolato nel tuo CCNL). 3) In media non si possono superare le 48 ore a settimana, straordinari compresi. Se lavori più di 6 ore di fila hai diritto a una pausa (almeno 10 minuti, salvo migliorie del CCNL).', fonti: ['normattiva'] },
  { id: 'festivita', titolo: 'Festività nazionali retribuite', testo: '11 festività (L. 260/1949 e succ.): 1/1, 6/1, Lunedì dell’Angelo, 25/4, 1/5, 2/6, 15/8, 1/11, 8/12, 25/12, 26/12, più il santo patrono. Se lavori in una festività hai diritto alla maggiorazione prevista dal CCNL; il 4 novembre (festività soppressa) è di solito compensato con permessi “ex festività”.', fonti: ['normattiva', 'wikilabour'] },
  { id: 'tfr', titolo: 'TFR (art. 2120 c.c.)', testo: 'Ogni anno si accantona la retribuzione utile ÷ 13,5. Dal lordo accantonato si sottrae lo 0,50% dell’imponibile previdenziale (rivalsa del contributo IVS). Il TFR in azienda si rivaluta ogni anno dell’1,5% + 75% dell’inflazione FOI. Se l’azienda fallisce, paga il Fondo di Garanzia INPS.', fonti: ['normattiva', 'istat', 'inps'] },
  { id: 'busta', titolo: 'Diritto alla busta paga chiara', testo: 'La L. 4/1953 obbliga il datore a consegnare un prospetto paga con tutti gli elementi della retribuzione e delle trattenute. Errori sistematici o voci opache sono contestabili: conserva TUTTE le buste (prescrizione crediti retributivi: 5 anni).', fonti: ['normattiva', 'inl'] },
  { id: 'retribuzione', titolo: 'Retribuzione proporzionata (art. 36 Cost.)', testo: 'La retribuzione deve essere proporzionata e sufficiente. In pratica i giudici usano i minimi tabellari del CCNL di settore come parametro: se prendi meno del minimo del tuo livello, è un campanello d’allarme serio.', fonti: ['normattiva', 'patronato'] },
  { id: 'malattia', titolo: 'Malattia: quando e quanto vieni pagato', testo: 'Come funziona, passo per passo. 1) Avvisa subito il datore secondo le regole aziendali e fatti fare il certificato telematico dal medico (arriva all’INPS da solo: a te serve solo il numero di protocollo). 2) I primi 3 giorni sono la “carenza”: l’INPS non paga nulla; nella maggior parte dei CCNL li paga il datore (spesso al 100%, ma dipende dal contratto — nel Turismo è previsto un numero massimo di eventi l’anno). 3) Dal 4° al 20° giorno l’INPS paga il 50% della retribuzione media giornaliera; dal 21° al 180° il 66,66%. Molti CCNL aggiungono un’integrazione del datore fino al 75–100%. 4) Massimo indennizzabile INPS: 180 giorni l’anno. ESEMPIO: 5 giorni a casa → giorni 1–3 pagati dal datore (se il CCNL lo prevede), giorni 4–5 pagati INPS al 50% + eventuale integrazione. ATTENZIONE al “comporto”: ogni CCNL fissa un periodo massimo di conservazione del posto (spesso 180 giorni, sommando gli episodi): superarlo può giustificare il licenziamento. Reperibilità per visite fiscali (settore privato): 10–12 e 17–19, tutti i giorni festivi compresi; assenza ingiustificata = perdita (parziale) dell’indennità.', fonti: ['inps', 'wikilabour', 'cnel'] },
  { id: 'infortunio', titolo: 'Infortunio sul lavoro e in itinere', testo: 'Se ti fai male al lavoro (o nel tragitto casa-lavoro: “in itinere”), la tutela è INAIL, non INPS. Avvisa subito il datore, che deve denunciare l’infortunio entro 48 ore. Il giorno dell’evento lo paga il datore al 100%; i 3 giorni successivi il datore al 60% (salvo meglio da CCNL); dal 4° giorno paga l’INAIL: 60% della retribuzione fino al 90° giorno, 75% dal 91°. Molti CCNL integrano fino al 100%. Le cure e i postumi permanenti sono indennizzati a parte. Non servono giorni minimi: anche un giorno di infortunio è coperto.', fonti: ['inps', 'normattiva', 'wikilabour'] },
  { id: 'congedi', titolo: 'Maternità, paternità, congedi parentali', testo: 'Maternità obbligatoria: 5 mesi (di regola 2 prima + 3 dopo il parto, o flessibilità fino a 5 dopo) all’80% INPS, che molti CCNL integrano al 100%. Divieto di licenziamento dalla gravidanza fino al 1° anno del bambino. Paternità obbligatoria: 10 giorni al 100% entro i 5 mesi dalla nascita. Congedo parentale (facoltativo, per entrambi): complessivamente fino a 10-11 mesi entro i 12 anni del figlio; alcune mensilità sono all’80% (il numero esatto dipende dalla legge di bilancio dell’anno), le altre al 30%. Anche riposi giornalieri (“allattamento”): 2 ore al giorno nel primo anno.', fonti: ['inps', 'normattiva'] },
  { id: 'straordinario', titolo: 'Straordinari: limiti e maggiorazioni', testo: 'È straordinario il lavoro oltre le 40 ore settimanali (o il minor orario fissato dal CCNL). Limite legale: 250 ore l’anno, salvo diversa previsione contrattuale, e sempre dentro la media delle 48 ore settimanali. Va pagato con la maggiorazione del CCNL (in genere +15% ÷ +50%, di più se notturno o festivo) o compensato con riposi se il contratto lo prevede. ESEMPIO: paga oraria 11,63 € → un’ora di straordinario al 15% vale 13,37 €. Gli straordinari pagati “fuori busta” non esistono per lo Stato: niente contributi, niente TFR, niente tutele se succede qualcosa.', fonti: ['normattiva', 'cnel', 'inl'] },
  { id: 'notturno', titolo: 'Lavoro notturno', testo: 'È notturno il lavoro che copre almeno 3 ore tra mezzanotte e le 5. Chi è “lavoratore notturno” abituale non può superare in media 8 ore nelle 24 e ha diritto a controlli sanitari periodici gratuiti. La maggiorazione economica la fissa il CCNL. Non sono obbligati al notturno: la madre di un figlio sotto i 3 anni (o il padre convivente in alternativa), il genitore unico affidatario di un figlio sotto i 12, chi assiste familiari con disabilità (L. 104).', fonti: ['normattiva', 'wikilabour'] },
  { id: 'permessi104', titolo: 'Permessi L. 104/1992', testo: '3 giorni al mese retribuiti (anche frazionabili in ore) per assistere familiari con disabilità grave, o per sé stessi se si è la persona con disabilità. Coperti da contribuzione figurativa: non riducono la pensione.', fonti: ['inps'] },
  { id: 'studio', titolo: 'Permessi per studio ed esami', testo: 'Per legge (Statuto dei lavoratori) chi studia ha diritto a permessi retribuiti nei giorni d’esame e a turni che agevolino la frequenza. Molti CCNL aggiungono le “150 ore” di permessi studio nel triennio per corsi e diplomi. Se studi e lavori, cerca l’articolo “diritto allo studio” del tuo contratto.', fonti: ['normattiva', 'cnel'] },
  { id: 'prova', titolo: 'Periodo di prova', testo: 'Va scritto nel contratto PRIMA dell’inizio, altrimenti non esiste. La durata massima la fissa il CCNL (per impiegati tipicamente 30–60 giorni; fino a 6 mesi per ruoli alti; nei contratti a termine dev’essere proporzionata alla durata). Durante la prova entrambe le parti possono recedere senza preavviso e senza motivazione; malattia e infortunio sospendono la prova.', fonti: ['normattiva', 'wikilabour'] },
  { id: 'termine', titolo: 'Contratto a tempo determinato', testo: 'Massimo 12 mesi “liberi”; fino a 24 solo con causali previste da legge o contratti collettivi. Massimo 4 proroghe. Tra un contratto e il rinnovo devono passare 10 o 20 giorni (“stop & go”). Hai gli stessi diritti economici dei colleghi stabili (parità di trattamento) e, dopo 6 mesi, il diritto di precedenza sulle assunzioni stabili nelle stesse mansioni entro 12 mesi. Il termine e le causali devono risultare per iscritto.', fonti: ['normattiva', 'wikilabour'] },
  { id: 'parttime', titolo: 'Part-time: diritti pro-quota, non di serie B', testo: 'Stessi diritti dei full-time in proporzione alle ore: ferie, mensilità aggiuntive, TFR, malattia. Il contratto deve indicare per iscritto giorni e orari. Il lavoro “supplementare” (oltre l’orario part-time pattuito) va maggiorato (tipicamente +15% onnicomprensivo). Le clausole elastiche (spostamento orari) valgono solo se accettate per iscritto e con preavviso. Rifiutare la trasformazione da full a part-time (o viceversa) non è motivo di licenziamento.', fonti: ['normattiva', 'wikilabour'] },
  { id: 'apprendistato', titolo: 'Apprendistato', testo: 'È un contratto a contenuto formativo: retribuzione ridotta (sottoinquadramento fino a 2 livelli o percentuale crescente) in cambio di formazione REALE, con tutor e piano formativo. I contributi a tuo carico sono più bassi (5,84% invece di 9,19%: in busta la voce IVS è diversa). Durata massima in genere 3 anni (5 per alcune figure artigiane). Se la formazione non viene fatta, l’apprendistato può essere riqualificato come rapporto ordinario con le differenze retributive.', fonti: ['inps', 'wikilabour', 'cnel'] },
  { id: 'dimissioni', titolo: 'Dimissioni, preavviso e NASpI', testo: 'Le dimissioni valide sono SOLO telematiche (portale Servizi Lavoro con SPID o tramite patronato/sindacato): quelle “a voce” o su carta non valgono. Va rispettato il preavviso fissato dal CCNL (da 1-2 settimane a qualche mese, secondo livello e anzianità): se non lo rispetti, il datore può trattenerti l’equivalente. Con la giusta causa (es. stipendi non pagati) niente preavviso. La disoccupazione NASpI spetta se perdi il lavoro involontariamente (licenziamento, fine contratto) o con dimissioni per giusta causa: con le dimissioni volontarie normali NON spetta. Un genitore che si dimette entro il 1° anno del figlio deve convalidare all’Ispettorato e mantiene la NASpI.', fonti: ['cliclavoro', 'inps', 'patronato'] },
  { id: 'prescrizione', titolo: 'Tempi per reclamare', testo: 'Crediti retributivi: 5 anni. Per differenze retributive conserva buste e contratto e passa da sindacato o consulente. L’Ispettorato del Lavoro accetta segnalazioni anche riservate.', fonti: ['inl', 'patronato'] },
];

/* ---------- Database CCNL ----------
   ferie in giorni LAVORATIVI/anno; rol/exFest in ore/anno.
   verificato:false ⇒ mostrare avviso “verifica sul testo del CCNL”. */
const CCNL_DB = [
  {
    id: 'turismo-confcommercio', nome: 'Turismo — Alberghi (Confcommercio / Federalberghi)',
    cnel: ['H052'], match: [/alberghi/i, /federalberghi/i, /turismo(?!.*pubblici)/i, /h052/i],
    firmatari: 'Federalberghi, Faita, Fiavet + Filcams CGIL, Fisascat CISL, Uiltucs',
    ferie: { giorni: 26, nota: '26 giorni lavorativi (settimana su 6 giorni). Chi lavora su 5 giorni matura l’equivalente.', verificato: true },
    rol: { ore: 104, nota: 'Riduzione orario / permessi retribuiti a regime (aziende e anzianità piene); quote ridotte nei primi anni per alcune categorie. Il tuo cedolino ne mostra la maturazione reale nei “Ratei”.', verificato: false },
    exFest: { ore: 32, nota: '4 giornate ex festività (32 ore) di norma comprese/aggiuntive secondo l’articolo del CCNL.', verificato: false },
    mensilita: 14, quattordicesima: 'Matura dal 1/7 al 30/6, pagata con la retribuzione di giugno/luglio. Molte aziende la erogano a ratei mensili (14,33 ore/mese con divisore 172).',
    divisoreOrario: 172, divisoreGiorni: 26,
    scatti: 'Scatti di anzianità triennali (data del prossimo scatto stampata sul cedolino Zucchetti).',
    fondoPensione: { nome: 'Fon.Te.', fonte: 'fonte', datore: '0,55%', lavoratoreMin: '0,55%', tfr: '100% del TFR maturando per assunti dopo il 28/4/1993', verificato: true },
    sanitario: { nome: 'Fondo FAST', fonte: 'fast', nota: 'Quota dipendente tipica ~2 €/mese (visibile in busta), quota maggiore a carico azienda. Dà rimborsi sanitari reali: registrati sul sito e usalo.' },
    bilaterale: 'Ente Bilaterale Turismo territoriale (es. EBTT in Toscana): trattenuta ~0,30% dipendente + ~0,35% azienda.',
    minimi: { aggiornatoA: 'giu 2026', nota: 'Valore di riferimento osservato su cedolino reale (paga base conglobata). Le tabelle complete e le tranche di aumento del rinnovo sono sui siti sindacali.', livelli: { '4': 1688.98 }, verificato: false },
    fontiTesto: ['federalberghi', 'confcommercio', 'filcams', 'fisascat', 'uiltucs', 'cnel'],
  },
  {
    id: 'pubblici-esercizi-fipe', nome: 'Pubblici Esercizi, Ristorazione e Turismo (FIPE)',
    cnel: ['H05Y'], match: [/pubblici esercizi/i, /fipe/i, /ristorazione(?! collettiva angem)/i, /stabilimenti?\s+balneari/i, /h05y/i],
    firmatari: 'FIPE-Confcommercio + Filcams, Fisascat, Uiltucs (rinnovo giugno 2024)',
    ferie: { giorni: 26, nota: '26 giorni lavorativi (settimana su 6 giorni).', verificato: true },
    rol: { ore: 104, scaglioni: '32 ore nei primi 2 anni di anzianità, 68 dal 3°, 104 dal 4° (ROL + ex festività).', verificato: false },
    exFest: { ore: 32, nota: 'Comprese nel monte ore a scaglioni di cui sopra.', verificato: false },
    mensilita: 14, quattordicesima: 'Pari a una mensilità, maturazione al 30/6.',
    divisoreOrario: 172, divisoreGiorni: 26,
    scatti: 'Scatti triennali.',
    fondoPensione: { nome: 'Fon.Te.', fonte: 'fonte', datore: '0,55%', lavoratoreMin: '0,55%', tfr: '100% per assunti post 28/4/1993', verificato: false },
    sanitario: { nome: 'Fondo FAST', fonte: 'fast' },
    bilaterale: 'Ente Bilaterale Turismo territoriale.',
    minimi: { aggiornatoA: '2024 (rinnovo: +200 € a regime sul 4° livello, a tranche)', livelli: {}, nota: 'Tabelle per livello sui siti FIPE/sindacati.', verificato: false },
    fontiTesto: ['fipe', 'filcams', 'fisascat', 'uiltucs', 'cnel'],
  },
  {
    id: 'terziario-confcommercio', nome: 'Terziario, Distribuzione e Servizi (Commercio — Confcommercio)',
    cnel: ['H011'], match: [/terziario/i, /commercio/i, /distribuzione e servizi/i, /h011/i],
    firmatari: 'Confcommercio + Filcams, Fisascat, Uiltucs (rinnovo marzo 2024)',
    ferie: { giorni: 26, nota: '26 giorni lavorativi (settimana su 6 giorni).', verificato: true },
    rol: { ore: 72, scaglioni: 'Fino a 15 dipendenti: 56 ore/anno; oltre 15: 72 (con anzianità piena). Ex festività a parte (32 ore).', verificato: false },
    exFest: { ore: 32, verificato: false },
    mensilita: 14, quattordicesima: 'Matura 1/7–30/6, pagata a luglio.',
    divisoreOrario: 168, divisoreGiorni: 26,
    scatti: 'Scatti triennali (max 10).',
    fondoPensione: { nome: 'Fon.Te.', fonte: 'fonte', datore: '1,55%', lavoratoreMin: '0,55%', tfr: '100% per assunti post 28/4/1993', verificato: true },
    sanitario: { nome: 'Fondo EST', fonte: 'est' },
    bilaterale: 'Ente Bilaterale del Terziario territoriale.',
    minimi: { aggiornatoA: 'rinnovo 2024: +240 € a regime sul 4° livello, a tranche fino al 2027', livelli: {}, verificato: false },
    fontiTesto: ['contrattocommercio', 'confcommercio', 'filcams', 'cnel'],
  },
  {
    id: 'metalmeccanici-industria', nome: 'Metalmeccanici Industria (Federmeccanica)',
    cnel: ['C011'], match: [/metalmeccanic/i, /federmeccanica/i],
    firmatari: 'Federmeccanica/Assistal + FIOM, FIM, UILM (rinnovo novembre 2024)',
    ferie: { giorni: 20, nota: '4 settimane (20 giorni su settimana di 5). In più i PAR.', verificato: true },
    rol: { ore: 104, nota: 'PAR — Permessi Annui Retribuiti: 104 ore a regime (include ex festività).', verificato: false },
    exFest: { ore: 0, nota: 'Comprese nei PAR.', verificato: false },
    mensilita: 13, quattordicesima: 'NON prevista: i metalmeccanici hanno 13 mensilità.',
    divisoreOrario: 173, divisoreGiorni: 26,
    scatti: 'Scatti biennali.',
    fondoPensione: { nome: 'Cometa', fonte: 'cometa', datore: '2,0% (sui minimi)', lavoratoreMin: '1,2%', tfr: '100% per assunti post 28/4/1993', verificato: false },
    sanitario: { nome: 'MètaSalute', fonte: null, nota: 'Interamente a carico azienda (~156 €/anno).' },
    minimi: { aggiornatoA: 'rinnovo 2024: aumenti a tranche 2025–2027 (indicizzazione IPCA)', livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'metalmeccanici-artigiani', nome: 'Metalmeccanici Artigiani e PMI',
    cnel: [], match: [/metalmeccanic.*artigian/i, /area meccanica/i],
    firmatari: 'Confartigianato/CNA + FIOM, FIM, UILM',
    ferie: { giorni: 20, nota: '4 settimane.', verificato: true },
    rol: { ore: 40, nota: 'Monte ore ridotto rispetto all’industria; dipende da anzianità e dimensione.', verificato: false },
    mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Fondapi / Cometa (secondo accordo)', fonte: 'covip', verificato: false },
    sanitario: { nome: 'San.Arti.', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'edilizia-industria', nome: 'Edilizia Industria (e Cassa Edile)',
    cnel: [], match: [/edil/i, /cassa edile/i],
    firmatari: 'ANCE + Feneal UIL, Filca CISL, Fillea CGIL',
    ferie: { giorni: 20, nota: '4 settimane. ATTENZIONE: in edilizia ferie e gratifica natalizia degli OPERAI passano dalla CASSA EDILE (accantonamento ~18,5%): la busta è strutturalmente diversa.', verificato: true },
    rol: { ore: 88, nota: 'Riduzione orario tramite “festività soppresse” e ore di riduzione; gestione particolare.', verificato: false },
    mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Prevedi', fonte: 'covip', nota: 'Contributo contrattuale automatico anche senza adesione esplicita.', verificato: false },
    sanitario: { nome: 'Sanedil', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
    note: 'Se sei operaio edile controlla anche il prospetto della Cassa Edile territoriale (APE, ferie, GNF).',
  },
  {
    id: 'studi-professionali', nome: 'Studi Professionali (Confprofessioni)',
    cnel: [], match: [/studi professionali/i, /confprofessioni/i],
    firmatari: 'Confprofessioni + Filcams, Fisascat, Uiltucs (rinnovo marzo 2024)',
    ferie: { giorni: 26, verificato: true },
    rol: { ore: 32, nota: 'ROL secondo anzianità/dimensione; ex festività a parte.', verificato: false },
    mensilita: 14, quattordicesima: 'Prevista (luglio).',
    divisoreOrario: 168, divisoreGiorni: 26,
    fondoPensione: { nome: 'Fon.Te. (sezione studi professionali)', fonte: 'fonte', verificato: false },
    sanitario: { nome: 'Cadiprof', fonte: null, nota: 'Interamente a carico del datore; dà rimborsi concreti.' },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'logistica-trasporto-merci', nome: 'Logistica, Trasporto merci e Spedizione',
    cnel: [], match: [/logistica/i, /trasporto merci/i, /spedizion/i, /autotrasport/i],
    firmatari: 'Associazioni datoriali del trasporto + Filt CGIL, Fit CISL, Uiltrasporti',
    ferie: { giorni: 26, nota: 'Impiegati 26 giorni; personale viaggiante con regole proprie.', verificato: false },
    rol: { ore: 40, nota: 'Monte ore variabile per qualifica (viaggiante/non viaggiante).', verificato: false },
    mensilita: 14, quattordicesima: 'Prevista.',
    divisoreOrario: 168, divisoreGiorni: 26,
    fondoPensione: { nome: 'consulta il CCNL (settore con più fondi)', fonte: 'covip', verificato: false },
    sanitario: { nome: 'Sanilog', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
    note: 'Per gli autisti: controlla indennità di trasferta, ore di presenza e straordinario — è il settore con più contenzioso su queste voci.',
  },
  {
    id: 'chimico-farmaceutico', nome: 'Chimico-Farmaceutico Industria',
    cnel: [], match: [/chimic/i, /farmaceutic/i, /federchimica/i],
    firmatari: 'Federchimica/Farmindustria + Filctem, Femca, Uiltec',
    ferie: { giorni: 20, nota: '4 settimane + giorni aggiuntivi per anzianità.', verificato: false },
    rol: { ore: 40, nota: 'Riduzione orario secondo regime (giornalieri/turnisti).', verificato: false },
    mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Fonchim', fonte: 'covip', datore: '≈2,1%', lavoratoreMin: '≈1,2%', nota: 'Uno dei fondi negoziali più ricchi come contributo datoriale.', verificato: false },
    sanitario: { nome: 'Faschim', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'alimentare-industria', nome: 'Alimentare Industria',
    cnel: [], match: [/alimentar/i, /federalimentare/i],
    firmatari: 'Federalimentare + Fai, Flai, Uila',
    ferie: { giorni: 20, nota: '4 settimane.', verificato: false },
    rol: { ore: 40, verificato: false },
    mensilita: 14, quattordicesima: 'Prevista.',
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Alifond', fonte: 'covip', verificato: false },
    sanitario: { nome: 'FASA', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'tessile-moda', nome: 'Tessile, Abbigliamento, Moda Industria',
    cnel: [], match: [/tessil/i, /abbigliament/i, /moda/i],
    firmatari: 'SMI/Confindustria Moda + Filctem, Femca, Uiltec',
    ferie: { giorni: 20, verificato: false },
    rol: { ore: 40, verificato: false },
    mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Previmoda', fonte: 'covip', verificato: false },
    sanitario: { nome: 'Sanimoda', fonte: null },
    minimi: { livelli: {}, verificato: false },
    fontiTesto: ['cnel'],
  },
  {
    id: 'gomma-plastica', nome: 'Gomma e Materie Plastiche Industria',
    cnel: [], match: [/gomma/i, /plastic/i],
    firmatari: 'Federazione Gomma Plastica + Filctem, Femca, Uiltec',
    ferie: { giorni: 20, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Fondogommaplastica', fonte: 'covip', verificato: false },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
  },
  {
    id: 'legno-arredo', nome: 'Legno e Arredo Industria',
    cnel: [], match: [/legno/i, /arredo/i],
    firmatari: 'FederlegnoArredo + Feneal, Filca, Fillea',
    ferie: { giorni: 20, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Arco', fonte: 'covip', verificato: false },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
  },
  {
    id: 'telecomunicazioni', nome: 'Telecomunicazioni (TLC)',
    cnel: [], match: [/telecomunicazion/i, /\btlc\b/i, /asstel/i],
    firmatari: 'Asstel + Slc CGIL, Fistel CISL, Uilcom',
    ferie: { giorni: 20, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 13,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'Telemaco', fonte: 'covip', verificato: false },
    sanitario: { nome: 'ASSILT/Salute Sempre (per azienda)', fonte: null },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
  },
  {
    id: 'multiservizi', nome: 'Multiservizi / Pulizie e Servizi Integrati',
    cnel: [], match: [/multiservizi/i, /pulizi/i, /servizi integrati/i],
    firmatari: 'Associazioni imprese di servizi + Filcams, Fisascat, Uiltrasporti (rinnovo 2024 dopo 10+ anni)',
    ferie: { giorni: 26, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 14,
    quattordicesima: 'Prevista.',
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'consulta il CCNL', fonte: 'covip', verificato: false },
    sanitario: { nome: 'ASIM', fonte: null },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
    note: 'Settore ad alta irregolarità: controlla SEMPRE che ore pagate = ore lavorate e il cambio appalto (art. 4: diritto al passaggio).',
  },
  {
    id: 'vigilanza-privata', nome: 'Vigilanza Privata e Servizi Fiduciari',
    cnel: [], match: [/vigilanza/i, /fiduciari/i, /guardie/i],
    firmatari: 'Associazioni istituti di vigilanza + Filcams, Fisascat, UILTuCS (rinnovo 2023)',
    ferie: { giorni: 26, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 14,
    divisoreOrario: 173, divisoreGiorni: 26,
    fondoPensione: { nome: 'consulta il CCNL', fonte: 'covip', verificato: false },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
    note: 'Storico problema di minimi bassi (sentenze su art. 36 Cost. per i servizi fiduciari): confronta sempre col rinnovo 2023.',
  },
  {
    id: 'sanita-privata', nome: 'Sanità Privata (AIOP-ARIS) / Case di cura',
    cnel: [], match: [/sanit.*privat/i, /aiop/i, /aris/i, /case di cura/i],
    firmatari: 'AIOP, ARIS + FP CGIL, CISL FP, UIL FPL',
    ferie: { giorni: 26, verificato: false }, rol: { ore: 40, verificato: false }, mensilita: 14,
    divisoreOrario: 165, divisoreGiorni: 26,
    fondoPensione: { nome: 'consulta il CCNL', fonte: 'covip', verificato: false },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
  },
  {
    id: 'lavoro-domestico', nome: 'Lavoro Domestico (colf, badanti, baby sitter)',
    cnel: [], match: [/domestic/i, /colf/i, /badant/i],
    firmatari: 'Fidaldo, Domina + Filcams, Fisascat, Uiltucs, Federcolf',
    ferie: { giorni: 26, verificato: true },
    rol: { ore: 0, nota: 'Non previsti ROL: regole proprie su riposi e festività.', verificato: false },
    mensilita: 13,
    divisoreOrario: 0, divisoreGiorni: 26,
    fondoPensione: { nome: 'non previsto (TFR con calcolo proprio)', fonte: null, verificato: false },
    sanitario: { nome: 'Cassa Colf', fonte: null },
    minimi: { livelli: {}, nota: 'Minimi aggiornati ogni anno a gennaio (tabelle ministeriali).', verificato: false },
    fontiTesto: ['cnel'],
    note: 'Contributi INPS con sistema a fasce orarie proprio: il cedolino è molto diverso da quello standard.',
  },
  {
    id: 'agenzie-somministrazione', nome: 'Somministrazione (lavoro interinale)',
    cnel: [], match: [/somministrazion/i, /interinal/i, /assolavoro/i],
    firmatari: 'Assolavoro + Felsa, Nidil, UILTemp',
    ferie: { giorni: 20, nota: 'Al lavoratore somministrato si applica ANCHE il CCNL dell’azienda utilizzatrice (parità di trattamento, art. 35 D.lgs. 81/2015): confronta entrambi.', verificato: false },
    rol: { ore: 0, verificato: false }, mensilita: 13,
    divisoreOrario: 0, divisoreGiorni: 26,
    fondoPensione: { nome: 'Fontemp', fonte: 'covip', verificato: false },
    sanitario: { nome: 'Ebitemp (ente bilaterale con molte prestazioni)', fonte: null },
    minimi: { livelli: {}, verificato: false }, fontiTesto: ['cnel'],
  },
  {
    id: 'agricoltura-operai', nome: 'Agricoltura — Operai agricoli e florovivaisti',
    cnel: [], match: [/agricol/i, /florovivais/i],
    firmatari: 'Confagricoltura, Coldiretti, CIA + Fai, Flai, Uila',
    ferie: { giorni: 26, verificato: false }, rol: { ore: 0, verificato: false }, mensilita: 14,
    divisoreOrario: 169, divisoreGiorni: 26,
    fondoPensione: { nome: 'Filcoop', fonte: 'covip', verificato: false },
    minimi: { livelli: {}, nota: 'Integrati dai contratti PROVINCIALI: i minimi veri sono nel CPL della tua provincia.', verificato: false },
    fontiTesto: ['cnel'],
  },
];

/* ---------- Dizionario voci: per CODICE Zucchetti ---------- */
const VOCI_CODICI = {
  'Z00001': { nome: 'Retribuzione ordinaria', cat: 'competenza', cosa: 'La paga delle ore ordinarie lavorate nel mese: paga oraria (retribuzione mensile ÷ divisore del CCNL) × ore.', controlla: 'Paga oraria = totale elementi retributivi ÷ divisore CCNL (es. 172 nel Turismo). Ore × paga oraria deve dare l’importo.' },
  'Z00250': { nome: 'Ferie godute', cat: 'competenza', cosa: 'Ore di ferie che hai preso nel mese, pagate come se avessi lavorato. Scalano dal saldo ferie nei “Ratei”.', controlla: 'Che le ore corrispondano ai giorni di ferie realmente presi.' },
  'Z00255': { nome: 'Permessi ROL goduti', cat: 'competenza', cosa: 'Ore di permesso retribuito (Riduzione Orario di Lavoro) godute. Scalano dal saldo permessi.', controlla: 'Il monte ore annuo dipende dal CCNL e dall’anzianità.' },
  'Z50000': { nome: 'Rateo 13ª mensilità', cat: 'competenza', cosa: 'Un dodicesimo della tredicesima erogato mese per mese invece che a dicembre (nel cedolino Zucchetti: 14,33 ore = divisore 172 ÷ 12).', controlla: 'Se ricevi il rateo ogni mese, a dicembre NON avrai la tredicesima piena: è già stata pagata a rate.' },
  'Z50022': { nome: 'Rateo 14ª mensilità', cat: 'competenza', cosa: 'Come sopra ma per la quattordicesima (prevista da Turismo, Commercio e altri CCNL; i metalmeccanici NON ce l’hanno).', controlla: 'Stessa logica della 13ª.' },
  'ZP9960': { nome: 'Arrotondamento mese precedente', cat: 'trattenuta', cosa: 'Recupero dei centesimi di arrotondamento del netto del mese scorso: partita di giro, si compensa col tempo.', controlla: 'Deve corrispondere all’“Arrotondamento” del cedolino precedente.' },
  'Z31210': { nome: 'Contributo Fondo FAST (sanità integrativa)', cat: 'trattenuta', cosa: 'Quota a tuo carico (tipicamente ~2 €/mese) per l’assistenza sanitaria integrativa del Turismo; l’azienda versa una quota maggiore.', controlla: 'Se la paghi, registrati su fondofast.it e usa i rimborsi: sono soldi tuoi.', fonti: ['fast'] },
  'Z00000': { nome: 'Contributo IVS (INPS)', cat: 'trattenuta', cosa: 'Il tuo contributo pensionistico: 9,19% dell’imponibile previdenziale (9,49% nelle aziende soggette a CIGS).', controlla: 'Imponibile INPS × 9,19% (o 9,49%). L’imponibile è arrotondato all’euro.', fonti: ['inps'] },
  'Z00054': { nome: 'Contributo FIS (Fondo Integrazione Salariale)', cat: 'trattenuta', cosa: 'Finanzia l’ammortizzatore sociale delle aziende senza cassa integrazione ordinaria. Quota lavoratore = 1/3 dell’aliquota totale (che dipende dalla dimensione aziendale).', controlla: 'Percentuali tipiche a carico lavoratore: 0,167% (aliquota 0,50%) o 0,267% (aliquota 0,80%). Verifica con la dimensione aziendale.', fonti: ['inps'] },
  'F00880': { nome: 'Rimborso da 730', cat: 'competenza', cosa: 'Credito IRPEF risultante dalla tua dichiarazione dei redditi, rimborsato dal datore in busta (di solito da luglio).', controlla: 'Deve coincidere col rigo “credito” del prospetto di liquidazione del tuo 730.', fonti: ['ade'] },
  'F02000': { nome: 'Imponibile IRPEF', cat: 'dato', cosa: 'La base di calcolo dell’IRPEF del mese: retribuzione lorda meno contributi a tuo carico (i contributi non si tassano).', controlla: 'Totale competenze imponibili − contributi INPS/FIS ≈ imponibile IRPEF.' },
  'F02010': { nome: 'IRPEF lorda', cat: 'dato', cosa: 'Imposta calcolata sull’imponibile con gli scaglioni (2026: 23% fino a 28.000 €, 33% fino a 50.000, 43% oltre), su base annua ripartita sul mese.', controlla: 'L’app la ricalcola qui sotto nei Controlli.', fonti: ['ade'] },
  'F02500': { nome: 'Detrazioni lavoro dipendente', cat: 'dato', cosa: 'Sconto d’imposta per chi lavora dipendente (art. 13 TUIR), decrescente al crescere del reddito; il datore lo applica ogni mese su reddito annuo presunto e fa conguaglio a dicembre.', controlla: 'Cambi di reddito in corso d’anno spostano il conguaglio: normale trovare differenze a dicembre.', fonti: ['ade'] },
  'F02801': { nome: 'Ulteriore detrazione L. 207/2024 (taglio cuneo)', cat: 'dato', cosa: 'Detrazione extra per redditi 20.000–40.000 €: 1.000 €/anno pieni fino a 32.000, poi decrescente. Per redditi ≤ 20.000 diventa invece una somma esente in busta.', controlla: '≈ 83,33 €/mese se il reddito presunto è 20–32 mila.', fonti: ['normattiva'] },
  'F03020': { nome: 'Ritenute IRPEF', cat: 'trattenuta', cosa: 'L’IRPEF effettivamente trattenuta: lorda − detrazioni.', controlla: 'IRPEF lorda − detrazioni = ritenuta.' },
  'F03320': { nome: 'Imponibile rinnovi CCNL (L. 199/2025)', cat: 'dato', cosa: 'La parte di paga derivante dagli AUMENTI del rinnovo contrattuale, tassata al 5% invece che ad aliquota piena (misura 2026 per redditi ≤ 28.000 €).', controlla: 'Su questo importo paghi solo il 5%: è un risparmio, non una trattenuta in più.', fonti: ['normattiva'] },
  'F03325': { nome: 'Imposta sostitutiva 5% rinnovi (L. 199/2025)', cat: 'trattenuta', cosa: 'Il 5% applicato all’imponibile di cui sopra.', controlla: 'Imponibile rinnovi × 5%.', fonti: ['normattiva'] },
  'F06000': { nome: 'Imponibile a tassazione separata/autonoma', cat: 'dato', cosa: 'Somme tassate a parte rispetto alla retribuzione corrente (es. arretrati, alcune mensilità aggiuntive o conguagli), con aliquota propria.', controlla: 'Chiedi al consulente/ufficio paghe QUALI somme sono finite qui: è la voce meno leggibile del cedolino.' },
  'F06010': { nome: 'IRPEF lorda su tassazione separata', cat: 'dato', cosa: 'Imposta calcolata sull’imponibile a tassazione separata (spesso 23% o aliquota media).', controlla: '' },
  'F06020': { nome: 'Ritenuta IRPEF su tassazione separata', cat: 'trattenuta', cosa: 'La trattenuta effettiva relativa alla voce sopra.', controlla: '' },
  'F09110': { nome: 'Addizionale regionale (a rate)', cat: 'trattenuta', cosa: 'L’addizionale IRPEF della tua regione sull’imponibile dell’ANNO SCORSO, trattenuta in 11 rate da gennaio a novembre. Il “Residuo” è quanto manca da pagare.', controlla: 'Aliquota della tua regione sulle tabelle ufficiali del Dip. Finanze.', fonti: ['finanze'] },
  'F09101': { nome: 'Addizionale comunale (a rate)', cat: 'trattenuta', cosa: 'Come la regionale ma del comune (fino allo 0,8%, con acconto e saldo).', controlla: 'Aliquota e soglia di esenzione del tuo comune sulle tabelle ufficiali.', fonti: ['finanze'] },
  'F09150': { nome: 'Rata restituzione trattamento integrativo L. 21/2020', cat: 'trattenuta', cosa: 'Se in un anno hai ricevuto il “bonus 100 €” senza averne pienamente diritto (redditi oltre soglia al conguaglio), la restituzione avviene a rate. È il recupero, non un nuovo bonus.', controlla: 'Confronta col conguaglio di dicembre dell’anno indicato e con la CU.', fonti: ['ade'] },
};

/* ---------- Dizionario voci: per PAROLE CHIAVE (qualsiasi software paghe) ---------- */
const VOCI_PATTERN = [
  { re: /^(?:retribuzione|paga|lavoro)\s+(?:ordinaria|normale)|^ore\s+ordinarie|^stipendio(?:\s+base)?$/i, nome: 'Retribuzione ordinaria', cat: 'competenza', cosa: 'È la paga del lavoro ordinario del mese. Può essere calcolata a ore oppure a giornate: quantità × tariffa deve restituire l’importo della riga.', controlla: 'Confronta quantità, tariffa oraria o giornaliera e giorni/ore effettivamente lavorati.' },
  { re: /magg\.?\s*(?:per\s+)?riposo\s+settimanale|riposo\s+settimanale.*magg/i, nome: 'Maggiorazione per riposo settimanale spostato', cat: 'competenza', cosa: 'Compenso aggiuntivo perché il riposo settimanale non coincide con la domenica o con il giorno normalmente previsto. La percentuale è indicata nella descrizione della voce.', controlla: 'Nel cedolino la voce riporta il 10%: la tariffa della maggiorazione va confrontata con la tariffa oraria ordinaria.' },
  { re: /magg\.?.*festiv|festiv.*maggioraz/i, nome: 'Maggiorazione per lavoro festivo', cat: 'competenza', cosa: 'Compenso per lavoro prestato in festività. Una dicitura “120%” di solito indica una tariffa pari al 120% dell’ordinaria, cioè una maggiorazione effettiva del 20%, salvo diversa regola del CCNL.', controlla: 'Tariffa della voce ÷ tariffa oraria ordinaria − 1 = percentuale di maggiorazione. Verifica anche eventuale riposo compensativo.' },
  { re: /^festivit[aà]'?$|festivit[aà]\s+retribuit/i, nome: 'Festività retribuita', cat: 'competenza', cosa: 'Retribuzione della giornata festiva. È distinta dall’eventuale maggiorazione per le ore effettivamente lavorate durante la festività.', controlla: 'Controlla il numero di giornate e la tariffa giornaliera.' },
  { re: /straordinar/i, nome: 'Straordinario', cat: 'competenza', cosa: 'Ore oltre l’orario normale, pagate con maggiorazione fissata dal CCNL (tipicamente +15% ÷ +50%; di più se notturno o festivo).', controlla: 'Verifica la % di maggiorazione sull’articolo “lavoro straordinario” del tuo CCNL. Ricorda il tetto legale medio di 48 ore/settimana.' },
  { re: /notturn/i, nome: 'Lavoro notturno', cat: 'competenza', cosa: 'Maggiorazione per lavoro in orario notturno (definizione e % nel CCNL; tutele extra nel D.lgs. 66/2003).', controlla: 'Percentuale e fascia oraria dal CCNL.' },
  { re: /festiv/i, nome: 'Lavoro festivo / festività', cat: 'competenza', cosa: 'Lavoro prestato in giorno festivo: paga maggiorata (spesso +20% ÷ +60%) o riposo compensativo. Se la festività NON è lavorata e cade in giorno lavorativo, va comunque retribuita.', controlla: 'Nel cedolino di esempio: tariffa 13,95 = 11,63 + 20%. Verifica la % del tuo CCNL.' },
  { re: /domenical/i, nome: 'Lavoro domenicale', cat: 'competenza', cosa: 'Nel turismo/commercio la domenica può essere giorno lavorativo ordinario con riposo compensativo in settimana: la maggiorazione NON è sempre dovuta e cambia molto tra CCNL (e tra livelli).', controlla: 'Cerca “lavoro domenicale” nel tuo CCNL: se prevede maggiorazione e in busta non c’è, chiedi spiegazioni.' },
  { re: /ferie/i, nome: 'Ferie', cat: 'competenza', cosa: 'Ferie godute o indennità ferie (quest’ultima legittima solo a fine rapporto).', controlla: 'Minimo di legge: 4 settimane/anno. Controlla il saldo nei Ratei.' },
  { re: /permesso.*(?:104|handicap)|legge\s*104|donazione\s+sangue|congedo\s+matrimonial|permesso\s+studio/i, nome: 'Permesso tutelato', cat: 'competenza', cosa: 'Assenza retribuita prevista dalla legge o dal CCNL, ad esempio L. 104, donazione sangue, matrimonio o studio.', controlla: 'Verifica giornate/ore, causale e corretta copertura contributiva.' },
  { re: /permess|par\b|banca\s+ore/i, nome: 'Permessi retribuiti / banca ore', cat: 'competenza', cosa: 'Ore di permesso retribuito, PAR/ROL o recupero dalla banca ore. Di norma riducono il saldo del relativo rateo.', controlla: 'Confronta le ore della voce con le assenze e con il saldo permessi.' },
  { re: /\brol\b|riduzione orario/i, nome: 'ROL', cat: 'competenza', cosa: 'Permessi retribuiti da riduzione dell’orario di lavoro.', controlla: 'Monte ore annuo dal CCNL (dipende spesso da anzianità e dimensione azienda).' },
  { re: /ex\s*festiv|festivit.*soppresse/i, nome: 'Ex festività', cat: 'competenza', cosa: 'Permessi che compensano le 4 festività abolite nel 1977 (tipicamente 32 ore/anno).', controlla: 'Se non li vedi maturare nei ratei e il CCNL li prevede, chiedi.' },
  { re: /tredicesima|13.?ma|13ª/i, nome: 'Tredicesima', cat: 'competenza', cosa: 'Mensilità aggiuntiva di dicembre, prevista da tutti i principali CCNL. Su di essa NON si applicano le detrazioni mensili: per questo a dicembre la tassazione “sembra” più alta.', controlla: 'Se ricevi ratei mensili, a dicembre non arriva l’importo pieno.' },
  { re: /quattordicesima|14.?ma|14ª/i, nome: 'Quattordicesima', cat: 'competenza', cosa: 'Seconda mensilità aggiuntiva (giugno/luglio), prevista solo da alcuni CCNL (Commercio, Turismo, Trasporti…).', controlla: 'Verifica che il tuo CCNL la preveda e il periodo di maturazione (spesso 1/7–30/6).' },
  { re: /gratifica\s+natalizia/i, nome: 'Tredicesima / gratifica natalizia', cat: 'competenza', cosa: 'Mensilità aggiuntiva normalmente pagata a dicembre; in alcuni settori è indicata come gratifica natalizia.', controlla: 'Confronta periodo maturato e importo con le regole del CCNL.' },
  { re: /arretrat|differenz[ae]\s+retributiv|recupero\s+contrattuale/i, nome: 'Arretrati o differenze retributive', cat: 'competenza', cosa: 'Somme riferite a mesi precedenti, spesso dovute a rinnovi contrattuali, correzioni di livello o ricalcoli.', controlla: 'La descrizione dovrebbe indicare il periodo: verifica quantità, imponibilità e cedolini interessati.' },
  { re: /elemento\s+(?:perequativo|distinto)|e\.d\.r\.?/i, nome: 'Elemento retributivo contrattuale', cat: 'competenza', cosa: 'Elemento fisso o periodico previsto dal contratto collettivo, distinto dalla paga base.', controlla: 'Importo e periodicità devono coincidere con la tabella del CCNL applicato.' },
  { re: /superminimo|sup\.?\s*ass|assorbibile/i, nome: 'Superminimo', cat: 'competenza', cosa: 'Quota di paga sopra il minimo contrattuale, pattuita individualmente. Se “assorbibile”, gli aumenti del CCNL la riducono invece di sommarsi: l’aumento del rinnovo può non farti crescere il lordo.', controlla: 'BRUTALE: superminimo assorbibile = i futuri aumenti contrattuali li hai già presi. Se firmi un nuovo contratto, chiedi superminimo NON assorbibile.' },
  { re: /scatt.*anzianit/i, nome: 'Scatti di anzianità', cat: 'competenza', cosa: 'Aumenti automatici ogni 2-3 anni di permanenza (numero massimo e importi da CCNL).', controlla: 'Data del prossimo scatto spesso stampata sul cedolino: segnala se passa senza aumento.' },
  { re: /contingenza/i, nome: 'Indennità di contingenza', cat: 'competenza', cosa: 'Vecchia indennità di adeguamento al costo della vita, congelata dal 1992; in molti CCNL è “conglobata” nella paga base.', controlla: '' },
  { re: /\bedr\b/i, nome: 'E.D.R.', cat: 'competenza', cosa: 'Elemento Distinto della Retribuzione (10,33 €/mese del 1992, o importi specifici di settore).', controlla: '' },
  { re: /indennit[aà].*(?:turno|turnistica)|(?:turno|turnistica).*indennit/i, nome: 'Indennità di turno', cat: 'competenza', cosa: 'Compenso collegato al lavoro organizzato su turni. Può essere fisso oppure calcolato per ore o giornate.', controlla: 'Importo e condizioni dipendono dal CCNL o dall’accordo aziendale.' },
  { re: /indennit[aà].*(?:cassa|maneggio\s+denaro)|(?:cassa|maneggio\s+denaro).*indennit/i, nome: 'Indennità di cassa', cat: 'competenza', cosa: 'Compenso per chi gestisce denaro e risponde di eventuali differenze di cassa.', controlla: 'Verifica importo e figure aventi diritto nel CCNL.' },
  { re: /indennit[aà].*(?:funzione|quadro)|(?:funzione|quadro).*indennit/i, nome: 'Indennità di funzione', cat: 'competenza', cosa: 'Elemento aggiuntivo legato al ruolo, alla responsabilità o all’inquadramento.', controlla: 'Controlla se è previsto dal CCNL, da una lettera individuale o da un accordo aziendale.' },
  { re: /reperibilit[aà]|pronta\s+disponibilit[aà]/i, nome: 'Reperibilità', cat: 'competenza', cosa: 'Compenso per il periodo in cui devi essere disponibile a intervenire pur non lavorando continuativamente.', controlla: 'Verifica ore, chiamate effettive e tariffa prevista dal CCNL o dall’accordo aziendale.' },
  { re: /disagio|rischio|nociv|alta\s+montagna|sottosuolo/i, nome: 'Indennità di disagio o rischio', cat: 'competenza', cosa: 'Compenso aggiuntivo legato a condizioni di lavoro particolari o gravose.', controlla: 'La causale e l’importo devono derivare dal CCNL o da un accordo aziendale.' },
  { re: /indennit[aà]\s+(?:generica|contrattuale|aziendale)|(?:ind\.?|indennit[aà])\s+(?:speciale|professionale|posizione)/i, nome: 'Indennità contrattuale o aziendale', cat: 'competenza', cosa: 'Compenso aggiuntivo previsto dal CCNL, da un accordo aziendale o dalla lettera individuale.', controlla: 'Cerca la stessa denominazione nel contratto o nell’accordo e verifica se l’importo è fisso o legato a ore/giorni.' },
  { re: /preavviso|indennit[aà]\s+sostitutiva/i, nome: 'Indennità o trattenuta di preavviso', cat: 'dato', cosa: 'Somma collegata al mancato periodo di preavviso alla cessazione: può essere a credito o a debito secondo chi recede e perché.', controlla: 'Verifica durata prevista dal CCNL, data di cessazione e lato della colonna in cui compare.' },
  { re: /\bcigs\b|cassa\s+integrazione\s+straordinaria/i, nome: 'Contributo CIGS', cat: 'trattenuta', cosa: 'Quota per la cassa integrazione straordinaria, applicabile ai settori e alle aziende soggetti alla relativa disciplina.', controlla: 'Controlla imponibile e aliquota esposta; la presenza dipende da settore e dimensione aziendale.', fonti: ['inps'] },
  { re: /\bfis\b|integrazione salariale/i, nome: 'Contributo FIS', cat: 'trattenuta', cosa: 'Ammortizzatore per aziende senza CIG ordinaria; 1/3 dell’aliquota è a tuo carico.', controlla: '', fonti: ['inps'] },
  { re: /\b(?:INPS|IVS)\b|f\.?p\.?l\.?d|contribut.*inps/i, nome: 'Contributi INPS (IVS)', cat: 'trattenuta', cosa: 'Il tuo contributo previdenziale, normalmente destinato in gran parte alla pensione. L’aliquota dipende da settore, qualifica e tipo di rapporto.', controlla: 'Imponibile × aliquota. Controlla una volta l’anno il tuo estratto conto su inps.it: i versamenti devono comparire.', fonti: ['inps'] },
  { re: /contributo\s+(?:solidariet[aà]|aggiuntivo)|solidariet[aà]\s+previdenziale/i, nome: 'Contributo previdenziale aggiuntivo', cat: 'trattenuta', cosa: 'Contributo aggiuntivo o di solidarietà previsto per particolari fondi, imponibili o categorie di lavoratori.', controlla: 'Verifica base, aliquota e riferimento normativo indicato dal gestionale.', fonti: ['inps'] },
  { re: /ente\s*bil(?:at)?\.?|e\.?b\.?t|ebt/i, nome: 'Ente bilaterale', cat: 'trattenuta', cosa: 'Contributo all’ente paritetico territoriale del settore: finanzia sussidi, formazione e integrazioni. Spesso esiste anche una quota a carico dell’azienda.', controlla: 'Gli enti bilaterali del turismo/commercio possono erogare prestazioni e sussidi: verifica a quale ente sei iscritto.' },
  { re: /fondo\s*(fast|est|sani|salute)|metasalute|sanimoda|cadiprof|faschim|fasa\b|sanilog|asim|san\.?arti/i, nome: 'Sanità integrativa', cat: 'trattenuta', cosa: 'Fondo sanitario del CCNL: rimborsa visite, diagnostica, ticket secondo il nomenclatore del fondo.', controlla: 'Registrati sul sito del fondo e usalo: se non lo usi, sono soldi persi.' },
  { re: /fon\.?te|cometa|fonchim|alifond|previmoda|prevedi|telemaco|byblos|previambiente|fondapi|fontemp|previdenza compl|fondo pens/i, nome: 'Fondo pensione negoziale', cat: 'trattenuta', cosa: 'Il tuo versamento al fondo pensione di categoria (+ quota datore + eventuale TFR). La quota a tuo carico è deducibile: riduce l’IRPEF.', controlla: 'Verifica sul sito del fondo che i versamenti arrivino (estratto conto annuale).', fonti: ['covip'] },
  { re: /irpef/i, nome: 'IRPEF', cat: 'trattenuta', cosa: 'Imposta sul reddito trattenuta alla fonte dal datore come sostituto d’imposta.', controlla: '', fonti: ['ade'] },
  { re: /detrazion/i, nome: 'Detrazioni', cat: 'dato', cosa: 'Sconti d’imposta (lavoro dipendente, familiari a carico…). Ricordati di comunicare al datore i familiari a carico: senza comunicazione non li applica.', controlla: '', fonti: ['ade'] },
  { re: /addiz(?:ionale|\.)?\s*(?:region|reg\.)/i, nome: 'Addizionale regionale', cat: 'trattenuta', cosa: 'Imposta regionale sull’imponibile dell’anno precedente, normalmente trattenuta a rate.', controlla: 'L’anno scritto nella voce indica il periodo fiscale a cui si riferisce.', fonti: ['finanze'] },
  { re: /addiz(?:ionale|\.)?\s*(?:comun|com\.)/i, nome: 'Addizionale comunale', cat: 'trattenuta', cosa: 'Imposta comunale: saldo dell’anno precedente e/o acconto dell’anno corrente, trattenuti a rate.', controlla: 'Controlla aliquota e soglia di esenzione del comune nelle tabelle del Dipartimento Finanze.', fonti: ['finanze'] },
  { re: /trattamento\s*integrativo|l\.?\s*21\/2020|bonus\s*irpef|ex\s*bonus\s*renzi/i, nome: 'Trattamento integrativo', cat: 'competenza', cosa: 'Fino a 100 €/mese per redditi bassi (fino a 15.000 €, o 28.000 con capienza particolare).', controlla: 'Se il reddito supera la soglia a conguaglio, va restituito (a rate): occhio alla voce di recupero.', fonti: ['ade'] },
  { re: /stipendio\s+tabellare|minimo\s+(?:tabellare|contrattuale)|paga\s+base|base\s+conglobata/i, nome: 'Stipendio tabellare / paga base', cat: 'competenza', cosa: 'Parte fissa stabilita dal CCNL per livello, qualifica o fascia economica.', controlla: 'Confronta livello, percentuale part-time e tabella economica vigente del contratto.' },
  { re: /retribuzione\s+professionale\s+docent|\bRPD\b/i, nome: 'Retribuzione professionale docenti (RPD)', cat: 'competenza', cosa: 'Compenso fisso accessorio previsto per il personale docente del comparto scuola.', controlla: 'Importo legato ad anzianità e durata del rapporto; nei contratti brevi può essere proporzionato.' },
  { re: /compenso\s+individuale\s+accessorio|\bCIA\b/i, nome: 'Compenso individuale accessorio (CIA)', cat: 'competenza', cosa: 'Voce accessoria fissa del personale ATA e di altre qualifiche pubbliche.', controlla: 'Verifica qualifica, fascia e mesi/giorni retribuiti.' },
  { re: /indennit[aà]\s+di\s+amministrazione|indennit[aà]\s+di\s+ente/i, nome: 'Indennità di amministrazione o ente', cat: 'competenza', cosa: 'Voce accessoria del pubblico impiego collegata all’amministrazione di appartenenza.', controlla: 'Importo e tredicesima dipendono dal comparto e dalla posizione economica.' },
  { re: /fondo\s+credito|gestione\s+credito|enpdep|opera\s+previdenza|inpdap|cpdel|cps|ctps/i, nome: 'Ritenuta previdenziale del pubblico impiego', cat: 'trattenuta', cosa: 'Contributo previdenziale o assistenziale tipico dei dipendenti pubblici, esposto separatamente nel cedolino NoiPA.', controlla: 'Base e aliquota cambiano secondo cassa, comparto e regime TFS/TFR.', fonti: ['inps'] },
  { re: /lavoro\s+supplementare|ore\s+supplementari/i, nome: 'Lavoro supplementare part-time', cat: 'competenza', cosa: 'Ore lavorate oltre l’orario part-time pattuito ma entro l’orario normale del full-time.', controlla: 'Quantità e maggiorazione onnicomprensiva dipendono dal CCNL.' },
  { re: /terzo\s+elemento|elemento\s+provinciale|salario\s+provinciale/i, nome: 'Elemento retributivo territoriale', cat: 'competenza', cosa: 'Quota prevista da contratto provinciale o territoriale, frequente in agricoltura, edilizia e artigianato.', controlla: 'Verifica tabella della provincia e qualifica applicata.' },
  { re: /accantonamento.*cassa\s+edile|cassa\s+edile.*accanton|gratifica\s+natalizia\s+e\s+ferie|\bGNF\b/i, nome: 'Accantonamento Cassa Edile ferie e gratifica', cat: 'dato', cosa: 'Quota che l’impresa versa alla Cassa Edile per ferie e gratifica natalizia degli operai.', controlla: 'Non è una normale trattenuta persa: verifica accrediti e liquidazioni sul prospetto della Cassa Edile.' },
  { re: /anzianit[aà]\s+professionale\s+edile|\bAPE\b/i, nome: 'Anzianità professionale edile (APE)', cat: 'competenza', cosa: 'Prestazione della Cassa Edile collegata alle ore lavorate e all’anzianità nel settore.', controlla: 'Controlla la posizione presso la Cassa Edile territoriale.' },
  { re: /elemento\s+variabile\s+della\s+retribuzione|\bEVR\b/i, nome: 'Elemento variabile della retribuzione (EVR)', cat: 'competenza', cosa: 'Premio territoriale/aziendale tipico dell’edilizia, legato a indicatori di produttività.', controlla: 'Percentuale e periodo sono stabiliti dagli accordi territoriali.' },
  { re: /vitto\s+e\s+alloggio|indennit[aà]\s+sostitutiva\s+(?:vitto|alloggio)/i, nome: 'Vitto e alloggio / indennità sostitutiva', cat: 'competenza', cosa: 'Valore convenzionale o indennità sostitutiva tipica del lavoro domestico e dei rapporti con convivenza.', controlla: 'Usa i valori convenzionali annuali del CCNL lavoro domestico.' },
  { re: /cassa\s*colf|cas\.sa\.colf/i, nome: 'Contributo CAS.SA.COLF', cat: 'trattenuta', cosa: 'Contributo alla cassa sanitaria e assistenziale del lavoro domestico.', controlla: 'Verifica ore contributive e quota ripartita tra datore e lavoratore.' },
  { re: /rateo.*(?:ferie|tredicesima|quattordicesima)|(?:ferie|13|14).*(?:rateo|maturat)/i, nome: 'Rateo maturato o liquidato', cat: 'competenza', cosa: 'Quota mensile di ferie o mensilità aggiuntiva maturata e, se presente in competenza, pagata nel mese.', controlla: 'Distingui il solo dato di maturazione dall’importo effettivamente liquidato.' },
  { re: /giornat[ae]\s+(?:ordinarie|lavorate)|ore\s+effettive/i, nome: 'Lavoro ordinario a giornate/ore', cat: 'competenza', cosa: 'Retribuzione del lavoro ordinario calcolata sulle presenze del periodo.', controlla: 'Quantità × tariffa deve coincidere con l’importo.' },
  { re: /assegno\s*unico|\banf\b|assegni\s*familiari/i, nome: 'Assegno unico / ANF', cat: 'competenza', cosa: 'Dal 2022 l’Assegno Unico per i figli lo paga DIRETTAMENTE l’INPS (domanda su inps.it), non passa più dalla busta. In busta restano solo vecchi ANF residuali.', controlla: '', fonti: ['inps'] },
  { re: /malattia/i, nome: 'Malattia', cat: 'competenza', cosa: 'Indennità INPS + integrazione datore secondo CCNL. In busta la vedi spesso divisa in “c/INPS” e “c/ditta”.', controlla: 'Percentuali di integrazione nell’articolo “malattia” del CCNL.', fonti: ['inps'] },
  { re: /carenza/i, nome: 'Carenza malattia', cat: 'competenza', cosa: 'Sono i primi giorni di malattia, non indennizzati dall’INPS e pagati dal datore solo secondo le regole del CCNL.', controlla: 'Verifica numero di giorni, percentuale e limite di eventi previsto dal contratto.' },
  { re: /maternit|congedo|parentale/i, nome: 'Maternità/congedi', cat: 'competenza', cosa: 'Indennità INPS (80% obbligatoria; parentale a percentuali variabili) spesso integrata dal CCNL.', controlla: '', fonti: ['inps'] },
  { re: /infortun/i, nome: 'Infortunio (INAIL)', cat: 'competenza', cosa: 'Indennità INAIL dal 4° giorno (60%→75%) + integrazioni CCNL; i primi 3 giorni a carico datore.', controlla: '' },
  { re: /mensa|buoni\s*pasto|ticket/i, nome: 'Buoni pasto / mensa', cat: 'competenza', cosa: 'Esenti da tasse e contributi fino a 4 € (cartacei) / 8 € (elettronici) al giorno.', controlla: '' },
  { re: /trasfert|diaria/i, nome: 'Trasferta', cat: 'competenza', cosa: 'Indennità esente entro 46,48 €/giorno in Italia (77,47 estero) se fuori dal comune; regole diverse per i “trasfertisti”.', controlla: '' },
  { re: /rimborso\s+spese|rimb\.?\s*spese|rimborso\s+(?:km|chilometr)/i, nome: 'Rimborso spese', cat: 'competenza', cosa: 'Restituzione di spese sostenute per lavoro. Può non essere imponibile se documentata e trattata secondo le regole fiscali.', controlla: 'Confronta importo, nota spese e giustificativi.' },
  { re: /fringe\s*benefit|benefit\s+in\s+natura|auto\s+aziendale/i, nome: 'Fringe benefit', cat: 'dato', cosa: 'Valore fiscale di beni o servizi concessi dall’azienda, come auto, alloggio o utenze. Può aumentare imponibile e contributi anche senza essere denaro pagato nel netto.', controlla: 'Verifica il valore convenzionale e la soglia di esenzione dell’anno.' },
  { re: /welfare/i, nome: 'Welfare aziendale', cat: 'competenza', cosa: 'Beni e servizi esenti entro i limiti annui dei fringe benefit fissati dalla legge di bilancio (soglie più alte per chi ha figli).', controlla: 'La soglia cambia di anno in anno: verificala.', fonti: ['ade'] },
  { re: /premio|risultato|produzion/i, nome: 'Premio di risultato', cat: 'competenza', cosa: 'Se previsto da accordo depositato, tassato al 5% fino a 3.000 € (detassazione premi).', controlla: '', fonti: ['ade'] },
  { re: /provvig|commissioni|incentiv/i, nome: 'Provvigioni o incentivi', cat: 'competenza', cosa: 'Compenso variabile collegato a vendite, obiettivi o risultati individuali.', controlla: 'Confronta il calcolo con il piano incentivi o l’accordo scritto.' },
  { re: /una\s*tantum/i, nome: 'Una tantum', cat: 'competenza', cosa: 'Erogazione arretrata prevista dal rinnovo del CCNL per coprire il periodo senza contratto.', controlla: 'Importi e rate sono scritti nell’accordo di rinnovo.' },
  { re: /vacanza\s+contrattuale|i\.?v\.?c\.?/i, nome: 'Indennità di vacanza contrattuale', cat: 'competenza', cosa: 'Importo temporaneo riconosciuto quando un CCNL è scaduto e il rinnovo non è ancora stato definito.', controlla: 'Verifica decorrenza e percentuale nell’accordo o nelle comunicazioni di rinnovo.' },
  { re: /arrotond/i, nome: 'Arrotondamento', cat: 'dato', cosa: 'Centesimi spostati al mese dopo per arrotondare il netto: partita di giro.', controlla: '' },
  { re: /congua/i, nome: 'Conguaglio', cat: 'dato', cosa: 'Ricalcolo di fine anno (o fine rapporto) di IRPEF e detrazioni sull’effettivo reddito annuo: può dare importi a credito o a debito a dicembre.', controlla: 'Confronta col prospetto della CU dell’anno.' },
  { re: /cession|pignoram|delegazion/i, nome: 'Cessione del quinto / pignoramento', cat: 'trattenuta', cosa: 'Trattenuta per prestiti o pignoramenti: per legge max 1/5 del netto (limiti diversi se concorrono più cause).', controlla: 'Il totale ceduto non può superare il quinto.' },
  { re: /trattenuta\s+prestito|rata\s+prestito|anticipo\s+stipendio|recupero\s+anticipo/i, nome: 'Prestito o anticipo da recuperare', cat: 'trattenuta', cosa: 'Rata di un prestito aziendale o recupero di una somma anticipata in precedenza.', controlla: 'Confronta con il piano di rimborso o con il cedolino in cui è stato erogato l’anticipo.' },
  { re: /assenza\s+non\s+retrib|permesso\s+non\s+retrib|aspettativa\s+non\s+retrib|sciopero/i, nome: 'Assenza non retribuita', cat: 'trattenuta', cosa: 'Riduzione della paga per ore o giornate non retribuite, come permesso non pagato, aspettativa o sciopero.', controlla: 'Verifica quantità e giornate sul cartellino presenze.' },
  { re: /sindacal/i, nome: 'Quota sindacale', cat: 'trattenuta', cosa: 'Iscrizione al sindacato (≈1% della paga base): volontaria, revocabile con comunicazione scritta.', controlla: '' },
  { re: /rimbors.*730|assistenza fiscale|credito 730/i, nome: 'Assistenza fiscale (730)', cat: 'dato', cosa: 'Crediti o debiti dalla dichiarazione, liquidati in busta da luglio.', controlla: 'Confronta col prospetto di liquidazione del 730.', fonti: ['ade'] },
  { re: /t\.?f\.?r/i, nome: 'TFR', cat: 'dato', cosa: 'Trattamento di fine rapporto: retribuzione utile ÷ 13,5 accantonata ogni anno (in azienda o al fondo pensione).', controlla: 'Vedi la sezione TFR del dettaglio e i Consigli.', fonti: ['normattiva'] },
];

function espandiAbbreviazioniVoce(value) {
  return String(value || '')
    .replace(/\bretr\.(?=\s|$)/gi, 'retribuzione')
    .replace(/\bmagg\.(?=\s|$)/gi, 'maggiorazione')
    .replace(/\bind\.(?=\s|$)/gi, 'indennità')
    .replace(/\bstraord\.(?=\s|$)/gi, 'straordinario')
    .replace(/\bfest\.(?=\s|$)/gi, 'festività')
    .replace(/\bperm\.(?=\s|$)/gi, 'permesso')
    .replace(/\baddiz\.(?=\s|$)/gi, 'addizionale')
    .replace(/\bcontr\.(?=\s|$)/gi, 'contributo')
    .replace(/\brimb\.(?=\s|$)/gi, 'rimborso');
}

/* Somiglianza locale per abbreviazioni ed errori OCR. Si usa solo oltre una
   soglia prudente; il lato contabile della riga resta sempre prioritario. */
const VOCI_SEMANTICHE = [
  ['Retribuzione ordinaria', 'retribuzione ordinaria', 'paga ordinaria', 'ore ordinarie', 'giornate ordinarie', 'stipendio ordinario'],
  ['Straordinario', 'lavoro straordinario', 'ore extra', 'straordinario feriale'],
  ['Maggiorazione per lavoro festivo', 'maggiorazione festiva', 'lavoro festivo maggiorato', 'magg festivita'],
  ['Lavoro notturno', 'maggiorazione notturna', 'ore notturne', 'lavoro notte'],
  ['Ferie', 'ferie godute', 'ferie retribuite', 'liquidazione ferie'],
  ['Permessi retribuiti / banca ore', 'permessi retribuiti', 'permessi goduti', 'banca ore'],
  ['Tredicesima', 'tredicesima mensilita', 'gratifica natalizia', '13 mensilita'],
  ['Quattordicesima', 'quattordicesima mensilita', '14 mensilita'],
  ['Superminimo', 'superminimo assorbibile', 'superminimo non assorbibile', 'sup ass'],
  ['Scatti di anzianità', 'scatti anzianita', 'aumenti periodici anzianita'],
  ['Contributi INPS (IVS)', 'contributo inps', 'ritenuta ivs', 'previdenza inps'],
  ['Contributo FIS', 'fondo integrazione salariale', 'contributo fis'],
  ['IRPEF', 'ritenuta irpef', 'imposta reddito persone fisiche'],
  ['Addizionale regionale', 'addizionale regione', 'ritenuta regionale'],
  ['Addizionale comunale', 'addizionale comune', 'ritenuta comunale'],
  ['Indennità di turno', 'indennita turno', 'compenso turni', 'turnistica'],
  ['Premio di risultato', 'premio produzione', 'premio risultato', 'bonus produttivita'],
  ['Rimborso spese', 'rimborso chilometrico', 'rimborso trasferta', 'rimborso nota spese'],
  ['TFR', 'trattamento fine rapporto', 'quota tfr', 'accantonamento tfr'],
];

const SEMANTIC_STOP = new Set(['DEL', 'DELLA', 'DELLE', 'PER', 'CON', 'ALLA', 'DAL', 'NEL', 'VOCE', 'IMPORTO', 'MESE']);
function semanticText(value) {
  return espandiAbbreviazioniVoce(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function semanticTokens(value) {
  return semanticText(value).split(' ').filter(token => token.length >= 3 && !SEMANTIC_STOP.has(token));
}
function trigramSet(value) {
  const text = '  ' + semanticText(value).replace(/\s+/g, ' ') + '  ';
  const result = new Set();
  for (let i = 0; i < text.length - 2; i++) result.add(text.slice(i, i + 3));
  return result;
}
function semanticEditDistance(left, right) {
  const a = String(left), b = String(right), row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}
function semanticSimilarity(left, right) {
  const aTokens = semanticTokens(left), bTokens = semanticTokens(right);
  if (!aTokens.length || !bTokens.length) return 0;
  let tokenScore = 0;
  for (const a of aTokens) {
    if (bTokens.some(b => a === b)) tokenScore += 1;
    else if (bTokens.some(b => a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))))) tokenScore += .72;
    else {
      const closest = Math.min(...bTokens.map(b => semanticEditDistance(a, b) / Math.max(a.length, b.length)));
      if (closest <= .22) tokenScore += .78;
      else if (closest <= .34) tokenScore += .52;
    }
  }
  tokenScore /= Math.max(aTokens.length, bTokens.length);
  const aTri = trigramSet(left), bTri = trigramSet(right);
  let intersection = 0;
  for (const tri of aTri) if (bTri.has(tri)) intersection++;
  const dice = 2 * intersection / Math.max(1, aTri.size + bTri.size);
  return tokenScore * .58 + dice * .42;
}
function semanticVoiceMatch(description) {
  if (semanticText(description).length < 6) return null;
  const sectorHints = typeof parserSectorVoiceHints === 'function'
    ? parserSectorVoiceHints().map(hint => [hint.name, ...hint.aliases]) : [];
  let best = null;
  for (const concept of [...VOCI_SEMANTICHE, ...sectorHints]) {
    const [name, ...aliases] = concept;
    const score = Math.max(...aliases.map(alias => semanticSimilarity(description, alias)));
    if (!best || score > best.score) best = { name, score };
  }
  const threshold = semanticTokens(description).length >= 2 ? .46 : .68;
  if (!best || best.score < threshold) return null;
  const known = VOCI_PATTERN.find(pattern => semanticText(pattern.nome) === semanticText(best.name));
  if (known) return Object.assign({}, known, { semanticScore: best.score });
  return {
    nome: best.name.replace(/\b\w/g, char => char.toUpperCase()),
    cat: 'dato', semanticScore: best.score,
    cosa: 'Causale riconosciuta per somiglianza terminologica con una famiglia di voci del settore.',
    controlla: 'La descrizione contiene abbreviazioni o possibili errori OCR: conferma il tipo nella schermata di verifica.',
  };
}

function classificaVoce(voce) {
  const v = voce || {};
  if (v.categoriaManuale || v.nomeManuale) {
    const categories = { competenza: 'competenza', trattenuta: 'trattenuta', dato: 'dato' };
    return {
      nome: v.nomeManuale || v.descrizione || 'Voce classificata manualmente',
      cat: categories[v.categoriaManuale] || (v.trattenuta != null ? 'trattenuta' : (v.competenza != null ? 'competenza' : 'dato')),
      cosa: 'Classificazione confermata o corretta sul dispositivo. BustaChiara la riutilizzerà per descrizioni uguali dello stesso software paghe.',
      controlla: 'La classificazione locale aiuta a leggere la voce, ma quantità e importi vanno comunque confrontati col cedolino.',
    };
  }
  const code = String(v.codice || '').toUpperCase();
  if (code && VOCI_CODICI[code]) return VOCI_CODICI[code];
  const description = String(v.descrizione || '').trim();
  const expandedDescription = espandiAbbreviazioniVoce(description);
  for (const pattern of VOCI_PATTERN) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(description) || (expandedDescription !== description && pattern.re.test(expandedDescription))) return pattern;
  }
  const semantic = semanticVoiceMatch(description);
  if (semantic) {
    const side = v.trattenuta != null ? 'trattenuta' : (v.competenza != null ? 'competenza' : semantic.cat);
    return Object.assign({}, semantic, {
      cat: semantic.cat === 'dato' ? side : semantic.cat,
      cosa: `${semantic.cosa} Riconoscimento offline per somiglianza ${Math.round(semantic.semanticScore * 100)}%; la causale originale resta “${description}”.`,
    });
  }
  if (v.costoAzienda != null || v.cDitta) {
    return {
      nome: 'Costo a carico dell’azienda',
      cat: 'dato',
      cosa: 'Importo informativo sostenuto dal datore: non viene sottratto dal tuo netto.',
      controlla: 'Non sommarlo alle trattenute del dipendente.',
    };
  }
  if (!description) {
    return {
      nome: 'Riga senza descrizione',
      cat: 'dato',
      cosa: 'Il documento non ha fornito una descrizione leggibile. La riga non va interpretata automaticamente come denaro ricevuto o trattenuto.',
      controlla: 'Confronta codice e posizione con il PDF originale.',
    };
  }
  if (v.trattenuta != null) {
    return {
      nome: code ? `Trattenuta gestionale ${code}` : 'Trattenuta aziendale',
      cat: 'trattenuta',
      cosa: `È un importo sottratto indicato con la causale originale “${description}”. La posizione nella colonna trattenute è certa, mentre la natura precisa può dipendere dal gestionale o da un accordo aziendale.`,
      controlla: 'Controlla base, quantità ed eventuale accordo collegato alla causale originale.',
    };
  }
  if (v.competenza != null) {
    return {
      nome: v.base != null && v.rifQta != null ? 'Competenza calcolata a quantità' : (code ? `Competenza gestionale ${code}` : 'Competenza aziendale'),
      cat: 'competenza',
      cosa: `È un importo riconosciuto a tuo favore con la causale originale “${description}”. Può derivare dal CCNL, da un accordo locale o da una voce specifica del gestionale.`,
      controlla: v.base != null && v.rifQta != null ? 'Verifica che base × quantità sia coerente con l’importo.' : 'Verifica il riferimento nel contratto o nell’accordo aziendale.',
    };
  }
  return {
    nome: 'Dato di calcolo del cedolino',
    cat: 'dato',
    cosa: 'È una base, quantità o informazione tecnica usata nei calcoli e non necessariamente incide direttamente sul netto.',
    controlla: 'Non considerarlo automaticamente una competenza o una trattenuta.',
  };
}

/* ---------- Consigli: oggettivi, con versione in parole semplici ----------
   Ogni consiglio espone i fatti, cosa cambia con ciascuna scelta e dove
   verificare. La decisione resta sempre alla persona. */
const CONSIGLI = [
  {
    id: 'tfr-vs-fondo', titolo: 'TFR: lasciarlo in azienda o destinarlo al fondo pensione?',
    testo: [
      'La situazione oggi: se nel riquadro TFR del cedolino la casella “TFR a fondi” è vuota, il tuo TFR resta in azienda. Entrambe le opzioni sono legittime: qui trovi cosa cambia, così decidi con i fatti.',
      'Se resta in azienda: cresce ogni anno dell’1,5% + 75% dell’inflazione (rendimento garantito per legge, di solito basso). Lo ricevi quando finisce il rapporto di lavoro. È tassato con la tua aliquota IRPEF media (in genere dal 23% in su). Dopo 8 anni di servizio puoi chiedere un anticipo fino al 70% per casa o spese sanitarie. Da sapere: per l’azienda il tuo TFR è liquidità a basso costo, quindi ha un interesse concreto a che tu lo lasci lì. Se l’azienda fallisce, il TFR è comunque protetto dal Fondo di Garanzia INPS (con tempi non brevi).',
      'Se va al fondo negoziale di categoria (es. Fon.Te. per turismo e commercio): 1) aderendo con il contributo minimo a tuo carico (0,55% nel turismo), il datore è obbligato per contratto ad aggiungere un suo contributo (0,55% nel turismo, 1,55% nel commercio): è retribuzione aggiuntiva che senza adesione non ricevi. 2) Alla fine la tassazione è più bassa: 15%, che scende fino al 9% dopo 35 anni di iscrizione. 3) I tuoi versamenti volontari sono deducibili fino a 5.164,57 € l’anno. 4) In cambio: il rendimento dipende dai mercati (il comparto garantito rende poco; gli altri oscillano), i soldi restano vincolati fino alla pensione salvo anticipi (75% per spese sanitarie in qualsiasi momento; 75% prima casa e 30% libero dopo 8 anni), e la scelta di conferire il TFR non è reversibile (puoi cambiare fondo, non tornare al TFR in azienda).',
      'Come decidere: sul comparatore COVIP confronta costi (indicatore ISC) e rendimenti storici del fondo del tuo CCNL con la rivalutazione del TFR. Nota di contesto: i fondi negoziali di categoria hanno in media costi molto più bassi dei fondi pensione proposti da banche e assicurazioni.',
    ],
    semplice: 'Il TFR è una parte di stipendio messa da parte, che ricevi quando lasci il lavoro. Puoi lasciarla in azienda o mandarla a un fondo pensione di categoria. In azienda: soldi garantiti, li prendi quando cambi lavoro, ma crescono poco e ci paghi più tasse. Nel fondo: l’azienda è obbligata ad aggiungere soldi suoi (nel turismo circa lo 0,55% in più della paga) e alla fine paghi meno tasse, ma i soldi restano bloccati fino alla pensione (con alcune eccezioni per salute e prima casa) e la scelta non si può annullare. Nessuna delle due è “sbagliata”: dipende se preferisci soldi disponibili prima o di più alla pensione.',
    fonti: ['covip', 'fonte', 'inps', 'normattiva'],
  },
  {
    id: 'silenzio-assenso', titolo: 'TFR e silenzio-assenso: i primi 6 mesi contano',
    testo: [ 'Nei primi 6 mesi da un’assunzione puoi scegliere per iscritto (modulo TFR2) dove destinare il TFR. Se non compili nulla, la legge applica il silenzio-assenso: il TFR che matura da quel momento va automaticamente al fondo negoziale del settore. Cosa cambia: con la scelta esplicita decidi tu; con il silenzio decide il meccanismo automatico, e il conferimento al fondo non è reversibile. Se sul cedolino vedi “TFR a fondi” e non ricordi di aver scelto, chiedi all’ufficio del personale copia del modulo.' ],
    semplice: 'Quando vieni assunto hai 6 mesi per dire dove vuoi il TFR (azienda o fondo pensione), con un modulo chiamato TFR2. Se non dici niente, dopo 6 mesi va da solo al fondo pensione del settore, e da lì non si torna indietro. Meglio scegliere consapevolmente che lasciar decidere il caso.',
    fonti: ['covip', 'inps'],
  },
  {
    id: 'controlla-annualmente', titolo: 'I 4 controlli da fare una volta l’anno (circa 30 minuti)',
    testo: [
      '1) Certificazione Unica vs buste: a marzo confronta la CU con la somma delle 12 buste dell’anno; imponibili e ritenute devono coincidere.',
      '2) Estratto conto contributivo sul sito INPS (accesso con SPID): i contributi trattenuti in busta devono risultare versati. Se sono trattenuti ma non versati, è un problema serio da segnalare subito.',
      '3) Saldo ferie e permessi a dicembre: un residuo che cresce ogni anno significa riposo pagato a cui stai rinunciando; per legge almeno 2 settimane di ferie vanno godute nell’anno.',
      '4) Se aderisci a un fondo pensione: nell’estratto conto annuale devono comparire i versamenti tuoi, quelli del datore e il TFR.',
    ],
    semplice: 'Una volta all’anno: 1) controlla che la Certificazione Unica (il riepilogo che ti dà il datore a marzo) corrisponda alle buste; 2) entra sul sito INPS con SPID e verifica che i contributi siano stati versati davvero; 3) guarda quante ferie non hai usato; 4) se hai un fondo pensione, controlla che i soldi arrivino. Se qualcosa non torna, chiedi prima all’azienda, poi a un sindacato o CAF (il controllo è gratuito).',
    fonti: ['ade', 'inps', 'covip'],
  },
  {
    id: 'sanita-enti', titolo: 'Fondo sanitario ed ente bilaterale: li paghi, quindi usali',
    testo: [ 'Tra le trattenute piccole (1–3 €) ci sono spesso il fondo sanitario di settore (FAST, EST, MètaSalute…) e l’ente bilaterale. Non sono tasse: sono iscrizioni a enti che erogano prestazioni reali — rimborsi di visite mediche ed esami, sussidi per libri scolastici, integrazioni al reddito. Cosa cambia: se ti registri sul sito del fondo e presenti le richieste, recuperi soldi; se non lo fai, paghi la quota senza ricevere nulla in cambio.' ],
    semplice: 'In busta paghi 2-3 € al mese per una specie di assicurazione sanitaria di settore (nel turismo si chiama Fondo FAST) e per un ente che dà piccoli aiuti economici. Non sono tasse: sono servizi già pagati. Registrati sul sito del fondo e chiedi i rimborsi quando fai visite mediche o esami: altrimenti sono soldi buttati.',
    fonti: ['fast', 'est'],
  },
  {
    id: 'superminimo-assorbibile', titolo: 'Superminimo assorbibile: cosa comporta',
    testo: [ 'Il superminimo è una quota di paga sopra il minimo del contratto, pattuita con l’azienda. Se è “assorbibile” (in molti cedolini: “SUP.ASS.”), quando il CCNL viene rinnovato l’aumento contrattuale viene compensato riducendo il superminimo: il tuo stipendio totale può restare uguale mentre chi è al minimo aumenta. È una clausola legittima, salvo patto contrario. Cosa puoi fare: verificare nel contratto o chiedere per iscritto se il tuo superminimo è assorbibile; in fase di assunzione o rinegoziazione puoi chiedere che sia dichiarato “non assorbibile”. Cosa cambia: non assorbibile = gli aumenti del CCNL si sommano alla tua paga; assorbibile = gli aumenti vengono riassorbiti finché il superminimo non si esaurisce.' ],
    semplice: 'Se la tua paga ha una parte chiamata “superminimo assorbibile”, quando il contratto nazionale dà un aumento, quell’aumento può essere “mangiato” dal superminimo: lo stipendio resta uguale. È legale, ma puoi chiedere all’azienda (per iscritto) di renderlo “non assorbibile”: in quel caso gli aumenti futuri si aggiungono davvero alla tua paga.',
    fonti: ['wikilabour', 'patronato'],
  },
  {
    id: 'riposi-limiti', titolo: 'Quanti giorni di fila si può lavorare (e quanto riposo spetta)',
    testo: [ 'La legge fissa tre limiti, che il CCNL può solo migliorare: 11 ore di riposo tra la fine di un turno e l’inizio del successivo; almeno 24 ore consecutive di riposo ogni 7 giorni (quindi, di regola, massimo 6 giorni di lavoro di fila — in alcuni settori come il turismo il riposo può essere spostato entro 14 giorni); massimo 48 ore medie a settimana, straordinari compresi; pausa di almeno 10 minuti se il turno supera le 6 ore. Cosa cambia se non vengono rispettati: hai diritto a recuperare il riposo e le violazioni sono sanzionabili; conserva i turni (foto o copie) e segnala prima all’azienda, poi se serve al sindacato o all’Ispettorato.' ],
    semplice: 'Regole base: tra un turno e l’altro devono passare almeno 11 ore; ogni settimana ti spetta almeno un giorno intero di riposo (quindi di norma non più di 6 giorni di lavoro di fila; nel turismo il giorno libero a volte slitta, ma entro 2 settimane deve arrivare); se lavori più di 6 ore di fila hai diritto a una pausa. Se questi limiti non vengono rispettati, tieni traccia dei turni e chiedi spiegazioni: ne hai diritto.',
    fonti: ['normattiva', 'inl'],
  },
  {
    id: 'valore-ora', titolo: 'Quanto vale un’ora (e un giorno) del tuo lavoro',
    testo: [
      'La paga oraria si calcola così: somma degli elementi fissi mensili ÷ divisore del CCNL. ESEMPIO: 2.000 € al mese con divisore 172 (Turismo) = 11,63 € l’ora. Da qui derivano quasi tutte le voci della busta: un’ora di straordinario al 15% vale 13,37 €, un’ora festiva al 20% vale 13,95 €.',
      'Il valore di una giornata si ottiene di solito dividendo la paga mensile per 26 (il “divisore giornaliero”): con 2.000 € al mese, una giornata vale circa 77 €. È anche il valore di un giorno di ferie: sapere quanto vale aiuta a leggere le voci “ferie godute” e a capire quanto riposo pagato stai accumulando senza usarlo.',
    ],
    semplice: 'Per sapere quanto vale un’ora del tuo lavoro: prendi la paga mensile e dividila per il numero fissato dal tuo contratto (per esempio 172 nel turismo). Con 2.000 € al mese fa 11,63 € l’ora, e una giornata vale circa 77 €. Così puoi controllare da solo le voci della busta: ore × paga oraria = importo.',
    fonti: ['cnel'],
  },
  {
    id: 'tredicesima-tasse', titolo: 'Perché tredicesima e quattordicesima sembrano tassate di più',
    testo: [
      'Su tredicesima e quattordicesima l’IRPEF si applica per intero, ma NON si applicano le detrazioni mensili da lavoro dipendente (per legge spettano solo sulle mensilità ordinarie). Risultato: a parità di lordo, il netto della mensilità extra è più basso di uno stipendio normale. Non è un errore del datore: è il funzionamento previsto.',
      'ESEMPIO: uno stipendio ordinario lordo di 2.000 € può dare circa 1.550-1.650 € netti (grazie alle detrazioni), mentre una tredicesima dello stesso importo può fermarsi attorno a 1.400-1.450 €. Se ricevi i ratei mese per mese (come in molte aziende del turismo), questo effetto è già “spalmato” dentro ogni busta.',
    ],
    semplice: 'La tredicesima è tassata come lo stipendio, ma senza gli “sconti” (detrazioni) che ogni mese abbassano le tasse. Per questo, a parità di importo, arriva un po’ meno netto del solito. È normale, non è un errore.',
    fonti: ['ade'],
  },
  {
    id: 'costo-azienda', titolo: 'Quanto costa il tuo lavoro all’azienda (spoiler: più del tuo lordo)',
    testo: [
      'Il tuo lordo non è ciò che l’azienda spende. Sopra il lordo, il datore paga: i contributi INPS a suo carico (circa il 28-30% del lordo), il premio INAIL, la quota TFR che accantona (circa il 7,4%), e i ratei di 13ª/14ª e ferie se ragioni sul mese. In pratica il costo azienda è circa 1,4-1,6 volte il lordo mensile.',
      'ESEMPIO: lordo 2.000 € al mese × 14 mensilità = 28.000 € l’anno; il costo totale per l’azienda si aggira sui 40-44.000 €. A cosa serve saperlo: a leggere le trattative con realismo (un aumento di 100 € lordi costa all’azienda ~150 €) e a capire il tuo netto in proporzione: di quei 40mila, a te ne arrivano ~21-22mila. La differenza sono contributi (che diventano pensione e tutele) e imposte.',
    ],
    semplice: 'L’azienda spende molto più del tuo stipendio lordo: sopra ci paga i suoi contributi INPS, l’assicurazione INAIL e mette da parte il TFR. Se il tuo lordo è 2.000 €, per l’azienda il costo reale è circa 3.000 € al mese. Serve saperlo per capire le trattative: quando chiedi 100 € di aumento, all’azienda ne costano circa 150.',
    fonti: ['inps', 'wikilabour'],
  },
  {
    id: 'minimi-rinnovi', titolo: 'Rinnovi del CCNL: gli aumenti arrivano a tranche',
    testo: [ 'Quando un contratto nazionale viene rinnovato, gli aumenti sono quasi sempre scaglionati in più tranche su 2-4 anni, a volte con una “una tantum” per il periodo non coperto. L’errore più frequente in busta paga è la tranche che non viene applicata nel mese giusto. Cosa puoi fare: segnati le date delle tranche (sono sui siti dei sindacati firmatari) e a ogni scadenza controlla che la paga base sia aumentata dell’importo previsto per il tuo livello.' ],
    semplice: 'Quando il contratto nazionale si rinnova, l’aumento non arriva tutto insieme: arriva a pezzi, in date precise. Capita spesso che un pezzo venga dimenticato. Cerca sul sito del sindacato le date degli aumenti del tuo contratto e, quando arriva la data, controlla che la paga base in busta sia salita.',
    fonti: ['filcams', 'fisascat', 'uiltucs', 'cnel'],
  },
  {
    id: 'dove-aiuto', titolo: 'Se qualcosa non torna: a chi rivolgersi, in ordine',
    testo: [
      '1) Ufficio paghe o consulente del lavoro dell’azienda: la maggior parte delle differenze sono errori materiali, corretti nel cedolino successivo.',
      '2) Sindacato di categoria o patronato/CAF: controllano le buste gratuitamente e ti dicono se c’è una base per reclamare.',
      '3) Vertenza sindacale o legale: per le differenze retributive il termine di prescrizione è 5 anni; servono le buste e il contratto, quindi conserva tutto.',
      '4) Ispettorato Nazionale del Lavoro: per irregolarità gravi (contributi trattenuti ma non versati, pagamenti fuori busta) accetta segnalazioni anche riservate.',
    ],
    semplice: 'Se un conto non torna: prima chiedi a chi fa le buste paga in azienda (spesso è un errore e lo correggono). Se la risposta non ti convince, porta le buste a un sindacato o a un CAF: il controllo non costa nulla. Per i casi gravi (per esempio contributi mai versati) esiste l’Ispettorato del Lavoro, a cui puoi segnalare anche senza far sapere il tuo nome. Hai 5 anni di tempo per reclamare soldi non pagati: conserva sempre tutte le buste.',
    fonti: ['patronato', 'inl'],
  },
];

/* ---------- Glossario in parole semplici ----------
   Ogni termine ha una spiegazione capibile da chi è al primo impiego. */
const GLOSSARIO = {
  competenza: { nome: 'Competenza', testo: 'Soldi che ti vengono riconosciuti nel mese: la paga delle ore lavorate, le ferie pagate, i rimborsi, le mensilità extra. Nella tabella stanno nella colonna “Competenze” e fanno salire il totale.' },
  trattenuta: { nome: 'Trattenuta', testo: 'Soldi che vengono tolti dalla busta prima di pagarti: tasse (IRPEF), contributi per la pensione (INPS) e piccole quote (fondo sanitario, ente bilaterale). Competenze meno trattenute = quello che ricevi.' },
  dato: { nome: 'Dato informativo', testo: 'Numero mostrato in busta solo per farti capire i calcoli (per esempio un imponibile): non aggiunge né toglie soldi direttamente.' },
  lordo: { nome: 'Lordo', testo: 'La paga prima di togliere tasse e contributi. È il numero di cui si parla nei contratti e negli annunci di lavoro.' },
  netto: { nome: 'Netto', testo: 'Quello che ti arriva davvero in banca a fine mese, dopo aver tolto tasse e contributi dal lordo.' },
  imponibile: { nome: 'Imponibile', testo: 'La parte di paga su cui si calcola una tassa o un contributo. Ce ne sono diversi: quello INPS (per i contributi) e quello IRPEF (per le tasse), leggermente differenti tra loro.' },
  contributi: { nome: 'Contributi (INPS)', testo: 'Soldi versati all’INPS per costruire la tua pensione e per le tutele: malattia, maternità, disoccupazione. In busta ne paghi tu una parte (circa il 9,19% dell’imponibile); un’altra parte, più grande, la paga l’azienda e non la vedi in busta.' },
  irpef: { nome: 'IRPEF', testo: 'La tassa sul reddito delle persone. Si paga “a scaglioni”: le prime fasce di reddito pagano una percentuale più bassa, le fasce sopra pagano di più. Il datore la trattiene ogni mese e la versa allo Stato per te.' },
  detrazione: { nome: 'Detrazione', testo: 'Uno sconto sulle tasse. Chi lavora come dipendente ha diritto a una detrazione che riduce l’IRPEF da pagare; più il reddito è basso, più lo sconto è grande.' },
  tfr: { nome: 'TFR (liquidazione)', testo: 'Una parte di stipendio che viene messa da parte ogni mese (circa una mensilità all’anno) e che ricevi quando il rapporto di lavoro finisce — oppure che puoi destinare a un fondo pensione. Cresce nel tempo con una rivalutazione.' },
  rateo: { nome: 'Rateo', testo: 'Il “pezzetto” mensile di una somma che matura in un anno. Esempio: la tredicesima è una mensilità intera che matura in 12 mesi; ogni mese ne maturi 1/12. Alcune aziende pagano i ratei ogni mese invece che tutti insieme.' },
  mensilita: { nome: '13ª e 14ª mensilità', testo: 'Mensilità extra rispetto alle 12 normali. La tredicesima (dicembre) c’è quasi ovunque; la quattordicesima (estate) solo in alcuni contratti, come turismo e commercio.' },
  ferie: { nome: 'Ferie', testo: 'Giorni di riposo pagati come se lavorassi. Il minimo per legge è 4 settimane all’anno; molti contratti ne danno di più (26 giorni nel turismo). Non possono essere sostituite da soldi, se non quando il rapporto finisce.' },
  rol: { nome: 'ROL / Permessi', testo: 'Ore di permesso pagate, da usare per assentarti anche solo qualche ora (visite, commissioni). Quante ne maturi all’anno dipende dal contratto e dall’anzianità.' },
  exfestivita: { nome: 'Ex festività', testo: 'Ore di permesso che compensano alcune feste religiose e civili abolite negli anni ’70: le “recuperi” come ore libere pagate.' },
  ccnl: { nome: 'CCNL', testo: 'Il Contratto Collettivo Nazionale di Lavoro del tuo settore: stabilisce paga minima, ferie, permessi, orari, malattia e molto altro. Sul cedolino è indicato quale si applica a te, spesso con un codice (es. CNEL H052).' },
  livello: { nome: 'Livello', testo: 'L’inquadramento che il contratto ti assegna in base alle mansioni: determina la paga minima. Controlla che il livello corrisponda al lavoro che fai davvero.' },
  divisore: { nome: 'Divisore orario', testo: 'Il numero fissato dal contratto per trasformare la paga mensile in paga oraria. Esempio: paga 2.000 € e divisore 172 → 11,63 € l’ora.' },
  progressivi: { nome: 'Progressivi', testo: 'I totali accumulati da gennaio a oggi: quanto hai guadagnato, quante tasse hai già pagato. Servono per i calcoli di fine anno.' },
  conguaglio: { nome: 'Conguaglio', testo: 'Il ricalcolo di dicembre (o di fine rapporto): si confrontano le tasse pagate mese per mese con quelle dovute sull’intero anno. Può risultare qualcosa da restituire o da ricevere.' },
  addizionali: { nome: 'Addizionali', testo: 'Piccole tasse extra che vanno alla tua regione e al tuo comune. Si pagano a rate l’anno successivo a quello a cui si riferiscono.' },
  superminimo: { nome: 'Superminimo', testo: 'Una parte di paga sopra il minimo del contratto, concordata con l’azienda. Se è “assorbibile”, i futuri aumenti del contratto possono essere compensati riducendola.' },
  scatti: { nome: 'Scatti di anzianità', testo: 'Piccoli aumenti automatici che scattano dopo un certo numero di anni nella stessa azienda (ogni 2 o 3 anni a seconda del contratto, fino a un massimo).' },
  arrotondamento: { nome: 'Arrotondamento', testo: 'Centesimi spostati da un mese all’altro per rendere il netto una cifra tonda. Si compensano da soli: non ci guadagni né ci perdi.' },
  fondopensione: { nome: 'Fondo pensione', testo: 'Un salvadanaio collettivo di settore dove puoi mettere il TFR e piccoli contributi per avere una pensione integrativa. Se aderisci, anche il datore è obbligato a versare una quota.' },
  fondosanitario: { nome: 'Fondo sanitario', testo: 'Una copertura sanitaria di settore pagata (in gran parte dall’azienda) tramite la busta: rimborsa visite, esami e cure secondo un elenco. Va attivata registrandosi sul sito del fondo.' },
  entebilaterale: { nome: 'Ente bilaterale', testo: 'Un ente gestito insieme da aziende e sindacati del settore, finanziato con piccole quote in busta: offre sussidi, corsi e integrazioni. Anche questo va usato: informati su cosa offre quello del tuo territorio.' },
  base: { nome: 'Importo base', testo: 'Il valore unitario usato per calcolare una voce: per le ore è la paga oraria, per le percentuali è l’importo su cui si applica la percentuale.' },
  riferimento: { nome: 'Riferimento', testo: 'La quantità della voce: quante ore, quanti giorni o quale percentuale. Importo base × riferimento = valore della voce.' },
  elementi: { nome: 'Elementi fissi della retribuzione', testo: 'I “mattoni” fissi della tua paga mensile: paga base (il minimo del contratto), eventuale superminimo, scatti di anzianità, indennità. La loro somma, divisa per il divisore, dà la tua paga oraria.' },
  pagabase: { nome: 'Paga base', testo: 'Il minimo di paga fissato dal contratto nazionale per il tuo livello. Sotto questo valore non è legale scendere.' },
  contingenza: { nome: 'Contingenza', testo: 'Una vecchia indennità che adeguava la paga al costo della vita, congelata nel 1992. In molti contratti oggi è già compresa nella paga base.' },
  retribuzioneUtileTfr: { nome: 'Retribuzione utile TFR', testo: 'La parte di paga del mese che conta per calcolare il TFR: la quota messa da parte è questa cifra divisa per 13,5 (meno un piccolo contributo).' },
  rivalutazioneTfr: { nome: 'Rivalutazione TFR', testo: 'L’“interesse” che il TFR lasciato in azienda guadagna ogni anno: 1,5% fisso più il 75% dell’inflazione.' },
  residuoAp: { nome: 'Residuo anno precedente', testo: 'Ferie o permessi avanzati dall’anno scorso e non ancora usati: si sommano a quelli che maturi quest’anno.' },
  maturato: { nome: 'Maturato', testo: 'Quanto hai accumulato finora quest’anno (di ferie, permessi o TFR): cresce ogni mese lavorato.' },
  goduto: { nome: 'Goduto', testo: 'Quanto hai già usato: i giorni di ferie o le ore di permesso che hai preso.' },
  saldo: { nome: 'Saldo', testo: 'Quanto ti resta da usare: residuo dell’anno scorso + maturato − goduto.' },
  cu: { nome: 'Certificazione Unica (CU)', testo: 'Il documento che il datore ti consegna ogni anno (entro marzo) con il riepilogo di quanto hai guadagnato e quante tasse hai pagato l’anno prima. Serve per la dichiarazione dei redditi.' },
  qualifica: { nome: 'Qualifica', testo: 'La categoria legale del tuo rapporto: operaio, impiegato, quadro o dirigente. Sul cedolino spesso è abbreviata (IMP = impiegato, OPE = operaio).' },
};
