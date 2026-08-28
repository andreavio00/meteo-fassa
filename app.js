const WORKER_URL = "https://meteofassa-proxy.andrea-vio.workers.dev/";
const WORKER_TIMEOUT = 7000;

const TRENTINO_STATIONS = [
  { code: "T0096", name: "Moena (Diga Pezzè)" },
  { code: "T0437", name: "Canazei (Gries)" },
  { code: "T0094", name: "Passo Costalunga" },
  { code: "T0229", name: "Campitello (Malga Do Col D'Aura)" },
  { code: "T0092", name: "Pian Fedaia (Diga)" },
  { code: "T0403", name: "Canazei (Ciampac)" }
];

const MAIN_STATIONS = {
  vigo: {
    name: "Vigo di Fassa",
    quota: "1400 m",
    icon: "🌲",
    sourceUrl: "https://stazioni.meteoproject.it/dati/vigodifassa/tabella-vuota.php"
  },
  monzon: {
    name: "Monzon – Pozza di Fassa",
    quota: "1520 m",
    icon: "🌲",
    sourceUrl: "https://www.meteonetwork.eu/it/weather-station/trn314-stazione-meteorologica-di-monzon"
  },
  moena: {
    name: "Moena",
    quota: "1221 m",
    icon: "🌲"
  }
};

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function numberOrDash(value, decimals = 1) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return "—";
  }
  return Number(value).toFixed(decimals).replace(".", ",");
}

function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function direction(deg) {
  if (deg === null || deg === undefined || deg === "" || !Number.isFinite(Number(deg))) {
    return "—";
  }
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                "S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function normaliseWorkerData(raw) {
  return {
    workerTimestamp: raw.timestamp || null,
    vigo: raw.vigo || null,
    monzon: raw.monzon || null,
    moena: raw.moena || null
  };
}

function mainDataToCard(key, data, workerTimestamp) {
  const cfg = MAIN_STATIONS[key];
  if (!data) {
    return {
      name: cfg.name,
      quota: cfg.quota,
      icon: cfg.icon,
      error: "Dati non disponibili"
    };
  }

  const wind = data.vento || {};
  const rain = data.precipitazioni || {};
  const pressure = data.pressione?.attuale ?? data.pressione ?? null;
  const humidity = data.umidita?.attuale ?? data.umidita ?? null;
  const temp = data.temperatura?.attuale ?? data.temperatura ?? null;

  return {
    name: cfg.name,
    quota: data.quota ? `${data.quota} m` : cfg.quota,
    icon: cfg.icon,
    temp,
    humidity,
    pressure,
    wind: wind.attuale ?? data.vento ?? null,
    gust: wind.raffica ?? data.vento_max_giorno ?? null,
    windDir: wind.direzione ?? data.direzione ?? null,
    rain: rain.giornaliero ?? data.pioggia ?? null,
    updated: data.aggiornamento || workerTimestamp,
    workerTimestamp,
    sourceUrl: cfg.sourceUrl
  };
}

function createMainCard(card) {
  if (card.error) {
    return `
      <article class="station-card station-error">
        <div class="card-title"><span>${card.icon}</span><strong>${card.name}</strong></div>
        <div class="quota">${card.quota}</div>
        <p>${card.error}</p>
      </article>
    `;
  }

  const windDir = card.windDir && typeof card.windDir === "string"
    ? card.windDir
    : (card.windDir !== null && card.windDir !== undefined ? direction(card.windDir) : "—");

  const source = card.sourceUrl
    ? `<a class="source-link" href="${card.sourceUrl}" target="_blank" rel="noopener">Fonte ↗</a>`
    : "";

  return `
    <article class="station-card main-card">
      <div class="card-head">
        <div>
          <div class="card-title"><span>${card.icon}</span><strong>${card.name}</strong></div>
          <div class="quota">${card.quota}</div>
        </div>
        ${source}
      </div>

      <div class="temperature">${numberOrDash(card.temp)}<span>°C</span></div>

      <div class="metrics">
        <div class="metric"><span>💧 Umidità</span><strong>${numberOrDash(card.humidity, 0)}%</strong></div>
        <div class="metric"><span>💨 Vento</span><strong>${numberOrDash(card.wind)} km/h ${windDir}</strong></div>
        <div class="metric"><span>🌬️ Raffica</span><strong>${numberOrDash(card.gust)} km/h</strong></div>
        <div class="metric"><span>⏲️ Pressione</span><strong>${numberOrDash(card.pressure)} hPa</strong></div>
        <div class="metric"><span>🌧️ Pioggia</span><strong>${numberOrDash(card.rain)} mm</strong></div>
      </div>

      <div class="updated">🕒 Aggiornato ${formatTime(card.updated || card.workerTimestamp)}</div>
    </article>
  `;
}

