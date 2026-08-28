// Numero di versione mostrato accanto all'orario di aggiornamento in
// fondo alla pagina. Da allineare manualmente al numero della cache
// in sw.js (CACHE_NAME) quando si rilascia una nuova versione, cosi'
// i due numeri restano sempre coerenti tra loro.
const APP_VERSION = "v2.35";

const CAVANIS_URL =
  "https://www.meteonetwork.eu/it/weather-station/vnt375-stazione-meteorologica-di-osservatorio-cavanis-venezia";

// Worker Cloudflare personale dell'utente (generico: accetta qualsiasi
// URL consentito tramite ?url=, con allowlist di dominio lato Worker
// per sicurezza). Sostituisce r.jina.ai per le pagine CPSM del Comune
// di Venezia: r.jina.ai applica un'elaborazione "leggibilita'" pensata
// per articoli che a volte deforma tabelle/dati grezzi, mentre il
// Worker fa da semplice passa-carte. Usato inizialmente solo per Lido
// Meteo (ISPRA) e poi esteso anche alle pagine CPSM il 22/08/2026 dopo
// aver notato che queste ultime, ancora su r.jina.ai, si caricavano
// molto piu' lentamente.
const PROXY_WORKER_URL = "https://lagunalive-proxy.andrea-vio.workers.dev/";

function proxyUrl(targetUrl) {
  return PROXY_WORKER_URL + "?url=" + encodeURIComponent(targetUrl);
}

const PALAZZO_CAVALLI_URL = proxyUrl(
  "http://www.comune.venezia.it/sites/default/files/publicCPSM2/stazioni/temporeale/Palazzo_Cavalli.html"
);

const SAN_GIORGIO_URL = proxyUrl(
  "http://www.comune.venezia.it/sites/default/files/publicCPSM2/stazioni/temporeale/San_Giorgio.html"
);

const PUNTA_SALUTE_URL = proxyUrl(
  "http://www.comune.venezia.it/sites/default/files/publicCPSM2/stazioni/temporeale/Punta_Salute.html"
);

const MISERICORDIA_URL = proxyUrl(
  "http://www.comune.venezia.it/sites/default/files/publicCPSM2/stazioni/temporeale/Misericordia.html"
);

const CAVANIS_API_URL =
  "https://api.arpa.veneto.it/REST/v1/meteo_meteogrammi_tabella?codseqst=300000154";

// File XML "grezzo" dietro la webgis ISPRA (RMLV): contiene tutte le
// stazioni della rete con l'ultimo dato disponibile per ogni
// strumento. Trovato analizzando il sorgente di webgis.html (funzione
// initialDownload -> downloadUrl("../dati/Dati2.xml", ...)). Nessuna
// documentazione ufficiale, nessuna garanzia di stabilita' nel tempo:
// se ISPRA cambia il sito questo endpoint puo' smettere di funzionare
// senza preavviso.
const ISPRAMBIENTE_DATI_URL =
  "https://www.venezia.isprambiente.it/dati/Dati2.xml";

// id della stazione "Lido Meteo" nel file Dati2.xml (marker id="115"),
// confermato dall'utente incollando il contenuto reale del file.
const LIDO_METEO_MARKER_ID = "115";

// Sopra questa soglia (minuti) i dati di Lido Meteo vengono mostrati
// con un avviso "dati non aggiornati" invece che silenziosamente come
// se fossero freschi: la rete RMLV ha gia' mostrato di poter restare
// ferma per giorni senza preavviso (vedi cronologia di questa
// conversazione, dati fermi al 17/08 quando si e' controllato il 21/08).
const LIDO_METEO_STALE_MINUTES = 120;

// Etichette delle colonne cosi' come compaiono nelle tabelle delle
// stazioni CPSM (prima colonna = data/ora, poi le altre nell'ordine in
// cui il sito del Comune le pubblica). Usate per la "scheda" con i
// dati completi di ogni stazione.
const PALAZZO_CAVALLI_LABELS = [
  "Data/Ora",
  "Pressione (hPa)",
  "Temperatura (°C)",
  "Umidità (%)",
  "Radiazione solare (W/mq)",
  "Pioggia (mm)"
];

const SAN_GIORGIO_LABELS = [
  "Data/Ora",
  "Direzione vento (°)",
  "Velocità vento (m/s)",
  "Raffica vento (m/s)",
  "Temperatura (°C)",
  "Umidità (%)",
  "Radiazione solare (W/mq)"
];

const PUNTA_SALUTE_LABELS = [
  "Data/Ora",
  "Marea (m)",
  "Temperatura acqua (°C)"
];

// Etichette NON verificate su uno screenshot reale della pagina (a
// differenza di Cavalli/San Giorgio/Punta Salute). Dedotte per
// analogia: la pagina "10. Misericordia" del Comune elenca i sensori
// installati come mareografo + anemometro + ondametro (niente
// termometro/igrometro/barometro), e l'ordine delle colonne di
// San Giorgio (verificato) segue lo stesso ordine "canonico" descritto
// nella pagina generale dei parametri di rete (Liv, DV, VV, VVx, Pr,
// T aria, T H2O, Um, Pg, Rs, O Hs, O Hx) filtrato ai soli sensori
// presenti nella stazione. Marea come prima colonna dati e' gia'
// verificato (funziona da tempo come backup marea). Le colonne vento e
// onda sono INFERITE, non confermate: da ricontrollare al primo avvio
// reale confrontando con le condizioni di vento note al momento.
const MISERICORDIA_LABELS = [
  "Data/Ora",
  "Marea (m)",
  "Direzione vento (°)",
  "Velocità vento (m/s)",
  "Raffica vento (m/s)",
  "Onda significativa (m)",
  "Onda massima (m)"
];

const STATION_LABELS = {
  punta_salute: PUNTA_SALUTE_LABELS,
  misericordia: MISERICORDIA_LABELS,
  palazzo_cavalli: PALAZZO_CAVALLI_LABELS,
  san_giorgio: SAN_GIORGIO_LABELS
};

// Colonne verificate direttamente su uno screenshot della scheda reale.
// Per le stazioni non verificate (Misericordia) nascondiamo le
// colonne extra invece di etichettarle genericamente "Colonna N", che
// non da' nessuna informazione utile.
const STATION_LABELS_VERIFIED = {
  punta_salute: true,
  misericordia: false,
  palazzo_cavalli: true,
  san_giorgio: true
};

