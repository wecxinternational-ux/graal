/* ═══════════════════════════════════════════════════════════
   ГРААЛЬ  ·  App
═══════════════════════════════════════════════════════════════ */

/* ── Theme (светлая/тёмная) ── */
if (localStorage.getItem('theme') === 'light') document.body.classList.add('light');

function toggleTheme() {
  const light = document.body.classList.toggle('light');
  localStorage.setItem('theme', light ? 'light' : 'dark');
  updateThemeBtn();
}
function updateThemeBtn() {
  const icon = document.body.classList.contains('light') ? '🌙' : '☀';
  document.querySelectorAll('.theme-btn').forEach(b => b.textContent = icon);
}
updateThemeBtn();

/* ── Lazy image loading ── */
let _lazyObs = null;
function initLazyImages(root = document) {
  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll('.lz-img').forEach(el => loadLazyImg(el));
    return;
  }
  if (!_lazyObs) {
    _lazyObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          loadLazyImg(e.target);
          _lazyObs.unobserve(e.target);
        }
      });
    }, { rootMargin: '150px', threshold: 0.01 });
  }
  root.querySelectorAll('.lz-img:not(.lz-done)').forEach(el => _lazyObs.observe(el));
}
function loadLazyImg(el) {
  const src = el.getAttribute('data-src');
  if (!src) return;
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (!img) return;
  img.onload = () => { el.classList.add('lz-done'); img.style.opacity = '1'; };
  img.onerror = () => { el.classList.add('lz-done'); img.style.opacity = '1'; };
  img.src = src;
  img.style.opacity = '0';
  img.style.transition = 'opacity .25s ease';
}
function lzImg(src, attrs = '') {
  if (!src) return '';
  return `<img class="lz-img" data-src="${src}" ${attrs} loading="lazy" style="opacity:0;transition:opacity .25s ease">`;
}

/* ── API helpers ── */
const API_BASE = '/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

async function apiRequest(endpoint, options = {}, query = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  let url = `${API_BASE}${endpoint}`;
  if (Object.keys(query).length > 0) {
    const params = new URLSearchParams(query);
    url += `?${params}`;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function fetchData() {
  try {
    // Параллельная загрузка лёгких секций отдельными запросами.
    // items загружается лениво при заходе во вкладку/профиль (тяжёлые base64-картинки).
    const [players, factions, transactions] = await Promise.all([
      apiRequest('/players').catch(() => []),
      apiRequest('/factions').catch(() => []),
      apiRequest('/transactions').catch(() => [])
    ]);
    DB = { ...(DB || {}), players, factions, transactions };
    loadedSections.clear();
    loadedSections.add('players');
    loadedSections.add('factions');
    loadedSections.add('transactions');
    notifyResolvedRequests();
    saveCache();
    return DB;
  } catch (e) {
    console.error('Failed to fetch data:', e);
  }
}

// Ленивая подгрузка одной секции при первом заходе во вкладку.
// Кешируем загруженные секции, чтобы не тянуть повторно.
const loadedSections = new Set();
// Фоновое обновление: показываем кеш сразу, в тянем свежее
async function ensureSection(name) {
  const endpoints = {
    notes: '/notes',
    guides: '/guides',
    logs: '/logs',
    items: '/items'
  };
  const ep = endpoints[name];
  if (!ep) return DB[name] || [];
  // Если секция уже загружена — не перезапрашиваем
  if (loadedSections.has(name)) return DB[name] || [];
  try {
    const data = await apiRequest(ep);
    DB[name] = data;
    loadedSections.add(name);
    saveCache();
    return data;
  } catch (e) {
    console.error('Failed to fetch section ' + name + ':', e);
    return DB[name] || [];
  }
}
// Фоновое обновление секции без блокировки UI (тихо)
async function refreshSection(name) {
  const endpoints = {
    notes: '/notes',
    guides: '/guides',
    logs: '/logs',
    items: '/items'
  };
  const ep = endpoints[name];
  if (!ep) return;
  try {
    const data = await apiRequest(ep);
    DB[name] = data;
    saveCache();
  } catch (e) {/* тихо */}
}
// Принудительная перезагрузка секции (после создания/редактирования/удаления)
async function reloadSection(name) {
  const endpoints = {
    notes: '/notes',
    guides: '/guides',
    logs: '/logs',
    items: '/items',
    players: '/players',
    factions: '/factions',
    transactions: '/transactions'
  };
  const ep = endpoints[name];
  if (!ep) return;
  try {
    const data = await apiRequest(ep);
    DB[name] = data;
    loadedSections.add(name);
    saveCache();
  } catch (e) {
    console.error('Failed to reload section ' + name + ':', e);
  }
}

/* ── Уведомления игроку о результате его запросов/транзакций ──
   Храним в localStorage последний известный статус каждого запроса.
   При обнаружении перехода pending → approved/rejected показываем toast. */
function getSeenTxStatuses(){
  try{return JSON.parse(localStorage.getItem('seenTxStatuses')||'{}')}catch{return {}}
}
function setSeenTxStatuses(obj){
  try{localStorage.setItem('seenTxStatuses',JSON.stringify(obj))}catch{}
}
function notifyResolvedRequests(){
  if(!currentUser||!DB||!DB.transactions)return;
  const seen=getSeenTxStatuses();
  const mine=DB.transactions.filter(t=>t.player===currentUser.username);
  let changed=false;
  for(const t of mine){
    const prev=seen[t.id];
    // Уведомляем только о новых завершениях (переход из pending)
    if(prev==='pending' && (t.status==='approved'||t.status==='rejected')){
      const isReq=t.type==='request';
      const verb=t.status==='approved'?(isReq?'Запрос одобрен':'Транзакция одобрена'):(isReq?'Запрос отклонён':'Транзакция отклонена');
      const icon=t.status==='approved'?'✓':'✗';
      const type=t.status==='approved'?'ok':'er';
      // Обрезаем длинный текст для компактности тоста
      const preview=t.desc&&t.desc.length>50?t.desc.slice(0,50)+'…':(t.desc||'');
      toast(`${icon} ${verb}: ${preview}`, type);
    }
    if(seen[t.id]!==t.status){seen[t.id]=t.status;changed=true}
  }
  if(changed)setSeenTxStatuses(seen);
}

/* ── Auth functions ── */
function switchAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-error').style.display = 'none';
}

// Показ/скрытие поля кода приглашения при выборе роли ГМ в форме регистрации
function updateGmCodeVisibility() {
  const role = document.querySelector('input[name="register-role"]:checked')?.value || 'player';
  const wrap = document.getElementById('register-gmcode-wrap');
  if (wrap) wrap.style.display = role === 'gm' ? 'block' : 'none';
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.style.display = 'block';
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showAuthError('Пожалуйста, заполните все поля');
    return;
  }

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showApp();
    toast('Добро пожаловать!', 'ok');
  } catch (e) {
    showAuthError(e.message || 'Ошибка авторизации');
  }
}

async function register() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const role = document.querySelector('input[name="register-role"]:checked')?.value || 'player';
  const gmCode = document.getElementById('register-gmcode')?.value.trim();

  if (!username || !email || !password) {
    showAuthError('Пожалуйста, заполните все поля');
    return;
  }

  // Код приглашения для ГМ проверяется на бэкенде.
  // Bootstrap: первый ГМ может зарегистрироваться без кода.
  try {
    const payload = { username, email, password, role };
    if (role === 'gm' && gmCode) payload.gmCode = gmCode;
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showApp();
    toast('Регистрация успешна!', 'ok');
  } catch (e) {
    showAuthError(e.message || 'Ошибка регистрации');
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  showAuthPage();
  toast('Вы вышли из аккаунта', 'if');
}

function showAuthPage() {
  document.getElementById('auth-page').style.display = 'flex';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
  document.body.classList.remove('role-gm', 'role-player');
}

function showApp() {
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('main-content').style.display = 'block';
  // Применяем роль к body — CSS скрывает .gm-only / .player-only
  document.body.classList.remove('role-gm', 'role-player');
  document.body.classList.add(currentUser?.role === 'gm' ? 'role-gm' : 'role-player');
  // Кнопка «Стать ГМ» видна только игрокам
  const promoteBtn = document.getElementById('promote-btn');
  if (promoteBtn) promoteBtn.style.display = currentUser?.role === 'gm' ? 'none' : 'block';
  updateUserProfile();
  // Для игрока активируем вкладку 'guide' (items/notes/gm/logs скрыты)
  const firstTab = currentUser?.role === 'gm' ? 'items' : 'guide';
  const activeNav = document.querySelector('.nav-a.on');
  if (!activeNav || activeNav.classList.contains('gm-only') && currentUser?.role !== 'gm') {
    document.querySelectorAll('.nav-a').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    const target = document.querySelector(`.nav-a[data-tab="${firstTab}"]`);
    const targetTab = document.getElementById('tab-' + firstTab);
    if (target) target.classList.add('on');
    if (targetTab) targetTab.classList.add('on');
  }
  initApp();
}

function updateUserProfile() {
  if (currentUser) {
    document.getElementById('user-avatar').textContent = currentUser.username.slice(0, 2).toUpperCase();
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-role').textContent = currentUser.role === 'gm' ? 'Гейммастер' : 'Игрок';
  }
}

/* Мобильное меню */
function toggleSidebar(force){
  const sb=document.getElementById('sidebar');
  const bd=document.getElementById('sb-backdrop');
  const open=force===false?false:force===true?true:!sb.classList.contains('open');
  sb.classList.toggle('open',open);
  bd.classList.toggle('open',open);
}
/* Раскрытие фильтров на мобайле */
function toggleFilters(nsfId){
  const nsf=document.getElementById(nsfId);
  if(!nsf)return;
  nsf.classList.toggle('open');
}
/* Обновление счётчика активных фильтров */
function updateFilterCount(nsfId,activeCount){
  const el=document.getElementById(nsfId+'-count');
  if(!el)return;
  el.textContent=activeCount>0?activeCount:'';
  el.style.display=activeCount>0?'inline-block':'none';
}
/* Закрытие меню при выборе пункта */
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.nav-a').forEach(el=>{
    el.addEventListener('click',()=>{
      if(window.matchMedia('(max-width: 768px)').matches)toggleSidebar(false);
    });
  });
});

/* ── Constants ── */
const RARITY={common:'Обычный',uncommon:'Необычный',rare:'Редкий',very_rare:'Очень редкий',legendary:'Легендарный',artifact:'Артефакт',none:'Без редкости',varies:'Варьируется'};
const STAGES={0:'Без этапа',1:'I этап',2:'II этап',3:'III этап',4:'IV этап'};
const ATTUNE={yes:'Требуется',no:'Нет',other:'Особая'};
const ITEM_EMO={Оружие:'⚔',Доспехи:'🛡',Кольцо:'💍',Зелье:'⚗',Одеяние:'🪄',Артефакт:'✨',Свиток:'📜'};
const ALL_TAGS=['Перевод','Правила','Лор','Объявление','Карта','НИП'];
const FACTIONS_DEFAULT=[
  {name:'Орден Рассветного Щита',color:'#FBBF24'},
  {name:'Культ Разлома',color:'#F87171'},
  {name:'Гильдия Странников',color:'#60A5FA'},
  {name:'Серебряный Ковен',color:'#C084FC'},
  {name:'Нейтральные',color:'#9CA3AF'},
];
function emo(type){const k=Object.keys(ITEM_EMO).find(k=>type?.includes(k));return k?ITEM_EMO[k]:'🔮'}
function formatDesc(desc){
  if(!desc)return '';
  let html=desc
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');
  return `<p>${html}</p>`;
}

/* ── State ── */
let DB={
  items: [],
  notes: [],
  guides: [],
  players: [],
  logs: [],
  factions: [...FACTIONS_DEFAULT],
  transactions: [],
};

/* ── Cache (localStorage) ── */
const CACHE_KEY='graal_cache_v1';
function saveCache(){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      DB:{players:DB.players,factions:DB.factions,transactions:DB.transactions,
          notes:DB.notes,guides:DB.guides,logs:DB.logs,items:DB.items},
      ts:Date.now()
    }));
  }catch(e){/* quota exceeded — игнорируем */}
}
function loadCache(){
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    if(!raw)return null;
    const c=JSON.parse(raw);
    return c;
  }catch(e){return null}
}

let currentItemId=null;
let threadPostId=null;
let threadType=null;
let noteAtts={nn:[],ng:[]};

