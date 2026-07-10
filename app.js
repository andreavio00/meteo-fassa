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

async function loadStation(station) {

  const url =
    `https://dati.meteotrentino.it/service.asmx/datiRealtimeUnaStazione?stazione=${station.code}&h=1`;

  const response = await fetch(url);
  const data = await response.json();

  const features = data.features;
  const latest = features[0].properties;

  return {
    name: station.name,
    quota: latest["quota"],
    updated: latest["datetime"],

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

// Restituisce una stringa nel formato "...THH:MM" con l'ora locale
// italiana (gestisce da sola il passaggio ora legale/solare), cosi'
// che createCard() possa estrarla con lo stesso substring(11,16) usato
// per tutte le altre card.
function romeTimeNowString() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const hh = parts.find(p => p.type === "hour").value;
  const mm = parts.find(p => p.type === "minute").value;

  return `1970-01-01T${hh}:${mm}`;
}

// Scarica una pagina pubblica passando da un proxy CORS (il sito
// sorgente non espone un'API ne' permette il fetch diretto da browser)
// e ne restituisce il solo testo visibile (senza script/style).
async function fetchPageText(url) {
  const proxyUrl =
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);

  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error("Proxy non disponibile");

  const html = await response.text();

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach(el => el.remove());

  return doc.body ? doc.body.textContent : "";
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
    windDir: itaDirToEn(windDir)
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
    windDir: itaDirToEn(dirMatch ? dirMatch[1] : null)
  };
}

const PARSERS = {
  vigo: parseVigoText,
  pozza: parsePozzaText
};

// Cache del JSON di riserva (generato dal workflow GitHub Actions),
// usato solo se la lettura dal vivo fallisce. Scaricato una sola volta.
let fallbackCache = null;

async function loadFallbackData() {
  if (fallbackCache) return fallbackCache;

  try {
    const response = await fetch("data/extra-stations.json");
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

    return {
      name: config.name,
      quota: config.quota,
      updated: romeTimeNowString(),

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

      temp: station.temp !== null && station.temp !== undefined ? station.temp : "-",
      humidity: station.humidity !== null && station.humidity !== undefined ? station.humidity : "-",
      wind: station.wind !== null && station.wind !== undefined ? station.wind : "-",
      windDir: station.windDir || "-"
    };
  }
}

function createCard(data) {

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

  return `
    <div class="station-card">

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

    </div>
  `;
}

async function loadAllStations() {

  const container =
    document.getElementById("stations");

  container.innerHTML =
    "<p>Caricamento dati...</p>";

  let html = "";

  for (const station of stations) {

    try {

      const data =
        station.type === "extra"
          ? await loadExtraStation(station.key)
          : await loadStation(station);

      html += createCard(data);

    } catch(err) {

      const label =
        station.type === "extra"
          ? EXTRA_STATIONS[station.key].name
          : station.name;

      html += `
        <div class="station-card">
          <div class="station-name">
            ${label}
          </div>
          <div>Errore caricamento dati</div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

loadAllStations();
