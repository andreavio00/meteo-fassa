const CFG=window.METEO_FASSA_TRIPS;
const ROME="Europe/Rome";
const STALE_AFTER_MINUTES=60;
const FETCH_TIMEOUT_MS=30000;
const CACHE_MAX_AGE_MS=6*60*60*1000;
const CACHE_PREFIX="meteo-fassa-hike-v4:";
const PERIODS=[
 {id:"08-11",start:"08:00",label:"08–11",endMinutes:11*60},
 {id:"11-14",start:"11:00",label:"11–14",endMinutes:14*60},
 {id:"14-17",start:"14:00",label:"14–17",endMinutes:17*60},
 {id:"17-20",start:"17:00",label:"17–20",endMinutes:20*60}
];

// Rete di sicurezza per codici che l'Aggregator restituisce come "unknown".
// I significati provengono dalla tabella sky_conditions pubblicata da
// meteo.report; la correzione definitiva va comunque fatta nell'Aggregator.
const METEO_REPORT_FALLBACKS={
 C:{code:"partly_cloudy",label_it:"Parzialmente nuvoloso",icon:"⛅",severity:30},
 D:{code:"cloudy",label_it:"Nuvoloso",icon:"☁️",severity:40},
 E:{code:"overcast",label_it:"Molto nuvoloso",icon:"☁️",severity:50},
 F:{code:"showers",label_it:"Rovesci",icon:"🌦️",severity:80},
 G:{code:"heavy_showers",label_it:"Rovesci forti",icon:"🌧️",severity:90},
 H:{code:"rain",label_it:"Pioggia moderata",icon:"🌧️",severity:75},
 I:{code:"heavy_rain",label_it:"Pioggia forte",icon:"🌧️",severity:90},
 J:{code:"light_rain",label_it:"Pioggia debole",icon:"🌦️",severity:65},
 K:{code:"light_showers",label_it:"Rovesci deboli",icon:"🌦️",severity:65},
 L:{code:"light_snow_sun",label_it:"Neve debole e sole",icon:"🌨️",severity:60},
 M:{code:"snow_sun",label_it:"Neve e sole",icon:"🌨️",severity:70},
 N:{code:"light_snow",label_it:"Neve debole",icon:"🌨️",severity:65},
 O:{code:"snow",label_it:"Neve moderata",icon:"🌨️",severity:80},
 P:{code:"heavy_snow",label_it:"Neve forte",icon:"🌨️",severity:90},
 Q:{code:"wet_snow_sun",label_it:"Neve bagnata e sole",icon:"🌨️",severity:65},
 R:{code:"wet_snow",label_it:"Neve bagnata",icon:"🌨️",severity:75},
 S:{code:"haze",label_it:"Foschia",icon:"🌫️",severity:35},
 T:{code:"mountain_haze",label_it:"Foschia in quota",icon:"🌫️",severity:40},
 U:{code:"unstable",label_it:"Instabile",icon:"🌦️",severity:80},
 V:{code:"thunderstorm",label_it:"Temporali",icon:"⛈️",severity:100},
 W:{code:"unstable_wet_snow",label_it:"Instabile con neve bagnata",icon:"🌨️",severity:85},
 X:{code:"wet_snow_thunderstorm",label_it:"Temporali di neve bagnata",icon:"⛈️",severity:100},
 Y:{code:"snow_thunderstorm_unstable",label_it:"Instabile con temporali nevosi",icon:"⛈️",severity:100},
 Z:{code:"snow_thunderstorm",label_it:"Temporali nevosi",icon:"⛈️",severity:100}
};

let stations=[];
let forecastLocations=[];
let selectedZone="catinaccio";
let selectedDate=null;
let selectedPeriod=PERIODS[0].id;
let loadToken=0;

const $=selector=>document.querySelector(selector);
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const fmt=(value,digits=1)=>finite(value)?Number(value).toFixed(digits).replace(".",","):"—";
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function parsedDate(value){
 if(!value)return null;
 const date=new Date(value);
 return Number.isNaN(date.getTime())?null:date;
}

function clock(value){
 const date=parsedDate(value);
 return date?new Intl.DateTimeFormat("it-IT",{timeZone:ROME,hour:"2-digit",minute:"2-digit"}).format(date):"—";
}