/* ── Particles ── */
(()=>{
  const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
  let W,H,pts=[];
  function rsz(){W=cv.width=innerWidth;H=cv.height=innerHeight;init()}
  function init(){pts=[];const n=Math.floor(W*H/14000);for(let i=0;i<n;i++)pts.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+.3,vx:(Math.random()-.5)*.14,vy:(Math.random()-.5)*.14,a:Math.random()*.35+.08,c:Math.random()>.5?'120,60,255':'201,168,76'})}
  function draw(){ctx.clearRect(0,0,W,H);pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(${p.c},${p.a})`;ctx.fill()});requestAnimationFrame(draw)}
  addEventListener('resize',rsz);rsz();draw();
})();

/* ── Nav ── */
document.querySelectorAll('.nav-a').forEach(a=>{
  a.addEventListener('click',()=>{
    document.querySelectorAll('.nav-a').forEach(x=>x.classList.remove('on'));
    a.classList.add('on');
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
    document.getElementById('tab-'+a.dataset.tab).classList.add('on');
    renderTab(a.dataset.tab);
  });
});
async function renderTab(t){
  // Ленивая подгрузка тяжёлых секций при заходе во вкладку
  const containerId = {notes:'notes-list',guide:'guide-list',logs:'log-feed',items:'items-grid',players:'players-grid'}[t];
  const secName = t==='guide'?'guides':t;
  const hasCache = loadedSections.has(secName);
  // Показываем спиннер, только если нет кеша и нужно грузить
  const needLoad = (t==='notes'||t==='guide'||t==='logs'||t==='items') && !hasCache;
  if(needLoad && containerId){
    const el=document.getElementById(containerId);
    if(el)el.innerHTML='<div class="emp"><div class="emp-ic spin">⏳</div><h3>Загрузка…</h3></div>';
  }
  if(t==='notes'){
    await ensureSection('notes');
    buildTagsFilter('note-tags-filter',renderNotes,(DB.notes||[]).flatMap(n=>n.tags||[]));
    renderNotes();
    // Фоновое обновление, если данные из кеша
    if(hasCache) refreshSection('notes').then(()=>{buildTagsFilter('note-tags-filter',renderNotes,(DB.notes||[]).flatMap(n=>n.tags||[]));renderNotes()});
  }
  else if(t==='guide'){
    await ensureSection('guides');
    buildTagsFilter('guide-tags-filter',renderGuide,(DB.guides||[]).flatMap(g=>g.tags||[]));
    renderGuide();
    if(hasCache) refreshSection('guides').then(()=>{buildTagsFilter('guide-tags-filter',renderGuide,(DB.guides||[]).flatMap(g=>g.tags||[]));renderGuide()});
  }
  else if(t==='logs'){await ensureSection('logs');renderLogs();if(hasCache)refreshSection('logs').then(renderLogs)}
  else if(t==='players'){renderPlayers()}
  else if(t==='gm'){renderGm()}
  else if(t==='items'){await ensureSection('items');renderItems();populatePlayerSelects();if(hasCache)refreshSection('items').then(()=>{renderItems();populatePlayerSelects()})}
  // Обновляем статус активной вкладки для тулбара (мобильный)
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
}

/* ══════════════
   ITEMS
══════════════ */
function renderItems(){
  const q=(document.getElementById('item-q')?.value||'').toLowerCase();
  const rarEls=document.querySelectorAll('#ms-rar input:checked');
  const rars=[...rarEls].map(el=>el.value);
  const stgEls=document.querySelectorAll('#ms-stg input:checked');
  const stgs=[...stgEls].map(el=>el.value);
  const attEls=document.querySelectorAll('#ms-att input:checked');
  const atts=[...attEls].map(el=>el.value);
  const list=(DB.items||[]).filter(it=>{
    const mq=!q||it.name.toLowerCase().includes(q)||it.type.toLowerCase().includes(q);
    const mr=!rars.length||rars.includes(it.rarity);
    const ms=!stgs.length||stgs.includes(String(it.stage));
    const ma=!atts.length||atts.includes(it.attune);
    return mq&&mr&&ms&&ma;
  });
  const g=document.getElementById('items-grid');
  if(!list.length){g.innerHTML='<div class="emp"><div class="emp-ic">🔮</div><h3>Предметы не найдены</h3><p>Измените фильтры или добавьте предмет</p></div>';return}
  g.innerHTML=list.map(it=>{
    const awarded=it.awardedTo.reduce((s,a)=>s+a.qty,0);
    return `
    <div class="card ic" onclick="openItemDetail(${it.id})">
      ${it.img?`<img class="ic-img lz-img" data-src="${it.img}" alt="${it.name}" onerror="this.style.display='none'" style="opacity:0;transition:opacity .25s ease">`:`<div class="ic-ph">${emo(it.type)}</div>`}
      <span class="stg">${STAGES[it.stage]}</span>
      <div class="ic-bd">
        <div class="rb r-${it.rarity}">${RARITY[it.rarity]}</div>
        <div class="ic-n">${it.name}</div>
        <div class="ic-ty">${it.type}</div>
        <div class="ic-ft">
          <span class="ip">${it.price>0?it.price+' ОС':'Бесценен'}</span>
          <span class="iq" title="Выдано игрокам">выдано ×${awarded}</span>
        </div>
      </div>
    </div>`
  }).join('');
  initLazyImages(g);
}
function resetItemFilters(){
  const q=document.getElementById('item-q');if(q)q.value='';
  document.querySelectorAll('#ms-rar input, #ms-stg input, #ms-att input').forEach(el=>el.checked=false);
  document.getElementById('ms-rar-value').textContent='Все';
  document.getElementById('ms-stg-value').textContent='Все';
  document.getElementById('ms-att-value').textContent='Все';
  renderItems();
}
function toggleMultiSelect(id){
  const dropdown=document.getElementById(id);
  const trigger=document.getElementById(id+'-trigger');
  if(!dropdown||!trigger)return;
  dropdown.classList.toggle('open');
  trigger.classList.toggle('active');
  if(dropdown.classList.contains('open')){
    document.addEventListener('click',function closeOutside(e){
      if(!dropdown.contains(e.target)&&!trigger.contains(e.target)){
        dropdown.classList.remove('open');
        trigger.classList.remove('active');
        document.removeEventListener('click',closeOutside);
      }
    });
  }
}
function updateMultiSelect(dropdownId,valueId){
  const dropdown=document.getElementById(dropdownId);
  const valueEl=document.getElementById(valueId);
  const checked=dropdown.querySelectorAll('input:checked');
  const labels=[...checked].map(el=>{
    const label=el.parentElement;
    return label.textContent.trim();
  });
  if(labels.length===0)valueEl.textContent='Все';
  else if(labels.length===1)valueEl.textContent=labels[0];
  else valueEl.textContent=labels.length+' выбранно';
  renderItems();
}

/* Add item */
async function addItem(){
  const name=document.getElementById('ni-name').value.trim();
  if(!name){toast('Введите название','er');return}
  const it={
    name,
    type:document.getElementById('ni-type').value.trim()||'Чудесный предмет',
    rarity:document.getElementById('ni-rar').value,
    attune:document.getElementById('ni-att').value,
    stage:parseInt(document.getElementById('ni-stg').value),
    price:parseInt(document.getElementById('ni-price').value)||0,
    desc:document.getElementById('ni-desc').value.trim(),
    author:document.getElementById('ni-author').value.trim()||currentUser?.username||'Мастер Эрандил',
    img:document.getElementById('ni-img').value.trim()
  };
  const newItem = await apiRequest('/items', {
    method: 'POST',
    body: JSON.stringify(it)
  });
  DB.items.unshift(newItem);
  await addLog('item','⚔',`Предмет <span class="li-it">«${it.name}»</span> добавлен. Добавил: <span class="li-pl">${it.author}</span>.`);
  toast(`«${it.name}» добавлен`,'ok');
  closeModal('m-add-item');
  ['ni-name','ni-type','ni-price','ni-desc','ni-author','ni-img'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  document.getElementById('ni-img-preview').style.display='none';
  document.getElementById('ni-file-inp').value='';
  noteAtts.ni=[];
  renderItems();
}

function openEditItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  if(!it)return;
  document.getElementById('ei-name').value=it.name||'';
  document.getElementById('ei-rar').value=it.rarity||'common';
  document.getElementById('ei-type').value=it.type||'';
  document.getElementById('ei-att').value=it.attune||'no';
  document.getElementById('ei-stg').value=it.stage||1;
  document.getElementById('ei-price').value=it.price||'';
  document.getElementById('ei-desc').value=it.desc||'';
  document.getElementById('ei-author').value=it.author||'';
  document.getElementById('ei-img').value=it.img||'';

  const currImg=document.getElementById('ei-current-img');
  const currImgEl=document.getElementById('ei-current-img-el');
  const prevImg=document.getElementById('ei-img-preview');
  if(it.img){
    currImgEl.src=it.img;
    currImg.style.display='block';
    prevImg.style.display='none';
  }else{
    currImg.style.display='none';
    prevImg.style.display='none';
  }
  document.getElementById('ei-file-inp').value='';
  noteAtts.ei=[];

  closeModal('m-item-detail');
  openModal('m-edit-item');
}

async function saveItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  if(!it)return;

  const name=document.getElementById('ei-name').value.trim();
  if(!name){toast('Введите название','er');return}

  const imgData=(noteAtts.ei||[])[0]?.data;
  const img=imgData||document.getElementById('ei-img').value.trim();

  const updated={
    ...it,
    name,
    type:document.getElementById('ei-type').value.trim()||'Чудесный предмет',
    rarity:document.getElementById('ei-rar').value,
    attune:document.getElementById('ei-att').value,
    stage:parseInt(document.getElementById('ei-stg').value),
    price:parseInt(document.getElementById('ei-price').value)||0,
    desc:document.getElementById('ei-desc').value.trim(),
    author:document.getElementById('ei-author').value.trim()||currentUser?.username||'Мастер Эрандил',
    img
  };

  await apiRequest('/items', {
    method: 'PUT',
    body: JSON.stringify(updated)
  }, { id: it.id });

  const idx=DB.items.findIndex(x=>x.id===it.id);
  if(idx!==-1)DB.items[idx]=updated;

  await addLog('item','⚔',`Предмет <span class="li-it">«${it.name}»</span> отредактирован. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`«${name}» обновлён`,'ok');
  closeModal('m-edit-item');
  renderItems();
}

function openItemDetail(id){
  const it=DB.items.find(x=>x.id===id);if(!it)return;
  currentItemId=id;
  document.getElementById('det-title').textContent=it.name;
  const awSel=document.getElementById('aw-player');
  const eligiblePlayers=DB.players.filter(p=>(p.chars||[]).some(c=>c.verified));
  awSel.innerHTML='<option value="">Выбрать игрока…</option>'+eligiblePlayers.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
  document.getElementById('aw-char').innerHTML='<option value="">Выбрать персонажа…</option>';
  const totalAwarded=it.awardedTo.reduce((s,a)=>s+a.qty,0);
  const awdHtml=it.awardedTo.length?`<div class="aw-list">${it.awardedTo.map(a=>`
    <div class="aw-li">
      <span class="aw-li-n">${a.player}${a.charName?' → '+a.charName:''}</span>
      <span class="aw-li-q">×${a.qty}</span>
    </div>`).join('')}</div>`:'<p style="font-size:12px;color:var(--txt-m);margin-top:6px">Ещё никому не выдан</p>';
  document.getElementById('det-body').innerHTML=`
    <div class="id-hd">
      ${it.img?`<img class="id-img lz-img" data-src="${it.img}" onerror="this.outerHTML='<div class=id-img style=font-size:38px;display:flex;align-items:center;justify-content:center>${emo(it.type)}</div>'" style="opacity:0;transition:opacity .25s ease">`:`<div class="id-img" style="font-size:38px;display:flex;align-items:center;justify-content:center">${emo(it.type)}</div>`}
      <div class="id-meta">
        <div class="rb r-${it.rarity}">${RARITY[it.rarity]}</div>
        <div class="sr"><strong>Тип:</strong>${it.type}</div>
        <div class="sr"><strong>Настройка:</strong>${ATTUNE[it.attune]||it.attune}</div>
        <div class="sr"><strong>Этап:</strong>${STAGES[it.stage]}</div>
        <div class="sr"><strong>Цена:</strong><span style="color:var(--gold)">${it.price>0?it.price+' ОС':'Бесценен'}</span></div>
        <div class="sr"><strong>Выдано:</strong><span style="color:var(--pur-b)">×${totalAwarded}</span></div>
        <div class="sr"><strong>Автор:</strong>${it.author}</div>
      </div>
    </div>
    <div class="id-desc">${formatDesc(it.desc)}</div>
    <div style="margin-top:12px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--txt-m)">Выдано игрокам</div>
    ${awdHtml}`;
  openModal('m-item-detail');
  initLazyImages(document.getElementById('m-item-detail'));
}
function updateCharSelect(){
  const playerName=document.getElementById('aw-player').value;
  const charSel=document.getElementById('aw-char');
  if(!playerName){
    charSel.innerHTML='<option value="">Выбрать персонажа…</option>';
    return;
  }
  const p=DB.players.find(x=>x.name===playerName);
  if(!p||!p.chars||!p.chars.length){
    charSel.innerHTML='<option value="">Нет персонажей</option>';
    return;
  }
  const verifiedChars=p.chars.filter(c=>c.verified);
  charSel.innerHTML='<option value="">Выбрать персонажа…</option>'+verifiedChars.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
}
async function awardItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  const player=document.getElementById('aw-player').value;
  const charName=document.getElementById('aw-char').value;
  const qty=parseInt(document.getElementById('aw-qty').value)||1;
  if(!it||!player){toast('Выберите игрока','er');return}
  if(!charName){toast('Выберите персонажа','er');return}
  if(qty<1){toast('Количество должно быть ≥ 1','er');return}
  document.getElementById('confirm-award-text').textContent=`Вы уверены, что хотите выдать предмет «${it.name}» персонажу ${charName} (игрок: ${player}) ×${qty}?`;
  openModal('m-confirm-award');
}
async function confirmAwardItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  const player=document.getElementById('aw-player').value;
  const charName=document.getElementById('aw-char').value;
  const qty=parseInt(document.getElementById('aw-qty').value)||1;
  if(!it||!player||!charName)return;
  closeModal('m-confirm-award');
  const exIdx=it.awardedTo.findIndex(a=>a.player===player&&(a.charName===charName||!a.charName));
  if(exIdx!==-1){
    it.awardedTo[exIdx].qty+=qty;
    it.awardedTo[exIdx].charName=charName;
  } else {
    it.awardedTo.push({player,charName,qty});
  }
  await apiRequest('/items', {
    method: 'PUT',
    body: JSON.stringify(it)
  }, { id: it.id });
  await addLog('item','⚔',`Предмет <span class="li-it">«${it.name}»</span> выдан <span class="li-pl">${player}/${charName}</span> ×${qty}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`«${it.name}» выдан ${charName} ×${qty}`,'ok');
  closeModal('m-item-detail');renderItems();
}
async function revokeItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  const player=document.getElementById('aw-player').value;
  const charName=document.getElementById('aw-char').value;
  const qty=parseInt(document.getElementById('aw-qty').value)||1;
  if(!it||!player){toast('Выберите игрока','er');return}
  if(!charName){toast('Выберите персонажа','er');return}
  const exIdx=it.awardedTo.findIndex(a=>a.player===player&&(a.charName===charName||!a.charName));
  if(exIdx===-1){toast('У этого персонажа нет данного предмета','er');return}
  const ex=it.awardedTo[exIdx];
  if(ex.qty<qty){toast(`У персонажа только ×${ex.qty}, нельзя изъять ×${qty}`,'er');return}
  const actualQty=qty;
  ex.qty-=actualQty;
  if(ex.qty<=0)it.awardedTo.splice(exIdx,1);
  await apiRequest('/items', {
    method: 'PUT',
    body: JSON.stringify(it)
  }, { id: it.id });
  await addLog('revoke','🚫',`Предмет <span class="li-it">«${it.name}»</span> изъят у <span class="li-pl">${player}/${charName}</span> ×${actualQty}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`«${it.name}» изъят у ${charName} ×${actualQty}`,'ok');
  closeModal('m-item-detail');renderItems();
}

