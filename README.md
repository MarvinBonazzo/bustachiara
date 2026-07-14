# BustaChiara

**La busta paga italiana, spiegata — 100% privata, 100% offline e installabile su ogni dispositivo.**

BustaChiara legge le tue buste paga (PDF, scansioni o foto), spiega ogni voce, rifà i conti
(IRPEF, INPS, TFR, ferie, permessi, minimi contrattuali), segnala ciò che non torna e tiene
una **cronologia** mese per mese. Tutto avviene **dentro il tuo browser**: nessun dato viene
mai inviato da nessuna parte — non a un server, non a un'AI, non a nessuno.

---

## 1. Apri e installa BustaChiara

### Link pubblico dell’app

**[Apri BustaChiara](https://shivenbonazzo.github.io/bustachiara/)**

Per condividerla con altre persone basta inviare questo link. Non occorre cercare l’app su
App Store o Play Store: BustaChiara è una **PWA**, cioè un sito sicuro che si installa
direttamente sul dispositivo e poi si apre come una normale applicazione.

### iPhone e iPad

1. Apri il link con **Safari**.
2. Tocca **Condividi** — il quadrato con la freccia verso l’alto.
3. Scorri il menu e scegli **Aggiungi alla schermata Home**.
4. Tocca **Aggiungi**.
5. Apri BustaChiara dalla nuova icona comparsa nella schermata Home.

### Smartphone e tablet Android

1. Apri il link con **Google Chrome**.
2. Tocca il menu **⋮** in alto a destra.
3. Scegli **Installa app** oppure **Aggiungi alla schermata Home**.
4. Conferma con **Installa**.
5. Apri BustaChiara dall’icona nella schermata Home o dal cassetto delle applicazioni.

Se il browser mostra direttamente il pulsante **Installa**, puoi usare quello.

### PC Windows o Linux

1. Apri il link con **Google Chrome** o **Microsoft Edge**.
2. Clicca l’icona di installazione nella parte destra della barra degli indirizzi.
3. In alternativa, apri il menu del browser e scegli **Installa BustaChiara**.
4. Conferma: l’app comparirà nel menu Start/applicazioni e potrà avere un collegamento sul desktop.

Firefox può aprire e usare BustaChiara normalmente, ma per installarla come applicazione
desktop è consigliato Chrome o Edge.

### Mac

- **Safari 17 o successivo:** apri il link e scegli **File → Aggiungi al Dock**.
- **Chrome o Edge:** usa l’icona di installazione nella barra degli indirizzi oppure il
  comando **Installa BustaChiara** nel menu del browser.

### Dopo l’installazione

- Serve una connessione solo alla **prima apertura** e per ricevere gli aggiornamenti.
- Dopo il primo caricamento l’app funziona anche **offline**.
- Gli aggiornamenti arrivano automaticamente quando viene pubblicata una nuova versione.
- I dati restano nel browser del singolo dispositivo e non si sincronizzano: usa
  **Altro → Esporta tutto** per fare un backup o trasferirli.

Le stesse istruzioni sono sempre disponibili dentro l’app tramite il pulsante **Installa**.

---

> ⚠️ I dati (cronologia) sono salvati nel browser **del dispositivo che usi**: non si
> sincronizzano da soli tra dispositivi. Usa **⚙️ Altro → Esporta** per fare backup o
> passare i dati a un altro dispositivo.

### Due modalità (pulsanti in alto)
- **Dettagliato**: analisi completa — voci spiegate, elementi fissi, TFR, ferie/permessi,
  progressivi, confronto col CCNL e, in fondo, la tendina "Informazioni generali" con tutti
  i controlli automatici (formule incluse).
- **Semplificato**: pensato per chi è al primo impiego — solo netto, voci in parole povere
  (verde = ricevi, rosso = trattenuto) e consigli semplici. Restano le schede Importa,
  Dettaglio, Guida e fonti e Curiosità.

Ovunque trovi una **"i"**: toccala e si apre la spiegazione in parole semplici di quel
termine o di quella voce (competenza, trattenuta, imponibile, TFR, rateo…). Il dizionario
completo è nella scheda "Guida e fonti".

Il pulsante **Riassunto** (in alto) racconta il mese in poche righe senza tecnicismi:
quanto hai guadagnato lordo, cosa ti è stato tolto e per cosa (pensione, tasse, piccole
quote), il netto arrivato, le ferie e i permessi rimasti, il TFR messo da parte, e se i
controlli hanno trovato qualcosa che non torna.

### Flusso tipico
1. **Importa** → trascina il PDF della busta (anche **protetto da password**: viene chiesta
   al momento e non lasciata da nessuna parte), oppure **uno screenshot o una foto**: la
   lettura ottica locale ricostruisce la tabella delle voci usando le coordinate delle
   parole, quindi anche da un'immagine l'estrazione è quasi completa.
2. **Verifica** → l'app mostra tutto ciò che ha estratto; controlla e correggi. *I controlli
   valgono quanto i dati che confermi.*
3. **Dettaglio** → se c'è qualcosa che non torna appare SUBITO in cima ("Da controllare in
   questa busta", con cosa verificare e come muoversi); poi il riepilogo del mese, le voci
   spiegate una per una, gli elementi fissi, il TFR, ferie/permessi, il contratto e in fondo
   la tendina "Informazioni generali" con tutti i controlli. Ogni sezione è richiudibile
   (aperte di default).
4. **Importa** contiene anche l'archivio: andamento del netto, TFR accantonato, confronto
   mese su mese e la spiegazione di dove sono salvati i dati (browser del dispositivo,
   backup, incognito…).
5. **Curiosità** → schede oggettive (TFR vs fondo pensione, quanto vale un'ora del tuo
   lavoro, quanti giorni di fila si può lavorare, quanto costi all'azienda, perché la 13ª
   sembra più tassata…): quasi tutte hanno un riquadro "I tuoi numeri" calcolato sulla TUA
   busta. L'app spiega i fatti e cosa cambia con ogni scelta; non dice mai cosa fare.
6. **Il progetto** (pulsante in alto) → perché esiste l'app e perché tutto è locale.

Interfaccia: chiara e rassicurante, costruita attorno all’icona del **foglio illuminato**. Il pulsante **Riassunto** racconta il mese
in parole semplicissime e include la barra "Dove vanno i tuoi soldi" (verde = netto,
arancione = contributi INPS, rosso = tasse, grigio = piccole quote). Schede in ordine
Importa · Dettaglio · Guida e fonti · Curiosità · Altro (in Semplificato restano Importa,
Dettaglio, Guida e fonti e Curiosità). Quando pubblichi un aggiornamento della PWA, alza la
versione della cache in `pwa/sw.js` (`bustachiara-v2`, `-v3`…) così i dispositivi scaricano
la novità.

Licenza: **MIT** (file `LICENSE`, riportata anche nel piè di pagina dell'app). Verificato
prima della pubblicazione: nei file del progetto non ci sono chiavi API, password o dati
personali — l'unica "busta" inclusa è l'esempio con dati inventati (Mario Rossi).

---

## 2. Privacy: come è garantita (non "promessa")

- Il file HTML contiene una **Content-Security-Policy** che ordina al browser di **bloccare
  qualunque connessione di rete** (`default-src 'none'`, `connect-src` solo `blob:/data:`).
  Anche se il codice volesse inviare dati, il browser glielo impedirebbe. Puoi verificarlo:
  apri gli strumenti sviluppatore → scheda Rete → usa l'app → nessuna richiesta.
- I motori di lettura (pdf.js) e OCR (tesseract.js + dizionario italiano) sono **inglobati
  nel file** (per questo pesa ~9 MB): non viene scaricato nulla.
- La cronologia sta nel **localStorage del browser**. Il PDF originale **non** viene salvato:
  solo i dati estratti che confermi.
- Cancellando i dati di navigazione cancelli anche l'archivio → fai export periodici.
- L'export JSON contiene i tuoi dati in chiaro: trattalo come un documento riservato.

---

## 3. Cosa controlla automaticamente

| Controllo | Formula usata | Fonte |
|---|---|---|
| Quadratura netto | competenze − trattenute ± arrotondamento | aritmetica |
| Somma voci vs totali | Σ competenze, Σ trattenute | aritmetica |
| Contributo IVS | imponibile INPS × 9,19% (o 9,49% aziende CIGS) | INPS, circolare annuale |
| Contributo FIS | quota lavoratore = 1/3 dell'aliquota (0,50%/0,80%) | D.lgs. 148/2015 |
| IRPEF lorda | scaglioni dell'anno su imponibile mensilizzato | L. 207/2024, L. 199/2025 |
| Detrazioni lavoro dipendente | art. 13 TUIR su reddito presunto (dai progressivi) | TUIR |
| Taglio cuneo | somma esente ≤20k / ulteriore detrazione 20–40k | L. 207/2024 art. 1 c. 4–9 |
| Detassazione rinnovi 2026 | imponibile rinnovi × 5% (redditi ≤28k) | L. 199/2025 c. 7 |
| Quota TFR | retribuzione utile ÷ 13,5 − 0,50% imponibile INPS | art. 2120 c.c. |
| Paga oraria | totale elementi ÷ divisore CCNL (168/172/173…) | CCNL |
| Maggiorazione festiva/domenicale | tariffa voce ÷ tariffa ordinaria | CCNL |
| Maturazione ferie | maturato ÷ mesi × 12 vs giorni CCNL (min. 4 settimane) | D.lgs. 66/2003 + CCNL |
| Maturazione ROL/permessi | come sopra vs monte ore CCNL (con scaglioni anzianità) | CCNL |
| Minimo tabellare | paga base vs riferimento livello (dove disponibile) | CCNL / art. 36 Cost. |
| Ferie accumulate | saldo > 1,5 annualità → avviso | D.lgs. 66/2003 |
| TFR in azienda vs fondo | destinazione + consiglio coi tuoi numeri | COVIP |
| Storico | variazioni nette >15%, continuità ratei | archivio locale |

Ogni esito mostra **la formula** e **dove verificare** (link ufficiale). Un ⚠️ non è una
condanna: è un punto da chiarire con ufficio paghe, sindacato o consulente.

---

## 4. Normative incorporate (aggiornate a luglio 2026)

### Fisco e contributi (2024 · 2025 · 2026)
- **Scaglioni IRPEF**: 2024–25: 23/35/43%; **2026: 23/33/43%** (L. 199/2025, Bilancio 2026).
- **Detrazioni lavoro dipendente** art. 13 TUIR (formula completa, incl. +65 € 25–35k).
- **Taglio del cuneo fiscale** L. 207/2024, confermato 2026: somma esente (7,1/5,3/4,8%)
  per redditi ≤20.000 €; ulteriore detrazione 1.000 € (20–32k), decrescente fino a 40k.
- **Imposta sostitutiva 5%** sugli aumenti da rinnovo CCNL, redditi ≤28k (L. 199/2025 c. 7).
- **Trattamento integrativo** L. 21/2020 (e la voce di *restituzione* a rate).
- **IVS** 9,19%/9,49%, **FIS** D.lgs. 148/2015.
- **TFR** art. 2120 c.c.: quota, rivalsa 0,50%, rivalutazione 1,5% + 75% FOI, Fondo di
  Garanzia INPS, silenzio-assenso 6 mesi, anticipi, tassazione TFR vs fondo (15%→9%).
- **Addizionali regionali/comunali**: spiegate e ricondotte alle tabelle ufficiali del
  Dipartimento Finanze (non ricalcolate: vedi §5).

### Diritti minimi di legge (sezione "Guida")
Ferie 4 settimane e riposi (D.lgs. 66/2003) · 11 festività (L. 260/1949) · busta paga
(L. 4/1953) · retribuzione proporzionata (art. 36 Cost.) · malattia e comporto · maternità/
paternità/congedi (D.lgs. 151/2001) · permessi L. 104/92 · prescrizione crediti (5 anni).

### CCNL in archivio (20)
Turismo–Alberghi Confcommercio (CNEL H052, **testato sul cedolino reale**) · Pubblici
Esercizi FIPE · Terziario/Commercio Confcommercio · Metalmeccanici industria e artigiani ·
Edilizia · Studi professionali · Logistica/Trasporto merci · Chimico-farmaceutico ·
Alimentare · Tessile-Moda · Gomma-plastica · Legno-arredo · TLC · Multiservizi · Vigilanza ·
Sanità privata · Lavoro domestico · Somministrazione · Agricoltura operai.

Per ciascuno: ferie, ROL/ex festività, mensilità, divisori, scatti, fondo pensione
negoziale (con % contrattuali), fondo sanitario, enti bilaterali, note "brutali" di settore.

**Onestà sui dati CCNL**: i valori contrassegnati con ⚠️ nell'app sono *indicativi* (sintesi
sindacali e conoscenza consolidata, non il testo depositato). Il testo che fa fede è
l'archivio **CNEL** + le tabelle dei sindacati firmatari, sempre linkati. I CCNL si rinnovano
di continuo: più il tempo passa, più fidati dei link e meno dell'archivio interno.

---

## 5. Cosa MANCA (limiti dichiarati, senza giri di parole)

- **~1.000 CCNL non coperti in dettaglio.** In Italia esistono circa mille contratti
  depositati; nessuno strumento li copre tutti con precisione. Soluzione: l'app riconosce il
  codice CNEL stampato sul cedolino, applica i minimi di legge come base e ti dà un **editor
  CCNL** (⚙️ Altro) per inserire i valori del tuo contratto leggendoli dal testo ufficiale.
- **Minimi tabellari completi non inclusi.** Cambiano a ogni tranche di rinnovo: includerli
  tutti significherebbe sbagliarli. Dove non c'è il dato, l'app lo dice e linka le tabelle
  sindacali; puoi inserirli nell'editor.
- **Addizionali regionali e comunali non ricalcolate**: ~8.000 comuni con aliquote e soglie
  proprie. L'app verifica solo la plausibilità e linka le tabelle ufficiali del MEF.
- **Casi particolari non gestiti nei ricalcoli** (le voci vengono comunque mostrate e
  spiegate): apprendistato (aliquote ridotte), detrazioni per familiari a carico (serve la
  tua situazione familiare), part-time verticale/ciclico, dirigenti, operai edili (Cassa
  Edile), lavoro domestico (contributi a fasce), agricoli (CPL provinciali), conguagli di
  fine rapporto, pignoramenti complessi.
- **OCR**: su foto storte o scansioni di bassa qualità sbaglia — per questo c'è SEMPRE la
  schermata di verifica. Il PDF nativo è molto più affidabile della foto.
- **Il 2027 non esiste ancora**: le regole fiscali arrivano fino al 2026. Su anni successivi
  l'app avvisa e usa le regole più recenti note. Per aggiornarla: i parametri sono tutti in
  `src/data.js` (oggetto `FISCO`), poi `node build.mjs`.
- **Non è un consulente**: per vertenze, conguagli anomali o interpretazioni del CCNL serve
  un umano qualificato (sindacato, patronato/CAF, consulente del lavoro, INL). L'app ti dice
  *cosa* chiedere e *a chi*.

---

## 6. Dove verificare ogni cosa (fonti ufficiali)

| Tema | Fonte |
|---|---|
| Testo di QUALSIASI CCNL (per codice CNEL) | [CNEL — Archivio contratti](https://www.cnel.it/Archivio-Contratti) |
| Aliquote contributive, estratto conto, Fondo Garanzia TFR | [INPS](https://www.inps.it) |
| IRPEF, detrazioni, CU, 730 | [Agenzia delle Entrate](https://www.agenziaentrate.gov.it) |
| Addizionali regionali/comunali (tabelle ufficiali) | [Dip. Finanze](https://www.finanze.gov.it/it/fiscalita-regionale-e-locale/) |
| Testi di legge vigenti | [Normattiva](https://www.normattiva.it) |
| Costi e rendimenti di TUTTI i fondi pensione | [COVIP](https://www.covip.it) |
| Segnalazioni di irregolarità (anche riservate) | [Ispettorato Nazionale del Lavoro](https://www.ispettorato.gov.it) |
| Indice FOI per rivalutazione TFR | [ISTAT](https://www.istat.it) |
| Dizionario dei diritti | [WikiLabour](https://www.wikilabour.it) |
| Fondo pensione Commercio/Turismo | [Fon.Te.](https://www.fondofonte.it) |
| Sanità integrativa Turismo / Commercio | [Fondo FAST](https://www.fondofast.it) · [Fondo EST](https://www.fondoest.it) |
| Tabelle retributive e vertenze (Turismo/Commercio) | [Filcams CGIL](https://www.filcams.cgil.it) · [Fisascat CISL](https://www.fisascat.it) · [UILTuCS](https://www.uiltucs.it) |
| Parti datoriali (testi e circolari) | [Federalberghi](https://www.federalberghi.it) · [FIPE](https://www.fipe.it) · [Confcommercio](https://www.confcommercio.it) |
| Controllo gratuito buste/contributi | Patronati e CAF (INCA, ACLI, ITAL…) |

---

## 7. Progetto Open Source e contributi

BustaChiara è un progetto **Open Source** distribuito con licenza MIT. Il codice è pubblico
e chiunque può aiutare a rendere l’app più chiara, precisa, accessibile e utile.

Puoi contribuire in molti modi:

- segnalando errori o comportamenti poco chiari tramite le
  [GitHub Issues](https://github.com/ShivenBonazzo/bustachiara/issues);
- proponendo nuove funzioni o miglioramenti dell’interfaccia;
- correggendo o semplificando le spiegazioni;
- verificando dati, formule e informazioni relative ai CCNL;
- migliorando parser PDF, OCR, accessibilità, documentazione o codice;
- inviando una Pull Request al
  [repository GitHub](https://github.com/ShivenBonazzo/bustachiara).

Ogni persona che contribuirà concretamente al progetto verrà riconosciuta nella
**lista dei contributori**. La lista verrà aggiornata qui man mano che arriveranno
contributi accettati.

---

## 8. Architettura tecnica

```
BustaChiara/
├── pwa/               ← versione installabile, pronta per GitHub Pages
│   ├── index.html     (generato automaticamente durante il deploy, non versionato)
│   ├── manifest.webmanifest, sw.js (offline totale dopo la prima visita)
│   └── icons/         (foglio illuminato + tagli PWA generati da make-icons.py)
├── build.mjs          ← assembla pwa/index.html dai sorgenti
├── make-icons.py      ← rigenera le icone PWA dalla sorgente (richiede Pillow)
├── src/
│   ├── template.html  ← struttura + CSP
│   ├── app.css        ← stile responsive e identità visiva verde del foglio illuminato
│   ├── data.js        ← FISCO (2024–26), CCNL_DB (20), dizionario voci, GLOSSARIO, LEGGE, FONTI, CONSIGLI
│   ├── parser.js      ← parser PDF (layout Zucchetti + euristiche generiche + testo OCR)
│   ├── checks.js      ← motore dei controlli
│   └── ui.js          ← interfaccia, import/OCR, cronologia, export
└── vendor/            ← librerie inglobate alla build
    ├── pdf.min.js + pdf.worker.min.js        (pdf.js 3.11.174, Apache-2.0)
    ├── tesseract.min.js + worker + core wasm (tesseract.js 5.1.1, Apache-2.0)
    └── ita.traineddata.gz                    (dizionario OCR italiano "fast")
```

- **Un solo file**: i worker girano da `blob:` URL e il dizionario OCR viene servito da un
  intercettatore di `fetch` interno al worker → funziona anche da `file://`, senza server.
- **Parser**: usa le coordinate del testo PDF per ricostruire la tabella voci (colonne
  IMPORTO BASE / RIFERIMENTO / TRATTENUTE / COMPETENZE), gestisce le stranezze del formato
  Zucchetti (etichette con separatore "s") e ha un fallback generico per altri software
  (TeamSystem, Inaz, ADP…) + testo OCR. Qualunque estrazione passa dalla schermata di verifica.
- **Ricompilare dopo una modifica**: `node build.mjs` (serve solo Node.js). Su GitHub il
  workflow Pages esegue automaticamente la build prima di ogni pubblicazione.

### Test eseguiti
- Parser e controlli verificati su un **cedolino Zucchetti reale** (Turismo 4° livello,
  giugno 2026): 27/27 voci, totali, TFR, ratei e progressivi estratti correttamente;
  tutti i ricalcoli (IVS, IRPEF 2026, detrazioni, cuneo, detassazione rinnovi, quota TFR,
  divisore 172, ferie 26 gg, ROL 104 h, maggiorazione festiva 20%) coerenti.
- App verificata in **Chromium** e **WebKit/Safari** su protocollo `file://` (Playwright):
  caricamento, lettura PDF, OCR inglobato e archivio locale funzionanti, zero errori console.
- UI verificata su viewport desktop e mobile (375×812).

---

## 9. Disclaimer

BustaChiara è uno **strumento informativo e didattico**. Non sostituisce consulenti del
lavoro, CAF, patronati o sindacati; non fornisce consulenza fiscale, legale o finanziaria.
I confronti TFR/fondo pensione descrivono i meccanismi normativi e non sono una
raccomandazione di investimento: prima di decidere consulta il comparatore COVIP e, se
serve, un professionista. Verifica sempre i valori contrassegnati ⚠️ sulle fonti ufficiali.
