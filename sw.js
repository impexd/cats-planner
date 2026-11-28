/* Static shell only: never cache authenticated API requests or callback URLs. */
const CACHE='cats-planner-shell-121';
const REQUIRED=['./index.html','./style.css?v=121','./app.js?v=121','./standalone.js?v=121','./config.js?v=121','./manifest.json','./assets/planner-icon-192.png','./assets/planner-icon-512.png','./assets/planner-icon-180.png'];
const OPTIONAL=['./assets/dreamy-theme-reference.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(REQUIRED);for(const f of OPTIONAL)try{await c.add(f)}catch{}await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('cats-planner-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const req=event.request,u=new URL(req.url),base=new URL(self.registration.scope);if(req.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;const rel=u.pathname.slice(base.pathname.length);if(req.mode==='navigate'&&(rel===''||rel==='index.html')){event.respondWith(fetch(req).catch(async()=>await caches.match(new URL('./index.html',base).href)||Response.error()));return;}if(![...REQUIRED,...OPTIONAL].map(x=>new URL(x,base).href).includes(u.href))return;event.respondWith(fetch(req).catch(async()=>await caches.match(req)||Response.error()));});
self.addEventListener('push',event=>{
  let item=null;
  try {const id=event.data?.json()?.item;if(Number.isSafeInteger(id)&&id>0)item=id} catch {}
  event.waitUntil(self.registration.showNotification('Cat’s Planner',{
    body:'У вас новые планы или напоминания. Откройте приложение.',
    icon:new URL('./assets/planner-icon-192.png',self.registration.scope).href,
    tag:'cats-planner-'+(item||'updates'),data:{item}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const item=event.notification.data?.item,url=new URL('./',self.registration.scope);
    url.searchParams.set('source','pwa');url.searchParams.set(item?'item':'inbox',String(item||1));
    for(const client of await self.clients.matchAll({type:'window'})){
      if(!client.url.startsWith(self.registration.scope))continue;
      await client.focus();client.postMessage({type:'planner-notification',item});return;
    }
    return self.clients.openWindow(url.href);
  })());
});