async function deleteItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  if(!it)return;
  if(!confirm(`Удалить предмет «${it.name}»? Это действие нельзя отменить.`))return;
  try{
    await apiRequest('/items',{method:'DELETE'},{id:it.id});
    DB.items=DB.items.filter(x=>x.id!==it.id);
    await addLog('item','🗑',`Предмет <span class="li-it">«${it.name}»</span> удалён. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
    toast(`«${it.name}» удалён`,'ok');
    closeModal('m-item-detail');renderItems();
  }catch(e){toast(e.message||'Ошибка удаления','er')}
}

function quickRevoke(playerName){
  const it=DB.items.find(x=>x.id===currentItemId);if(!it)return;
  const ex=it.awardedTo.find(a=>a.player===playerName);if(!ex)return;
  const sel=document.getElementById('aw-player');
  for(let i=0;i<sel.options.length;i++){
    if(sel.options[i].value===playerName){sel.selectedIndex=i;break}
  }
  updateCharSelect();
  if(ex.charName){
    const charSel=document.getElementById('aw-char');
    for(let i=0;i<charSel.options.length;i++){
      if(charSel.options[i].value===ex.charName){charSel.selectedIndex=i;break}
    }
  }
  document.getElementById('aw-qty').value=ex.qty;
  toast(`Выбран ${playerName}${ex.charName?'/'+ex.charName:''} ×${ex.qty} — нажмите «Изъять»`,'if');
}

/* ══════════════
   EDITOR TOOLBAR (reusable)
══════════════ */
function buildToolbar(editorId){
  const btns=[
    ['<b>B</b>','bold'],['<i>I</i>','italic'],['<u>U</u>','underline'],['<s>S</s>','strikeThrough'],null,
    ['H1',()=>document.execCommand('formatBlock',false,'h1')],
    ['H2',()=>document.execCommand('formatBlock',false,'h2')],
    ['H3',()=>document.execCommand('formatBlock',false,'h3')],null,
    ['≡',()=>document.execCommand('insertUnorderedList')],
    ['1.',()=>document.execCommand('insertOrderedList')],
    ['❝',()=>document.execCommand('formatBlock',false,'blockquote')],null,
    ['🔗',()=>{const u=prompt('URL:','https://');if(u)document.execCommand('createLink',false,u)}],
    ['─',()=>document.execCommand('insertHorizontalRule')],
    ['Таблица',()=>insertTable(editorId)],
    ['Картинка',()=>insertImageLink(editorId)],
  ];
  return '<div class="etb">'+btns.map(b=>{
    if(!b)return '<div class="tb-sep"></div>';
    const [label,cmd]=b;
    return `<button class="tb-btn" onmousedown="ev=>{ev.preventDefault();${typeof cmd==='string'?`document.getElementById('${editorId}').focus();document.execCommand('${cmd}');`:``}" onclick="(()=>{${typeof cmd==='string'?`document.getElementById('${editorId}').focus();document.execCommand('${cmd}');`:`${cmd.toString()};`})">${label}</button>`;
  }).join('')+'</div>';
}
function insertTable(eid){
  const rows=parseInt(prompt('Строк:','3')||3);
  const cols=parseInt(prompt('Столбцов:','3')||3);
  if(!rows||!cols)return;
  let html='<table><tr>'+Array(cols).fill(0).map((_,i)=>`<th>Столбец ${i+1}</th>`).join('')+'</tr>';
  for(let r=0;r<rows;r++)html+='<tr>'+Array(cols).fill(0).map(()=>`<td>&nbsp;</td>`).join('')+'</tr>';
  html+='</table><p></p>';
  const ed=document.getElementById(eid);ed.focus();
  document.execCommand('insertHTML',false,html);
}
function insertImageLink(eid){
  const url=prompt('URL изображения:','https://');
  if(url){document.getElementById(eid).focus();document.execCommand('insertImage',false,url)}
}
function initToolbar(tbId,edId){
  const c=document.getElementById(tbId);
  if(!c)return;
  const btns=[
    {l:'<b>B</b>',a:'bold'},{l:'<i>I</i>',a:'italic'},{l:'<u>U</u>',a:'underline'},{l:'<s>S</s>',a:'strikeThrough'},
    null,
    {l:'H1',fn:()=>execEd(edId,'formatBlock','h1')},{l:'H2',fn:()=>execEd(edId,'formatBlock','h2')},{l:'H3',fn:()=>execEd(edId,'formatBlock','h3')},
    null,
    {l:'≡',fn:()=>execEd(edId,'insertUnorderedList')},{l:'1.',fn:()=>execEd(edId,'insertOrderedList')},
    {l:'❝',fn:()=>execEd(edId,'formatBlock','blockquote')},
    null,
    {l:'🔗',fn:()=>{const u=prompt('URL:','https://');if(u)execEd(edId,'createLink',u)}},
    {l:'─',fn:()=>execEd(edId,'insertHorizontalRule')},
    {l:'Таблица',fn:()=>insertTable(edId)},
    {l:'Картинка',fn:()=>insertImageLink(edId)},
  ];
  c.innerHTML='<div class="etb">'+btns.map(b=>{
    if(!b)return '<div class="tb-sep"></div>';
    return `<button class="tb-btn">${b.l}</button>`;
  }).join('')+'</div>';
  const allBtns=c.querySelectorAll('.tb-btn');
  let bi=0;
  btns.forEach(b=>{if(!b)return;const btn=allBtns[bi++];if(!btn)return;btn.addEventListener('click',()=>{if(b.a)execEd(edId,b.a);else if(b.fn)b.fn()})});
}
function execEd(edId,cmd,val){
  const el=document.getElementById(edId);el.focus();
  document.execCommand(cmd,false,val||null);
}

/* File attachments */
function handleFiles(e,pfx){
  const files=Array.from(e.target.files);
  files.forEach(f=>readFile(f,pfx));
}
function handleDrop(e,pfx){
  e.preventDefault();
  Array.from(e.dataTransfer.files).forEach(f=>readFile(f,pfx));
  document.getElementById(pfx+'-fdz').classList.remove('drag');
}
function readFile(file,pfx){
  const reader=new FileReader();
  reader.onload=ev=>{
    if(pfx==='nc'||pfx==='ni'||pfx==='ei'||pfx.startsWith('ce-')||pfx==='pd'){
      const preview=document.getElementById(`${pfx}-img-preview`);
      const previewImg=document.getElementById(`${pfx}-img-preview-img`);
      const imgInput=document.getElementById(`${pfx}-img`);
      if(preview&&previewImg){
        previewImg.src=ev.target.result;
        preview.style.display='block';
      }
      if(imgInput)imgInput.value=ev.target.result;
      noteAtts[pfx]=[{name:file.name,type:file.type,data:ev.target.result}];
    }else{
      noteAtts[pfx]=noteAtts[pfx]||[];
      noteAtts[pfx].push({name:file.name,type:file.type,data:ev.target.result});
      renderAttList(pfx);
    }
  };
  if(file.type.startsWith('image/'))reader.readAsDataURL(file);
  else reader.readAsDataURL(file);
}
function renderAttList(pfx){
  const list=document.getElementById(pfx+'-att-list');
  if(!list)return;
  list.innerHTML=(noteAtts[pfx]||[]).map((a,i)=>`
    <div class="att-chip" onclick="removeAtt('${pfx}',${i})">
      <span>${a.type.startsWith('image/')?'🖼':'📎'}</span>${a.name} <span style="margin-left:auto;opacity:.5;font-size:10px">✕</span>
    </div>`).join('');
}
function removeAtt(pfx,i){noteAtts[pfx].splice(i,1);renderAttList(pfx);}

/* Tags checkboxes */
function buildTagsSelect(containerId, extra=[]){
  const c=document.getElementById(containerId);if(!c)return;
  const all=[...new Set([...ALL_TAGS,...extra])];
  c.innerHTML=all.map(t=>`<div class="tag-ck"><label><input type="checkbox" value="${t}"> ${t}</label></div>`).join('');
}
function getSelectedTags(containerId){
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(el=>el.value);
}
/* Custom tag input — добавляет новый тег-чекбокс в контейнер */
function addCustomTag(containerId, inputId){
  const inp=document.getElementById(inputId);
  if(!inp)return;
  const val=inp.value.trim();
  if(!val){toast('Введите название тега','er');return}
  if(val.length>32){toast('Тег слишком длинный (макс. 32)','er');return}
  const c=document.getElementById(containerId);if(!c)return;
  // Проверяем дубли
  const existing=[...c.querySelectorAll('input[type=checkbox]')].map(el=>el.value);
  if(existing.includes(val)){toast('Такой тег уже есть','er');return}
  // Создаём чекбокс, сразу отмеченный
  const div=document.createElement('div');
  div.className='tag-ck tag-custom';
  div.innerHTML=`<label><input type="checkbox" value="${val.replace(/"/g,'&quot;')}" checked> ${val}</label>
    <button type="button" class="tag-rm" title="Удалить тег" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
  inp.value='';
  inp.focus();
}
function buildTagsFilter(filterId,renderFn,existingTags=[]){
  const c=document.getElementById(filterId);if(!c)return;
  const tags=['Все',...new Set([...ALL_TAGS,...existingTags])];
  c.innerHTML=tags.map(t=>`<div class="tc${t==='Все'?' on':''}" data-tag="${t}">${t}</div>`).join('');
  c.querySelectorAll('.tc').forEach(tc=>{
    tc.addEventListener('click',()=>{
      c.querySelectorAll('.tc').forEach(x=>x.classList.remove('on'));
      tc.classList.add('on');
      // Обновляем счётчик активных фильтров (кроме "Все")
      const activeTag=tc.dataset.tag;
      const nsfId=filterId==='note-tags-filter'?'note-nsf':filterId==='guide-tags-filter'?'guide-nsf':null;
      if(nsfId)updateFilterCount(nsfId,activeTag&&activeTag!=='Все'?1:0);
      renderFn();
    });
  });
}

