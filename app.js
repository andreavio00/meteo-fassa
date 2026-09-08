const WORKER_URL="https://meteofassa-proxy.andrea-vio.workers.dev/";
const WORKER_TIMEOUT=7000;
const DATA_AGE_WARNING=30;
const DATA_AGE_OLD=60;

const MAIN_STATIONS={
 vigo:{name:"Vigo",fullName:"Vigo di Fassa",quota:"1382 m",icon:"🌲",sourceLabel:"Vigo Meteo",sourceUrl:"https://stazioni.meteoproject.it/dati/vigodifassa/dati.php"},
 monzon:{name:"Monzon",fullName:"Monzon – Pozza di Fassa",quota:"1520 m",icon:"⛰️",sourceLabel:"MeteoNetwork",sourceUrl:"https://www.meteonetwork.eu/it/weather-station/trn314-stazione-meteorologica-di-monzon"},
 moena:{name:"Moena",fullName:"Moena",quota:"1221 m",icon:"🌲",sourceLabel:"Moena Meteo",sourceUrl:"https://www.moenameteo.it/"}
};

// Scala di comfort percepito. Il range di riferimento -10..35°C copre il clima
// tipico della valle (inverno rigido / estate mite in quota).
const COMFORT_MIN=-10, COMFORT_MAX=35;

// --- Meteo per una gita: stazioni in quota (worker separato) --------------
const TRIP_WORKER_URL="https://gitemeteofassa.andrea-vio.workers.dev/";
const TRIP_TIMEOUT=9000;

// Icona in base al nome della stazione (nessun elenco fisso per id: così
// una nuova stazione aggiunta lato worker riceve comunque un'icona sensata
// senza dover toccare il frontend).
function tripIcon(name){
 const n=(name||"").toLowerCase();
 if(n.includes("rifugio")||n.includes("capanna"))return "🛖";
 if(n.includes("passo"))return "🚗";
 if(n.includes("sass")||n.includes("cima")||n.includes("piz")||n.includes("pordoi"))return "🏔️";
 return "⛰️";
}

function fetchWithTimeout(url,ms){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 return fetch(url,{signal:c.signal}).finally(()=>clearTimeout(t));
}
function num(v,d=1){
 if(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))return "—";
 return Number(v).toFixed(d).replace(".",",");
}
function dateOf(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d;}
function time(v){
 const d=dateOf(v); if(!d)return "—";
 return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(d);
}
// Il ritardo si mostra solo se è cospicuo (>30 min); si colora di rosso
// solo se supera l'ora. Sotto i 30 min mostriamo solo l'orario, senza
// etichetta, per non appesantire la card con un dato quasi sempre uguale.
function age(v){
 const d=dateOf(v);
 if(!d)return {c:"unknown",label:"Ora del dato non disponibile",showDelay:false};
 const m=Math.max(0,(Date.now()-d.getTime())/60000);
 if(m>DATA_AGE_OLD)return {c:"old",label:`ritardo di ${Math.floor(m)} min`,showDelay:true};
 if(m>DATA_AGE_WARNING)return {c:"warning",label:`${Math.floor(m)} min fa`,showDelay:true};
 return {c:"fresh",label:"",showDelay:false};
}
function dir(v){
 if(v===null||v===undefined||v==="")return "—";
 if(typeof v==="string"&&Number.isNaN(Number(v))){
  const s=String(v).trim().toUpperCase();
  const map={W:"O",SW:"SO",WSW:"OSO",WNW:"ONO",NW:"NO",SSW:"SSO",NNW:"NNO"};
  return map[s]||s;
 }
 const ds=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
 return ds[Math.round(Number(v)/22.5)%16];
}
// NOTA: nessuna delle 3 stazioni fornisce oggi un proprio orario di
// rilevazione (il campo "aggiornamento" è sempre null/assente nella risposta
// del Worker). Non è quindi un problema di mapping: il dato semplicemente
// non c'è ancora. Finché non viene aggiunto lato Worker, mostriamo onestamente
// "non disponibile" invece di usare l'orario di fetch della pagina.
function timestamp(data){
 if(!data)return null;
 for(const v of [data.aggiornamento,data.datetime,data.timestamp,data.data_ora,data.dataOra,data.time,data.ora])
   if(dateOf(v))return v;
 return null;
}
function normalise(raw){
 return {workerTimestamp:raw.timestamp||raw.datetime||null,vigo:raw.vigo||null,monzon:raw.monzon||raw.pozza||null,moena:raw.moena||null};
}
function numOrNull(v){
 if(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))return null;
 return Number(v);
}
// Vigo e Moena espongono già un heat_index/wind_chill calcolato dalla
// centralina: lo usiamo direttamente perché più affidabile del nostro calcolo.
// Monzon non li fornisce: per lei si ricade sul calcolo di feltTemperature().
function stationFelt(data){
 const hi=numOrNull(data.heat_index?.attuale??data.heat_index);
 if(hi!==null)return hi;
 const wc=numOrNull(data.wind_chill?.attuale??data.wind_chill);
 if(wc!==null)return wc;
 return null;
}
function cardData(key,data){
 const cfg=MAIN_STATIONS[key];
 if(!data)return {...cfg,error:"Dati non disponibili"};
 const w=data.vento&&typeof data.vento==="object"?data.vento:{};
 const r=data.precipitazioni&&typeof data.precipitazioni==="object"?data.precipitazioni:{};
 const temp=data.temperatura?.attuale??data.temperatura??null;
 const humidity=data.umidita?.attuale??data.umidita??null;
 const wind=w.attuale??(typeof data.vento==="number"?data.vento:null);
 return {...cfg,
   quota:data.quota?`${data.quota} m`:cfg.quota,
   temp,humidity,
   pressure:data.pressione?.attuale??data.pressione??null,
   wind,
   wind10:numOrNull(w.media10??w.media_10min??w.media??data.vento10??data.media10),
   gust:w.raffica??data.vento_max_giorno??data.raffica??null,
   windDir:w.direzione??data.direzione??null,
   // "intensita"/"pioggia_rate" sono la pioggia istantanea (mm/h), non un
   // totale accumulato nell'ultima ora — è il dato più vicino disponibile.
   rainRate:r.intensita??data.pioggia_rate??null,
   rainDaily:r.giornaliero??data.pioggia??null,
   // Indici della centralina esposti singolarmente (non solo fusi in "felt"),
   // così nella modale si vede il dato grezzo oltre alla sintesi colorata.
   dewPoint:numOrNull(data.punto_rugiada?.attuale??data.punto_rugiada??data.dew_point?.attuale??data.dew_point),
   heatIndex:numOrNull(data.heat_index?.attuale??data.heat_index),
   windChill:numOrNull(data.wind_chill?.attuale??data.wind_chill),
   felt:stationFelt(data)??feltTemperature(temp,humidity,wind),
   updated:timestamp(data)
 };
}

