(function(){
  const installButton=document.getElementById("pwa-install");
  const moenaAppUrl="https://moenalive.andrea-vio.workers.dev/";
  const isMoenaPage=document.body.classList.contains("moena-body");
  const isDedicatedMoenaOrigin=location.hostname==="moenalive.andrea-vio.workers.dev";
  const openDedicatedMoenaApp=isMoenaPage&&!isDedicatedMoenaOrigin;

  if(installButton&&openDedicatedMoenaApp){
    installButton.textContent="Apri MoenaLive";
    installButton.hidden=false;
    installButton.addEventListener("click",()=>location.assign(moenaAppUrl));
  }

  if(!("serviceWorker" in navigator))return;

  let installPrompt=null;

  window.addEventListener("beforeinstallprompt",event=>{
    if(openDedicatedMoenaApp)return;
    event.preventDefault();
    installPrompt=event;
    if(installButton)installButton.hidden=false;
  });

  if(installButton&&!openDedicatedMoenaApp){
    installButton.addEventListener("click",async()=>{
      if(!installPrompt)return;
      installButton.hidden=true;
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt=null;
    });
  }

  window.addEventListener("appinstalled",()=>{
    installPrompt=null;
    if(installButton&&!openDedicatedMoenaApp)installButton.hidden=true;
  });

  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js",{
      scope:"./",
      updateViaCache:"none"
    })
      .then(registration=>registration.update())
      .catch(error=>console.warn("Service worker non disponibile",error));
  });
})();
