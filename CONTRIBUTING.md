# Contribuire a BustaChiara

Grazie: BustaChiara è open source proprio perché un cedolino diverso può insegnare al
progetto qualcosa di utile per tutti.

## Regola numero uno: nessun cedolino reale su GitHub

Una Issue e una Pull Request sono pubbliche. Non caricare PDF, foto, screenshot, testo OCR,
nomi, codici fiscali, matricole, indirizzi, IBAN, nomi del datore o importi riconducibili a
una persona reale.

Per segnalare un formato nuovo:

1. riproduci soltanto la struttura che crea il problema;
2. sostituisci identità e causali aziendali con dati inventati;
3. cambia tutti gli importi, mantenendo però la quadratura matematica;
4. usa, se possibile, **Backup → Esporta fixture anonimo** e rileggi comunque il file;
5. allega il fixture JSON, mai il documento originale.

Se non riesci ad anonimizzare il caso con sicurezza, apri una Issue senza allegati e
descrivi soltanto il tipo di layout.

## Modifica semplice

1. Crea un fork del repository su GitHub.
2. Scaricalo con GitHub Desktop oppure con `git clone`.
3. Modifica i file dentro `src/`.
4. Esegui tutti i test indicati sotto.
5. Apri una Pull Request spiegando problema, soluzione e verifiche eseguite.

Non serve installare dipendenze npm: per lo sviluppo basta Node.js 22 o successivo.

```bash
node tests/parser.test.mjs
node tests/parser-matrix.test.mjs
node tests/non-payslip-gaps.test.mjs
node tests/data-explanations.test.mjs
node tests/ai-ocr.test.mjs
node tests/recognition.test.mjs
node tests/ui-pwa.test.mjs
node build.mjs
```

La build installabile viene generata nella cartella `pwa/`.

## Aggiungere un layout

- Crea una fixture sintetica con coordinate, non soltanto una riga di testo.
- Aggiungi i valori attesi al gold JSON.
- Correggi una regola generale: non legare il parser alla posizione o all'importo di un
  singolo esempio.
- Aggiungi anche almeno un caso che non deve cambiare, per evitare regressioni.
- Un valore incerto deve richiedere controllo; non deve essere inventato.

La procedura e le famiglie già studiate sono in
[`docs/parser-research.md`](docs/parser-research.md).

## Come viene riconosciuto il contributo

Chi aiuta con codice, test, documentazione, accessibilità o ricerca viene aggiunto alla
lista dei contributori del progetto. Nella Pull Request indica il nome o nickname con cui
vuoi comparire.