// Temperatura percepita — formula di Steadman (Apparent Temperature, versione
// "in ombra", senza termine di radiazione solare): stessa famiglia di formula
// già usata per l'Heat Index di LagunaLive, adattata qui senza dato di
// irraggiamento (non disponibile dalle stazioni Val di Fassa).
function feltTemperature(tempC,rhPercent,windKmh){
 if(![tempC,rhPercent,windKmh].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))))return null;
 const t=Number(tempC),rh=Number(rhPercent),ws=Number(windKmh)/3.6;
 const e=(rh/100)*6.105*Math.exp((17.27*t)/(237.7+t));
 return t+0.33*e-0.70*ws-4.00;
}

// --- Scala colore unica blu (freddo) -> rosso (caldo) -------------------
// Usata sia dal grafico verticale (temperatura reale) sia dalla barra di
// qualità orizzontale (temperatura percepita), cosi restano coerenti.
function scalePercent(value){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return null;
 return Math.max(0,Math.min(100,((Number(value)-COMFORT_MIN)/(COMFORT_MAX-COMFORT_MIN))*100));
}
function hexToRgb(h){const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
function mix(c1,c2,t){return c1.map((v,i)=>Math.round(v+(c2[i]-v)*t));}
function gradientColorAt(percent){
 if(percent===null)return "var(--unknown)";
 const cold=hexToRgb("#4f83c9"),mid=hexToRgb("#5aa66a"),hot=hexToRgb("#cf5a44");
 const rgb=percent<=50?mix(cold,mid,percent/50):mix(mid,hot,(percent-50)/50);
 return `rgb(${rgb.join(",")})`;
}
function comfortLabel(value){
 const t=Number(value);
 if(value===null||value===undefined||!Number.isFinite(t))return "—";
 if(t<5)return "Freddo";
 if(t<13)return "Fresco";
 if(t<22)return "Confortevole";
 if(t<27)return "Caldo";
 return "Molto caldo";
}

// --- Barra di qualità orizzontale: temperatura percepita ------------------
function qualityBar(felt){
 const p=scalePercent(felt);
 const color=gradientColorAt(p);
 const label=felt===null?"—":comfortLabel(felt);
 const markerStyle=p===null?"display:none":`left:${p}%;border-color:${color}`;
 return `<div class="quality-row">
  <div class="quality-track"><div class="quality-marker" style="${markerStyle}"></div></div>
  <span class="quality-label" style="color:${color}">${label}</span>
 </div>`;
}

function feltRow(felt){
 return `<div class="percepita-block">
  <div class="percepita-label">Percepita <strong>${felt===null?"—":num(felt,0)+"°"}</strong></div>
  ${qualityBar(felt)}
 </div>`;
}

// Compare solo se c'è davvero un avviso attivo (arriveranno con le
// previsioni). Per ora non c'è nessuna logica di avvisi: non mostriamo
// nessuno slot vuoto/placeholder.
function alertsSlot(alerts){
 if(!alerts||!alerts.length)return "";
 return `<div class="alerts-slot">⚠️ ${alerts.join(" · ")}</div>`;
}

function metric(icon,label,value){
 return `<div class="metric"><span class="metric-icon">${icon}</span><span class="metric-text"><small>${label}</small><strong>${value}</strong></span></div>`;
}

function sourceLink(c){
 return `<a class="source-button" href="${c.sourceUrl}" target="_blank" rel="noopener">🌐 ${c.sourceLabel} ↗</a>`;
}

function errorCard(c,hero){
 return `<article class="station-card ${hero?"hero-card":"compact-card"} station-error">
  <div class="card-title">${c.icon} <strong>${hero?c.fullName:c.name}</strong></div>
  <div class="quota">${c.quota}</div>
  <p class="error-text">${c.error}</p>
  ${sourceLink(c)}
 </article>`;
}

// Card principale (Vigo): mostra solo temperatura, umidità e pioggia.
// Tutti gli altri dati (percepita, vento, raffica, pressione) si trovano
// nella modale, aperta toccando la scheda.
function makeHeroCard(c){
 if(c.error)return errorCard(c,true);
 const a=age(c.updated);
 return `<article class="station-card hero-card" data-station-id="vigo" tabindex="0" role="button" aria-label="Dettagli ${c.fullName}">
  <div class="hero-top">
   <span class="card-icon">${c.icon}</span>
   <div><div class="station-name">${c.fullName}</div><div class="quota">${c.quota}</div></div>
  </div>
  <div class="hero-values">
   <div class="temp-humidity-row hero-thr">
    <span class="value-num hero-value">${num(c.temp)}°</span>
    <span class="value-num value-humidity hero-value-humidity">💧${num(c.humidity,0)}%</span>
   </div>
   <div class="rain-row">🌧️ ${num(c.rainRate)} mm/h · ${num(c.rainDaily)} mm oggi</div>
  </div>
  ${alertsSlot(c.alerts)}
  <div class="data-time ${a.c}"><span class="age-dot"></span>Rilevato alle <strong>${time(c.updated)}</strong>${a.showDelay?` · ${a.label}`:""}</div>
  <div class="tap-hint">Tocca per tutti i dati ›</div>
 </article>`;
}

// Card compatta (Monzon / Moena): stessa logica della hero, formato ridotto.
// key serve solo per sapere quale voce di mainStationsCache aprire al click.
function makeCompactCard(c,key){
 if(c.error)return errorCard(c,false);
 const a=age(c.updated);
 return `<article class="station-card compact-card" data-station-id="${key}" tabindex="0" role="button" aria-label="Dettagli ${c.name}">
  <div class="card-title">${c.icon} <strong>${c.name}</strong></div>
  <div class="quota">${c.quota}</div>
  <div class="temp-humidity-row compact-thr">
   <span class="value-num compact-value">${num(c.temp)}°</span>
   <span class="value-num value-humidity compact-value">💧${num(c.humidity,0)}%</span>
  </div>
  <div class="rain-row rain-row-compact">🌧️ ${num(c.rainRate)} mm/h · ${num(c.rainDaily)} mm oggi</div>
  <div class="data-time ${a.c}"><span class="age-dot"></span>${time(c.updated)}${a.showDelay?` · ${a.label}`:""}</div>
  <div class="tap-hint tap-hint-sm">Tocca per i dettagli ›</div>
 </article>`;
}

// Contenuto della modale con tutti i dati di una stazione principale
// (percepita, vento, raffica, pressione, pioggia, link alla fonte).
function mainStationModalHtml(c){
 const a=age(c.updated);
 const wd=c.windDir!==null&&c.windDir!==undefined?dir(c.windDir):"—";
 return `<div class="hero-top">
  <span class="card-icon">${c.icon}</span>
  <div><div class="station-name">${c.fullName}</div><div class="quota">${c.quota}</div></div>
 </div>
 <div class="hero-values" style="margin-top:14px">
  <div class="temp-humidity-row">
   <span class="value-num">${num(c.temp)}°</span>
   <span class="value-num value-humidity">💧${num(c.humidity,0)}%</span>
  </div>
  ${feltRow(c.felt)}
  <div class="metrics">
   ${metric("🌡️","Punto di rugiada",c.dewPoint===null?"—":`${num(c.dewPoint)}°`)}
   ${metric("♨️","Heat Index",c.heatIndex===null?"—":`${num(c.heatIndex)}°`)}
   ${metric("🥶","Wind chill",c.windChill===null?"—":`${num(c.windChill)}°`)}
   ${metric("💨","Vento",`${num(c.wind)} km/h ${wd}`)}
   ${metric("〰️","Vento medio",c.wind10===null?"—":`${num(c.wind10)} km/h`)}
   ${metric("🌬️","Raffica",`${num(c.gust)} km/h`)}
   ${metric("⏲️","Pressione",`${num(c.pressure)} hPa`)}
   ${metric("🌧️","Pioggia",`${num(c.rainRate)} mm/h`)}
   ${metric("☔","Pioggia oggi",`${num(c.rainDaily)} mm`)}
  </div>
 </div>
 ${alertsSlot(c.alerts)}
 <div class="data-time ${a.c}" style="margin-top:14px"><span class="age-dot"></span>Rilevato alle <strong>${time(c.updated)}</strong>${a.showDelay?` · ${a.label}`:""}</div>
 ${sourceLink(c)}`;
}

let mainStationsCache=null;

function openStationModal(key){
 const c=mainStationsCache&&mainStationsCache[key];
 if(!c||c.error)return;
 openModal(mainStationModalHtml(c));
}

// --- Card compatte griglia gita --------------------------------------------
function tripCardHtml(s){
 const icon=tripIcon(s.name);
 const offline=s.status!=="online";
 const rainRow=(s.rainToday!==null&&s.rainToday!==undefined)
   ?`<div class="trip-rain">🌧️ ${num(s.rainToday)} mm oggi</div>`:"";
 if(offline){
  return `<article class="station-card trip-card trip-card-offline" data-trip-id="${s.id}" tabindex="0" role="button" aria-label="${s.name}, dati non disponibili">
   <div class="card-title">${icon} <strong>${s.name}</strong></div>
   <div class="quota">${s.altitude} m</div>
   <p class="error-text">${s.status==="no-data"?"Dati non disponibili":"Stazione offline"}</p>
  </article>`;
 }
 return `<article class="station-card trip-card" data-trip-id="${s.id}" tabindex="0" role="button" aria-label="Dettagli ${s.name}">
  <div class="card-title">${icon} <strong>${s.name}</strong></div>
  <div class="quota">${s.altitude} m</div>
  <div class="temp-humidity-row compact-thr">
   <span class="value-num compact-value">${num(s.temperature)}°</span>
   <span class="value-num value-humidity compact-value">💧${num(s.humidity,0)}%</span>
  </div>
  ${rainRow}
 </article>`;
}

function tripDetailRow(icon,label,value){
 return `<div class="metric"><span class="metric-icon">${icon}</span><span class="metric-text"><small>${label}</small><strong>${value}</strong></span></div>`;
}

function tripModalHtml(s){
 const icon=tripIcon(s.name);
 const wd=s.windDirection?s.windDirection:"—";
 const a=age(s.fetchedAt);
 if(s.status!=="online"){
  return `<div class="hero-top">
   <span class="card-icon">${icon}</span>
   <div><div class="station-name">${s.name}</div><div class="quota">${s.altitude} m · ${s.source}</div></div>
  </div>
  <p class="error-text" style="text-align:left;margin-top:14px">${s.status==="no-data"?"La stazione non sta al momento fornendo dati utilizzabili.":"Stazione risultata offline all'ultimo aggiornamento."}</p>`;
 }
 return `<div class="hero-top">
  <span class="card-icon">${icon}</span>
  <div><div class="station-name">${s.name}</div><div class="quota">${s.altitude} m · ${s.source}</div></div>
 </div>
 <div class="hero-values" style="margin-top:14px">
  <div class="temp-humidity-row">
   <span class="value-num">${num(s.temperature)}°</span>
   <span class="value-num value-humidity">💧${num(s.humidity,0)}%</span>
  </div>
  ${feltRow(s.perceived)}
  <div class="metrics">
   ${tripDetailRow("🌡️","Punto di rugiada",`${num(s.dewPoint)}°`)}
   ${tripDetailRow("🥶","Wind chill",s.windChill===null||s.windChill===undefined?"—":`${num(s.windChill)}°`)}
   ${tripDetailRow("💨","Vento",`${num(s.wind)} km/h ${wd}`)}
   ${tripDetailRow("〰️","Vento medio 10'",`${num(s.wind10)} km/h`)}
   ${tripDetailRow("🌬️","Raffica",`${num(s.gust)} km/h`)}
   ${tripDetailRow("⏲️","Pressione",`${num(s.pressure)} hPa`)}
   ${tripDetailRow("🌧️","Pioggia",`${num(s.rainRate)} mm/h`)}
   ${tripDetailRow("☔","Pioggia oggi",`${num(s.rainToday)} mm`)}
  </div>
 </div>
 <div class="data-time ${a.c}" style="margin-top:14px"><span class="age-dot"></span>${s.updatedText?`Stazione: ${s.updatedText}`:`Letto alle ${time(s.fetchedAt)}`}${a.showDelay?` · ${a.label}`:""}</div>`;
}

// --- Previsioni locali meteo.report: dati triorari ------------------------
// Il worker dedicato normalizza gia' il feed meteo.report in giornate
// complete (days[]) con riepilogo giornaliero e fasce di 3 ore.
const METEO_REPORT_FORECAST_URL="https://meteopozza-previsioni.andrea-vio.workers.dev/";
const FORECAST_TIMEOUT=9000;

let forecastDays=[];
let selectedForecastDate=null;

function forecastCondition(value){
 const raw=String(value??"").trim();
 const s=raw.toLowerCase();

 // Codici sky_condition osservati nel feed meteo.report di San Giovanni di Fassa.
 // Li raggruppiamo in categorie semplici e leggibili.
 const code=raw.toUpperCase();
 const byCode={
  A:"Sereno",
  S:"Sereno",
  B:"Poco nuvoloso",
  C:"Nuvoloso",
  F:"Rovesci",
  H:"Pioggia",
  J:"Pioggia",
  U:"Instabile",
  V:"Temporali"
 };
 if(byCode[code])return byCode[code];

 // Fallback per eventuali descrizioni testuali future.
 if(s.includes("tempor")||s.includes("thunder")||s.includes("storm")||s.includes("fulmin"))return "Temporali";
 if(s.includes("neve")||s.includes("snow"))return "Neve";
 if(s.includes("piogg")||s.includes("rain"))return "Pioggia";
 if(s.includes("rovesc")||s.includes("shower"))return "Rovesci";
 if(s.includes("coperto")||s.includes("overcast"))return "Nuvoloso";
 if(s.includes("nuvol")||s.includes("cloud")||s.includes("parzial")||s.includes("partly"))return "Poco nuvoloso";
 if(s.includes("sereno")||s.includes("sunny")||s.includes("clear"))return "Sereno";
 return "Variabile";
}
function forecastSkyIcon(value){
 const c=forecastCondition(value);
 if(c==="Temporali")return "⛈️";
 if(c==="Neve")return "🌨️";
 if(c==="Pioggia")return "🌧️";
 if(c==="Rovesci"||c==="Instabile")return "🌦️";
 if(c==="Nuvoloso")return "☁️";
 if(c==="Poco nuvoloso")return "⛅";
 if(c==="Sereno")return "☀️";
 return "🌤️";
}
function forecastDir(v){return v===null||v===undefined?"—":dir(v);}
function forecastCardHtml(item){
 const sky=item.sky;
 const rain=item.rain;
 const prob=item.prob;
 const gust=item.gust;
 const payload=encodeURIComponent(JSON.stringify(item));
 return `<article class="forecast-item" role="button" tabindex="0"
   onclick="openForecastModal(decodeURIComponent('${payload}'))"
   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openForecastModal(decodeURIComponent('${payload}'))}">
  <div class="forecast-hour">${item.hour}</div>
  <div class="forecast-sky" title="${forecastCondition(sky)}">
    ${forecastSkyIcon(sky)}
    ${sky?`<span class="forecast-condition">${forecastCondition(sky)}</span>`:""}
  </div>
  <strong class="forecast-temp">${num(item.temp)}°</strong>
  <div class="forecast-rain">☔ ${prob===null?"—":num(prob,0)}% · ${rain===null?"—":num(rain)} mm</div>
  <div class="forecast-more">Tocca per i dettagli</div>
 </article>`;
}

function openForecastModal(encodedItem){
 const item=typeof encodedItem==="string"?JSON.parse(encodedItem):encodedItem;
 const sky=item.sky;
 openModal(`
  <div class="forecast-modal">
   <div class="forecast-modal-head">
    <div>
     <div class="forecast-modal-time">Previsione delle ${item.hour}</div>
     <div class="forecast-modal-sky">${forecastSkyIcon(sky)} ${sky?`<span class="forecast-condition">${forecastCondition(sky)}</span>`:""}</div>
    </div>
    <div class="forecast-modal-temp">${num(item.temp)}°</div>
   </div>
   <div class="forecast-modal-grid">
    <div><span>Probabilità pioggia</span><strong>${item.prob===null?"—":num(item.prob,0)+"%"}</strong></div>
    <div><span>Precipitazioni</span><strong>${item.rain===null?"—":num(item.rain)+" mm"}</strong></div>
    <div><span>Vento</span><strong>${item.wind===null?"—":num(item.wind)+" km/h"}</strong></div>
    <div><span>Raffiche</span><strong>${item.gust===null?"—":num(item.gust)+" km/h"}</strong></div>
    <div><span>Direzione</span><strong>${forecastDir(item.windDir)}${item.windDir===null?"":" · "+num(item.windDir,0)+"°"}</strong></div>
    <div><span>Condizioni</span><strong>${forecastCondition(sky)}</strong></div>
   </div>
  </div>
 `);
}
function forecastTodayIso(){
 const parts=new Intl.DateTimeFormat("en-CA",{
  timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date());
 const get=t=>parts.find(p=>p.type===t)?.value;
 return `${get("year")}-${get("month")}-${get("day")}`;
}
function forecastNowMinutes(){
 const parts=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit",hour12:false
 }).formatToParts(new Date());
 const h=Number(parts.find(p=>p.type==="hour")?.value||0);
 const m=Number(parts.find(p=>p.type==="minute")?.value||0);
 return h*60+m;
}
function forecastTabLabel(dateIso){
 const [y,m,d]=dateIso.split("-").map(Number);
 const date=new Date(Date.UTC(y,m-1,d,12));
 const today=forecastTodayIso();
 const weekday=new Intl.DateTimeFormat("it-IT",{weekday:"short",timeZone:"Europe/Rome"})
  .format(date).replace(".","").toUpperCase();
 return dateIso===today?`OGGI ${d}`:`${weekday} ${d}`;
}
function forecastHoursForDay(day){
 const hours=Array.isArray(day.hours)?day.hours:[];
 if(day.date!==forecastTodayIso())return hours;
 const now=forecastNowMinutes();
 // La fascia delle 17:00, per esempio, resta visibile fino alle 20:00.
 return hours.filter(h=>{
  const [hh,mm]=String(h.time||"00:00").split(":").map(Number);
  return hh*60+mm+180>now;
 });
}
function forecastDaySummaryHtml(day){ return ""; }

