# Sicurezza e privacy

BustaChiara elabora documenti salariali e tratta quindi dati molto sensibili, anche se
lavora soltanto nel browser.

## Segnalare una vulnerabilità

Non aprire una Issue pubblica se il problema può esporre dati, aggirare la Content Security
Policy o causare l'invio di documenti in rete. Usa una
[segnalazione privata di sicurezza su GitHub](https://github.com/ShivenBonazzo/bustachiara/security/advisories/new).

Descrivi il problema con dati inventati. Non allegare mai una busta paga reale, una foto,
un export personale o credenziali. Se servono passaggi di riproduzione, crea un documento
sintetico minimo.

## Ambito

Sono particolarmente importanti:

- richieste di rete inattese durante importazione, OCR o analisi;
- lettura o esposizione involontaria del `localStorage`;
- contenuti importati capaci di eseguire codice;
- dati personali presenti nella build o nel repository;
- export dichiarati anonimi che permettono di ricostruire l'identità.

Le normali imprecisioni di riconoscimento vanno invece segnalate con il template “Nuovo
layout”, sempre usando dati sintetici.

