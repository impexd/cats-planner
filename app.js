"use strict";
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (id) => document.getElementById(id);
let state = { items: [], categories: [], uid: 0, enabled: true, profiles: [], dates: [], prefs: null };
let page = 'home', cat = null, editing = null, month = new Date(), selectedDay = null, loading = false, showHiddenCategories = false, editingCategory = null, listOrigin = 'home';

const defaultCategoryColors = ['#8b6fbf','#f59eb1','#7d85e8','#7e96d9','#88c7d8','#f7b686','#a98fe0','#94c7a8'];
const defaultIcons = ['📋','🎁','🎬','📍','🛒','✈️','📅','💡'];

function node(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function btn(text, fn, cls='secondary') {
  const b = node('button', text, cls);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function error(e) { $('error').textContent = e?.message || String(e); }

async function api(path, method='GET', body) {
  const r = await fetch(window.PLANNER_API + '/api/' + path, {
    method,
    headers: {
      'X-Telegram-Init-Data': tg?.initData || '',
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Проверьте введённые данные');
  return data;
}
let refreshTask;
function refresh() {
  if (loading) return refreshTask;
  refreshTask=refreshNow(); return refreshTask;
}
async function refreshNow() {
  loading = true;
  try {
    state = await api('state');
    applyPrefs();
    if (!cat && state.categories.length) cat = visibleCategories()[0]?.id ?? state.categories[0].id;
    $('error').textContent = '';
    render();
  } catch (e) { error(e); }
  finally { loading = false; }
}
async function mutate(path, method, body) {
  try {
    await api(path, method, body);
    if(loading) await refreshTask;
    await refresh();
    return true;
  } catch (e) {
    error(e);
    return false;
  }
}
function go(p) {
  page = p;
  for (const s of ['home','list','calendar','stats','more','searchPage']) $(s).hidden = s !== p;
  render();
}
function local(s) {
  return s ? new Date(s).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
function localInput(s) {
  if (!s) return '';
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function daykey(d) { return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function hexToRgba(hex, alpha=0.22){
  const h = (hex||'#8b6fbf').replace('#','');
  const v = h.length===3 ? h.split('').map(x=>x+x).join('') : h;
  const n = parseInt(v,16);
  if (!Number.isFinite(n)) return `rgba(139,111,191,${alpha})`;
  const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function sortedCategories() {
  return [...state.categories].sort((a,b)=> (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}
function visibleCategories() {
  return sortedCategories().filter(c => showHiddenCategories || !c.archived);
}
function categoryName(c) { return c.wishlist_owner ? (Number(c.wishlist_owner) === Number(state.uid) ? 'Мой вишлист' : 'Вишлист партнёра') : c.name; }
function catById(id) { return state.categories.find(c => c.id === id); }
function itemsInCat(id) { return state.items.filter(r => r.category === id); }
function activeItemsInCat(id) { return state.items.filter(r => r.category === id && !r.done); }

function layoutMode(){try{return localStorage.getItem('cats-layout-'+state.uid)==='list'?'list':'tiles'}catch{return 'tiles'}}
let layoutOverride=null;
function currentLayout(){return layoutOverride?.uid===state.uid?layoutOverride.mode:state.prefs?.layout||layoutMode()}
async function setLayout(mode){layoutOverride={uid:state.uid,mode};render();try{localStorage.setItem('cats-layout-'+state.uid,mode)}catch{}await mutate('profile','PUT',{layout:mode});layoutOverride=null;render()}
function categoryCard(c) {
  const el = node('article', undefined, 'tile');
  el.style.setProperty('--cat-soft', hexToRgba(c.color || '#8b6fbf'));
  if (c.archived) el.classList.add('archived');
  const open = btn('', ()=>openList(c.id,'active','home'), 'tile-open');
  const icon=node('span',c.icon||'📁','tile-icon');
  const content=node('span',undefined,'tile-content');
  content.append(node('strong',categoryName(c)),node('small',`${activeItemsInCat(c.id).length} активных · ${itemsInCat(c.id).length} всего${c.archived?' · скрыта':''}`));
  open.append(icon,content);
  const manage=btn('⋯',()=>openCategoryDialog(c),'mini-btn');
  manage.setAttribute('aria-label','Управление: '+categoryName(c));
  el.append(open,manage);return el;
}
function openList(id,filter='active',origin='home') {
  cat=id; listOrigin=origin; $('search').value=''; $('filter').value=filter; $('subFilter').value='';$('tagFilter').value='';
  $('back').textContent=origin==='stats'?'‹ Статистика':'‹ Все списки'; go('list');
}

function entry(r) {
  const el = node('article', undefined, 'entry');
  const catObj = catById(r.category);
  if(r.photo){const img=node('img',undefined,'cover');img.src=r.photo;img.alt='Фото записи';img.loading='lazy';el.append(img)}
  el.append(node('h3', (r.pinned?'📌 ':'')+(r.done ? '✅ ' : '') + (r.private ? '🔒 ' : '') + r.title));
  const who = r.assignee === 'both' ? 'Вместе' : ((r.assignee === 'owner') === (r.owner === state.uid) ? 'Мне' : 'Партнёру');
  el.append(node('div', [catObj ? `${catObj.icon || '📁'} ${categoryName(catObj)}` : '', who, r.priority === 'high' ? '❗ Высокий' : r.priority === 'low' ? 'Низкий' : '', r.due ? '📅 ' + local(r.due) : '', r.reminder ? '⏰ ' + local(r.reminder) : ''].filter(Boolean).join(' · '), 'meta'));
  el.append(node('div',[r.price!=null?rub(r.price):'',r.repeat_rule&&r.repeat_rule!=='none'?'🔁 '+repeatLabel(r.repeat_rule):'',r.done&&r.completed_at?'Выполнено '+local(r.completed_at)+' · '+person(r.completed_by):'', 'Автор: '+person(r.owner)].filter(Boolean).join(' · '),'meta'));
  if (r.notes) el.append(node('p', r.notes));
  if (/^https?:\/\//i.test(r.link)) {
    const a = node('a', 'Открыть ссылку ↗');
    a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    el.append(a);
  }
  const actions = node('div', undefined, 'actions');
  actions.append(
    btn(r.done ? 'Вернуть' : '✓ Готово', ()=> mutate('items/' + r.id, 'PUT', { ...r, done: !r.done, private: !!r.private })),
    btn('Изменить', ()=> edit(r)),
    btn(r.pinned?'Открепить':'📌 Закрепить',()=>mutate('items/'+r.id,'PUT',{...r,pinned:!r.pinned})),
    btn('💬 Комментарии',()=>openComments(r)),
    btn('Удалить', ()=> { if (confirm('Переместить запись в корзину?')) mutate('items/' + r.id + '?version=' + r.version, 'DELETE'); }, 'danger-soft')
  );
  actions.append(btn('В архив',()=>life(r,'archive')));el.append(actions);
  if(r.subcategory||(r.tags||[]).length)el.append(node('p',[r.subcategory,...(r.tags||[]).map(t=>'#'+t)].filter(Boolean).join(' · '),'meta'));if(r.checklist?.length){const cl=node('div',undefined,'checklist');cl.append(node('strong',`Подзадачи ${r.checklist.filter(x=>x.done).length}/${r.checklist.length}`));r.checklist.forEach((x,i)=>{const l=node('label',undefined,'check'),b=node('input');b.type='checkbox';b.checked=x.done;b.onchange=async()=>{b.disabled=true;const list=r.checklist.map((v,k)=>k===i?{...v,done:b.checked}:v);if(!await mutate('items/'+r.id,'PUT',{...r,checklist:list})){alert($('error').textContent);b.checked=x.done;b.disabled=false}};l.append(b,node('span',x.text));cl.append(l)});el.append(cl)}return el;
}

function renderSummary() {
  const active = state.items.filter(r => !r.done).length;
  const privateItems = state.items.filter(r => r.private).length;
  $('summary').textContent = `${active} активных · ${state.items.length - active} выполнено · ${privateItems} скрытых`;
}

function renderHome() {
  renderExtrasHome();
  renderCoupleHome();
  const root = $('categories');
  const mode=currentLayout(); root.classList.toggle('list-mode',mode==='list');
  const toggle=$('layoutToggle'); toggle.textContent=mode==='tiles'?'▦':'☰'; toggle.setAttribute('aria-label',mode==='tiles'?'Переключить на список':'Переключить на плитки'); toggle.title=toggle.getAttribute('aria-label');
  root.replaceChildren();
  const list = visibleCategories();
  if (!list.length) {
    root.append(node('p', 'Нет отображаемых категорий. Создай новую категорию или включи показ скрытых.', 'meta'));
  } else {
    list.forEach(c => root.append(categoryCard(c)));
  }
  $('toggleHidden').textContent = showHiddenCategories ? 'Скрыть скрытые' : 'Показать скрытые';
}

function renderList() {
  const c = catById(cat);
  if(!c){go(listOrigin);return;}
  $('listtitle').textContent = c ? `${c.icon || '📁'} ${categoryName(c)}` : '';
  const q = $('search').value.toLowerCase(), f = $('filter').value;
  renderTaxonomy(c);const sub=$('subFilter').value,tag=$('tagFilter').value;const rows = state.items.filter(r => r.category === cat && (!sub||r.subcategory===sub)&&(!tag||(r.tags||[]).includes(tag)) && (f === 'all' || (f === 'done') === !!r.done) && matchText(r,q));
  rows.sort((a,b)=>Number(b.pinned)-Number(a.pinned));
  renderListTools(c);
  $('add').hidden=f==='done';
  $('items').replaceChildren(...(rows.length ? rows.map(entry) : [node('p', f==='done'?'Пока нет выполненных записей.':'Пока здесь пусто. Добавьте первую запись!', 'meta')]));
}

function renderCalendar() {
  const y = month.getFullYear(), m = month.getMonth();
  $('month').textContent = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const grid = $('days');
  grid.replaceChildren();
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(x => grid.append(node('small', x)));
  for (let i = 0; i < (new Date(y, m, 1).getDay() + 6) % 7; i++) grid.append(node('span',''));
  for (let d=1; d<=new Date(y,m+1,0).getDate(); d++) {
    const key = daykey(new Date(y,m,d)), n = state.items.filter(r => r.due && daykey(new Date(r.due)) === key).length + (state.dates||[]).filter(r=>dateInYear(r,y)&&daykey(dateInYear(r,y))===key).length;
    grid.append(btn(d + (n ? ' •' + n : ''), ()=> { selectedDay = selectedDay === key ? null : key; render(); }, n ? 'marked' : 'day-btn'));
  }
  const rows = state.items.filter(r => r.due && (selectedDay ? daykey(new Date(r.due)) === selectedDay : new Date(r.due).getMonth() === m && new Date(r.due).getFullYear() === y)).sort((a,b)=>a.due.localeCompare(b.due));
  renderDates(y,m);
  $('events').replaceChildren(node('h3', selectedDay ? 'Выбранный день' : 'События месяца'), ...(rows.length ? rows.map(entry) : [node('p','Нет событий','meta')]));
}

const expandedStats = new Set();
function renderStats() {
  renderHistory();
  const root = $('statistics');
  root.replaceChildren();
  for (const c of sortedCategories()) {
    const rows = state.items.filter(r => String(r.category) === String(c.id));
    const completed = rows.filter(r => r.done === true);
    const el = node('article', undefined, 'entry');
    el.style.borderColor = hexToRgba(c.color || '#8b6fbf', .42);
    const p = node('progress'); p.max = rows.length || 1; p.value = completed.length;
    const expanded = expandedStats.has(c.id);
    const toggle = btn(`${c.icon || '📁'} ${categoryName(c)} ${expanded ? '▴' : '▾'}`, () => {
      if (expandedStats.has(c.id)) expandedStats.delete(c.id); else expandedStats.add(c.id);
      renderStats();
    }, 'secondary wide');
    toggle.style.textAlign = 'left'; toggle.style.marginTop = '0';
    toggle.setAttribute('aria-expanded', String(expanded));
    el.append(toggle, node('p', `${completed.length} из ${rows.length} выполнено${c.archived ? ' · категория скрыта' : ''}`), p);
    if (expanded) {
      el.append(node('h4', 'Выполненные дела'));
      if (!completed.length) el.append(node('p', 'Пока нет выполненных записей.', 'meta'));
      for (const r of completed) {
        const item = node('div', undefined, 'entry');
        item.append(node('strong', '✅ ' + r.title),node('p',r.completed_at?local(r.completed_at)+' · '+person(r.completed_by):'Дата выполнения не записана','meta'));
        if (r.notes) item.append(node('p', r.notes));
        el.append(item);
      }
    }
    root.append(el);
  }
}

function render() {
  renderSummary();
  if (page === 'home') renderHome();
  if (page === 'list') renderList();
  if (page === 'calendar') renderCalendar();
  if (page === 'stats') renderStats();
  if (page === 'more') renderMore(); if(page==='searchPage')renderGlobal();
}

function populateCategorySelect(select, includeArchived=true, excludeId=null) {
  const list = sortedCategories().filter(c => (includeArchived || !c.archived) && c.id !== excludeId);
  select.replaceChildren(...list.map(c => {
    const o = node('option', `${c.icon || '📁'} ${categoryName(c)}`);
    o.value = c.id;
    return o;
  }));
}

function edit(r) {
  editing = r;
  const f = $('editform'), v = f.elements;
  f.reset();
  populateCategorySelect(v.category, true);
  v.category.value = String(r?.category || cat || visibleCategories()[0]?.id || state.categories[0]?.id || '');
  for (const k of ['title','notes','link','assignee','priority']) if (r) v[k].value = r[k];
  v.due.value = localInput(r?.due);
  v.reminder.value = localInput(r?.reminder);
  v.private.checked = !!r?.private;
  v.private.disabled = !!r && r.owner !== state.uid;
  v.done.checked = !!r?.done;
  v.price.value=r?.price??'';v.pinned.checked=!!r?.pinned;v.repeat_rule.value=r?.repeat_rule||'none';itemPhotoData=r?.photo||null;preview('itemPreview','removePhoto',itemPhotoData);
  $('editheading').textContent = r ? 'Редактирование записи' : 'Новая запись';
  v.subcategory.value=r?.subcategory||'';v.tags.value=(r?.tags||[]).join(', ');drawChecklist(r?.checklist||[]);$('editor').showModal();
}

function openCategoryDialog(c=null) {
  editingCategory = c;
  const form = $('categoryForm');
  form.reset();
  form.elements.id.value = c?.id || '';
  form.elements.name.value = c ? categoryName(c) : '';
  form.elements.name.readOnly=!!c?.wishlist_owner;
  form.elements.archived.disabled=!!c?.wishlist_owner;
  form.elements.icon.value = c?.icon || '';
  form.elements.color.value = c?.color || defaultCategoryColors[state.categories.length % defaultCategoryColors.length];
  form.elements.archived.checked = !!c?.archived;
  $('budgetWrap').hidden=!c?.wishlist_owner;form.elements.budget.value=c?.budget??'';
  $('catHeading').textContent = c ? 'Управление категорией' : 'Новая категория';
  $('catMeta').textContent = c ? `Записей: ${itemsInCat(c.id).length}. Активных: ${activeItemsInCat(c.id).length}.` : 'Создай категорию, выбери значок и цвет.';
  $('deleteCategory').hidden = !c || !!c.wishlist_owner;
  $('moveUp').hidden = !c;
  $('moveDown').hidden = !c;
  const wrap = $('transferWrap');
  if (c && !c.wishlist_owner && state.categories.length > 1) {
    populateCategorySelect(form.elements.transferTo, true, c.id);
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
  }
  if(!$('categoryDialog').open) $('categoryDialog').showModal();
}

async function moveCategory(dir) {
  if (!editingCategory) return;
  const order = sortedCategories();
  const idx = order.findIndex(x => x.id === editingCategory.id);
  const swap = order[idx + dir];
  if (!swap) return;
  const newOrderA = swap.sort_order;
  const newOrderB = editingCategory.sort_order;
  const ok1 = await mutate(`categories/${editingCategory.id}`, 'PUT', { sort_order: newOrderA });
  const ok2 = ok1 ? await mutate(`categories/${swap.id}`, 'PUT', { sort_order: newOrderB }) : false;
  if (ok1 && ok2) {
    editingCategory = catById(editingCategory.id);
    openCategoryDialog(editingCategory);
  }
}

$('editform').onsubmit = async (e) => {
  e.preventDefault();
  const v = e.target.elements;
  const data = {
    category: Number(v.category.value),
    title: v.title.value,
    notes: v.notes.value,
    link: v.link.value,
    due: v.due.value ? new Date(v.due.value).toISOString() : null,
    reminder: v.reminder.value ? new Date(v.reminder.value).toISOString() : null,
    private: v.private.checked,
    done: v.done.checked,
    assignee: v.assignee.value,
    priority: v.priority.value,
    price:v.price.value===''?null:Number(v.price.value),photo:itemPhotoData,pinned:v.pinned.checked,repeat_rule:v.repeat_rule.value,
    subcategory:v.subcategory.value,tags:v.tags.value.split(',').map(x=>x.trim()).filter(Boolean),checklist:readChecklist(),version: editing?.version || 0
  };
  const submit = e.target.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    if (await mutate(editing ? 'items/' + editing.id : 'items', editing ? 'PUT' : 'POST', data)) $('editor').close();
    else alert($('error').textContent);
  } finally { submit.disabled = false; }
};

$('categoryForm').onsubmit = async (e) => {
  e.preventDefault();
  const v = e.target.elements;
  const payload = {
    name: v.name.value,
    icon: v.icon.value,
    color: v.color.value,
    archived: v.archived.checked
  };
  if(editingCategory?.wishlist_owner)payload.budget=v.budget.value===''?null:Number(v.budget.value);
  const ok = editingCategory
    ? await mutate(`categories/${editingCategory.id}`, 'PUT', payload)
    : await mutate('categories', 'POST', payload);
  if (ok) $('categoryDialog').close(); else alert($('error').textContent);
};

$('deleteCategory').onclick = async () => {
  if (!editingCategory || editingCategory.wishlist_owner) return;
  if (state.categories.length < 2) {
    alert('Нельзя удалить последнюю категорию.');
    return;
  }
  const transferTo = $('categoryForm').elements.transferTo.value;
  const path = `categories/${editingCategory.id}?transferTo=${encodeURIComponent(transferTo)}`;
  const text = `Удалить категорию «${editingCategory.name}»? Все её записи будут перенесены в выбранную категорию.`;
  if (!confirm(text)) return;
  const ok = await mutate(path, 'DELETE');
  if (ok) {
    if (cat === editingCategory.id) cat = visibleCategories()[0]?.id ?? sortedCategories()[0]?.id ?? null;
    $('categoryDialog').close();
    go('home');
  }
};

$('moveUp').onclick = ()=> moveCategory(-1);
$('moveDown').onclick = ()=> moveCategory(1);
$('cancelCategory').onclick = ()=> $('categoryDialog').close();
$('cancel').onclick = $('closeEditor').onclick = ()=> $('editor').close();
$('add').onclick = ()=> edit(null);
$('back').onclick = ()=> go(listOrigin);
$('search').oninput = render;
$('filter').onchange = render;
$('newcat').onclick = ()=> openCategoryDialog(null);
$('layoutToggle').onclick=()=>setLayout(currentLayout()==='tiles'?'list':'tiles');
$('toggleHidden').onclick = ()=> { showHiddenCategories = !showHiddenCategories; render(); };
$('closePrefsTop').onclick = ()=> $('prefs').close();
$('closeCoupleTop').onclick = ()=> $('coupleDialog').close();
$('notify').onchange = ()=> mutate('settings', 'PUT', { enabled: $('notify').checked });
$('closeprefs').onclick = ()=> $('prefs').close();
$('prev').onclick = ()=> { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); selectedDay = null; render(); };
$('next').onclick = ()=> { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); selectedDay = null; render(); };
document.querySelectorAll('nav button').forEach(b => b.onclick = ()=> go(b.dataset.page));


// v0.5 feature layer
let itemPhotoData=null,avatarData=null,commentItem=null,editingDate=null,backupData=null,randomPick=null;
function rub(x){return Number(x).toLocaleString('ru-RU',{style:'currency',currency:'RUB'})}
function person(id){if(id==null)return 'неизвестно';const p=(state.profiles||[]).find(x=>Number(x.id)===Number(id));return p?.name||(Number(id)===Number(state.uid)?'Я':'Партнёр')}
function repeatLabel(x){return ({daily:'ежедневно',weekly:'еженедельно',monthly:'ежемесячно',yearly:'ежегодно'})[x]||''}
function preview(id,remove,data){const img=$(id);img.hidden=!data;$(remove).hidden=!data;if(data)img.src=data;else img.removeAttribute('src')}
async function compress(file){if(!file||!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Выберите изображение до 20 МБ');const u=URL.createObjectURL(file);try{const img=new Image();img.src=u;await img.decode();const c=document.createElement('canvas');for(const size of [800,600,400,250]){const ratio=Math.min(1,size/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);for(const quality of [.8,.6,.4]){const v=c.toDataURL('image/jpeg',quality);if(v.length<=240000)return v}}throw Error('Не удалось уменьшить фото')}finally{URL.revokeObjectURL(u)}}
function bindPhoto(input,form,cb){$(input).onchange=async()=>{const f=$(input).files[0];if(!f)return;const b=$(form).querySelector('[type=submit]');b.disabled=true;try{cb(await compress(f))}catch(e){alert(e.message)}finally{b.disabled=false;$(input).value=''}}}
bindPhoto('itemPhoto','editform',v=>{itemPhotoData=v;preview('itemPreview','removePhoto',v)});$('removePhoto').onclick=()=>{itemPhotoData=null;preview('itemPreview','removePhoto',null)};
bindPhoto('avatarFile','profileForm',v=>{avatarData=v;preview('avatarPreview','removeAvatar',v)});$('removeAvatar').onclick=()=>{avatarData=null;preview('avatarPreview','removeAvatar',null)};
function applyPrefs(){const p=state.prefs||{};document.body.dataset.theme=p.theme||'dreamy';document.documentElement.style.setProperty('--accent',p.accent||'#aa8cf0');document.documentElement.style.setProperty('--card-opacity',String((p.opacity??85)/100));document.documentElement.style.setProperty('--text-scale',String((p.scale??100)/100));applyStyle(p);}
function openPrefs(){const p=state.prefs||{},v=$('profileForm').elements;$('notify').checked=state.enabled;v.name.value=p.name||'';v.theme.value=p.theme||'dreamy';v.accent.value=p.accent||'#aa8cf0';v.opacity.value=p.opacity??85;v.scale.value=p.scale??100;v.layout.value=currentLayout();avatarData=p.avatar||null;preview('avatarPreview','removeAvatar',avatarData);loadStyleForm();$('prefs').showModal()}
$('profileForm').onsubmit=async e=>{e.preventDefault();const v=e.target.elements,b=e.target.querySelector('[type=submit]');b.disabled=true;try{if(await mutate('profile','PUT',{name:v.name.value,avatar:avatarData,theme:v.theme.value,accent:v.accent.value,opacity:Number(v.opacity.value),scale:Number(v.scale.value),layout:v.layout.value,...stylePayload()})){$('prefs').close()}else alert($('error').textContent)}finally{b.disabled=false}};
function renderExtrasHome(){const couple=$('couple');couple.replaceChildren();for(const p of state.profiles||[]){const box=node('div',undefined,'person');if(p.avatar){const i=node('img',undefined,'avatar');i.src=p.avatar;i.alt='';box.append(i)}else box.append(node('span','🐾','avatar avatar-fallback'));box.append(node('span',person(p.id)));couple.append(box)}const pin=$('pinnedHome'),rows=state.items.filter(r=>r.pinned&&!r.done);pin.hidden=!rows.length;pin.replaceChildren(node('h2','📌 Закреплённые планы'),...rows.map(entry));const d=nextDates()[0],u=$('upcoming');u.hidden=!d;u.replaceChildren();if(d)u.append(node('strong','💕 '+d.row.title),node('p',countdown(d.date)),btn('Все важные даты',()=>go('calendar')))}
function renderListTools(c){const el=$('listTools');el.replaceChildren();if(c.wishlist_owner){const rows=itemsInCat(c.id),sum=rows.filter(r=>!r.done).reduce((a,r)=>a+Number(r.price||0),0),spent=rows.filter(r=>r.done).reduce((a,r)=>a+Number(r.price||0),0);const card=node('article',undefined,'entry');card.append(node('strong','Бюджет вишлиста'),node('p','Активные желания: '+rub(sum)+' · Исполненные: '+rub(spent)),node('p',c.budget==null?'Бюджет не задан':'Бюджет: '+rub(c.budget)+' · Остаток после активных желаний: '+rub(Number(c.budget)-sum),'meta'),btn('Изменить бюджет',()=>openCategoryDialog(c)));el.append(card)}if(['Что посмотреть','Куда сходить'].includes(c.name)||['🎬','📍'].includes(c.icon)){el.append(btn('🎲 Случайный выбор',()=>{const rows=activeItemsInCat(c.id);if(!rows.length){alert('Нет активных вариантов');return}const r=rows[Math.floor(Math.random()*rows.length)];randomPick=r.id;const result=node('article',undefined,'entry');result.append(node('strong','🎲 Выпало: '+r.title),btn('Открыть запись',()=>edit(r)));$('randomResult').replaceChildren(result)},'secondary wide'));const result=node('div');result.id='randomResult';el.append(result);const picked=activeItemsInCat(c.id).find(r=>r.id===randomPick);if(picked){const card=node('article',undefined,'entry');card.append(node('strong','🎲 Выпало: '+picked.title),btn('Открыть запись',()=>edit(picked)));result.append(card)}}}
function dateInYear(row,y){const [yy,m,d]=row.event_date.split('-').map(Number);if(!row.annual&&yy!==y)return null;const last=new Date(y,m,0).getDate();return new Date(y,m-1,Math.min(d,last))}
function todayDate(){const d=new Date();d.setHours(0,0,0,0);return d}
function nextDates(){const today=todayDate(),y=today.getFullYear();return (state.dates||[]).map(row=>{let date=row.annual?dateInYear(row,y):new Date(row.event_date+'T00:00:00');if(row.annual&&date<today)date=dateInYear(row,y+1);return {row,date}}).filter(x=>x.date>=today).sort((a,b)=>a.date-b.date)}
function countdown(d){const t=todayDate(),n=Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()))/86400000);return d.toLocaleDateString('ru-RU')+(n===0?' · сегодня':n>0?' · через '+n+' дн.':' · прошло '+(-n)+' дн.')}
function renderDates(y,m){const el=$('importantDates');el.replaceChildren(node('h3','💕 Важные даты'));const rows=(state.dates||[]).map(row=>({row,date:dateInYear(row,y)})).filter(x=>x.date&&(selectedDay?daykey(x.date)===selectedDay:x.date.getMonth()===m)).sort((a,b)=>a.date-b.date);for(const x of rows){const c=node('article',undefined,'entry');c.append(node('strong',x.row.title),node('p',countdown(x.date)+(x.row.annual?' · ежегодно':''),'meta'),btn('Изменить',()=>openDate(x.row)));el.append(c)}if(!rows.length)el.append(node('p','Нет важных дат за этот период','meta'));const upcoming=nextDates();if(upcoming.length){const c=node('article',undefined,'entry');c.append(node('strong','Ближайшие даты'));for(const x of upcoming.slice(0,5))c.append(btn(x.row.title+' · '+countdown(x.date),()=>openDate(x.row),'secondary wide'));el.append(c)}}
function openDate(r){editingDate=r;const f=$('dateForm'),v=f.elements;f.reset();v.title.value=r?.title||'';v.event_date.value=r?.event_date||localInput(new Date()).slice(0,10);v.annual.checked=r?.annual??true;$('deleteDate').hidden=!r;$('dateDialog').showModal()}
$('newDate').onclick=()=>openDate(null);$('closeDate').onclick=()=>$('dateDialog').close();$('dateForm').onsubmit=async e=>{e.preventDefault();const v=e.target.elements;if(await mutate(editingDate?'dates/'+editingDate.id:'dates',editingDate?'PUT':'POST',{title:v.title.value,event_date:v.event_date.value,annual:v.annual.checked}))$('dateDialog').close();else alert($('error').textContent)};$('deleteDate').onclick=async()=>{if(editingDate&&confirm('Удалить важную дату?')&&await mutate('dates/'+editingDate.id,'DELETE'))$('dateDialog').close()};
async function loadComments(){const r=commentItem;if(!r)return;try{const data=await api('items/'+r.id+'/comments');if(commentItem!==r)return;const el=$('commentsRows');el.replaceChildren();for(const c of data.comments){const div=node('article',undefined,'entry');div.append(node('strong',person(c.author)),node('p',local(c.created_at),'meta'),node('p',c.body));if(Number(c.author)===Number(state.uid))div.append(btn('Удалить',async()=>{if(confirm('Удалить комментарий?')){try{await api('items/'+r.id+'/comments/'+c.id,'DELETE');await loadComments()}catch(e){alert(e.message)}}},'danger-soft'));el.append(div)}if(!data.comments.length)el.append(node('p','Пока нет комментариев','meta'))}catch(e){$('commentsRows').textContent=e.message}}
function openComments(r){commentItem=r;$('commentsTitle').textContent='💬 '+r.title;$('commentsRows').textContent='Загрузка…';$('commentsForm').reset();$('commentsDialog').showModal();loadComments()}
$('closeComments').onclick=()=>$('commentsDialog').close();$('commentsDialog').onclose=()=>{commentItem=null};$('commentsForm').onsubmit=async e=>{e.preventDefault();if(!commentItem)return;const r=commentItem,b=e.target.querySelector('[type=submit]');b.disabled=true;try{await api('items/'+r.id+'/comments','POST',{body:e.target.elements.body.value});e.target.reset();await loadComments()}catch(e){alert(e.message)}finally{b.disabled=false}};
function renderHistory(){const root=$('historyStats');root.replaceChildren();const done=state.items.filter(r=>r.done),known=done.filter(r=>r.completed_at),byMonth=new Map(),byPerson=new Map();for(const r of known){const d=new Date(r.completed_at),k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');byMonth.set(k,(byMonth.get(k)||0)+1);const id=r.completed_by;byPerson.set(id,(byPerson.get(id)||0)+1)}const card=node('article',undefined,'entry');card.append(node('h3','Всего выполнено: '+done.length),node('p','Активных: '+state.items.filter(r=>!r.done).length));for(const [k,n] of [...byMonth].sort((a,b)=>b[0].localeCompare(a[0]))){const [y,m]=k.split('-').map(Number);card.append(node('p',new Date(y,m-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})+' — '+n))}for(const [id,n] of byPerson)card.append(node('p',person(id)+' — '+n+' выполнено'));if(done.length-known.length)card.append(node('p','Без даты выполнения (до обновления): '+(done.length-known.length),'meta'));root.append(card)}
$('backup').onclick=async()=>{try{backupData=JSON.stringify(await api('backup'),null,2);$('backupText').value=backupData;$('backupDialog').showModal()}catch(e){alert(e.message)}};$('downloadBackup').onclick=()=>{if(!backupData)return;const u=URL.createObjectURL(new Blob([backupData],{type:'application/json'}));const a=node('a');a.href=u;a.download='cats-planner-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)};$('closeBackup').onclick=()=>{$('backupDialog').close();$('backupText').value='';backupData=null};
// v0.6 Couple Edition
const widgets={today:['todayWidget','☀️ Сегодня'],dates:['upcoming','💕 Важные даты'],pinned:['pinnedHome','📌 Закреплённые планы']};
const widgetDefaults=Object.keys(widgets);
const achInfo={first:['🐣','Первый блин не комом','Выполнить первое общее дело'],movie5:['🍿','Кинозал на диване','Посмотреть 5 фильмов'],wish10:['💸','Кошелёк покинул чат','Исполнить 10 желаний'],done25:['🦥','Прокрастинация побеждена','Выполнить 25 дел'],both10:['🧠','Совместный мозг','Выполнить 10 совместных планов'],done100:['👑','Легенды планирования','Выполнить 100 дел'],place10:['🥟','Пельмени судьбы','Посетить 10 мест'],coupon10:['🎟️','Купонный магнат','Подтвердить 10 купонов'],custom5:['🧙','Повелитель списков','Создать 5 нестандартных категорий'],late10:['🗿','Тот самый понедельник','Выполнить 10 просроченных дел']};
const shop={bow:['🎀','Бантик',40],ball:['🧶','Клубок',60],bed:['🛏️','Облачная лежанка',100],crown:['👑','Корона',160]};
function coupleButton(text,fn,cls='secondary'){return btn(text,fn,cls)}
function sectionCard(title){const e=node('article',undefined,'entry couple-card');e.append(node('h3',title));return e}
async function coupleMutate(path,method,data){const ok=await mutate(path,method,data);if(!ok)alert($('error').textContent);return ok}
function renderToday(){const card=sectionCard('☀️ Сегодня');const key=daykey(new Date()),today=state.items.filter(r=>r.due&&daykey(new Date(r.due))===key),late=state.items.filter(r=>!r.done&&r.due&&new Date(r.due)<todayDate());const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const next=state.items.filter(r=>!r.done&&r.due&&daykey(new Date(r.due))===daykey(tomorrow));card.append(node('p',new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})+' · '+today.filter(r=>r.done).length+'/'+today.length+' выполнено','meta'));const bar=node('progress');bar.max=today.length||1;bar.value=today.filter(r=>r.done).length;card.append(bar);for(const r of today.sort((a,b)=>a.due.localeCompare(b.due))){const line=node('div',undefined,'today-row'),b=btn(r.done?'✅':'○',()=>coupleMutate('items/'+r.id,'PUT',{...r,done:!r.done,private:!!r.private}));b.setAttribute('aria-label',r.done?'Вернуть':'Выполнить');line.append(b,btn(r.title+' · '+new Date(r.due).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),()=>edit(r),'today-title'));card.append(line)}if(!today.length)card.append(node('p','Сегодня свободно. Можно устроить уютный вечер.','meta'));if(late.length){card.append(node('strong','🔥 Просрочено: '+late.length));for(const r of late)card.append(btn(r.title,()=>edit(r),'secondary wide'))}if(next.length){card.append(node('strong','Завтра: '+next.length));for(const r of next)card.append(btn(r.title,()=>edit(r),'secondary wide'))}for(const d of nextDates().filter(x=>daykey(x.date)===key))card.append(node('p','💕 '+d.row.title));$('todayWidget').replaceChildren(card)}
function renderCoupleHome(){renderToday();for(const id of ['petWidget','couponsWidget','achievementsWidget']) $(id).hidden=true;const order=(state.prefs?.home_widgets??widgetDefaults).filter(k=>Object.hasOwn(widgets,k));for(const k of [...order,...widgetDefaults.filter(x=>!order.includes(x))]){const el=$(widgets[k][0]);$('homeWidgets').append(el);if(!order.includes(k))el.hidden=true;else if(k==='today')el.hidden=false}}
function renderMore(){const e=$('moreContent');e.replaceChildren(btn('🎟️ Чековая книжка',openCoupons,'secondary wide'),btn('🏆 Зал славы',openAch,'secondary wide'),btn('🐾 Питомец и магазин',openPet,'secondary wide'),btn('✨ Виджеты и характер бота',openCoupleSettings,'secondary wide'),btn('⚙️ Настройки',openPrefs,'secondary wide'));e.append(btn('📅 Календарь',()=>go('calendar'),'secondary wide'),btn('📊 Статистика',()=>go('stats'),'secondary wide'),btn('🔍 Глобальный поиск',()=>go('searchPage'),'secondary wide'),btn('📦 Архив',()=>openLibrary('archive'),'secondary wide'),btn('🗑️ Корзина',()=>openLibrary('trash'),'secondary wide'),btn('🕒 История изменений',()=>openLibrary('history'),'secondary wide'),btn('🔔 Центр уведомлений',()=>openLibrary('inbox'),'secondary wide'));}
let couponTab='received';function openCoupons(){renderCoupons();if(!$('couponDialog').open)$('couponDialog').showModal()}
function renderCoupons(){const tabs=$('couponTabs');tabs.replaceChildren(...[['received','Полученные'],['sent','Подаренные'],['history','История']].map(([id,title])=>{const b=btn(title,()=>{couponTab=id;renderCoupons()});b.setAttribute('aria-pressed',String(couponTab===id));return b}));const el=$('couponRows');el.replaceChildren();const uid=Number(state.uid);const rows=(state.coupons||[]).filter(c=>couponTab==='history'?true:couponTab==='received'?Number(c.recipient)===uid:Number(c.giver)===uid);for(const c of rows){const expired=c.expires&&Date.parse(c.expires)<=Date.now(),received=Number(c.recipient)===uid;const card=sectionCard('🎟️ '+c.title);card.append(node('p',c.description),node('p',`${received?'От: '+person(c.giver):'Для: '+person(c.recipient)} · ${c.remaining}/${c.initial_uses} · ${expired?'Срок истёк':({available:'Доступен',requested:'Ожидает подтверждения',used:'Использован',cancelled:'Отменён'})[c.status]}`,'meta'));if(c.expires)card.append(node('p','До '+local(c.expires),'meta'));const action=(label,act)=>btn(label,async()=>{if(!confirm(label+'?'))return;if(await coupleMutate('coupons/'+c.id,'PUT',{action:act,version:c.version}))renderCoupons()},'secondary wide');if(couponTab==='history'){const labels={request:'Запрошен',approve:'Подтверждён',decline:'Отложен',withdraw:'Запрос отозван',cancel:'Отменён'};for(const ev of (state.coupon_events||[]).filter(x=>x.coupon_id===c.id))card.append(node('p',(labels[ev.action]||ev.action)+' · '+person(ev.actor)+' · '+local(ev.created_at),'meta'))}else{if(received&&c.status==='available'&&!expired)card.append(action('Использовать','request'));if(received&&c.status==='requested')card.append(action('Отозвать запрос','withdraw'));if(!received&&c.status==='requested')card.append(action('Подтвердить','approve'),action('Отложить','decline'));if(!received&&['available','requested'].includes(c.status))card.append(action('Отменить купон','cancel'))}el.append(card)}if(!rows.length)el.append(node('p','Пока нет купонов','meta'))}
$('couponForm').elements.template.onchange=e=>{if(e.target.value)$('couponForm').elements.title.value=e.target.value};$('couponForm').onsubmit=async e=>{e.preventDefault();const v=e.target.elements,b=e.target.querySelector('[type=submit]');b.disabled=true;try{if(await coupleMutate('coupons','POST',{title:v.title.value,description:v.description.value,uses:Number(v.uses.value),expires:v.expires.value?new Date(v.expires.value).toISOString():null})){e.target.reset();couponTab='sent';renderCoupons()}}finally{b.disabled=false}};$('closeCoupons').onclick=()=>$('couponDialog').close();
function openPet(){renderPet();if(!$('petDialog').open)$('petDialog').showModal()}
function renderPet(){const e=$('petDetail');e.replaceChildren();const p=state.pet;if(!p)return;const act=async(action,arg='')=>{if(await coupleMutate('pet','PUT',{action,arg}))renderPet()};const hero=sectionCard(p.name+' · Ур. '+(1+Math.floor(p.xp/100)));hero.append(petArt(p),node('p','🪙 '+p.coins+' · Опыт '+p.xp));for(const [label,key] of [['🍗 Сытость','hunger'],['💕 Настроение','mood'],['⚡ Энергия','energy']]){hero.append(node('p',label+' '+p[key]+'%','meta'));const bar=node('progress');bar.max=100;bar.value=p[key];hero.append(bar)}const actions=node('div',undefined,'actions');actions.append(btn('🍗 Кормить (10)',()=>act('feed')),btn('💕 Гладить',()=>act('pet')),btn('💤 Спать',()=>act('sleep')));hero.append(actions,btn('Изменить имя',()=>{const name=prompt('Имя питомца',p.name);if(name?.trim())act('name',name.trim())},'secondary wide'),btn(p.kind==='cat'?'Выбрать лисичку':'Выбрать котика',()=>act('kind',p.kind==='cat'?'fox':'cat'),'secondary wide'));e.append(hero,node('h3','🛍️ Магазин'));for(const [k,[icon,title,price]] of Object.entries(shop)){const c=sectionCard(icon+' '+title),owned=(p.owned||[]).includes(k);c.append(node('p',owned?'Куплено':price+' монет','meta'));const b=btn(p.equipped===k?'Снять':owned?'Надеть':'Купить',()=>{if(owned||confirm('Купить за '+price+' монет?'))act(owned?'equip':'buy',p.equipped===k?'':k)},'secondary wide');b.disabled=!owned&&p.coins<price;c.append(b);e.append(c)}e.append(node('p','Питомец не умирает и не теряет опыт. Показатели постепенно снижаются, но не ниже 45%; за пропущенные дни штрафов нет.','meta'))};$('closePet').onclick=()=>$('petDialog').close();
function renderAch(){const e=$('achRows');e.replaceChildren();for(const a of state.achievements||[]){const info=achInfo[a.code];if(!info)continue;const c=sectionCard((a.unlocked?info[0]:'🔒')+' '+info[1]);c.append(node('p',info[2]),node('p',a.unlocked?'Открыто · '+local(a.unlocked):Math.min(a.progress,a.target)+'/'+a.target,'meta'));const p=node('progress');p.max=a.target;p.value=a.unlocked?a.target:Math.min(a.progress,a.target);c.append(p);e.append(c)}}function openAch(){renderAch();if(!$('achDialog').open)$('achDialog').showModal()};$('closeAch').onclick=()=>$('achDialog').close();
let widgetEdit=[];function drawWidgetOrder(){const e=$('widgetOrder');e.replaceChildren();for(let i=0;i<widgetEdit.length;i++){const w=widgetEdit[i],row=node('div',undefined,'widget-setting'),label=node('label',undefined,'check'),input=node('input');input.type='checkbox';input.checked=w.enabled;input.onchange=()=>w.enabled=input.checked;label.append(input,node('span',widgets[w.key][1]));row.append(label,btn('↑',()=>{if(i){[widgetEdit[i-1],widgetEdit[i]]=[widgetEdit[i],widgetEdit[i-1]];drawWidgetOrder()}}),btn('↓',()=>{if(i<widgetEdit.length-1){[widgetEdit[i+1],widgetEdit[i]]=[widgetEdit[i],widgetEdit[i+1]];drawWidgetOrder()}}));e.append(row)}}
function toTime(n){return n==null?'':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}function fromTime(s){return s?Number(s.slice(0,2))*60+Number(s.slice(3)):null}
function openCoupleSettings(){const p=state.prefs||{},order=(p.home_widgets??widgetDefaults).filter(k=>Object.hasOwn(widgets,k));widgetEdit=[...order,...widgetDefaults.filter(k=>!order.includes(k))].map(key=>({key,enabled:order.includes(key)}));drawWidgetOrder();const v=$('coupleForm').elements;v.tone.value=p.tone||'care';for(const k of ['notify_reminders','notify_updates','notify_coupons'])v[k].checked=p[k]!==false;v.quiet_start.value=toTime(p.quiet_start);v.quiet_end.value=toTime(p.quiet_end);if($('prefs').open)$('prefs').close();$('coupleDialog').showModal()};$('coupleSettings').onclick=openCoupleSettings;$('closeCoupleSettings').onclick=()=>$('coupleDialog').close();$('coupleForm').onsubmit=async e=>{e.preventDefault();const v=e.target.elements;if(!!v.quiet_start.value!==!!v.quiet_end.value){alert('Укажи обе границы тихих часов или очисти обе');return}if(await coupleMutate('profile','PUT',{home_widgets:widgetEdit.filter(w=>w.enabled).map(w=>w.key),tone:v.tone.value,notify_reminders:v.notify_reminders.checked,notify_updates:v.notify_updates.checked,notify_coupons:v.notify_coupons.checked,quiet_start:fromTime(v.quiet_start.value),quiet_end:fromTime(v.quiet_end.value),tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}))$('coupleDialog').close()};

function renderTaxonomy(c){const rows=itemsInCat(c.id),subs=[...new Set(rows.map(r=>r.subcategory).filter(Boolean))].sort(),tags=[...new Set(rows.flatMap(r=>r.tags||[]))].sort();for(const [id,values,label] of [['subFilter',subs,'Все подкатегории'],['tagFilter',tags,'Все теги']]){const s=$(id),old=s.value;s.replaceChildren(...['',...values].map(v=>{const o=node('option',v||label);o.value=v;return o}));s.value=values.includes(old)?old:'';s.hidden=!values.length}$('taxonomyFilters').hidden=!subs.length&&!tags.length}
$('subFilter').onchange=render;$('tagFilter').onchange=render;
let bgData=null,navDraft=[];
const navLabels={home:['🏠','Главная'],calendar:['📅','Календарь'],stats:['📊','Статистика'],search:['🔍','Поиск'],more:['✨','Ещё']};
function drawNav(){const e=$('navEditor');e.replaceChildren();navDraft.forEach((x,i)=>{const r=node('div',undefined,'widget-setting'),l=node('label',undefined,'check'),b=node('input');b.type='checkbox';b.checked=x.on;b.disabled=['home','more'].includes(x.key);b.onchange=()=>x.on=b.checked;l.append(b,node('span',navLabels[x.key][1]));r.append(l,btn('↑',()=>{if(i){[navDraft[i-1],navDraft[i]]=[navDraft[i],navDraft[i-1]];drawNav()}}),btn('↓',()=>{if(i<navDraft.length-1){[navDraft[i],navDraft[i+1]]=[navDraft[i+1],navDraft[i]];drawNav()}}));e.append(r)})}
function loadStyleForm(){const p=state.prefs||{},v=$('profileForm').elements;bgData=p.background||null;preview('backgroundPreview','removeBackground',bgData);v.corner.value=p.corner??20;v.compact.checked=!!p.compact;v.card_size.value=p.card_size||'normal';const a=p.nav_pages||['home','calendar','stats','more'];navDraft=[...a,...Object.keys(navLabels).filter(k=>!a.includes(k))].map(key=>({key,on:a.includes(key)}));drawNav()}
function stylePayload(){const v=$('profileForm').elements;return {background:bgData,corner:Number(v.corner.value),compact:v.compact.checked,card_size:v.card_size.value,nav_pages:navDraft.filter(x=>x.on).map(x=>x.key)}}
function applyStyle(p){const root=document.documentElement;root.style.setProperty('--corner',(p.corner??20)+'px');document.body.dataset.compact=String(!!p.compact);document.body.dataset.cardSize=p.card_size||'normal';const sky=document.querySelector('.sky');sky.style.backgroundImage=p.background?`url("${p.background}")`:'';document.body.classList.toggle('custom-bg',!!p.background);const nav=document.querySelector('nav');nav.replaceChildren(...(p.nav_pages||['home','calendar','stats','more']).map(k=>{const b=btn(navLabels[k][0],()=>go(k==='search'?'searchPage':k));b.dataset.page=k;b.append(node('span',navLabels[k][1]));return b}))}
bindPhoto('backgroundFile','profileForm',v=>{bgData=v;preview('backgroundPreview','removeBackground',v)});$('removeBackground').onclick=()=>{bgData=null;preview('backgroundPreview','removeBackground',null)};
function addCheckRow(x={text:'',done:false}){const r=node('div',undefined,'check-edit'),c=node('input'),t=node('input');c.type='checkbox';c.checked=x.done;t.value=x.text;t.maxLength=200;t.placeholder='Подзадача';r.append(c,t,btn('×',()=>r.remove()));$('checkEditor').append(r)}
function drawChecklist(rows){$('checkEditor').replaceChildren();rows.forEach(addCheckRow)}
function readChecklist(){return [...$('checkEditor').children].map(r=>({text:r.children[1].value.trim(),done:r.children[0].checked})).filter(x=>x.text)}
$('addCheck').onclick=()=>{if($('checkEditor').children.length<50)addCheckRow()};
function matchText(r,q){return [r.title,r.notes,r.subcategory,...(r.tags||[]),...(r.checklist||[]).map(x=>x.text),catById(r.category)?.name].join(' ').toLowerCase().includes(q.trim().toLowerCase())}
function renderGlobal(){const q=$('globalSearch').value.trim(),root=$('globalRows');const rows=q?[...state.items,...(state.archivedItems||[])].filter(r=>matchText(r,q)):[];root.replaceChildren(...(rows.length?rows.map(r=>r.archived_at?archiveCard(r,'archive'):entry(r)):[node('p',q?'Ничего не найдено':'Введите запрос','meta')]))}
$('globalSearch').oninput=renderGlobal;
function archiveCard(r,mode){const e=sectionCard((mode==='archive'?'📦 ':'🗑️ ')+r.title);e.append(node('p',categoryName(catById(r.category)||{name:'Категория'})+' · '+local(r.deleted_at||r.archived_at),'meta'));if(r.notes)e.append(node('p',r.notes));e.append(btn('Восстановить',()=>life(r,mode==='archive'?'unarchive':'restore'),'secondary wide'));if(mode==='archive')e.append(btn('В корзину',()=>{if(confirm('Переместить в корзину?'))life(r,'trash')},'danger-soft wide'));return e}
let libraryMode='';async function life(r,action){if(await mutate('items/'+r.id+'/lifecycle','PUT',{action,version:r.version})){if($('libraryDialog').open)openLibrary(libraryMode)}else alert($('error').textContent)}
async function openLibrary(mode){libraryMode=mode;const root=$('libraryRows');$('libraryTitle').textContent=({archive:'Архив',trash:'Корзина',history:'История изменений',inbox:'Уведомления'})[mode];root.replaceChildren(node('p','Загрузка…','meta'));if(!$('libraryDialog').open)$('libraryDialog').showModal();try{if(mode==='archive'||mode==='trash'){const rows=mode==='archive'?state.archivedItems:state.trashItems;root.replaceChildren();for(const r of rows||[])root.append(archiveCard(r,mode))}else{const data=await api(mode);if(libraryMode!==mode)return;root.replaceChildren();if(mode==='inbox')root.append(btn('Отметить всё прочитанным',async()=>{await api('inbox','PUT',{});openLibrary('inbox')},'secondary wide'));for(const r of data.rows){const e=sectionCard(mode==='history'?r.title:r.body);e.append(node('p',(mode==='history'?r.action+' · '+(r.actor?person(r.actor):'Система'):(r.read_at?'Прочитано':'Новое'))+' · '+local(r.created_at),'meta'));root.append(e)}if(!data.rows.length)root.append(node('p','Пока пусто','meta'))}if(!root.children.length)root.append(node('p','Пока пусто','meta'))}catch(e){root.replaceChildren(node('p',e.message))}}
$('closeLibrary').onclick=()=>$('libraryDialog').close();
function petArt(p){const box=node('div',undefined,'pet-art');const fox=p.kind==='fox';const svg=`<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Питомец"><defs><linearGradient id="skyPet" x2="0" y2="1"><stop stop-color="#494677"/><stop offset="1" stop-color="#ad8abd"/></linearGradient></defs><rect width="300" height="175" rx="18" fill="url(#skyPet)"/><circle cx="250" cy="32" r="17" fill="#ffe0a5"/><circle cx="257" cy="27" r="16" fill="#5c5287"/><g fill="#ffe8b8"><circle cx="36" cy="26" r="2"/><circle cx="85" cy="43" r="2"/><circle cx="195" cy="20" r="2"/><circle cx="274" cy="83" r="2"/></g><g fill="#bda5d4"><ellipse cx="35" cy="150" rx="60" ry="23"/><ellipse cx="270" cy="153" rx="65" ry="27"/><ellipse cx="150" cy="163" rx="95" ry="15"/></g><g class="pet-breathe"><path class="pet-tail" d="M184 137 Q252 153 226 109" stroke="${fox?'#df956f':'#ada0c9'}" stroke-width="24" stroke-linecap="round" fill="none"/><ellipse cx="150" cy="132" rx="50" ry="28" fill="${fox?'#df956f':'#b9add0'}"/><path d="M105 100 L108 48 L145 76 M158 76 L193 48 L197 100" fill="${fox?'#df956f':'#b9add0'}" stroke="#78698f" stroke-width="2"/><path d="M115 60 L118 84 L134 77 M185 61 L183 84 L169 77" fill="#e9a9b7"/><ellipse cx="151" cy="100" rx="48" ry="35" fill="${fox?'#e9a47d':'#cfc2dd'}"/><path d="M106 104 Q130 94 151 115 Q171 94 195 104 Q190 136 151 136 Q112 136 106 104" fill="${fox?'#ffe4c9':'#e5d8e9'}"/><g class="pet-eyes" fill="#53405c"><ellipse cx="133" cy="97" rx="4" ry="6"/><ellipse cx="170" cy="97" rx="4" ry="6"/></g><path d="M146 108 Q151 104 156 108 L151 113Z" fill="#9e697e"/><path d="M151 113q-6 8-11 2m11-2q6 8 11 2" stroke="#71506b" fill="none" stroke-width="1.5"/><ellipse cx="127" cy="150" rx="18" ry="8" fill="#eadbe7"/><ellipse cx="175" cy="150" rx="18" ry="8" fill="#eadbe7"/></g></svg>`;box.innerHTML=svg;if(shop[p.equipped])box.append(node('span',shop[p.equipped][0],'pet-accessory'));return box}

if (!tg?.initData) {
  error('Откройте Cat’s planner кнопкой в Telegram.');
  document.querySelectorAll('button').forEach(b => b.disabled = true);
} else {
  refresh();
  setInterval(()=>{ if(document.hidden)return;const open=document.querySelector('dialog[open]');if(!open)refresh();else if(['couponDialog','petDialog','achDialog'].includes(open.id))refresh().then(()=>{if($('couponDialog').open)renderCoupons();if($('petDialog').open)renderPet();if($('achDialog').open)renderAch()}); }, 15000);
}
