(function(){
"use strict";

const MAIN_URL="https://meteomoena-stazioni.andrea-vio.workers.dev/stations";
const AMATEUR_URL="https://meteomoena-amatoriali.andrea-vio.workers.dev/stations";
const FORECAST_URL="https://meteomoena-previsioni.andrea-vio.workers.dev/forecast";
const CACHE_MAX_AGE=6*60*60*1000;
const MAIN_CACHE_KEY="meteo-fassa-moena-main-v1";
const AMATEUR_CACHE_KEY="meteo-fassa-moena-amateurs-v1";
const FORECAST_CACHE_KEY="meteo-fassa-moena-forecast-v1";
const stationStore=new Map();
const loadState={main:"loading",amateur:"loading"};
let mainPayload=null;
let amateurPayload=null;
let forecastDays=[];
let selectedForecastDate=null;

const WEATHER={
 A:["Sereno","☀️"],B:["Poco nuvoloso","🌤️"],C:["Parzialmente nuvoloso","⛅"],D:["Nuvoloso","☁️"],E:["Molto nuvoloso","☁️"],
 F:["Rovesci","🌦️"],G:["Rovesci forti","🌧️"],H:["Pioggia moderata","🌧️"],I:["Pioggia forte","🌧️"],J:["Pioggia debole","🌦️"],K:["Rovesci deboli","🌦️"],
 L:["Neve debole e sole","🌨️"],M:["Neve e sole","🌨️"],N:["Neve debole","🌨️"],O:["Neve moderata","🌨️"],P:["Neve forte","🌨️"],Q:["Neve bagnata e sole","🌨️"],R:["Neve bagnata","🌨️"],
 S:["Foschia","🌫️"],T:["Foschia in quota","🌫️"],U:["Instabile","🌦️"],V:["Temporali","⛈️"],W:["Instabile con neve bagnata","🌨️"],X:["Temporali di neve bagnata","⛈️"],Y:["Temporali nevosi","⛈️"],Z:["Temporali nevosi","⛈️"]
};

const $=selector=>document.querySelector(selector);
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const number=(value,digits=1)=>finite(value)?new Intl.NumberFormat("it-IT",{minimumFractionDigits:0,maximumFractionDigits:digits}).format(Number(value)):"—";

function safeUrl(value){
 try{const url=new URL(value,location.href);return ["http:","https:"].includes(url.protocol)?url.href:null;}catch{return null;}
}

function readCache(key){
 try{
  const item=JSON.parse(localStorage.getItem(key)||"null");
  if(!item?.savedAt||!item.data||Date.now()-item.savedAt>CACHE_MAX_AGE)return null;
  return item.data;
 }catch{return null;}
}
function writeCache(key,data){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}}

async function fetchJson(url,timeout=20000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return await response.json();
 }finally{clearTimeout(timer);}
}

function timestamp(station){
 const raw=station?.updatedAtIso??station?.updatedAt;
 if(raw===null||raw===undefined||raw==="")return null;
 const numeric=Number(raw);
 const date=Number.isFinite(numeric)?new Date(numeric<1e12?numeric*1000:numeric):new Date(raw);
 return Number.isNaN(date.getTime())?null:date;
}
function clock(value){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return "—";
 return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(date);
}
function dayTime(value){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return "—";
 return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
}
function freshness(station){
 if(!stationHasData(station))return {className:"offline",label:"Dati non disponibili",short:"Non disponibile"};
 const date=timestamp(station);
 const age=date?Math.max(0,Math.round((Date.now()-date.getTime())/60000)):null;
 if(station.stale||station.status==="stale"||age===null||age>120)return {className:"old",label:`Ultimo dato disponibile${date?` · ${clock(date)}`:""}`,short:date?`Ultimo dato ${clock(date)}`:"Ultimo dato"};
 if(age>20)return {className:"warning",label:`Rilevato alle ${clock(date)} · ${age} min fa`,short:`${clock(date)} · ${age} min fa`};
 return {className:"fresh",label:`Rilevato alle ${clock(date)}`,short:`${clock(date)}`};
}
function stationHasData(station){
 return Boolean(station)&&[station.temperature,station.humidity,station.pressure,station.wind,station.rainToday].some(finite);
}
function sourceShort(station){return /underground/i.test(station?.source||"")?"Weather Underground":station?.source||"Stazione locale";}
function windDirection(station){
 if(station?.windDirectionText)return station.windDirectionText;
 if(!finite(station?.windDirection))return "";
 const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
 return labels[Math.round((((Number(station.windDirection)%360)+360)%360)/22.5)%16];
}

