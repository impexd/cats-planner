/* Cat's Planner 1.1: optional standalone transport. No bot secrets in the client. */
(()=>{
'use strict';
const KEY='cats-planner-standalone-v1', PENDING=KEY+'-login';
const read=(k,store=localStorage)=>{try{return JSON.parse(store.getItem(k)||'null')}catch{return null}};
const put=(k,v,store=localStorage)=>{if(v===null)store.removeItem(k);else store.setItem(k,JSON.stringify(v))};
let device=read(KEY), token=device?.passkey?null:device?.token||null, busy=false, started=false, hiddenAt=0, loginEpoch=0, onReady=()=>{}, onClear=async()=>{}, pollTimer=null, gate, message;
const standalone=()=>!window.Telegram?.WebApp?.initData;
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const hasSession=()=>!!token;
const h=()=>token?{'X-Planner-Session':token}:{};
const desc=()=>device;
function el(t,text,cls){const x=document.createElement(t);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function button(label,fn,cls='secondary'){const b=el('button',label,cls);b.type='button';b.onclick=fn;return b;}
function msg(t){if(message)message.textContent=t;}
function storeDevice(){if(!device)return;const safe={device:device.device,uid:device.uid,passkey:!!device.passkey};if(!safe.passkey&&token)safe.token=token;put(KEY,safe);}
async function request(path,body,auth=false,method='POST',signal){if(!window.PLANNER_API)throw Error('Не настроен адрес сервера');const r=await fetch(window.PLANNER_API+'/pwa/'+path,{method,signal,headers:{'Content-Type':'application/json',...(auth?h():{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})}),cache:'no-store',credentials:'omit'});let j={};try{j=await r.json()}catch{}if(!r.ok){const e=Error(j.detail||'Не удалось выполнить запрос');e.status=r.status;throw e;}return j;}
function base64(v){return btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function bytes(v){return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4)),x=>x.charCodeAt(0));}
function platformLabel(){const ua=navigator.userAgent;return /iPhone|iPad/i.test(ua)?'iPhone / iPad':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Mac/i.test(ua)?'Mac':'Веб-приложение';}
function credentialJSON(c){if(!c)throw Error('Действие отменено');if(typeof c.toJSON==='function')return c.toJSON();const r=c.response,out={id:c.id,rawId:base64(c.rawId),type:c.type,authenticatorAttachment:c.authenticatorAttachment,clientExtensionResults:c.getClientExtensionResults(),response:{clientDataJSON:base64(r.clientDataJSON)}};for(const key of ['attestationObject','authenticatorData','signature','userHandle'])if(r[key])out.response[key]=base64(r[key]);if(r.getTransports)out.response.transports=r.getTransports();return out;}
function publicOptions(o,registration){if(registration&&PublicKeyCredential.parseCreationOptionsFromJSON)return PublicKeyCredential.parseCreationOptionsFromJSON(o);if(!registration&&PublicKeyCredential.parseRequestOptionsFromJSON)return PublicKeyCredential.parseRequestOptionsFromJSON(o);const x={...o,challenge:bytes(o.challenge)};if(o.user)x.user={...o.user,id:bytes(o.user.id)};for(const k of ['allowCredentials','excludeCredentials'])if(o[k])x[k]=o[k].map(v=>({...v,id:bytes(v.id)}));return x;}
function clearPoll(){clearTimeout(pollTimer);pollTimer=null;}
function gateUI(text){document.body.classList.add('pwa-gated');if(!gate){gate=el('section',undefined,'pwa-gate');gate.id='pwaGate';const panel=el('div',undefined,'pwa-panel');const logo=el('img');logo.src='assets/planner-icon-192.png';logo.alt='';logo.className='pwa-logo';panel.append(logo,el('h1','Cat’s Planner'),el('p','Маленькие планы, большие мечты.','pwa-tagline'));message=el('p','','pwa-message');message.setAttribute('role','status');panel.append(message);const actions=el('div',undefined,'pwa-actions');actions.id='pwaGateActions';panel.append(actions,el('p','Личное пространство только для двоих.','pwa-caption'));gate.append(panel);document.body.append(gate);}gate.hidden=false;const actions=document.getElementById('pwaGateActions');actions.replaceChildren();if(device?.passkey)actions.append(button('Разблокировать ключом доступа',()=>unlock(),'pwa-primary'));actions.append(button(device?.passkey?'Войти заново через Telegram':'Войти через Telegram',()=>login(),device?.passkey?'secondary':'pwa-primary'));if(!installed())actions.append(button('Как установить приложение',()=>installHelp()));msg(text||'Войдите, чтобы открыть ваши совместные планы.');}
function showReady(){if(gate)gate.hidden=true;document.body.classList.remove('pwa-gated','pwa-privacy');onReady();}
async function accept(data){if(!data||typeof data.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.token)||!Number.isSafeInteger(data.uid)||typeof data.device!=='string')throw Error('Некорректная сессия');if(device&&Number(device.uid)!==data.uid)await onClear(Number(device.uid),false);device={device:data.device,uid:data.uid,passkey:!!data.passkey};token=data.token;try{storeDevice()}catch{msg('Сессия действует до закрытия приложения: постоянное хранение недоступно.')}clearPoll();try{put(PENDING,null,sessionStorage)}catch{};showReady();}
async function poll(c,epoch){if(epoch!==loginEpoch)return;try{const r=await request('poll',{id:c.id,proof:c.proof,label:platformLabel()});if(epoch!==loginEpoch)return;if(r.pending){if(Date.now()>c.deadline)throw Error('Время входа истекло. Начните заново.');pollTimer=setTimeout(()=>void poll(c,epoch),2000);return}await accept(r);busy=false;}catch(e){if(epoch!==loginEpoch)return;if(!e.status&&Date.now()<c.deadline){msg('Нет связи. Проверим вход после восстановления сети.');pollTimer=setTimeout(()=>void poll(c,epoch),3000);return;}busy=false;try{put(PENDING,null,sessionStorage)}catch{}gateUI(e.message||'Не удалось войти');}}
async function login(){if(busy)return;busy=true;const epoch=++loginEpoch;let popup=null;try{popup=window.open('about:blank','_blank');if(popup)popup.opener=null;}catch{}try{const c=await request('start',{});if(epoch!==loginEpoch)return;const u=new URL(c.url);if(u.origin!=='https://oauth.telegram.org'||u.pathname!=='/auth')throw Error('Неверный адрес авторизации');c.deadline=Date.now()+590000;try{put(PENDING,c,sessionStorage)}catch{}msg('Подтвердите вход в Telegram и вернитесь сюда.');const actions=document.getElementById('pwaGateActions');actions.replaceChildren();const link=el('a','Открыть Telegram Login','pwa-external');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';actions.append(link,button('Отмена',()=>{loginEpoch++;clearPoll();busy=false;try{put(PENDING,null,sessionStorage)}catch{}gateUI()}));if(popup)try{popup.location.href=u.href}catch{};void poll(c,epoch);}catch(e){if(popup)try{popup.close()}catch{}busy=false;gateUI(e.message);}}
let offlineTools, offlineOpen=false;
async function offerOffline() {
  const uid=Number(device?.uid);
  let available=false;
  try { available=!!uid && await offlineTools?.exists(uid); } catch {}
  gateUI(available?'Нет связи с сервером. На устройстве есть защищённая копия.':'Нет связи с сервером. Для входа нужна сеть. На устройстве нет доступной копии.');
  if (!available) return;
  document.getElementById('pwaGateActions').prepend(button('Открыть офлайн-копию',async()=>{
    if(busy)return;
    busy=true;
    try {
      if(await offlineTools.open(uid)){
        offlineOpen=true;
        gate.hidden=true;
        document.body.classList.remove('pwa-gated');
        const reconnect=button('Войти для синхронизации',async()=>{
          if(busy)return;
          await offlineTools.save();
          await unlock();
          if(token){reconnect.remove();offlineOpen=false;await offlineTools.sync()}
        },'secondary');
        document.getElementById('error').after(reconnect);
      }
    } finally {busy=false}
  },'pwa-primary'));
}
async function unlockRequest(path,body) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try {return await request(path,body,false,'POST',controller.signal)}
  catch(e){if(!e.status||e.status>=500)e.networkUnavailable=true;throw e}
  finally{clearTimeout(timer)}
}
async function unlock(){
  if(busy||!device?.passkey)return;
  busy=true;
  try{
    if(navigator.onLine===false){if(!offlineOpen)await offerOffline();return}
    if(!window.PublicKeyCredential||!navigator.credentials){msg('Ключи доступа не поддерживаются. Войдите через Telegram.');return}
    msg('Ожидаем подтверждение входа…');
    const c=await unlockRequest('unlock-options',{device:device.device});
    const response=credentialJSON(await navigator.credentials.get({publicKey:publicOptions(c.options,false)}));
    await accept(await unlockRequest('unlock',{id:c.id,proof:c.proof,response}));
  }catch(e){
    if(e.networkUnavailable&&!offlineOpen)await offerOffline();
    else if(offlineOpen)document.getElementById('error').textContent=e.message||'Войдите повторно для синхронизации';
    else msg(e.name==='NotAllowedError'?'Вход не завершён. Нажмите кнопку, чтобы попробовать снова.':e.message||'Не удалось разблокировать');
  }finally{busy=false}
}
async function lock(manual=false){if(!device?.passkey)return;if(manual)try{sessionStorage.setItem(KEY+'-manual-lock','1')}catch{};document.body.classList.add('pwa-privacy');const old=token;token=null;try{storeDevice()}catch{};if(old)try{fetch(window.PLANNER_API+'/pwa/lock',{method:'POST',headers:{'Content-Type':'application/json','X-Planner-Session':old},body:'{}',cache:'no-store',keepalive:true,credentials:'omit'}).catch(()=>{})}catch{};location.reload();}
function invalid(text){if(!standalone()||!token)return;token=null;if(device){try{storeDevice()}catch{}}document.body.classList.add('pwa-privacy');location.reload();}
async function registerPasskey(){if(!window.PublicKeyCredential||!navigator.credentials)throw Error('Ключи доступа не поддерживаются в этом браузере');if(!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw Error('Системная проверка пользователя недоступна');const c=await request('register-options',{},true);const response=credentialJSON(await navigator.credentials.create({publicKey:publicOptions(c.options,true)}));await request('register',{id:c.id,proof:c.proof,response},true);device.passkey=true;try{localStorage.removeItem(KEY);storeDevice()}catch{throw Error('Ключ создан, но устройство не сохранилось. При следующем входе потребуется Telegram.');}}
async function pushEnable(){if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('Web Push недоступен. На iPhone установите приложение на экран Домой.');if(await Notification.requestPermission()!=='granted')throw Error('Разрешите уведомления в настройках устройства');const status=await request('status',null,false,'GET');if(!status.push)throw Error('На сервере ещё не настроены ключи Web Push');const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(status.vapid)});await request('push',{subscription:sub.toJSON()},true);}
async function pushDisable(){await request('push',{subscription:null},true);const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe();}
async function signout(revoke,clear=true){document.body.classList.add('pwa-privacy');if(revoke&&device?.device)await revoke(device.device);if(clear&&device?.uid)try{await onClear(Number(device.uid),true)}catch{console.warn('Не удалось удалить локальную копию');}token=null;device=null;try{put(KEY,null);put(PENDING,null,sessionStorage)}catch{};try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe();}catch{}location.reload();}
function installHelp(){const d=el('dialog',undefined,'pwa-help');d.append(el('h2','Установка Cat’s Planner'),el('p','iPhone / iPad: откройте сайт в Safari → Поделиться → На экран «Домой» → Открыть как веб-приложение (если есть переключатель). Затем запустите с новой иконки.'),el('p','Android: Chrome → меню → Установить приложение / Добавить на главный экран.'),el('p','Компьютер: Chrome или Edge → значок установки в адресной строке либо меню браузера.'),button('Закрыть',()=>d.close()));document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();}
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
async function install(){if(installPrompt){const p=installPrompt;installPrompt=null;await p.prompt();return;}installHelp();}
function start(ready,clear,tools){offlineTools=tools;if(started)return;started=true;onReady=ready;onClear=clear;if(!standalone()){ready();return;}if(token){showReady();return;}gateUI(device?.passkey?'Подтвердите личность, чтобы продолжить.':'Войдите, чтобы открыть ваши совместные планы.');const c=read(PENDING,sessionStorage);if(c&&Date.now()<c.deadline){busy=true;msg('Проверяем завершение входа…');void poll(c,++loginEpoch);}else if(device?.passkey){try{if(sessionStorage.getItem(KEY+'-manual-lock')){sessionStorage.removeItem(KEY+'-manual-lock');return}}catch{}if(document.hidden)document.addEventListener("visibilitychange",()=>{if(!document.hidden)void unlock()},{once:true});else void unlock()}else if(navigator.onLine===false)void offerOffline();}
document.addEventListener('visibilitychange',()=>{if(!standalone()||!device?.passkey||(!token&&!offlineOpen))return;if(document.hidden){hiddenAt=Date.now();document.body.classList.add('pwa-privacy');}else if(hiddenAt&&Date.now()-hiddenAt>=60000){if(offlineOpen)location.reload();else void lock();}else{hiddenAt=0;document.body.classList.remove('pwa-privacy');}});
window.PlannerStandalone={standalone,installed,hasSession,headers:h,desc,uid:()=>token?Number(device?.uid)||0:0,request,start,invalid,lock,registerPasskey,pushEnable,pushDisable,signout,install};
})();