/* ══════════════
   NOTES
══════════════ */
function initNotes(){
  buildTagsSelect('nn-tags-sel');
  buildTagsFilter('note-tags-filter',renderNotes,(DB.notes||[]).flatMap(n=>n.tags||[]));
  initToolbar('nn-etb','nn-editor');
}
function renderNotes(){
  const q=(document.getElementById('note-q')?.value||'').toLowerCase();
  const activeTag=document.querySelector('#note-tags-filter .tc.on')?.dataset.tag||'Все';
  // Счётчик активных фильтров для мобильной кнопки
  const cnt=(q?1:0)+(activeTag!=='Все'?1:0);
  updateFilterCount('note-nsf',cnt);
  const list=DB.notes.filter(n=>{
    const mq=!q||n.title.toLowerCase().includes(q)||n.content.replace(/<[^>]+>/g,'').toLowerCase().includes(q);
    const mt=activeTag==='Все'||n.tags.includes(activeTag);
    return mq&&mt;
  });
  const el=document.getElementById('notes-list');
  if(!list.length){el.innerHTML='<div class="emp"><div class="emp-ic">📜</div><h3>Нет статей</h3></div>';return}
  el.innerHTML=list.map(n=>`
    <div class="post" onclick="openThread(${n.id},'note')">
      <div class="post-hd">
        <div class="post-ti">${n.title}</div>
        <div class="post-badges"></div>
      </div>
      <div class="post-ex">${renderPreview(n.content)}</div>
      <div class="post-ft">
        ${n.tags.map(t=>`<span class="ntag">${t}</span>`).join('')}
        <span class="post-meta">${n.author} · ${n.date}</span>
      </div>
    </div>`).join('');
  initLazyImages(el);
}
async function saveNote(){
  const title=document.getElementById('nn-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  const tags=getSelectedTags('nn-tags-sel');
  const content=document.getElementById('nn-editor').innerHTML;
  const note={
    title,tags,content,
    atts:noteAtts.nn||[],
    comments:[],
    author:currentUser?.username||'Мастер Эрандил',
    date:new Date().toISOString().split('T')[0]
  };
  const newNote = await apiRequest('/notes', {
    method: 'POST',
    body: JSON.stringify(note)
  });
  DB.notes.unshift(newNote);
  noteAtts.nn=[];
  toast(`Статья «${title}» сохранена`,'ok');
  closeModal('m-new-note');
  // Обновляем фильтр тегов, чтобы новые кастомные теги появились
  buildTagsFilter('note-tags-filter',renderNotes,DB.notes.flatMap(n=>n.tags||[]));
  renderNotes();
  document.getElementById('nn-title').value='';
  document.getElementById('nn-editor').innerHTML='';
  document.getElementById('nn-public').checked=false;
  document.getElementById('nn-att-list').innerHTML='';
  buildTagsSelect('nn-tags-sel');
  renderNotes();
}

/* ══════════════
   GUIDE
══════════════ */
function initGuide(){
  buildTagsSelect('ng-tags-sel');
  buildTagsFilter('guide-tags-filter',renderGuide,(DB.guides||[]).flatMap(g=>g.tags||[]));
  initToolbar('ng-etb','ng-editor');
}

// Уровень руководства в иерархии (1 = верхний, 2 = подруководство, 3 = под-подруководство)
function guideLevel(id){
  let level=1,cur=(DB.guides||[]).find(g=>g.id===id),guard=0;
  while(cur&&cur.parentId&&guard++<10){
    level++;
    cur=(DB.guides||[]).find(g=>g.id===cur.parentId);
  }
  return level;
}
// Дочерние руководства (сортированы по sortOrder)
function guideChildren(parentId){
  return (DB.guides||[])
    .filter(g=>g.parentId===parentId)
    .sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
}
// Цепочка родителей от корня до текущего (включительно)
function guideBreadcrumbs(id){
  const chain=[];
  let cur=(DB.guides||[]).find(g=>g.id===id),guard=0;
  while(cur&&guard++<10){chain.unshift(cur);cur=(DB.guides||[]).find(g=>g.id===cur.parentId)}
  return chain;
}

// Контекст создания: parentId для нового подруководства (null = верхний уровень)
let ngParentId=null;
function openNewSubGuide(){
  if(!threadPostId||threadType!=='guide')return;
  // Ограничение: подруководства до 3-го порядка
  const lvl=guideLevel(threadPostId);
  if(lvl>=3){toast('Допускается не более 3 уровней вложенности','er');return}
  // Сначала сбрасываем модалку, потом устанавливаем parentId (иначе reset его обнулит)
  resetGuideModal();
  ngParentId=threadPostId;
  const parentTitle=DB.guides.find(g=>g.id===threadPostId)?.title||'';
  const titleEl=document.getElementById('ng-modal-title');
  if(titleEl)titleEl.textContent='Новое подруководство';
  const ph=document.getElementById('ng-title');
  if(ph)ph.placeholder='Название подруководства';
  // Подсказка о родителе
  let hint=document.getElementById('ng-parent-hint');
  if(!hint){
    hint=document.createElement('div');
    hint.id='ng-parent-hint';
    hint.style.cssText='font-size:12px;color:var(--txt-m);margin-top:-4px;padding:6px 10px;background:var(--bg-h);border-radius:6px';
    ph.parentNode.insertBefore(hint,ph.nextSibling);
  }
  hint.textContent='↳ Раздел: '+parentTitle+' (уровень '+(lvl+1)+' из 3)';
  hint.style.display='block';
  openModal('m-new-guide');
}

function renderGuide(){
  const q=(document.getElementById('guide-q')?.value||'').toLowerCase();
  const activeTag=document.querySelector('#guide-tags-filter .tc.on')?.dataset.tag||'Все';
  const cnt=(q?1:0)+(activeTag!=='Все'?1:0);
  updateFilterCount('guide-nsf',cnt);
  const matchSearch=n=>{
    const mq=!q||n.title.toLowerCase().includes(q)||n.content.replace(/<[^>]+>/g,'').toLowerCase().includes(q);
    const mt=activeTag==='Все'||n.tags.includes(activeTag);
    return mq&&mt;
  };
  // Список показывает только корневые руководства.
  // Подруководства встроены внутрь родителя (см. openThread → renderSubguides).
  let roots=DB.guides.filter(n=>!n.parentId&&matchSearch(n)).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  const el=document.getElementById('guide-list');
  if(!DB.guides.length){el.innerHTML='<div class="emp"><div class="emp-ic">📖</div><h3>Нет записей</h3></div>';return}
  // При активном поиске — ищем и в подруководствах, показываем совпадения плоско
  if((q||activeTag!=='Все')&&!roots.length){
    const flat=DB.guides.filter(matchSearch);
    if(!flat.length){el.innerHTML='<div class="emp"><div class="emp-ic">📖</div><h3>Ничего не найдено</h3></div>';return}
    el.innerHTML=flat.map(renderGuideCard).join('');
    initLazyImages(el);
    return;
  }
  if(!roots.length){el.innerHTML='<div class="emp"><div class="emp-ic">📖</div><h3>Нет записей</h3></div>';return}
  el.innerHTML=roots.map(renderGuideCard).join('');
  initLazyImages(el);
}
function renderGuideCard(n){
  const kids=guideChildren(n.id);
  const kidsInfo=kids.length?`<span class="kids-count">▸ ${kids.length} подр.</span>`:'';
  return `
    <div class="post-card" onclick="openThread(${n.id},'guide')">
      <div class="post-hd">
        <div class="post-ti">${n.title}</div>
        ${kidsInfo}
      </div>
      <div class="post-ex">${renderPreview(n.content)}</div>
      <div class="post-ft">
        ${n.tags.map(t=>`<span class="ntag">${t}</span>`).join('')}
        <span class="post-meta">${n.author} · ${n.date}</span>
      </div>
    </div>`;
}
// Рендер встроенной секции подруководств внутри открытого руководства
function renderSubguides(parentId){
  const kids=guideChildren(parentId);
  if(!kids.length)return '';
  const lvl=guideLevel(parentId)+1;
  return `
    <div class="subguide-section">
      <div class="subguide-header">
        <h4>Подруководства</h4>
        <span class="subguide-lvl">Уровень ${lvl} из 3</span>
      </div>
      <div class="subguide-list" ondragover="event.preventDefault()" ondrop="dropGuide(event,${parentId})">
        ${kids.map(k=>`
          <div class="subguide-item" draggable="true" ondragstart="dragGuide(event,${k.id})" onclick="event.stopPropagation();openThread(${k.id},'guide')">
            <div class="subguide-drag">⋮⋮</div>
            <div class="subguide-move">
              <button class="btn btn-xs" onclick="event.stopPropagation();moveGuideUp(${k.id},${parentId})">↑</button>
              <button class="btn btn-xs" onclick="event.stopPropagation();moveGuideDown(${k.id},${parentId})">↓</button>
            </div>
            <div class="subguide-arrow">↳</div>
            <div class="subguide-body">
              <div class="subguide-title">${k.title}</div>
              <div class="subguide-ex">${renderPreview(k.content,120)}</div>
              <div class="subguide-meta">${k.author} · ${k.date}${guideChildren(k.id).length?` · <span class="subguide-kids">▸ ${guideChildren(k.id).length} подр.</span>`:''}</div>
            </div>
            <div class="subguide-open">›</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

let draggedGuideId=null;
function dragGuide(e,id){
  draggedGuideId=id;
  e.dataTransfer.effectAllowed='move';
}
async function dropGuide(e,parentId){
  e.preventDefault();
  if(!draggedGuideId)return;
  const items=Array.from(document.querySelectorAll('.subguide-list .subguide-item'));
  const guide=DB.guides.find(g=>g.id===draggedGuideId);
  if(!guide)return;
  const kids=guideChildren(parentId);
  const targetItem=e.target.closest('.subguide-item');
  const dropIndex=targetItem?items.indexOf(targetItem):kids.length;
  const oldIndex=kids.findIndex(k=>k.id===draggedGuideId);
  if(oldIndex===dropIndex)return;
  kids.splice(oldIndex,1);
  kids.splice(dropIndex,0,guide);
  for(let i=0;i<kids.length;i++){
    kids[i].sortOrder=i;
    await apiRequest('/guides',{method:'PUT',body:JSON.stringify(kids[i])},{id:kids[i].id});
  }
  toast('Порядок подруководств обновлён','ok');
  renderThread();
  draggedGuideId=null;
}
async function moveGuideUp(id,parentId){
  const kids=guideChildren(parentId);
  const idx=kids.findIndex(k=>k.id===id);
  if(idx<=0)return;
  const temp=kids[idx];
  kids[idx]=kids[idx-1];
  kids[idx-1]=temp;
  for(let i=0;i<kids.length;i++){
    kids[i].sortOrder=i;
    await apiRequest('/guides',{method:'PUT',body:JSON.stringify(kids[i])},{id:kids[i].id});
  }
  renderThread();
}
async function moveGuideDown(id,parentId){
  const kids=guideChildren(parentId);
  const idx=kids.findIndex(k=>k.id===id);
  if(idx>=kids.length-1)return;
  const temp=kids[idx];
  kids[idx]=kids[idx+1];
  kids[idx+1]=temp;
  for(let i=0;i<kids.length;i++){
    kids[i].sortOrder=i;
    await apiRequest('/guides',{method:'PUT',body:JSON.stringify(kids[i])},{id:kids[i].id});
  }
  renderThread();
}

async function saveGuide(){
  const title=document.getElementById('ng-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  const tags=getSelectedTags('ng-tags-sel');
  const content=document.getElementById('ng-editor').innerHTML;
  const maxOrder=ngParentId
    ? Math.max(...(DB.guides||[]).filter(g=>g.parentId===ngParentId).map(g=>g.sortOrder||0),-1)
    : Math.max(...(DB.guides||[]).filter(g=>!g.parentId).map(g=>g.sortOrder||0),-1);
  const g={
    title,tags,content,
    atts:noteAtts.ng||[],
    comments:[],
    author:currentUser?.username||'Мастер Эрандил',
    date:new Date().toISOString().split('T')[0],
    parentId:ngParentId,
    sortOrder:maxOrder+1
  };
  const newGuide = await apiRequest('/guides', {
    method: 'POST',
    body: JSON.stringify(g)
  });
  DB.guides.unshift(newGuide);
  noteAtts.ng=[];
  toast(ngParentId?`Подруководство «${title}» сохранено`:`Запись «${title}» сохранено`,'ok');
  closeModal('m-new-guide');
  // Обновляем фильтр тегов и список
  buildTagsFilter('guide-tags-filter',renderGuide,DB.guides.flatMap(g=>g.tags||[]));
  renderGuide();
  // Если родитель открыт в thread view — перерисуем секцию подруководств
  if(ngParentId&&threadPostId===ngParentId&&threadType==='guide'){
    const subHtml=renderSubguides(ngParentId);
    // Обновим только секцию подруководств, не перезагружая весь thread
    const attsEl=document.getElementById('thread-atts');
    const existing=attsEl?.querySelector('.subguide-section');
    if(existing){existing.outerHTML=subHtml}
    else if(subHtml&&attsEl){attsEl.insertAdjacentHTML('afterbegin',subHtml)}
  }
  document.getElementById('ng-title').value='';
  document.getElementById('ng-editor').innerHTML='';
  document.getElementById('ng-att-list').innerHTML='';
  buildTagsSelect('ng-tags-sel');
  // Сброс контекста подруководства
  ngParentId=null;
  const titleEl=document.getElementById('ng-modal-title');
  if(titleEl)titleEl.textContent='Новая запись в Руководстве';
  const hint=document.getElementById('ng-parent-hint');
  if(hint)hint.style.display='none';
}

/* ══════════════
   THREAD VIEW
══════════════ */
/* Преобразует текстовые ссылки на изображения в <img>, остальные ссылки оставляет как есть.
   Также работает с <a href="...">текст</a>, где href — картинка. */
function renderContent(html){
  if(!html)return '';
  // 1) Заменяем текстовые URL на изображения (не внутри тегов)
  //    Регэксп: http(s)://... с расширением картинки в конце, не окружёнными кавычками/скобками
  const imgUrlRe=/(^|[\s>])(https?:\/\/[^\s<"'\)]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))(?=$|[\s<])/gi;
  html=html.replace(imgUrlRe,(m,p1,url)=>`${p1}<img class="post-img lz-img" data-src="${url}" alt="" loading="lazy" style="opacity:0;transition:opacity .25s ease">`);
  // 2) Заменяем <a href="image-url">текст</a> на <img>
  const aImgRe=/<a[^>]+href=["'](https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))["'][^>]*>([^<]*)<\/a>/gi;
  html=html.replace(aImgRe,(m,url,text)=>`<img class="post-img lz-img" data-src="${url}" alt="${text||''}" loading="lazy" style="opacity:0;transition:opacity .25s ease">`);
  // 3) Добавляем target=_blank всем оставшимся ссылкам
  html=html.replace(/<a(?![^>]*target=)/gi,'<a target="_blank" rel="noopener"');
  return html;
}
/* Превью для карточки статьи в списке: показывает первые картинки (миниатюрой)
   и обрезанный текст без HTML-тегов и без URL-ов картинок. */
function renderPreview(html,maxLen){
  if(!html)return '';
  const len=maxLen||180;
  // Превращаем URL картинок в <img> (как в renderContent)
  let withImgs=renderContent(html);
  // Оставляем только <img> и текст, остальные теги вырезаем
  const imgs=[...withImgs.matchAll(/<img[^>]*>/gi)].map(m=>m[0]).slice(0,3);
  // Убираем из текста URL картинок (png/jpg/...) и прочие длинные ссылки
  const text=html
    .replace(/<[^>]+>/g,' ')
    .replace(/https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif)/gi,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,len);
  const textHtml=text?(text+(html.length>len?'…':'')):'';
  if(!imgs.length)return textHtml;
  return `<div class="prev-thumbs">${imgs.map(i=>i.replace(/class="post-img lz-img"/g,'class="prev-thumb lz-img"')).join('')}</div>${textHtml?`<div class="prev-text">${textHtml}</div>`:''}`;
}
function openThread(id,type){
  const db=type==='note'?DB.notes:DB.guides;
  const post=db.find(x=>x.id===id);if(!post)return;
  threadPostId=id;threadType=type;
  document.getElementById('thread-title').textContent=post.title;
  // Хлебные крошки для подруководств (гайды)
  let badgesHtml=post.tags.map(t=>`<span class="ntag">${t}</span>`).join('');
  if(type==='guide'){
    const crumbs=guideBreadcrumbs(id);
    if(crumbs.length>1){
      badgesHtml=`<span class="crumbs">${crumbs.map((c,i)=>i<crumbs.length-1
        ?`<span class="crumb" onclick="event.stopPropagation();openThread(${c.id},'guide')">${c.title}</span><span class="crumb-sep">›</span>`
        :`<span class="crumb cur">${c.title}</span>`).join('')}</span>`+badgesHtml;
    }
  }
  document.getElementById('thread-badges').innerHTML=badgesHtml;
  document.getElementById('thread-content').innerHTML=renderContent(post.content);
  // Встроенная секция подруководств (только для гайдов)
  const subHtml=type==='guide'?renderSubguides(id):'';
  // Изображения-вложения показываем как картинки, остальные — как чипы для скачивания
  const atts=post.atts||[];
  const imgAtts=atts.filter(a=>a.type&&a.type.startsWith('image/'));
  const fileAtts=atts.filter(a=>!a.type||!a.type.startsWith('image/'));
  const imgsHtml=imgAtts.length?`<div class="att-imgs">${imgAtts.map((a,i)=>`
    <figure class="att-fig" onclick="previewAtt('${a.name}','${a.data}','${a.type}')">
      <img class="lz-img" data-src="${a.data}" alt="${a.name||''}" loading="lazy" style="opacity:0;transition:opacity .25s ease">
      <figcaption>${a.name||''}</figcaption>
    </figure>`).join('')}</div>`:'';
  const filesHtml=fileAtts.length?fileAtts.map(a=>`
    <div class="att-chip" onclick="previewAtt('${a.name}','${a.data}','${a.type}')">
      <span>📎</span>${a.name}
    </div>`).join(''):'';
  document.getElementById('thread-atts').innerHTML=subHtml+imgsHtml+filesHtml;
  renderComments(post);
  // Права на редактирование/удаление: ГМ или автор
  const isGm=currentUser?.role==='gm';
  const isAuthor=post.author===currentUser?.username;
  document.getElementById('thread-edit-btn').style.display=(isGm||isAuthor)?'inline-flex':'none';
  document.getElementById('thread-del-btn').style.display=(isGm||isAuthor)?'inline-flex':'none';
  // Кнопка "+ Подруководство": только для гайдов, только ГМ, и уровень < 3
  const subBtn=document.getElementById('thread-subguide-btn');
  if(subBtn){
    const showSub=type==='guide'&&isGm&&guideLevel(id)<3;
    subBtn.style.display=showSub?'inline-flex':'none';
  }
  // Кнопка "Опубликовать в руководствах": только для заметок, только ГМ или автор
  const pubBtn=document.getElementById('thread-publish-btn');
  if(pubBtn){
    const showPub=type==='note'&&(isGm||isAuthor);
    pubBtn.style.display=showPub?'inline-flex':'none';
  }
  // Кнопка "Назад": только для подруководств (которые имеют parentId)
  const backBtn=document.getElementById('thread-back-btn');
  if(backBtn){
    const showBack=type==='guide'&&post.parentId;
    backBtn.style.display=showBack?'inline-flex':'none';
  }
  document.getElementById('thread-view').classList.add('on');
  initLazyImages(document.getElementById('thread-view'));
}

function goBackGuide(){
  const guide=DB.guides.find(g=>g.id===threadPostId);
  if(!guide||!guide.parentId)return;
  openThread(guide.parentId,'guide');
}

async function publishNoteToGuide(){
  const note=DB.notes.find(n=>n.id===threadPostId);
  if(!note)return;
  const existing=DB.guides.find(g=>g.title===note.title&&!g.parentId);
  if(existing){
    toast(`Руководство с названием «${note.title}» уже существует`,'er');
    return;
  }
  if(!confirm(`Опубликовать заметку «${note.title}» в руководствах?`))return;
  try{
    const maxOrder=Math.max(...(DB.guides||[]).filter(g=>!g.parentId).map(g=>g.sortOrder||0),-1);
    const guide={
      title:note.title,
      tags:note.tags||[],
      content:note.content,
      atts:note.atts||[],
      comments:[],
      author:note.author,
      date:note.date,
      parentId:null,
      sortOrder:maxOrder+1
    };
    const newGuide=await apiRequest('/guides',{method:'POST',body:JSON.stringify(guide)});
    DB.guides.unshift(newGuide);
    await addLog('guide','📖',`Заметка <span class="li-it">«${note.title}»</span> опубликована в руководствах. Автор: <span class="li-pl">${note.author}</span>.`);
    toast(`«${note.title}» опубликовано в руководствах`,'ok');
    closeThread();
    renderTab('guide');
  }catch(e){toast(e.message||'Ошибка публикации','er')}
}

/* Редактирование существующего поста */
function editThread(){
  if(!threadPostId||!threadType)return;
  const db=threadType==='note'?DB.notes:DB.guides;
  const post=db.find(x=>x.id===threadPostId);if(!post)return;
  const isGm=currentUser?.role==='gm';
  const isAuthor=post.author===currentUser?.username;
  if(!(isGm||isAuthor)){toast('Нет прав на редактирование','er');return}

  if(threadType==='note'){
    // Заполняем модалку новой заметки данными поста
    document.getElementById('nn-title').value=post.title;
    document.getElementById('nn-editor').innerHTML=post.content;
    
    // Теги: стандартные + кастомные из поста
    const customTags=(post.tags||[]).filter(t=>!ALL_TAGS.includes(t));
    buildTagsSelect('nn-tags-sel',customTags);
    (post.tags||[]).forEach(t=>{
      const cb=document.querySelector(`#nn-tags-sel input[value="${t.replace(/"/g,'&quot;')}']`);
      if(cb)cb.checked=true;
    });
    // Аттачи
    noteAtts.nn=[...(post.atts||[])];
    renderAttList('nn');
    // Меняем заголовок модалки и кнопку сохранения
    document.querySelector('#m-new-note .mh h2').textContent='Редактирование статьи';
    const nnBtn=document.querySelector('#m-new-note .mf .btn-p');
    if(nnBtn){nnBtn.textContent='Сохранить';nnBtn.setAttribute('onclick','saveNoteEdit()')}
    closeThread();
    openModal('m-new-note');
  }else{
    document.getElementById('ng-title').value=post.title;
    document.getElementById('ng-editor').innerHTML=post.content;
    const customTags=(post.tags||[]).filter(t=>!ALL_TAGS.includes(t));
    buildTagsSelect('ng-tags-sel',customTags);
    (post.tags||[]).forEach(t=>{
      const cb=document.querySelector(`#ng-tags-sel input[value="${t.replace(/"/g,'&quot;')}']`);
      if(cb)cb.checked=true;
    });
    noteAtts.ng=[...(post.atts||[])];
    renderAttList('ng');
    document.querySelector('#m-new-guide .mh h2').textContent='Редактирование записи';
    const ngBtn=document.querySelector('#m-new-guide .mf .btn-p');
    if(ngBtn){ngBtn.textContent='Сохранить';ngBtn.setAttribute('onclick','saveGuideEdit()')}
    closeThread();
    openModal('m-new-guide');
  }
}

async function saveNoteEdit(){
  const post=DB.notes.find(x=>x.id===threadPostId);
  if(!post){toast('Пост не найден','er');return}
  const title=document.getElementById('nn-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  post.title=title;
  post.tags=getSelectedTags('nn-tags-sel');
  post.content=document.getElementById('nn-editor').innerHTML;
  post.atts=noteAtts.nn||[];
  post.editedAt=new Date().toISOString().split('T')[0];
  try{
    await apiRequest('/notes',{method:'PUT',body:JSON.stringify(post)},{id:post.id});
    toast('Статья обновлена','ok');
    closeModal('m-new-note');
    resetNoteModal();
    renderNotes();
    buildTagsFilter('note-tags-filter',renderNotes,DB.notes.flatMap(n=>n.tags||[]));
  }catch(e){toast(e.message||'Ошибка','er')}
}

async function saveGuideEdit(){
  const post=DB.guides.find(x=>x.id===threadPostId);
  if(!post){toast('Пост не найден','er');return}
  const title=document.getElementById('ng-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  post.title=title;
  post.tags=getSelectedTags('ng-tags-sel');
  post.content=document.getElementById('ng-editor').innerHTML;
  post.atts=noteAtts.ng||[];
  post.editedAt=new Date().toISOString().split('T')[0];
  try{
    await apiRequest('/guides',{method:'PUT',body:JSON.stringify(post)},{id:post.id});
    toast('Запись обновлена','ok');
    closeModal('m-new-guide');
    resetGuideModal();
    renderGuide();
    buildTagsFilter('guide-tags-filter',renderGuide,DB.guides.flatMap(g=>g.tags||[]));
  }catch(e){toast(e.message||'Ошибка','er')}
}

async function deleteThread(){
  if(!threadPostId||!threadType)return;
  const db=threadType==='note'?DB.notes:DB.guides;
  const post=db.find(x=>x.id===threadPostId);if(!post)return;
  const isGm=currentUser?.role==='gm';
  const isAuthor=post.author===currentUser?.username;
  if(!(isGm||isAuthor)){toast('Нет прав на удаление','er');return}
  if(!confirm(`Удалить «${post.title}»?`))return;
  try{
    await apiRequest(`/${threadType==='note'?'notes':'guides'}`,{method:'DELETE'},{id:post.id});
    const idx=db.findIndex(x=>x.id===post.id);
    if(idx>=0)db.splice(idx,1);
    toast('Удалено','ok');
    closeThread();
    if(threadType==='note')renderNotes();else renderGuide();
  }catch(e){toast(e.message||'Ошибка','er')}
}

/* Сброс модалок в режим создания */
function resetNoteModal(){
  document.querySelector('#m-new-note .mh h2').textContent='Новая статья';
  const btn=document.querySelector('#m-new-note .mf .btn-p');
  if(btn){btn.textContent='Опубликовать';btn.setAttribute('onclick','saveNote()')}
  document.getElementById('nn-title').value='';
  document.getElementById('nn-editor').innerHTML='';
  document.getElementById('nn-public').checked=false;
  document.getElementById('nn-att-list').innerHTML='';
  noteAtts.nn=[];
  buildTagsSelect('nn-tags-sel');
}
function resetGuideModal(){
  document.querySelector('#m-new-guide .mh h2').textContent='Новая запись в Руководстве';
  const btn=document.querySelector('#m-new-guide .mf .btn-p');
  if(btn){btn.textContent='Сохранить';btn.setAttribute('onclick','saveGuide()')}
  document.getElementById('ng-title').value='';
  document.getElementById('ng-title').placeholder='Название записи';
  document.getElementById('ng-editor').innerHTML='';
  document.getElementById('ng-att-list').innerHTML='';
  noteAtts.ng=[];
  ngParentId=null;
  const hint=document.getElementById('ng-parent-hint');
  if(hint)hint.style.display='none';
  buildTagsSelect('ng-tags-sel');
}
function closeThread(){document.getElementById('thread-view').classList.remove('on');}
function renderComments(post){
  const list=document.getElementById('comment-list');
  const me=currentUser?.username;
  const isGm=currentUser?.role==='gm';
  list.innerHTML=(post.comments||[]).map((c,i)=>{
    const canEdit=c.author===me;
    const canDel=isGm||c.author===me;
    const actions=(canEdit||canDel)?`
      <div class="cmt-actions">
        ${canEdit?`<button class="cmt-act" onclick="editComment(${i})" title="Редактировать">✎</button>`:''}
        ${canDel?`<button class="cmt-act cmt-del" onclick="deleteComment(${i})" title="Удалить">✕</button>`:''}
      </div>`:'';
    return `
    <div class="cmt">
      <div class="cmt-av">${c.author.slice(0,2).toUpperCase()}</div>
      <div class="cmt-body">
        <div class="cmt-head">
          <span class="cmt-name">${c.author}</span><span class="cmt-time">${c.time}</span>
          ${c.edited?'<span class="cmt-edited">(ред.)</span>':''}
        </div>
        <div class="cmt-text">${c.text}</div>
      </div>
      ${actions}
    </div>`;
  }).join('');
}
async function deleteComment(idx){
  if(!confirm('Удалить комментарий?'))return;
  const dbArr=threadType==='note'?DB.notes:DB.guides;
  const post=dbArr.find(x=>x.id===threadPostId);if(!post)return;
  post.comments.splice(idx,1);
  await apiRequest(`/${threadType==='note'?'notes':'guides'}`, {
    method: 'PUT',
    body: JSON.stringify(post)
  }, { id: post.id });
  renderComments(post);
  toast('Комментарий удалён','ok');
}
async function editComment(idx){
  const dbArr=threadType==='note'?DB.notes:DB.guides;
  const post=dbArr.find(x=>x.id===threadPostId);if(!post)return;
  const c=post.comments[idx];if(!c)return;
  const newText=prompt('Редактировать комментарий:',c.text);
  if(newText===null)return;
  if(!newText.trim()){toast('Текст не может быть пустым','er');return}
  c.text=newText.trim();
  c.edited=true;
  await apiRequest(`/${threadType==='note'?'notes':'guides'}`, {
    method: 'PUT',
    body: JSON.stringify(post)
  }, { id: post.id });
  renderComments(post);
  toast('Комментарий обновлён','ok');
}
async function addComment(){
  const inp=document.getElementById('cmt-inp');
  const text=inp.value.trim();if(!text)return;
  const dbArr=threadType==='note'?DB.notes:DB.guides;
  const post=dbArr.find(x=>x.id===threadPostId);if(!post)return;
  post.comments=post.comments||[];
  const newComment={author:currentUser?.username||'Мастер Эрандил',text,time:new Date().toLocaleString('ru-RU')};
  // Используем спец-режим добавления комментария — доступен любому пользователю
  const data=await apiRequest(`/${threadType==='note'?'notes':'guides'}`, {
    method: 'PUT',
    body: JSON.stringify({ __action:'addComment', comment:newComment })
  }, { id: post.id });
  // Сервер возвращает обновлённый список комментариев
  if(data&&data.comments)post.comments=data.comments;
  else post.comments.push(newComment);
  renderComments(post);
  inp.value='';
}
function previewAtt(name,data,type){
  if(type&&type.startsWith('image/')){
    let m=document.getElementById('m-img-view');
    if(!m){
      m=document.createElement('div');
      m.id='m-img-view';
      m.className='mo';
      m.style.zIndex=600;
      m.innerHTML=`<div class="md img-view-md" style="max-width:95vw;max-height:95vh;background:transparent;border:none;box-shadow:none;align-items:center;justify-content:center;overflow:hidden">
        <button class="mc-btn" style="position:absolute;top:-40px;right:0;color:#fff;font-size:24px;z-index:1" onclick="closeModal('m-img-view')">✕</button>
        <img id="img-view-el" style="display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.6)">
        <div id="img-view-cap" style="text-align:center;color:#ccc;font-size:12px;margin-top:8px"></div>
      </div>`;
      document.body.appendChild(m);
      m.addEventListener('click',e=>{if(e.target===m)closeModal('m-img-view')});
    }
    document.getElementById('img-view-el').src=data;
    document.getElementById('img-view-cap').textContent=name||'';
    openModal('m-img-view');
  } else {
    const a=document.createElement('a');a.href=data;a.download=name;a.click();
  }
}
document.getElementById('thread-view').addEventListener('click',e=>{if(e.target===e.currentTarget)closeThread();});

/* ══════════════
   GM PANEL
══════════════ */
function populatePlayerSelects(){
  const opts='<option value="">Выбрать игрока…</option>'+DB.players.map(p=>`<option>${p.name}</option>`).join('');
  ['gm-pts-player','gm-kt-player','gm-cer-player','gm-slots-player'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.innerHTML=opts;
  });
}
function fillGmChars(playerId,charId){
  const player=document.getElementById(playerId)?.value;
  const p=DB.players.find(x=>x.name===player);
  const el=document.getElementById(charId);
  // Для панели КТ/ОС — только заверённые персонажи (активные).
  // Для панели заверения — все персонажи (ГМ может заверять/снимать статус).
  const isCertPanel=charId==='gm-cer-char';
  const chars=(p?.chars||[]).filter(c=>isCertPanel?true:c.verified);
  el.innerHTML='<option value="">Выбрать персонажа…</option>'+chars.map(c=>{
    // value хранит чистое имя, а текст — с индикатором статуса
    const tag=isCertPanel?(c.verified?' ✓':' ⏳'):'';
    return `<option value="${c.name.replace(/"/g,'&quot;')}">${c.name}${tag}</option>`;
  }).join('');
}
function renderGm(){
  populatePlayerSelects();
  fillGmChars('gm-kt-player','gm-kt-char');
  fillGmChars('gm-cer-player','gm-cer-char');
  renderTx();
  loadGmCodes();
  // Гарантируем хотя бы одну пустую строку репутации
  if(!document.querySelector('#rep-rows .rep-row'))addRepRow();
}
async function gmGivePoints(){
  const pname=document.getElementById('gm-pts-player').value;
  const amt=parseInt(document.getElementById('gm-pts-amt').value)||0;
  const reason=document.getElementById('gm-pts-reason').value.trim();
  if(!pname||pname.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  if(!amt){toast('Введите количество поинтов','er');return}
  const p=DB.players.find(x=>x.name===pname);if(p)p.points+=amt;
  await apiRequest('/players', {
    method: 'PUT',
    body: JSON.stringify({
      name:p.name, discord:p.discord,
      points:p.points, slots:p.slots,
      chars:p.chars, img:p.img || null
    })
  }, { id: p.id });
  await addLog('award','💎',`<span class="li-pl">${pname}</span> получил <strong>+${amt} поинтов</strong>. Причина: ${reason||'—'}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`${pname} +${amt} поинтов`,'ok');
  document.getElementById('gm-pts-amt').value='';document.getElementById('gm-pts-reason').value='';
}
async function gmChangeSlots(){
  const pname=document.getElementById('gm-slots-player').value;
  const amt=parseInt(document.getElementById('gm-slots-amt').value)||0;
  if(!pname){toast('Выберите игрока','er');return}
  if(!amt){toast('Введите количество слотов','er');return}
  const p=DB.players.find(x=>x.name===pname);
  if(!p){toast('Игрок не найден','er');return}
  p.slots=(p.slots||1)+amt;
  if(p.slots<1)p.slots=1;
  await apiRequest('/players', {
    method: 'PUT',
    body: JSON.stringify({
      name:p.name, discord:p.discord,
      points:p.points, slots:p.slots,
      chars:p.chars, img:p.img || null
    })
  }, { id: p.id });
  await addLog('slots','🎒',`<span class="li-pl">${pname}</span> слоты: ${(p.slots-amt)||1} → ${p.slots}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`${pname}: ${(p.slots-amt)||1} → ${p.slots} слотов`,'ok');
  document.getElementById('gm-slots-amt').value='';
}
async function gmApplyKt(){
  const pname=document.getElementById('gm-kt-player').value;
  const cname=document.getElementById('gm-kt-char').value;
  const kt=parseInt(document.getElementById('gm-kt-val').value)||0;
  const osStage=parseInt(document.getElementById('gm-os-stage').value)||0;
  const os=parseInt(document.getElementById('gm-os-val').value)||0;
  if(!pname||pname.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  if(!cname||cname.startsWith('Выбрать')){toast('Выберите персонажа','er');return}
  const p=DB.players.find(x=>x.name===pname);
  const ch=p?.chars.find(c=>c.name===cname);
  if(ch&&!ch.verified){toast('Персонаж ещё не заверён. Заверьте его в панели «Заверить персонажа»','er');return}

  // Собираем все строки репутации (примечание убрано из UI)
  const repRows=[...document.querySelectorAll('#rep-rows .rep-row')]
    .map(r=>({
      fac:r.querySelector('.rep-fac').value.trim(),
      val:parseInt(r.querySelector('.rep-val').value)||0,
      note:''
    }))
    .filter(r=>r.fac&&r.val!==0);

  if(ch){
    ch.kt[0]=Math.min(ch.kt[0]+kt,ch.kt[1]);
    ch.os=normalizeOs(ch.os);
    ch.os[osStage]=(ch.os[osStage]||0)+os;
    ch.rep=ch.rep||[];
    // Применяем каждую репутацию
    for(const r of repRows){
      const ef=ch.rep.find(x=>x.fac===r.fac);
      if(ef)ef.val+=r.val;
      else ch.rep.push({fac:r.fac,val:r.val,note:r.note});
      // Создаём фракцию, если её ещё нет
      if(!DB.factions.find(f=>f.name===r.fac)){
        DB.factions.push({name:r.fac,color:'#A78BFA'});
        await apiRequest('/factions',{
          method:'POST',
          body:JSON.stringify({name:r.fac,color:'#A78BFA'})
        });
      }
    }
    if(ch.kt[0]>=ch.kt[1]){ch.level++;ch.kt=[0,8+Math.floor(ch.level/4)*2];await addLog('level','⬆',`<span class="li-pl">${cname}</span> достиг <strong>${ch.level} уровня</strong>!`);}
  }
  await apiRequest('/players', {
    method: 'PUT',
    body: JSON.stringify({
      name:p.name, discord:p.discord,
      points:p.points, slots:p.slots,
      chars:p.chars, img:p.img || null
    })
  }, { id: p.id });

  // Логируем
  let logParts=[];
  if(kt)logParts.push(`+${kt} КТ`);
  if(os)logParts.push(`+${os} ОС (этап ${osStage+1})`);
  for(const r of repRows){
    const noteStr=r.note?` <em style="color:var(--txt-s)">(${r.note})</em>`:'';
    logParts.push(`+${r.val} репутации [<span class="li-fac">${r.fac}</span>]${noteStr}`);
  }
  await addLog('level','⬆',`<span class="li-pl">${cname}</span> (${pname}): ${logParts.join(', ')||'без изменений'}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`Применено для ${cname}`,'ok');
  // Очищаем форму
  document.getElementById('gm-kt-val').value='';
  document.getElementById('gm-os-val').value='';
  document.getElementById('rep-rows').innerHTML='';
  addRepRow();
}
async function gmCertify(status){
  const pname=document.getElementById('gm-cer-player').value;
  const cname=document.getElementById('gm-cer-char').value;
  if(!pname||pname.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  if(!cname||cname.startsWith('Выбрать')){toast('Выберите персонажа','er');return}
  const p=DB.players.find(x=>x.name===pname);
  const ch=p?.chars.find(c=>c.name===cname);
  if(!ch)return;
  
  if(status){
    const usedSlots=p.chars?.filter(c=>c.verified).length||0;
    const totalSlots=p.slots||1;
    if(usedSlots>=totalSlots){
      toast(`Нет свободных слотов (${usedSlots}/${totalSlots}). Деактивируйте другого персонажа.`,'er');
      return;
    }
    ch.verified=true;
  }else{
    ch.verified=false;
  }
  
  await apiRequest('/players', {
    method: 'PUT',
    body: JSON.stringify({
      name:p.name, discord:p.discord,
      points:p.points, slots:p.slots,
      chars:p.chars, img:p.img || null
    })
  }, { id: p.id });
  await addLog('certify','✅',`Персонаж <strong>«${cname}»</strong> ${status?'заверен':'разаверен'}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`${cname} ${status?'заверен':'разаверен'}. ${!status?'Слот освобожден':''}`,'ok');
}
const TX_CATEGORIES={item:'Предмет',quest:'Квест',reputation:'Репутация',points:'Поинты/ОС',other:'Другое'};
function renderTx(){
  const list=document.getElementById('tx-list');
  if(!list)return;
  const isGm=currentUser?.role==='gm';
  const catFilter=document.getElementById('tx-category-f')?.value||'';
  // ГМ видит все ожидающие, игрок — только свои
  let items=DB.transactions.filter(t=>t.status==='pending');
  if(!isGm)items=items.filter(t=>t.player===currentUser?.username);
  if(catFilter)items=items.filter(t=>t.category===catFilter);
  if(!items.length){
    list.innerHTML='<div style="font-size:12px;color:var(--txt-m);text-align:center;padding:20px">'+(isGm?'Нет ожидающих транзакций':'У вас нет ожидающих запросов')+'</div>';
    return;
  }
  list.innerHTML=items.map(t=>{
    const isReq=t.type==='request';
    const catName=TX_CATEGORIES[t.category]||t.category||'Другое';
    return `
    <div class="tx ${isReq?'tx-req':''}" id="tx-${t.id}">
      <div class="tx-inf">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tx-pl">${t.player}</span>
          ${isReq?`<span class="tx-tag">запрос</span>`:''}
          <span class="tx-tag" style="background:var(--bg-h)">${catName}</span>
        </div>
        <span class="tx-ds">${t.desc}</span>
      </div>
      ${isReq?'':`<span class="tx-co">${t.cost} pts</span>`}
      ${isGm?`<div class="tx-ac">
        <div class="bic btn-ok" onclick="approveTx(${t.id})" title="Одобрить">✓</div>
        <div class="bic btn-x" onclick="rejectTx(${t.id})" title="Отклонить">✗</div>
      </div>`:`<span class="tx-status tx-${t.status}">${t.status==='pending'?'⏳ Ожидает':t.status==='approved'?'✓ Одобрено':'✗ Отклонено'}</span>`}
    </div>`;
  }).join('');
}
async function approveTx(id){
  const t=DB.transactions.find(x=>x.id===id);if(!t)return;
  t.status='approved';
  await apiRequest('/transactions', {
    method: 'PUT',
    body: JSON.stringify(t)
  }, { id: t.id });
  const isReq=t.type==='request';
  await addLog('award','🔑',isReq
    ?`Запрос от <span class="li-pl">${t.player}</span> одобрен: <em>${t.desc}</em>`
    :`Транзакция одобрена: <span class="li-pl">${t.player}</span> — <strong>${t.desc}</strong>.`);
  toast(isReq?'Запрос одобрен':'Транзакция одобрена','ok');renderTx();
  if(currentPlayerId){const p=DB.players.find(x=>x.id===currentPlayerId);if(p)renderPlayerRequests(p);}
}
async function rejectTx(id){
  const t=DB.transactions.find(x=>x.id===id);if(!t)return;
  t.status='rejected';
  await apiRequest('/transactions', {
    method: 'PUT',
    body: JSON.stringify(t)
  }, { id: t.id });
  const isReq=t.type==='request';
  toast(isReq?'Запрос отклонён':'Транзакция отклонена','er');renderTx();
  if(currentPlayerId){const p=DB.players.find(x=>x.id===currentPlayerId);if(p)renderPlayerRequests(p);}
}

/* ── Player → GM text requests ── */
function openRequestModal(){
  const ta=document.getElementById('req-text');
  if(ta)ta.value='';
  openModal('m-request');
}
async function sendRequest(){
  const text=document.getElementById('req-text').value.trim();
  const category=document.getElementById('req-category').value;
  if(!text){toast('Введите текст запроса','er');return}
  try{
    const data=await apiRequest('/transactions',{
      method:'POST',
      body:JSON.stringify({desc:text,type:'request',cost:0,category})
    });
    // Добавляем в локальную копию
    if(!DB.transactions)DB.transactions=[];
    DB.transactions.unshift(data);
    closeModal('m-request');
    toast('Запрос отправлен ГМу','ok');
    await addLog('item','✉',`Запрос от <span class="li-pl">${data.player}</span>: <em>${text.length>60?text.slice(0,60)+'…':text}</em>`);
    // Регистрируем свежий запрос как pending, чтобы потом корректно отследить переход
    const seen=getSeenTxStatuses();
    seen[data.id]='pending';
    setSeenTxStatuses(seen);
    // Обновляем список запросов в модалке игрока, если она открыта
    if(currentPlayerId){
      const p=DB.players.find(x=>x.id===currentPlayerId);
      if(p)renderPlayerRequests(p);
    }
    // Если открыта ГМ-панель — обновим и её
    renderTx();
  }catch(e){
    toast(e.message||'Ошибка отправки запроса','er');
  }
}

/* ── GM invite codes (одноразовые коды для повышения до ГМ) ── */
async function generateGmCode(){
  try{
    const data=await apiRequest('/gm-codes',{method:'POST'});
    // Показываем свежий код
    const box=document.getElementById('gm-code-new');
    const val=document.getElementById('gm-code-new-val');
    if(box&&val){
      val.textContent=data.code;
      box.style.display='block';
    }
    toast('Код сгенерирован: '+data.code,'ok');
    await loadGmCodes();
  }catch(e){
    toast(e.message||'Ошибка генерации кода','er');
  }
}

async function loadGmCodes(){
  try{
    const data=await apiRequest('/gm-codes');
    const list=document.getElementById('gm-codes-list');
    if(!list)return;
    const codes=data.codes||[];
    if(!codes.length){
      list.innerHTML='<div style="font-size:12px;color:var(--txt-m);text-align:center;padding:14px">Кодов пока нет</div>';
      return;
    }
    list.innerHTML=codes.map(c=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-s);border:1px solid var(--bdr);border-radius:6px;margin-bottom:6px">
        <code style="font-family:var(--fd);font-weight:700;color:${c.used?'var(--txt-m)':'var(--gold)'};letter-spacing:1px;flex:1">${c.code}</code>
        ${c.used
          ? `<span style="font-size:11px;color:var(--txt-m)">использован ${c.usedByName||''}</span>`
          : `<span style="font-size:11px;color:#22c55e">активен</span><button class="bic btn-x" style="width:24px;height:24px;font-size:12px" onclick="deleteGmCode(${c.id})" title="Удалить">✕</button>`}
      </div>
    `).join('');
  }catch(e){
    // Тихо игнорируем — функция вызывается при переключении на вкладку ГМ
  }
}

async function deleteGmCode(id){
  if(!confirm('Удалить этот неиспользованный код?'))return;
  try{
    await apiRequest('/gm-codes',{method:'DELETE'}, { id });
    toast('Код удалён','ok');
    await loadGmCodes();
  }catch(e){
    toast(e.message||'Ошибка удаления','er');
  }
}

function copyGmCode(){
  const val=document.getElementById('gm-code-new-val')?.textContent||'';
  if(!val)return;
  if(navigator.clipboard){
    navigator.clipboard.writeText(val).then(()=>toast('Код скопирован','ok'));
  }else{
    // Фолбек для старых браузеров
    const ta=document.createElement('textarea');
    ta.value=val;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('Код скопирован','ok')}catch{toast('Не удалось скопировать','er')}
    document.body.removeChild(ta);
  }
}

/* ── Promote player to GM (по одноразовому коду) ── */
async function promoteToGm(){
  const code=document.getElementById('promote-gmcode')?.value.trim();
  if(!code){toast('Введите код приглашения','er');return}
  try{
    const data=await apiRequest('/auth/promote',{
      method:'POST',
      body:JSON.stringify({ gmCode:code })
    });
    // Обновляем токен и текущего пользователя
    authToken=data.token;
    currentUser=data.user;
    localStorage.setItem('authToken',authToken);
    localStorage.setItem('currentUser',JSON.stringify(currentUser));
    closeModal('m-promote');
    // Переприменяем роль в UI
    document.body.classList.remove('role-gm','role-player');
    document.body.classList.add('role-gm');
    document.getElementById('user-role').textContent='Гейммастер';
    // Подгружаем данные заново, чтобы увидеть ГМ-вкладки
    await loadData();
    showApp();
    toast('Поздравляем! Вы получили права ГМ.','ok');
  }catch(e){
    toast(e.message||'Ошибка активации кода','er');
  }
}

/* ── Reputation rows (multi-source) ── */
function addRepRow(fac='', val='', note=''){
  const wrap=document.getElementById('rep-rows');
  const row=document.createElement('div');
  row.className='rep-row';
  row.style.cssText='display:grid;grid-template-columns:1fr 80px 38px;gap:8px;align-items:start;position:relative';
  const facOptions=(DB.factions||[]).map(f=>`<option value="${f.name}" style="color:${f.color}" ${f.name===fac?'selected':''}>${f.name}</option>`).join('');
  row.innerHTML=`
    <div class="fac-wrap" style="position:relative">
      <input class="inp rep-fac" placeholder="Фракция…" value="${fac.replace(/"/g,'&quot;')}" autocomplete="off"
             oninput="facInputFor(this)" onfocus="facInputFor(this)" onblur="setTimeout(()=>hideFacFor(this),180)">
      <div class="fac-drop rep-drop"></div>
    </div>
    <input class="inp rep-val" type="number" placeholder="+0" value="${val}" min="-100" max="100" style="text-align:center">
    <button class="btn btn-x" style="padding:8px 0;font-size:13px;line-height:1.4" title="Удалить" onclick="this.parentElement.remove()">✕</button>
  `;
  wrap.appendChild(row);
}
function facInputFor(input){
  const val=(input.value||'').toLowerCase();
  const drop=input.parentElement.querySelector('.rep-drop');
  if(!drop)return;
  const matches=val?DB.factions.filter(f=>f.name.toLowerCase().includes(val)):DB.factions;
  if(!matches.length){drop.classList.remove('on');return}
  drop.innerHTML=matches.map(f=>`
    <div class="fac-opt" onclick="selectFacFor('${f.name.replace(/'/g,"\\'")}',this)">
      <div class="fac-dot" style="background:${f.color}"></div>${f.name}
    </div>`).join('');
  drop.classList.add('on');
}
function selectFacFor(name,src){
  const input=src.closest('.fac-wrap').querySelector('.rep-fac');
  input.value=name;
  hideFacFor(input);
}
function hideFacFor(input){
  const drop=input.parentElement.querySelector('.rep-drop');
  if(drop)drop.classList.remove('on');
}

/* ── Legacy faction autocomplete (kept for compatibility) ── */
function facInput(){const i=document.getElementById('gm-fac-inp');if(i)facInputFor(i);}
function selectFac(name){const i=document.getElementById('gm-fac-inp');if(i){i.value=name;hideFacFor(i);}}
function hideFac(){const i=document.getElementById('gm-fac-inp');if(i)hideFacFor(i);}

/* ══════════════
   LOGS + ANALYTICS
══════════════ */
async function addLog(type,icon,text,meta){
  const logEntry={
    type,icon,text,meta:meta||{},time:new Date().toLocaleString('ru-RU'),ts:Date.now()
  };
  const newLog = await apiRequest('/logs', {
    method: 'POST',
    body: JSON.stringify(logEntry)
  });
  DB.logs.unshift(newLog);
}
let analyticsOpen=false;
function toggleAnalytics(){
  analyticsOpen=!analyticsOpen;
  const p=document.getElementById('analytics-panel');
  p.style.display=analyticsOpen?'block':'none';
  if(analyticsOpen)renderAnalytics();
}
function renderLogs(){
  const q=(document.getElementById('log-q')?.value||'').toLowerCase();
  const typeF=document.getElementById('log-type-f')?.value||'';
  const dateF=document.getElementById('log-date-f')?.value||'';
  const list=DB.logs.filter(l=>{
    const mq=!q||l.text.replace(/<[^>]+>/g,'').toLowerCase().includes(q)||l.time.toLowerCase().includes(q);
    const mt=!typeF||l.type===typeF;
    const md=!dateF||new Date(l.ts).toISOString().startsWith(dateF);
    return mq&&mt&&md;
  });
  renderStats();
  if(analyticsOpen)renderAnalytics();
  const feed=document.getElementById('log-feed');
  if(!list.length){feed.innerHTML='<div class="emp"><div class="emp-ic">📋</div><h3>Нет событий</h3></div>';return}
  feed.innerHTML=list.map(l=>`
    <div class="le" style="cursor:pointer" onclick="openLogDetail(${l.id})">
      <div class="li ${l.type}">${l.icon}</div>
      <div class="lb">
        <div class="lt">${l.text}</div>
        <div class="ltime">${l.time}</div>
      </div>
      <div style="color:var(--txt-m);font-size:18px;padding-left:8px;opacity:.4">›</div>
    </div>`).join('');
}

function openLogDetail(id){
  const l=DB.logs.find(x=>x.id===id);if(!l)return;
  const TYPE_LABELS={item:'Операция с предметом',award:'Начисление поинтов',level:'Прогресс КТ/ОС',certify:'Заверение персонажа',revoke:'Изъятие предмета',frac:'Изменение репутации'};
  const TYPE_COLORS={item:'var(--pur-b)',award:'var(--gold)',level:'var(--green)',certify:'#60A5FA',revoke:'var(--red)',frac:'#E879F9'};
  document.getElementById('ld-title').textContent='Детали события';
  document.getElementById('ld-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--bdr)">
      <div class="li ${l.type}" style="width:40px;height:40px;font-size:18px">${l.icon}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:${TYPE_COLORS[l.type]||'var(--txt)'}">${TYPE_LABELS[l.type]||l.type}</div>
        <div style="font-size:11px;color:var(--txt-m);font-family:var(--fd)">${l.time}</div>
      </div>
    </div>
    <div style="font-size:13px;line-height:1.7;color:var(--txt-s);margin-bottom:16px">${l.text}</div>
    ${l.meta&&Object.keys(l.meta).length?`
    <div style="background:var(--bg-h);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--txt-m);margin-bottom:2px">Метаданные</div>
      ${Object.entries(l.meta).map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--txt-m)">${k}</span>
          <span style="color:var(--txt);font-family:var(--fd)">${v}</span>
        </div>`).join('')}
    </div>`:''}`;
  openModal('m-log-detail');
}

function renderStats(){
  const sg=document.getElementById('stats-grid');if(!sg)return;
  const logs=DB.logs;
  const byType=t=>logs.filter(l=>l.type===t).length;
  const totalAwarded=(DB.items||[]).reduce((s,it)=>s+it.awardedTo.reduce((ss,a)=>ss+a.qty,0),0);
  const stats=[
    {val:(DB.items||[]).length,lbl:'Предметов в базе',sub:'уникальных записей',color:'var(--pur-b)',bar:Math.min((DB.items||[]).length/50,1)},
    {val:totalAwarded,lbl:'Предметов выдано',sub:'суммарно игрокам',color:'var(--gold)',bar:Math.min(totalAwarded/100,1)},
    {val:byType('award'),lbl:'Начислений поинтов',sub:'событий в журнале',color:'#FBBF24',bar:Math.min(byType('award')/20,1)},
    {val:byType('level'),lbl:'Обновлений прогресса',sub:'КТ / ОС выдач',color:'var(--green)',bar:Math.min(byType('level')/20,1)},
    {val:byType('certify'),lbl:'Заверений',sub:'персонажей',color:'#60A5FA',bar:Math.min(byType('certify')/10,1)},
    {val:logs.length,lbl:'Событий всего',sub:'в журнале',color:'var(--txt-s)',bar:1},
  ];
  sg.innerHTML=stats.map(s=>`
    <div class="stat-c" style="cursor:default">
      <div class="stat-val" style="color:${s.color}">${s.val}</div>
      <div class="stat-lbl">${s.lbl}</div>
      <div class="stat-sub">${s.sub}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(s.bar*100)}%;background:${s.color}"></div></div>
    </div>`).join('');
}

/* ════════════════════════════════════
   ANALYTICS — helpers
════════════════════════════════════════ */
const TYPE_CONF=[
  {t:'item',l:'Предметы',ic:'⚔',c:'#A78BFA'},
  {t:'award',l:'Поинты',ic:'💎',c:'#C9A84C'},
  {t:'level',l:'КТ / ОС',ic:'⬆',c:'#10B981'},
  {t:'certify',l:'Заверения',ic:'✅',c:'#60A5FA'},
  {t:'revoke',l:'Изъятия',ic:'🚫',c:'#EF4444'},
  {t:'frac',l:'Фракции',ic:'🔮',c:'#E879F9'},
];
function pct(a,b){return b?Math.round(a/b*100):0}
function barRow({label,sub,val,max,total,color,onClick}){
  const w=pct(val,max);const p=pct(val,total);
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;${onClick?'cursor:pointer':''}${onClick?';':''}" ${onClick?`onclick="${onClick}"`:''}>
    ${sub?`<div style="width:26px;height:26px;border-radius:50%;background:${color}22;border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${color};flex-shrink:0;font-family:var(--fd)">${sub}</div>`:''}
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${label}</span>
        <span style="font-family:var(--fd);font-size:11px;flex-shrink:0;margin-left:8px">
          <span style="color:${color}">×${val}</span>
          <span style="color:var(--txt-m);margin-left:4px">${p}%</span>
        </span>
      </div>
      <div style="height:5px;background:var(--bg-h);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${w}%;background:${color};border-radius:3px;transition:width .5s ease"></div>
      </div>
    </div>
    ${onClick?`<span style="color:var(--txt-m);font-size:14px;flex-shrink:0">›</span>`:''}
  </div>`;
}

/* ── Main analytics render ── */
function renderAnalytics(){
  anRenderByType();
  anRenderActivity();
  anRenderTopItems();
  anRenderTopPlayers();
}

/* Type breakdown — clickable rows */
function anRenderByType(){
  const total=DB.logs.length||1;
  document.getElementById('an-by-type').innerHTML=TYPE_CONF.map(tc=>{
    const cnt=DB.logs.filter(l=>l.type===tc.t).length;
    return barRow({label:`${tc.ic} ${tc.l}`,val:cnt,max:total,total,color:tc.c,onClick:`openDrilldown('${tc.t}')`});
  }).join('');
}

/* Activity chart */
function anRenderActivity(){
  const days=[];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0]);}
  const dc={};days.forEach(d=>dc[d]=0);
  DB.logs.forEach(l=>{const d=new Date(l.ts).toISOString().split('T')[0];if(dc[d]!==undefined)dc[d]++;});
  const mx=Math.max(...Object.values(dc),1);
  document.getElementById('an-activity').innerHTML=`
    <div style="display:flex;align-items:flex-end;gap:3px;height:90px">
      ${days.map(d=>{
        const cnt=dc[d];const h=cnt?Math.max(Math.round(cnt/mx*78),4):2;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px" title="${d}: ${cnt} событий">
          <div style="font-family:var(--fd);font-size:8px;color:var(--txt-m)">${cnt||''}</div>
          <div style="width:100%;height:${h}px;background:linear-gradient(to top,#60A5FA,#93c5fd);border-radius:2px;opacity:${cnt?.9:.4}"></div>
          <div style="font-size:8px;color:var(--txt-m);font-family:var(--fd)">${d.split('-')[2]}</div>
        </div>`;
      }).join('')}
    </div>`;
}

/* Top items by awarded */
function anRenderTopItems(){
  const itemsWithCount=(DB.items||[])
    .map(it=>({...it,total:it.awardedTo.reduce((s,a)=>s+a.qty,0)}))
    .filter(it=>it.total>0)
    .sort((a,b)=>b.total-a.total)
    .slice(0,5);
  const max=Math.max(...itemsWithCount.map(it=>it.total),1);
  document.getElementById('an-top-items').innerHTML=itemsWithCount.length?itemsWithCount.map((it,i)=>
    barRow({label:it.name,sub:i+1,val:it.total,max,total:max,color:'#A78BFA',onClick:`openItemDetail(${it.id})`})
  ).join(''):'<div style="color:var(--txt-m);font-size:13px;text-align:center;padding:16px">Нет выданных предметов</div>';
}

/* Top players by activity */
function anRenderTopPlayers(){
  const playerCounts={};
  DB.logs.forEach(l=>{
    const matches=l.text.match(/<span class="li-pl">([^<]+)<\/span>/g);
    if(matches){
      matches.forEach(m=>{
        const name=m.replace(/<[^>]+>/g,'');
        playerCounts[name]=(playerCounts[name]||0)+1;
      });
    }
  });
  const topPlayers=Object.entries(playerCounts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);
  const max=Math.max(...topPlayers.map(p=>p[1]),1);
  document.getElementById('an-top-players').innerHTML=topPlayers.length?topPlayers.map(([name,cnt],i)=>
    barRow({label:name,sub:i+1,val:cnt,max,total:max,color:'#10B981'})
  ).join(''):'<div style="color:var(--txt-m);font-size:13px;text-align:center;padding:16px">Нет активности</div>';
}

/* Drilldown (placeholder) */
function openDrilldown(type){
  const dd=document.getElementById('an-drilldown');
  const ddIcon=document.getElementById('dd-icon');
  const ddTitle=document.getElementById('dd-title');
  const ddSubtitle=document.getElementById('dd-subtitle');
  const ddTabs=document.getElementById('dd-tabs');
  const ddContent=document.getElementById('dd-content');

  const conf=TYPE_CONF.find(c=>c.t===type);
  if(!conf)return;

  ddIcon.textContent=conf.ic;
  ddTitle.textContent=conf.l;
  ddSubtitle.textContent=`${DB.logs.filter(l=>l.type===type).length} событий`;
  ddTabs.innerHTML='';
  ddContent.innerHTML=DB.logs.filter(l=>l.type===type).slice(0,10).map(l=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--bdr)">
      <div style="color:var(--txt);font-size:14px">${l.text}</div>
      <div style="color:var(--txt-m);font-size:12px;margin-top:4px">${l.time}</div>
    </div>`).join('');
  dd.style.display='block';
}
function closeDrilldown(){
  document.getElementById('an-drilldown').style.display='none';
}

