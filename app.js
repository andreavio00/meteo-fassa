const stations = [
  { type: "trentino", code: "T0096", name: "Moena (Diga Pezzè)" },
  { type: "extra", key: "vigo" },
  { type: "extra", key: "pozza" },
  { type: "trentino", code: "T0437", name: "Canazei (Gries)" },
  { type: "trentino", code: "T0094", name: "Passo Costalunga" },
  { type: "trentino", code: "T0229", name: "Campitello (Malga Do Col D'Aura)" },
  { type: "trentino", code: "T0092", name: "Pian Fedaia (Diga)" },
  { type: "trentino", code: "T0403", name: "Canazei (Ciampac)" }
];

// Configurazione delle due stazioni "extra", lette dal vivo ad ogni
// apertura/refresh della pagina tramite un proxy CORS pubblico, dato
// che le pagine sorgente non permettono il fetch diretto da browser.
const EXTRA_STATIONS = {
  vigo: {
    name: "Vigo di Fassa",
    quota: "1400 m",
    sourceUrl: "https://stazioni.meteoproject.it/dati/vigodifassa/tabella-vuota.php"
  },
  pozza: {
    name: "Pozza di Fassa (Monzon)",
    quota: "1520 m",
    sourceUrl: "https://www.meteonetwork.eu/it/weather-station/trn314-stazione-meteorologica-di-monzon"
  }
};

// Sigle italiane -> inglesi, per uniformare la direzione del vento a
// quella usata dalle altre card (vedi funzione direction() qui sotto).
const ITA_TO_EN_DIR = {
  N: "N", NNE: "NNE", NE: "NE", ENE: "ENE",
  E: "E", ESE: "ESE", SE: "SE", SSE: "SSE",
  S: "S", SSO: "SSW", SO: "SW", OSO: "WSW",
  O: "W", ONO: "WNW", NO: "NW", NNO: "NNW"
};

// Oltre questa soglia (minuti) un dato "extra" viene segnalato come
// non aggiornato di recente (punto 4).
const STALE_THRESHOLD_MIN = 60;

function latestValue(features, field) {
  for (const feature of features) {
    const value = feature.properties[field];

    if (
      value !== "" &&
      value !== null &&
      value !== undefined
    ) {
      return value;
    }
  }

  return "-";
}

function direction(deg) {
  if (!deg || isNaN(deg)) return "-";

  const dirs = [
    "N","NNE","NE","ENE",
    "E","ESE","SE","SSE",
    "S","SSW","SW","WSW",
    "W","WNW","NW","NNW"
  ];

  return dirs[Math.round(deg / 22.5) % 16];
}

function iconByAltitude(quota) {
  const q = parseInt(quota);

  if (q < 1600) return "🌲";
  if (q < 2000) return "⛰️";

  return "🏔️";
}

// ---- Fuso orario (gestione ora legale/solare) ----

function romeTimeParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return {
    hh: parseInt(parts.find(p => p.type === "hour").value, 10),
    mm: parseInt(parts.find(p => p.type === "minute").value, 10)
  };
}

function timeStringFromParts(hh, mm) {
  const HH = String(hh).padStart(2, "0");
  const MM = String(mm).padStart(2, "0");
  return `1970-01-01T${HH}:${MM}`;
}

// Ora attuale in Italia (gestisce da sola ora legale/solare), nel
// formato "...THH:MM" atteso da createCard().
function romeTimeNowString() {
  const { hh, mm } = romeTimeParts(new Date());
  return timeStringFromParts(hh, mm);
}

function nowMinutesOfDayRome() {
  const { hh, mm } = romeTimeParts(new Date());
  return hh * 60 + mm;
}

function minutesToTimeString(mins) {
  return timeStringFromParts(Math.floor(mins / 60) % 24, mins % 60);
}

// Converte un orario "HH:MM" letto sul sito sorgente (gia' in ora
// locale italiana) in minuti dalla mezzanotte, per poter calcolare da
// quanto tempo il dato non viene aggiornato.
function isStale(sourceMinutes) {
  if (sourceMinutes === null) return false;

  let diff = nowMinutesOfDayRome() - sourceMinutes;
  if (diff < 0) diff += 24 * 60; // rollover oltre la mezzanotte

  return diff > STALE_THRESHOLD_MIN;
}

