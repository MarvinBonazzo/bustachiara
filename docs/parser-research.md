# Ricerca e metodo del parser

Questo documento descrive come ampliare il parser di BustaChiara senza servizi a pagamento,
senza inviare cedolini a server esterni e senza costruire correzioni valide per un solo PDF.

## Famiglie di layout considerate

I cedolini non cambiano soltanto per software: cambiano per settore e datore. Il corpus di
regressione riproduce quindi famiglie strutturali, non documenti o identità reali:

| Famiglia | Caratteristiche da coprire |
|---|---|
| LUL privato | testata anagrafica, elementi fissi, tabella voci, contributi, imposte, ratei, TFR e presenze |
| Jet HR / Zucchetti | codici numerici o alfanumerici, tabelle su una o più pagine, riepiloghi separati |
| NoiPA | sezioni a etichette, competenze fisse/accessorie, ritenute previdenziali e fiscali |
| Lavoro domestico | impaginazione semplice, vitto/alloggio, contributi a fasce, TFR e netto |
| Edilizia / Cassa Edile | GNF, APE, EVR, accantonamenti e trattenute di settore |
| Agricoltura e marittimo | giornate, compartecipazioni, indennità e sigle di settore |
| Spettacolo, sport e dirigenti | ENPALS/FPLS, compensi, premi, indennità e fondi dedicati |
| Cessazione e conguaglio | competenze finali, ferie residue, TFR, arretrati e ricalcoli fiscali |
| Tabelle senza codice | descrizione e importi riconosciuti dal ruolo delle colonne |
| Scansione/foto | testo incompleto, rotazione, sfondo irregolare e coordinate OCR rumorose |

Le fonti pubbliche usate come riferimento visivo e terminologico sono:

