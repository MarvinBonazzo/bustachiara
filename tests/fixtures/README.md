# Fixture del parser

I file di questa cartella contengono esclusivamente dati inventati. Le strutture riproducono
famiglie di cedolini osservate in fac-simile pubblici (LUL privato, NoiPA, lavoro domestico,
edilizia/Cassa Edile), senza conservare PDF, nomi, codici fiscali o aziende reali.

Ogni nuovo formato va aggiunto come testo OCR o come righe con coordinate e deve indicare i
campi attesi. In questo modo una correzione non può rompere silenziosamente i formati già coperti.

`parser-sector-matrix.json` estende la regressione ai settori e agli eventi che cambiano
strutturalmente il cedolino: privato/Zucchetti turismo, NoiPA, Cassa Edile, agricoltura,
lavoro domestico, cooperativa, somministrazione, dirigenti, turni e maggiorazioni,
tredicesima, quattordicesima, conguaglio, cessazione e OCR rumoroso. Importi, date,
aziende e identità sono inventati e non provengono da persone reali; gli eventuali codici
CNEL sono identificatori pubblici già presenti nell'indice contrattuale incluso nel progetto.