function renderForecastTabs(){
 const tabs=document.getElementById("forecast-tabs");
 if(!tabs)return;
 tabs.innerHTML=forecastDays.map(day=>{
  const prob=day.rainProb===null||day.rainProb===undefined?"—":num(day.rainProb,0)+"%";
  const code=day.code??"";
  return `<button type="button" class="forecast-tab" data-date="${day.date}" role="tab" aria-selected="false">
   <span class="forecast-tab-top">${forecastSkyIcon(code)} <strong>${forecastTabLabel(day.date)}</strong>${code?` <small>${forecastCondition(code)}</small>`:""}</span>
   <span class="forecast-tab-bottom">${num(day.min,0)}° / ${num(day.max,0)}° · ☔ ${prob}</span>
  </button>`;
 }).join("");
 tabs.querySelectorAll(".forecast-tab").forEach(btn=>btn.addEventListener("click",()=>renderForecastDay(btn.dataset.date)));
}
function renderForecastDay(dateIso){
 const grid=document.getElementById("forecast-grid");
 const summary=document.getElementById("forecast-day-summary");
 const day=forecastDays.find(d=>d.date===dateIso)||forecastDays[0];
 if(!day||!grid)return;
 selectedForecastDate=day.date;
 document.querySelectorAll("#forecast-tabs .forecast-tab").forEach(btn=>{
  const active=btn.dataset.date===day.date;
  btn.classList.toggle("active",active);
  btn.setAttribute("aria-selected",active?"true":"false");
 });
 if(summary)summary.innerHTML=forecastDaySummaryHtml(day);
 const hours=forecastHoursForDay(day);
 if(!hours.length){
  grid.innerHTML=`<div class="forecast-empty">Nessuna fascia futura disponibile per oggi.</div>`;
  return;
 }
 const cards=hours.map(h=>({
  hour:h.time||"—",
  temp:numOrNull(h.temp),
  rain:numOrNull(h.rain),
  prob:numOrNull(h.rainProb),
  wind:numOrNull(h.wind),
  gust:numOrNull(h.gust),
  windDir:numOrNull(h.dir),
  sky:h.code??null
 }));
 grid.innerHTML=cards.map(forecastCardHtml).join("");
}
function renderForecastPreview(){
 const preview=document.getElementById("forecast-preview");
 if(!preview||!forecastDays.length)return;
 let chosenDay=null,chosenHour=null;
 for(const day of forecastDays){
  const hours=forecastHoursForDay(day);
  if(hours.length){chosenDay=day;chosenHour=hours[0];break;}
 }
 if(!chosenDay||!chosenHour){
  preview.textContent="Nessuna fascia disponibile";
  return;
 }
 const when=chosenDay.date===forecastTodayIso()?"Oggi":forecastTabLabel(chosenDay.date);
 const temp=chosenHour.temp===null||chosenHour.temp===undefined?"—":`${num(chosenHour.temp)}°`;
 const prob=chosenHour.rainProb===null||chosenHour.rainProb===undefined?"—":`${num(chosenHour.rainProb,0)}%`;
 preview.innerHTML=`<span class="forecast-preview-line"><strong>${when} ${chosenHour.time}</strong><span>${forecastSkyIcon(chosenHour.code)} ${forecastCondition(chosenHour.code)}</span><span>${temp}</span><span>☔ ${prob}</span></span>`;
}