function localNow(){
 return new Intl.DateTimeFormat("sv-SE",{
  timeZone:ROME,year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).format(new Date()).replace(" ","T");
}

function currentMinutes(){
 const time=localNow().slice(11,16).split(":").map(Number);
 return time[0]*60+time[1];
}

function measureTime(station){
 const direct=station.updated||station.temperatureAt||station.windAt||station.precipitationAt;
 if(direct)return direct;
 const match=String(station.updatedText||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}).*?(\d{1,2})[.:](\d{2})/);
 if(!match)return null;
 const year=Number(match[3])<100?2000+Number(match[3]):Number(match[3]);
 return new Date(year,Number(match[2])-1,Number(match[1]),Number(match[4]),Number(match[5])).toISOString();
}

function isStale(station){
 const date=parsedDate(measureTime(station));
 return date?(Date.now()-date.getTime())>STALE_AFTER_MINUTES*60000:false;
}

function stationName(station){
 return CFG.stationNameOverrides?.[station.key]||station.name||station.id||"Stazione";
}

function stationIcon(station){
 const name=stationName(station).toLowerCase();
 if(name.includes("rifugio")||name.includes("capanna"))return "🛖";
 if(name.includes("passo"))return "🚗";
 if(name.includes("sass")||name.includes("cima")||name.includes("piz")||name.includes("marmolada"))return "🏔️";
 if(name.includes("val duron")||name.includes("malga"))return "⛰️";
 return "🌲";
}

function rainValue(station){
 if(finite(station.rainRate))return {label:"Intensità pioggia",text:`${fmt(station.rainRate)} mm/h`};
 if(finite(station.precipitation))return {label:"Precipitazione",text:`${fmt(station.precipitation)} mm`};
 if(finite(station.rainToday))return {label:"Pioggia oggi",text:`${fmt(station.rainToday)} mm`};
 return null;
}

function stationCard(station){
 const online=station.status==="online";
 const old=isStale(station);
 const rain=rainValue(station);
 const metrics=[];
 if(finite(station.wind))metrics.push(`<span title="Vento">💨 ${fmt(station.wind)} km/h</span>`);
 if(finite(station.windGust))metrics.push(`<span title="Raffica">🌬️ ${fmt(station.windGust)} km/h</span>`);
 if(rain)metrics.push(`<span title="${esc(rain.label)}">🌧️ ${esc(rain.text)}</span>`);
 if(finite(station.humidity))metrics.push(`<span title="Umidità">💧 ${fmt(station.humidity,0)}%</span>`);
 const measured=measureTime(station);
 const timeText=measured
  ?`${old?"⚠️ Dato vecchio · ":""}${clock(measured)}`
  :station.updatedText?`Agg. ${esc(station.updatedText)}`:"Ora della misura non disponibile";
 return `<button class="observed-card ${online?"":"offline"} ${old?"stale":""}" data-station-key="${esc(station.key)}" ${online?"":"disabled"}>
  <span class="observed-head">
   <span class="observed-name"><span>${stationIcon(station)}</span><span><strong>${esc(stationName(station))}</strong><small>${finite(station.altitude)?`${fmt(station.altitude,0)} m`:"Quota n/d"}</small></span></span>
   <small class="observed-source">${esc(station.source||"")}</small>
  </span>
  ${online?`<span class="observed-temp">${fmt(station.temperature)}°</span><span class="observed-metrics">${metrics.join("")||"<span>Dati essenziali n/d</span>"}</span><span class="observed-time ${old?"stale":""}">${timeText}</span>`:`<span class="observed-time">Dati non disponibili</span>`}
 </button>`;
}

function detailRows(rows){
 return `<div class="dialog-grid">${rows.filter(row=>row[0]&&row[1]!==null).map(row=>`<div><small>${esc(row[0])}</small><strong>${esc(row[1])}</strong></div>`).join("")}</div>`;
}

