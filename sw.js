/* Cat's Planner Final Cleanup: cache only public, same-origin static files. Never cache API or user data. */
const CACHE='cats-planner-shell-100rc4hf5';
const SHELL=['./','./index.html','./style.css?v=100rc4hf5','./app.js?v=100rc4hf5','./config.js?v=100rc4hf5','./assets/dreamy-theme-reference.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(SHELL.slice(0,5));try{await cache.add(SHELL[5])}catch{}await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('cats-planner-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url),base=new URL(self.registration.scope);
 if(req.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 const rel=url.pathname.slice(base.pathname.length);
 if(req.mode==='navigate'&&(rel===''||rel==='index.html')){event.respondWith(fetch(req).catch(async()=>await caches.match(new URL('./index.html',base).href)||Response.error()));return}
 if(!SHELL.slice(2).map(x=>new URL(x,base).href).includes(url.href))return;
 event.respondWith(fetch(req).catch(async()=>await caches.match(req)||Response.error()));
});
