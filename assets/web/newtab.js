'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const API = 'vexora://app/api/';
let D = null, saving = 0, lastW = null;

const PATHS = {
  arrow: 'M5 12h14M13 6l6 6-6 6', chev: 'M9 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', pencil: 'M4 20h4L19 9l-4-4L4 16z',
  pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', bookmark: 'M6 3h12v18l-6-4-6 4z', note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  wand: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  sun: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z',
  rain: 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6.5 4.3 4.3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3',
  snow: 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6.5 4.3 4.3 0 0 0 7 15zM8 19h.01M12 21h.01M16 19h.01',
  storm: 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6.5 4.3 4.3 0 0 0 7 15zM12.5 14l-2.5 4h3l-1.5 4', fog: 'M4 8h16M3 12h18M5 16h14M8 20h8',
};
function svg(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + (cls || ''));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', PATHS[name]); s.append(p); return s;
}
function fill(sel, name) { const e = typeof sel === 'string' ? $(sel) : sel; e.replaceChildren(); e.append(...[...svg(name).childNodes]); }
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const key = u => { try { return new URL(u).hostname.replace(/[^A-Za-z0-9._-]/g, '_'); } catch { return ''; } };

async function get(p) { const r = await fetch(API + p + '?_=' + Date.now()); if (!r.ok) throw new Error(r.status); return r.json(); }
async function post(p, body) { const r = await fetch(API + p, { method: 'POST', body: JSON.stringify(body || {}) }); if (!r.ok) throw new Error(r.status); return r.json(); }

function resolve(s, tpl) {
  s = (s || '').trim(); if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^[^\s\/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s)) return 'https://' + s;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return 'http://' + s;
  return tpl.replace('%s', encodeURIComponent(s));
}

function favicon(url, title) {
  const f = h('div', 'fav'), k = key(url);
  f.textContent = (title || host(url) || '?')[0].toUpperCase();
  let hue = 0; for (const c of host(url)) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  f.style.background = `hsl(${hue} 55% 45%)`;
  const im = new Image(); im.onload = () => { f.textContent = ''; f.style.background = 'color-mix(in srgb, var(--bg) 70%, #fff 8%)'; f.append(im); };
  im.src = 'vexora://app/icon/' + k + '.png'; return f;
}

function applyTheme() {
  for (const [k, v] of Object.entries(D.theme)) document.documentElement.style.setProperty('--' + k, v);
  document.body.classList.toggle('wall', D.wallpaper);
  if (D.wallpaper) $('#wall').style.backgroundImage = `url(vexora://app/wallpaper?_=${D.wallver})`;
  for (const w of Object.keys(D.widgets)) {
    const map = { card: '#card', weather: '#weather', recents: '#recents', bookmarks: '#bookmarks', notes: '#notes', search: '#search', shortcuts: '#tiles', clock: '#clock,#date', greeting: '#greeting' };
    for (const e of $$(map[w])) e.hidden = !D.widgets[w];
  }
  const on = ['recents', 'bookmarks', 'notes'].filter(w => D.widgets[w]).length;
  $('#widgets').hidden = !on; $('#widgets').style.gridTemplateColumns = `repeat(${on || 1}, 1fr)`;
  $('#logo').hidden = $('#word').hidden = false;
}