// L'API di meteotrentino.it restituisce l'orario come se fosse
// sempre "ora solare" (CET, UTC+1), senza mai applicare l'ora legale:
// quando in Italia vige l'ora legale (CEST, UTC+2) il valore mostrato
// resta quindi indietro di un'ora. Rileviamo se oggi e' in vigore
// l'ora legale confrontando l'offset UTC attuale di Europe/Rome con
// quello di un giorno di gennaio (sempre ora solare), e in tal caso
// aggiungiamo l'ora mancante.
function getRomeUtcOffsetMinutes(date) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset"
  }).formatToParts(date).find(p => p.type === "timeZoneName").value;

  const match = part.match(/GMT([+\-]\d+)/);
  return match ? parseInt(match[1], 10) * 60 : 60;
}

function isRomeCurrentlyDST() {
  const now = new Date();
  const januaryOffset = getRomeUtcOffsetMinutes(new Date(now.getFullYear(), 0, 5));
  const currentOffset = getRomeUtcOffsetMinutes(now);
  return currentOffset !== januaryOffset;
}

function formatRomeTimeFromApi(dateStr) {
  if (!dateStr) return null;

  const m = String(dateStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;

  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);

  if (isRomeCurrentlyDST()) {
    hh = (hh + 1) % 24;
  }

  return timeStringFromParts(hh, mm);
}

// ---- Fetch con timeout, per non bloccare a lungo il caricamento ----

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadStation(station) {

  const url =
    `https://dati.meteotrentino.it/service.asmx/datiRealtimeUnaStazione?stazione=${station.code}&h=1`;

  const response = await fetchWithTimeout(url, 10000);
  const data = await response.json();

  const features = data.features;
  const latest = features[0].properties;

  return {
    name: station.name,
    quota: latest["quota"],
    updated: formatRomeTimeFromApi(latest["datetime"]) || latest["datetime"],

    temp: latestValue(features, "ta(°C)"),
    humidity: latestValue(features, "umid(%)"),
    wind: latestValue(features, "vvmed(m/s)"),
    windDir: direction(
      Number(
        latestValue(features, "dvmed(gN)")
      )
    )
  };
}

// ---- Lettura dal vivo di Vigo/Pozza tramite proxy CORS ----

function numberFrom(match, group) {
  if (!match) return null;
  const raw = match[group].replace(",", ".");
  const value = parseFloat(raw);
  return isNaN(value) ? null : value;
}

function kmhToMs(kmh) {
  return kmh === null ? null : Math.round((kmh / 3.6) * 10) / 10;
}

function itaDirToEn(raw) {
  if (!raw) return null;
  return ITA_TO_EN_DIR[raw.toUpperCase()] || raw.toUpperCase();
}

// Proviamo piu' proxy CORS in sequenza: quello gratuito puo' essere
// lento o temporaneamente sovraccarico, quindi se il primo fallisce
// tentiamo un secondo prima di arrenderci e usare il JSON di riserva.
const CORS_PROXIES = [
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  url => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url)
];