function metric(icon,label,value){
 if(!value)return "";
 return `<span class="moena-metric-pill"><span aria-hidden="true">${icon}</span><span>${esc(label)} <strong>${esc(value)}</strong></span></span>`;
}
function footer(station){
 const info=freshness(station);
 return `<div class="moena-card-footer"><span class="moena-freshness ${info.className}"><span class="moena-freshness-dot"></span>${esc(info.label)}</span><span class="moena-detail-cue">Dettagli →</span></div>`;
}

function mainMetrics(station,compact=false){
 const values=[];
 if(finite(station.temperatureMin)||finite(station.temperatureMax))values.push(metric("↕️","Min / max",`${number(station.temperatureMin)}° / ${number(station.temperatureMax)}°`));
 if(finite(station.humidity))values.push(metric("💧","Umidità",`${number(station.humidity,0)}%`));
 if(finite(station.pressure))values.push(metric("◉","Pressione",`${number(station.pressure)} hPa`));
 if(finite(station.rainToday))values.push(metric("☔","Pioggia oggi",`${number(station.rainToday)} mm`));
 if(!compact&&finite(station.wind))values.push(metric("💨","Vento",`${number(station.wind)} km/h`));
 return values.join("");
}

function officialCard(station){
 if(!station)return `<article class="station-card moena-loading-card">⚠️ Stazione ufficiale momentaneamente non disponibile.</article>`;
 stationStore.set(station.id,station);
 const time=timestamp(station);
 return `<article class="station-card moena-card moena-official-card" data-station-id="${esc(station.id)}" tabindex="0" role="button" aria-label="Dettagli ${esc(station.fullName||station.name)}">
  <div class="moena-card-head">
   <div class="moena-card-title"><span class="moena-card-icon" aria-hidden="true">🏞️</span><span><strong>${esc(station.name)}</strong><small>${finite(station.altitude)?`${number(station.altitude,0)} m · `:""}${esc(station.sourceName||station.source)}</small></span></div>
   <span class="moena-station-badge">UFFICIALE · METEOTRENTINO</span>
  </div>
  <div class="moena-official-reading"><div class="moena-temperature">${number(station.temperature)}°<small>C</small></div><div class="moena-station-time">Ultima misura<strong>${time?dayTime(time):"—"}</strong></div></div>
  <div class="moena-quick-metrics">${mainMetrics(station)}</div>
  ${footer(station)}
 </article>`;
}

function referenceCard(station){
 if(!station)return "";
 stationStore.set(station.id,station);
 return `<article class="station-card moena-card moena-reference-card" data-station-id="${esc(station.id)}" tabindex="0" role="button" aria-label="Dettagli ${esc(station.fullName||station.name)}">
  <div class="moena-card-head">
   <div class="moena-card-title"><span class="moena-card-icon" aria-hidden="true">📍</span><span><strong>${esc(station.name)}</strong><small>${finite(station.altitude)?`${number(station.altitude,0)} m · `:""}${esc(station.source)}</small></span></div>
   <span class="moena-station-badge reference">RIFERIMENTO</span>
  </div>
  <div class="moena-reference-main"><div class="moena-temperature">${number(station.temperature)}°</div>${finite(station.humidity)?`<div class="moena-reference-humidity">💧 ${number(station.humidity,0)}%</div>`:""}</div>
  <div class="moena-quick-metrics">${mainMetrics(station,true)}</div>
  ${footer(station)}
 </article>`;
}

function renderMain(payload){
 const stations=Array.isArray(payload?.stations)?payload.stations:[];
 const official=stations.find(station=>station.category==="official"||station.id==="moena-diga-pezze");
 const references=stations.filter(station=>station!==official);
 $("#moena-official").innerHTML=officialCard(official);
 $("#moena-references").innerHTML=references.length?references.map(referenceCard).join(""):`<article class="station-card moena-loading-card">Riferimenti locali momentaneamente non disponibili.</article>`;
 attachStationHandlers($("#moena-official"));
 attachStationHandlers($("#moena-references"));
}

