/* ═══════════════════════════════════════════════════════════
   ГРААЛЬ  ·  App
═══════════════════════════════════════════════════════════════ */

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
    const data = await apiRequest('/data');
    DB = data;
    return data;
  } catch (e) {
    console.error('Failed to fetch data:', e);
  }
}

/* ── Auth functions ── */
function switchAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-error').style.display = 'none';
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

  if (!username || !email || !password) {
    showAuthError('Пожалуйста, заполните все поля');
    return;
  }

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role })
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

/* ── Constants ── */
const RARITY={common:'Обычный',uncommon:'Необычный',rare:'Редкий',very_rare:'Очень редкий',legendary:'Легендарный',artifact:'Артефакт',none:'Без редкости',varies:'Варьируется'};
const STAGES={1:'I этап',2:'II этап',3:'III этап',4:'IV этап'};
const ATTUNE={yes:'Требуется',no:'Нет',other:'Особая'};
const ITEM_EMO={Оружие:'⚔',Доспехи:'🛡',Кольцо:'💍',Зелье:'⚗',Одеяние:'🪄',Артефакт:'✨',Свиток:'📜'};
const ALL_TAGS=['Перевод','Хоумрул','Правила','Лор','Сессия','Объявление','Карта','НИП'];
const FACTIONS_DEFAULT=[
  {name:'Орден Рассветного Щита',color:'#FBBF24'},
  {name:'Культ Разлома',color:'#F87171'},
  {name:'Гильдия Странников',color:'#60A5FA'},
  {name:'Серебряный Ковен',color:'#C084FC'},
  {name:'Нейтральные',color:'#9CA3AF'},
];
function emo(type){const k=Object.keys(ITEM_EMO).find(k=>type?.includes(k));return k?ITEM_EMO[k]:'🔮'}

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
  if(t==='items'){renderItems();populatePlayerSelects()}
  if(t==='notes'){renderNotes()}
  if(t==='gm'){renderGm()}
  if(t==='logs'){renderLogs()}
  if(t==='guide'){renderGuide()}
  if(t==='players'){renderPlayers()}
}

