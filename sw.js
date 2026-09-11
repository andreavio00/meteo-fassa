const CACHE_NAME="meteo-fassa-pwa-v1";
const APP_SHELL=[
  "./",
  "./index.html",
  "./escursioni.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./style.css",
  "./stations-ui.css",
  "./forecast-ui.css",
  "./escursioni.css",
  "./trip-config.js",
  "./stations-ui.js",
  "./app.js",
  "./forecast-ui.js",
  "./escursioni.js",
  "./pwa.js",
  "./icons/favicon-64.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(names=>Promise.all(
        names
          .filter(name=>name.startsWith("meteo-fassa-pwa-")&&name!==CACHE_NAME)
          .map(name=>caches.delete(name))
      ))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request,fallbackUrl){
  const cache=await caches.open(CACHE_NAME);

  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;

    if(fallbackUrl){
      const fallback=await caches.match(fallbackUrl);
      if(fallback)return fallback;
    }

    return caches.match("./offline.html");
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);

  // I JSON meteo esterni mantengono la propria cache applicativa e non
  // vengono salvati dal service worker.
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    const fallback=url.pathname.endsWith("/escursioni.html")
      ?"./escursioni.html"
      :"./index.html";
    event.respondWith(networkFirst(request,fallback));
    return;
  }

  event.respondWith(networkFirst(request));
});