function formatTime(timestamp) {

  const date = new Date(
    timestamp.replace(" ", "T") + "+01:00"
  );

  return date.toLocaleTimeString(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

// Le tabelle del Comune riportano sempre l'ora solare (UTC+1, tutto
// l'anno). Questa funzione converte in data/ora "civile" (ora legale
// quando è in vigore), stesso meccanismo usato da formatTime().
function formatDateTime(timestamp) {

  const date = new Date(
    timestamp.replace(" ", "T") + "+01:00"
  );

  return date.toLocaleString(
    "it-IT",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

// Il file Dati2.xml di ISPRA usa un formato data diverso da quello
// delle tabelle CPSM/ARPA usate altrove in questo file: "DD/MM/YYYY
// HH:MM:SS" invece di "YYYY-MM-DD HH:MM:SS". L'ora e' comunque solare
// (UTC+1) come tutte le altre fonti, quindi la conversione a ora
// civile e' la stessa (+01:00, lasciamo fare al browser la conversione
// a ora legale quando serve).
function parseIsprambienteTimestamp(timestamp) {

  const [datePart, timePart] = timestamp.trim().split(" ");
  const [day, month, year] = datePart.split("/");

  return new Date(`${year}-${month}-${day}T${timePart}+01:00`);
}

function formatTimeIsprambiente(timestamp) {

  return parseIsprambienteTimestamp(timestamp).toLocaleTimeString(
    "it-IT",
    { hour: "2-digit", minute: "2-digit" }
  );
}

// Minuti trascorsi da un timestamp ISPRA ad ora (usato per l'avviso
// "dati non aggiornati" di Lido Meteo).
function minutesSinceIsprambiente(timestamp) {

  const then = parseIsprambienteTimestamp(timestamp);

  return (Date.now() - then.getTime()) / 60000;
}

function windDirection(deg) {

  const dirs = [
    "N", "NE", "E", "SE",
    "S", "SO", "O", "NO"
  ];

  return dirs[Math.round(deg / 45) % 8];
}

// Minuti trascorsi tra due timestamp delle tabelle (stesso formato
// "solare" di formatTime/formatDateTime, il fuso non conta per una
// differenza).
function minutesBetween(t1, t2) {

  const d1 = new Date(t1.replace(" ", "T") + "+01:00");
  const d2 = new Date(t2.replace(" ", "T") + "+01:00");

  return Math.abs(d1 - d2) / 60000;
}

// Indice di calore (heat index), formula di Rothfusz (NWS).
// Sotto i 27°C circa l'effetto e' trascurabile, quindi restituiamo
// semplicemente la temperatura reale.
function heatIndex(tempC, humidity) {

  if (humidity == null || isNaN(humidity)) {
    return tempC;
  }

  // Sotto i 27°C (80°F) la regressione completa di Rothfusz non e'
  // valida: il NWS prescrive in questo intervallo una formula
  // semplificata, che ammorbidisce il passaggio invece del taglio
  // netto "sotto 27°C = temperatura dell'aria" usato in precedenza.
  if (tempC < 27) {

    const T = tempC * 9 / 5 + 32; // Fahrenheit
    const R = humidity;

    const simpleHI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094));
    const simpleHiC = (simpleHI - 32) * 5 / 9;

    // Stessa logica di floor della formula completa qui sotto: sotto
    // il 40% di umidita' anche questa formula puo' scendere sotto la
    // temperatura reale in modo non piu' fisicamente significativo.
    if (humidity < 40) {
      return Math.max(simpleHiC, tempC);
    }

    return simpleHiC;
  }

  const T = tempC * 9 / 5 + 32; // Fahrenheit
  const R = humidity;

  let HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;

  const heatIndexC = (HI - 32) * 5 / 9; // torna in Celsius

  // La regressione di Rothfusz e' ufficialmente valida (calibrata sui
  // dati di Steadman) solo per umidita' relativa >= 40%. Al di sotto,
  // il risultato e' un'estrapolazione della formula: puo' scendere
  // sotto la temperatura dell'aria in modo sempre piu' marcato quanto
  // piu' l'umidita' e' bassa, senza che questo rifletta piu' un
  // fenomeno fisico reale. Entro il range valido (RH >= 40%) la
  // formula non ha invece bisogno di alcun aggiustamento: puo'
  // legittimamente restituire un valore leggermente sotto la
  // temperatura dell'aria (evaporazione del sudore efficiente), e in
  // quel caso lo lasciamo cosi' com'e'.
  if (humidity < 40) {
    return Math.max(heatIndexC, tempC);
  }

  return heatIndexC;
}

const VENICE_LAT = 45.4408;
const VENICE_LON = 12.3155;
const ITALY_STANDARD_MERIDIAN = 15; // riferimento del fuso UTC+1

function degToRad(d) {
  return d * Math.PI / 180;
}

// Seno dell'altezza del sole sull'orizzonte a Venezia, dato un timestamp
// in ora solare UTC+1 (lo stesso formato "grezzo" restituito dall'API
// ARPA, prima della conversione a ora legale usata per la visualizzazione).
// Negativo quando il sole e' sotto l'orizzonte (notte).
function solarElevationSin(timestamp) {

  // Il timestamp puo' arrivare sia come "YYYY-MM-DD HH:MM:SS" (spazio,
  // formato usato altrove in questo file) sia come "YYYY-MM-DDTHH:MM:SS"
  // (ISO con "T", formato effettivamente restituito per il campo
  // dataora della radiazione dall'API ARPA): normalizziamo prima di
  // separare data e ora, altrimenti con la "T" non c'e' nessuno spazio
  // da trovare e timePart risulta undefined.
  const [datePart, timePart] = timestamp.replace("T", " ").split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);

  const clockHours = hh + mm / 60 + (ss || 0) / 3600;

  const startOfYear = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  const dayOfYear = Math.round((current - startOfYear) / 86400000) + 1;

  // Declinazione solare (formula di Cooper)
  const decl = degToRad(23.45 * Math.sin(degToRad(360 / 365 * (284 + dayOfYear))));

  // Equazione del tempo, in minuti
  const B = degToRad(360 / 365 * (dayOfYear - 81));
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // Correzione da ora del fuso a ora solare vera, in minuti (longitudine +
  // equazione del tempo)
  const timeCorrectionMinutes = 4 * (VENICE_LON - ITALY_STANDARD_MERIDIAN) + eot;

  const solarTimeHours = clockHours + timeCorrectionMinutes / 60;
  const hourAngle = degToRad(15 * (solarTimeHours - 12));

  const lat = degToRad(VENICE_LAT);

  return Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
}

// Temperatura percepita "al sole". Il THSW di Davis Instruments e'
// una formula proprietaria mai resa pubblica dal produttore, quindi
// non e' riproducibile esattamente. Questa e' la seconda versione
// dell'approssimazione, corretta dopo aver scoperto due cose
// verificando 46 letture orarie reali della stazione Davis di Villar
// Perosa (TO):
//
// 1) Il THW reale di Davis (temperatura+umidita'+vento, "al buio") in
//    queste 46 righe e' SEMPRE risultato identico, alla decina di
//    grado, all'Heat Index (Rothfusz). Il vento non lo modifica mai,
//    perche' la formula di wind chill vera si applica solo sotto i
//    10°C: alle nostre temperature (quasi sempre ben sopra), il
//    contributo del vento e' semplicemente zero. La versione
//    precedente di questa funzione aveva un termine "-0.70*vento"
//    completamente indipendente dall'Heat Index (con base
//    T+vapore anziche' l'Heat Index gia' calcolato altrove): con
//    umidita' molto alta questo produceva un "al sole" anche 3°C
//    SOPRA "all'ombra" con radiazione zero (di notte!), un risultato
//    privo di senso fisico. Rimosso: ora si parte direttamente
//    dall'Heat Index, la stessa funzione usata per "all'ombra", cosi'
//    le due schermate non possono piu' divergere per un errore di
//    formula.
//
// 2) Confrontando THW e THSW reali, lo scarto (che rappresenta il
//    "bonus" dovuto al sole) segue bene il modello
//    THSW = THW - 0.8 + 0.0132 * R * sin(h)
//    (regressione sui 46 punti, errore medio assoluto 0.71°C, contro
//    1.50°C della versione precedente). Il -0.8 e' una costante
//    piccola e pressoche' indipendente dal vento osservato (0-21
//    km/h), non un termine di raffreddamento eolico.
function apparentTemperatureSun(tempC, humidity, radiationWm2, radiationTimestamp) {

  const hi = heatIndex(tempC, humidity);

  if (radiationWm2 == null || isNaN(radiationWm2) || !radiationTimestamp) {
    return hi - 0.8;
  }

  // Limite di sicurezza contro letture anomale del sensore: la
  // radiazione solare reale a livello del mare non supera mai
  // valori dell'ordine di 1100 W/mq.
  const R = Math.max(0, Math.min(1100, radiationWm2));
  const sinH = Math.max(0, solarElevationSin(radiationTimestamp));

  return hi - 0.8 + 0.0132 * R * sinH;
}

// Le tabelle delle stazioni CPSM non hanno una riga di intestazione
// testuale: sono solo righe di dati ripetute. Per la "scheda" prendiamo
// quindi solo l'ULTIMA riga (il dato piu' recente) e la abbiniamo alle
// etichette note per quella stazione, invece di mostrare piu' righe di
// dati che confonderebbero l'utente.
//
// showUnknown: se true, le colonne oltre quelle etichettate vengono
// comunque mostrate come "Colonna N" (utile quando l'ordine delle
// colonne e' stato verificato, es. Palazzo Cavalli). Se false, le
// colonne senza etichetta verificata vengono nascoste invece di
// mostrare un dato senza indicazione di cosa sia.
function parseLastRowLabeled(html, labels, showUnknown = true) {

  const tableRows = parseHtmlTableRows(html);

  if (tableRows.length === 0) {
    return null;
  }

  const cells = tableRows[tableRows.length - 1];

  const rows = [];

  cells.forEach((value, i) => {

    if (i >= labels.length && !showUnknown) {
      return;
    }

    const label = labels[i] || ("Colonna " + (i + 1));

    let displayValue;
    if (i === 0) {
      displayValue = value !== "" ? formatDateTime(value) : "n.d.";
    } else if (label.startsWith("Direzione vento") && value !== "" && !isNaN(parseFloat(value))) {
      // La direzione arriva in gradi (es. "45"): la mostriamo nel
      // formato a punti cardinali piu' leggibile, tenendo comunque i
      // gradi tra parentesi per chi vuole il dato preciso.
      const deg = parseFloat(value);
      displayValue = windDirection(deg) + " (" + Math.round(deg) + "°)";
    } else {
      displayValue = value !== "" ? value : "n.d.";
    }

    rows.push({ label, value: displayValue });
  });

  return rows;
}

// Estrae le righe di una tabella HTML (<tr><td>...</td>...</tr>) come
// array di array di stringhe, una per riga, saltando automaticamente
// le righe di intestazione (che usano <th>, non <td>). Sostituisce il
// vecchio parsing "a barre verticali" (split("|")) che funzionava solo
// quando le pagine CPSM passavano attraverso r.jina.ai: quel servizio
// convertiva la tabella HTML in una tabella markdown con quel formato.
// Dal 22/08/2026 le pagine CPSM passano invece dal Worker Cloudflare
// dell'utente, che restituisce l'HTML originale della pagina (vedi
// PROXY_WORKER_URL) - da qui la necessita' di leggere <td> veri
// invece di celle separate da "|".
function parseHtmlTableRows(html) {

  const rows = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {

    const rowContent = rowMatch[1];

    // Le righe di intestazione usano <th>, non <td>: le saltiamo senza
    // bisogno di riconoscerle esplicitamente, semplicemente perche'
    // non contengono nessuna cella <td>.
    if (!rowContent.includes("<td")) continue;

    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].trim());
    }

    rows.push(cells);
  }

  return rows;
}