function withCacheBuster(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_ts=${Date.now()}`;
}

async function fetchPageText(url) {
  let lastErr = new Error("Nessun proxy CORS disponibile");
  const bustedUrl = withCacheBuster(url);

  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const response = await fetchWithTimeout(buildProxyUrl(bustedUrl), 6000);
      if (!response.ok) throw new Error("Proxy risposta non ok: " + response.status);

      const html = await response.text();
      if (!html || html.length < 50) throw new Error("Risposta vuota dal proxy");

      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script, style").forEach(el => el.remove());

      return doc.body ? doc.body.textContent : "";
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr;
}

// Cerca sulla pagina l'orario di ultimo aggiornamento dichiarato dalla
// fonte stessa (non quello dello scraping), nei formati usati dai due
// siti, e un eventuale indicatore "OFFLINE".
function extractSourceStatus(text) {
  let m = text.match(
    /Dati aggiornati il\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*alle ore\s*(\d{1,2})[.:](\d{2})/i
  );

  if (!m) {
    m = text.match(
      /Dati ore\s*(\d{1,2}):(\d{2})\s*del\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i
    );
  }

  const updatedMinutes = m
    ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
    : null;

  const offline = /\bOFFLINE\b/.test(text) && !/\bONLINE\b/.test(text);

  return { updatedMinutes, offline };
}

function parseVigoText(text) {
  const temp = numberFrom(
    text.match(/Temperatura[^0-9\-]{0,15}(-?\d+[.,]?\d*)\s*°?C/i), 1
  );

  const humidity = numberFrom(
    text.match(/Umidit[àa][^0-9]{0,15}(\d+[.,]?\d*)\s*%/i), 1
  );

  // Velocita' e direzione compaiono appaiate, es. "16.1 Km/h NNW"
  const windMatch = text.match(/(\d+[.,]?\d*)\s*Km\/h\s*([NSEWO]{1,3})\b/i);
  const windKmh = numberFrom(windMatch, 1);
  const windDir = windMatch ? windMatch[2].toUpperCase() : null;

  return {
    temp,
    humidity,
    wind: kmhToMs(windKmh),
    windDir: itaDirToEn(windDir),
    ...extractSourceStatus(text)
  };
}

function parsePozzaText(text) {
  const temp = numberFrom(
    text.match(/Temperatura[^0-9\-]{0,15}(-?\d+[.,]?\d*)\s*°?C/i), 1
  );

  const humidity = numberFrom(
    text.match(/Umidit[àa][^0-9]{0,15}(\d+[.,]?\d*)\s*%/i), 1
  );

  const windMatch =
    text.match(/Vel\.?\s*media[^0-9]{0,15}(\d+[.,]?\d*)\s*km\/h/i) ||
    text.match(/Vento[^0-9]{0,20}(\d+[.,]?\d*)\s*km\/h/i);
  const windKmh = numberFrom(windMatch, 1);

  const dirMatch =
    text.match(/Direzione[^A-Z]{0,15}\b(NNE|NNO|ENE|ESE|SSE|SSO|OSO|ONO|NE|NO|SE|SO|N|E|S|O)\b/) ||
    text.match(/Vento[^A-Z]{0,25}\b(NNE|NNO|ENE|ESE|SSE|SSO|OSO|ONO|NE|NO|SE|SO|N|E|S|O)\b/);

  return {
    temp,
    humidity,
    wind: kmhToMs(windKmh),
    windDir: itaDirToEn(dirMatch ? dirMatch[1] : null),
    ...extractSourceStatus(text)
  };
}

const PARSERS = {
  vigo: parseVigoText,
  pozza: parsePozzaText
};

// Cache del JSON di riserva (generato dal workflow GitHub Actions),
// usato solo se la lettura dal vivo fallisce. Scaricato una sola volta.
let fallbackCache = null;

// Leggiamo il JSON di riserva direttamente da raw.githubusercontent.com
// invece che dal dominio di GitHub Pages: quest'ultimo deve prima
// "ricostruire" il sito ad ogni commit (anche mezz'ora di ritardo),
// mentre il contenuto grezzo del repository e' visibile in pochi
// secondi/minuti dal commit.
const FALLBACK_JSON_URL =
  "https://raw.githubusercontent.com/andreavio00/meteo-fassa/main/data/extra-stations.json";

async function loadFallbackData() {
  if (fallbackCache) return fallbackCache;

  try {
    const response = await fetchWithTimeout(FALLBACK_JSON_URL, 5000);
    fallbackCache = await response.json();
  } catch (err) {
    fallbackCache = {};
  }

  return fallbackCache;
}

async function loadExtraStation(key) {
  const config = EXTRA_STATIONS[key];

  // 1. Tenta la lettura dal vivo tramite proxy CORS
  try {
    const text = await fetchPageText(config.sourceUrl);
    const parsed = PARSERS[key](text);

    if (parsed.temp === null) throw new Error("Temperatura non trovata");

    const updated = parsed.updatedMinutes !== null
      ? minutesToTimeString(parsed.updatedMinutes)
      : romeTimeNowString();

    return {
      name: config.name,
      quota: config.quota,
      updated,
      stale: parsed.offline || isStale(parsed.updatedMinutes),
      source: "live",

      temp: parsed.temp,
      humidity: parsed.humidity !== null ? parsed.humidity : "-",
      wind: parsed.wind !== null ? parsed.wind : "-",
      windDir: parsed.windDir || "-"
    };
  } catch (liveErr) {
    // 2. Fallback: ultimo dato salvato dal workflow GitHub Actions
    const fallbackData = await loadFallbackData();
    const station = fallbackData[key];

    if (!station || station.ok === false) {
      throw new Error(`Dati non disponibili per "${key}"`);
    }

    return {
      name: station.name,
      quota: station.quota,
      updated: station.updated,
      stale: station.stale !== undefined ? station.stale : true,
      source: "fallback",

      temp: station.temp !== null && station.temp !== undefined ? station.temp : "-",
      humidity: station.humidity !== null && station.humidity !== undefined ? station.humidity : "-",
      wind: station.wind !== null && station.wind !== undefined ? station.wind : "-",
      windDir: station.windDir || "-"
    };
  }
}

// Configurazione del riquadro "fonte dati" mostrato al tocco sulla
// card di Vigo/Pozza: la pagina sorgente viene caricata a una
// larghezza "virtuale" (frameWidth/frameHeight) e poi ritagliata e
// ingrandita (scale + offset) per mostrare solo la zona con la
// temperatura. Questi numeri sono una prima stima: quasi certamente
// andranno tarati dopo aver visto come renderizza sul telefono.
const DETAIL_CONFIG = {
  vigo: {
    url: "https://www.dolomitimeteo.com/stazione-meteo-vigo/",
    frameWidth: 380,
    frameHeight: 1600,
    scale: 1,
    offsetX: 0,
    offsetY: 0
  },
  pozza: {
    url: "https://www.meteonetwork.eu/it/weather-station/trn314-stazione-meteorologica-di-monzon",
    frameWidth: 380,
    frameHeight: 1800,
    scale: 1,
    offsetX: 0,
    offsetY: -550
  }
};

let detailFallbackTimer = null;

function openDetailModal(key) {
  const config = DETAIL_CONFIG[key];
  if (!config) return;

  const modal = document.getElementById("detail-modal");
  const iframe = document.getElementById("detail-iframe");
  const openLink = document.getElementById("modal-open-link");

  openLink.href = config.url;

  iframe.style.width = config.frameWidth + "px";
  iframe.style.height = config.frameHeight + "px";
  iframe.style.transformOrigin = "top left";
  iframe.style.transform =
    `translate(${config.offsetX}px, ${config.offsetY}px) scale(${config.scale})`;

  let loaded = false;
  iframe.onload = () => { loaded = true; };
  iframe.src = config.url;

  modal.classList.remove("hidden");

  clearTimeout(detailFallbackTimer);
  detailFallbackTimer = setTimeout(() => {
    if (!loaded) {
      closeDetailModal();
      window.open(config.url, "_blank", "noopener");
    }
  }, 3000);
}

function closeDetailModal() {
  const modal = document.getElementById("detail-modal");
  const iframe = document.getElementById("detail-iframe");

  modal.classList.add("hidden");
  iframe.src = "about:blank";
  clearTimeout(detailFallbackTimer);
}

function createCard(data, extraKey) {

  const icon = iconByAltitude(data.quota);

  const time = data.updated ? data.updated.substring(11,16) : "--:--";

  const humidity =
    data.humidity !== "-"
      ? `<div class="value">💧 ${data.humidity}%</div>`
      : "";

  const wind =
    data.wind !== "-"
      ? `<div class="value">💨 ${data.wind} m/s ${data.windDir}</div>`
      : "";

  const staleWarning = data.stale
    ? (data.source === "fallback"
        ? `<div class="stale-warning">⚠️ lettura live non riuscita, dato di riserva</div>`
        : `<div class="stale-warning">⚠️ dato non aggiornato di recente</div>`)
    : "";

  const clickable = extraKey ? " clickable" : "";
  const onClick = extraKey ? ` onclick="openDetailModal('${extraKey}')"` : "";
  const tapHint = extraKey
    ? `<div class="tap-hint">👆 tocca per la fonte</div>`
    : "";

  return `
    <div class="station-card${data.stale ? " stale" : ""}${clickable}"${onClick}>

      <div class="station-name">
        ${icon} ${data.name}
      </div>

      <div class="station-quota">
        ${data.quota}
      </div>

      <div class="temperature">
        ${data.temp}°
      </div>

      ${humidity}

      ${wind}

      <div class="time">
        🕒 ${time}
      </div>

      ${staleWarning}

      ${tapHint}

    </div>
  `;
}

async function loadAllStations() {

  const container =
    document.getElementById("stations");

  container.innerHTML =
    "<p>Caricamento dati...</p>";

  // Tutte le stazioni vengono caricate in parallelo (non una dopo
  // l'altra): questo velocizza molto il caricamento della pagina,
  // ed evita che una fonte lenta blocchi tutte le altre.
  const cardsHtml = await Promise.all(
    stations.map(async (station) => {
      try {

        const data =
          station.type === "extra"
            ? await loadExtraStation(station.key)
            : await loadStation(station);

        return createCard(data, station.type === "extra" ? station.key : null);

      } catch (err) {

        const label =
          station.type === "extra"
            ? EXTRA_STATIONS[station.key].name
            : station.name;

        return `
          <div class="station-card">
            <div class="station-name">
              ${label}
            </div>
            <div>Errore caricamento dati</div>
          </div>
        `;
      }
    })
  );

  container.innerHTML = cardsHtml.join("");
}

loadAllStations();