function stationDetail(station){
 const rain=rainValue(station);
 const measured=measureTime(station);
 const windDirection=station.windDirection?` ${station.windDirection}`:"";
 const rows=[
  ["Temperatura",finite(station.temperature)?`${fmt(station.temperature)} °C`:null],
  ["Percepita",finite(station.feelsLike)?`${fmt(station.feelsLike)} °C`:null],
  ["Umidità",finite(station.humidity)?`${fmt(station.humidity,0)}%`:null],
  ["Vento",finite(station.wind)?`${fmt(station.wind)} km/h${windDirection}`:null],
  ["Raffica",finite(station.windGust)?`${fmt(station.windGust)} km/h`:null],
  [rain?.label,rain?.text||null],
  ["Pioggia oggi",finite(station.rainToday)&&rain?.label!=="Pioggia oggi"?`${fmt(station.rainToday)} mm`:null],
  ["Neve al suolo",finite(station.snowHeight)?`${fmt(station.snowHeight)} cm`:null],
  ["Radiazione solare",finite(station.solarRadiation)?`${fmt(station.solarRadiation,0)} W/m²`:null]
 ];
 return `<h2 class="dialog-title">${esc(stationName(station))}</h2>
  <div class="dialog-sub">${finite(station.altitude)?`${fmt(station.altitude,0)} m · `:""}${esc(station.source||"")}<br>${measured?`Misura delle ${clock(measured)}${isStale(station)?" · dato non recente":""}`:station.updatedText?`Aggiornamento: ${esc(station.updatedText)}`:"Ora della misura non disponibile"}</div>
  ${detailRows(rows)}`;
}

function weatherData(period){
 const summary=period?.summary||{};
 const details=period?.details||{};
 const normalizedWeather=summary.weather||{};
 const sourceCode=String(normalizedWeather.source_code||period?.source?.sky_condition||"").toUpperCase();
 const needsFallback=normalizedWeather.code==="unknown"||!normalizedWeather.label_it||normalizedWeather.label_it==="Non definito";
 const fallback=period?.source?.provider==="meteo.report"&&needsFallback?METEO_REPORT_FALLBACKS[sourceCode]:null;
 return {
  weather:fallback?{...normalizedWeather,...fallback,source_code:sourceCode}:normalizedWeather,
  temperature:summary.temperature_c,
  rain:summary.precipitation_mm,
  probability:summary.precipitation_probability_pct,
  wind:details.wind_speed_avg_kmh??details.wind_speed_kmh,
  windMax:details.wind_speed_max_kmh,
  gust:details.wind_gust_max_kmh??details.wind_gust_kmh,
  direction:details.wind_direction_deg,
  temperatureMin:details.temperature_min_c,
  temperatureMax:details.temperature_max_c,
  freshSnow:details.fresh_snow,
  snowLevel:details.snow_level_m,
  freezingLevel:details.freezing_level_m,
  sunshine:details.sunshine_duration
 };
}

function periodFor(location,date,periodId){
 const target=PERIODS.find(period=>period.id===periodId);
 return (location.periods_3h||[]).find(period=>period.date===date&&String(period.start||"").slice(11,16)===target?.start)||null;
}

function forecastCard(location,period){
 const data=weatherData(period);
 const weather=data.weather;
 const wet=finite(data.rain)&&Number(data.rain)>0;
 const severe=Number(weather.severity)>=90||(finite(data.rain)&&Number(data.rain)>=5)||(finite(data.gust)&&Number(data.gust)>=70);
 const windValue=finite(data.gust)?`Raff. ${fmt(data.gust)} km/h`:finite(data.wind)?`Vento ${fmt(data.wind)} km/h`:"Vento —";
 return `<button class="forecast-point-card ${wet?"wet":""} ${severe?"severe":""}" data-location-id="${esc(location.id)}">
  <span class="forecast-point-head"><strong>${esc(location.name)}</strong></span>
  <span class="forecast-point-main">
   <span class="forecast-weather-icon">${esc(weather.icon||"🌦️")}</span>
   <span class="forecast-weather-label">${esc(weather.label_it||"Condizione n/d")}</span>
   <span class="forecast-temperature">${fmt(data.temperature)}°</span>
  </span>
  <span class="forecast-point-metrics">
   <span>☔ ${fmt(data.probability,0)}% · ${fmt(data.rain)} mm</span>
   <span>🌬️ ${esc(windValue)}</span>
  </span>
  <span class="forecast-tap">Tocca per i dettagli ›</span>
 </button>`;
}