async function loadPalazzoCavalli() {

  const response = await fetch(PALAZZO_CAVALLI_URL);
  const html = await response.text();

  const parsedRows = parseHtmlTableRows(html).map(cols => ({
    timestamp: cols[0],
    pressure: parseFloat(cols[1]),
    temperature: parseFloat(cols[2]),
    humidity: parseFloat(cols[3]),
    radiation: parseFloat(cols[4]),
    rain: parseFloat(cols[5])
  }));

  const last = parsedRows[parsedRows.length - 1];

  // Ogni lettura di pioggia rappresenta i 5 minuti tra una rilevazione
  // e l'altra (confermato). Per la pioggia dell'ultima ora sommiamo
  // tutte le letture entro 60 minuti dall'ultimo dato disponibile.
  const latestTime = new Date(last.timestamp.replace(" ", "T") + "+01:00");

  const rainLastHour = parsedRows
    .filter(r => {
      const t = new Date(r.timestamp.replace(" ", "T") + "+01:00");
      const diffMinutes = (latestTime - t) / 60000;
      return diffMinutes >= 0 && diffMinutes < 60;
    })
    .reduce((sum, r) => sum + (isNaN(r.rain) ? 0 : r.rain), 0);

  // La tabella scaricata copre gia' le ultime 24 ore (confermato), quindi
  // per il totale giornaliero basta sommare tutte le righe disponibili.
  const rain24h = parsedRows
    .reduce((sum, r) => sum + (isNaN(r.rain) ? 0 : r.rain), 0);

  return {
    ...last,
    rainLastHour,
    rain24h
  };
}

async function loadSanGiorgio() {

  const response = await fetch(SAN_GIORGIO_URL);
  const html = await response.text();

  const tableRows = parseHtmlTableRows(html);
  const cols = tableRows[tableRows.length - 1];

  return {
    timestamp: cols[0],
    windDir: parseFloat(cols[1]),
    windSpeed: parseFloat(cols[2]),
    windGust: parseFloat(cols[3]),
    temperature: parseFloat(cols[4]),
    humidity: parseFloat(cols[5])
  };
}

async function loadCavanis() {

  const response = await fetch(CAVANIS_API_URL);
  const json = await response.json();

  const data = json.data;

  const lastOfType = (tipo) => {
    const rows = data.filter(r => r.tipo === tipo);
    return rows.length ? rows[rows.length - 1] : null;
  };

  const lastTemp = lastOfType("TARIA2M");
  const lastHumidity = lastOfType("UMID2M");
  const lastRadiation = lastOfType("RADSOL");
  const lastWindSpeed = lastOfType("VVENTO10M");
  const lastWindDir = lastOfType("DVENTO10M");
  const lastRain = lastOfType("PREC");

  // RADSOL e' in MJ/mq (energia cumulata nell'ultima ora), non in
  // W/mq (potenza istantanea) come serve alla formula della
  // temperatura percepita al sole. Si converte moltiplicando per
  // 1.000.000 (MJ -> J) e dividendo per 3600 secondi (un'ora).
  const MJ_TO_WATT_PER_SQM = 1000000 / 3600;

  const radiationWm2 =
    lastRadiation != null
      ? parseFloat(lastRadiation.valore) * MJ_TO_WATT_PER_SQM
      : null;

  return {
    timestamp: lastTemp.dataora,
    temperature: parseFloat(lastTemp.valore),
    humidity: parseFloat(lastHumidity.valore),
    radiation: radiationWm2,
    radiationTimestamp: lastRadiation ? lastRadiation.dataora : null,
    // VVENTO10M e' in m/s (confermato dall'utente, e' l'unita' nativa
    // del sensore): chi lo mostra in scheda deve moltiplicare per 3.6
    // per ottenere km/h; le formule che vogliono m/s (es.
    // apparentTemperatureSun) lo possono usare direttamente cosi'.
    windSpeed: lastWindSpeed ? parseFloat(lastWindSpeed.valore) : null,
    windSpeedTimestamp: lastWindSpeed ? lastWindSpeed.dataora : null,
    windDir: lastWindDir ? parseFloat(lastWindDir.valore) : null,
    // PREC e' gia' in mm, nessuna conversione necessaria.
    rain: lastRain ? parseFloat(lastRain.valore) : null
  };
}

