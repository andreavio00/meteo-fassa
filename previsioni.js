(function(){
"use strict";

const CFG=window.METEO_FASSA_ON_DEMAND||{};
const REQUEST_TIMEOUT_MS=22000;
const STATIONS_TIMEOUT_MS=30000;
const STATIONS_CACHE_KEY="meteo-fassa-request-stations-v1";
const STATIONS_CACHE_MAX_AGE_MS=6*60*60*1000;

let searchController=null;
let forecastController=null;
let stationsController=null;
let searchResults=[];
let forecastPayload=null;
let selectedDate=null;
let stations=[];
let stationsLoaded=false;
let stationsLoading=false;

const $=selector=>document.querySelector(selector);
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const fmt=(value,digits=1)=>finite(value)?Number(value).toFixed(digits).replace(".",","):"—";
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function normalizeText(value){
 return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it").replace(/[^a-z0-9]+/g," ").trim();
}

function safeUrl(value){
 try{
  const url=new URL(String(value));
  return ["http:","https:"].includes(url.protocol)?url.href:null;
 }catch{return null;}
}

function kindLabel(kind){
 return ({town:"Centro abitato",pass:"Passo",point_of_interest:"Punto d’interesse",mountain:"Montagna",other:"Località"})[kind]||"Località";
}

function providerLabel(provider,model=null){
 if(provider==="meteo.report")return "Meteo.report";
 if(provider==="open-meteo")return model==="icon_d2"?"Open-Meteo · ICON-D2":"Open-Meteo";
 return "Fonte previsionale";
}

function zoneLabel(zone){
 const entry=Object.values(window.METEO_FASSA_TRIPS?.zones||{}).find(item=>item.stationZoneId===zone||item.forecastId===zone);
 return entry?.name||String(zone||"").replaceAll("_"," ");
}

function localNow(timeZone="Europe/Rome"){
 try{
  return new Intl.DateTimeFormat("sv-SE",{
   timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).format(new Date()).replace(" ","T");
 }catch{
  if(timeZone!=="Europe/Rome")return localNow("Europe/Rome");
  return new Date().toISOString().slice(0,16);
 }
}

function dayLabel(dateIso,timeZone="Europe/Rome"){
 const [year,month,day]=String(dateIso||"").split("-").map(Number);
 if(!year)return "—";
 const date=new Date(Date.UTC(year,month-1,day,12));
 const today=localNow(timeZone).slice(0,10);
 const tomorrowDate=new Date(`${today}T12:00:00Z`);
 tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);
 const tomorrow=tomorrowDate.toISOString().slice(0,10);
 const formatted=new Intl.DateTimeFormat("it-IT",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"}).format(date).replaceAll(".","");
 if(dateIso===today)return `Oggi · ${formatted}`;
 if(dateIso===tomorrow)return `Domani · ${formatted}`;
 return formatted.replace(/^./,char=>char.toUpperCase());
}

function formattedUpdate(value,timeZone="Europe/Rome"){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "Aggiornamento automatico";
 try{
  return `Aggiornata alle ${new Intl.DateTimeFormat("it-IT",{timeZone,hour:"2-digit",minute:"2-digit"}).format(date)}`;
 }catch{return "Aggiornamento automatico";}
}

function clock(value,timeZone="Europe/Rome"){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 try{return new Intl.DateTimeFormat("it-IT",{timeZone,hour:"2-digit",minute:"2-digit"}).format(date);}
 catch{return null;}
}

async function fetchJson(url,{signal,timeoutMs=REQUEST_TIMEOUT_MS}={}){
 const timeoutController=new AbortController();
 const timeout=setTimeout(()=>timeoutController.abort("timeout"),timeoutMs);
 const abort=()=>timeoutController.abort("cancelled");
 if(signal)signal.addEventListener("abort",abort,{once:true});
 try{
  const response=await fetch(url,{signal:timeoutController.signal,headers:{Accept:"application/json"}});
  let body=null;
  try{body=await response.json();}catch{}
  if(!response.ok||body?.ok===false){
   const error=new Error(body?.error?.message||`Servizio non disponibile (HTTP ${response.status}).`);
   error.code=body?.error?.code||`HTTP_${response.status}`;
   error.retryable=Boolean(body?.error?.retryable);
   throw error;
  }
  return body;
 }catch(error){
  if(timeoutController.signal.reason==="timeout"){
   const timeoutError=new Error("Il servizio sta impiegando troppo tempo. Riprova tra poco.");
   timeoutError.code="TIMEOUT";
   timeoutError.retryable=true;
   throw timeoutError;
  }
  if(signal?.aborted){
   const cancelled=new Error("Richiesta annullata.");
   cancelled.name="AbortError";
   throw cancelled;
  }
  throw error;
 }finally{
  clearTimeout(timeout);
  if(signal)signal.removeEventListener("abort",abort);
 }
}

function workerUrl(path){
 const base=String(CFG.workerUrl||"").replace(/\/+$/,"");
 if(!base)throw new Error("Il Worker delle previsioni su richiesta non è configurato.");
 return `${base}${path}`;
}

function stationsUrl(){
 const base=String(CFG.stationsUrl||window.METEO_FASSA_TRIPS?.stationsUrl||"").replace(/\/+$/,"");
 if(!base)throw new Error("Il Worker delle stazioni non è configurato.");
 return `${base}/`;
}

function setSearchStatus(message,type=""){
 const status=$("#search-status");
 status.textContent=message;
 status.className=`request-status${type?` ${type}`:""}`;
}

function renderAttributions(target,items){
 const unique=[];
 const seen=new Set();
 for(const item of Array.isArray(items)?items:[]){
  const href=safeUrl(item?.url);
  const name=String(item?.name||"").trim();
  if(!href||!name||seen.has(href))continue;
  seen.add(href);
  unique.push(`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`);
 }
 target.innerHTML=unique.length?`Fonti: ${unique.join(" · ")}`:"";
}

function resultCard(item,index){
 const providerClass=item.preferred_forecast_provider==="meteo.report"?"meteoreport":"openmeteo";
 const elevation=finite(item.elevation_m)?`${fmt(item.elevation_m,0)} m`:"Quota n/d";
 return `<button type="button" class="place-result" data-result-index="${index}">
  <span class="place-result-head"><strong>${esc(item.name)}</strong><span class="place-provider ${providerClass}">${esc(providerLabel(item.preferred_forecast_provider))}</span></span>
  <span class="place-result-context">${esc(item.context||"Dolomiti / Euregio")}</span>
  <span class="place-result-meta"><span>${esc(kindLabel(item.kind))}</span><span>${esc(elevation)}</span><strong class="place-result-action">Previsione ›</strong></span>
 </button>`;
}

function renderSearchResults(payload){
 searchResults=Array.isArray(payload?.results)?payload.results:[];
 const wrap=$("#search-results-wrap");
 const box=$("#search-results");
 box.innerHTML=searchResults.map(resultCard).join("");
 wrap.hidden=false;
 renderAttributions($("#search-attributions"),payload?.attributions);
 box.querySelectorAll("[data-result-index]").forEach(button=>button.addEventListener("click",()=>{
  const item=searchResults[Number(button.dataset.resultIndex)];
  if(item)loadForecast(item,button);
 }));
 const warnings=Array.isArray(payload?.warnings)?payload.warnings.length:0;
 setSearchStatus(
  warnings
   ?`${searchResults.length} ${searchResults.length===1?"risultato":"risultati"}. Una fonte di ricerca non ha risposto.`
   :`${searchResults.length} ${searchResults.length===1?"risultato trovato":"risultati trovati"}.`,
  "ok"
 );
}

async function submitSearch(){
 const input=$("#place-query");
 const query=input.value.trim().replace(/\s+/g," ");
 if(query.length<2){
  setSearchStatus("Inserisci almeno due caratteri.","error");
  input.focus();
  return;
 }

 searchController?.abort();
 forecastController?.abort();
 const controller=new AbortController();
 searchController=controller;
 searchResults=[];
 $("#search-results-wrap").hidden=true;
 $("#search-results").innerHTML="";
 $("#requested-forecast").hidden=true;
 $("#forecast-content").hidden=true;
 $("#forecast-error").hidden=true;
 const submit=$("#place-search-button");
 submit.disabled=true;
 setSearchStatus(`Cerco “${query}”…`,"loading");

 try{
  const url=new URL(workerUrl("/search"));
  url.searchParams.set("q",query);
  url.searchParams.set("limit","8");
  const payload=await fetchJson(url.toString(),{signal:controller.signal});
  renderSearchResults(payload);
 }catch(error){
  if(error.name!=="AbortError"){
   setSearchStatus(error.message||"Ricerca temporaneamente non disponibile.","error");
  }
 }finally{
  if(searchController===controller)submit.disabled=false;
 }
}

function weatherData(period){
 const summary=period?.summary||{};
 const details=period?.details||{};
 return {
  weather:summary.weather||{},
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

function periodLabel(period){
 const start=String(period?.start||"").slice(11,16);
 const end=String(period?.end||"").slice(11,16);
 return start&&end?`${start.replace(":00","")}–${end.replace(":00","")}`:String(period?.period||"Fascia").replace("-","–");
}

function periodCard(period,index){
 const data=weatherData(period);
 const weather=data.weather;
 const wet=finite(data.rain)&&Number(data.rain)>0;
 const severe=Number(weather.severity)>=90||(finite(data.rain)&&Number(data.rain)>=5)||(finite(data.gust)&&Number(data.gust)>=70);
 const wind=finite(data.gust)?`Raff. ${fmt(data.gust)} km/h`:finite(data.wind)?`Vento ${fmt(data.wind)} km/h`:"Vento —";
 return `<button type="button" class="request-period-card ${wet?"wet":""} ${severe?"severe":""}" data-period-index="${index}">
  <span class="request-period-time">${esc(periodLabel(period))}</span>
  <span class="request-period-weather"><span class="request-weather-icon">${esc(weather.icon||"🌦️")}</span><span class="request-weather-label">${esc(weather.label_it||"Condizione n/d")}</span></span>
  <strong class="request-period-temp">${fmt(data.temperature)}°</strong>
  <span class="request-period-metrics"><span>☔ ${fmt(data.probability,0)}% · ${fmt(data.rain)} mm</span><span>🌬️ ${esc(wind)}</span></span>
  <span class="request-period-more">Dettagli ›</span>
 </button>`;
}

function visibleForecastPeriods(payload=forecastPayload){
 const place=payload?.location||{};
 const now=localNow(place.timezone||"Europe/Rome");
 return (place.periods_3h||[]).filter(period=>{
  const end=String(period?.end||"").slice(0,16);
  return Boolean(end)&&end>now;
 });
}

function availableDates(){
 return [...new Set(visibleForecastPeriods().map(period=>period.date).filter(Boolean))].sort();
}

function chooseInitialDate(){
 const dates=availableDates();
 const timezone=forecastPayload?.location?.timezone||"Europe/Rome";
 const today=localNow(timezone).slice(0,10);
 const hour=Number(localNow(timezone).slice(11,13));
 selectedDate=dates.includes(today)&&hour<20?today:dates.find(date=>date>today)||dates[0]||null;
}

function renderForecastDays(){
 const dates=availableDates();
 const timezone=forecastPayload?.location?.timezone||"Europe/Rome";
 const box=$("#request-day-tabs");
 box.innerHTML=dates.map(date=>`<button type="button" class="request-day-tab ${date===selectedDate?"active":""}" data-date="${esc(date)}" role="tab" aria-selected="${date===selectedDate}">${esc(dayLabel(date,timezone))}</button>`).join("");
 box.querySelectorAll("[data-date]").forEach(button=>button.addEventListener("click",()=>{
  selectedDate=button.dataset.date;
  renderForecastDays();
  renderForecastPeriods();
 }));
}

function renderForecastPeriods(){
 const all=visibleForecastPeriods();
 const periods=all.filter(period=>period.date===selectedDate);
 const box=$("#request-period-grid");
 box.innerHTML=periods.length?periods.map(periodCard).join(""):'<div class="request-period-empty">Nessuna fascia completa disponibile per questo giorno.</div>';
 box.querySelectorAll("[data-period-index]").forEach(button=>button.addEventListener("click",()=>{
  const period=periods[Number(button.dataset.periodIndex)];
  if(period)openForecastDetail(period);
 }));
}

function renderForecast(payload){
 forecastPayload=payload;
 const place=payload.location||{};
 const source=payload.source||{};
 $("#forecast-kind").textContent=kindLabel(place.kind);
 $("#requested-forecast-title").textContent=place.name||"Previsione";
 $("#forecast-context").textContent=place.context||"Dolomiti / Euregio";
 $("#forecast-elevation").textContent=finite(place.elevation_m)?`${fmt(place.elevation_m,0)} m`:"Quota n/d";

 const reference=$("#forecast-reference");
 const target=place.forecast_location;
 if(target?.name&&normalizeText(target.name)!==normalizeText(place.name)){
  const distance=finite(target.distance_km)?` · ${fmt(target.distance_km)} km dal punto scelto`:"";
  reference.textContent=`Previsione Meteo.report riferita a ${target.name}${distance}.`;
  reference.hidden=false;
 }else reference.hidden=true;

 const fallback=$("#forecast-fallback");
 if(source.fallback){
  fallback.textContent="Meteo.report non era disponibile: previsione sostitutiva ICON-D2 calcolata sulle coordinate della località scelta.";
  fallback.hidden=false;
 }else fallback.hidden=true;

 const sourceBadge=$("#forecast-source");
 sourceBadge.textContent=providerLabel(source.provider,source.model);
 sourceBadge.className=`forecast-source${source.provider==="meteo.report"?" meteoreport":""}`;
 $("#forecast-updated").textContent=formattedUpdate(payload.generated_at,place.timezone);
 renderAttributions($("#forecast-attributions"),payload.attributions);
 chooseInitialDate();
 renderForecastDays();
 renderForecastPeriods();
}

async function loadForecast(item,button){
 forecastController?.abort();
 forecastController=new AbortController();
 $("#search-results").querySelectorAll(".place-result").forEach(result=>result.classList.toggle("selected",result===button));
 const section=$("#requested-forecast");
 const loading=$("#forecast-loading");
 const content=$("#forecast-content");
 const errorBox=$("#forecast-error");
 section.hidden=false;
 loading.hidden=false;
 content.hidden=true;
 errorBox.hidden=true;
 errorBox.textContent="";
 section.scrollIntoView({behavior:"smooth",block:"start"});

 try{
  const url=new URL(workerUrl("/forecast"));
  url.searchParams.set("id",item.id);
  const payload=await fetchJson(url.toString(),{signal:forecastController.signal});
  if(!visibleForecastPeriods(payload).length){
   throw new Error("La fonte non ha restituito fasce attuali o future complete.");
  }
  renderForecast(payload);
  loading.hidden=true;
  content.hidden=false;
 }catch(error){
  if(error.name!=="AbortError"){
   loading.hidden=true;
   errorBox.textContent=error.message||"Previsione temporaneamente non disponibile.";
   errorBox.hidden=false;
  }
 }
}

function detailRows(rows){
 const content=rows.filter(([,value])=>value!==null&&value!==undefined&&value!=="");
 return `<div class="request-dialog-grid">${content.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div>`;
}

function openForecastDetail(period){
 const place=forecastPayload?.location||{};
 const data=weatherData(period);
 const weather=data.weather;
 const range=periodLabel(period);
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
 const timezone=place.timezone||"Europe/Rome";
 openDialog(`<h2 class="request-dialog-title">${esc(place.name||"Previsione")}</h2>
  <div class="request-dialog-sub">${esc(dayLabel(period.date,timezone))} · ${esc(range)}</div>
  <div class="request-dialog-weather"><span class="request-dialog-weather-icon">${esc(weather.icon||"🌦️")}</span><span><strong>${esc(weather.label_it||"Condizione n/d")}</strong></span><strong class="request-dialog-weather-temp">${fmt(data.temperature)}°</strong></div>
  ${detailRows(rows)}`);
}

function stationMeasureTime(station){
 return station.updated||station.temperatureAt||station.windAt||station.precipitationAt||station.fetchedAt||null;
}

function stationRain(station){
 if(finite(station.rainRate))return `${fmt(station.rainRate)} mm/h`;
 if(finite(station.precipitation))return `${fmt(station.precipitation)} mm`;
 if(finite(station.rainToday))return `${fmt(station.rainToday)} mm oggi`;
 return null;
}

function stationCard(station,index){
 const online=station.status==="online";
 const metrics=[];
 if(finite(station.wind))metrics.push(`<span>💨 ${fmt(station.wind)} km/h</span>`);
 if(finite(station.windGust))metrics.push(`<span>🌬️ ${fmt(station.windGust)} km/h</span>`);
 const rain=stationRain(station);
 if(rain)metrics.push(`<span>🌧️ ${esc(rain)}</span>`);
 const measured=clock(stationMeasureTime(station));
 const update=measured?`Misura delle ${measured}`:station.updatedText?`Agg. ${station.updatedText}`:"Ora non disponibile";
 return `<button type="button" class="all-station-card ${online?"":"offline"}" data-station-index="${index}">
  <span class="all-station-head"><strong>${esc(station.name||station.id||"Stazione")}</strong><small>${finite(station.altitude)?`${fmt(station.altitude,0)} m`:"Quota n/d"}</small></span>
  <span class="all-station-temp">${online?`${fmt(station.temperature)}°`:"—"}</span>
  <span class="all-station-metrics">${metrics.join("")||"<span>Dati essenziali n/d</span>"}</span>
  <span class="all-station-time">${online?esc(update):"Dati non disponibili"} · ${esc(station.source||station.family||"")}</span>
 </button>`;
}

function filteredStations(){
 const query=normalizeText($("#station-filter").value);
 if(!query)return stations;
 return stations.filter(station=>normalizeText([
  station.name,station.id,station.source,station.family,...(station.zones||[]).map(zoneLabel)
 ].join(" ")).includes(query));
}

function renderStations(){
 const box=$("#all-stations-grid");
 const visible=filteredStations();
 box.innerHTML=visible.length?visible.map(station=>stationCard(station,stations.indexOf(station))).join(""):'<div class="request-period-empty">Nessuna stazione corrisponde al filtro.</div>';
 box.querySelectorAll("[data-station-index]").forEach(button=>button.addEventListener("click",()=>{
  const station=stations[Number(button.dataset.stationIndex)];
  if(station)openStationDetail(station);
 }));
}

function applyStations(payload,fromCache=false){
 stations=(Array.isArray(payload?.stations)?payload.stations:[]).sort((first,second)=>String(first.name||"").localeCompare(String(second.name||""),"it"));
 if(!stations.length)throw new Error("Il servizio non ha restituito stazioni.");
 $("#station-filter-wrap").hidden=false;
 renderStations();
 const online=stations.filter(station=>station.status==="online").length;
 const status=$("#stations-status");
 status.textContent=fromCache
  ?`${stations.length} stazioni salvate sul dispositivo; provo ad aggiornarle…`
  :`${stations.length} stazioni disponibili · ${online} online.`;
 status.className=`request-status ${fromCache?"loading":"ok"}`;
}

function readStationsCache(){
 try{
  const cached=JSON.parse(localStorage.getItem(STATIONS_CACHE_KEY)||"null");
  if(!cached?.savedAt||!cached?.payload||Date.now()-cached.savedAt>STATIONS_CACHE_MAX_AGE_MS)return null;
  return cached.payload;
 }catch{return null;}
}

function writeStationsCache(payload){
 try{localStorage.setItem(STATIONS_CACHE_KEY,JSON.stringify({savedAt:Date.now(),payload}));}catch{}
}

async function loadStations(){
 if(stationsLoading||stationsLoaded)return;
 stationsLoading=true;
 const cached=readStationsCache();
 if(cached){
  try{applyStations(cached,true);stationsLoaded=true;}catch{}
 }else{
  const status=$("#stations-status");
  status.textContent="Carico l’elenco completo delle stazioni…";
  status.className="request-status loading";
 }

 stationsController?.abort();
 stationsController=new AbortController();
 try{
  const payload=await fetchJson(stationsUrl(),{signal:stationsController.signal,timeoutMs:STATIONS_TIMEOUT_MS});
  applyStations(payload,false);
  writeStationsCache(payload);
  stationsLoaded=true;
 }catch(error){
  if(error.name!=="AbortError"){
   stationsLoaded=false;
   const status=$("#stations-status");
   status.textContent=stations.length
    ?"Aggiornamento non riuscito: sono mostrati gli ultimi dati salvati."
    :(error.message||"Stazioni temporaneamente non disponibili.");
   status.className=`request-status ${stations.length?"loading":"error"}`;
  }
 }finally{stationsLoading=false;}
}

function openStationDetail(station){
 const rain=stationRain(station);
 const measured=clock(stationMeasureTime(station));
 const zones=(station.zones||[]).map(zoneLabel).filter(Boolean).join(" · ");
 const rows=[
  ["Temperatura",finite(station.temperature)?`${fmt(station.temperature)} °C`:null],
  ["Min / max",finite(station.temperatureMin)||finite(station.temperatureMax)?`${fmt(station.temperatureMin)} / ${fmt(station.temperatureMax)} °C`:null],
  ["Percepita",finite(station.feelsLike)?`${fmt(station.feelsLike)} °C`:null],
  ["Umidità",finite(station.humidity)?`${fmt(station.humidity,0)}%`:null],
  ["Pressione",finite(station.pressure)?`${fmt(station.pressure)} hPa`:null],
  ["Vento",finite(station.wind)?`${fmt(station.wind)} km/h${station.windDirection?` ${station.windDirection}`:""}`:null],
  ["Raffica",finite(station.windGust)?`${fmt(station.windGust)} km/h`:null],
  ["Pioggia",rain],
  ["Neve al suolo",finite(station.snowHeight)?`${fmt(station.snowHeight)} cm`:null],
  ["Radiazione solare",finite(station.solarRadiation)?`${fmt(station.solarRadiation,0)} W/m²`:null]
 ];
 const source=safeUrl(station.sourceUrl);
 openDialog(`<h2 class="request-dialog-title">${esc(station.name||station.id||"Stazione")}</h2>
  <div class="request-dialog-sub">${finite(station.altitude)?`${fmt(station.altitude,0)} m · `:""}${esc(station.source||station.family||"")}${zones?`<br>${esc(zones)}`:""}${measured?`<br>Misura delle ${esc(measured)}`:""}</div>
  ${detailRows(rows)}
  ${source?`<a class="request-dialog-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">🌐 Apri il sito della fonte ↗</a>`:""}`);
}

function openDialog(html){
 const dialog=$("#request-dialog");
 $("#request-dialog-body").innerHTML=html;
 if(typeof dialog.showModal==="function")dialog.showModal();
}

function init(){
 const form=$("#place-search");
 form.addEventListener("submit",event=>{event.preventDefault();submitSearch();});
 $("#place-query").addEventListener("input",()=>{
  if($("#search-status").classList.contains("error"))setSearchStatus("");
 });
 document.querySelectorAll("[data-example]").forEach(button=>button.addEventListener("click",()=>{
  $("#place-query").value=button.dataset.example;
  form.requestSubmit();
 }));
 $("#all-stations").addEventListener("toggle",event=>{
  if(event.currentTarget.open)loadStations();
 });
 $("#station-filter").addEventListener("input",renderStations);
 $("#request-dialog-close").addEventListener("click",()=>$("#request-dialog").close());
 $("#request-dialog").addEventListener("click",event=>{
  const dialog=event.currentTarget;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
 });

 const prefill=new URLSearchParams(location.search).get("q");
 if(prefill)$("#place-query").value=prefill.slice(0,100);
}

init();
})();