/* Render players (placeholder) */
function toggleCharsMore(pid){
  const moreDiv=document.getElementById(`chars-more-${pid}`);
  const toggleBtn=document.getElementById(`chars-toggle-${pid}`);
  if(!moreDiv||!toggleBtn)return;
  if(moreDiv.style.maxHeight==='400px'){
    moreDiv.style.maxHeight='0';
    toggleBtn.innerHTML='▾ Показать ещё';
  }else{
    moreDiv.style.maxHeight='400px';
    toggleBtn.innerHTML='▴ Скрыть';
  }
}
function renderPlayers(){
  const g=document.getElementById('players-grid');
  // Игрок видит только своего персонажа (по userId), ГМ видит всех
  const isGm=currentUser?.role==='gm';
  const list = isGm
    ? DB.players
    : DB.players.filter(p => p.userId === currentUser?.id || p.name === currentUser?.username);
  if(!list.length){
    g.innerHTML='<div class="emp"><div class="emp-ic">👥</div><h3>Нет персонажей</h3><p>Создайте своего первого персонажа</p></div>';
    return;
  }
  g.innerHTML=list.map(p=>`
    <div class="card ic" style="cursor:pointer;position:relative" onclick="openPlayerDetail(${p.id})">
      ${isGm?`<button class="bic btn-x" style="position:absolute;top:8px;right:8px;width:26px;height:26px;font-size:12px;z-index:2" onclick="event.stopPropagation();deletePlayer(${p.id},'${(p.name||'').replace(/'/g,"\\'")}')" title="Удалить игрока">✕</button>`:''}
      <div class="ic-ph">${p.img?`<img class="lz-img" data-src="${p.img}" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .25s ease">`:'👤'}</div>
      <div class="ic-bd">
        <div class="ic-n">${p.name}</div>
        <div class="ic-ty">${p.discord||'—'}</div>
        <div class="ic-ft">
          <span class="ip">${p.points||0} pts</span>
          <span class="iq">Слоты: ${p.chars?.filter(c=>c.verified).length||0}/${p.slots||1}</span>
          <span style="font-size:11px;color:var(--txt-m)">${p.chars?.length||0} перс</span>
        </div>
        ${p.chars?.length ? `
          <div style="margin-top:10px">
            <div style="background:var(--bg-h);border-radius:8px;padding:8px 10px;font-size:12px;opacity:${p.chars[0].verified?1:.65};display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:6px;background:var(--bg-e);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>
              <div>
                <div style="font-weight:600;color:var(--gold)">${p.chars[0].name} ${p.chars[0].verified?'<span title="Заверён">✓</span>':'<span style="color:var(--txt-m);font-size:10px" title="На проверке">⏳</span>'}</div>
                <div style="color:var(--txt-s);margin-top:2px">${p.chars[0].class||'—'}${p.chars[0].subclass?' · '+p.chars[0].subclass:''} · ур.${p.chars[0].level||1}</div>
              </div>
            </div>
            ${p.chars.length>1 ? `
              <div id="chars-more-${p.id}" style="max-height:0;overflow:hidden;transition:max-height .3s ease-out">
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
                  ${p.chars.slice(1).map(c=>`
                    <div style="background:var(--bg-h);border-radius:8px;padding:8px 10px;font-size:12px;opacity:${c.verified?1:.65};display:flex;align-items:center;gap:10px">
                      <div style="width:36px;height:36px;border-radius:6px;background:var(--bg-e);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>
                      <div>
                        <div style="font-weight:600;color:var(--gold)">${c.name} ${c.verified?'<span title="Заверён">✓</span>':'<span style="color:var(--txt-m);font-size:10px" title="На проверке">⏳</span>'}</div>
                        <div style="color:var(--txt-s);margin-top:2px">${c.class||'—'}${c.subclass?' · '+c.subclass:''} · ур.${c.level||1}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <button class="btn btn-g" style="width:100%;margin-top:8px;font-size:12px;padding:6px" onclick="toggleCharsMore(${p.id})" id="chars-toggle-${p.id}">
                ▾ Показать ещё ${p.chars.length-1}
              </button>
            ` : ''}
          </div>
        ` : '<div style="margin-top:10px;font-size:12px;color:var(--txt-m);font-style:italic">Нет персонажей</div>'}
      </div>
    </div>`).join('');
  initLazyImages(g);
}

/* ── Player detail / character management ── */
let currentPlayerId=null;

async function openPlayerDetail(pid){
  const p=DB.players.find(x=>x.id===pid);
  if(!p){toast('Игрок не найден','er');return}
  currentPlayerId=pid;
  // Подгружаем полные данные игрока (с картинками персонажей)
  // только если у нас лёгкая версия (chars без всех полей)
  try {
    const full = await apiRequest('/players', {}, { id: pid });
    if (full && full.chars) {
      p.chars = full.chars;
      p.img = full.img || p.img;
    }
  } catch(e) { console.warn('Failed to load full player data', e); }
  const isGm=currentUser?.role==='gm';
  const isOwnProfile=p.userId===currentUser?.id||p.name===currentUser?.username;
  const canManage=isGm||isOwnProfile;

  const avatarEl=document.getElementById('pd-avatar');
  if(p.img){
    avatarEl.innerHTML=`<img class="lz-img" data-src="${p.img}" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .25s ease">`;
  }else{
    avatarEl.innerHTML='👤';
  }
  document.getElementById('pd-name').textContent=p.name;
  document.getElementById('pd-discord').textContent=p.discord||'—';
  document.getElementById('pd-points').textContent=`${p.points||0} pts`;
  document.getElementById('pd-avatar-edit').style.display=isOwnProfile?'block':'none';
  document.getElementById('pd-avatar-url').value=p.img||'';
  const charCount=p.chars?.length||0;
  const usedSlots=p.chars?.filter(c=>c.verified).length||0;
  const totalSlots=p.slots||1;
  document.getElementById('pd-slots').textContent=`${usedSlots}/${totalSlots}`;
  document.getElementById('pd-char-count').textContent=charCount;
  document.getElementById('pd-add-char').style.display=canManage?'inline-flex':'none';

  const charsList=document.getElementById('pd-chars');
  if(!p.chars||!p.chars.length){
    charsList.innerHTML='<div style="text-align:center;padding:24px;color:var(--txt-m);font-size:13px">У игрока ещё нет персонажей</div>';
  }else{
    // Предметы, выданные этому игроку (привязка по имени игрока)
    await ensureSection('items');
    const playerItems=(DB.items||[])
      .filter(it=>(it.awardedTo||[]).some(a=>a.player===p.name))
      .map(it=>{
        const award=it.awardedTo.find(a=>a.player===p.name);
        return {item:it,qty:award.qty};
      });

    charsList.innerHTML=p.chars.map((c,i)=>`
      <div class="char-card ${c.verified?'':'char-pending'}" id="char-${i}">
        <div class="char-head" style="cursor:pointer" onclick="openCharDetail(${i})">
          <div style="display:flex;align-items:center;gap:12px">
            ${c.img?`<img class="lz-img" data-src="${c.img}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;opacity:0;transition:opacity .25s ease">`:''}
            <div>
              <div class="char-name">${c.name}${c.verified?' <span class="char-verified" title="Заверён">✓</span>':' <span class="char-pending-badge" title="На проверке у ГМ">⏳ На проверке</span>'}<span class="char-expand" id="char-expand-${i}">▾</span></div>
              <div class="char-meta">${c.class||'—'}${c.subclass?' · '+c.subclass:''} · ур.${c.level||1}</div>
            </div>
          </div>
          ${canManage?`
            <div class="char-actions">
              <button class="btn btn-g" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();toggleEditChar(${i})">✎ Изменить</button>
              <button class="btn btn-x" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();deleteChar(${i})">✕</button>
            </div>
          `:''}
        </div>
        <div class="char-details" id="char-details-${i}" style="display:none">
          <div class="char-stats">
            <div><span class="cs-l">КТ</span><span class="cs-v">${c.kt?c.kt[0]+'/'+c.kt[1]:'0/0'}</span></div>
            <div><span class="cs-l">ОС этап 1</span><span class="cs-v">${normalizeOs(c.os)[0]}</span></div>
            <div><span class="cs-l">ОС этап 2</span><span class="cs-v">${normalizeOs(c.os)[1]}</span></div>
            <div><span class="cs-l">ОС этап 3</span><span class="cs-v">${normalizeOs(c.os)[2]}</span></div>
            <div><span class="cs-l">ОС этап 4</span><span class="cs-v">${normalizeOs(c.os)[3]}</span></div>
            <div><span class="cs-l">Создан</span><span class="cs-v">${c.createdAt||'—'}</span></div>
          </div>
          ${c.rep&&c.rep.length?`
            <div class="char-rep">
              <div class="cs-l" style="margin-bottom:6px">Репутация</div>
              ${c.rep.map(r=>`
                <div class="rep-chip">
                  <span class="rep-fac">${r.fac}</span>
                  <span class="rep-val ${r.val<0?'neg':''}">${r.val>0?'+':''}${r.val}</span>
                  ${r.note?`<span class="rep-note">${r.note}</span>`:''}
                </div>
              `).join('')}
            </div>
          `:''}
          ${c.desc?`<div class="char-desc">${c.desc}</div>`:''}
          <div class="char-inv">
            <div class="cs-l" style="margin-bottom:8px">Предметы игрока (${playerItems.reduce((s,pi)=>s+pi.qty,0)} шт.)</div>
            ${playerItems.length?`
              <div class="inv-grid">
                ${playerItems.map(pi=>`
                  <div class="inv-item r-${pi.item.rarity||'none'}" title="${(pi.item.desc||'').replace(/"/g,'&quot;')}" onclick="openItemDetail(${pi.item.id})">
                    <div class="inv-ic">${pi.item.img?`<img class="lz-img" data-src="${pi.item.img}" onerror="this.outerHTML='${emo(pi.item.type)}'" style="opacity:0;transition:opacity .25s ease">`:`<span>${emo(pi.item.type)}</span>`}</div>
                    <div class="inv-info">
                      <div class="inv-name">${pi.item.name}</div>
                      <div class="inv-meta">
                        <span class="rb-sm r-${pi.item.rarity||'none'}">${RARITY[pi.item.rarity]||'—'}</span>
                        <span class="inv-qty">×${pi.qty}</span>
                      </div>
                      <div class="inv-type">${pi.item.type||'—'}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `:'<div style="font-size:12px;color:var(--txt-m);font-style:italic">Предметов пока нет</div>'}
          </div>
        </div>
        <div class="char-edit" id="char-edit-${i}" style="display:none">
          <div class="fg2">
            <div class="fg"><label>Имя</label><input class="inp" id="ce-name-${i}" value="${(c.name||'').replace(/"/g,'&quot;')}"></div>
            <div class="fg"><label>Класс</label><input class="inp" id="ce-class-${i}" value="${(c.class||'').replace(/"/g,'&quot;')}"></div>
            <div class="fg"><label>Подкласс</label><input class="inp" id="ce-subclass-${i}" value="${(c.subclass||'').replace(/"/g,'&quot;')}"></div>
            <div class="fg"><label>Уровень</label><input class="inp" type="number" min="1" max="20" id="ce-level-${i}" value="${c.level||1}"></div>
            <div class="fg"><label>КТ мин</label><input class="inp" type="number" id="ce-ktmin-${i}" value="${c.kt?c.kt[0]:0}"></div>
            <div class="fg"><label>КТ макс</label><input class="inp" type="number" id="ce-ktmax-${i}" value="${c.kt?c.kt[1]:0}"></div>
            <div class="fg"><label>ОС этап 1</label><input class="inp" type="number" id="ce-os-1-${i}" value="${normalizeOs(c.os)[0]}"></div>
            <div class="fg"><label>ОС этап 2</label><input class="inp" type="number" id="ce-os-2-${i}" value="${normalizeOs(c.os)[1]}"></div>
            <div class="fg"><label>ОС этап 3</label><input class="inp" type="number" id="ce-os-3-${i}" value="${normalizeOs(c.os)[2]}"></div>
            <div class="fg"><label>ОС этап 4</label><input class="inp" type="number" id="ce-os-4-${i}" value="${normalizeOs(c.os)[3]}"></div>
            <div class="fg fg-full"><label>Табло (открытый контент)</label><textarea class="inp" id="ce-desc-${i}" rows="3" placeholder="Рассы и подклассы, предыстория, цели и амбиции, особенности персонажа...">${c.desc||''}</textarea></div>
            <div class="fg fg-full">
              <label>Аватар персонажа</label>
              <div class="fdz" id="ce-fdz-${i}" onclick="document.getElementById('ce-file-inp-${i}').click()" ondragover="event.preventDefault()" ondrop="handleDrop(event,'ce-${i}')">
                <input type="file" id="ce-file-inp-${i}" accept="image/*" onchange="handleFiles(event,'ce-${i}')">
                <div id="ce-img-preview-${i}" style="display:none;margin-bottom:8px"><img id="ce-img-preview-img-${i}" style="max-width:200px;max-height:200px;border-radius:8px"></div>
                ${c.img?`<div style="margin-bottom:8px"><img src="${c.img}" style="max-width:200px;max-height:200px;border-radius:8px"></div>`:''}
                Перетащите изображение или нажмите для выбора
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-p" onclick="saveChar(${i})">Сохранить</button>
            <button class="btn btn-g" onclick="toggleEditChar(${i})">Отмена</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  openModal('m-player-detail');
  initLazyImages(document.getElementById('m-player-detail'));
  renderPlayerRequests(p);
}

