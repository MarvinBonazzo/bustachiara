/*
 * Pacchetti di settore del parser.
 * Contengono solo segnali strutturali e sinonimi: nessun valore economico viene
 * inventato da queste regole. Aggiungere un settore qui non modifica il core.
 */
const PARSER_SECTOR_PACKS = [
  {
    id: 'privato-lul', nome: 'Privato / LUL',
    detect: [/libro\s+unico\s+del\s+lavoro/i, /elementi\s+della\s+retribuzione/i, /voci\s+variabili\s+del\s+mese/i],
    voiceHints: [
      ['retribuzione ordinaria', 'paga ordinaria', 'ore ordinarie', 'giornate ordinarie'],
      ['superminimo', 'sup ass', 'superminimo assorbibile'],
      ['scatti di anzianità', 'scatti anz', 'aumenti periodici anzianità'],
    ],
  },
  {
    id: 'pubblico-noipa', nome: 'Pubblico / NoiPA',
    detect: [/\bnoipa\b/i, /cedolino\s+unico/i, /rata\s+di\s+riferimento/i, /competenze\s+fisse/i],
    voiceHints: [
      ['stipendio tabellare', 'stipendio base', 'trattamento economico fondamentale'],
      ['retribuzione professionale docenti', 'rpd'],
      ['compenso individuale accessorio', 'cia'],
      ['indennità di amministrazione', 'indennità di ente'],
      ['ritenuta previdenziale pubblico impiego', 'inpdap', 'cpdel', 'ctps', 'fondo credito'],
    ],
  },
  {
    id: 'domestico', nome: 'Lavoro domestico',
    detect: [/lavoro\s+domestico/i, /colf|badante|baby\s*sitter/i, /cas\.?sa\.?\s*colf/i, /vitto\s+e\s+alloggio/i],
    voiceHints: [
      ['retribuzione mensile domestico', 'paga mensile colf', 'retribuzione convenuta'],
      ['indennità vitto e alloggio', 'vitto alloggio', 'indennità sostitutiva vitto'],
      ['contributo cassa colf', 'cas sa colf', 'cassacolf'],
      ['contributi inps lavoro domestico', 'quota contributi lavoratore'],
    ],
  },
  {
    id: 'edilizia', nome: 'Edilizia / Cassa Edile',
    detect: [/cassa\s+edile/i, /edilconnect|mut\s+edil/i, /accantonamento\s+gnf/i, /\bape\b.*edil/i],
    voiceHints: [
      ['accantonamento cassa edile', 'accantonamento gnf', 'gratifica ferie cassa edile'],
      ['anzianità professionale edile', 'ape'],
      ['elemento variabile retribuzione', 'evr'],
      ['contributo cassa edile', 'quota cassa edile'],
    ],
  },
  {
    id: 'agricoltura', nome: 'Agricoltura',
    detect: [/operaio\s+agricol/i, /florovivaist/i, /cassa\s+extra\s+legem/i, /giornate\s+agricole/i],
    voiceHints: [
      ['giornate agricole ordinarie', 'giornate lavorate agricoltura'],
      ['terzo elemento agricolo', '3 elemento agricolo'],
      ['festività operai agricoli', 'festività agricola'],
      ['cassa extra legem', 'contributo ente bilaterale agricolo'],
    ],
  },
  {
    id: 'marittimo', nome: 'Marittimo',
    detect: [/gente\s+di\s+mare/i, /indennità\s+di\s+navigazione/i, /giorni\s+imbarco/i, /convenzione\s+marittim/i],
    voiceHints: [
      ['indennità di navigazione', 'ind navigazione'],
      ['giorni di imbarco', 'giornate imbarco'],
      ['panatica', 'indennità panatica'],
      ['straordinario forfettizzato marittimo', 'compenso lavoro straordinario nave'],
    ],
  },
  {
    id: 'spettacolo-sportivo', nome: 'Spettacolo e sport',
    detect: [/fondo\s+pensione\s+lavoratori\s+spettacolo/i, /ex\s+enpals/i, /giornate\s+spettacolo/i, /lavoratore\s+sportivo/i],
    voiceHints: [
      ['contributo fpls', 'contributo ex enpals', 'previdenza spettacolo'],
      ['giornate spettacolo', 'giornate enpals'],
      ['compenso prove', 'indennità prove spettacolo'],
      ['diritti di immagine', 'compenso immagine'],
    ],
  },
  {
    id: 'dirigenti', nome: 'Dirigenti',
    detect: [/qualifica\s+dirigente/i, /previndai|fasdac|manageritalia/i, /indennità\s+di\s+funzione\s+dirigenziale/i],
    voiceHints: [
      ['indennità di funzione dirigente', 'indennità dirigenziale'],
      ['contributo previndai', 'previndai'],
      ['contributo fasdac', 'fasdac'],
      ['mbo dirigente', 'management by objectives', 'bonus obiettivi'],
    ],
  },
  {
    id: 'cessazione-conguaglio', nome: 'Cessazione e conguagli',
    detect: [/fine\s+rapporto/i, /data\s+cessazione/i, /conguaglio\s+fiscale/i, /indennità\s+sostitutiva\s+preavviso/i],
    voiceHints: [
      ['liquidazione tfr', 'tfr liquidato', 'trattamento fine rapporto'],
      ['indennità sostitutiva preavviso', 'mancato preavviso'],
      ['ferie non godute', 'liquidazione ferie residue'],
      ['conguaglio irpef', 'conguaglio fiscale'],
    ],
  },
];

function parserSectorForText(value) {
  const text = String(value || '');
  let best = null;
  for (const pack of PARSER_SECTOR_PACKS) {
    const hits = pack.detect.filter(re => { re.lastIndex = 0; return re.test(text); }).length;
    if (hits && (!best || hits > best.hits)) best = { pack, hits };
  }
  return best ? best.pack : PARSER_SECTOR_PACKS[0];
}

function parserSectorVoiceHints() {
  return PARSER_SECTOR_PACKS.flatMap(pack => (pack.voiceHints || []).map(([name, ...aliases]) => ({
    name, aliases: [name, ...aliases], sector: pack.id,
  })));
}