function tick() {
  const d = new Date(), parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(d), c = $('#clock');
  c.replaceChildren(); let main = '';
  for (const p of parts) { if (p.type === 'dayPeriod') c.append(h('span', 'p', p.value.toUpperCase())); else if (p.type !== 'literal' || p.value.trim()) main += p.value; }
  c.prepend(main);
  $('#date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const hr = d.getHours(), g = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening', el = $('#greeting');
  el.replaceChildren(g + (D && D.name ? ', ' : '!'));
  if (D && D.name) { el.append(h('b', null, D.name), '! 👋'); } else el.append(' 👋');
}

/* ---------- search ---------- */
function drawSearch() {
  const eng = D.engine, tpl = D.engines[eng];
  $('#q').placeholder = 'Search with ' + eng + '…'; $('#engbtn').textContent = eng[0]; fill('#go .ic', 'arrow');
  const m = $('#engmenu'); m.replaceChildren();
  for (const name of Object.keys(D.engines)) {
    const b = h('button', name === eng ? 'on' : '', name); b.type = 'button';
    b.onclick = async () => { m.hidden = true; D.engine = name; drawSearch(); await post('set', { engine: name }); }; m.append(b);
  }
  $('#search').onsubmit = e => { e.preventDefault(); const u = resolve($('#q').value, tpl); if (u) location.href = u; };
}
$('#engbtn').onclick = e => { e.stopPropagation(); $('#engmenu').hidden = !$('#engmenu').hidden; };

/* ---------- shortcuts ---------- */
let dragFrom = -1;
const saveShortcuts = () => post('shortcuts', { items: D.shortcuts.map(({ title, url }) => ({ title, url })) });
function drawTiles() {
  const box = $('#tiles'); box.replaceChildren();
  D.shortcuts.forEach((s, i) => {
    const a = h('a', 'tile'); a.href = safeUrl(s.url); a.draggable = true;
    const x = h('b', 'x', '×'); x.title = 'Remove'; x.onclick = e => { e.preventDefault(); e.stopPropagation(); D.shortcuts.splice(i, 1); saveShortcuts(); drawTiles(); };
    a.append(favicon(s.url, s.title), h('span', null, s.title), x);
    a.oncontextmenu = e => { e.preventDefault(); menu(e.clientX, e.clientY, [['Open in new tab', () => window.open(s.url, '_blank')], ['Edit', () => editShortcut(i)], ['Remove', () => { D.shortcuts.splice(i, 1); saveShortcuts(); drawTiles(); }, true]]); };
    a.ondragstart = e => { dragFrom = i; a.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); };
    a.ondragend = () => { dragFrom = -1; drawTiles(); };
    a.ondragover = e => { if (dragFrom < 0) return; e.preventDefault(); a.classList.add('over'); };
    a.ondragleave = () => a.classList.remove('over');
    a.ondrop = e => { e.preventDefault(); if (dragFrom < 0 || dragFrom === i) return; const [m] = D.shortcuts.splice(dragFrom, 1); D.shortcuts.splice(i, 0, m); dragFrom = -1; saveShortcuts(); drawTiles(); };
    box.append(a);
  });
  const add = h('button', 'tile add'); add.append(svg('plus'), 'Add'); add.onclick = () => editShortcut(-1); box.append(add);
}
function editShortcut(i) {
  const s = i >= 0 ? D.shortcuts[i] : { title: '', url: '' };
  $('#mtitle').textContent = i >= 0 ? 'Edit shortcut' : 'Add shortcut'; $('#mname').value = s.title; $('#murl').value = s.url; $('#merr').textContent = '';
  $('#modal').hidden = false; $('#mname').focus();
  $('#mform').onsubmit = e => {
    e.preventDefault(); const url = resolve($('#murl').value, ''), name = $('#mname').value.trim() || host(url);
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url) && !/^https?:\/\/localhost/i.test(url)) { $('#merr').textContent = 'Enter a valid web address.'; return; }
    if (i >= 0) D.shortcuts[i] = { title: name, url }; else D.shortcuts.push({ title: name, url });
    $('#modal').hidden = true; saveShortcuts(); drawTiles();
  };
}
$('#mcancel').onclick = () => $('#modal').hidden = true;
$('#modal').onmousedown = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };

