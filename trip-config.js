window.METEO_FASSA_TRIPS={
 stationsUrl:"https://gite-meteo-aggregator.andrea-vio.workers.dev/",
 forecastUrl:"https://gite-previsioni-aggregator.andrea-vio.workers.dev",
 zones:{
  catinaccio:{
   name:"Catinaccio",icon:"⛰️",stationZoneId:"catinaccio",forecastId:"catinaccio",excludeStations:[]
  },
  sella:{
   name:"Sella e Sassolungo",icon:"🪨",stationZoneId:"sassolungo_sella",forecastId:"sassolungo_sella",
   excludeStations:["fassa:coldeirossi"]
  },
  marmolada:{
   name:"Marmolada e Val San Nicolò",icon:"🏔️",stationZoneId:"marmolada_val_s_nicolo",forecastId:"marmolada_val_s_nicolo",
   excludeStations:[]
  },
  moena:{
   name:"Moena e Latemar",icon:"🌲",stationZoneId:"moena_latemar",forecastId:"moena_latemar",
   excludeStations:["predazzo:passofeudo"]
  }
 }
};

window.METEO_FASSA_ON_DEMAND={
 workerUrl:"https://meteo-fassa-previsioni-richiesta.andrea-vio.workers.dev",
 stationsUrl:"https://gite-meteo-aggregator.andrea-vio.workers.dev"
};