// Estrae i dati della stazione "Lido Meteo" da un testo che contiene
// (anche solo in parte, anche con roba non-XML attorno) il blocco
// <marker id="115" ...>...</marker> del file Dati2.xml. Usa
// espressioni regolari invece di DOMParser di proposito: cosi' la
// stessa funzione funziona sia sul file XML diretto sia su una
// versione passata da un proxy tipo r.jina.ai, che a volte avvolge il
// contenuto in testo/markdown aggiuntivo e romperebbe un parsing XML
// rigido. Restituisce null se il blocco marker non viene trovato
// (dominio offline, proxy che ha restituito una pagina di errore,
// ecc.), senza mai lanciare eccezioni: chi chiama decide cosa fare.
function extractLidoMeteoFromText(text) {

  // \\s* attorno agli "=" perche' fonti diverse formattano l'XML in
  // modo diverso: il file originale ISPRA usa attributi senza spazi
  // (id="115"), ma il Worker proxy (che passa il contenuto attraverso
  // il proprio motore di fetch) lo restituisce con spazi attorno al
  // segno di uguale (id = "115") - bug reale riscontrato il
  // 22/08/2026: la regex rigida non trovava piu' la stazione anche se
  // il Worker rispondeva correttamente.
  const markerRegex = new RegExp(
    '<marker[^>]*id\\s*=\\s*"' + LIDO_METEO_MARKER_ID + '"[^>]*>([\\s\\S]*?)<\\/marker>'
  );

  const markerMatch = text.match(markerRegex);
  if (!markerMatch) return null;

  const markerContent = markerMatch[1];

  const instrumentRegex = /<instrument[^>]*type\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/instrument>/g;

  let temperature = null;
  let humidity = null;
  let windDir = null;
  let windSpeed = null;
  let pressure = null;
  let rain = null;
  let timestamp = null;

  let m;
  while ((m = instrumentRegex.exec(markerContent)) !== null) {

    const type = m[1];
    const instrBlock = m[2];

    const valueMatch = instrBlock.match(/<value[^>]*datetime\s*=\s*"([^"]*)"[^>]*>\s*([^<]*?)\s*<\/value>/);
    if (!valueMatch) continue;

    const ts = valueMatch[1];
    const value = parseFloat(valueMatch[2].trim());

    // Tutti gli strumenti di questa stazione condividono lo stesso
    // datetime (rilevazione istantanea unica per ciclo): ne basta uno
    // qualsiasi per l'avviso di aggiornamento.
    if (timestamp == null) timestamp = ts;

    if (type === "Temperatura") temperature = value;
    else if (type === "Umid") humidity = value;
    else if (type === "Vento dir.") windDir = value;
    else if (type === "Vento vel.") windSpeed = value;
    else if (type === "Press") pressure = value;
    else if (type === "Pioggia") rain = value;
  }

  if (temperature == null && humidity == null) return null;

  return { temperature, humidity, windDir, windSpeed, pressure, rain, timestamp };
}

// Timeout (ms) per ogni singolo tentativo di fetch di Lido Meteo.
// Senza questo, un fetch che resta "appeso" (nessuna risposta, nessun
// errore) blocca l'intera funzione a tempo indeterminato invece di
// passare rapidamente alla fonte successiva - bug reale riscontrato
// il 22/08/2026: l'intera app restava in caricamento per minuti.
const LIDO_METEO_FETCH_TIMEOUT_MS = 6000;

function fetchWithTimeout(url, timeoutMs) {

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

// Legge temperatura e umidita' della stazione "Lido Meteo" (RMLV,
// ISPRA). A differenza delle altre loadXxx() di questo file, questa
// NON lancia mai un'eccezione verso l'esterno: se fallisce (Worker
// giu', XML non trovato, stazione assente) restituisce semplicemente
// { available: false }, cosi' un problema con questa singola fonte non
// puo' mai bloccare il caricamento delle altre card. Inoltre non viene
// nemmeno incluso nel Promise.all principale di loadAll() (vedi li'):
// anche se per qualsiasi motivo finisse per bloccarsi comunque, il
// resto dell'app deve restare utilizzabile.
//
// Prova, in ordine, ciascuno con un timeout di pochi secondi:
// 1) Worker Cloudflare personale dell'utente (ora generico, vedi
//    proxyUrl() e PROXY_WORKER_URL): scarica il file lato server
//    (nessun problema di CORS) e lo restituisce con l'header
//    Access-Control-Allow-Origin. Verificato funzionante il
//    22/08/2026. Preferito perche' sotto il controllo diretto
//    dell'utente, a differenza dei proxy pubblici sottostanti che si
//    sono gia' dimostrati inaffidabili;
// 2) fetch diretto del file ISPRA: fallisce quasi certamente per CORS
//    (dominio governativo senza Access-Control-Allow-Origin), tenuto
//    come tentativo a costo zero nel caso ISPRA cambiasse politica;
// 3-4) codetabs.com e AllOrigins come ultima riserva: entrambi si sono
//    gia' dimostrati inaffidabili in pratica (rispettivamente offline
//    con errore Cloudflare 522, e errore 500 lato loro, il 21-22/08/2026)
//    ma restano un tentativo a costo quasi zero se il Worker personale
//    dovesse smettere di funzionare (es. quota giornaliera Cloudflare
//    esaurita, molto improbabile per l'uso di una sola persona: il
//    piano gratuito consente 100.000 richieste al giorno).
async function loadLidoMeteo() {

  const sources = [
    proxyUrl(ISPRAMBIENTE_DATI_URL),
    ISPRAMBIENTE_DATI_URL,
    "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(ISPRAMBIENTE_DATI_URL),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(ISPRAMBIENTE_DATI_URL)
  ];

  for (const url of sources) {

    try {

      const response = await fetchWithTimeout(url, LIDO_METEO_FETCH_TIMEOUT_MS);
      if (!response.ok) throw new Error("HTTP " + response.status);

      const text = await response.text();
      const data = extractLidoMeteoFromText(text);

      if (data) {
        return {
          available: true,
          ...data,
          stale: data.timestamp != null && minutesSinceIsprambiente(data.timestamp) > LIDO_METEO_STALE_MINUTES
        };
      }

      console.warn("Lido Meteo: nessun dato riconoscibile da", url);

    } catch (err) {
      console.warn("Lido Meteo: fonte fallita (" + url + "):", err);
    }
  }

  return { available: false };
}

async function loadPuntaSalute() {

  const response = await fetch(PUNTA_SALUTE_URL);
  const html = await response.text();

  const tableRows = parseHtmlTableRows(html);
  const cols = tableRows[tableRows.length - 1];
  const prevCols = tableRows[tableRows.length - 3];

  const tide = Math.round(parseFloat(cols[1]) * 100);
  const prevTide = Math.round(parseFloat(prevCols[1]) * 100);

  let trend = "→";

  if (tide > prevTide) trend = "↑";
  if (tide < prevTide) trend = "↓";

  return {
    timestamp: cols[0],
    tide,
    trend,
    waterTemp: parseFloat(cols[2])
  };
}

// Scarica e fa il parsing COMPLETO della tabella di Misericordia
// (tutte le righe disponibili, non solo l'ultima): serve sia per la
// marea di backup sia, soprattutto, per il grafico del vento che
// mostra l'andamento nel tempo e non solo l'ultimo valore. Le colonne
// vento/onda sono INFERITE (vedi commento su MISERICORDIA_LABELS): se
// l'ordine reale fosse diverso, direzione/velocita'/raffica
// risulterebbero scambiate tra loro.
async function loadMisericordiaTable() {

  const response = await fetch(MISERICORDIA_URL);
  const html = await response.text();

  const rows = parseHtmlTableRows(html).map(cols => ({
    timestamp: cols[0],
    tide: parseFloat(cols[1]),
    windDir: parseFloat(cols[2]),
    windSpeed: parseFloat(cols[3]),
    windGust: parseFloat(cols[4]),
    waveHeight: parseFloat(cols[5])
  }));

  if (rows.length === 0) {
    throw new Error("Nessuna riga dati trovata per Misericordia");
  }

  return rows;
}

async function loadMisericordia() {

  const rows = await loadMisericordiaTable();

  const last = rows[rows.length - 1];
  const previous = rows[rows.length - 3] || rows[rows.length - 2] || last;

  const tide = Math.round(last.tide * 100);
  const prevTide = Math.round(previous.tide * 100);

  let trend = "→";

  if (tide > prevTide) trend = "↑";
  if (tide < prevTide) trend = "↓";

  return {
    timestamp: last.timestamp,
    tide,
    trend,
    source: "Misericordia",
    waterTemp: null
  };
}

async function loadTide() {

  try {

    const puntaSalute = await loadPuntaSalute();
    puntaSalute.source = "Punta Salute";
    return puntaSalute;

  } catch (err) {

    console.warn("Punta Salute non disponibile, uso Misericordia");
    return await loadMisericordia();
  }
}

// Ultimo dato di vento di Misericordia per la card principale.
// Non lancia mai un'eccezione verso l'esterno (stesso principio di
// loadLidoMeteo): se Misericordia non e' raggiungibile, il vento
// mostra semplicemente "n.d." invece di rompere il caricamento di
// tutta la pagina.
async function loadMisericordiaWind() {

  try {

    const rows = await loadMisericordiaTable();
    const last = rows[rows.length - 1];

    return {
      available: true,
      timestamp: last.timestamp,
      windDir: last.windDir,
      windSpeed: last.windSpeed,
      windGust: last.windGust
    };

  } catch (err) {

    console.warn("Vento Misericordia non disponibile:", err);
    return { available: false };
  }
}

async function loadStationsConfig() {

  const response = await fetch("stations.json");
  const config = await response.json();

  const container = document.getElementById("stationsStatus");
  container.innerHTML = "";

  config.stations.forEach(station => {

    const row = document.createElement("div");
    row.className = "sub-station clickable";
    row.textContent = "✓ " + station.name;

    row.addEventListener("click", () => {

      // Nota: la card principale in alto (temperatura) continua a
      // linkare la pagina Meteonetwork tramite mainTempLink. Qui,
      // nella lista delle stazioni, si mostra invece una scheda con
      // i dati grezzi dell'API ARPA, come per le altre stazioni.
      if (station.type === "meteonetwork") {
        openCavanisModal();
        return;
      }

      if (station.type === "isprambiente") {
        openLidoMeteoModal();
        return;
      }

      if (station.url) {
        const labels = STATION_LABELS[station.id] || ["Data/Ora"];
        const verified = STATION_LABELS_VERIFIED[station.id] !== false;
        openStationModal(station.name, proxyUrl(station.url), labels, verified);
      }
    });

    container.appendChild(row);
  });
}

// --- Modale "scheda" stazione ---

function showModal(title, bodyHtml) {

  document.getElementById("modalTitle").innerHTML = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modalOverlay").classList.add("open");
}

function hideModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}