function forecastDetail(location,period){
 const data=weatherData(period);
 const weather=data.weather;
 const range=PERIODS.find(item=>item.id===selectedPeriod)?.label||period.period;
 const rows=[
  ["Temperatura",finite(data.temperature)?`${fmt(data.temperature)} °C`:null],
  ["Min / max",finite(data.temperatureMin)||finite(data.temperatureMax)?`${fmt(data.temperatureMin)} / ${fmt(data.temperatureMax)} °C`:null],
  ["Probabilità pioggia",finite(data.probability)?`${fmt(data.probability,0)}%`:null],
  ["Precipitazioni",finite(data.rain)?`${fmt(data.rain)} mm`:null],
  ["Vento medio",finite(data.wind)?`${fmt(data.wind)} km/h`:null],
  ["Vento massimo",finite(data.windMax)?`${fmt(data.windMax)} km/h`:null],
  ["Raffica massima",finite(data.gust)?`${fmt(data.gust)} km/h`:null],
  ["Direzione vento",finite(data.direction)?`${fmt(data.direction,0)}°`:null],
  ["Neve fresca",finite(data.freshSnow)?`${fmt(data.freshSnow)} cm`:null],
  ["Quota neve",finite(data.snowLevel)?`${fmt(data.snowLevel,0)} m`:null],
  ["Zero termico",finite(data.freezingLevel)?`${fmt(data.freezingLevel,0)} m`:null],
  ["Sole",finite(data.sunshine)?`${fmt(data.sunshine)} h`:null]
 ];
 return `<h2 class="dialog-title">${esc(location.name)}</h2>
  <div class="dialog-sub">${esc(dayLabel(selectedDate))} · ${esc(range)} · previsione su punto locale</div>
  <div class="dialog-weather"><span class="dialog-weather-icon">${esc(weather.icon||"🌦️")}</span><span><strong>${esc(weather.label_it||"Condizione n/d")}</strong></span><strong class="dialog-weather-temp">${fmt(data.temperature)}°</strong></div>
  ${detailRows(rows)}`;
}

function dayLabel(dateIso){
 const [year,month,day]=String(dateIso||"").split("-").map(Number);
 if(!year)return "—";
 const date=new Date(Date.UTC(year,month-1,day,12));
 const today=localNow().slice(0,10);
 const weekday=new Intl.DateTimeFormat("it-IT",{weekday:"short",day:"numeric",timeZone:ROME}).format(date).replace(".","");
 return dateIso===today?`Oggi ${day}`:weekday.replace(/^./,char=>char.toUpperCase());
}

function availableDates(){
 return [...new Set(forecastLocations.flatMap(location=>(location.periods_3h||[]).map(period=>period.date)).filter(Boolean))].sort().slice(0,3);
}

function currentPeriodId(){
 const now=currentMinutes();
 if(now<8*60)return PERIODS[0].id;
 return PERIODS.find(period=>period.endMinutes>now)?.id||PERIODS[0].id;
}

function chooseInitialWindow(){
 const dates=availableDates();
 const today=localNow().slice(0,10);
 if(dates.includes(today)&&currentMinutes()<20*60){
  selectedDate=today;
  selectedPeriod=currentPeriodId();
 }else{
  selectedDate=dates.find(date=>date>today)||dates[0]||null;
  selectedPeriod=PERIODS[0].id;
 }
}

function renderObserved(){
 const box=$("#observed-grid");
 if(!stations.length){
  box.innerHTML='<div class="forecast-empty">Nessuna stazione disponibile per questa zona.</div>';
  return;
 }
 box.innerHTML=stations.map(stationCard).join("");
 box.querySelectorAll("[data-station-key]").forEach(button=>button.addEventListener("click",()=>{
  const station=stations.find(item=>item.key===button.dataset.stationKey);
  if(station)openDialog(stationDetail(station));
 }));
}

function renderDays(){
 const dates=availableDates();
 const box=$("#day-tabs");
 box.innerHTML=dates.map(date=>`<button class="day-tab ${date===selectedDate?"active":""}" data-date="${date}" role="tab" aria-selected="${date===selectedDate}">${esc(dayLabel(date))}</button>`).join("");
 box.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
  selectedDate=button.dataset.date;
  selectedPeriod=selectedDate===localNow().slice(0,10)&&currentMinutes()<20*60?currentPeriodId():PERIODS[0].id;
  renderForecastControls();
 }));
}

