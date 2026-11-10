const CACHE='street-fishing-mobile-v193';
const ASSETS=['./','./index.html','./parcours-2027.png','./app-78.js','./game-online.js','./app-78.css','./manifest.webmanifest','./icon-192.png','./apple-touch-icon.png','./icon-maskable-512.png','./icon-512.png','./logo-gardon-mortagnais.png','./vendor/supabase.bundle.mjs','./ruler-math.mjs','./ruler-centimeters.mjs'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('street-fishing-mobile-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(url.pathname.startsWith('/jeu/')||url.pathname==='/jeu'||request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){if(url.pathname==='/mentions-legales.html'||url.pathname==='/confidentialite.html'){event.respondWith(fetch(request));return}event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(request);if(response.ok){event.waitUntil(cache.put('./index.html',response.clone()));return response}return (await cache.match('./index.html'))||response}catch(e){return (await cache.match('./index.html'))||Response.error()}})());return}
 if(ASSETS.some(path=>new URL(path,self.registration.scope).pathname===url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));}
});

self.addEventListener('push',event=>{
 let id;
 try{id=event.data?.json()?.id}catch{return}
 if(typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id))return;
 event.waitUntil(self.registration.showNotification('Message du staff · Street Fishing',{
  body:'L’organisation a publié un message. Touche la notification pour le lire.',
  icon:'./icon-192.png',tag:'staff-'+id,data:{type:'staff-chat'}
 }));
});
self.addEventListener('notificationclick',event=>{
 if(event.notification.data?.type!=='staff-chat')return;
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL('./#messages',self.registration.scope);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(c=>new URL(c.url).origin===target.origin&&new URL(c.url).pathname===target.pathname);
  if(client){await client.focus();client.postMessage({type:'open-staff-chat'});return}
  await self.clients.openWindow(target.href);
 })());
});