async function loadMainStations() {
  const container = document.getElementById("main-stations");
  const status = document.getElementById("worker-status");

  try {
    const response = await fetchWithTimeout(`${WORKER_URL}?_=${Date.now()}`, WORKER_TIMEOUT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    if (!raw.ok) throw new Error("Worker non disponibile");

    const data = normaliseWorkerData(raw);

    container.innerHTML = ["vigo", "monzon", "moena"]
      .map(key => createMainCard(mainDataToCard(key, data[key], data.workerTimestamp)))
      .join("");

    status.textContent = `Dati principali aggiornati alle ${formatTime(data.workerTimestamp)}`;
    status.className = "worker-status ok";
  } catch (error) {
    console.error("Worker:", error);
    container.innerHTML = ["vigo", "monzon", "moena"]
      .map(key => createMainCard({
        name: MAIN_STATIONS[key].name,
        quota: MAIN_STATIONS[key].quota,
        icon: MAIN_STATIONS[key].icon,
        error: "Impossibile leggere i dati in questo momento"
      }))
      .join("");

    status.textContent = "⚠️ Dati principali non disponibili";
    status.className = "worker-status error";
  }
}

async function loadTrentinoStation(station) {
  const url =
    `https://dati.meteotrentino.it/service.asmx/datiRealtimeUnaStazione?stazione=${station.code}&h=1`;

  const response = await fetchWithTimeout(url, 7000);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const features = data.features || [];
  if (!features.length) throw new Error("Nessun dato");

  const latest = features[0].properties || {};

  function latestValue(field) {
    for (const feature of features) {
      const value = feature.properties?.[field];
      if (value !== "" && value !== null && value !== undefined) return value;
    }
    return null;
  }

  return {
    name: station.name,
    quota: latest.quota,
    temp: latestValue("ta(°C)"),
    humidity: latestValue("umid(%)"),
    wind: latestValue("vvmed(m/s)"),
    windDir: latestValue("dvmed(gN)"),
    updated: latest.datetime
  };
}

function createTrentinoCard(data) {
  return `
    <article class="station-card secondary-card">
      <div class="card-title"><span>⛰️</span><strong>${data.name}</strong></div>
      <div class="quota">${data.quota ? data.quota + " m" : ""}</div>
      <div class="secondary-temp">${numberOrDash(data.temp)}<span>°C</span></div>
      <div class="secondary-line">💧 ${numberOrDash(data.humidity, 0)}% · 💨 ${numberOrDash(data.wind)} m/s ${direction(data.windDir)}</div>
      <div class="updated">🕒 ${data.updated || "—"}</div>
    </article>
  `;
}

async function loadTrentinoStations() {
  const container = document.getElementById("trentino-stations");
  container.innerHTML = '<p class="loading">Caricamento stazioni Meteo Trentino…</p>';

  const results = await Promise.allSettled(
    TRENTINO_STATIONS.map(station => loadTrentinoStation(station))
  );

  container.innerHTML = results.map((result, index) => {
    if (result.status === "fulfilled") return createTrentinoCard(result.value);

    return `
      <article class="station-card secondary-card station-error">
        <div class="card-title"><span>⛰️</span><strong>${TRENTINO_STATIONS[index].name}</strong></div>
        <p>Dati non disponibili</p>
      </article>
    `;
  }).join("");
}

document.getElementById("trentino-details").addEventListener("toggle", event => {
  if (event.target.open && !event.target.dataset.loaded) {
    event.target.dataset.loaded = "true";
    loadTrentinoStations();
  }
});

loadMainStations();
