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

// Cache del JSON esterno (Vigo/Pozza), scaricato una sola volta per
// tutte le card che lo usano.
let extraStationsCache = null;

async function loadExtraStationsData() {
  if (extraStationsCache) return extraStationsCache;

  try {
    const response = await fetch("data/extra-stations.json");
    extraStationsCache = await response.json();
  } catch (err) {
    extraStationsCache = {};
  }

  return extraStationsCache;
}

function loadExtraStation(key, extraData) {
  const station = extraData[key];

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

  const extraData = await loadExtraStationsData();

  let html = "";

  for (const station of stations) {

    try {

      const data =
        station.type === "extra"
          ? loadExtraStation(station.key, extraData)
          : await loadStation(station);

      html += createCard(data);

    } catch(err) {

      const label =
        station.type === "extra"
          ? (extraData[station.key] && extraData[station.key].name) || station.key
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
