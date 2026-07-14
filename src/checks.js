/* ============================================================
   BustaChiara — Motore dei controlli
   Ogni controllo produce: { livello: ok|info|warn|alert, area,
   titolo, dettaglio, formula?, fonti?: [id FONTI] }
   Filosofia: mostrare SEMPRE la formula usata e dove verificare.
   ============================================================ */

function eseguiControlli(rec, ccnl, storico = []) {
  const F = [];
  const anno = rec.periodo ? rec.periodo.anno : new Date().getFullYear();
  const mese = rec.periodo ? rec.periodo.mese : null;
  const fisco = FISCO[anno] || FISCO[2026];
  const annoRegole = FISCO[anno] ? anno : 2026;
  const d = rec.derivati || {};
  const t = rec.totali || {};
  const add = (livello, area, titolo, dettaglio, formula, fonti) => F.push({ livello, area, titolo, dettaglio, formula, fonti });
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

  if (!FISCO[anno]) add('info', 'Fisco', `Regole fiscali ${anno} non in archivio`, `Uso le regole ${annoRegole}. Le aliquote cambiano con la legge di bilancio di ogni anno: verifica sul sito dell’Agenzia delle Entrate.`, null, ['ade']);

  /* --- 1. Quadratura del netto --- */
  if (t.competenze != null && t.trattenute != null && t.netto != null) {
    const arr = t.arrotondamento || 0;
    const atteso = t.competenze - t.trattenute + arr;
    if (near(atteso, t.netto, 0.02)) add('ok', 'Quadratura', 'Il netto quadra', `Competenze ${fmtEur(t.competenze)} − trattenute ${fmtEur(t.trattenute)} + arrotondamento ${fmtEur(arr)} = ${fmtEur(t.netto)} €.`);
    else add('alert', 'Quadratura', 'Il netto NON quadra', `Competenze − trattenute + arrotondamento = ${fmtEur(atteso)} €, ma il netto indicato è ${fmtEur(t.netto)} €. Se i dati estratti sono corretti, chiedi spiegazioni all’ufficio paghe.`, 'netto = totale competenze − totale trattenute ± arrotondamento');
  } else add('warn', 'Quadratura', 'Totali incompleti', 'Non ho netto, competenze e trattenute insieme: completa i campi nella schermata di verifica per attivare il controllo di quadratura.');

  /* --- 2. Somma delle voci vs totali --- */
  const sumComp = rec.voci.reduce((s, v) => s + (v.competenza || 0), 0);
  const sumTratt = rec.voci.reduce((s, v) => s + (v.trattenuta || 0), 0);
  if (t.competenze != null && sumComp > 0) {
    if (near(sumComp, t.competenze, 0.6)) add('ok', 'Quadratura', 'Le voci a credito sommano al totale', `Somma competenze delle voci = ${fmtEur(sumComp)} €.`);
    else add('info', 'Quadratura', 'Somma voci ≠ totale competenze', `La somma delle competenze estratte (${fmtEur(sumComp)} €) differisce dal totale (${fmtEur(t.competenze)} €). Può darsi che una voce non sia stata estratta o che alcune voci siano solo figurative: controlla la tabella.`);
  }
  if (t.trattenute != null && sumTratt > 0 && !near(sumTratt, t.trattenute, 0.6))
    add('info', 'Quadratura', 'Somma trattenute ≠ totale', `Somma trattenute estratte ${fmtEur(sumTratt)} € vs totale ${fmtEur(t.trattenute)} €: verifica che tutte le voci a debito siano state lette.`);

  /* --- 3. Contributi IVS --- */
  if (d.ivs && d.ivs.imponibile != null && d.ivs.importo != null) {
    const perc = d.ivs.perc != null ? d.ivs.perc : fisco.ivs;
    const atteso = d.ivs.imponibile * perc / 100;
    if (near(atteso, d.ivs.importo, 0.05)) add('ok', 'Contributi', `Contributo IVS corretto (${fmtEur(perc)}%)`, `${fmtEur(d.ivs.imponibile)} × ${fmtEur(perc)}% = ${fmtEur(atteso)} €.`, null, ['inps']);
    else add('alert', 'Contributi', 'Contributo IVS non torna', `Atteso ${fmtEur(atteso)} € (${fmtEur(d.ivs.imponibile)} × ${fmtEur(perc)}%), trovato ${fmtEur(d.ivs.importo)} €.`, 'IVS = imponibile previdenziale × aliquota', ['inps']);
    if (d.ivs.perc != null && ![9.19, 9.49].includes(+d.ivs.perc.toFixed(2)))
      add('warn', 'Contributi', `Aliquota IVS insolita: ${fmtEur(d.ivs.perc)}%`, 'Le aliquote standard a carico del lavoratore sono 9,19% (generalità) o 9,49% (aziende soggette a CIGS). Aliquote diverse esistono (apprendisti 5,84%, settori speciali) ma vale la pena verificare.', null, ['inps']);
  } else add('info', 'Contributi', 'Contributo IVS non riconosciuto', 'Non ho trovato la voce del contributo pensionistico (IVS/INPS ~9,19%): se manca davvero dal cedolino è molto strano.', null, ['inps']);

  /* --- 4. FIS --- */
  if (d.fis && d.fis.perc != null) {
    const ok = [0.167, 0.267].some(p => Math.abs(d.fis.perc - p) < 0.02);
    add(ok ? 'ok' : 'info', 'Contributi', `Contributo FIS ${fmtEur(d.fis.perc, 3)}%`, ok
      ? 'Quota lavoratore del Fondo di Integrazione Salariale (1/3 dell’aliquota totale): valore nella norma.'
      : 'Quota FIS diversa dalle tipiche 0,167% / 0,267%: dipende dalla dimensione aziendale, verifica con l’ufficio paghe.', null, ['inps']);
  }

  /* --- 5. Reddito annuo presunto --- */
  let redditoPresunto = null, baseStima = '';
  if (rec.progressivi && rec.progressivi.impIrpef && mese) {
    redditoPresunto = rec.progressivi.impIrpef / mese * 12;
    baseStima = `progressivo IRPEF ${fmtEur(rec.progressivi.impIrpef)} € ÷ ${mese} mesi × 12`;
  } else if (d.imponibileIrpef) {
    redditoPresunto = d.imponibileIrpef * 12;
    baseStima = `imponibile del mese × 12`;
  }

  /* --- 6. IRPEF lorda --- */
  if (d.imponibileIrpef != null && d.irpefLorda != null) {
    const attesa = irpefLordaAnnua(annoRegole, d.imponibileIrpef * 12) / 12;
    if (near(attesa, d.irpefLorda, 3)) add('ok', 'IRPEF', 'IRPEF lorda coerente con gli scaglioni ' + annoRegole, `${fmtEur(d.imponibileIrpef)} € × 12 → imposta annua ÷ 12 = ${fmtEur(attesa)} €. ${fisco.irpefFonte}`, 'IRPEF mese = imposta(imponibile×12) ÷ 12', ['ade']);
    else add('warn', 'IRPEF', 'IRPEF lorda diversa dal ricalcolo', `Ricalcolo: ${fmtEur(attesa)} € — in busta: ${fmtEur(d.irpefLorda)} €. Differenze possono derivare da mensilità aggiuntive nel mese, conguagli o aliquote su reddito presunto diverso. Se la differenza persiste ogni mese, fai controllare il cedolino.`, 'IRPEF mese = imposta(imponibile×12) ÷ 12', ['ade']);
  }

  /* --- 7. Detrazioni lavoro dipendente --- */
  if (d.detrazioni != null && redditoPresunto != null) {
    const attesa = detrazioneLavDip(annoRegole, redditoPresunto) / 12;
    if (near(attesa, d.detrazioni, 15)) add('ok', 'IRPEF', 'Detrazioni lavoro dipendente in linea', `Su reddito presunto ${fmtEur(redditoPresunto, 0)} € (${baseStima}): ≈ ${fmtEur(attesa)} €/mese; in busta ${fmtEur(d.detrazioni)} €. Il conguaglio di dicembre sistema gli scostamenti.`, null, ['ade']);
    else add('info', 'IRPEF', 'Detrazioni diverse dalla stima', `Stima ${fmtEur(attesa)} €/mese su reddito presunto ${fmtEur(redditoPresunto, 0)} €; in busta ${fmtEur(d.detrazioni)} €. Il datore usa un reddito presunto suo: non è un errore di per sé, ma a dicembre controlla il conguaglio.`, 'detrazione art. 13 TUIR rapportata a mese', ['ade']);
  }

  /* --- 8. Taglio del cuneo (L. 207/2024) --- */
  if (fisco.bonusL207 && redditoPresunto != null) {
    const ult = ulterioreDetrazioneL207(annoRegole, redditoPresunto) / 12;
    if (d.ulterioreDetrazione != null) {
      if (near(ult, d.ulterioreDetrazione, 8)) add('ok', 'IRPEF', 'Ulteriore detrazione (taglio cuneo) applicata', `≈ ${fmtEur(ult)} €/mese attesi per reddito ${fmtEur(redditoPresunto, 0)} €; in busta ${fmtEur(d.ulterioreDetrazione)} €.`, null, ['normattiva']);
      else add('info', 'IRPEF', 'Ulteriore detrazione da verificare', `Attesa ≈ ${fmtEur(ult)} €/mese, in busta ${fmtEur(d.ulterioreDetrazione)} €: dipende dal reddito presunto usato dal datore.`, null, ['normattiva']);
    } else if (ult > 0) {
      add('warn', 'IRPEF', 'Taglio del cuneo assente?', `Con reddito presunto ${fmtEur(redditoPresunto, 0)} € ti spetterebbe l’ulteriore detrazione L. 207/2024 (≈ ${fmtEur(ult)} €/mese) o, sotto 20.000 €, la somma esente. Non la vedo in busta: chiedi. (Se hai più rapporti di lavoro potresti averla altrove.)`, null, ['normattiva']);
    } else if (redditoPresunto <= 20000) {
      const perc = bonusL207Perc(annoRegole, redditoPresunto);
      add('info', 'IRPEF', 'Bonus cuneo (somma esente)', `Con reddito ≤ 20.000 € spetta una somma esente ≈ ${fmtEur(perc)}% del reddito da lavoro: cercala come voce dedicata in busta.`, null, ['normattiva']);
    }
  }

  /* --- 9. Imposta sostitutiva rinnovi (2026) --- */
  if (d.impRinnovi != null && d.impSostRinnovi != null && fisco.impSostRinnovi) {
    const attesa = d.impRinnovi * fisco.impSostRinnovi.aliq / 100;
    if (near(attesa, d.impSostRinnovi, 0.05)) add('ok', 'IRPEF', 'Detassazione rinnovi CCNL applicata (5%)', `${fmtEur(d.impRinnovi)} € di aumenti da rinnovo tassati al 5% = ${fmtEur(attesa)} € invece dell’aliquota piena: è un VANTAGGIO. ${fisco.impSostRinnovi.fonte}`, null, ['normattiva']);
    else add('info', 'IRPEF', 'Imposta sostitutiva rinnovi da verificare', `Attesa ${fmtEur(attesa)} € (5% di ${fmtEur(d.impRinnovi)} €), trovata ${fmtEur(d.impSostRinnovi)} €.`, null, ['normattiva']);
  }

  /* --- 10. TFR quota del mese --- */
  if (rec.tfr && rec.tfr.retribUtile != null && rec.tfr.quotaMese != null) {
    const impPrev = d.ivs && d.ivs.imponibile != null ? d.ivs.imponibile : rec.tfr.retribUtile;
    const attesa = rec.tfr.retribUtile / fisco.tfrCoeff - impPrev * fisco.tfrRivalsa / 100;
    if (near(attesa, rec.tfr.quotaMese, 0.6)) add('ok', 'TFR', 'Quota TFR del mese corretta', `${fmtEur(rec.tfr.retribUtile)} ÷ 13,5 − 0,50% di ${fmtEur(impPrev)} = ${fmtEur(attesa)} €.`, 'quota = retribuzione utile ÷ 13,5 − 0,50% imponibile previdenziale (art. 2120 c.c.)', ['normattiva']);
    else add('warn', 'TFR', 'Quota TFR diversa dal ricalcolo', `Attesa ${fmtEur(attesa)} €, in busta ${fmtEur(rec.tfr.quotaMese)} €. Verifica quali voci entrano nella “retribuzione utile TFR” del tuo CCNL.`, 'quota = retribuzione utile ÷ 13,5 − 0,50% imponibile previdenziale', ['normattiva']);
  }
  if (rec.tfr && rec.tfr.quotaAnno != null && (rec.tfr.aFondi == null || rec.tfr.aFondi === 0)) {
    add('info', 'TFR', 'Il tuo TFR resta in azienda', `Quota accantonata quest’anno: ${fmtEur(rec.tfr.quotaAnno)} €${rec.tfr.fondo3112 != null ? `, fondo al 31/12: ${fmtEur(rec.tfr.fondo3112)} €` : ''}. Non è né giusto né sbagliato: leggi “TFR in azienda o fondo pensione?” nei Consigli per decidere con i numeri.`, null, ['covip']);
  }

  /* --- 11. Paga oraria vs divisore CCNL --- */
  if (ccnl && ccnl.divisoreOrario && rec.elementi && rec.elementi.totale && d.retribuzione && d.retribuzione.oraria) {
    const attesa = rec.elementi.totale / ccnl.divisoreOrario;
    if (near(attesa, d.retribuzione.oraria, 0.02)) add('ok', 'Retribuzione', `Paga oraria coerente (divisore ${ccnl.divisoreOrario})`, `${fmtEur(rec.elementi.totale)} € ÷ ${ccnl.divisoreOrario} = ${fmtEur(attesa, 5)} €/ora.`);
    else add('info', 'Retribuzione', 'Paga oraria da verificare', `Con divisore ${ccnl.divisoreOrario} (${ccnl.nome}) mi aspetto ${fmtEur(attesa, 5)} €/ora, in busta ${fmtEur(d.retribuzione.oraria, 5)}. Divisore diverso o elementi retributivi non tutti estratti.`);
  }

  /* --- 12. Maggiorazioni festivo / domenicale --- */
  if (d.festivo && d.retribuzione && d.retribuzione.oraria && d.festivo.oraria) {
    const magg = (d.festivo.oraria / d.retribuzione.oraria - 1) * 100;
    add(magg >= 5 ? 'ok' : 'warn', 'Retribuzione', `Lavoro festivo: maggiorazione ${fmtEur(magg, 0)}%`, magg >= 5
      ? `Tariffa festiva ${fmtEur(d.festivo.oraria, 5)} vs ordinaria ${fmtEur(d.retribuzione.oraria, 5)}. Confronta la percentuale con l’articolo “lavoro festivo” del tuo CCNL.`
      : 'Il lavoro festivo risulta pagato SENZA maggiorazione: quasi tutti i CCNL la prevedono. Verifica.', null, ['cnel']);
  }
  if (d.domenicale && d.retribuzione && d.retribuzione.oraria && d.domenicale.oraria) {
    const magg = (d.domenicale.oraria / d.retribuzione.oraria - 1) * 100;
    if (magg < 1) add('info', 'Retribuzione', 'Domeniche pagate senza maggiorazione', `Nel turismo/commercio la domenica può essere ordinaria con riposo compensativo, quindi PUÒ essere corretto. Ma alcuni CCNL/contratti integrativi prevedono una maggiorazione: cerca “lavoro domenicale” nel testo del tuo CCNL e negli accordi aziendali.`, null, ['cnel']);
    else add('ok', 'Retribuzione', `Lavoro domenicale maggiorato del ${fmtEur(magg, 0)}%`, 'Confronta con la percentuale prevista dal CCNL.');
  }

  /* --- 13. Ferie e permessi --- */
  if (ccnl && rec.ratei && rec.ratei.ferie && mese) {
    const rate = rec.ratei.ferie.maturato / mese * 12;
    const attesi = ccnl.ferie ? ccnl.ferie.giorni : 20;
    if (rate >= attesi - 1.5) add('ok', 'Ferie', `Maturazione ferie in linea (~${fmtEur(rate, 1)} gg/anno)`, `CCNL ${ccnl.nome}: ${attesi} giorni/anno. Minimo di legge: 4 settimane (D.lgs. 66/2003).`, null, ['normattiva']);
    else add('warn', 'Ferie', `Ferie che maturano poco: ~${fmtEur(rate, 1)} gg/anno`, `Il tuo CCNL ne prevede ${attesi}. Se sei part-time o assunto in corso d’anno può essere normale; altrimenti chiedi. ${ccnl.ferie && ccnl.ferie.verificato === false ? '(Valore CCNL da verificare sul testo.)' : ''}`, null, ['cnel', 'normattiva']);
    if (rec.ratei.ferie.saldo > attesi * 1.5) add('info', 'Ferie', `Hai ${fmtEur(rec.ratei.ferie.saldo, 1)} giorni di ferie accumulati`, 'Oltre una annualità e mezza di residuo: le ferie servono a riposare e per legge 2 settimane l’anno vanno godute. Pianificale.', null, ['normattiva']);
  }
  if (ccnl && rec.ratei && rec.ratei.permessi && mese && ccnl.rol && ccnl.rol.ore) {
    const rate = rec.ratei.permessi.maturato / mese * 12;
    const attesi = ccnl.rol.ore + (ccnl.exFest && ccnl.exFest.ore ? ccnl.exFest.ore : 0);
    const soloRol = ccnl.rol.ore;
    if (rate >= soloRol - 6) add('ok', 'Permessi', `Permessi: ~${fmtEur(rate, 0)} ore/anno`, `CCNL: ${soloRol} ore ROL${ccnl.exFest && ccnl.exFest.ore ? ` + ${ccnl.exFest.ore} ex festività` : ''} a regime (${attesi} max). Quote ridotte nei primi anni di anzianità sono normali in molti contratti.${ccnl.rol.verificato === false ? ' (Valore da verificare sul testo del CCNL.)' : ''}`, null, ['cnel']);
    else add('info', 'Permessi', `Permessi: maturano ~${fmtEur(rate, 0)} ore/anno`, `A regime il CCNL ne prevede ${soloRol}${ccnl.rol.scaglioni ? ` (${ccnl.rol.scaglioni})` : ''}. Con poca anzianità la quota ridotta può essere corretta: verifica lo scaglione.`, null, ['cnel']);
  }

  /* --- 14. Minimo tabellare --- */
  if (ccnl && ccnl.minimi && rec.dipendente && rec.dipendente.livello && rec.elementi) {
    const min = ccnl.minimi.livelli && ccnl.minimi.livelli[rec.dipendente.livello];
    if (min && rec.elementi.pagaBase != null) {
      if (rec.elementi.pagaBase >= min - 0.5) add('ok', 'Retribuzione', `Paga base ≥ riferimento ${rec.dipendente.livello}° livello`, `Paga base ${fmtEur(rec.elementi.pagaBase)} € vs riferimento ${fmtEur(min)} € (${ccnl.minimi.aggiornatoA}). ${ccnl.minimi.nota || ''}`, null, ['cnel', 'filcams']);
      else add('alert', 'Retribuzione', 'Paga base SOTTO il minimo di riferimento', `${fmtEur(rec.elementi.pagaBase)} € contro un riferimento di ${fmtEur(min)} € (${ccnl.minimi.aggiornatoA}) per il ${rec.dipendente.livello}° livello. Se confermato dalle tabelle sindacali aggiornate, è una violazione seria (art. 36 Cost.): fai controllare subito da sindacato o consulente.`, null, ['cnel', 'patronato', 'inl']);
    } else {
      add('info', 'Retribuzione', 'Minimo tabellare non in archivio', `Per ${ccnl.nome} livello ${rec.dipendente.livello} non ho la tabella aggiornata: confrontala sulle tabelle dei sindacati di categoria o inseriscila nell’editor CCNL.`, null, ['cnel', 'filcams', 'fisascat']);
    }
  }

  /* --- 15. Mensilità aggiuntive a ratei --- */
  if (d.rateo13 != null) add('info', 'Retribuzione', '13ª pagata a ratei mensili', 'Ricevi ogni mese 1/12 della tredicesima: a dicembre NON aspettarti la mensilità piena, l’hai già incassata a rate. Stesso discorso per la 14ª se presente. È legittimo se previsto/accettato, ma incide sulla percezione del netto.', null, []);

  /* --- 16. Superminimo assorbibile --- */
  if (rec.elementi && rec.elementi.superminimo != null && rec.elementi.superminimo > 0) {
    add('info', 'Retribuzione', `Superminimo assorbibile: ${fmtEur(rec.elementi.superminimo)} €`, 'Se è “assorbibile”, i prossimi aumenti del CCNL potranno essere compensati da questa cifra e il tuo lordo restare fermo. Chiedi (per iscritto) se è assorbibile e leggi il consiglio dedicato per sapere cosa cambia.', null, ['wikilabour']);
  }

  /* --- 17. Fondo pensione --- */
  const haFondo = rec.voci.some(v => /fon\.?te|cometa|fonchim|alifond|previmoda|prevedi|telemaco|fondapi|fontemp|fondo\s*pens/i.test(v.descrizione)) || (rec.tfr && rec.tfr.aFondi > 0);
  if (!haFondo && ccnl && ccnl.fondoPensione && ccnl.fondoPensione.datore) {
    add('info', 'Previdenza', `Non risulti iscritto a ${ccnl.fondoPensione.nome}`, `Iscrivendoti con il contributo minimo (${ccnl.fondoPensione.lavoratoreMin || 'vedi statuto'}), il datore sarebbe OBBLIGATO a versarti il suo ${ccnl.fondoPensione.datore}: oggi lo stai lasciando sul tavolo. Leggi i pro e i CONTRO nei Consigli prima di decidere.`, null, ['covip', ccnl.fondoPensione.fonte].filter(Boolean));
  }

  /* --- 18. Addizionali --- */
  if (d.addRegionale != null) add('info', 'IRPEF', 'Addizionale regionale in corso', 'Stai pagando a rate (gen–nov) l’addizionale sull’imponibile dell’anno scorso. Aliquota verificabile sulle tabelle ufficiali del Dip. Finanze.', null, ['finanze']);
  if (d.addComunale == null && mese && mese >= 4) add('info', 'IRPEF', 'Addizionale comunale assente', 'Se il tuo comune la applica (quasi tutti), dovrebbe esserci da marzo/aprile (acconto) o gennaio (saldo). Alcuni comuni però hanno esenzioni per redditi bassi: verifica il tuo comune.', null, ['finanze']);

  /* --- 19. Confronto con lo storico --- */
  if (storico && storico.length && t.netto != null && rec.periodo) {
    const prev = storico
      .filter(r => r.id !== rec.id && r.periodo && r.totali && r.totali.netto != null)
      .sort((a, b) => (b.periodo.anno * 12 + b.periodo.mese) - (a.periodo.anno * 12 + a.periodo.mese))
      .find(r => (r.periodo.anno * 12 + r.periodo.mese) < (rec.periodo.anno * 12 + rec.periodo.mese));
    if (prev) {
      const delta = t.netto - prev.totali.netto;
      const perc = Math.abs(delta) / prev.totali.netto * 100;
      if (perc > 15) add('info', 'Storico', `Netto ${delta > 0 ? 'aumentato' : 'diminuito'} del ${fmtEur(perc, 1)}% rispetto a ${prev.periodo.label}`, `Da ${fmtEur(prev.totali.netto)} € a ${fmtEur(t.netto)} €. Variazioni forti sono normali con 14ª, conguagli, premi o assenze: individua la voce che spiega la differenza.`);
      // continuità ferie
      if (rec.ratei && rec.ratei.ferie && prev.ratei && prev.ratei.ferie) {
        const attesoResiduo = prev.ratei.ferie.saldo;
        const dichiarato = rec.ratei.ferie.residuoAp;
        const stessoAnno = prev.periodo.anno === rec.periodo.anno;
        if (stessoAnno && dichiarato != null && attesoResiduo != null && Math.abs(dichiarato - (prev.ratei.ferie.residuoAp ?? dichiarato)) > 0.01 && Math.abs(dichiarato - attesoResiduo) > 2)
          add('info', 'Ferie', 'Salto nel saldo ferie tra un mese e l’altro', `Controlla la continuità dei ratei tra ${prev.periodo.label} e ${rec.periodo.label}.`);
      }
    }
  }

  /* --- 20. CCNL non identificato --- */
  if (!ccnl) add('warn', 'CCNL', 'CCNL non identificato', 'Senza contratto non posso confrontare ferie, permessi, divisori e minimi. Selezionalo a mano nella schermata di verifica (lo trovi scritto sul cedolino, spesso col codice CNEL) o crealo nell’editor CCNL.', null, ['cnel']);
  else if (ccnl.note) add('info', 'CCNL', `Nota su ${ccnl.nome}`, ccnl.note, null, ['cnel']);

  const ord = { alert: 0, warn: 1, info: 2, ok: 3 };
  F.sort((a, b) => ord[a.livello] - ord[b.livello]);
  return F;
}