function menu(x, y, items) {
  const m = $('#ctx'); m.replaceChildren();
  for (const [label, fn, danger] of items) { const b = h('button', danger ? 'danger' : '', label); b.onclick = () => { m.hidden = true; fn(); }; m.append(b); }
  m.hidden = false; m.style.left = Math.min(x, innerWidth - 180) + 'px'; m.style.top = Math.min(y, innerHeight - 40 * items.length - 10) + 'px';
}
addEventListener('click', () => { $('#ctx').hidden = true; $('#engmenu').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') { $('#modal').hidden = true; $('#panel').hidden = true; $('#ctx').hidden = true; } });

/* ---------- recents, bookmarks, notes ---------- */
function ago(t) {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
}
function drawRecents() {
  const b = $('#recents .body'); b.replaceChildren();
  if (D.private) { b.append(h('div', 'empty', 'Private tab: nothing you visit is saved, so there is no history here.')); return; }
  if (!D.recents.length) b.append(h('div', 'empty', 'Sites you visit will show up here.'));
  for (const r of D.recents) {
    const a = h('a', 'row2'); a.href = safeUrl(r.url); const t = h('div', 't'); t.append(h('b', null, r.title || host(r.url)), h('small', null, host(r.url)));
    a.append(favicon(r.url, r.title), t, h('span', 'ago', ago(r.t))); b.append(a);
  }
}
const openFolders = new Set();
function drawBookmarks() {
  const b = $('#bookmarks .body'); b.replaceChildren();
  if (!D.folders.length) { b.append(h('div', 'empty', 'Press the star in the address bar to bookmark a page.')); return; }
  for (const f of D.folders.slice(0, 40)) {
    const name = f.name || 'Others', r = h('a', 'row2'); r.href = '#'; r.append(svg('folder', 'folder'));
    const t = h('div', 't'); t.append(h('b', null, name)); r.append(t, h('span', 'ago', String(f.items.length)), svg('chev'));
    r.onclick = e => { e.preventDefault(); openFolders.has(name) ? openFolders.delete(name) : openFolders.add(name); drawBookmarks(); }; b.append(r);
    if (openFolders.has(name)) for (const it of f.items.slice(0, 30)) {
      const a = h('a', 'row2 sub'); a.href = safeUrl(it.url); const tt = h('div', 't'); tt.append(h('b', null, it.title), h('small', null, host(it.url))); a.append(tt); b.append(a);
    }
  }
}
let noteTimer = 0;
$('#note').oninput = () => {
  $('#saved').textContent = 'Saving…'; clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => { try { await post('notes', { text: $('#note').value }); D.notes = $('#note').value; $('#saved').textContent = 'Saved'; } catch { $('#saved').textContent = 'Could not save'; } }, 400);
};
$('#notefocus').onclick = () => $('#note').focus();
for (const a of $$('[data-panel]')) a.onclick = e => { e.preventDefault(); post('panel', { name: a.dataset.panel }); };
$('#card').onclick = e => { e.preventDefault(); post('settings', { page: 'About' }); };

/* ---------- weather (Open-Meteo; only contacted once a city is set) ---------- */
const WMO = c => c === 0 ? ['Clear sky', 'sun'] : c <= 2 ? ['Partly cloudy', 'sun'] : c === 3 ? ['Overcast', 'cloud'] : c <= 48 ? ['Fog', 'fog'] : c <= 57 ? ['Drizzle', 'rain'] : c <= 67 ? ['Rain', 'rain']
  : c <= 77 ? ['Snow', 'snow'] : c <= 82 ? ['Rain showers', 'rain'] : c <= 86 ? ['Snow showers', 'snow'] : ['Thunderstorm', 'storm'];
const wcolor = n => n === 'sun' ? '#FBBF24' : n === 'rain' || n === 'storm' ? '#60A5FA' : '#CBD5E1';
function wicon(n, cls) { const s = svg(n, cls); s.style.color = wcolor(n); return s; }
let wToken = 0;
async function drawWeather() {
  const box = $('#weather'), my = ++wToken; box.replaceChildren();
  const empty = (msg, btn, fn) => { const e = h('div', 'empty', msg); if (btn) { const b = h('button', null, btn); b.onclick = fn; e.append(b); } box.append(e); };
  if (!D.city) { empty('Weather', 'Set your city', openPanel); return; }
  box.append(h('div', 'empty', 'Loading weather…'));
  try {
    const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(D.city))).json();
    if (!g.results || !g.results.length) throw new Error('city');
    const p = g.results[0], u = D.units === 'F' ? '&temperature_unit=fahrenheit' : '';
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max&forecast_days=4&timezone=auto${u}`)).json();
    if (my !== wToken) return; box.replaceChildren();
    const [cond, icon] = WMO(w.current.weather_code), now = h('div', 'now'), info = h('div');
    const loc = h('div', 'loc'); loc.append(svg('pin'), [p.name, p.country_code].filter(Boolean).join(', '));
    info.append(h('div', 'big', Math.round(w.current.temperature_2m) + '°' + D.units), h('div', 'cond', cond), loc); now.append(wicon(icon, 'wi'), info);
    const days = h('div', 'days');
    for (let i = 1; i < 4 && i < w.daily.time.length; i++) {
      const d = h('div', 'd'), dt = new Date(w.daily.time[i] + 'T12:00:00');
      d.append(h('span', null, dt.toLocaleDateString(undefined, { weekday: 'short' })), wicon(WMO(w.daily.weather_code[i])[1]), h('b', null, Math.round(w.daily.temperature_2m_max[i]) + '°')); days.append(d);
    }
    box.append(now, days);
  } catch (e) { if (my !== wToken) return; box.replaceChildren(); empty(e.message === 'city' ? `No city found for "${D.city}".` : 'Weather unavailable.', 'Retry', drawWeather); }
}

/* ---------- customize panel ---------- */
const LABELS = { card: 'Vexora card', weather: 'Weather', clock: 'Clock and date', greeting: 'Greeting', search: 'Search bar', shortcuts: 'Shortcuts', recents: 'Recently visited', bookmarks: 'Bookmarks', notes: 'Quick notes' };
function openPanel() { drawPanel(); $('#panel').hidden = false; }
function drawPanel() {
  const box = $('#switches'); box.replaceChildren();
  for (const [k, label] of Object.entries(LABELS)) {
    const r = h('div', 'sw'), b = h('button', D.widgets[k] ? 'on' : ''); r.append(h('span', null, label), b);
    b.onclick = async () => { D.widgets[k] = !D.widgets[k]; b.classList.toggle('on', D.widgets[k]); applyTheme(); await post('set', { widgets: D.widgets }); }; box.append(r);
  }
  $('#pname').value = D.name; $('#pcity').value = D.city;
  for (const b of $$('#units button')) b.classList.toggle('on', b.dataset.u === D.units);
}
$('#custom').onclick = openPanel; $('#pclose').onclick = () => $('#panel').hidden = true;
$('#pname').onchange = async () => { D.name = $('#pname').value.trim(); tick(); await post('set', { name: D.name }); };
$('#pcity').onchange = async () => { D.city = $('#pcity').value.trim(); await post('set', { city: D.city }); drawWeather(); };
for (const b of $$('#units button')) b.onclick = async () => { D.units = b.dataset.u; drawPanel(); await post('set', { units: D.units }); drawWeather(); };
$('#wpick').onclick = () => post('wallpaper', { action: 'pick' });
$('#wreset').onclick = async () => { await post('wallpaper', { action: 'reset' }); refresh(); };
$('#sreset').onclick = async () => { await post('shortcuts', { reset: true }); refresh(); };

/* ---------- boot ---------- */
async function refresh(first) {
  if (saving) return;
  try { D = await get('home'); } catch { return; }
  applyTheme(); tick(); drawSearch(); drawTiles(); drawRecents(); drawBookmarks();
  if (document.activeElement !== $('#note')) $('#note').value = D.notes;
  if (first || lastW !== D.city + D.units) { lastW = D.city + D.units; drawWeather(); }
  if (!$('#panel').hidden) drawPanel();
}
for (const [sel, n] of [['#card .crown', 'crown'], ['#card .chev', 'chev'], ['#recents header>.ic', 'clock'], ['#recents a .ic', 'arrow'], ['#bookmarks header>.ic', 'bookmark'], ['#bookmarks a .ic', 'arrow'],
  ['#notes header>.ic', 'note'], ['#notefocus .ic', 'pencil'], ['#custom .ic', 'wand'], ['#pclose .ic', 'close']]) fill(sel, n);
refresh(true); setInterval(tick, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); addEventListener('focus', () => refresh());
