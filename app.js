fetch(
  "https://dati.meteotrentino.it/service.asmx/datiRealtimeUnaStazione?stazione=T0403&h=1"
)
.then(r => r.json())
.then(data => {
  console.log(data);
  document.body.innerHTML =
    "<pre>" +
    JSON.stringify(data.features[0], null, 2) +
    "</pre>";
})
.catch(err => {
  document.body.innerHTML =
    "<h2>Errore</h2><pre>" + err + "</pre>";
});