/* Forecast UI enhancements kept separate from the weather/data logic. */
(function(){
  function rangeLabel(hour){
    const hh=parseInt(String(hour||"00:00").split(":")[0],10);
    if(!Number.isFinite(hh))return hour||"—";
    return `${String(hh).padStart(2,"0")}–${String((hh+2)%24).padStart(2,"0")}`;
  }
  window.forecastRangeLabel=rangeLabel;

  function isThunder(text){
    return /tempor|thunder|⛈|⚡/i.test(String(text||""));
  }

  function upgradePreview(){
    const preview=document.getElementById("forecast-preview");
    if(!preview)return;

    const old=preview.querySelector(".forecast-preview-line");
    if(old){
      const parts=[...old.children];
      if(parts.length>=4){
        const when=parts[0].textContent.trim();
        const m=when.match(/^(.*)\s(\d{2}:\d{2})$/);
        const label=m?rangeLabel(m[2]):when;
        const weatherText=parts[1].textContent.trim();
        const weatherIcon=(weatherText.match(/[☀️⛅☁️🌦️🌧️⛈️🌨️]/u)||["🌤️"])[0];
        const condition=weatherText.replace(weatherIcon,"").trim();
        preview.className="forecast-preview";
        preview.innerHTML=`<span class="forecast-preview-icon">${weatherIcon}</span><span class="forecast-preview-time">${label}</span><span class="forecast-preview-condition">${condition}</span><strong class="forecast-preview-temp">${parts[2].textContent.trim()}</strong><span class="forecast-preview-rain">${parts[3].textContent.trim()}</span>`;
      }
    }
  }

  function upgradeCards(){
    document.querySelectorAll(".forecast-hour").forEach(el=>{
      if(/^\d{2}:\d{2}$/.test(el.textContent.trim()))el.textContent=rangeLabel(el.textContent.trim());
    });

    document.querySelectorAll("#forecast-grid .forecast-item").forEach(card=>{
      card.classList.toggle("forecast-thunder",isThunder(card.textContent));
    });

    document.querySelectorAll("#forecast-tabs .forecast-tab").forEach(tab=>{
      tab.classList.toggle("forecast-thunder",isThunder(tab.textContent));
    });
  }

  function centerActiveDay(){
    const active=document.querySelector("#forecast-tabs .forecast-tab.active");
    if(active)active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
  }

  function upgrade(){
    upgradePreview();
    upgradeCards();
    centerActiveDay();
  }

  document.addEventListener("DOMContentLoaded",()=>{
    const heading=document.querySelector(".forecast-heading");
    if(heading){
      const small=heading.querySelector("small");
      if(small&&small.id==="forecast-preview"){
        small.removeAttribute("id");
        small.textContent="San Giovanni di Fassa";
        const preview=document.createElement("span");
        preview.id="forecast-preview";
        preview.className="forecast-preview";
        preview.textContent="Caricamento…";
        heading.parentNode.insertBefore(preview,heading.nextSibling);
      }
    }

    const root=document.getElementById("forecast-details");
    if(root){
      const observer=new MutationObserver(()=>requestAnimationFrame(upgrade));
      observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class"]});
      root.addEventListener("click",()=>setTimeout(upgrade,30));
    }
    setTimeout(upgrade,100);
  });
})();