async function loadForecast(){
 const grid=document.getElementById("forecast-grid"),status=document.getElementById("forecast-status");
 const tabs=document.getElementById("forecast-tabs"),summary=document.getElementById("forecast-day-summary");
 const preview=document.getElementById("forecast-preview");
 if(status){status.hidden=true;status.textContent="";}
 try{
  const res=await fetchWithTimeout(`${METEO_REPORT_FORECAST_URL}?_=${Date.now()}`,FORECAST_TIMEOUT);
  if(!res.ok)throw Error(`HTTP ${res.status}`);
  const raw=await res.json();
  if(!Array.isArray(raw.days)||!raw.days.length)throw Error("Formato previsioni inatteso");

  forecastDays=raw.days;
  renderForecastPreview();
  renderForecastTabs();
  const today=forecastTodayIso();
  const initial=forecastDays.find(d=>d.date===today)||forecastDays[0];
  renderForecastDay(initial.date);
 }catch(e){
  console.error(e);
  forecastDays=[]; selectedForecastDate=null;
  if(preview)preview.textContent="Previsioni momentaneamente non disponibili";
  if(status){status.hidden=false;status.textContent="⚠️ Previsioni non disponibili al momento";status.className="worker-status error";}
  if(tabs)tabs.innerHTML="";
  if(summary)summary.innerHTML="";
  if(grid)grid.innerHTML="";
 }
}

