// osservazioni.js
//
// Dato osservato in tempo reale — temperatura/umidità da ARPAV Cavanis,
// vento dall'ultima riga della tabella Misericordia. Le funzioni qui
// dentro sono una copia di loadCavanis()/loadMisericordiaTable() già
// presenti in app.js: per ora è codice duplicato (stessa scelta fatta
// per index.html vs previsioni.html: pagine indipendenti, niente
// dipendenza incrociata rischiosa su un file che governa già tutta la
// dashboard principale).
//
// Tutto è racchiuso in window.Osservazioni proprio per rendere questa
// duplicazione "innocua": se in futuro si deciderà di far consumare
// anche app.js da qui (eliminando la duplicazione), questo file può
// essere incluso pure in index.html PRIMA di app.js senza scontrarsi
// con le costanti/funzioni omonime (CAVANIS_API_URL, formatTime, ecc.)
// già dichiarate lì con "const"/"function" a livello globale.
window.Osservazioni = (function () {

  const PROXY_WORKER_URL = "https://lagunalive-proxy.andrea-vio.workers.dev/";

  function proxyUrl(targetUrl) {
    return PROXY_WORKER_URL + "?url=" + encodeURIComponent(targetUrl);
  }

  const CAVANIS_API_URL =
    "https://api.arpa.veneto.it/REST/v1/meteo_meteogrammi_tabella?codseqst=300000154";

  const MISERICORDIA_URL = proxyUrl(
    "http://www.comune.venezia.it/sites/default/files/publicCPSM2/stazioni/temporeale/Misericordia.html"
  );

  function formatTime(timestamp) {
    const date = new Date(timestamp.replace(" ", "T") + "+01:00");
    return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  function windDirection(deg) {
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[Math.round(deg / 45) % 8];
  }

  // Stesso parser di app.js per le tabelle HTML pubblicate dal Comune.
  function parseHtmlTableRows(html) {
    const rows = [];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowContent = rowMatch[1];
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

  // Stessa logica di loadCavanis() in app.js: ultimo valore per ogni
  // tipo di misura dal meteogramma ARPAV di Osservatorio Cavanis.
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

    return {
      timestamp: lastTemp.dataora,
      temperature: parseFloat(lastTemp.valore),
      humidity: parseFloat(lastHumidity.valore)
    };
  }

  // Ultimo dato di vento di Misericordia. Non lancia mai un'eccezione
  // (stesso principio di loadMisericordiaWind() in app.js): se
  // Misericordia non e' raggiungibile, il chiamante riceve
  // available:false e mostra semplicemente "n.d." per il vento, senza
  // far fallire l'intera situazione attuale.
  async function loadMisericordiaWind() {
    try {
      const response = await fetch(MISERICORDIA_URL);
      const html = await response.text();
      const rows = parseHtmlTableRows(html).map(cols => ({
        timestamp: cols[0],
        windDir: parseFloat(cols[2]),
        windSpeed: parseFloat(cols[3])
      }));

      if (rows.length === 0) {
        throw new Error("Nessuna riga dati trovata per Misericordia");
      }

      const last = rows[rows.length - 1];
      return { available: true, timestamp: last.timestamp, windDir: last.windDir, windSpeed: last.windSpeed };

    } catch (err) {
      console.warn("Vento Misericordia non disponibile:", err);
      return { available: false };
    }
  }

  return {
    loadCavanis,
    loadMisericordiaWind,
    formatTime,
    windDirection
  };

})();