// Список запросов игрока в его карточке
function renderPlayerRequests(p){
  const box=document.getElementById('pd-requests');
  const reqBtn=document.getElementById('pd-request-btn');
  if(!box)return;
  // Кнопку показываем только в собственном профиле (включая ГМа, который смотрит свой профиль)
  const isOwnProfile=p.userId===currentUser?.id||p.name===currentUser?.username;
  if(reqBtn)reqBtn.style.display=isOwnProfile?'block':'none';
  const myReqs=(DB.transactions||[]).filter(t=>t.player===p.name);
  if(!myReqs.length){box.innerHTML='';return}
  box.innerHTML=`
    <h3 style="font-family:var(--fd);font-size:13px;color:var(--txt-s);letter-spacing:.06em;margin-bottom:8px">МОИ ЗАПРОСЫ</h3>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${myReqs.slice(0,10).map(t=>`
        <div class="req-row req-${t.status}">
          <span class="req-status">${t.status==='pending'?'⏳':t.status==='approved'?'✓':'✗'}</span>
          <span class="req-text">${t.desc}</span>
          <span class="req-state">${t.status==='pending'?'Ожидает':t.status==='approved'?'Одобрено':'Отклонено'}</span>
        </div>
      `).join('')}
    </div>`;
}
function toggleCharDetails(idx){
  const details=document.getElementById(`char-details-${idx}`);
  const arrow=document.getElementById(`char-expand-${idx}`);
  if(!details)return;
  const isOpen=details.style.display!=='none';
  details.style.display=isOpen?'none':'block';
  if(arrow)arrow.textContent=isOpen?'▾':'▴';
}