function initForecastSection(){
 const details=document.getElementById("forecast-details");
 if(!details)return;
 // Carichiamo subito: la testata chiusa mostra già la prossima fascia disponibile.
 loadForecast();
}

initForecastSection();

let tripStationsCache=null;

// --- Modale generica (usata sia dalle card principali sia dalla gita) -----
function openModal(html){
 document.getElementById("modal-body").innerHTML=html;
 document.getElementById("modal-backdrop").hidden=false;
 document.body.style.overflow="hidden";
}
function closeModal(){
 document.getElementById("modal-backdrop").hidden=true;
 document.body.style.overflow="";
}
function openTripModal(id){
 if(!tripStationsCache)return;
 const s=tripStationsCache.find(x=>x.id===id);
 if(!s)return;
 openModal(tripModalHtml(s));
}

const TRIP_ZONE_BY_ID={
 gardeccia:"catinaccio",
 principe:"catinaccio",
 contrin:"catinaccio",
 passosella:"sella",
 pordoi:"sella",
 pizboe:"sella",
 rolle:"moena",
 paradiso:"moena"
};

// Fonti aggiuntive che non vengono ricostruite dal worker: manteniamo la
// pagina originale in un pannello interno, senza alterare i dati delle
// stazioni già gestite dal worker.
const TRIP_EXTRA_SOURCES={
 marmolada:[
  {name:"Punta Penia",quota:"3343 m",icon:"🏔️",url:"https://www.marmoladameteo.it/puntapenia/index.php",kind:"iframe",note:"MarmoladaMeteo · dati della stazione"},
  {name:"Previsioni Aeronautica Militare",quota:"Marmolada / Trentino-Alto Adige",icon:"🛰️",url:"https://www.meteoam.it/it/trentino-alto-adige",kind:"link",note:"Previsioni ufficiali regionali"}
 ],
 sella:[
  {name:"Col dei Rossi",quota:"2385 m",icon:"🌬️",url:"https://www.dolomitesmeteo.it/coldeirossi/",kind:"iframe",note:"DolomitesMeteo · osservatorio meteorologico"},
  {name:"Col Rodella",quota:"—",icon:"🏔️",url:"https://icarusfassa.it/stazione-meteo-icarus-flying-team/",kind:"iframe",note:"Icarus Flying Team · pagina della stazione"}
 ],
 moena:[
  // Le tre stazioni MeteoPredazzo restano volutamente fuori dal worker
  // finché non disponiamo degli URL/endpoint esatti delle pagine dati.
  {name:"Torre di Pisa",quota:"—",icon:"🏔️",kind:"pending",note:"MeteoPredazzo · sorgente da collegare"},
  {name:"Gardonè",quota:"—",icon:"🏔️",kind:"pending",note:"MeteoPredazzo · sorgente da collegare"},
  {name:"Passo Feudo",quota:"—",icon:"🏔️",kind:"pending",note:"MeteoPredazzo · sorgente da collegare"}
 ]
};

