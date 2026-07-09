const stations = [
  { code: "T0096", name: "Moena (Diga Pezzè)" },
  { code: "T0437", name: "Canazei (Gries)" },
  { code: "T0094", name: "Passo Costalunga" },
  { code: "T0229", name: "Campitello (Malga Do Col D'Aura)" },
  { code: "T0092", name: "Pian Fedaia (Diga)" },
  { code: "T0403", name: "Canazei (Ciampac)" }
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

function createCard(data) {

  const icon = iconByAltitude(data.quota);

  const time = data.updated.substring(11,16);

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
        await loadStation(station);

      html += createCard(data);

    } catch(err) {

      html += `
        <div class="station-card">
          <div class="station-name">
            ${station.name}
          </div>
          <div>Errore caricamento dati</div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

loadAllStations();