function renderPeriods(){
 const box=$("#period-tabs");
 box.innerHTML=PERIODS.map(period=>`<button class="period-tab ${period.id===selectedPeriod?"active":""}" data-period="${period.id}" role="tab" aria-selected="${period.id===selectedPeriod}">${period.label}</button>`).join("");
 box.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
  selectedPeriod=button.dataset.period;
  renderPeriods();
  renderForecast();
 }));
}

function renderForecast(){
 const box=$("#forecast-grid");
 const periodConfig=PERIODS.find(period=>period.id===selectedPeriod)||PERIODS[0];
 $("#forecast-window").textContent=`${dayLabel(selectedDate)} · ${periodConfig.label} · ${CFG.zones[selectedZone].name}`;
 const available=forecastLocations.map(location=>({location,period:periodFor(location,selectedDate,selectedPeriod)})).filter(item=>item.period);
 box.innerHTML=available.length?available.map(item=>forecastCard(item.location,item.period)).join(""):'<div class="forecast-empty">Nessuna previsione disponibile per questa fascia.</div>';
 box.querySelectorAll("[data-location-id]").forEach(button=>button.addEventListener("click",()=>{
  const location=forecastLocations.find(item=>item.id===button.dataset.locationId);
  const period=location&&periodFor(location,selectedDate,selectedPeriod);
  if(location&&period)openDialog(forecastDetail(location,period));
 }));
}

function renderForecastControls(){
 renderDays();
 renderPeriods();
 renderForecast();
}

function openDialog(html){
 $("#detail-dialog-body").innerHTML=html;
 $("#detail-dialog").showModal();
}

async function fetchJson(url){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return await response.json();
 }finally{
  clearTimeout(timeout);
 }
}

