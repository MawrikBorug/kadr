/* КАДР PWA — versioned shell cache. Updating the cache never touches localStorage. */
const BUILD='4.1.0-ios-premium-v11';
const SHELL_CACHE=`kadr-shell-${BUILD}`;
const SHELL=[
  './','./index.html','./manifest.webmanifest',
  './assets/brand/logo-lockup.svg','./assets/brand/logo-compact.svg','./assets/brand/logo-mark.svg',
  './assets/brand/favicon.svg','./assets/brand/icon.svg','./assets/brand/apple-touch-icon.png',
  './assets/brand/icon-192.png','./assets/brand/icon-512.png','./assets/brand/fonts.css',
  './assets/brand/icons/home.png','./assets/brand/icons/catalog-grid.png','./assets/brand/icons/list.png','./assets/brand/icons/bookmark.png','./assets/brand/icons/collections.png','./assets/brand/icons/shuffle.png','./assets/brand/icons/settings.png','./assets/brand/icons/search.png','./assets/brand/icons/filter.png','./assets/brand/icons/menu.png','./assets/brand/icons/more.png','./assets/brand/icons/close.png','./assets/brand/icons/back.png','./assets/brand/icons/forward.png','./assets/brand/icons/expand-up.png','./assets/brand/icons/collapse-down.png','./assets/brand/icons/add.png','./assets/brand/icons/check.png','./assets/brand/icons/favorite-outline.png','./assets/brand/icons/favorite-filled.png','./assets/brand/icons/play.png','./assets/brand/icons/watched.png','./assets/brand/icons/watching.png','./assets/brand/icons/dropped.png','./assets/brand/icons/film.png','./assets/brand/icons/series.png','./assets/brand/icons/anime.png','./assets/brand/icons/cast.png','./assets/brand/icons/director.png','./assets/brand/icons/duration.png','./assets/brand/icons/calendar.png','./assets/brand/icons/tag.png','./assets/brand/icons/gallery.png','./assets/brand/icons/external-link.png','./assets/brand/icons/refresh.png','./assets/brand/icons/backup.png',
  './assets/brand/fonts/KADR-Sans-Regular.woff2','./assets/brand/fonts/KADR-Sans-Bold.woff2','./assets/brand/fonts/KADR-Display-Regular.woff2','./assets/brand/fonts/Inter-Regular.woff2','./assets/brand/fonts/Inter-SemiBold.woff2','./assets/brand/fonts/Inter-Bold.woff2','./assets/brand/fonts/InterDisplay-ExtraBold.woff2'
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);await Promise.allSettled(SHELL.map(async path=>{try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response);}catch(_){}}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>(k.startsWith('kadr-shell-')&&k!==SHELL_CACHE)||k.startsWith('kadr-dynamic-')).map(k=>caches.delete(k)));await self.clients.claim();})());
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===self.location.origin){
    // HTML navigation: try network for the newest release, then use the offline shell.
    if(req.mode==='navigate'){
      event.respondWith((async()=>{try{const net=await fetch(req);if(net.ok){const c=await caches.open(SHELL_CACHE);c.put('./index.html',net.clone()).catch(()=>{});}return net;}catch(_){return (await caches.match(req))||(await caches.match('./index.html'))||Response.error();}})());return;
    }
    event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;try{const net=await fetch(req);if(net.ok){const c=await caches.open(SHELL_CACHE);c.put(req,net.clone()).catch(()=>{});}return net;}catch(_){return cached||Response.error();}})());return;
  }
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