async function openStationModal(title, url, labels, showUnknown = true) {

  showModal(title, "<p>Caricamento dati aggiornati...</p>");

  try {

    const response = await fetch(url);
    const text = await response.text();

    const rows = parseLastRowLabeled(text, labels, showUnknown);

    if (!rows) {
      throw new Error("Dati non trovati");
    }

    const html = rows
      .map(r =>
        `<div class="modal-row"><span class="modal-label">${r.label}</span><span class="modal-value">${r.value}</span></div>`
      )
      .join("");

    showModal(title, html);

  } catch (err) {

    console.error(err);
    showModal(title, "<p>Errore nel caricamento dei dati. Riprova tra qualche minuto: se il problema persiste, la stazione potrebbe essere temporaneamente offline sul sito del Comune.</p>");
  }
}

// Scheda dati ARPA per Osservatorio Cavanis, usata dalla lista
// "Stazioni utilizzate" in fondo alla pagina. La card principale in
// alto (temperatura) continua invece a linkare la pagina Meteonetwork
// tramite mainTempLink/CAVANIS_URL: qui si tratta di una scheda
// separata, coerente nello stile con le altre stazioni della lista
// (Palazzo Cavalli, San Giorgio, Punta della Salute), ma con dati
// presi dall'API ARPA invece che dalle pagine del Comune.
async function openCavanisModal() {

  showModal("Osservatorio Cavanis", "<p>Caricamento dati aggiornati...</p>");

  try {

    const cavanis = await loadCavanis();

    const rows = [
      { label: "Temperatura", value: cavanis.temperature != null ? cavanis.temperature.toFixed(1) + " °C" : "n.d." },
      { label: "Umidità", value: cavanis.humidity != null ? cavanis.humidity.toFixed(0) + " %" : "n.d." },
      {
        label: "Vento",
        value:
          (cavanis.windDir != null && !isNaN(cavanis.windDir) ? windDirection(cavanis.windDir) + " " : "") +
          (cavanis.windSpeed != null && !isNaN(cavanis.windSpeed) ? Math.round(cavanis.windSpeed * 3.6) + " km/h" : "n.d.")
      },
      { label: "Radiazione solare", value: cavanis.radiation != null ? Math.round(cavanis.radiation) + " W/mq" : "n.d." },
      { label: "Pioggia", value: cavanis.rain != null ? cavanis.rain.toFixed(1) + " mm" : "n.d." },
      { label: "Aggiornato", value: formatTime(cavanis.timestamp) }
    ];

    const html = rows
      .map(r =>
        `<div class="modal-row"><span class="modal-label">${r.label}</span><span class="modal-value">${r.value}</span></div>`
      )
      .join("");

    showModal("Osservatorio Cavanis", html);

  } catch (err) {

    console.error(err);
    showModal("Osservatorio Cavanis", "<p>Errore nel caricamento dei dati. Riprova tra qualche minuto: se il problema persiste, l'API ARPA potrebbe essere temporaneamente offline.</p>");
  }
}

// Scheda "Lido Meteo" (RMLV/ISPRA), stesso stile delle altre schede
// stazione. Rifa' il fetch al click (dato fresco, coerente con
// openCavanisModal) invece di riusare il valore gia' caricato in
// pagina.
async function openLidoMeteoModal() {

  showModal("Lido", "<p>Caricamento dati aggiornati...</p>");

  try {

    const data = await loadLidoMeteo();

    if (!data.available) {
      throw new Error("Dati non disponibili");
    }

    const rows = [
      { label: "Temperatura", value: data.temperature != null ? data.temperature.toFixed(1) + " °C" : "n.d." },
      { label: "Umidità", value: data.humidity != null ? data.humidity.toFixed(0) + " %" : "n.d." },
      {
        label: "Vento",
        value:
          (data.windDir != null && !isNaN(data.windDir) ? windDirection(data.windDir) + " " : "") +
          (data.windSpeed != null && !isNaN(data.windSpeed) ? Math.round(data.windSpeed * 3.6) + " km/h" : "n.d.")
      },
      { label: "Pressione", value: data.pressure != null ? data.pressure.toFixed(1) + " hPa" : "n.d." },
      { label: "Pioggia", value: data.rain != null ? data.rain.toFixed(1) + " mm" : "n.d." },
      {
        label: "Aggiornato",
        value: data.timestamp
          ? formatTimeIsprambiente(data.timestamp) + (data.stale ? " ⚠️" : "")
          : "n.d."
      }
    ];

    const html = rows
      .map(r =>
        `<div class="modal-row"><span class="modal-label">${r.label}</span><span class="modal-value">${r.value}</span></div>`
      )
      .join("") +
      (data.stale
        ? '<p class="stale-warning" style="margin-top:10px;">⚠️ La stazione risulta ferma da più di 2 ore: la rete ISPRA/RMLV può restare offline per giorni senza preavviso.</p>'
        : "");

    showModal("Lido", html);

  } catch (err) {

    console.error(err);
    showModal("Lido", "<p>Errore nel caricamento dei dati, oppure la rete ISPRA/RMLV è al momento offline (è già successo per giorni consecutivi in passato).</p>");
  }
}

