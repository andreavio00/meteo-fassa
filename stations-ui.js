// Ottimizzazione stazioni principali + card locale Pozza/FassaWEB.
// Caricato PRIMA di app.js: intercetta solo la richiesta al worker stazioni,
// elimina il cache-buster ?_=... e conserva l'ultimo JSON valido in localStorage.
(function(){
  const WORKER_HOST = "meteopozza-stazioni.andrea-vio.workers.dev";
  const CACHE_KEY = "meteo-fassa-main-stations-v2";
  const MAX_LOCAL_AGE = 6 * 60 * 60 * 1000; // 6 ore
  const nativeFetch = window.fetch.bind(window);

  function readLocal(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
      if(!cached?.data || !cached.savedAt) return null;
      if(Date.now()-cached.savedAt>MAX_LOCAL_AGE) return null;
      return cached;
    }catch{return null;}
  }

  function writeLocal(data){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}));}catch{}
  }

  function fmtNumber(v,d=1){
    if(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))return "—";
    return Number(v).toFixed(d).replace(".",",");
  }

  function fmtTime(v){
    if(!v)return "—";
    const d=new Date(v);
    if(Number.isNaN(d.getTime()))return "—";
    return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(d);
  }

  function renderPozza(data){
    const box=document.getElementById("pozza-amateur");
    if(!box)return;

    if(!data){
      box.innerHTML=`<article class="station-card pozza-amateur-card pozza-amateur-offline">
        <div class="pozza-amateur-top">
          <div class="pozza-amateur-title">📍 <strong>Pozza di Fassa</strong></div>
          <div class="pozza-amateur-badge">AMATORIALE</div>
        </div>
        <div class="pozza-amateur-unavailable">Dati momentaneamente non disponibili</div>
        <div class="pozza-amateur-footer"><span>Dati non ufficiali</span></div>
      </article>`;
      return;
    }

    const temp=data.temperatura?.attuale??data.temperatura??null;
    const humidity=data.umidita?.attuale??data.umidita??null;
    const updated=data.aggiornamento??data.timestamp??null;

    box.innerHTML=`<article class="station-card pozza-amateur-card" aria-label="Stazione amatoriale Pozza di Fassa">
      <div class="pozza-amateur-top">
        <div class="pozza-amateur-title">📍 <strong>Pozza di Fassa</strong></div>
        <div class="pozza-amateur-badge">AMATORIALE</div>
      </div>
      <div class="pozza-amateur-values">
        <strong>${fmtNumber(temp)}°</strong>
        <span>💧 ${fmtNumber(humidity,0)}%</span>
      </div>
      <div class="pozza-amateur-footer">
        <span>Dati non ufficiali · ${fmtTime(updated)}</span>
        <a class="pozza-amateur-source" href="https://www.fassaweb.net/it-it/meteoestrade/datirilevatiapozzadifassa.aspx" target="_blank" rel="noopener">Fonte ↗</a>
      </div>
    </article>`;
  }

  function renderCachedMain(raw){
    try{
      // Queste funzioni e il binding mainStationsCache vengono definiti da app.js.
      if(typeof normalise!=="function"||typeof cardData!=="function")return;
      const hero=document.getElementById("hero-station");
      const box=document.getElementById("compact-stations");
      const status=document.getElementById("worker-status");
      if(!hero||!box)return;

      const d=normalise(raw);
      mainStationsCache={
        vigo:cardData("vigo",d.vigo),
        monzon:cardData("monzon",d.monzon),
        moena:cardData("moena",d.moena)
      };
      hero.innerHTML=makeHeroCard(mainStationsCache.vigo);
      box.innerHTML=["monzon","moena"].map(k=>makeCompactCard(mainStationsCache[k],k)).join("");
      if(status){status.textContent="Ultimi dati disponibili · aggiornamento…";status.className="worker-status";}
      attachStationClickHandlers();
      renderPozza(raw.pozza||null);
    }catch(err){console.warn("Cache locale stazioni non utilizzabile",err);}
  }

  // Mostra subito l'ultimo dato buono mentre la richiesta fresca è in corso.
  const initialCache=readLocal();
  if(initialCache){
    setTimeout(()=>renderCachedMain(initialCache.data),0);
  }

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
            writeLocal(data);
            renderPozza(data.pozza||null);
          }
        }).catch(()=>{});
      }
      return response;
    }).catch(error=>{
      // Se la rete/una fonte è lenta oltre il timeout, app.js riceve l'ultimo
      // JSON valido invece di sostituire tutte le card con un errore.
      const cached=readLocal();
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