/* ══════════════
   ITEMS
══════════════ */
function renderItems(){
  const q=(document.getElementById('item-q')?.value||'').toLowerCase();
  const rar=document.getElementById('f-rar')?.value||'';
  const stg=document.getElementById('f-stg')?.value||'';
  const att=document.getElementById('f-att')?.value||'';
  const list=DB.items.filter(it=>{
    const mq=!q||it.name.toLowerCase().includes(q)||it.type.toLowerCase().includes(q);
    return mq&&(!rar||it.rarity===rar)&&(!stg||String(it.stage)===stg)&&(!att||it.attune===att);
  });
  const g=document.getElementById('items-grid');
  if(!list.length){g.innerHTML='<div class="emp"><div class="emp-ic">🔮</div><h3>Предметы не найдены</h3><p>Измените фильтры или добавьте предмет</p></div>';return}
  g.innerHTML=list.map(it=>{
    const awarded=it.awardedTo.reduce((s,a)=>s+a.qty,0);
    return `
    <div class="card ic" onclick="openItemDetail(${it.id})">
      ${it.img?`<img class="ic-img" src="${it.img}" alt="${it.name}" onerror="this.style.display='none'">`:`<div class="ic-ph">${emo(it.type)}</div>`}
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
}
function resetItemFilters(){
  ['item-q','f-rar','f-stg','f-att'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
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
    qty:parseInt(document.getElementById('ni-qty').value)||1,
    desc:document.getElementById('ni-desc').value.trim(),
    author:document.getElementById('ni-author').value.trim()||currentUser?.username||'Мастер Эрандил',
    img:document.getElementById('ni-img').value.trim()
  };
  const newItem = await apiRequest('/items', {
    method: 'POST',
    body: JSON.stringify(it)
  });
  DB.items.unshift(newItem);
  await addLog('item','⚔',`Предмет <span class="li-it">«${it.name}»</span> добавлен. Добавил: <span class="li-pl">${it.author}</span>. Кол-во: ${it.qty}.`);
  toast(`«${it.name}» добавлен`,'ok');
  closeModal('m-add-item');
  ['ni-name','ni-type','ni-price','ni-qty','ni-desc','ni-author','ni-img'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  renderItems();
}

/* Item detail */
function openItemDetail(id){
  const it=DB.items.find(x=>x.id===id);if(!it)return;
  currentItemId=id;
  document.getElementById('det-title').textContent=it.name;
  const awSel=document.getElementById('aw-player');
  awSel.innerHTML='<option value="">Выбрать игрока…</option>'+DB.players.map(p=>`<option>${p.name}</option>`).join('');
  const totalAwarded=it.awardedTo.reduce((s,a)=>s+a.qty,0);
  const awdHtml=it.awardedTo.length?`<div class="aw-list">${it.awardedTo.map(a=>`
    <div class="aw-li">
      <span class="aw-li-n">${a.player}</span>
      <span class="aw-li-q">×${a.qty}</span>
    </div>`).join('')}</div>`:'<p style="font-size:12px;color:var(--txt-m);margin-top:6px">Ещё никому не выдан</p>';
  document.getElementById('det-body').innerHTML=`
    <div class="id-hd">
      ${it.img?`<img class="id-img" src="${it.img}" onerror="this.outerHTML='<div class=id-img style=font-size:38px;display:flex;align-items:center;justify-content:center>${emo(it.type)}</div>'">`:`<div class="id-img" style="font-size:38px;display:flex;align-items:center;justify-content:center">${emo(it.type)}</div>`}
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
    <div class="id-desc">${it.desc}</div>
    <div style="margin-top:12px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--txt-m)">Выдано игрокам</div>
    ${awdHtml}`;
  openModal('m-item-detail');
}
async function awardItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  const player=document.getElementById('aw-player').value;
  const qty=parseInt(document.getElementById('aw-qty').value)||1;
  if(!it||!player||player.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  if(qty<1){toast('Количество должно быть ≥ 1','er');return}
  if(it.qty<qty){toast(`В базе только ×${it.qty}, нельзя выдать ×${qty}`,'er');return}
  it.qty-=qty;
  const exIdx=it.awardedTo.findIndex(a=>a.player===player);
  if(exIdx!==-1)it.awardedTo[exIdx].qty+=qty;
  else it.awardedTo.push({player,qty});
  await apiRequest('/items', {
    method: 'PUT',
    body: JSON.stringify(it)
  }, { id: it.id });
  await addLog('item','⚔',`Предмет <span class="li-it">«${it.name}»</span> выдан <span class="li-pl">${player}</span> ×${qty}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`«${it.name}» выдан ${player} ×${qty}`,'ok');
  closeModal('m-item-detail');renderItems();
}
async function revokeItem(){
  const it=DB.items.find(x=>x.id===currentItemId);
  const player=document.getElementById('aw-player').value;
  const qty=parseInt(document.getElementById('aw-qty').value)||1;
  if(!it||!player||player.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  const exIdx=it.awardedTo.findIndex(a=>a.player===player);
  if(exIdx===-1){toast('У этого игрока нет данного предмета','er');return}
  const ex=it.awardedTo[exIdx];
  if(ex.qty<qty){toast(`У игрока только ×${ex.qty}, нельзя изъять ×${qty}`,'er');return}
  const actualQty=qty;
  ex.qty-=actualQty;
  it.qty+=actualQty;
  if(ex.qty<=0)it.awardedTo.splice(exIdx,1);
  await apiRequest('/items', {
    method: 'PUT',
    body: JSON.stringify(it)
  }, { id: it.id });
  await addLog('revoke','🚫',`Предмет <span class="li-it">«${it.name}»</span> изъят у <span class="li-pl">${player}</span> ×${actualQty}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`«${it.name}» изъят у ${player} ×${actualQty}`,'ok');
  closeModal('m-item-detail');renderItems();
}

function quickRevoke(playerName){
  const it=DB.items.find(x=>x.id===currentItemId);if(!it)return;
  const ex=it.awardedTo.find(a=>a.player===playerName);if(!ex)return;
  const sel=document.getElementById('aw-player');
  for(let i=0;i<sel.options.length;i++){
    if(sel.options[i].text===playerName){sel.selectedIndex=i;break}
  }
  document.getElementById('aw-qty').value=ex.qty;
  toast(`Выбран ${playerName} ×${ex.qty} — нажмите «Изъять»`,'if');
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
    noteAtts[pfx]=noteAtts[pfx]||[];
    noteAtts[pfx].push({name:file.name,type:file.type,data:ev.target.result});
    renderAttList(pfx);
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
function buildTagsSelect(containerId){
  const c=document.getElementById(containerId);if(!c)return;
  c.innerHTML=ALL_TAGS.map(t=>`<div class="tag-ck"><label><input type="checkbox" value="${t}"> ${t}</label></div>`).join('');
}
function getSelectedTags(containerId){
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(el=>el.value);
}
function buildTagsFilter(filterId,renderFn){
  const c=document.getElementById(filterId);if(!c)return;
  const tags=['Все',...ALL_TAGS];
  c.innerHTML=tags.map(t=>`<div class="tc${t==='Все'?' on':''}" data-tag="${t}">${t}</div>`).join('');
  c.querySelectorAll('.tc').forEach(tc=>{
    tc.addEventListener('click',()=>{
      c.querySelectorAll('.tc').forEach(x=>x.classList.remove('on'));
      tc.classList.add('on');renderFn();
    });
  });
}

/* ══════════════
   NOTES
══════════════ */
function initNotes(){
  buildTagsSelect('nn-tags-sel');
  buildTagsFilter('note-tags-filter',renderNotes);
  initToolbar('nn-etb','nn-editor');
}
function renderNotes(){
  const q=(document.getElementById('note-q')?.value||'').toLowerCase();
  const activeTag=document.querySelector('#note-tags-filter .tc.on')?.dataset.tag||'Все';
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
        <div class="post-badges">${n.isPublic?'<span class="pub-badge">Публичная</span>':''}</div>
      </div>
      <div class="post-ex">${n.content.replace(/<[^>]+>/g,'')}</div>
      <div class="post-ft">
        ${n.tags.map(t=>`<span class="ntag">${t}</span>`).join('')}
        <span class="post-meta">${n.author} · ${n.date}</span>
      </div>
    </div>`).join('');
}
async function saveNote(){
  const title=document.getElementById('nn-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  const tags=getSelectedTags('nn-tags-sel');
  const content=document.getElementById('nn-editor').innerHTML;
  const isPublic=document.getElementById('nn-public').checked;
  const note={
    title,tags,content,isPublic,
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
  buildTagsFilter('guide-tags-filter',renderGuide);
  initToolbar('ng-etb','ng-editor');
}
function renderGuide(){
  const q=(document.getElementById('guide-q')?.value||'').toLowerCase();
  const activeTag=document.querySelector('#guide-tags-filter .tc.on')?.dataset.tag||'Все';
  const list=DB.guides.filter(n=>{
    const mq=!q||n.title.toLowerCase().includes(q)||n.content.replace(/<[^>]+>/g,'').toLowerCase().includes(q);
    const mt=activeTag==='Все'||n.tags.includes(activeTag);
    return mq&&mt;
  });
  const el=document.getElementById('guide-list');
  if(!list.length){el.innerHTML='<div class="emp"><div class="emp-ic">📖</div><h3>Нет записей</h3></div>';return}
  el.innerHTML=list.map(n=>`
    <div class="post" onclick="openThread(${n.id},'guide')">
      <div class="post-hd"><div class="post-ti">${n.title}</div></div>
      <div class="post-ex">${n.content.replace(/<[^>]+>/g,'')}</div>
      <div class="post-ft">
        ${n.tags.map(t=>`<span class="ntag">${t}</span>`).join('')}
        <span class="post-meta">${n.author} · ${n.date}</span>
      </div>
    </div>`).join('');
}
async function saveGuide(){
  const title=document.getElementById('ng-title').value.trim();
  if(!title){toast('Введите заголовок','er');return}
  const tags=getSelectedTags('ng-tags-sel');
  const content=document.getElementById('ng-editor').innerHTML;
  const g={
    title,tags,content,
    atts:noteAtts.ng||[],
    comments:[],
    author:currentUser?.username||'Мастер Эрандил',
    date:new Date().toISOString().split('T')[0]
  };
  const newGuide = await apiRequest('/guides', {
    method: 'POST',
    body: JSON.stringify(g)
  });
  DB.guides.unshift(newGuide);
  noteAtts.ng=[];
  toast(`Запись «${title}» сохранена`,'ok');
  closeModal('m-new-guide');
  document.getElementById('ng-title').value='';
  document.getElementById('ng-editor').innerHTML='';
  document.getElementById('ng-att-list').innerHTML='';
  buildTagsSelect('ng-tags-sel');
  renderGuide();
}

/* ══════════════
   THREAD VIEW
══════════════ */
function openThread(id,type){
  const db=type==='note'?DB.notes:DB.guides;
  const post=db.find(x=>x.id===id);if(!post)return;
  threadPostId=id;threadType=type;
  document.getElementById('thread-title').textContent=post.title;
  document.getElementById('thread-badges').innerHTML=
    post.tags.map(t=>`<span class="ntag">${t}</span>`).join('')+
    (post.isPublic?'<span class="pub-badge">Публичная</span>':'');
  document.getElementById('thread-content').innerHTML=post.content;
  const atts=post.atts||[];
  document.getElementById('thread-atts').innerHTML=atts.length?atts.map(a=>`
    <div class="att-chip" onclick="previewAtt('${a.name}','${a.data}','${a.type}')">
      <span>${a.type.startsWith('image/')?'🖼':'📎'}</span>${a.name}
    </div>`).join(''):'';
  renderComments(post);
  document.getElementById('thread-view').classList.add('on');
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
  post.comments.push(newComment);
  await apiRequest(`/${threadType==='note'?'notes':'guides'}`, {
    method: 'PUT',
    body: JSON.stringify(post)
  }, { id: post.id });
  renderComments(post);
  inp.value='';
}
function previewAtt(name,data,type){
  if(type.startsWith('image/')){
    const w=window.open();
    w.document.write(`<img src="${data}" style="max-width:100%;background:#111">`);
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
  ['gm-pts-player','gm-kt-player','gm-cer-player'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.innerHTML=opts;
  });
}
function fillGmChars(playerId,charId){
  const player=document.getElementById(playerId)?.value;
  const p=DB.players.find(x=>x.name===player);
  const el=document.getElementById(charId);
  el.innerHTML='<option value="">Выбрать персонажа…</option>'+(p?p.chars.map(c=>`<option>${c.name}</option>`).join(''):'');
}
function renderGm(){
  populatePlayerSelects();
  fillGmChars('gm-kt-player','gm-kt-char');
  fillGmChars('gm-cer-player','gm-cer-char');
  renderTx();
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
    body: JSON.stringify(p)
  }, { id: p.id });
  await addLog('award','💎',`<span class="li-pl">${pname}</span> получил <strong>+${amt} поинтов</strong>. Причина: ${reason||'—'}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`${pname} +${amt} поинтов`,'ok');
  document.getElementById('gm-pts-amt').value='';document.getElementById('gm-pts-reason').value='';
}
async function gmApplyKt(){
  const pname=document.getElementById('gm-kt-player').value;
  const cname=document.getElementById('gm-kt-char').value;
  const kt=parseInt(document.getElementById('gm-kt-val').value)||0;
  const os=parseInt(document.getElementById('gm-os-val').value)||0;
  if(!pname||pname.startsWith('Выбрать')){toast('Выберите игрока','er');return}
  if(!cname||cname.startsWith('Выбрать')){toast('Выберите персонажа','er');return}

  // Собираем все строки репутации
  const repRows=[...document.querySelectorAll('#rep-rows .rep-row')]
    .map(r=>({
      fac:r.querySelector('.rep-fac').value.trim(),
      val:parseInt(r.querySelector('.rep-val').value)||0,
      note:r.querySelector('.rep-note').value.trim()
    }))
    .filter(r=>r.fac&&r.val!==0);

  const p=DB.players.find(x=>x.name===pname);
  const ch=p?.chars.find(c=>c.name===cname);
  if(ch){
    ch.kt[0]=Math.min(ch.kt[0]+kt,ch.kt[1]);ch.os+=os;
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
    body: JSON.stringify(p)
  }, { id: p.id });

  // Логируем
  let logParts=[];
  if(kt)logParts.push(`+${kt} КТ`);
  if(os)logParts.push(`+${os} ОС`);
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
  if(ch)ch.verified=status;
  await apiRequest('/players', {
    method: 'PUT',
    body: JSON.stringify(p)
  }, { id: p.id });
  await addLog('certify','✅',`Персонаж <strong>«${cname}»</strong> ${status?'заверен':'разаверен'}. ГМ: <span class="li-pl">${currentUser?.username}</span>.`);
  toast(`${cname} ${status?'заверен':'разаверен'}`,'ok');
}
function renderTx(){
  const list=document.getElementById('tx-list');
  const pending=DB.transactions.filter(t=>t.status==='pending');
  if(!pending.length){list.innerHTML='<div style="font-size:12px;color:var(--txt-m);text-align:center;padding:20px">Нет ожидающих транзакций</div>';return}
  list.innerHTML=pending.map(t=>`
    <div class="tx" id="tx-${t.id}">
      <div class="tx-inf"><span class="tx-pl">${t.player}</span><span class="tx-ds">${t.desc}</span></div>
      <span class="tx-co">${t.cost} pts</span>
      <div class="tx-ac">
        <div class="bic btn-ok" onclick="approveTx(${t.id})">✓</div>
        <div class="bic btn-x" onclick="rejectTx(${t.id})">✗</div>
      </div>
    </div>`).join('');
}
async function approveTx(id){
  const t=DB.transactions.find(x=>x.id===id);if(!t)return;
  t.status='approved';
  await apiRequest('/transactions', {
    method: 'PUT',
    body: JSON.stringify(t)
  }, { id: t.id });
  await addLog('award','🔑',`Транзакция одобрена: <span class="li-pl">${t.player}</span> — <strong>${t.desc}</strong>.`);
  toast('Транзакция одобрена','ok');renderTx();
}
async function rejectTx(id){
  const t=DB.transactions.find(x=>x.id===id);if(!t)return;
  t.status='rejected';
  await apiRequest('/transactions', {
    method: 'PUT',
    body: JSON.stringify(t)
  }, { id: t.id });
  toast('Транзакция отклонена','er');renderTx();
}

/* ── Reputation rows (multi-source) ── */
function addRepRow(fac='', val='', note=''){
  const wrap=document.getElementById('rep-rows');
  const row=document.createElement('div');
  row.className='rep-row';
  row.style.cssText='display:grid;grid-template-columns:1fr 90px 1.4fr 28px;gap:6px;align-items:start;position:relative';
  row.innerHTML=`
    <div class="fac-wrap" style="position:relative">
      <input class="inp rep-fac" placeholder="Фракция…" value="${fac.replace(/"/g,'&quot;')}" autocomplete="off"
             oninput="facInputFor(this)" onfocus="facInputFor(this)" onblur="setTimeout(()=>hideFacFor(this),180)">
      <div class="fac-drop rep-drop"></div>
    </div>
    <input class="inp rep-val" type="number" placeholder="+0" value="${val}" min="-100" max="100">
    <input class="inp rep-note" placeholder="Примечание…" value="${note.replace(/"/g,'&quot;')}">
    <button class="btn btn-x" style="padding:6px" title="Удалить" onclick="this.parentElement.remove()">✕</button>
  `;
  wrap.appendChild(row);
}
function facInputFor(input){
  const val=(input.value||'').toLowerCase();
  const drop=input.parentElement.querySelector('.rep-drop');
  if(!drop)return;
  const matches=DB.factions.filter(f=>f.name.toLowerCase().includes(val));
  if(!matches.length||!val){drop.classList.remove('on');return}
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
  const totalAwarded=DB.items.reduce((s,it)=>s+it.awardedTo.reduce((ss,a)=>ss+a.qty,0),0);
  const stats=[
    {val:DB.items.length,lbl:'Предметов в базе',sub:'уникальных записей',color:'var(--pur-b)',bar:Math.min(DB.items.length/50,1)},
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
  const itemsWithCount=DB.items
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
function renderPlayers(){
  const g=document.getElementById('players-grid');
  // Игрок видит только своего персонажа (по userId), ГМ видит всех
  const list = currentUser?.role === 'gm'
    ? DB.players
    : DB.players.filter(p => p.userId === currentUser?.id || p.name === currentUser?.username);
  if(!list.length){
    g.innerHTML='<div class="emp"><div class="emp-ic">👥</div><h3>Нет персонажей</h3><p>Создайте своего первого персонажа</p></div>';
    return;
  }
  g.innerHTML=list.map(p=>`
    <div class="card ic">
      <div class="ic-ph">👤</div>
      <div class="ic-bd">
        <div class="ic-n">${p.name}</div>
        <div class="ic-ty">${p.discord||'—'}</div>
        <div class="ic-ft">
          <span class="ip">${p.points||0} pts</span>
          <span class="iq">${p.chars?.length||0} персонажей</span>
        </div>
        ${p.chars?.length ? `
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
            ${p.chars.map(c=>`
              <div style="background:var(--bg-h);border-radius:8px;padding:8px 10px;font-size:12px">
                <div style="font-weight:600;color:var(--gold)">${c.name}</div>
                <div style="color:var(--txt-s);margin-top:2px">${c.class||'—'}${c.subclass?' · '+c.subclass:''} · ур.${c.level||1}${c.verified?' · ✓':''}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>`).join('');
}

/* ── Create character ── */
async function createCharacter(){
  const name=document.getElementById('nc-name').value.trim();
  const cls=document.getElementById('nc-class').value.trim();
  const subclass=document.getElementById('nc-subclass').value.trim();
  const level=parseInt(document.getElementById('nc-level').value)||1;
  const ktMin=parseInt(document.getElementById('nc-kt-min').value)||0;
  const ktMax=parseInt(document.getElementById('nc-kt-max').value)||0;
  const os=parseInt(document.getElementById('nc-os').value)||0;
  const desc=document.getElementById('nc-desc').value.trim();

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

  const newChar={
    name, class:cls, subclass,
    level, kt:[ktMin,ktMax], os,
    verified:false, rep:[],
    desc, createdAt:new Date().toISOString().split('T')[0]
  };

  me.chars=me.chars||[];
  me.chars.push(newChar);

  try{
    await apiRequest('/players',{
      method:'PUT',
      body:JSON.stringify({
        name:me.name, discord:me.discord,
        points:me.points, slots:me.slots,
        chars:me.chars
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
    document.getElementById('nc-os').value='0';
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
async function initApp(){
  initNotes();
  initGuide();
  const data=await fetchData();
  if(data){
    renderTab('items');
  }
}

/* ── Check auth on load ── */
if(authToken&&currentUser){
  showApp();
}else{
  showAuthPage();
}