function tripExtraHtml(item){
 if(item.kind==="pending") return `<article class="trip-extra-card trip-extra-pending"><div class="trip-extra-head"><span>${item.icon}</span><div><strong>${item.name}</strong><small>${item.quota}</small></div></div><p>${item.note}</p></article>`;
 if(item.kind==="link") return `<article class="trip-extra-card"><div class="trip-extra-head"><span>${item.icon}</span><div><strong>${item.name}</strong><small>${item.quota}</small></div></div><p>${item.note}</p><a class="forecast-link" href="${item.url}" target="_blank" rel="noopener noreferrer">Apri fonte ufficiale ↗</a></article>`;
 return `<article class="trip-extra-card"><div class="trip-extra-head"><span>${item.icon}</span><div><strong>${item.name}</strong><small>${item.quota}</small></div></div><p>${item.note}</p><button type="button" class="trip-extra-open" data-src="${item.url}" data-title="${item.name}">Apri dati in pagina</button></article>`;
}

function renderTripZone(zone){
 const grid=document.getElementById("trip-grid"),extras=document.getElementById("trip-extras");
 grid.querySelectorAll("[data-trip-id]").forEach(el=>{el.hidden=TRIP_ZONE_BY_ID[el.dataset.tripId]!==zone;});
 const extra=TRIP_EXTRA_SOURCES[zone]||[];
 extras.innerHTML=extra.map(tripExtraHtml).join("");
 extras.querySelectorAll("[data-src]").forEach(btn=>btn.addEventListener("click",()=>openModal(`<div class="trip-iframe-modal"><h2>${btn.dataset.title}</h2><iframe src="${btn.dataset.src}" title="${btn.dataset.title}" loading="lazy"></iframe></div>`)));
}

