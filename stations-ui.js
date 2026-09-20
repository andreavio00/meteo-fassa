// Ottimizzazione stazioni principali + stazioni amatoriali di Pozza.
// Caricato PRIMA di app.js: intercetta soltanto il worker delle stazioni
// principali. WeatherCloud e Netatmo vengono richiesti in modo indipendente,
// così un loro ritardo non rallenta Vigo, Monzon, Moena o le previsioni.
(function(){
  const WORKER_HOST="meteopozza-stazioni.andrea-vio.workers.dev";
  const AMATEUR_WORKER_URL="https://meteopozza-amatoriali.andrea-vio.workers.dev/stations";
  const MAIN_CACHE_KEY="meteo-fassa-main-stations-v2";
  const AMATEUR_CACHE_KEY="meteo-fassa-pozza-amateurs-v1";
  const MAX_LOCAL_AGE=6*60*60*1000; // 6 ore
  const AMATEUR_STALE_AGE=20*60*1000; // 20 minuti
  const AMATEUR_TIMEOUT=15000;
  const nativeFetch=window.fetch.bind(window);
  const amateurStationsCache=new Map();

  // FassaWEB non pubblica le coordinate del sensore. La webcam FassaWEB di
  // Pozza dichiara pero di essere installata all'Hotel Villa Mozart: usiamo
  // quindi il centro dell'edificio come posizione indicativa, segnalandola
  // sempre come stimata nell'interfaccia.
  const FASSAWEB_STATION={
    id:"pozza-fassaweb",
    slotId:"pozza-amateur",
    name:"Villa Mozart",
    shortName:"Mozart",
    source:"FassaWEB",
    sourceUrl:"https://www.fassaweb.net/it-it/meteoestrade/datirilevatiapozzadifassa.aspx",
    latitude:46.4251934,
    longitude:11.6831425,
    coordinatesEstimated:true,
    coordinatesNote:"Posizione stimata presso Hotel Villa Mozart"
  };

  const AMATEUR_STATIONS=[
    {
      id:"pozza-cep",
      slotId:"pozza-weathercloud",
      name:"Camping Catinaccio",
      shortName:"Camping",
      source:"WeatherCloud",
      sourceUrl:"https://app.weathercloud.net/d9435079591"
    },
    {
      id:"pozza-netatmo",
      slotId:"pozza-netatmo",
      name:"Zona Le Giare",
      shortName:"Le Giare",
      source:"Netatmo",
      sourceUrl:"https://weathermap.netatmo.com/?stationid=70:ee:50:17:9e:ba&zoom=14.9"
    }
  ];

  const ALL_AMATEUR_STATIONS=[FASSAWEB_STATION,...AMATEUR_STATIONS];

  function readLocal(key){
    try{
      const cached=JSON.parse(localStorage.getItem(key)||"null");
      if(!cached?.data||!cached.savedAt)return null;
      if(Date.now()-cached.savedAt>MAX_LOCAL_AGE)return null;
      return cached;
    }catch{return null;}
  }

  function writeLocal(key,data){
    try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}
  }

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,char=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]);
  }

  function safeUrl(value,fallback="#"){
    try{
      const url=new URL(value,location.href);
      return url.protocol==="https:"||url.protocol==="http:"?url.href:fallback;
    }catch{return fallback;}
  }

  function fmtNumber(value,digits=1){
    if(value===null||value===undefined||value===""||!Number.isFinite(Number(value)))return "—";
    return Number(value).toFixed(digits).replace(".",",");
  }

  function fmtMeasure(value,unit,digits=1){
    const number=fmtNumber(value,digits);
    return number==="—"?number:`${number}${unit}`;
  }

  function fmtTime(value){
    if(!value)return "—";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "—";
    return new Intl.DateTimeFormat("it-IT",{
      timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"
    }).format(date);
  }

  function fmtCoordinate(value,axis){
    const number=Number(value);
    if(!Number.isFinite(number))return "—";
    const direction=axis==="latitude"
      ?(number>=0?"N":"S")
      :(number>=0?"E":"O");
    return `${Math.abs(number).toFixed(5).replace(".",",")}° ${direction}`;
  }

  function coordinatesHtml(station){
    const latitudeRaw=station?.latitude;
    const longitudeRaw=station?.longitude;
    if(latitudeRaw===null||latitudeRaw===undefined||latitudeRaw===""||longitudeRaw===null||longitudeRaw===undefined||longitudeRaw==="")return "";
    const latitude=Number(latitudeRaw);
    const longitude=Number(longitudeRaw);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return "";
    const label=`${fmtCoordinate(latitude,"latitude")} · ${fmtCoordinate(longitude,"longitude")}`;
    const mapUrl=`https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
    const estimated=Boolean(station.coordinatesEstimated);
    const note=station.coordinatesNote||(estimated?"Posizione indicativa":"Apri la posizione sulla mappa");
    return `<a class="amateur-coordinates ${estimated?"is-estimated":""}" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">
      <span class="amateur-coordinates-icon" aria-hidden="true">📍</span>
      <span class="amateur-coordinates-copy">
        <small>Coordinate${estimated?" stimate":""}</small>
        <strong>${escapeHtml(label)}</strong>
        <em>${escapeHtml(note)} ↗</em>
      </span>
    </a>`;
  }

  function hasStationData(station){
    return Boolean(station)&&[
      station.temperature,station.humidity,station.pressure,station.wind,
      station.windGust,station.rainToday
    ].some(value=>value!==null&&value!==undefined&&value!=="");
  }

  function windDirection(value){
    const degrees=Number(value);
    if(!Number.isFinite(degrees))return "—";
    const names=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
    const normalised=((degrees%360)+360)%360;
    return `${Math.round(normalised)}° ${names[Math.round(normalised/22.5)%16]}`;
  }

  function renderPozza(data,loading=false){
    const box=document.getElementById("pozza-amateur");
    if(!box)return;

    if(!data){
      amateurStationsCache.delete(FASSAWEB_STATION.id);
      box.innerHTML=`<article class="pozza-amateur-card ${loading?"":"is-offline"}" ${loading?'aria-busy="true"':""}>
        <div class="pozza-amateur-top">
          <div class="pozza-amateur-title"><strong>${escapeHtml(FASSAWEB_STATION.shortName)}</strong></div>
        </div>
        <div class="pozza-amateur-unavailable">${loading?"Aggiornamento dati…":"Dati momentaneamente non disponibili"}</div>
      </article>`;
      return;
    }

    const temperature=data.temperatura?.attuale??data.temperatura??null;
    const humidity=data.umidita?.attuale??data.umidita??null;
    const updated=data.aggiornamento??data.timestamp??null;
    const station={
      ...FASSAWEB_STATION,
      sourceName:"FassaWEB",
      status:data.stato==="stale"?"stale":"online",
      stale:data.stato==="stale",
      temperature,
      temperatureMin:data.temperatura?.min??null,
      temperatureMinTime:data.temperatura?.ora_min??null,
      temperatureMax:data.temperatura?.max??null,
      temperatureMaxTime:data.temperatura?.ora_max??null,
      humidity,
      pressure:data.pressione?.attuale??data.pressione??null,
      pressureChange:data.pressione?.variazione_3h??null,
      updatedAt:updated,
      latitude:data.latitude??data.coordinate?.latitude??FASSAWEB_STATION.latitude,
      longitude:data.longitude??data.coordinate?.longitude??FASSAWEB_STATION.longitude,
      coordinatesEstimated:data.coordinatesEstimated??data.coordinate?.estimated??FASSAWEB_STATION.coordinatesEstimated,
      coordinatesNote:data.coordinatesNote??data.coordinate?.note??FASSAWEB_STATION.coordinatesNote
    };
    amateurStationsCache.set(FASSAWEB_STATION.id,station);
    const stale=station.stale;

    box.innerHTML=`<article class="pozza-amateur-card pozza-extra-card ${stale?"is-stale":""}" data-amateur-id="${FASSAWEB_STATION.id}" tabindex="0" role="button" aria-label="Dettagli stazione amatoriale ${escapeHtml(FASSAWEB_STATION.name)}">
      <div class="pozza-amateur-top">
        <div class="pozza-amateur-title"><strong>${escapeHtml(FASSAWEB_STATION.shortName)}</strong></div>
        <span class="pozza-amateur-state ${stale?"is-stale":""}" aria-label="${stale?"Ultimo dato disponibile":"Dati aggiornati"}"></span>
      </div>
      <div class="pozza-amateur-values">
        <strong>${fmtMeasure(temperature,"°")}</strong>
        <span>💧 ${fmtMeasure(humidity,"%",0)}</span>
      </div>
    </article>`;
    attachAmateurHandler(box,FASSAWEB_STATION.id);
  }

  function renderAmateurPlaceholder(definition,loading=false){
    const box=document.getElementById(definition.slotId);
    if(!box)return;
    amateurStationsCache.delete(definition.id);
    box.innerHTML=`<article class="pozza-amateur-card ${loading?"":"is-offline"}" ${loading?'aria-busy="true"':""}>
      <div class="pozza-amateur-top">
        <div class="pozza-amateur-title"><strong>${escapeHtml(definition.shortName||definition.name)}</strong></div>
      </div>
      <div class="pozza-amateur-unavailable">${loading?"Aggiornamento dati…":"Dati momentaneamente non disponibili"}</div>
    </article>`;
  }

  function openAmateurModal(id){
    const station=amateurStationsCache.get(id);
    if(!station||!hasStationData(station)||typeof openModal!=="function")return;
    const definition=ALL_AMATEUR_STATIONS.find(item=>item.id===id);
    if(!definition)return;

    const isFassaWeb=id===FASSAWEB_STATION.id;
    const metrics=[
      ...(!isFassaWeb?[
        ["🌡️","Temperatura",fmtMeasure(station.temperature,"°C")],
        ["💧","Umidità",fmtMeasure(station.humidity,"%",0)]
      ]:[]),
      ...(isFassaWeb?[
        ["↘️","Temperatura minima",station.temperatureMin===null||station.temperatureMin===undefined?"—":`${fmtMeasure(station.temperatureMin,"°C")} · ${station.temperatureMinTime||"ora —"}`],
        ["↗️","Temperatura massima",station.temperatureMax===null||station.temperatureMax===undefined?"—":`${fmtMeasure(station.temperatureMax,"°C")} · ${station.temperatureMaxTime||"ora —"}`]
      ]:[]),
      ["🌡️","Punto di rugiada",fmtMeasure(station.dewPoint,"°C")],
      ["🥶","Wind chill",fmtMeasure(station.windChill,"°C")],
      ["♨️","Heat Index",fmtMeasure(station.heatIndex,"°C")],
      ["⏲️","Pressione",fmtMeasure(station.pressure," hPa")],
      ["↕️","Variazione pressione 3 h",fmtMeasure(station.pressureChange," hPa")],
      ["💨","Vento",fmtMeasure(station.wind," km/h")],
      ["🌬️","Raffica",fmtMeasure(station.windGust," km/h")],
      ["🧭","Direzione",windDirection(station.windDirection)],
      ["🌧️","Pioggia",fmtMeasure(station.rainRate," mm/h")],
      ["☔","Ultima ora",fmtMeasure(station.rainHour," mm")],
      ["☂️","Pioggia oggi",fmtMeasure(station.rainToday," mm")],
      ["☀️","Radiazione solare",fmtMeasure(station.solarRadiation," W/m²",0)],
      ["🔆","Indice UV",fmtNumber(station.uvIndex,1)]
    ].filter(([, ,value])=>value!=="—");

    const metricsHtml=metrics.length
      ?`<div class="metrics">${metrics.map(([icon,label,value])=>`<div class="metric"><span class="metric-icon">${icon}</span><span class="metric-text"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span></div>`).join("")}</div>`
      :'<p class="pozza-amateur-unavailable">Nessun altro parametro disponibile.</p>';
    const altitude=station.altitude===null||station.altitude===undefined
      ?"Quota non indicata"
      :`${fmtNumber(station.altitude,0)} m`;
    const stale=station.status==="stale"||station.stale;
    const notes=[...(Array.isArray(station.warnings)?station.warnings:[])];
    if(stale&&station.error)notes.push(station.error);
    const notesHtml=notes.length
      ?`<div class="amateur-modal-note">${notes.map(escapeHtml).join(" · ")}</div>`
      :"";

    openModal(`<div class="hero-top">
      <span class="card-icon">📍</span>
      <div><div class="station-name">${escapeHtml(definition.name||station.name)}</div><div class="quota">${escapeHtml(altitude)} · ${escapeHtml(station.source||definition.source)}</div></div>
    </div>
    <div class="hero-values" style="margin-top:14px">
      <div class="temp-humidity-row">
        <span class="value-num">${fmtMeasure(station.temperature,"°")}</span>
        <span class="value-num value-humidity">💧${fmtMeasure(station.humidity,"%",0)}</span>
      </div>
      ${metricsHtml}
    </div>
    ${coordinatesHtml(station)}
    ${notesHtml}
    <div class="data-time ${stale?"warning":"fresh"}" style="margin-top:14px"><span class="age-dot"></span>${stale?"Ultimo dato disponibile":"Rilevato"} alle <strong>${fmtTime(station.updatedAt||station.updatedAtIso)}</strong></div>
    <a class="source-button" href="${escapeHtml(safeUrl(station.sourceUrl||definition.sourceUrl,definition.sourceUrl))}" target="_blank" rel="noopener">🌐 ${escapeHtml(station.sourceName||station.source||definition.source)} ↗</a>`);
  }

  function attachAmateurHandler(box,id){
    const card=box.querySelector("[data-amateur-id]");
    if(!card)return;
    card.addEventListener("click",event=>{
      if(event.target.closest("a"))return;
      openAmateurModal(id);
    });
    card.addEventListener("keydown",event=>{
      if(event.target.closest("a"))return;
      if(event.key==="Enter"||event.key===" "){
        event.preventDefault();
        openAmateurModal(id);
      }
    });
  }

  function renderAmateurStation(definition,station,forceStale=false){
    const box=document.getElementById(definition.slotId);
    if(!box)return;
    if(!station||!hasStationData(station)){
      renderAmateurPlaceholder(definition,false);
      return;
    }

    const rendered=forceStale?{...station,status:"stale",stale:true}:station;
    amateurStationsCache.set(definition.id,rendered);
    const stale=rendered.status==="stale"||rendered.stale;
    const title=definition.name||rendered.name;
    box.innerHTML=`<article class="pozza-amateur-card pozza-extra-card ${stale?"is-stale":""}" data-amateur-id="${escapeHtml(definition.id)}" tabindex="0" role="button" aria-label="Dettagli ${escapeHtml(title)}">
      <div class="pozza-amateur-top">
        <div class="pozza-amateur-title"><strong>${escapeHtml(definition.shortName||title)}</strong></div>
        <span class="pozza-amateur-state ${stale?"is-stale":""}" aria-label="${stale?"Ultimo dato disponibile":"Dati aggiornati"}"></span>
      </div>
      <div class="pozza-amateur-values">
        <strong>${fmtMeasure(rendered.temperature,"°")}</strong>
        <span>💧 ${fmtMeasure(rendered.humidity,"%",0)}</span>
      </div>
    </article>`;
    attachAmateurHandler(box,definition.id);
  }

  function renderAmateurPayload(payload,forceStale=false){
    const stations=new Map((Array.isArray(payload?.stations)?payload.stations:[]).map(station=>[station.id,station]));
    AMATEUR_STATIONS.forEach(definition=>renderAmateurStation(definition,stations.get(definition.id),forceStale));
  }

  function mergeAmateurPayload(fresh,cached){
    const freshById=new Map((fresh.stations||[]).map(station=>[station.id,station]));
    const cachedById=new Map((cached?.stations||[]).map(station=>[station.id,station]));
    const stations=AMATEUR_STATIONS.map(definition=>{
      const current=freshById.get(definition.id);
      const previous=cachedById.get(definition.id);
      if(hasStationData(current))return current;
      if(hasStationData(previous))return {
        ...previous,
        status:"stale",
        stale:true,
        error:current?.error||"Aggiornamento temporaneamente non disponibile"
      };
      return current||previous||{
        id:definition.id,
        name:definition.name,
        source:definition.source,
        sourceUrl:definition.sourceUrl,
        status:"offline"
      };
    });
    return {...fresh,stations,count:stations.length,partial:stations.some(station=>station.status!=="online")};
  }

  function fetchWithTimeout(url,timeout){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    return nativeFetch(url,{
      signal:controller.signal,
      cache:"no-store",
      headers:{"Accept":"application/json"}
    }).finally(()=>clearTimeout(timer));
  }

  async function loadAmateurStations(){
    const cached=readLocal(AMATEUR_CACHE_KEY);
    if(cached){
      renderAmateurPayload(cached.data,Date.now()-cached.savedAt>AMATEUR_STALE_AGE);
    }

    try{
      const response=await fetchWithTimeout(AMATEUR_WORKER_URL,AMATEUR_TIMEOUT);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const fresh=await response.json();
      if(!fresh?.ok||!Array.isArray(fresh.stations))throw new Error("Formato dati inatteso");
      const merged=mergeAmateurPayload(fresh,cached?.data);
      if(merged.stations.some(hasStationData))writeLocal(AMATEUR_CACHE_KEY,merged);
      renderAmateurPayload(merged,false);
    }catch(error){
      console.warn("Stazioni amatoriali di Pozza non disponibili",error);
      if(cached)renderAmateurPayload(cached.data,true);
      else AMATEUR_STATIONS.forEach(definition=>renderAmateurPlaceholder(definition,false));
    }
  }

  function renderCachedMain(raw){
    try{
      // Queste funzioni e il binding mainStationsCache vengono definiti da app.js.
      if(typeof normalise!=="function"||typeof cardData!=="function")return;
      const hero=document.getElementById("hero-station");
      const box=document.getElementById("compact-stations");
      const status=document.getElementById("worker-status");
      if(!hero||!box)return;

      const data=normalise(raw);
      mainStationsCache={
        vigo:cardData("vigo",data.vigo),
        monzon:cardData("monzon",data.monzon),
        moena:cardData("moena",data.moena)
      };
      hero.innerHTML=makeHeroCard(mainStationsCache.vigo);
      box.innerHTML=["monzon","moena"].map(key=>makeCompactCard(mainStationsCache[key],key)).join("");
      if(status){status.textContent="Ultimi dati disponibili · aggiornamento…";status.className="worker-status";}
      attachStationClickHandlers();
      renderPozza(raw.pozza||null);
    }catch(error){console.warn("Cache locale stazioni non utilizzabile",error);}
  }

  // I tre slot sono visibili subito, senza attendere i due worker.
  renderPozza(null,true);
  AMATEUR_STATIONS.forEach(definition=>renderAmateurPlaceholder(definition,true));

  // Mostra subito gli ultimi dati buoni mentre le richieste fresche sono in corso.
  const initialMainCache=readLocal(MAIN_CACHE_KEY);
  if(initialMainCache)setTimeout(()=>renderCachedMain(initialMainCache.data),0);
  setTimeout(loadAmateurStations,0);

  window.fetch=function(input,init){
    let url;
    try{url=new URL(typeof input==="string"?input:input.url,location.href);}catch{return nativeFetch(input,init);}
    if(url.hostname!==WORKER_HOST)return nativeFetch(input,init);

    // Le richieste RAW restano sempre di debug e non vengono alterate.
    if(url.searchParams.has("raw"))return nativeFetch(input,init);

    url.searchParams.delete("_");
    return nativeFetch(url.toString(),init).then(response=>{
      if(response.ok){
        response.clone().json().then(data=>{
          if(data?.ok){
            writeLocal(MAIN_CACHE_KEY,data);
            renderPozza(data.pozza||null);
          }
        }).catch(()=>{});
      }
      return response;
    }).catch(error=>{
      // Se la rete/una fonte è lenta oltre il timeout, app.js riceve l'ultimo
      // JSON valido invece di sostituire tutte le card con un errore.
      const cached=readLocal(MAIN_CACHE_KEY);
      if(cached?.data){
        renderPozza(cached.data.pozza||null);
        return new Response(JSON.stringify(cached.data),{
          status:200,
          headers:{"Content-Type":"application/json; charset=utf-8","X-Meteo-Local-Cache":"1"}
        });
      }
      throw error;
    });
  };
})();
