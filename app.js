"use strict";
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (id) => document.getElementById(id);
let state = { items: [], categories: [], uid: 0, enabled: true };
let page = 'home', cat = null, editing = null, month = new Date(), selectedDay = null, loading = false, showHiddenCategories = false, editingCategory = null;

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
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    state = await api('state');
    if (!cat && state.categories.length) cat = visibleCategories()[0]?.id ?? state.categories[0].id;
    $('error').textContent = '';
    render();
  } catch (e) { error(e); }
  finally { loading = false; }
}
async function mutate(path, method, body) {
  try {
    await api(path, method, body);
    await refresh();
    return true;
  } catch (e) {
    error(e);
    return false;
  }
}
function go(p) {
  page = p;
  for (const s of ['home','list','calendar','stats']) $(s).hidden = s !== p;
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
function catById(id) { return state.categories.find(c => c.id === id); }
function itemsInCat(id) { return state.items.filter(r => r.category === id); }
function activeItemsInCat(id) { return state.items.filter(r => r.category === id && !r.done); }

function categoryCard(c) {
  const b = node('button', undefined, 'tile');
  b.type = 'button';
  b.style.setProperty('--cat', c.color || '#8b6fbf');
  b.style.setProperty('--cat-soft', hexToRgba(c.color || '#8b6fbf'));
  if (c.archived) b.classList.add('archived');

  const top = node('div', undefined, 'tile-top');
  top.append(node('div', c.icon || '📁', 'tile-icon'));
  const manage = btn('⋯', (ev)=>{ ev.stopPropagation(); openCategoryDialog(c); }, 'mini-btn');
  top.append(manage);
  b.append(top);
  b.append(node('strong', c.name));
  b.append(node('small', `${activeItemsInCat(c.id).length} активных · ${itemsInCat(c.id).length} всего${c.archived ? ' · скрыта' : ''}`));
  b.onclick = ()=>{ cat = c.id; $('search').value=''; $('filter').value='active'; go('list'); };
  return b;
}

function entry(r) {
  const el = node('article', undefined, 'entry');
  const catObj = catById(r.category);
  el.append(node('h3', (r.done ? '✅ ' : '') + (r.private ? '🔒 ' : '') + r.title));
  const who = r.assignee === 'both' ? 'Вместе' : ((r.assignee === 'owner') === (r.owner === state.uid) ? 'Мне' : 'Партнёру');
  el.append(node('div', [catObj ? `${catObj.icon || '📁'} ${catObj.name}` : '', who, r.priority === 'high' ? '❗ Высокий' : r.priority === 'low' ? 'Низкий' : '', r.due ? '📅 ' + local(r.due) : '', r.reminder ? '⏰ ' + local(r.reminder) : ''].filter(Boolean).join(' · '), 'meta'));
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
    btn('Удалить', ()=> { if (confirm('Удалить запись?')) mutate('items/' + r.id + '?version=' + r.version, 'DELETE'); }, 'danger-soft')
  );
  el.append(actions);
  return el;
}

function renderSummary() {
  const active = state.items.filter(r => !r.done).length;
  const privateItems = state.items.filter(r => r.private).length;
  $('summary').textContent = `${active} активных · ${state.items.length - active} выполнено · ${privateItems} скрытых`;
}

function renderHome() {
  const root = $('categories');
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
  $('listtitle').textContent = c ? `${c.icon || '📁'} ${c.name}` : '';
  const q = $('search').value.toLowerCase(), f = $('filter').value;
  const rows = state.items.filter(r => r.category === cat && (f === 'all' || (f === 'done') === !!r.done) && ((r.title || '') + ' ' + (r.notes || '')).toLowerCase().includes(q));
  $('items').replaceChildren(...(rows.length ? rows.map(entry) : [node('p', 'Пока здесь пусто. Добавьте первую запись!', 'meta')]));
}

function renderCalendar() {
  const y = month.getFullYear(), m = month.getMonth();
  $('month').textContent = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const grid = $('days');
  grid.replaceChildren();
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(x => grid.append(node('small', x)));
  for (let i = 0; i < (new Date(y, m, 1).getDay() + 6) % 7; i++) grid.append(node('span',''));
  for (let d=1; d<=new Date(y,m+1,0).getDate(); d++) {
    const key = daykey(new Date(y,m,d)), n = state.items.filter(r => r.due && daykey(new Date(r.due)) === key).length;
    grid.append(btn(d + (n ? ' •' + n : ''), ()=> { selectedDay = selectedDay === key ? null : key; render(); }, n ? 'marked' : 'day-btn'));
  }
  const rows = state.items.filter(r => r.due && (selectedDay ? daykey(new Date(r.due)) === selectedDay : new Date(r.due).getMonth() === m && new Date(r.due).getFullYear() === y)).sort((a,b)=>a.due.localeCompare(b.due));
  $('events').replaceChildren(node('h3', selectedDay ? 'Выбранный день' : 'События месяца'), ...(rows.length ? rows.map(entry) : [node('p','Нет событий','meta')]));
}