function amateurCard(station){
 stationStore.set(station.id,station);
 const info=freshness(station);
 const source=/underground/i.test(station.source||"")?"WU":station.source||"Amatoriale";
 return `<article class="moena-amateur-card" data-station-id="${esc(station.id)}" tabindex="0" role="button" aria-label="Dettagli stazione amatoriale ${esc(station.name)}">
  <div class="moena-amateur-top"><div class="moena-amateur-title"><strong>${esc(station.name)}</strong><small>${esc(source)}</small></div><span class="moena-amateur-state ${info.className==="fresh"?"":info.className==="warning"?"warning":"offline"}" aria-label="${esc(info.label)}"></span></div>
  <div class="moena-amateur-value">${number(station.temperature)}°</div>
  <div class="moena-amateur-humidity">${finite(station.humidity)?`💧 ${number(station.humidity,0)}%`:stationHasData(station)?"Umidità non disponibile":"Dati non disponibili"}</div>
  <div class="moena-amateur-updated">${esc(info.short)}</div>
 </article>`;
}
function renderAmateurs(payload){
 const stations=Array.isArray(payload?.stations)?payload.stations:[];
 const track=$("#moena-amateur-track");
 track.innerHTML=stations.length?stations.map(amateurCard).join(""):`<article class="moena-amateur-card">⚠️ Dati momentaneamente non disponibili.</article>`;
 const available=stations.filter(stationHasData).length;
 $("#moena-amateur-summary").textContent=stations.length?`${available} di ${stations.length} con un dato disponibile`:"Dati momentaneamente non disponibili";
 attachStationHandlers(track);
}

function attachStationHandlers(root){
 root?.querySelectorAll("[data-station-id]").forEach(card=>{
  const open=()=>openStation(card.dataset.stationId);
  card.addEventListener("click",open);
  card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});
 });
}

function mergeStations(fresh,cached){
 if(!Array.isArray(fresh?.stations))return fresh;
 const old=new Map((cached?.stations||[]).map(station=>[station.id,station]));
 const stations=fresh.stations.map(station=>{
  if(stationHasData(station))return station;
  const previous=old.get(station.id);
  if(!stationHasData(previous))return station;
  return {...previous,status:"stale",stale:true,error:station.error||previous.error,warnings:[...(previous.warnings||[]),"Il nuovo aggiornamento non è riuscito: è mostrato l’ultimo dato salvato."]};
 });
 return {...fresh,stations,count:stations.length,online:stations.filter(station=>station.status==="online").length,partial:stations.some(station=>station.status!=="online")};
}

function updateMainStatus(){
 const box=$("#moena-worker-status");
 if(loadState.main==="loading"){
  box.textContent="Aggiornamento stazioni principali…";box.className="worker-status";return;
 }
 if(loadState.main==="error"){
  box.textContent="⚠️ Stazioni principali non disponibili";box.className="worker-status error";return;
 }
 if(loadState.amateur==="loading"){
  box.textContent="Stazioni principali aggiornate · amatoriali in arrivo…";box.className="worker-status ok";return;
 }
 const mainAvailable=(mainPayload?.stations||[]).filter(stationHasData).length;
 const amateurAvailable=(amateurPayload?.stations||[]).filter(stationHasData).length;
 const generated=mainPayload?.generatedAt||mainPayload?.fetchedAt;
 const suffix=generated?` · ${clock(generated)}`:"";
 box.textContent=`${mainAvailable} riferimenti · ${amateurAvailable} amatoriali${suffix}`;
 box.className=`worker-status ${mainAvailable?"ok":"error"}`;
}

async function loadStationGroup(kind,url,key,renderer){
 const cached=readCache(key);
 if(cached){
  if(kind==="main")mainPayload=cached;else amateurPayload=cached;
  loadState[kind]="cached";renderer(cached);updateMainStatus();
 }
 try{
  const raw=await fetchJson(url);
  if(!raw?.ok||!Array.isArray(raw.stations))throw new Error("Formato dati inatteso");
  const merged=mergeStations(raw,cached);
  if(kind==="main")mainPayload=merged;else amateurPayload=merged;
  loadState[kind]="fresh";writeCache(key,merged);renderer(merged);
 }catch(error){
  console.warn(`Moena ${kind}:`,error);
  loadState[kind]=cached?"cached":"error";
  if(!cached)renderer(null);
 }finally{updateMainStatus();}
}

