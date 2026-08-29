const WORKER_URL = "https://meteofassa-proxy.andrea-vio.workers.dev/";
const WORKER_TIMEOUT = 7000;

// Età del dato: oltre 15 min = attenzione, oltre 30 min = vecchio.
const DATA_AGE_WARNING = 15;
const DATA_AGE_OLD = 30;

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
    name: "Vigo",
    fullName: "Vigo di Fassa",
    quota: "1400 m",
    icon: "🌲",
    sourceUrl: "https://stazioni.meteoproject.it/dati/vigodifassa/tabella-vuota.php"
  },
  monzon: {
    name: "Monzon",
    fullName: "Monzon – Pozza di Fassa",
    quota: "1520 m",
    icon: "🌲",
    sourceUrl: "https://www.meteonetwork.eu/it/weather-station/trn314-stazione-meteorologica-di-monzon"
  },
  moena: {
    name: "Moena",
    fullName: "Moena",
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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function dataAgeInfo(value) {
  const date = parseDate(value);
  if (!date) {
    return {
      className: "unknown",
      label: "Ora dato non disponibile",
      minutes: null
    };
  }

  const minutes = Math.max(0, (Date.now() - date.getTime()) / 60000);

  if (minutes > DATA_AGE_OLD) {
    return {
      className: "old",
      label: `Dato vecchio · ${Math.floor(minutes)} min fa`,
      minutes
    };
  }

  if (minutes > DATA_AGE_WARNING) {
    return {
      className: "warning",
      label: `Dato non recente · ${Math.floor(minutes)} min fa`,
      minutes
    };
  }

  return {
    className: "fresh",
    label: minutes < 1 ? "Dato appena rilevato" : `Dato di ${Math.floor(minutes)} min fa`,
    minutes
  };
}

function direction(deg) {
  if (deg === null || deg === undefined || deg === "" || !Number.isFinite(Number(deg))) {
    return "—";
  }
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
                "S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

// Cerca l'ora specifica del dato, dando priorità ai campi della singola stazione.
// Il timestamp del Worker viene usato solo come fallback.
function getStationTimestamp(data, workerTimestamp) {
  if (!data) return workerTimestamp || null;

  const candidates = [
    data.aggiornamento,
    data.datetime,
    data.timestamp,
    data.data_ora,
    data.dataOra,
    data.time,
    data.ora
  ];

  for (const value of candidates) {
    if (parseDate(value)) return value;
  }

  return workerTimestamp || null;
}

function normaliseWorkerData(raw) {
  return {
    workerTimestamp: raw.timestamp || raw.datetime || null,
    vigo: raw.vigo || null,
    monzon: raw.monzon || raw.pozza || null,
    moena: raw.moena || null
  };
}

function mainDataToCard(key, data, workerTimestamp) {
  const cfg = MAIN_STATIONS[key];

  if (!data) {
    return {
      name: cfg.name,
      fullName: cfg.fullName,
      quota: cfg.quota,
      icon: cfg.icon,
      error: "Dati non disponibili"
    };
  }

  const wind = data.vento && typeof data.vento === "object" ? data.vento : {};
  const rain = data.precipitazioni && typeof data.precipitazioni === "object"
    ? data.precipitazioni : {};

  const pressure = data.pressione?.attuale ?? data.pressione ?? null;
  const humidity = data.umidita?.attuale ?? data.umidita ?? null;
  const temp = data.temperatura?.attuale ?? data.temperatura ?? null;
  const windValue = wind.attuale ?? (typeof data.vento === "number" ? data.vento : null);
  const gust = wind.raffica ?? data.vento_max_giorno ?? data.raffica ?? null;
  const windDir = wind.direzione ?? data.direzione ?? null;
  const rainValue = rain.giornaliero ?? data.pioggia ?? null;
  const updated = getStationTimestamp(data, workerTimestamp);

  return {
    name: cfg.name,
    fullName: cfg.fullName,
    quota: data.quota ? `${data.quota} m` : cfg.quota,
    icon: cfg.icon,
    temp,
    humidity,
    pressure,
    wind: windValue,
    gust,
    windDir,
    rain: rainValue,
    updated,
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

  const age = dataAgeInfo(card.updated);

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

      <div class="data-time ${age.className}" title="${age.label}">
        <span class="age-dot"></span>
        <span>Dati delle <strong>${formatTime(card.updated)}</strong></span>
      </div>
      <div class="data-age ${age.className}">${age.label}</div>
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

    status.textContent = `Fonte dati aggiornata alle ${formatTime(data.workerTimestamp)}`;
    status.className = "worker-status ok";
  } catch (error) {
    console.error("Worker:", error);
    container.innerHTML = ["vigo", "monzon", "moena"]
      .map(key => createMainCard({
        name: MAIN_STATIONS[key].name,
        fullName: MAIN_STATIONS[key].fullName,
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

// Aggiorna solo l'indicazione dell'età dei dati senza richiedere nuovamente il Worker.
setInterval(() => {
  document.querySelectorAll(".data-time").forEach(el => {
    // Il testo viene già fissato al caricamento; il refresh completo dei dati
    // resta affidato al normale ricaricamento della pagina.
  });
}, 60000);