function readCachedJson(url){
 try{
  const item=JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${url}`)||"null");
  if(!item?.savedAt||!item?.data||Date.now()-item.savedAt>CACHE_MAX_AGE_MS)return null;
  return item.data;
 }catch{return null;}
}

function writeCachedJson(url,data){
 try{localStorage.setItem(`${CACHE_PREFIX}${url}`,JSON.stringify({savedAt:Date.now(),data}));}catch{}
}

function showStationCollectionTime(value){
 const kicker=$("#observed-kicker");
 kicker.textContent=value?`DATI RACCOLTI ALLE ${clock(value)}`:"DATI STAZIONI";
}

function applyStationPayload(raw,zoneConfig){
 const excluded=new Set(zoneConfig.excludeStations||[]);
 stations=(raw.zone?.stations||[]).filter(station=>!excluded.has(station.key));
 renderObserved();
 const generatedAt=raw.generated_at||raw.generatedAt||null;
 showStationCollectionTime(generatedAt);
 return generatedAt;
}

function applyForecastPayload(raw,preserveSelection=false){
 const previousDate=selectedDate;
 const previousPeriod=selectedPeriod;
 forecastLocations=raw.zone?.locations||[];
 const dates=availableDates();
 if(preserveSelection&&dates.includes(previousDate)){
  selectedDate=previousDate;
  selectedPeriod=PERIODS.some(period=>period.id===previousPeriod)?previousPeriod:PERIODS[0].id;
 }else{
  chooseInitialWindow();
 }
 if(selectedDate)renderForecastControls();
 else{
  $("#day-tabs").innerHTML="";
  $("#period-tabs").innerHTML="";
  $("#forecast-window").textContent="";
  $("#forecast-grid").innerHTML='<div class="forecast-empty">Nessuna giornata di previsione disponibile.</div>';
 }
 return raw.generated_at||null;
}

async function loadZone(zoneKey){
 const zone=CFG.zones[zoneKey]?zoneKey:"catinaccio";
 const zoneConfig=CFG.zones[zone];
 const token=++loadToken;
 selectedZone=zone;
 document.body.dataset.zone=zone;
 document.querySelectorAll(".hike-zone").forEach(button=>{
  const active=button.dataset.zone===zone;
  button.classList.toggle("active",active);
  button.setAttribute("aria-selected",active?"true":"false");
 });
 try{history.replaceState(null,"",`?zona=${zone}`);}catch{}

 const status=$("#hike-status");
 status.hidden=true;
 status.textContent="";
 status.className="worker-status";
 $("#observed-kicker").textContent="AGGIORNAMENTO STAZIONI…";
 $("#observed-grid").innerHTML='<div class="forecast-empty">Caricamento stazioni…</div>';
 $("#day-tabs").innerHTML="";
 $("#period-tabs").innerHTML="";
 $("#forecast-window").textContent="";
 $("#forecast-grid").innerHTML='<div class="forecast-empty">Caricamento previsioni…</div>';

 const stationUrl=`${CFG.stationsUrl.replace(/\/$/,"")}/zone/${zoneConfig.stationZoneId}`;
 const forecastUrl=`${CFG.forecastUrl.replace(/\/$/,"")}/zone/${zoneConfig.forecastId}`;
 const cachedStations=readCachedJson(stationUrl);
 const cachedForecast=readCachedJson(forecastUrl);
 let stationReady=false;
 let forecastReady=false;

 selectedDate=null;
 selectedPeriod=PERIODS[0].id;
 if(cachedStations){
  applyStationPayload(cachedStations,zoneConfig);
  stationReady=true;
 }
 if(cachedForecast){
  applyForecastPayload(cachedForecast);
  forecastReady=true;
 }

 const [stationResult,forecastResult]=await Promise.allSettled([fetchJson(stationUrl),fetchJson(forecastUrl)]);
 if(token!==loadToken)return;

 const refreshFailures=[];
 if(stationResult.status==="fulfilled"){
  const raw=stationResult.value;
  writeCachedJson(stationUrl,raw);
  applyStationPayload(raw,zoneConfig);
  stationReady=true;
 }else if(!stationReady){
  stations=[];
  showStationCollectionTime(null);
  $("#observed-grid").innerHTML='<div class="forecast-empty">⚠️ Dati osservati temporaneamente non disponibili.</div>';
 }else{
  refreshFailures.push("stazioni");
 }

 if(forecastResult.status==="fulfilled"){
  const raw=forecastResult.value;
  writeCachedJson(forecastUrl,raw);
  applyForecastPayload(raw,forecastReady);
  forecastReady=true;
 }else if(!forecastReady){
  forecastLocations=[];
  $("#day-tabs").innerHTML="";
  $("#period-tabs").innerHTML="";
  $("#forecast-window").textContent="";
  $("#forecast-grid").innerHTML='<div class="forecast-empty">⚠️ Previsioni temporaneamente non disponibili.</div>';
 }else{
  refreshFailures.push("previsioni");
 }

 if(!stationReady&&!forecastReady){
  status.textContent="⚠️ Dati temporaneamente non disponibili";
  status.className="worker-status error";
  status.hidden=false;
 }else if(!stationReady||!forecastReady){
  status.textContent=`${zoneConfig.name} · disponibili solo ${stationReady?"le osservazioni":"le previsioni"}`;
  status.className="worker-status error";
  status.hidden=false;
 }else if(refreshFailures.length){
  status.textContent=`${zoneConfig.name} · ultimi dati salvati, aggiornamento non riuscito`;
  status.className="worker-status";
  status.hidden=false;
 }else{
  status.textContent="";
  status.className="worker-status";
  status.hidden=true;
 }
}

function init(){
 $("#hike-zones").innerHTML=Object.entries(CFG.zones).map(([id,zone])=>`<button class="hike-zone" data-zone="${id}" role="tab" aria-selected="false"><span class="hike-zone-icon">${zone.icon}</span><strong>${esc(zone.name)}</strong></button>`).join("");
 $("#hike-zones").querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>loadZone(button.dataset.zone)));
 $(".dialog-close").addEventListener("click",()=>$("#detail-dialog").close());
 $("#detail-dialog").addEventListener("click",event=>{
  const dialog=$("#detail-dialog");
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
 });
 const requested=new URLSearchParams(location.search).get("zona")||"catinaccio";
 loadZone(requested);
}

init();