function modalRow(label,value){return value?`<div class="moena-modal-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`:"";}
function openStation(id){
 const station=stationStore.get(id);
 if(!station)return;
 const values=[
  ["Temperatura",finite(station.temperature)?`${number(station.temperature)} °C`:null],
  ["Minima / massima",finite(station.temperatureMin)||finite(station.temperatureMax)?`${number(station.temperatureMin)} / ${number(station.temperatureMax)} °C`:null],
  ["Percepita",finite(station.windChill)?`${number(station.windChill)} °C`:finite(station.feelsLike)?`${number(station.feelsLike)} °C`:null],
  ["Umidità",finite(station.humidity)?`${number(station.humidity,0)}%`:null],
  ["Punto di rugiada",finite(station.dewPoint)?`${number(station.dewPoint)} °C`:null],
  ["Pressione",finite(station.pressure)?`${number(station.pressure)} hPa`:null],
  ["Vento",finite(station.wind)?`${number(station.wind)} km/h${windDirection(station)?` · ${windDirection(station)}`:""}`:null],
  ["Raffica",finite(station.windGust)?`${number(station.windGust)} km/h`:null],
  ["Pioggia oggi",finite(station.rainToday)?`${number(station.rainToday)} mm`:null],
  ["Intensità pioggia",finite(station.rainRate)?`${number(station.rainRate)} mm/h`:null],
  ["Radiazione solare",finite(station.solarRadiation)?`${number(station.solarRadiation,0)} W/m²`:null],
  ["Indice UV",finite(station.uvIndex)?number(station.uvIndex):null]
 ];
 const coordinates=finite(station.latitude)&&finite(station.longitude);
 const mapUrl=coordinates?`https://www.openstreetmap.org/?mlat=${encodeURIComponent(station.latitude)}&mlon=${encodeURIComponent(station.longitude)}#map=16/${encodeURIComponent(station.latitude)}/${encodeURIComponent(station.longitude)}`:null;
 const source=safeUrl(station.sourceUrl);
 const info=freshness(station);
 const notes=[...(station.warnings||[])];
 if(station.stale||station.status==="stale")notes.push("È mostrato l’ultimo dato disponibile: l’aggiornamento più recente della fonte non è riuscito.");
 openModal(`<div class="moena-modal-head"><h2>${esc(station.fullName||station.name)}</h2><p>${finite(station.altitude)?`${number(station.altitude,0)} m · `:""}${esc(sourceShort(station))}${station.notice?` · ${esc(station.notice)}`:""}</p></div>
  <div class="moena-modal-temp">${number(station.temperature)}°</div>
  <div class="moena-freshness ${info.className}"><span class="moena-freshness-dot"></span>${esc(info.label)}</div>
  <div class="moena-modal-grid">${values.map(([label,value])=>modalRow(label,value)).join("")}</div>
  ${coordinates?`<a class="moena-coordinate-link" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">📍</span><span>${number(Math.abs(station.latitude),5)}° ${station.latitude>=0?"N":"S"} · ${number(Math.abs(station.longitude),5)}° ${station.longitude>=0?"E":"O"}${station.coordinatesApproximate?" · posizione indicativa":""} ↗</span></a>`:""}
  ${notes.length?`<div class="moena-modal-note">${notes.map(esc).join("<br>")}</div>`:""}
  ${source?`<a class="moena-source-link" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Apri il sito della fonte ↗</a>`:""}`);
}

function weather(code){return WEATHER[String(code||"").toUpperCase()]||["Variabile","🌤️"];}
function isThunder(code){return /[VXYZ]/.test(String(code||"").toUpperCase());}
function todayIso(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=type=>parts.find(part=>part.type===type)?.value;
 return `${get("year")}-${get("month")}-${get("day")}`;
}
function nowMinutes(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 return Number(parts.find(part=>part.type==="hour")?.value||0)*60+Number(parts.find(part=>part.type==="minute")?.value||0);
}
function futureHours(day){
 const hours=Array.isArray(day?.hours)?day.hours:[];
 if(day.date!==todayIso())return hours;
 const now=nowMinutes();
 return hours.filter(hour=>{
  const [h,m]=String(hour.time||"00:00").split(":").map(Number);
  return h*60+m+180>now;
 });
}
function rangeLabel(time){
 const [hour]=String(time||"00:00").split(":").map(Number);
 if(!Number.isFinite(hour))return time||"—";
 return `${String(hour).padStart(2,"0")}–${String((hour+3)%24).padStart(2,"0")}`;
}
function tabLabel(dateIso){
 const [year,month,day]=dateIso.split("-").map(Number);
 const date=new Date(Date.UTC(year,month-1,day,12));
 const weekday=new Intl.DateTimeFormat("it-IT",{weekday:"short",timeZone:"Europe/Rome"}).format(date).replace(".","").toUpperCase();
 return dateIso===todayIso()?`OGGI ${day}`:`${weekday} ${day}`;
}
function fullDay(dateIso){
 const [year,month,day]=dateIso.split("-").map(Number);
 return new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/Rome"}).format(new Date(Date.UTC(year,month-1,day,12)));
}
function compass(value){
 if(!finite(value))return "—";
 const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
 const degrees=((Number(value)%360)+360)%360;
 return `${labels[Math.round(degrees/22.5)%16]} · ${number(degrees,0)}°`;
}

function renderForecastPreview(){
 const preview=$("#forecast-preview");
 let chosenDay=null,chosenHour=null;
 for(const day of forecastDays){const hours=futureHours(day);if(hours.length){chosenDay=day;chosenHour=hours[0];break;}}
 if(!chosenHour){preview.textContent="Nessuna fascia futura disponibile";return;}
 const [label,icon]=weather(chosenHour.code);
 const when=chosenDay.date===todayIso()?"Oggi":tabLabel(chosenDay.date);
 preview.innerHTML=`<span class="forecast-preview-icon">${icon}</span><span class="forecast-preview-time">${esc(when)} · ${esc(rangeLabel(chosenHour.time))}</span><span class="forecast-preview-condition">${esc(label)}</span><strong class="forecast-preview-temp">${number(chosenHour.temp)}°</strong><span class="forecast-preview-rain">☔ ${finite(chosenHour.rainProb)?`${number(chosenHour.rainProb,0)}%`:"—"}</span>`;
}
function renderForecastTabs(){
 const tabs=$("#forecast-tabs");
 tabs.innerHTML=forecastDays.map(day=>{
  const [label,icon]=weather(day.code);
  return `<button type="button" class="forecast-tab ${isThunder(day.code)?"forecast-thunder":""}" data-date="${esc(day.date)}" role="tab" aria-selected="false"><span class="forecast-tab-top">${icon} <strong>${esc(tabLabel(day.date))}</strong> <small>${esc(label)}</small></span><span class="forecast-tab-bottom">${number(day.min,0)}° / ${number(day.max,0)}° · ☔ ${finite(day.rainProb)?`${number(day.rainProb,0)}%`:"—"}</span></button>`;
 }).join("");
 tabs.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>renderForecastDay(button.dataset.date,true)));
}
function forecastCard(hour,index,date){
 const [label,icon]=weather(hour.code);
 return `<article class="forecast-item ${isThunder(hour.code)?"forecast-thunder":""}" data-forecast-date="${esc(date)}" data-forecast-index="${index}" tabindex="0" role="button" aria-label="Dettagli previsione ${esc(rangeLabel(hour.time))}">
  <div class="forecast-hour">${esc(rangeLabel(hour.time))}</div><div class="forecast-sky" title="${esc(label)}">${icon}<span class="forecast-condition">${esc(label)}</span></div>
  <strong class="forecast-temp">${number(hour.temp)}°</strong><div class="forecast-rain">☔ ${finite(hour.rainProb)?`${number(hour.rainProb,0)}%`:"—"} · ${finite(hour.rain)?`${number(hour.rain)} mm`:"—"}</div><div class="forecast-more">Tocca per i dettagli</div>
 </article>`;
}
function renderForecastDay(dateIso,center=false){
 const day=forecastDays.find(item=>item.date===dateIso)||forecastDays[0];
 if(!day)return;
 selectedForecastDate=day.date;
 $("#forecast-tabs").querySelectorAll("button").forEach(button=>{
  const active=button.dataset.date===day.date;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false");
  if(active&&center)button.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
 });
 const hours=futureHours(day);
 const grid=$("#forecast-grid");
 grid.innerHTML=hours.length?hours.map((hour,index)=>forecastCard(hour,index,day.date)).join(""):`<div class="forecast-empty">Nessuna fascia futura disponibile per oggi.</div>`;
 grid.querySelectorAll("[data-forecast-index]").forEach(card=>{
  const open=()=>openForecast(day,hours[Number(card.dataset.forecastIndex)]);
  card.addEventListener("click",open);card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});
 });
}
function applyForecast(raw){
 if(!Array.isArray(raw?.days)||!raw.days.length)throw new Error("Formato previsioni inatteso");
 forecastDays=raw.days.filter(day=>day?.date&&Array.isArray(day.hours));
 if(!forecastDays.length)throw new Error("Nessuna previsione disponibile");
 renderForecastPreview();renderForecastTabs();
 const first=forecastDays.find(day=>futureHours(day).length)||forecastDays[0];
 renderForecastDay(selectedForecastDate&&forecastDays.some(day=>day.date===selectedForecastDate)?selectedForecastDate:first.date);
}
function openForecast(day,hour){
 if(!day||!hour)return;
 const [label,icon]=weather(hour.code);
 openModal(`<div class="forecast-modal"><div class="forecast-modal-head"><div><div class="forecast-modal-time">${esc(fullDay(day.date))} · ${esc(rangeLabel(hour.time))}</div><div class="forecast-modal-sky">${icon} <span class="forecast-condition">${esc(label)}</span></div></div><div class="forecast-modal-temp">${number(hour.temp)}°</div></div><div class="forecast-modal-grid"><div><span>Probabilità pioggia</span><strong>${finite(hour.rainProb)?`${number(hour.rainProb,0)}%`:"—"}</strong></div><div><span>Precipitazioni</span><strong>${finite(hour.rain)?`${number(hour.rain)} mm`:"—"}</strong></div><div><span>Vento</span><strong>${finite(hour.wind)?`${number(hour.wind)} km/h`:"—"}</strong></div><div><span>Raffiche</span><strong>${finite(hour.gust)?`${number(hour.gust)} km/h`:"—"}</strong></div><div><span>Direzione</span><strong>${compass(hour.dir)}</strong></div><div><span>Condizioni</span><strong>${esc(label)}</strong></div></div></div>`);
}
async function loadForecast(){
 const status=$("#forecast-status");
 const cached=readCache(FORECAST_CACHE_KEY);
 if(cached){try{applyForecast(cached);}catch{}}
 try{
  const raw=await fetchJson(FORECAST_URL,30000);
  applyForecast(raw);writeCache(FORECAST_CACHE_KEY,raw);status.hidden=true;
 }catch(error){
  console.warn("Previsioni Moena:",error);
  if(forecastDays.length){status.textContent="Ultime previsioni salvate · aggiornamento non riuscito";status.className="worker-status";status.hidden=false;}
  else{$("#forecast-preview").textContent="Previsioni momentaneamente non disponibili";$("#forecast-grid").innerHTML="";$("#forecast-tabs").innerHTML="";status.textContent="⚠️ Previsioni non disponibili al momento";status.className="worker-status error";status.hidden=false;}
 }
}

function openModal(html){
 $("#modal-body").innerHTML=html;$("#modal-backdrop").hidden=false;document.body.style.overflow="hidden";$("#modal-close").focus();
}
function closeModal(){$("#modal-backdrop").hidden=true;document.body.style.overflow="";}
function initModal(){
 $("#modal-close").addEventListener("click",closeModal);
 $("#modal-backdrop").addEventListener("click",event=>{if(event.target.id==="modal-backdrop")closeModal();});
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("#modal-backdrop").hidden)closeModal();});
}

function init(){
 initModal();
 loadStationGroup("main",MAIN_URL,MAIN_CACHE_KEY,renderMain);
 loadStationGroup("amateur",AMATEUR_URL,AMATEUR_CACHE_KEY,renderAmateurs);
 loadForecast();
}

init();
})();