function initTripZones(){
 document.querySelectorAll(".trip-zone").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".trip-zone").forEach(b=>b.classList.toggle("active",b===btn));
  renderTripZone(btn.dataset.zone);
 }));
}
initTripZones();

async function loadTripStations(){
 const grid=document.getElementById("trip-grid"),status=document.getElementById("trip-status");
 status.textContent="Aggiornamento dati…"; status.className="worker-status";
 try{
  const res=await fetchWithTimeout(`${TRIP_WORKER_URL}?_=${Date.now()}`,TRIP_TIMEOUT);
  if(!res.ok)throw Error(`HTTP ${res.status}`);
  const raw=await res.json();
  if(!raw.stations)throw Error("Formato dati inatteso");
  tripStationsCache=raw.stations;
  grid.innerHTML=raw.stations.map(tripCardHtml).join("");
  status.textContent=`Dati aggiornati alle ${time(raw.generatedAt)}`;
  status.className="worker-status ok";
  grid.querySelectorAll("[data-trip-id]").forEach(el=>{
   el.addEventListener("click",()=>openTripModal(el.dataset.tripId));
   el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openTripModal(el.dataset.tripId);}});
  });
  renderTripZone(document.querySelector(".trip-zone.active")?.dataset.zone||"catinaccio");
 }catch(e){
  console.error(e);
  status.textContent="⚠️ Dati stazioni in quota non disponibili"; status.className="worker-status error";
 }
}