// Disegna un grafico vento (velocita' e raffica, in km/h) su canvas,
// senza librerie esterne, coerente con lo stile "no-build" del
// progetto. La direzione viene mostrata come piccole frecce ruotate
// lungo l'asse del tempo invece che come terza linea, perche' un
// valore angolare (0-360°) non e' leggibile insieme a due linee
// lineari sullo stesso grafico.
function drawWindChart(canvas, rows) {

  const ctx = canvas.getContext("2d");

  // Dimensiona il canvas alla larghezza reale mostrata a schermo,
  // tenendo conto del devicePixelRatio per una resa nitida sugli
  // schermi dei telefoni (altrimenti il canvas risulta sfocato).
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = 220;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = cssHeight + "px";

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 16, right: 12, bottom: 44, left: 36 };
  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;

  const speeds = rows.map(r => (isNaN(r.windSpeed) ? 0 : r.windSpeed * 3.6));
  const gusts = rows.map(r => (isNaN(r.windGust) ? 0 : r.windGust * 3.6));

  const maxVal = Math.max(1, ...speeds, ...gusts) * 1.15;

  const xForIndex = (i) =>
    padding.left + (i / Math.max(1, rows.length - 1)) * plotWidth;

  const yForValue = (v) =>
    padding.top + plotHeight - (v / maxVal) * plotHeight;

  // Griglia orizzontale + etichette km/h
  ctx.strokeStyle = "#eee";
  ctx.fillStyle = "#888";
  ctx.font = "11px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const v = (maxVal / gridLines) * i;
    const y = yForValue(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotWidth, y);
    ctx.stroke();
    ctx.fillText(Math.round(v) + "", padding.left - 6, y);
  }

  // Etichette orario sull'asse x (circa 5 tacche)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const tickCount = Math.min(5, rows.length);
  for (let t = 0; t < tickCount; t++) {
    const i = Math.round((t / Math.max(1, tickCount - 1)) * (rows.length - 1));
    const x = xForIndex(i);
    ctx.fillText(formatMisericordiaTime(rows[i].timestamp), x, padding.top + plotHeight + 6);
  }

  // Linea raffica (dietro, piu' chiara)
  ctx.strokeStyle = "#a8c3f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  gusts.forEach((v, i) => {
    const x = xForIndex(i);
    const y = yForValue(v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Linea velocita' media (sopra, piu' scura)
  ctx.strokeStyle = "#1a3c8f";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  speeds.forEach((v, i) => {
    const x = xForIndex(i);
    const y = yForValue(v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Frecce di direzione, disegnate a intervalli regolari appena sotto
  // l'asse x (una freccia ogni ~6 punti per non affollare il grafico).
  const arrowStep = Math.max(1, Math.round(rows.length / 16));

  ctx.strokeStyle = "#555";
  ctx.fillStyle = "#555";
  ctx.lineWidth = 1.5;

  for (let i = 0; i < rows.length; i += arrowStep) {

    const dir = rows[i].windDir;
    if (dir == null || isNaN(dir)) continue;

    const x = xForIndex(i);
    const y = padding.top + plotHeight + 24;
    const angle = degToRad(dir - 90); // 0° = Nord verso l'alto
    const len = 6;

    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;

    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Piccola punta a freccia
    const headAngle1 = angle + Math.PI * 0.8;
    const headAngle2 = angle - Math.PI * 0.8;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 + Math.cos(headAngle1) * 3, y2 + Math.sin(headAngle1) * 3);
    ctx.lineTo(x2 + Math.cos(headAngle2) * 3, y2 + Math.sin(headAngle2) * 3);
    ctx.closePath();
    ctx.fill();
  }
}

// Formato orario per i timestamp di Misericordia (stesso formato
// "YYYY-MM-DD HH:MM:SS" delle altre tabelle CPSM: riusa formatTime).
function formatMisericordiaTime(timestamp) {
  return formatTime(timestamp);
}

async function openWindChartModal() {

  showModal("Vento &middot; Misericordia", "<p>Caricamento dati aggiornati...</p>");

  try {

    const rows = await loadMisericordiaTable();

    if (rows.length === 0) {
      throw new Error("Nessun dato disponibile");
    }

    const last = rows[rows.length - 1];

    const summaryHtml = `
<div class="modal-row"><span class="modal-label">Direzione</span><span class="modal-value">${!isNaN(last.windDir) ? windDirection(last.windDir) + " (" + Math.round(last.windDir) + "°)" : "n.d."}</span></div>
<div class="modal-row"><span class="modal-label">Velocità</span><span class="modal-value">${!isNaN(last.windSpeed) ? Math.round(last.windSpeed * 3.6) + " km/h" : "n.d."}</span></div>
<div class="modal-row"><span class="modal-label">Raffica</span><span class="modal-value">${!isNaN(last.windGust) ? Math.round(last.windGust * 3.6) + " km/h" : "n.d."}</span></div>
<div class="modal-row"><span class="modal-label">Aggiornato</span><span class="modal-value">${formatTime(last.timestamp)}</span></div>
`;

    const chartHtml = `
<div class="wind-chart-wrap">
  <canvas id="windChartCanvas"></canvas>
  <div class="wind-chart-legend">
    <span><span class="legend-dot legend-speed"></span> Velocità</span>
    <span><span class="legend-dot legend-gust"></span> Raffica</span>
    <span>➤ Direzione</span>
  </div>
  <p class="wind-chart-caption">Ultime ${rows.length} rilevazioni (Misericordia). Ordine delle colonne vento non ancora verificato sul sito ufficiale: se direzione/velocità/raffica sembrano incoerenti con le condizioni reali, segnalalo.</p>
</div>
`;

    showModal("Vento &middot; Misericordia", summaryHtml + chartHtml);

    // Il canvas va disegnato DOPO che showModal ha inserito l'HTML nel
    // DOM (l'elemento non esiste prima di quel momento).
    const canvas = document.getElementById("windChartCanvas");
    if (canvas) {
      drawWindChart(canvas, rows);
    }

  } catch (err) {

    console.error(err);
    showModal("Vento &middot; Misericordia", "<p>Errore nel caricamento dei dati. Riprova tra qualche minuto: se il problema persiste, la stazione potrebbe essere temporaneamente offline sul sito del Comune.</p>");
  }
}

function setupInteractions() {

  document.getElementById("mainTempLink").addEventListener("click", () => {
    window.open(CAVANIS_URL, "_blank");
  });

  document.getElementById("subCavalli").addEventListener("click", () => {
    openStationModal("Palazzo Cavalli", PALAZZO_CAVALLI_URL, PALAZZO_CAVALLI_LABELS);
  });

  document.getElementById("subSanGiorgio").addEventListener("click", () => {
    openStationModal("San Giorgio", SAN_GIORGIO_URL, SAN_GIORGIO_LABELS);
  });

  document.getElementById("mareLink").addEventListener("click", () => {
    openStationModal("Punta della Dogana (Punta Salute)", PUNTA_SALUTE_URL, PUNTA_SALUTE_LABELS);
  });

  document.getElementById("subLidoMeteo").addEventListener("click", openLidoMeteoModal);

  document.getElementById("windLine").addEventListener("click", openWindChartModal);

  document.getElementById("modalClose").addEventListener("click", hideModal);

  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") hideModal();
  });
}

