fetch(
  "https://dati.meteotrentino.it/service.asmx/datiRealtimeUnaStazione?stazione=T0403&h=1"
)
.then(response => response.json())
.then(data => {

  const first = data.features[0].properties;

  document.body.innerHTML = `
    <h1>Test Meteo Trentino</h1>

    <p><b>Stazione:</b> ${first.staz}</p>
    <p><b>Quota:</b> ${first.quota}</p>
    <p><b>Data:</b> ${first.datetime}</p>

    <pre>${JSON.stringify(first, null, 2)}</pre>
  `;

})
.catch(error => {

  document.body.innerHTML = `
    <h1>Errore</h1>
    <pre>${error}</pre>
  `;

  console.error(error);

});