function initTripSection(){
 const details=document.getElementById("trip-details");
 let loaded=false;
 function scrollToTrip(){
  requestAnimationFrame(()=>details.scrollIntoView({behavior:"smooth",block:"start"}));
 }
 details.addEventListener("toggle",()=>{
  if(!details.open)return;
  if(!loaded){
   loaded=true;
   // La prima volta la griglia è ancora vuota: si scorre solo dopo che
   // loadTripStations ha popolato le card, altrimenti la sezione è ancora
   // bassa (solo il titolo) e lo scroll sembra fermarsi dopo una riga.
   loadTripStations().then(scrollToTrip);
  }else{
   scrollToTrip();
  }
 });
 document.getElementById("modal-close").addEventListener("click",closeModal);
 document.getElementById("modal-backdrop").addEventListener("click",e=>{
  if(e.target.id==="modal-backdrop")closeModal();
 });
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape")closeModal();
 });
}
initTripSection();

function attachStationClickHandlers(){
 document.querySelectorAll("[data-station-id]").forEach(el=>{
  el.addEventListener("click",()=>openStationModal(el.dataset.stationId));
  el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openStationModal(el.dataset.stationId);}});
 });
}

async function load(){
 const hero=document.getElementById("hero-station"),box=document.getElementById("compact-stations"),status=document.getElementById("worker-status");
 try{
  const res=await fetchWithTimeout(`${WORKER_URL}?_=${Date.now()}`,WORKER_TIMEOUT);
  if(!res.ok)throw Error(`HTTP ${res.status}`);
  const raw=await res.json(); if(!raw.ok)throw Error("Worker non disponibile");
  const d=normalise(raw);
  mainStationsCache={vigo:cardData("vigo",d.vigo),monzon:cardData("monzon",d.monzon),moena:cardData("moena",d.moena)};
  hero.innerHTML=makeHeroCard(mainStationsCache.vigo);
  box.innerHTML=["monzon","moena"].map(k=>makeCompactCard(mainStationsCache[k],k)).join("");
  status.textContent=`Pagina aggiornata alle ${time(d.workerTimestamp)}`;
  status.className="worker-status ok";
  attachStationClickHandlers();
 }catch(e){
  console.error(e);
  hero.innerHTML=makeHeroCard({...MAIN_STATIONS.vigo,error:"Impossibile leggere i dati in questo momento"});
  box.innerHTML=["monzon","moena"].map(k=>makeCompactCard({...MAIN_STATIONS[k],error:"Impossibile leggere i dati in questo momento"},k)).join("");
  status.textContent="⚠️ Dati principali non disponibili"; status.className="worker-status error";
 }
}
load();