// Aggiorna le due righe di Lido Meteo (temperatura e umidita') in modo
// indipendente dal resto della pagina: chiamata sia dal flusso
// normale in loadAll() sia dal catch di riserva, cosi' la card mostra
// sempre uno stato definito (mai bloccata su "caricamento...").
function updateLidoMeteoUI(lidoMeteo) {

  // L'ora e' solare (UTC+1) come le altre fonti, ma il formato del
  // timestamp e' diverso (DD/MM/YYYY) quindi usa il suo formattatore
  // dedicato.
  document.getElementById("subLidoMeteo").innerHTML =
    lidoMeteo.available && lidoMeteo.temperature != null
      ? "Lido: " + lidoMeteo.temperature.toFixed(1) +
        " °C (" + formatTimeIsprambiente(lidoMeteo.timestamp) + ")" +
        (lidoMeteo.stale ? ' <span class="stale-warning">⚠️ dati non aggiornati</span>' : "")
      : "Lido: n.d.";

  document.getElementById("humidityLidoMeteo").innerHTML =
    lidoMeteo.available && lidoMeteo.humidity != null
      ? "Lido: " + lidoMeteo.humidity.toFixed(0) +
        " % (" + formatTimeIsprambiente(lidoMeteo.timestamp) + ")" +
        (lidoMeteo.temperature != null
          ? ` <span class="sub-station-extra">&middot; percepiti ${heatIndex(lidoMeteo.temperature, lidoMeteo.humidity).toFixed(1)} °C</span>`
          : "") +
        (lidoMeteo.stale ? ' <span class="stale-warning">⚠️ dati non aggiornati</span>' : "")
      : "Lido: n.d.";
}

async function loadAll() {

  document.getElementById("status").innerHTML = "Caricamento...";

  try {

    // Tutte le stazioni vengono interrogate in parallelo invece che in
    // sequenza, per velocizzare il caricamento della pagina.
    // misericordiaWind non lancia mai eccezioni (vedi commento sulla
    // funzione): un problema con questa fonte non puo' bloccare le
    // altre card.
    //
    // Lido Meteo NON e' incluso qui di proposito: dipende da proxy
    // esterni che si sono gia' dimostrati inaffidabili in pratica
    // (vedi commenti su loadLidoMeteo). Anche con il timeout interno a
    // quella funzione, tenerlo fuori dal Promise.all principale
    // garantisce che il resto dell'app si carichi sempre a prescindere
    // da cosa succede con quella singola fonte: viene avviato subito
    // sotto, in parallelo ma non atteso qui, e aggiorna le sue due
    // righe (temperatura e umidita') in modo indipendente quando
    // arriva un risultato.
    loadLidoMeteo()
      .then(updateLidoMeteoUI)
      .catch(err => {
        console.warn("Lido Meteo: errore imprevisto, mostro n.d.", err);
        updateLidoMeteoUI({ available: false });
      });

    const [cavalli, sanGiorgio, cavanis, puntaSalute, misericordiaWind] = await Promise.all([
      loadPalazzoCavalli(),
      loadSanGiorgio(),
      loadCavanis(),
      loadTide(),
      loadMisericordiaWind()
    ]);

    // --- Card 1: temperatura, Cavanis come stazione principale ---

    document.getElementById("temp").innerHTML =
      cavanis.temperature.toFixed(1) + " °C";

    document.getElementById("tempStation").innerHTML =
      "Osservatorio Cavanis &middot; 🕐 " + formatTime(cavanis.timestamp);

    document.getElementById("subCavalli").innerHTML =
      "Palazzo Cavalli: " + cavalli.temperature.toFixed(1) +
      " °C (" + formatTime(cavalli.timestamp) + ")";

    document.getElementById("subSanGiorgio").innerHTML =
      "San Giorgio: " + sanGiorgio.temperature.toFixed(1) +
      " °C (" + formatTime(sanGiorgio.timestamp) + ")";

    // --- Card 2: umidita' e temperatura percepita (da Cavanis) ---

    document.getElementById("humidity").innerHTML =
      cavanis.humidity.toFixed(0) + " %";

    const hi = heatIndex(cavanis.temperature, cavanis.humidity);

    document.getElementById("heatIndex").innerHTML =
      hi.toFixed(1) + " °C";

    const STALE_MINUTES = 30;

    // Il calcolo "al sole" e' isolato in un try/catch dedicato: se per
    // qualsiasi motivo imprevisto va in errore (es. un caso limite nei
    // dati non ancora visto), "al sole" torna semplicemente uguale ad
    // "all'ombra" invece di bloccare il caricamento di tutto il resto
    // della pagina (mare, vento, pioggia, pressione).
    let thsw = hi;

    try {

      const radiationFresh =
        cavanis.radiationTimestamp != null &&
        minutesBetween(cavanis.timestamp, cavanis.radiationTimestamp) <= STALE_MINUTES;

      thsw = apparentTemperatureSun(
        cavanis.temperature,
        cavanis.humidity,
        radiationFresh ? cavanis.radiation : null,
        radiationFresh ? cavanis.radiationTimestamp : null
      );

      if (thsw == null || isNaN(thsw)) {
        thsw = hi;
      }

    } catch (thswError) {
      console.error("Errore nel calcolo dell'indice al sole, uso il valore all'ombra:", thswError);
    }

    document.getElementById("thsw").innerHTML =
      thsw.toFixed(1) + " °C";

    document.getElementById("humidityStation").innerHTML =
      "Osservatorio Cavanis &middot; 🕐 " + formatTime(cavanis.timestamp);

    document.getElementById("humidityCavalli").innerHTML =
      `Palazzo Cavalli: ${cavalli.humidity.toFixed(0)} % (${formatTime(cavalli.timestamp)}) <span class="sub-station-extra">&middot; percepiti ${heatIndex(cavalli.temperature, cavalli.humidity).toFixed(1)} °C</span>`;

    document.getElementById("humiditySanGiorgio").innerHTML =
      `San Giorgio: ${sanGiorgio.humidity.toFixed(0)} % (${formatTime(sanGiorgio.timestamp)}) <span class="sub-station-extra">&middot; percepiti ${heatIndex(sanGiorgio.temperature, sanGiorgio.humidity).toFixed(1)} °C</span>`;
    // humidityLidoMeteo viene aggiornato da updateLidoMeteoUI(),
    // indipendentemente da questo blocco (vedi commento piu' sopra sul
    // perche' Lido Meteo e' escluso dal Promise.all principale).

    // --- Card 3: mare ---

    document.getElementById("tide").innerHTML =
      puntaSalute.tide + " cm " + puntaSalute.trend;

    document.getElementById("waterTemp").innerHTML =
      puntaSalute.waterTemp != null
        ? puntaSalute.waterTemp.toFixed(1) + " °C"
        : "n.d.";

    document.getElementById("tideInfo").innerHTML =
      formatTime(puntaSalute.timestamp) + " &middot; " + puntaSalute.source;

    // --- Card 4: vento (Misericordia), pioggia, pressione ---

    // Vento preso da Misericordia invece che da Cavanis (ARPA): piu'
    // vicina a casa dell'utente. La velocita' e' inferita in m/s per
    // analogia con le altre stazioni della stessa rete CPSM (colonna
    // non ancora verificata, vedi commento su MISERICORDIA_LABELS).
    document.getElementById("wind").innerHTML =
      misericordiaWind.available
        ? (misericordiaWind.windDir != null && !isNaN(misericordiaWind.windDir)
            ? windDirection(misericordiaWind.windDir) + " "
            : "") +
          (misericordiaWind.windSpeed != null && !isNaN(misericordiaWind.windSpeed)
            ? Math.round(misericordiaWind.windSpeed * 3.6) + " km/h"
            : "n.d.")
        : "n.d.";

    const rainHourText =
      cavalli.rainLastHour != null && !isNaN(cavalli.rainLastHour)
        ? cavalli.rainLastHour.toFixed(1) + " mm/h"
        : "n.d.";

    const rain24hText =
      cavalli.rain24h != null && !isNaN(cavalli.rain24h)
        ? cavalli.rain24h.toFixed(1) + " mm/24h"
        : "n.d.";

    document.getElementById("rain").innerHTML =
      rainHourText + " &middot; " + rain24hText;

    document.getElementById("pressure").innerHTML =
      cavalli.pressure.toFixed(1) + " hPa";

    document.getElementById("airTime").innerHTML =
      formatTime(cavalli.timestamp);

    const now = new Date();

    document.getElementById("status").innerHTML =
      "Aggiornato alle " +
      now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) +
      " &middot; " + APP_VERSION;

  } catch (error) {

    console.error(error);

    document.getElementById("status").innerHTML =
      "Errore caricamento dati &middot; " + APP_VERSION;
  }
}