async function savePlayerAvatar(){
  const p=DB.players.find(x=>x.id===currentPlayerId);
  if(!p)return;
  const url=document.getElementById('pd-avatar-url').value.trim();
  const imgData=(noteAtts['pd']||[])[0]?.data;
  if(imgData){
    p.img=imgData;
  }else if(url){
    p.img=url;
  }else{
    delete p.img;
  }
  try{
    await apiRequest('/players',{
      method:'PUT',
      body:JSON.stringify({
        name:p.name, discord:p.discord,
        points:p.points, slots:p.slots,
        chars:p.chars, img:p.img || null
      })
    },{id:p.id});
    toast('Аватар сохранён','ok');
    openPlayerDetail(currentPlayerId);
    renderPlayers();
  }catch(e){
    toast(e.message||'Ошибка сохранения','er');
  }
}

function openCharDetail(idx){
  const p=DB.players.find(x=>x.id===currentPlayerId);
  if(!p||!p.chars[idx]){toast('Персонаж не найден','er');return}
  const c=p.chars[idx];
  const isGm=currentUser?.role==='gm';
  const isOwnProfile=p.userId===currentUser?.id||p.name===currentUser?.username;
  const canManage=isGm||isOwnProfile;

  const playerItems=(DB.items||[])
    .filter(it=>(it.awardedTo||[]).some(a=>a.player===p.name&&(a.charName===c.name||!a.charName)))
    .map(it=>{
      const award=it.awardedTo.find(a=>a.player===p.name&&(a.charName===c.name||!a.charName));
      return {item:it,qty:award.qty};
    });

  document.getElementById('cd-name').textContent=c.name;
  document.getElementById('cd-content').innerHTML=`
    <div class="char-card ${c.verified?'':'char-pending'}">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">
        ${c.img?`<img class="lz-img" data-src="${c.img}" style="width:80px;height:80px;border-radius:12px;object-fit:cover;flex-shrink:0;opacity:0;transition:opacity .25s ease">`:''}
        <div>
          <div class="char-name" style="font-size:18px">${c.name}${c.verified?' <span class="char-verified" title="Заверён">✓</span>':' <span class="char-pending-badge">⏳ На проверке</span>'}</div>
          <div class="char-meta" style="font-size:13px;margin-top:4px">${c.class||'—'}${c.subclass?' · '+c.subclass:''} · ур.${c.level||1}</div>
        </div>
      </div>

      ${c.desc?`
        <div style="background:var(--bg-e);border-radius:var(--r);padding:12px 14px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--txt-m);margin-bottom:6px">Табло</div>
          <div style="font-size:13px;color:var(--txt-s);line-height:1.6">${formatDesc(c.desc)}</div>
        </div>
      `:''}

      ${(c.rep&&c.rep.length)?`
        <div style="background:var(--bg-e);border-radius:var(--r);padding:12px 14px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--txt-m);margin-bottom:8px">Репутация</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${c.rep.map(r=>`
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
                <span style="color:var(--txt-s)">${r.fac||'—'}</span>
                <span style="${parseInt(r.val)>=0?'color:#4ade80':'color:#f87171'}">${r.val>=0?'+':''}${r.val}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `:''}

      <div class="char-stats">
        <div><span class="cs-l">КТ</span><span class="cs-v">${c.kt?c.kt[0]+'/'+c.kt[1]:'0/0'}</span></div>
        <div><span class="cs-l">ОС этап 1</span><span class="cs-v">${normalizeOs(c.os)[0]}</span></div>
        <div><span class="cs-l">ОС этап 2</span><span class="cs-v">${normalizeOs(c.os)[1]}</span></div>
        <div><span class="cs-l">ОС этап 3</span><span class="cs-v">${normalizeOs(c.os)[2]}</span></div>
        <div><span class="cs-l">ОС этап 4</span><span class="cs-v">${normalizeOs(c.os)[3]}</span></div>
        <div><span class="cs-l">Создан</span><span class="cs-v">${c.createdAt||'—'}</span></div>
      </div>

      ${c.rep&&c.rep.length?`
        <div class="char-rep">
          <div class="cs-l" style="margin-bottom:6px">Репутация</div>
          ${c.rep.map(r=>`
            <div class="rep-chip">
              <span class="rep-fac">${r.fac}</span>
              <span class="rep-val ${r.val<0?'neg':''}">${r.val>0?'+':''}${r.val}</span>
              ${r.note?`<span class="rep-note">${r.note}</span>`:''}
            </div>
          `).join('')}
        </div>
      `:''}

      ${c.desc?`<div class="char-desc"><div class="cs-l" style="margin-bottom:4px">Описание</div>${c.desc}</div>`:''}

      <div class="char-inv">
        <div class="cs-l" style="margin-bottom:8px">Предметы (${playerItems.reduce((s,pi)=>s+pi.qty,0)} шт.)</div>
        ${playerItems.length?`
          <div class="inv-grid">
            ${playerItems.map(pi=>`
              <div class="inv-item r-${pi.item.rarity||'none'}" title="${(pi.item.desc||'').replace(/"/g,'&quot;')}" onclick="openItemDetail(${pi.item.id})">
                <div class="inv-ic">${pi.item.img?`<img class="lz-img" data-src="${pi.item.img}" onerror="this.outerHTML='${emo(pi.item.type)}'" style="opacity:0;transition:opacity .25s ease">`:`<span>${emo(pi.item.type)}</span>`}</div>
                <div class="inv-info">
                  <div class="inv-name">${pi.item.name}</div>
                  <div class="inv-meta">
                    <span class="rb-sm r-${pi.item.rarity||'none'}">${RARITY[pi.item.rarity]||'—'}</span>
                    <span class="inv-qty">×${pi.qty}</span>
                  </div>
                  <div class="inv-type">${pi.item.type||'—'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `:'<div style="font-size:12px;color:var(--txt-m);font-style:italic">Предметов пока нет</div>'}
      </div>

      ${canManage?`
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-g" onclick="closeModal('m-char-detail');toggleEditChar(${idx})">✎ Изменить</button>
          <button class="btn btn-x" onclick="closeModal('m-char-detail');deleteChar(${idx})">✕ Удалить</button>
        </div>
      `:''}
    </div>
  `;

  openModal('m-char-detail');
  initLazyImages(document.getElementById('m-char-detail'));
}

function toggleEditChar(idx){
  const editEl=document.getElementById(`char-edit-${idx}`);
  if(!editEl)return;
  editEl.style.display=editEl.style.display==='none'?'block':'none';
}

async function saveChar(idx){
  const p=DB.players.find(x=>x.id===currentPlayerId);
  if(!p||!p.chars[idx])return;
  const c=p.chars[idx];
  const newName=document.getElementById(`ce-name-${idx}`).value.trim();
  if(!newName){toast('Имя не может быть пустым','er');return}
  c.name=newName;
  c.class=document.getElementById(`ce-class-${idx}`).value.trim();
  c.subclass=document.getElementById(`ce-subclass-${idx}`).value.trim();
  c.level=parseInt(document.getElementById(`ce-level-${idx}`).value)||1;
  const ktMin=parseInt(document.getElementById(`ce-ktmin-${idx}`).value)||0;
  const ktMax=parseInt(document.getElementById(`ce-ktmax-${idx}`).value)||0;
  c.kt=[ktMin,ktMax];
  c.os=[
    parseInt(document.getElementById(`ce-os-1-${idx}`).value)||0,
    parseInt(document.getElementById(`ce-os-2-${idx}`).value)||0,
    parseInt(document.getElementById(`ce-os-3-${idx}`).value)||0,
    parseInt(document.getElementById(`ce-os-4-${idx}`).value)||0
  ];
  c.desc=document.getElementById(`ce-desc-${idx}`).value.trim();
  const imgData=(noteAtts[`ce-${idx}`]||[])[0]?.data;
  if(imgData)c.img=imgData;

  try{
    await apiRequest('/players',{
      method:'PUT',
      body:JSON.stringify({
        name:p.name, discord:p.discord,
        points:p.points, slots:p.slots,
        chars:p.chars, img:p.img || null
      })
    },{id:p.id});
    toast('Персонаж сохранён','ok');
    openPlayerDetail(currentPlayerId); // ре-рендер
    renderPlayers();
  }catch(e){
    toast(e.message||'Ошибка сохранения','er');
  }
}

async function deleteChar(idx){
  if(!confirm('Удалить персонажа?'))return;
  const p=DB.players.find(x=>x.id===currentPlayerId);
  if(!p||!p.chars[idx])return;
  const name=p.chars[idx].name;
  p.chars.splice(idx,1);
  try{
    await apiRequest('/players',{
      method:'PUT',
      body:JSON.stringify({
        name:p.name, discord:p.discord,
        points:p.points, slots:p.slots,
        chars:p.chars, img:p.img || null
      })
    },{id:p.id});
    toast(`Персонаж «${name}» удалён`,'ok');
    openPlayerDetail(currentPlayerId);
    renderPlayers();
  }catch(e){
    toast(e.message||'Ошибка удаления','er');
  }
}

/* Удаление профиля игрока (только ГМ) */
async function deletePlayer(id,name){
  if(!confirm(`Удалить игрока «${name}»?\nЭто действие необратимо. Все его персонажи будут потеряны.`))return;
  try{
    await apiRequest('/players',{method:'DELETE'},{id});
    // Удаляем из локальной копии
    DB.players=DB.players.filter(p=>p.id!==id);
    // Если удаляли открытый в модалке профиль — закрываем её
    if(currentPlayerId===id){
      closeModal('m-player-detail');
      currentPlayerId=null;
    }
    await addLog('revoke','🗑',`Игрок <span class="li-pl">${name}</span> удалён. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
    toast(`Игрок «${name}» удалён`,'ok');
    renderPlayers();
  }catch(e){
    toast(e.message||'Ошибка удаления игрока','er');
  }
}

/* ── Create character ── */
// ОС хранится как массив [этап1, этап2, этап3, этап4].
// Старые данные (число) нормализуются через normalizeOs().
function normalizeOs(os){
  if(Array.isArray(os))return [os[0]||0,os[1]||0,os[2]||0,os[3]||0];
  const n=parseInt(os)||0;
  return [0,0,0,n];
}
async function createCharacter(){
  const name=document.getElementById('nc-name').value.trim();
  const cls=document.getElementById('nc-class').value.trim();
  const subclass=document.getElementById('nc-subclass').value.trim();
  const level=parseInt(document.getElementById('nc-level').value)||1;
  const ktMin=parseInt(document.getElementById('nc-kt-min').value)||0;
  const ktMax=parseInt(document.getElementById('nc-kt-max').value)||0;
  const os=[
    parseInt(document.getElementById('nc-os-1').value)||0,
    parseInt(document.getElementById('nc-os-2').value)||0,
    parseInt(document.getElementById('nc-os-3').value)||0,
    parseInt(document.getElementById('nc-os-4').value)||0
  ];
  const desc=document.getElementById('nc-desc').value.trim();
  const img=(noteAtts.nc||[])[0]?.data||null;

  if(!name){
    toast('Введите имя персонажа','er');
    return;
  }

  // Находим игрока, привязанного к текущему пользователю
  let me=DB.players.find(p=>p.userId===currentUser?.id||p.name===currentUser?.username);
  if(!me){
    toast('Профиль игрока не найден','er');
    return;
  }
  if(me.chars?.some(c=>c.name===name)){
    toast('Персонаж с таким именем уже существует','er');
    return;
  }
  const usedSlots=me.chars?.filter(c=>c.verified).length||0;
  const totalSlots=me.slots||1;
  if(usedSlots>=totalSlots){
    toast(`Нет свободных слотов (${usedSlots}/${totalSlots}). Подождите, пока ГМ деактивирует одного из персонажей.`,'er');
    return;
  }

  const newChar={
    name, class:cls, subclass,
    level, kt:[ktMin,ktMax], os,
    verified:false, rep:[],
    desc, img, createdAt:new Date().toISOString().split('T')[0]
  };

  me.chars=me.chars||[];
  me.chars.push(newChar);

  try{
    await apiRequest('/players',{
      method:'PUT',
      body:JSON.stringify({
        name:me.name, discord:me.discord,
        points:me.points, slots:me.slots,
        chars:me.chars,
        img:me.img || null
      })
    },{id:me.id});

    // Логируем создание персонажа (как ГМ-операцию — игрок может читать логи,
    // но не создавать. Поэтому лог создаём от имени системы через GM-эндпоинт
    // только если текущий пользователь — ГМ. Иначе пропускаем лог.)
    if(currentUser?.role==='gm'){
      try{
        await apiRequest('/logs',{
          method:'POST',
          body:JSON.stringify({
            type:'level', icon:'🆕',
            text:`Создан персонаж <span class="li-it">«${name}»</span> (${cls||'—'}). Игрок: <span class="li-pl">${me.name}</span>.`
          })
        });
      }catch{}
    }

    closeModal('m-new-char');
    renderPlayers();
    toast('Персонаж создан!','ok');

    // Очищаем форму
    ['nc-name','nc-class','nc-subclass','nc-desc'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('nc-level').value='1';
    document.getElementById('nc-kt-min').value='0';
    document.getElementById('nc-kt-max').value='0';
    document.getElementById('nc-os-1').value='0';
    document.getElementById('nc-os-2').value='0';
    document.getElementById('nc-os-3').value='0';
    document.getElementById('nc-os-4').value='0';
    document.getElementById('nc-file-inp').value='';
    document.getElementById('nc-img-preview').style.display='none';
    noteAtts.nc=[];
  }catch(e){
    toast(e.message||'Ошибка создания персонажа','er');
  }
}

/* ── Modal helpers ── */
function openModal(id){
  document.getElementById(id).classList.add('on');
}
function closeModal(id){
  document.getElementById(id).classList.remove('on');
}
document.querySelectorAll('.mo').forEach(m=>{
  m.addEventListener('click',e=>{
    if(e.target.classList.contains('mo'))m.classList.remove('on');
    if(e.target.classList.contains('mc-btn'))m.classList.remove('on');
  });
});

/* ── Toast notifications ── */
function toast(msg,type='ok'){
  const c=document.getElementById('tc');
  const t=document.createElement('div');
  t.className='tst '+type;
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>t.style.opacity='0',2500);
  setTimeout(()=>t.remove(),3000);
}

/* ── Initialize app ── */
let pollTimer=null;
async function initApp(){
  initNotes();
  initGuide();
  // 1) Мгновенно восстанавливаем из кеша — UI появляется сразу
  const cache=loadCache();
  if(cache&&cache.DB){
    DB={...DB,...cache.DB};
    // Отмечаем какие секции уже есть в кеше (чтобы ensureSection не перезапрашивал)
    if(cache.DB.notes){loadedSections.add('notes')}
    if(cache.DB.guides){loadedSections.add('guides')}
    if(cache.DB.logs){loadedSections.add('logs')}
    if(cache.DB.items){loadedSections.add('items')}
    loadedSections.add('players');loadedSections.add('factions');loadedSections.add('transactions');
    renderTab('items');
  }
  // 2) Параллельно грузим свежие данные с сервера
  const data=await fetchData();
  if(data){
    renderTab('items');
  }
  // Лёгкий поллинг для доставки уведомлений игроку о результате запросов
  if(pollTimer)clearInterval(pollTimer);
  pollTimer=setInterval(async()=>{
    // Только если пользователь авторизован и страница видима
    if(authToken&&currentUser&&!document.hidden){
      try{await fetchData()}catch{}
    }
  },30000);
}

/* ── Check auth on load ── */
if(authToken&&currentUser){
  showApp();
}else{
  showAuthPage();
}
