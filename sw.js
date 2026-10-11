/* КАДР PWA — versioned shell cache. Updating the cache never touches localStorage. */
const BUILD='3.2.1';
const SHELL_CACHE=`kadr-shell-${BUILD}`;
const DYNAMIC_CACHE='kadr-dynamic-v2';
const SHELL=[
  './','./index.html','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png',
  './assets/brand/logo-lockup.svg','./assets/brand/logo-compact.svg','./assets/brand/logo-mark.svg',
  './assets/brand/favicon.svg','./assets/brand/icon.svg','./assets/brand/apple-touch-icon.png',
  './assets/brand/icon-192.png','./assets/brand/icon-512.png','./assets/brand/fonts.css',
  './assets/brand/fonts/KADR-Sans-Regular.woff2','./assets/brand/fonts/KADR-Sans-Bold.woff2','./assets/brand/fonts/KADR-Display-Regular.woff2','./assets/brand/fonts/Inter-Regular.woff2','./assets/brand/fonts/Inter-SemiBold.woff2','./assets/brand/fonts/Inter-Bold.woff2','./assets/brand/fonts/InterDisplay-ExtraBold.woff2'
];
const IMAGE_HOSTS=new Set(['image.tmdb.org','upload.wikimedia.org','commons.wikimedia.org','m.media-amazon.com','cdn.myanimelist.net','images-na.ssl-images-amazon.com','www.newdvdreleasedates.com','cdn.teater.co','sollywood.com.sa','cdn.kinocheck.com','image.kinopoisk.ru','avatars.mds.yandex.net']);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);await Promise.allSettled(SHELL.map(async path=>{try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response);}catch(_){}}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('kadr-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());
});
async function trimImages(cache,maxEntries=160){const keys=await cache.keys();if(keys.length<=maxEntries)return;await Promise.all(keys.slice(0,keys.length-maxEntries).map(k=>cache.delete(k)));}
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===self.location.origin){
    // HTML navigation: try network for the newest release, then use the offline shell.
    if(req.mode==='navigate'){
      event.respondWith((async()=>{try{const net=await fetch(req);if(net.ok){const c=await caches.open(SHELL_CACHE);c.put('./index.html',net.clone()).catch(()=>{});}return net;}catch(_){return (await caches.match(req))||(await caches.match('./index.html'))||Response.error();}})());return;
    }
    event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;try{const net=await fetch(req);if(net.ok){const c=await caches.open(SHELL_CACHE);c.put(req,net.clone()).catch(()=>{});}return net;}catch(_){return cached||Response.error();}})());return;
  }
  if(IMAGE_HOSTS.has(url.hostname)){
    event.respondWith((async()=>{const cache=await caches.open(DYNAMIC_CACHE);const cached=await cache.match(req);if(cached)return cached;try{const net=await fetch(req);if(net.ok&&Number(req.headers.get('content-length')||0)<8000000){await cache.put(req,net.clone());await trimImages(cache);}return net;}catch(_){return cached||Response.error();}})());
  }
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