/* ============================================================
   ANTEPRIMA PREVISIONI DI OGGI + AVVISO ALLARME IN HOME
   Usa previsioni-data.js (lo stesso modulo dati di previsioni.html)
   per mostrare qui la sintesi di oggi nella scheda "Previsioni della
   settimana" e, se per oggi risulta un allarme (temporale forte,
   nebbia persistente o acqua alta), un piccolo avviso sopra le card
   delle stazioni.
   Tenuta fuori dal Promise.all principale, stesso principio di Lido
   Meteo: scarica 3 modelli meteo e la marea, più lenta delle altre
   fonti, e non deve ritardare il resto della dashboard. */

const ICONE_PREVISIONI_HOME = {
  sun: "☀️", partly: "🌤️", cloud: "☁️", rain: "🌧️",
  storm: "⛈️", snow: "❄️", fog: "🌫️"
};

const CATEGORIA_TESTO_HOME = {
  sun: "Sereno", partly: "Poco nuvoloso", cloud: "Nuvoloso",
  rain: "Pioggia", storm: "Temporale", snow: "Neve", fog: "Nebbia"
};

function updatePrevisioniPreviewUI(oggi) {
  const icona = document.getElementById("previsioniIcon");
  const categoria = document.getElementById("previsioniCategoria");
  const temp = document.getElementById("previsioniTemp");

  if (!oggi) {
    icona.textContent = "📅";
    categoria.textContent = "Previsioni non disponibili";
    temp.textContent = "";
    return;
  }

  icona.textContent = ICONE_PREVISIONI_HOME[oggi.sintesi.categoria] || "📅";
  categoria.textContent = "Oggi: " + (CATEGORIA_TESTO_HOME[oggi.sintesi.categoria] || "—");
  temp.textContent =
    (oggi.sintesi.min != null && oggi.sintesi.max != null)
      ? Math.round(oggi.sintesi.min) + "° / " + Math.round(oggi.sintesi.max) + "°"
      : "";
}

function updateAllarmeUI(oggi) {
  const el = document.getElementById("allarmeMeteo");

  if (!oggi || !oggi.allarmi) {
    el.style.display = "none";
    return;
  }

  const messaggi = [];
  if (oggi.allarmi.temporaleForte) {
    messaggi.push("⚡ Temporale forte previsto oggi");
  }
  if (oggi.allarmi.nebbiaPersistente) {
    messaggi.push("🌫️ Nebbia persistente prevista oggi");
  }
  if (oggi.allarmi.acquaAlta) {
    const cm = oggi.mareaMassima != null ? ` · ${oggi.mareaMassima} cm` : "";
    messaggi.push("🌊 Acqua alta prevista oggi" + cm);
  }

  if (messaggi.length === 0) {
    el.style.display = "none";
    return;
  }

  el.innerHTML = messaggi.join(" &middot; ");
  el.style.display = "block";
}

async function loadPrevisioniPreview() {
  try {
    const previsioni = await PrevisioniData.ottieniPrevisioni();
    const oggi = previsioni.riepilogoGiorni.find((g) => g.data === previsioni.oggiStr);

    updatePrevisioniPreviewUI(oggi);
    updateAllarmeUI(oggi);

  } catch (err) {
    console.warn("Anteprima previsioni non disponibile:", err);
    updatePrevisioniPreviewUI(null);
    updateAllarmeUI(null);
  }
}

setupInteractions();
loadStationsConfig();
loadAll();
loadPrevisioniPreview();

// Registra il service worker per rendere la pagina installabile come
// app (PWA): l'icona in home, l'apertura a schermo intero e l'avvio
// piu' rapido funzionano solo se questo va a buon fine.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {

        // Il browser controlla se sw.js e' cambiato solo periodicamente
        // (anche una volta al giorno): forziamo un controllo subito ad
        // ogni apertura, invece di aspettare quel ciclo automatico.
        registration.update();

        // Quando l'app installata (icona in home) torna in primo piano
        // dopo essere stata in background, spesso Android/Chrome si
        // limita a riattivare l'istanza gia' in memoria senza un vero
        // evento "load": senza questo, il controllo aggiornamento
        // sopra non scatterebbe mai in quei casi, e la PWA potrebbe
        // restare indietro finche' non viene chiusa e riaperta da zero
        // (o aperta nello stesso browser da una scheda normale).
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            registration.update();
          }
        });

        // Quando viene rilevata e attivata una versione piu' recente
        // del service worker durante questa sessione, ricarica la
        // pagina una volta sola cosi' l'aggiornamento si vede subito,
        // senza dover cancellare manualmente la cache dal telefono.
        let alreadyReloaded = false;

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (alreadyReloaded) return;
          alreadyReloaded = true;
          window.location.reload();
        });
      })
      .catch((err) => console.warn("Service worker non registrato:", err));
  });
}

// Pulsante "Forza aggiornamento app": rete di sicurezza per i casi in
// cui l'app installata (icona in home) resta indietro nonostante i
// controlli automatici sopra - un problema noto delle PWA su Android,
// dove il sistema puo' ritardare l'aggiornamento del service worker
// indipendentemente da cosa fa questo codice. A differenza del
// normale ciclo di aggiornamento (che aspetta una nuova versione),
// questo cancella TUTTO incondizionatamente (service worker + cache)
// e ricarica da zero, cosi' funziona anche se per qualche motivo il
// controllo automatico non ha mai rilevato la nuova versione.
document.getElementById("forceUpdateLink").addEventListener("click", async () => {

  const link = document.getElementById("forceUpdateLink");
  link.textContent = "🔄 Aggiornamento in corso...";

  try {

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

  } catch (err) {
    console.warn("Errore durante la pulizia forzata:", err);
  }

  // NON si usa location.reload(true): il parametro booleano che un
  // tempo forzava il bypass della cache e' ormai ignorato dai browser
  // moderni (bug reale riscontrato il 22/08/2026, serviva cancellare
  // la cache di Chrome a mano per vedere gli aggiornamenti). Invece,
  // si naviga verso un indirizzo con un numero casuale in coda: essendo
  // un indirizzo mai visto prima, il browser non ha alcuna copia in
  // cache a cui appoggiarsi e deve per forza richiederlo alla rete.
  window.location.href =
    window.location.pathname + "?forceupdate=" + Date.now();
});