function renderStats() {
  const root = $('statistics');
  root.replaceChildren();
  for (const c of sortedCategories()) {
    const rows = state.items.filter(r => r.category === c.id), done = rows.filter(r => r.done).length;
    const el = node('article', undefined, 'entry');
    el.style.borderColor = hexToRgba(c.color || '#8b6fbf', .42);
    const p = node('progress'); p.max = rows.length || 1; p.value = done;
    el.append(node('h3', `${c.icon || '📁'} ${c.name}`), node('p', `${done} из ${rows.length} выполнено${c.archived ? ' · категория скрыта' : ''}`), p);
    root.append(el);
  }
}

function render() {
  renderSummary();
  if (page === 'home') renderHome();
  if (page === 'list') renderList();
  if (page === 'calendar') renderCalendar();
  if (page === 'stats') renderStats();
}

function populateCategorySelect(select, includeArchived=true, excludeId=null) {
  const list = sortedCategories().filter(c => (includeArchived || !c.archived) && c.id !== excludeId);
  select.replaceChildren(...list.map(c => {
    const o = node('option', `${c.icon || '📁'} ${c.name}`);
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
  $('editheading').textContent = r ? 'Редактирование записи' : 'Новая запись';
  $('editor').showModal();
}

function openCategoryDialog(c=null) {
  editingCategory = c;
  const form = $('categoryForm');
  form.reset();
  form.elements.id.value = c?.id || '';
  form.elements.name.value = c?.name || '';
  form.elements.icon.value = c?.icon || '';
  form.elements.color.value = c?.color || defaultCategoryColors[state.categories.length % defaultCategoryColors.length];
  form.elements.archived.checked = !!c?.archived;
  $('catHeading').textContent = c ? 'Управление категорией' : 'Новая категория';
  $('catMeta').textContent = c ? `Записей: ${itemsInCat(c.id).length}. Активных: ${activeItemsInCat(c.id).length}.` : 'Создай категорию, выбери значок и цвет.';
  $('deleteCategory').hidden = !c;
  $('moveUp').hidden = !c;
  $('moveDown').hidden = !c;
  const wrap = $('transferWrap');
  if (c && state.categories.length > 1) {
    populateCategorySelect(form.elements.transferTo, true, c.id);
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
  }
  $('categoryDialog').showModal();
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
    version: editing?.version || 0
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
  const ok = editingCategory
    ? await mutate(`categories/${editingCategory.id}`, 'PUT', payload)
    : await mutate('categories', 'POST', payload);
  if (ok) $('categoryDialog').close();
};

$('deleteCategory').onclick = async () => {
  if (!editingCategory) return;
  if (state.categories.length < 2) {
    alert('Нельзя удалить последнюю категорию.');
    return;
  }
  const itemsCount = itemsInCat(editingCategory.id).length;
  let path = `categories/${editingCategory.id}`;
  const transferTo = $('categoryForm').elements.transferTo.value;
  if (itemsCount > 0) path += `?transferTo=${encodeURIComponent(transferTo)}`;
  const text = itemsCount > 0
    ? `Удалить категорию «${editingCategory.name}» и перенести ${itemsCount} записей?`
    : `Удалить категорию «${editingCategory.name}»?`;
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
$('cancel').onclick = ()=> $('editor').close();
$('add').onclick = ()=> edit(null);
$('back').onclick = ()=> go('home');
$('search').oninput = render;
$('filter').onchange = render;
$('newcat').onclick = ()=> openCategoryDialog(null);
$('toggleHidden').onclick = ()=> { showHiddenCategories = !showHiddenCategories; render(); };
$('settings').onclick = ()=> { $('notify').checked = state.enabled; $('prefs').showModal(); };
$('notify').onchange = ()=> mutate('settings', 'PUT', { enabled: $('notify').checked });
$('closeprefs').onclick = ()=> $('prefs').close();
$('prev').onclick = ()=> { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); selectedDay = null; render(); };
$('next').onclick = ()=> { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); selectedDay = null; render(); };
document.querySelectorAll('nav button').forEach(b => b.onclick = ()=> go(b.dataset.page));

if (!tg?.initData) {
  error('Откройте Cat’s planner кнопкой в Telegram.');
  document.querySelectorAll('button').forEach(b => b.disabled = true);
} else {
  refresh();
  setInterval(()=>{ if(!$('editor').open && !$('prefs').open && !$('categoryDialog').open && !document.hidden) refresh(); }, 15000);
}
