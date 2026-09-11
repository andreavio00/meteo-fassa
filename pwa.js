(function(){
  if(!("serviceWorker" in navigator))return;

  const installButton=document.getElementById("pwa-install");
  let installPrompt=null;

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    installPrompt=event;
    if(installButton)installButton.hidden=false;
  });

  if(installButton){
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
    if(installButton)installButton.hidden=true;
  });

  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js",{scope:"./"})
      .then(registration=>registration.update())
      .catch(error=>console.warn("Service worker non disponibile",error));
  });
})();