- [EBR Piemonte — manuale per leggere il cedolino](https://www.ebrpiemonte.it/images/documenti/2022/manuali/MANUALE_LEGGERE_ED_INTERPRETARE_IL_CEDOLINO_PAGA.pdf), per il LUL classico con colonne `COD.`, `ORE/GG`, `%`, `DATO BASE`, `RITENUTE` e `COMPETENZE`;
- [NoiPA — come si legge il cedolino](https://noipa.mef.gov.it/cl/come-si-legge-il-cedolino-noipa), per il pubblico impiego a riquadri e dettaglio su più pagine;
- [TeamSystem — esempio di cedolino LYNFA multipagina](https://marketing.teamsystem.com/diretta-professionisti/dem-diretta-prof/newsletter-marzo-2018-dir-prof), per fronte economico, retro con ratei, progressivi, fondi e TFR;
- [lavoro domestico — facsimile pubblico](https://workledger.it/modulistica/fac-simile-busta-paga-colf-badante.pdf), per colonne `Tempo`, `Base`, `Figurativo`, `Competenze` e `Trattenute`, calendario e contributi domestici;
- [Cassa Edile Brescia — quattro esempi pubblici](https://www.cassaedilebrescia.it/wp-content/uploads/2023/01/2022-01-GENNAIO-2022-BUSTE-PAGA.pdf), per ordinario, malattia, infortunio e impiegato con GNF/CAPE e imponibili distinti;
- [INPS — aliquote 2026 per operai agricoli](https://www.inps.it/it/it/inps-comunica/notizie/dettaglio-news-page.news.2026.04.lavoratori-agricoli-le-aliquote-contributive-2026.html), per OTI/OTD e conteggi a giornate;
- [INPS — circolare 6/2026](https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.circolare-numero-6-del-30-01-2026_15151.html), per retribuzioni convenzionali, massimali e categorie particolari come spettacolo e marittimi;
- [CNEL — Contratti Open Data](https://www.cnel.it/archivio-contratti/contratti-open-data), per codici, titoli e settori dei contratti.

I documenti pubblici vengono consultati, non copiati nel repository. I test contengono solo
testo e numeri inventati: nessun nome, codice fiscale, datore o cedolino reale.

## Come viene misurata la precisione

Dire “funziona con qualsiasi cedolino” non è una misura verificabile. Il benchmark separa:

- PDF nativi a coordinate, scansioni e testo OCR rumoroso;
- correttezza dei campi, delle singole voci e del lato contabile;
- importo, segno, unità e colonna di provenienza;
- righe spurie, quadratura dei totali e zona evidenziata sul documento;
- formati già conosciuti e layout nuovi tenuti fuori dalle regole durante lo sviluppo.

La CI richiede il 100% delle asserzioni del corpus versionato. Il target progettuale sui PDF
nativi è almeno il 99,5% dei valori numerici e zero righe economiche inventate. Questo non
equivale al 100% su qualunque documento del mondo: una scansione illeggibile deve produrre
una richiesta di controllo, non una falsa certezza.

Sono inoltre necessari casi negativi per CU, modello 730, F24, contratto di assunzione,
semplice prospetto presenze e cedolino pensione: condividono molte parole con una busta paga,
ma non devono essere archiviati come cedolini da lavoro dipendente.

## Pipeline gratuita e locale

1. **Acquisizione con provenienza visuale** — pdf.js estrae parole, pagina e coordinate dai
   PDF nativi. Tesseract legge immagini e scansioni interamente nel browser. La verifica può
   quindi evidenziare sul documento l'origine del campo.
2. **OCR selettivo e pre-processing** — nei PDF nativi Tesseract interviene soltanto sulle
   pagine con testo insufficiente. Foto e scansioni vengono corrette per orientamento,
   prospettiva, margini e inclinazione; se il primo passaggio è debole viene eseguita una
   seconda segmentazione e le parole vengono fuse per posizione e affidabilità.
3. **Normalizzazione** — separatori decimali, date, abbreviazioni, intestazioni equivalenti,
   codici numerici/alfanumerici e righe senza codice diventano una rappresentazione comune.
4. **Candidati e provenienza** — ogni totale possibile conserva valore, pagina, metodo e
   confidenza. Il parser non si ferma alla prima etichetta trovata.
5. **Risoluzione globale** — le combinazioni di competenze, trattenute, arrotondamento e
   netto vengono confrontate con somme delle voci, calcolo delle righe, ratei, imponibili,
   paga oraria e TFR. Le alternative vicine restano selezionabili in verifica.
6. **Classificazione semantica e settoriale** — codici noti, sinonimi, abbreviazioni,
   somiglianza anche con refusi, moduli di settore e lato contabile stabiliscono nome e tipo
   della voce. La descrizione originale resta sempre disponibile.
7. **Apprendimento locale** — quando l'utente corregge una causale, la mappatura viene
   salvata nel suo browser per quel software paghe. Non è telemetria e non lascia il
   dispositivo.
8. **CCNL assistito** — codice CNEL, titolo, settore e terminologia producono suggerimenti
   motivati. In caso di ambiguità decide l'utente.
9. **Verifica umana** — campi deboli o derivati sono marcati e collegati alla loro zona sul
   documento. Una scansione illeggibile non viene trasformata in una falsa certezza.
10. **Archivio multi-documento** — tipo, datore e periodo identificano il record, così due
    datori o un cedolino ordinario e una tredicesima dello stesso mese non si sovrascrivono.

Per il miglioramento delle scansioni sono state seguite le indicazioni ufficiali di
[Tesseract sull'accuratezza](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) e
la tecnica di [soglia adattiva documentata da OpenCV](https://docs.opencv.org/4.x/d7/dd0/tutorial_js_thresholding.html).

## Aggiornamento CNEL

`scripts/update-cnel.mjs` scarica l'archivio corrente ufficiale, raggruppa i depositi per
codice e genera `src/cnel-index.js`. Al 14 luglio 2026 l'indice contiene 2.260 depositi e
1.143 codici unici. Il workflow GitHub lo aggiorna ogni settimana; i 20 CCNL curati in
`src/data.js` restano separati perché solo essi contengono parametri adatti ai ricalcoli.

## Come aggiungere un nuovo formato

1. Non allegare il cedolino reale a una Issue pubblica.
2. In **Backup**, aprire il controllo privacy ed esportare il fixture: identità, estratti
   testuali e importi originali vengono rimossi o trasformati. Ricontrollare comunque le
   causali proprietarie prima di condividerlo.
3. Ridurre il caso alla minima struttura che riproduce l'errore.
4. Aggiungerlo a `tests/fixtures/parser-sector-matrix.json` con coordinate e campi attesi.
5. Correggere una regola generale e lanciare `node tests/parser-matrix.test.mjs` insieme
   alla suite completa descritta nel README.

Un modello ML nel browser è tecnicamente possibile con ONNX Runtime Web, ma non viene
incluso finché non esiste un corpus ampio, etichettato e legalmente riutilizzabile: senza
questi dati imparerebbe gli errori di pochi esempi e renderebbe il risultato meno spiegabile.
Il sistema attuale è deterministico, verificabile e interamente gratuito.
