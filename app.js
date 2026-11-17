/* OKR Daily 3 | local-first strategic workspace | no hidden external services */
'use strict';
const STORE='okr-daily-v3', OLD=['okr-daily-v2','okr-daily-v1'], AUTO_BACKUP='okr-daily-v3-rollback';
const $=s=>document.querySelector(s);
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const cleanId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)?v:uid();
const num=(v,fallback=0)=>v===''||v===null||v===undefined?fallback:Number.isFinite(Number(v))?Number(v):fallback;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dateObj=k=>new Date(k+'T12:00:00');
const plus=(k,n)=>{const d=dateObj(k);d.setDate(d.getDate()+n);return ymd(d)};
const diff=(a,b)=>Math.round((dateObj(b)-dateObj(a))/86400000);
const clock=()=>new Date().getHours()*60+new Date().getMinutes();
const today=()=>{const d=new Date();d.setHours(d.getHours()-3);return ymd(d)};
const fmt=(k,opts={day:'numeric',month:'short'})=>{try{return dateObj(k).toLocaleDateString('ru-RU',opts)}catch{return k||'—'}};
const formatN=(n)=>Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n):'—';
const initial=()=>({version:3,objectives:[{id:uid(),title:'',description:'',startDate:today(),endDate:plus(today(),89),status:'active',keyResults:[]}],activeObjectiveId:'',days:{},backlog:[],experiments:[],decisions:[],reviews:{},prefs:{theme:'dark',morning:'08:00',evening:'21:00',reminders:false,lastBackup:null},focus:null});
let db,tab='today',subtab='backlog',toaster,focusTick,noticeShown='',lastSaveStatus='';
function ensureDay(k){return db.days[k]||(db.days[k]={goals:[],review:{},swot:{},closed:false,snapMeta:[]})}
function dayGoals(k){return db.days[k]?.goals||[]}
function allKR(){return db.objectives.flatMap(o=>o.keyResults)}
function findKR(id){return allKR().find(r=>r.id===id)}
function objectiveForKR(id){return db.objectives.find(o=>o.keyResults.some(r=>r.id===id))}
function activeObjective(){return db.objectives.find(o=>o.id===db.activeObjectiveId)||db.objectives[0]}
function progress(r){
 if(!r)return 0;
 if(r.metric==='manual')return Math.round(clamp(num(r.progress),0,100));
 const start=num(r.start),target=num(r.target),curr=num(r.current);
 if(target===start)return curr===target?100:0;
 return Math.round(clamp((curr-start)/(target-start)*100,0,100));
}
function objectivePct(o){return o.keyResults.length?Math.round(o.keyResults.reduce((s,r)=>s+progress(r),0)/o.keyResults.length):0}
function planPct(o,k=today()){return Math.round(clamp(diff(o.startDate,k)/Math.max(1,diff(o.startDate,o.endDate))*100,0,100))}
function krPoints(r){
 const m=new Map();
 if(r.startDate&&r.metric==='number')m.set(r.startDate,0);
 (r.history||[]).forEach(p=>{if(p.date)m.set(p.date,num(p.progress))});
 Object.entries(db.days).forEach(([k,d])=>{
  const s=(d.snapMeta||[]).find(e=>e.id===r.id);
  if(s&&!m.has(k))m.set(k,num(s.progress));
  else if(d.snap&&d.snap[r.id]!=null&&!m.has(k))m.set(k,num(d.snap[r.id]));
 });
 return [...m].map(([date,progress])=>({date,progress})).sort((a,b)=>a.date.localeCompare(b.date));
}
function forecast(r,o=objectiveForKR(r.id)){
 const val=progress(r),planned=planPct(o);
 if(val===100)return{status:'done',label:'Достигнут',planned,date:today()};
 const all=krPoints(r).filter(p=>p.date<=today());
 const recent=all.filter(p=>p.date>=plus(today(),-14));
 const arr=recent.length>=2?recent:all;
 if(arr.length<2||diff(arr[0].date,arr.at(-1).date)<1)return{status:'unknown',label:'Недостаточно истории',planned,date:null};
 const first=arr[0],last=arr.at(-1),velocity=(last.progress-first.progress)/diff(first.date,last.date);
 if(velocity<=0.03)return{status:'stalled',label:'Прирост не зафиксирован',planned,date:null};
 const days=Math.ceil((100-val)/velocity);
 if(days>3650)return{status:'stalled',label:'Текущий темп слишком низкий',planned,date:null};
 const date=plus(today(),days);
 return{status:date>o.endDate?'late':'ontrack',label:(date>o.endDate?'Позже дедлайна: ':'Ожидается: ')+fmt(date),planned,date};
}
function priorityScore(g){return Math.round(clamp(num(g.impact,3),1,5)*clamp(num(g.confidence,3),1,5)*60/Math.max(10,num(g.minutes,60))*10)/10}
function weekStart(k){return plus(k,-(dateObj(k).getDay()+6)%7)}
function weekStats(start){let total=0,done=0,closed=0,minutes=0;
 for(let i=0;i<7;i++){const k=plus(start,i),d=db.days[k];if(k>today()||!d)continue;total+=d.goals.length;done+=d.goals.filter(g=>g.done).length;closed+=d.closed?1:0;minutes+=d.goals.reduce((s,g)=>s+num(g.focusMinutes),0)}
 return{total,done,closed,minutes,rate:total?Math.round(done/total*100):null};
}
function streak(){let n=0,k=today();if(!db.days[k]?.closed)k=plus(k,-1);while(db.days[k]?.closed){n++;k=plus(k,-1);if(n>=3650)break}return n}
function recordKR(r,k=today()){
 if(!r.history)r.history=[];
 const val=r.metric==='manual'?progress(r):num(r.current),item=r.history.find(p=>p.date===k);
 const p={date:k,value:val,progress:progress(r)};
 if(item)Object.assign(item,p);else r.history.push(p);
 r.history.sort((a,b)=>a.date.localeCompare(b.date));
}
function normalize(source){
 const raw=source&&typeof source==='object'?source:{};
 const d=initial();
 d.days=raw.days&&typeof raw.days==='object'&&!Array.isArray(raw.days)?raw.days:{};
 d.backlog=Array.isArray(raw.backlog)?raw.backlog:[];
 d.experiments=Array.isArray(raw.experiments)?raw.experiments:[];
 d.decisions=Array.isArray(raw.decisions)?raw.decisions:[];
 d.reviews=raw.reviews&&typeof raw.reviews==='object'&&!Array.isArray(raw.reviews)?raw.reviews:{};
 d.prefs={...d.prefs,...(raw.prefs||{})};
 d.focus=raw.focus&&typeof raw.focus==='object'?raw.focus:null;
 if(Array.isArray(raw.objectives)&&raw.objectives.length)d.objectives=raw.objectives;
 else if(raw.objective&&typeof raw.objective==='object')d.objectives=[raw.objective];
 d.objectives=d.objectives.filter(o=>o&&typeof o==='object').map(o=>{
  o.id=cleanId(o.id);o.title=String(o.title||'');o.description=String(o.description||'');o.startDate=/^\d{4}-\d{2}-\d{2}$/.test(o.startDate||'')?o.startDate:today();o.endDate=/^\d{4}-\d{2}-\d{2}$/.test(o.endDate||'')?o.endDate:plus(o.startDate,89);o.status=o.status==='archived'?'archived':'active';
  o.keyResults=Array.isArray(o.keyResults)?o.keyResults:[];
  o.keyResults=o.keyResults.filter(r=>r&&typeof r==='object').map(r=>{
   r.id=cleanId(r.id);r.title=String(r.title||'');r.start=num(r.start);r.current=num(r.current);r.target=num(r.target);r.progress=num(r.progress);r.direction=r.direction==='down'?'down':'up';r.metric=r.metric==='manual'||r.metric==='number'?r.metric:r.target!==0?'number':'manual';r.unit=String(r.unit||'');r.history=Array.isArray(r.history)?r.history:[];r.startDate=r.startDate||o.startDate;return r;
  });return o;
 });
 if(!d.objectives.length)d.objectives=initial().objectives;
 d.activeObjectiveId=d.objectives.some(o=>o.id===raw.activeObjectiveId)?raw.activeObjectiveId:d.objectives[0].id;
 for(const [k,day] of Object.entries(d.days)){
  if(!day||typeof day!=='object'){delete d.days[k];continue}
  day.goals=Array.isArray(day.goals)?day.goals:[];day.goals=day.goals.filter(g=>g&&typeof g==='object').map(g=>({id:cleanId(g.id),text:String(g.text||''),krId:typeof g.krId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(g.krId)?g.krId:'',concretization:g.concretization||'',impact:num(g.impact,3),confidence:num(g.confidence,3),minutes:num(g.minutes,60),focusMinutes:num(g.focusMinutes),done:!!g.done,completedAt:g.completedAt||null,actualImpact:g.actualImpact??'',sourceBacklogId:g.sourceBacklogId||''}));
  day.review=day.review&&typeof day.review==='object'?day.review:{};day.swot=day.swot&&typeof day.swot==='object'?day.swot:{};day.closed=!!day.closed;day.snapMeta=Array.isArray(day.snapMeta)?day.snapMeta:[];
  if(!day.snapMeta.length&&day.snap&&typeof day.snap==='object')day.snapMeta=Object.entries(day.snap).map(([id,p])=>{const r=d.objectives.flatMap(o=>o.keyResults).find(r=>r.id===id);return{id:cleanId(id),title:r?.title||'Ранее удалённый KR',progress:num(p)}});
  if(!day.snapMeta.length&&Array.isArray(day.krSnapshot))day.snapMeta=day.krSnapshot.map(s=>({id:uid(),title:String(s.title||'KR'),progress:num(s.progress)}));
 }
 d.backlog=d.backlog.map(b=>({id:cleanId(b.id),title:String(b.title||''),krId:typeof b.krId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(b.krId)?b.krId:'',concretization:b.concretization||'',impact:clamp(num(b.impact,3),1,5),confidence:clamp(num(b.confidence,3),1,5),minutes:Math.max(10,num(b.minutes,60)),status:b.status==='done'?'done':'open',createdAt:b.createdAt||today()}));
 d.experiments=d.experiments.filter(Boolean).map(e=>({id:cleanId(e.id),hypothesis:String(e.hypothesis||''),krId:typeof e.krId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(e.krId)?e.krId:'',expected:e.expected||'',deadline:e.deadline||today(),status:e.status||'running',actual:e.actual||'',learned:e.learned||'',createdAt:e.createdAt||today()}));
 d.decisions=d.decisions.filter(Boolean).map(v=>({id:cleanId(v.id),observation:String(v.observation||''),orientation:v.orientation||'',options:v.options||'',action:v.action||'',expected:v.expected||'',deadline:v.deadline||today(),reversible:v.reversible!==false,status:v.status||'open',outcome:v.outcome||'',createdAt:v.createdAt||today()}));
 if(Array.isArray(raw.tomorrowGoals)&&raw.tomorrowGoals.length){const k=plus(today(),1);const g=d.days[k]||{goals:[],review:{},swot:{},closed:false,snapMeta:[]};if(!g.goals.length)g.goals=raw.tomorrowGoals.filter(x=>x.text).slice(0,2).map(x=>({id:uid(),text:x.text,krId:x.krId||'',concretization:x.concretization||'',impact:3,confidence:3,minutes:60,focusMinutes:0,done:false,actualImpact:''}));d.days[k]=g}
 return d;
}
function save(){
 db.version=3;
 try{localStorage.setItem(STORE,JSON.stringify(db));lastSaveStatus='ok'}
 catch(err){lastSaveStatus='failed';toast('Не удалось сохранить. Проверь свободное место в браузере.');console.error(err)}
}
function load(){
 let raw=null,from='',bad=false;
 for(const k of [STORE,...OLD]){const item=localStorage.getItem(k);if(!item)continue;try{raw=JSON.parse(item);from=k;break}catch(err){bad=true;try{localStorage.setItem(k+'-damaged-'+Date.now(),item)}catch{}}}
 db=normalize(raw);save();
 if(from&&from!==STORE){try{localStorage.setItem(AUTO_BACKUP,localStorage.getItem(from))}catch{};toast('Данные прежней версии перенесены. Исходная копия сохранена.')}
 else if(bad)toast('Один из файлов данных был повреждён. Проверь резервные копии.');
 applyTheme();
}
function applyTheme(){document.documentElement.dataset.theme=db?.prefs?.theme==='light'?'light':'dark'}
function toast(msg){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toaster);toaster=setTimeout(()=>el.classList.remove('show'),3200)}
function navigate(next){tab=next;render();window.scrollTo({top:0,behavior:'instant'})}
const MENU=[['today','◈','Сегодня'],['okr','◎','Цели'],['analysis','▥','Анализ'],['evening','◑','Ритуал'],['more','☷','Ещё']];
const PAGE={today:['Сегодня','Два действия с максимальной отдачей'],okr:['Мои OKR','Стратегические цели и измеримые результаты'],analysis:['Анализ','Тренды, эффективность и прогнозы'],evening:['Ежедневный ритуал','Подведение итогов и планирование'],more:['Инструменты','Эксперименты, решения и настройки']};
function shell(){
 const nav=MENU.map(([key,icon,title])=>`<button class="nav-link ${tab===key?'active':''}" data-action="nav" data-tab="${key}" ${tab===key?'aria-current="page"':''}><span class="emoji">${icon}</span>${title}</button>`).join('');
 const mob=MENU.map(([key,icon,title])=>`<button class="${tab===key?'active':''}" data-action="nav" data-tab="${key}" ${tab===key?'aria-current="page"':''}><span class="emoji">${icon}</span><span>${title}</span></button>`).join('');
 $('#desktop-nav').innerHTML=nav;$('#mobile-nav').innerHTML=mob;$('#page-name').textContent=PAGE[tab][0];$('#page-subtitle').textContent=PAGE[tab][1];
 const needs=backupDue()||reminderDue();$('#notice-dot').style.display=needs?'block':'none';
}
const btn=(label,action,more='',cls='secondary')=>`<button class="btn ${cls}" type="button" data-action="${action}" ${more}>${label}</button>`;
const badge=(str,color='')=>`<span class="pill ${color}">${esc(str)}</span>`;
const empty=(heading,copy)=>`<div class="empty"><strong>${esc(heading)}</strong>${esc(copy)}</div>`;
const bar=(p,color='')=>`<div class="progress-track"><div class="progress-fill ${color}" style="width:${clamp(num(p),0,100)}%"></div></div>`;
const field=(label,name,value='',type='text',attrs='')=>`<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${attrs}></label>`;
const area=(label,name,value='',placeholder='')=>`<label class="field"><span>${label}</span><textarea name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
const select=(label,name,options,value='')=>`<label class="field"><span>${label}</span><select name="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const krOptions=(incEmpty=true)=>[...(incEmpty?[['','Без привязки к KR']]:[]),...allKR().map(r=>[r.id,r.title+' — '+(objectiveForKR(r.id)?.title||'Цель')])];
function render(){if(!db)return;shell();let html='';
 if(tab==='today')html=viewToday();else if(tab==='okr')html=viewOKR();else if(tab==='analysis')html=viewAnalysis();else if(tab==='evening')html=viewEvening();else html=viewMore();
 $('#app').innerHTML=html;
 updateTimerDisplay();
}
function intro(title,subtitle,buttons=''){return `<div class="page-intro"><div><div class="eyebrow">OKR DAILY / ${esc(fmt(today(),{day:'numeric',month:'long',year:'numeric'}))}</div><h1>${esc(title)}</h1>${subtitle?`<div class="subtitle">${esc(subtitle)}</div>`:''}</div>${buttons?`<div class="button-row">${buttons}</div>`:''}</div>`}
function objectiveHero(o){const p=objectivePct(o),planned=planPct(o),remaining=Math.max(0,diff(today(),o.endDate));return `<div class="hero"><div class="flex-between"><div class="hero-label">◎ ГЛАВНЫЙ OBJECTIVE</div>${badge(remaining+' дн. до дедлайна',remaining<=7?'yellow':'')}</div><h2>${esc(o.title||'Укажи свою первую стратегическую цель')}</h2><div class="hero-stat"><div class="big">${p}%</div><div class="target">План к этой дате: ${planned}%<br>Дедлайн: ${esc(fmt(o.endDate))}</div></div>${bar(p)}${!o.title?`<div style="margin-top:13px">${btn('+ Указать Objective','nav','data-tab="okr"','secondary')}</div>`:''}<div class="progress-label"><span>${o.keyResults.length} Key Results</span><span>Отклонение от плана: <b class="${p>=planned?'green':'red'}">${p-planned>0?'+':''}${p-planned} п.п.</b></span></div><div class="kpis"><div class="kpi"><strong>${o.keyResults.filter(r=>progress(r)===100).length}/${o.keyResults.length}</strong><span>Достигнутых KR</span></div><div class="kpi"><strong>${Math.max(0,diff(today(),o.endDate))}</strong><span>Дней осталось</span></div><div class="kpi"><strong>${streak()}</strong><span>Закрытых дней подряд</span></div></div></div>`}
function taskItem(g,k){const kr=findKR(g.krId),locked=!!db.days[k]?.closed;return `<div class="task ${g.done?'done':''}"><button type="button" class="task-check" data-action="toggle-task" data-id="${esc(g.id)}" data-date="${esc(k)}" ${locked?'disabled title="Закрытый день"':''} aria-label="${g.done?'Отменить':'Выполнить'} задачу">${g.done?'✓':''}</button><div class="task-body"><div class="task-title">${esc(g.text)}</div><div class="task-sub">${kr?'◎ '+esc(kr.title):'Не привязано к KR'} · ${formatN(g.minutes)} мин · +${priorityScore(g)} приоритет</div>${g.concretization?`<div class="task-note">Готово, когда: ${esc(g.concretization)}</div>`:''}${g.focusMinutes?`<div class="task-note">⏱ Фокус: ${Math.round(g.focusMinutes)} мин</div>`:''}<div class="task-actions">${!locked?`${btn('✎','edit-task',`data-id="${esc(g.id)}" data-date="${esc(k)}"`,'small muted-btn')}${btn('⏱ Фокус','open-focus',`data-id="${esc(g.id)}" data-date="${esc(k)}"`,'small muted-btn')}`:''}${g.done?badge('Сделано','green'):''}</div></div></div>`}
function backlogList(allowPlan=true){const items=db.backlog.filter(x=>x.status!=='done').sort((a,b)=>priorityScore(b)-priorityScore(a));return items.length?items.map(b=>`<div class="list-row"><div class="flex-between"><h3>${esc(b.title)}</h3>${badge(priorityScore(b)+' баллов')}</div><p>${findKR(b.krId)?'◎ '+esc(findKR(b.krId).title)+' · ':''}${formatN(b.minutes)} мин · влияние ${b.impact}/5 · уверенность ${b.confidence}/5</p>${b.concretization?`<p>Готово, когда: ${esc(b.concretization)}</p>`:''}<div class="controls">${allowPlan?`${btn('На сегодня','plan-backlog',`data-id="${b.id}" data-date="${today()}"`,'small')}${btn('На завтра','plan-backlog',`data-id="${b.id}" data-date="${plus(today(),1)}"`,'small muted-btn')}`:''}${btn('Изменить','edit-backlog',`data-id="${b.id}"`,'small secondary')}${btn('Удалить','delete-backlog',`data-id="${b.id}"`,'small danger')}</div></div>`).join(''):empty('Бэклог пуст','Сюда можно записывать действия и выбирать самые ценные по принципу 80/20.')}
function metricMini(r){const p=progress(r),f=forecast(r);return `<div class="metric"><div class="metric-top"><strong>${esc(r.title)}</strong><span>${p}%</span></div>${bar(p)}<div class="metric-meta"><span>${r.metric==='number'?`${formatN(r.current)} / ${formatN(r.target)} ${esc(r.unit)}`:'Оценочный прогресс'}</span><span class="${f.status==='late'||f.status==='stalled'?'red':''}">${esc(f.label)}</span></div></div>`}
function insightList(max=4){return insights().slice(0,max).map(t=>`<div class="insight"><span class="insight-icon">✦</span><div>${esc(t)}</div></div>`).join('')}
function backupDue(){return !db.prefs.lastBackup||diff(db.prefs.lastBackup,today())>=7}
function reminderDue(){if(!db.prefs.reminders)return false;const day=db.days[today()],a=String(db.prefs.evening||'21:00').split(':').map(Number),mins=a[0]*60+a[1];return clock()>=mins&&!day?.closed}
function viewToday(){const o=activeObjective(),k=today(),g=dayGoals(k),rate=g.length?Math.round(g.filter(x=>x.done).length/g.length*100):0;
 return intro('Работай над результатом','Выполняй самые ценные действия, а не просто задачи',btn('+ Новая задача','new-task',`data-date="${k}"`,'')+btn('Бэклог 80/20','more-backlog'))+
 (backupDue()?`<div class="notice">⚠ Пора сохранить резервную копию. Данные сейчас находятся только в этом браузере. ${btn('Сохранить JSON','backup','','small secondary')}</div>`:'')+
 `<div class="layout-2"><div class="stack">${objectiveHero(o)}<div class="card"><div class="card-head"><div><h2>Два главных действия</h2><p>Сфокусируйся на том, что сдвинет реальные метрики</p></div>${badge(g.filter(x=>x.done).length+'/'+g.length,'')}</div>${g.length?bar(rate):''}<div class="task-list" style="margin-top:14px">${g.map(x=>taskItem(x,k)).join('')||empty('Пока нет задач','Выбери одну-две задачи с максимальной ожидаемой отдачей.')}</div><div class="button-row" style="margin-top:14px">${g.length<2?btn('+ Добавить действие','new-task',`data-date="${k}"`,'secondary'):''}${btn('Выбрать из бэклога','more-backlog','','muted-btn')}</div></div><div class="card"><div class="card-head"><div><h2>Подсказки стратега</h2><p>Автоматические правила на основе фактов</p></div>${badge('LOCAL')}</div>${insightList(3)}${btn('Подготовить разбор для ИИ','ai-prompt','','secondary')}</div></div><div class="stack"><div class="card"><div class="card-head"><div><h2>Ключевые результаты</h2><p>Движение к цели важнее количества галочек</p></div>${btn('Открыть','nav',`data-tab="okr"`,'small secondary')}</div><div class="metric-list">${o.keyResults.map(metricMini).join('')||empty('Добавь KR','Без измеримых результатов невозможно оценить эффект.')}</div></div><div class="card"><div class="card-head"><div><h2>Следующее сильное действие</h2><p>Рейтинг по ожидаемому влиянию, уверенности и времени</p></div></div>${db.backlog.filter(x=>x.status==='open').sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,2).map(b=>`<div class="list-row"><h3>${esc(b.title)}</h3><p>Приоритет ${priorityScore(b)} · оценка, не гарантия результата</p><div class="controls">${btn('В план','plan-backlog',`data-id="${b.id}" data-date="${k}"`,'small secondary')}</div></div>`).join('')||empty('Пока нет кандидатов','Добавь идеи в бэклог и сравни их по отдаче.')}<div class="button-row" style="margin-top:12px">${btn('Открыть бэклог','more-backlog','','secondary')}</div></div><div class="card"><div class="card-head"><h2>Быстрый доступ</h2></div><div class="button-row">${btn('⏱ Фокус','open-focus','','secondary')}${btn('◑ Итоги дня','nav',`data-tab="evening"`,'secondary')}${btn('📈 Анализ','nav',`data-tab="analysis"`,'secondary')}</div></div></div></div>`}
function objectiveCard(o){const p=objectivePct(o),planned=planPct(o),archived=o.status==='archived';return `<article class="goal-card ${archived?'archived':''}"><div class="goal-head"><div><div class="eyebrow">${archived?'АРХИВ':'OBJECTIVE'} · ${esc(fmt(o.startDate))} — ${esc(fmt(o.endDate))}</div><h3>${esc(o.title||'Без названия')}</h3><p class="hint">${esc(o.description||'')}</p></div>${badge(p+'%')}</div>${bar(p)}${!o.title?`<div style="margin-top:13px">${btn('+ Указать Objective','nav','data-tab="okr"','secondary')}</div>`:''}<div class="progress-label"><span>План: ${planned}%</span><span>${o.keyResults.length} KR</span></div><div class="button-row" style="margin-top:14px">${btn('✎ Изменить','edit-objective',`data-id="${o.id}"`,'small secondary')}${!archived&&o.id!==db.activeObjectiveId?btn('На главный экран','activate-objective',`data-id="${o.id}"`,'small'):''}${btn(archived?'Вернуть':'Архивировать',archived?'restore-objective':'archive-objective',`data-id="${o.id}"`,'small muted-btn')}${!archived?btn('+ Key Result','new-kr',`data-id="${o.id}"`,'small secondary'):''}</div><div style="margin-top:14px">${o.keyResults.map(r=>`<div class="kr-line"><div class="metric-top"><strong>${esc(r.title)}</strong><span>${progress(r)}%</span></div><div class="meta">${r.metric==='manual'?'Ручная оценка':`${formatN(r.start)} → ${formatN(r.target)} ${esc(r.unit)} · сейчас ${formatN(r.current)}`}</div>${bar(progress(r))}<div class="metric-meta"><span>${esc(forecast(r,o).label)}</span><span>${esc(fmt(r.startDate||o.startDate))}</span></div><div class="group-actions" style="margin-top:8px">${btn('Обновить','check-kr',`data-id="${r.id}"`,'small secondary')}${btn('Настроить','edit-kr',`data-id="${r.id}"`,'small muted-btn')}${btn('График','show-kr-graph',`data-id="${r.id}"`,'small muted-btn')}</div></div>`).join('')||empty('Нет Key Results','Создай измеримые результаты — так ты узнаешь, приближаешься ли к цели.')}</div></article>`}
function viewOKR(){const active=db.objectives.filter(o=>o.status==='active'),archived=db.objectives.filter(o=>o.status==='archived');return intro('Стратегические цели','Objective — чего достичь. Key Results — как измерить успех.',btn('+ Objective','new-objective'))+
 `<div class="layout-2"><div class="stack"><div class="flex-between"><h2>Активные Objectives <span class="muted">(${active.length})</span></h2></div>${active.map(objectiveCard).join('')||empty('Активных целей нет','Создай Objective на определённый период.')}${archived.length?`<details class="details"><summary>Архивированные цели (${archived.length})</summary><div class="detail-body">${archived.map(objectiveCard).join('')}</div></details>`:''}</div><div class="stack"><div class="card"><div class="card-head"><h2>Как создать хороший OKR</h2></div><div class="timeline"><div class="timeline-item"><b>1. Результат, не действие</b><span>«Выйти на 1 млн ₸ выручки», а не «Работать над продажами».</span></div><div class="timeline-item"><b>2. Две–четыре измеримые метрики</b><span>Рост клиентов, выручки, конверсии; либо снижение издержек.</span></div><div class="timeline-item"><b>3. Старт и дедлайн</b><span>Показываем плановую траекторию и фактический прогресс.</span></div><div class="timeline-item"><b>4. Регулярные замеры</b><span>Только новые данные позволяют оценить темп и прогноз.</span></div></div></div><div class="card"><div class="card-head"><h2>Все Key Results</h2></div><div class="metric-list">${allKR().map(metricMini).join('')||empty('Не хватает измерений','Добавь хотя бы один Key Result.')}</div></div><div class="note">Поддерживаются числовые показатели роста и снижения. Ручной процент разрешён, но он субъективен и менее надёжен.</div></div></div>`}
function svgChart(r,o){const width=560,height=230,pl=42,pr=18,pt=14,pb=31,lo=o.startDate,hi=o.endDate;
 const duration=Math.max(1,diff(lo,hi)),x=k=>pl+clamp(diff(lo,k)/duration,0,1)*(width-pl-pr),y=p=>pt+(100-clamp(p,0,100))/100*(height-pt-pb);
 const actual=krPoints(r).filter(p=>p.date>=lo&&p.date<=plus(hi,1));
 const now=today();if(!actual.some(p=>p.date===now)&&diff(lo,now)>=0&&diff(now,hi)>=0)actual.push({date:now,progress:progress(r)});
 actual.sort((a,b)=>a.date.localeCompare(b.date));
 const line=actual.length>1?actual.map((p,i)=>(i?'L':'M')+x(p.date).toFixed(1)+','+y(p.progress).toFixed(1)).join(' '):'';
 const grid=[0,25,50,75,100].map(p=>`<line x1="${pl}" y1="${y(p)}" x2="${width-pr}" y2="${y(p)}" stroke="var(--stroke)" stroke-width="1"/><text x="${pl-10}" y="${y(p)+4}" fill="var(--muted)" font-size="11" text-anchor="end">${p}</text>`).join('');
 const dots=actual.map(p=>`<circle cx="${x(p.date)}" cy="${y(p.progress)}" r="5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2" class="chart-point" role="button" tabindex="0" data-action="chart-point" data-id="${esc(r.id)}" data-date="${esc(p.date)}" aria-label="Замер ${esc(fmt(p.date))}: ${Math.round(p.progress)}%"><title>${esc(fmt(p.date))}: ${Math.round(p.progress)}%</title></circle>`).join('');
 return `<div class="chart-frame"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Плановая и фактическая траектории KR">${grid}<line x1="${x(lo)}" y1="${y(0)}" x2="${x(hi)}" y2="${y(100)}" stroke="var(--yellow)" stroke-width="2" stroke-dasharray="6 6"/>${line?`<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`:''}${dots}<text x="${pl}" y="${height-6}" fill="var(--muted)" font-size="11">${esc(fmt(lo))}</text><text x="${width-pr}" y="${height-6}" text-anchor="end" fill="var(--muted)" font-size="11">${esc(fmt(hi))}</text></svg><div class="chart-legend"><span><i style="background:var(--yellow)"></i> Плановая траектория</span><span><i style="background:var(--accent)"></i> Фактические данные (${actual.length})</span></div></div>`}
function insights(){const msgs=[];const current=db.objectives.filter(o=>o.status==='active');for(const o of current){for(const r of o.keyResults){const f=forecast(r,o),p=progress(r);
 if(f.status==='late')msgs.push('Риск опоздания по «'+r.title+'»: '+f.label+'. Ускорь наиболее эффективные действия или пересмотри гипотезы.');
 if(f.status==='stalled')msgs.push('По «'+r.title+'» прирост пока не наблюдается. Проверь, действительно ли действия влияют на метрику.');
 if(f.status==='unknown'&&p+15<f.planned)msgs.push('«'+r.title+'» отстаёт от линейного плана: факт '+p+'%, план '+f.planned+'%. Сделай несколько замеров.');
 const last7=Array.from({length:7},(_,i)=>plus(today(),-i));const tasks=last7.flatMap(k=>dayGoals(k).filter(g=>g.krId===r.id));const pts=krPoints(r).filter(p=>p.date>=plus(today(),-7));
 if(tasks.filter(g=>g.done).length>=3&&pts.length>=2&&pts.at(-1).progress<=pts[0].progress+1)msgs.push('Выполнены задачи, связанные с «'+r.title+'», но измеримый результат почти не изменился. Измени стратегию, а не увеличивай число задач.');
 }}
 const repeat={};Object.entries(db.days).filter(([k,d])=>k>=plus(today(),-30)&&k<=today()).forEach(([k,d])=>{const s=[d.review?.blocker,d.swot?.w].filter(Boolean).join(';').toLowerCase().split(/[;,\n]+/).map(x=>x.trim()).filter(x=>x.length>5);s.forEach(t=>repeat[t]=(repeat[t]||0)+1)});
 const recurring=Object.entries(repeat).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,2);
 recurring.forEach(([v,n])=>msgs.push('Повторяющееся препятствие ('+n+' раз): «'+v+'». Сформулируй системное решение.'));
 const top=db.backlog.filter(b=>b.status==='open').sort((a,b)=>priorityScore(b)-priorityScore(a))[0];if(top)msgs.push('Кандидат по 80/20: «'+top.title+'» (оценочный приоритет '+priorityScore(top)+'). Сравни с альтернативами.');
 return msgs.length?msgs:['Зафиксируй два замера KR в разные дни, выполняй приоритетные задачи и проведи недельный обзор, чтобы получить выводы.'];
}
function actualEfficiency(){
 const tasks=Object.values(db.days).flatMap(d=>d.goals||[]).filter(g=>g.done&&g.actualImpact!==''&&g.actualImpact!=null&&Number.isFinite(Number(g.actualImpact)));
 const ordered=tasks.map(g=>({...g,eff:Number(g.actualImpact)/Math.max(10,num(g.minutes))})).sort((a,b)=>b.eff-a.eff);
 const n=Math.max(1,Math.ceil(ordered.length*.2)),total=ordered.reduce((s,x)=>s+Math.max(0,num(x.actualImpact)),0),top=ordered.slice(0,n).reduce((s,x)=>s+Math.max(0,num(x.actualImpact)),0);
 return{ordered,n,total,share:total?Math.round(top/total*100):null};
}
function viewAnalysis(){const ws=weekStats(weekStart(today())),eff=actualEfficiency(),active=db.objectives.filter(o=>o.status==='active');return intro('Управляй результатом','Различай занятость, выполнение задач и реальный прогресс',btn('Еженедельный обзор','weekly-review','','')+btn('Разбор с ИИ','ai-prompt','','secondary'))+
 `<div class="stat-grid"><div class="stat-box"><strong>${ws.rate==null?'—':ws.rate+'%'}</strong><span>Задач выполнено за неделю</span></div><div class="stat-box"><strong>${ws.closed}/7</strong><span>Дней с итогами</span></div><div class="stat-box"><strong>${formatN(ws.minutes)}</strong><span>Минут фокуса за неделю</span></div><div class="stat-box"><strong>${streak()}</strong><span>Серия закрытых дней</span></div></div><div class="layout-2"><div class="stack"><div class="card"><div class="card-head"><div><h2>Прогресс Key Results</h2><p>Факт по сравнению с линейной плановой траекторией</p></div></div>${active.flatMap(o=>o.keyResults.map(r=>`<div class="kr-line"><div class="flex-between"><h3>${esc(r.title)}</h3>${badge(progress(r)+'%')}</div><p class="hint" style="margin-top:5px">${esc(o.title)} · ${esc(forecast(r,o).label)}</p>${svgChart(r,o)}</div>`)).join('')||empty('Нет KR для анализа','Создай измеримый показатель и делай замеры минимум в два разных дня.')}</div><div class="card"><div class="card-head"><h2>Реальная отдача / 80:20</h2>${badge('Самооценка')}</div><div class="note">Доля результата рассчитывается только из влияния, которое ты сам указал после выполнения. Это не доказывает причинно-следственную связь и не подменяет изменения KR.</div>${eff.ordered.length?`<div class="stat-grid" style="margin-top:14px;margin-bottom:12px;grid-template-columns:1fr 1fr"><div class="stat-box"><strong>${eff.share===null?'—':eff.share+'%'}</strong><span>Доля заявленного результата от лучших 20% действий</span></div><div class="stat-box"><strong>${eff.ordered.length}</strong><span>Действий с оценкой результата</span></div></div>${eff.ordered.slice(0,6).map(g=>`<div class="list-row"><div class="flex-between"><h3>${esc(g.text)}</h3>${badge(formatN(g.actualImpact))}</div><p>Самооценка влияния за ${g.minutes} мин · ${formatN(g.eff*60)} единиц/час</p></div>`).join('')}`:empty('Пока не хватает оценок','Отмечай влияние выполненных задач, чтобы сравнивать отдачу. Основной критерий всё равно — изменения KR.')}</div></div><div class="stack"><div class="card"><div class="card-head"><h2>Стратегические сигналы</h2>${badge('Правила')}</div>${insightList(7)}</div><div class="card"><div class="card-head"><h2>Недельные решения</h2></div>${Object.entries(db.reviews).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,3).map(([k,r])=>`<div class="list-row"><strong>${esc(fmt(k))} — ${esc(fmt(plus(k,6)))}</strong><p><b>Продолжить:</b> ${esc(r.keep||'—')}</p><p><b>Прекратить:</b> ${esc(r.stop||'—')}</p><p><b>Попробовать:</b> ${esc(r.try||'—')}</p></div>`).join('')||empty('Недельных обзоров пока нет','В конце недели сравни изменения KR и зафиксируй три решения.')}<div style="margin-top:12px">${btn('Провести недельный обзор','weekly-review','','secondary')}</div></div><div class="card"><h2>Как считать результат</h2><p class="hint" style="margin-top:9px">Прогресс числового KR = (текущее − начальное) / (целевое − начальное). Для метрик снижения формула тоже работает. Прогноз строится только при наличии истории нескольких дней.</p></div></div></div>`}
function viewEvening(){const k=today(),next=plus(k,1),d=ensureDay(k),tasks=dayGoals(k),tomorrow=dayGoals(next);return intro('Вечерний ритуал','Три вопроса, новые значения KR и план на завтра',btn('Закрыть день','close-day','','success'))+
 `${d.closed?`<div class="notice">День закрыт. Чтобы исправить данные, открой его на вкладке «История».</div>`:''}<div class="layout-2"><div class="stack"><div class="card"><div class="card-head"><div><h2>1. Итоги сегодняшнего дня</h2><p>${tasks.filter(g=>g.done).length} из ${tasks.length} задач выполнено</p></div></div>${tasks.map(g=>taskItem(g,k)).join('')||empty('Задач сегодня не было','Запиши хотя бы один важный итог дня.')}</div><div class="card"><div class="card-head"><div><h2>2. Рефлексия</h2><p>Коротко и конкретно. Не обязательно заполнять четыре поля SWOT.</p></div></div><form data-form="daily-review"><input type="hidden" name="date" value="${k}">${area('Что удалось?','win',d.review.win||'','Факты, достижения, измеримые результаты')}${area('Что помешало?','blocker',d.review.blocker||'','Причина, а не оправдание')}${area('Что изменю завтра?','change',d.review.change||'','Одно практическое изменение')}<details class="details"><summary>Развернуть полный SWOT (необязательно)</summary><div class="detail-body swot-grid">${area('Сильные','s',d.swot.s||'')}${area('Слабые','w',d.swot.w||'')}${area('Возможности','o',d.swot.o||'')}${area('Угрозы','t',d.swot.t||'')}</div></details><div class="button-row" style="margin-top:12px"><button class="btn secondary" type="submit">Сохранить итоги</button></div></form></div></div><div class="stack"><div class="card"><div class="card-head"><div><h2>3. Обнови Key Results</h2><p>Внеси фактические значения, не прибавляй проценты за выполненные задачи</p></div></div><div class="metric-list">${allKR().map(r=>`<div class="metric"><div class="metric-top"><strong>${esc(r.title)}</strong>${badge(progress(r)+'%')}</div><div class="metric-meta"><span>${r.metric==='manual'?'Ручная оценка':formatN(r.current)+' / '+formatN(r.target)+' '+esc(r.unit)}</span>${btn('Обновить','check-kr',`data-id="${r.id}"`,'small secondary')}</div></div>`).join('')||empty('Нет KR','Добавь измеримые результаты на вкладке «Цели».')}</div></div><div class="card"><div class="card-head"><div><h2>4. Два действия на завтра</h2><p>${esc(fmt(next))}</p></div>${badge(tomorrow.length+'/2')}</div>${tomorrow.map(g=>taskItem(g,next)).join('')||empty('План пуст','Выбери до двух действий, связанных с результатами.')}${tomorrow.length<2?`<div class="button-row" style="margin-top:14px">${btn('+ Добавить','new-task',`data-date="${next}"`,'secondary')}${btn('Из бэклога','more-backlog','','muted-btn')}</div>`:''}</div><div class="card">${btn(d.closed?'Сохранить закрытие дня':'Закрыть день','close-day','','success full')}<p class="hint" style="margin-top:9px">При закрытии сохраняются исторические значения KR. День можно открыть повторно из истории.</p></div></div></div>`}
function viewMore(){const moreTabs=[['backlog','▤ Бэклог'],['focus','⏱ Фокус'],['experiments','⚗ Гипотезы'],['decisions','◇ Решения'],['history','▦ История'],['settings','⚙ Настройки']];return intro('Инструменты','Для продуманной работы над целями')+`<div class="tab-strip">${moreTabs.map(([key,title])=>`<button class="${subtab===key?'active':''}" type="button" data-action="more-tab" data-tab="${key}">${title}</button>`).join('')}</div>`+({backlog:viewBacklog,focus:viewFocus,experiments:viewExperiments,decisions:viewDecisions,history:viewHistory,settings:viewSettings}[subtab]||viewBacklog)()}
function viewBacklog(){const items=db.backlog.filter(b=>b.status==='open');return `<div class="layout-2"><div class="card"><div class="card-head"><div><h2>Бэклог с оценкой 80/20</h2><p>Из списка идей на каждый день выбирай до двух действий</p></div>${btn('+ Идея','new-backlog')}</div>${backlogList()}</div><div class="stack"><div class="card"><h2>Формула предварительного приоритета</h2><div class="note" style="margin-top:12px">Ожидаемое влияние (1–5) × уверенность (1–5) ÷ время (в часах).</div><p class="hint" style="margin-top:12px">Это способ сравнить предположения, а не объективная оценка прибыли. После выполнения сравни прогноз с фактическим изменением KR.</p></div><div class="card"><h2>Сравнение</h2>${items.sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,5).map((b,i)=>`<div class="list-row"><div class="flex-between"><span>${i+1}. ${esc(b.title)}</span>${badge(priorityScore(b)+'')}</div></div>`).join('')||empty('Добавь действия','Появится рейтинг самых перспективных.')}</div></div></div>`}
function focusRemaining(){const f=db.focus;if(!f)return 0;const elapsed=f.running&&f.startedAt?Math.max(0,(Date.now()-f.startedAt)/60000):0;return Math.max(0,(f.remaining??f.duration)-elapsed)*60}
function focusClock(){const seconds=Math.ceil(focusRemaining());return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function currentFocusGoal(){if(!db.focus?.goalId)return null;return dayGoals(db.focus.goalDate||today()).find(g=>g.id===db.focus.goalId)}
function viewFocus(){const f=db.focus,opts=dayGoals(today()).filter(g=>!g.done&&!db.days[today()]?.closed);return `<div class="layout-2"><div class="card"><div class="card-head"><h2>Режим глубокой работы</h2>${badge(f?.running?'В процессе':f?'На паузе':'Готов')}</div><div class="timer-ring"><div><div class="timer-clock" id="focus-clock">${f?focusClock():'25:00'}</div><div class="timer-status">${f?(currentFocusGoal()?esc(currentFocusGoal().text):'Свободный фокус'):'Сессия без отвлечений'}</div></div></div><div class="button-row" style="justify-content:center;margin-top:25px">${!f?`${btn('25 минут','start-focus',`data-duration="25"`,'')}${btn('50 минут','start-focus',`data-duration="50"`,'secondary')}`:f.running?`${btn('Пауза','pause-focus','','secondary')}${btn('Завершить и записать','finish-focus','','success')}${btn('Отменить','cancel-focus','','danger')}`:`${btn('Продолжить','resume-focus','','')}${btn('Завершить и записать','finish-focus','','success')}${btn('Отменить','cancel-focus','','danger')}`}</div>${!f?`<div class="divider"></div>${select('Для какой задачи?','focusTarget',[['','Без привязки'],...opts.map(g=>[g.id,g.text])],'',)}<div class="hint">Время сохраняется после завершения сессии, даже если она частичная. Если закрыть приложение, таймер восстановит оставшееся время по часам устройства.</div>`:''}</div><div class="stack"><div class="card"><h2>Почему фокус важен</h2><p class="hint" style="margin-top:9px">Сравнивай затраченное время с прогрессом KR. Отработанные часы сами по себе не равны результату.</p></div><div class="card"><h2>Фокус за 7 дней</h2><div class="stat-box" style="margin-top:12px"><strong>${Math.round(weekStats(weekStart(today())).minutes)} мин</strong><span>Зарегистрировано на задачах</span></div></div></div></div>`}
function viewExperiments(){return `<div class="layout-2"><div class="card"><div class="card-head"><div><h2>Гипотезы и эксперименты</h2><p>Тестируй идеи, фиксируй прогнозы и результаты</p></div>${btn('+ Эксперимент','new-experiment')}</div>${db.experiments.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(e=>`<div class="list-row"><div class="flex-between"><h3>${esc(e.hypothesis)}</h3>${badge(({running:'В процессе',success:'Подтверждена',failed:'Не подтверждена',stopped:'Остановлена'})[e.status]||e.status,e.status==='success'?'green':e.status==='failed'?'red':'')}</div><p>До ${esc(fmt(e.deadline))} · ${findKR(e.krId)?'KR: '+esc(findKR(e.krId).title):'Без привязки'}</p><p>Ожидание: ${esc(e.expected||'—')}</p>${e.actual?`<p>Факт: ${esc(e.actual)}</p>`:''}${e.learned?`<p>Вывод: ${esc(e.learned)}</p>`:''}<div class="controls">${btn('Записать результат','edit-experiment',`data-id="${e.id}"`,'small secondary')}${btn('Удалить','delete-experiment',`data-id="${e.id}"`,'small danger')}</div></div>`).join('')||empty('Пока нет гипотез','Например: «Если отправлять 10 предложений в неделю, число заявок вырастет на 5».')}</div><div class="stack"><div class="card"><h2>Процесс эксперимента</h2><div class="timeline" style="margin-top:14px"><div class="timeline-item"><b>Гипотеза</b><span>Что меняешь и почему?</span></div><div class="timeline-item"><b>Ожидаемый эффект</b><span>Какая метрика и насколько изменится?</span></div><div class="timeline-item"><b>Срок проверки</b><span>Когда измерить?</span></div><div class="timeline-item"><b>Вердикт</b><span>Повторить, изменить или прекратить?</span></div></div></div></div></div>`}
function viewDecisions(){return `<div class="layout-2"><div class="card"><div class="card-head"><div><h2>Журнал решений OODA</h2><p>Наблюдение → ориентация → решение → действие → проверка</p></div>${btn('+ Решение','new-decision')}</div>${db.decisions.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(d=>`<div class="list-row"><div class="flex-between"><h3>${esc(d.action||d.observation)}</h3>${badge(d.status==='done'?'Проверено':'Ожидает проверки',d.status==='done'?'green':'')}</div><p>${esc(fmt(d.createdAt))} · ${d.reversible?'Обратимое решение':'Труднообратимое решение'} · проверка ${esc(fmt(d.deadline))}</p><p><b>Наблюдение:</b> ${esc(d.observation)}</p><p><b>Ожидание:</b> ${esc(d.expected||'—')}</p>${d.outcome?`<p><b>Итог:</b> ${esc(d.outcome)}</p>`:''}<div class="controls">${btn('Открыть / проверить','edit-decision',`data-id="${d.id}"`,'small secondary')}${btn('Удалить','delete-decision',`data-id="${d.id}"`,'small danger')}</div></div>`).join('')||empty('Решений пока нет','Записывай важные решения и возвращайся к ним после результата.')}</div><div class="card"><h2>OODA без лишней бюрократии</h2><p class="hint" style="margin-top:12px">Фиксируй факты отдельно от предположений. Решение без проверки результата не создаёт обратной связи. Для обратимых решений ставь короткий срок проверки.</p></div></div>`}
let historyDate=null;
function viewHistory(){if(historyDate){const k=historyDate,d=db.days[k],s=d?.snapMeta||[];if(!d)return empty('Не найдено','Записи для этого дня не существует.');return `<div class="stack"><div class="button-row">${btn('← К списку','history-back','','secondary')}${d.closed?btn('Открыть день для правок','reopen-day',`data-date="${esc(k)}"`,'secondary'):btn('Закрыть день с обновлённым снимком','close-history-day',`data-date="${esc(k)}"`,'success')}${btn('Удалить день','delete-day',`data-date="${esc(k)}"`,'danger')}</div><div class="card"><div class="card-head"><h2>${esc(fmt(k,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</h2>${badge(d.closed?'Закрыт':'Не закрыт',d.closed?'green':'yellow')}</div>${d.goals.map(g=>taskItem(g,k)).join('')||empty('Нет задач','')}</div><div class="layout-2"><div class="card"><h2>Снимок KR на конец дня</h2>${s.map(r=>`<div class="list-row"><div class="flex-between"><h3>${esc(r.title)}</h3>${badge(num(r.progress)+'%')}</div><p>${r.current===undefined?'':formatN(r.current)+' из '+formatN(r.target)+' '+esc(r.unit||'')}</p></div>`).join('')||(d.snap?Object.entries(d.snap).map(([id,p])=>`<div class="list-row"><strong>${esc(findKR(id)?.title||'Удалённый KR')}</strong> — ${num(p)}%</div>`).join(''):empty('Снимка нет','Запись создана до обновления или день не закрывался.'))}</div><div class="card"><h2>Итоги</h2>${[['Получилось',d.review?.win],['Помешало',d.review?.blocker],['Изменить',d.review?.change],['SWOT — сильные',d.swot?.s],['SWOT — слабые',d.swot?.w],['SWOT — возможности',d.swot?.o],['SWOT — угрозы',d.swot?.t]].map(([label,value])=>value?`<div class="list-row"><b>${label}</b><p>${esc(value)}</p></div>`:'').join('')||empty('Итогов нет','')}</div></div></div>`}
 const keys=Object.keys(db.days).filter(k=>{const d=db.days[k];return d.closed||d.goals?.length||Object.values(d.review||{}).some(Boolean)||Object.values(d.swot||{}).some(Boolean)}).sort().reverse();return `<div class="card"><div class="card-head"><h2>История дней</h2>${badge(keys.length+' записей')}</div>${keys.map(k=>{const d=db.days[k],done=d.goals.filter(g=>g.done).length;return `<button type="button" class="nav-link" style="border-bottom:1px solid var(--stroke2);border-radius:0;padding:15px 2px" data-action="history-open" data-date="${esc(k)}"><span style="flex:1"><b>${esc(fmt(k,{weekday:'short',day:'numeric',month:'long'}))}</b><br><small class="muted">${done}/${d.goals.length} задач · ${d.closed?'закрыт':'не закрыт'}</small></span><span>›</span></button>`}).join('')||empty('История пуста','После первого вечернего обзора появятся записи.')}</div>`}
function viewSettings(){return `<div class="layout-2"><div class="stack"><div class="card"><div class="card-head"><h2>Оформление и напоминания</h2></div><form data-form="settings">${select('Тема','theme',[['dark','Тёмная'],['light','Светлая']],db.prefs.theme)}${field('Утренний ритуал','morning',db.prefs.morning,'time')}${field('Вечерний ритуал','evening',db.prefs.evening,'time')}<label class="checkline"><input type="checkbox" name="reminders" ${db.prefs.reminders?'checked':''}> Напоминать, когда приложение открыто</label><div class="notice">Настоящие push-уведомления в фоне требуют отдельного сервера и подписки. В текущей локальной версии напоминания показываются при открытом приложении.</div><button class="btn" type="submit">Сохранить настройки</button></form></div><div class="card"><div class="card-head"><h2>Безопасность данных</h2></div><p class="hint">Данные сохраняются только в этом браузере. Резервная копия нужна для переноса на другое устройство или восстановления после очистки сайта.</p><p class="hint" style="margin:10px 0">Последний экспорт: ${db.prefs.lastBackup?esc(fmt(db.prefs.lastBackup)):'никогда'}</p><div class="button-row">${btn('↓ Скачать резервную копию','backup','','')}${btn('↑ Импортировать JSON','import-file','','secondary')}</div><input type="file" id="import-file-input" accept="application/json,.json" style="display:none"><div class="divider"></div><p class="hint">Старые данные v1/v2 переносятся автоматически при первом запуске. Исходный ключ не удаляется. Импорт можно выполнить из резервного файла.</p></div></div><div class="stack"><div class="card"><h2>ИИ-стратег</h2><p class="hint" style="margin:10px 0">Локальные рекомендации создаются правилами из твоих данных. Для полноценного анализа ИИ подготовь структурированный запрос и вставь его в ChatGPT. Данные автоматически никуда не отправляются.</p>${btn('Скопировать запрос для ИИ','ai-prompt','','secondary')}</div><div class="card"><h2>Синхронизация</h2><div class="notice" style="margin-top:12px">Облако пока не подключено. Без сервера и авторизации нельзя безопасно обещать автоматическую синхронизацию.</div><p class="hint">Пока можно переносить файл JSON вручную: экспорт на одном устройстве → импорт на другом. При импорте данные заменяются после подтверждения.</p></div><div class="card"><h2>Сброс и восстановление</h2><p class="hint" style="margin:9px 0">При любых проблемах сначала сохрани JSON. Внутренняя аварийная копия предыдущей версии также остаётся в браузере, если была миграция.</p><div class="button-row">${btn('Скачать копию','backup','','secondary')}${btn('Стереть данные v3','reset-data','','danger')}</div></div></div></div>`}
function backupData(){const json=JSON.stringify(db,null,2),name='okr-daily-backup-'+today()+'.json';const blob=new Blob([json],{type:'application/json'});const file=new File([blob],name,{type:'application/json'});
 const finalize=()=>{db.prefs.lastBackup=today();save();toast('Резервная копия подготовлена');render()};
 if(navigator.canShare&&navigator.canShare({files:[file]}))navigator.share({files:[file]}).then(finalize).catch(()=>{});
 else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);finalize()}
}
function aiPrompt(){const lines=['Ты — требовательный стратег по OKR и принципу 80/20. Проверяй данные, не путай выполнение задач с достижением целей. Не делай неподтверждённых выводов.','Сформулируй три конкретных изменения стратегии, выдели бесполезную активность, предложи эксперимент на 7 дней.','Дата: '+today(),'ОБЪЕКТИВЫ И РЕЗУЛЬТАТЫ'];
 db.objectives.filter(o=>o.status==='active').forEach(o=>{lines.push('Objective: '+o.title+' ('+o.startDate+'—'+o.endDate+')');o.keyResults.forEach(r=>lines.push('  KR: '+r.title+'; метрика: '+r.metric+'; старт '+r.start+'; факт '+r.current+'; план '+r.target+' '+r.unit+'; прогресс '+progress(r)+'%; '+forecast(r,o).label))});
 lines.push('ПОСЛЕДНИЕ 14 ДНЕЙ');for(let i=13;i>=0;i--){const k=plus(today(),-i),d=db.days[k];if(!d)continue;lines.push(k+': '+d.goals.filter(g=>g.done).length+'/'+d.goals.length+' задач; '+d.goals.map(g=>(g.done?'✓ ':'× ')+g.text).join('; ')+'; помешало: '+(d.review?.blocker||d.swot?.w||'—')+'; изменить: '+(d.review?.change||'—'))}
 lines.push('ЭКСПЕРИМЕНТЫ');db.experiments.slice(-6).forEach(e=>lines.push(e.hypothesis+'; ожидается '+e.expected+'; факт '+e.actual+'; вывод '+e.learned));
 lines.push('ПРАВИЛА: 1) Отдели факты от гипотез. 2) Назови приоритет по ожидаемой отдаче. 3) Для каждого совета укажи KR и проверку через 7 дней.');return lines.join('\n')}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Скопировано — можешь вставить в ChatGPT')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch{}ta.remove();toast(ok?'Скопировано':'Автокопирование недоступно. Открой запрос для копирования вручную.');if(!ok)openModal('Запрос для ИИ',`<div class="field">${area('Скопируй весь текст','prompt',text)}</div>`,'',false)}}
function reminderText(){const k=today(),d=db.days[k]||{},morning=String(db.prefs.morning||'08:00').split(':').map(Number),evening=String(db.prefs.evening||'21:00').split(':').map(Number);const t=clock();
 if(t>=evening[0]*60+evening[1]&&!d.closed)return'Время вечернего ритуала: зафиксируй измеримые результаты и план на завтра.';
 if(t>=morning[0]*60+morning[1]&&dayGoals(k).length===0)return'Запланируй до двух важных действий на сегодня.';
 return'';
}
function maybeRemind(){if(!db?.prefs?.reminders)return;const msg=reminderText(),tag=today()+'-'+(clock()<15*60?'morning':'evening');if(msg&&noticeShown!==tag){noticeShown=tag;toast(msg)}}
function openModal(title,inner,footer='',withForm=false){const dialog=$('#modal');$('#modal-inner').innerHTML=`<div class="modal-content"><div class="modal-header"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-action="modal-close" aria-label="Закрыть">×</button></div>${inner}${footer}</div>`;if(!dialog.open)dialog.showModal()}
function modalForm(kind,id='',attrs='',fields='',label='Сохранить'){
 const titles={objective:id?'Изменить Objective':'Новая Objective',kr:id?'Настроить Key Result':'Новый Key Result',checkkr:'Обновить результат',task:id?'Редактировать действие':'Новое действие',backlog:id?'Изменить идею':'Новая идея',experiment:id?'Результат эксперимента':'Новый эксперимент',decision:id?'Проверить решение':'Новое решение',weekly:'Еженедельный обзор'};
 openModal(titles[kind]||'Редактирование',`<form data-form="${kind}" ${attrs}><input type="hidden" name="id" value="${esc(id)}">${fields}<div class="modal-footer">${btn('Отмена','modal-close','','secondary')}<button class="btn" type="submit">${esc(label)}</button></div></form>`);
}
function openEditor(kind,id='',extra=''){
 let e=null,fields='',attrs='',label='Сохранить';
 if(kind==='objective'){
  e=db.objectives.find(x=>x.id===id)||{title:'',description:'',startDate:today(),endDate:plus(today(),89)};
  fields=field('Название Objective','title',e.title,'text','maxlength="140" required placeholder="Например, увеличить месячную выручку"')+area('Описание / зачем это нужно','description',e.description)+`<div class="form-grid">${field('Начало','startDate',e.startDate,'date','required')}${field('Дедлайн','endDate',e.endDate,'date','required')}</div>`;
 }
 else if(kind==='kr'){
  e=findKR(id)||{title:'',metric:'number',start:0,current:0,target:100,unit:'',progress:0};
  const parent=id?objectiveForKR(id)?.id:extra;
  fields=`<input type="hidden" name="objectiveId" value="${esc(parent)}">`+field('Какой результат измеряем?','title',e.title,'text','required maxlength="160" placeholder="Например, увеличить число клиентов до 50"')+select('Тип метрики','metric',[['number','Числовая — надёжнее'],['manual','Процент вручную (субъективно)']],e.metric)+`<div class="form-grid three">${field('Старт','start',e.start,'number','step="any"')}${field('Сейчас','current',e.current,'number','step="any"')}${field('Цель','target',e.target,'number','step="any"')}</div><div class="form-grid">${field('Единица','unit',e.unit,'text','placeholder="₸, клиенты, %..."')}${field('Ручной прогресс, %','progress',e.progress,'number','min="0" max="100" step="1"')}</div><div class="note">Для снижения показателя укажи цель меньше старта — формула посчитает корректно. При ручном типе используется поле процента.</div>`+(id?`<div class="button-row" style="margin-top:14px">${btn('Удалить KR','delete-kr',`data-id="${esc(id)}"`,'danger small')}</div>`:'');
 }
 else if(kind==='checkkr'){
  e=findKR(id);if(!e)return;
  fields=`<h3 style="margin-bottom:12px">${esc(e.title)}</h3>`+(e.metric==='manual'?field('Прогресс в процентах','progress',e.progress,'number','min="0" max="100" step="1" required'):field(`Текущее значение ${esc(e.unit)}`,'current',e.current,'number','step="any" required'))+`<div class="hint">Замер будет записан в историю с сегодняшней датой. Сохрани только реальное значение.</div>`;
  label='Сохранить замер';
 }
 else if(kind==='task'){
  const k=extra||today();e=dayGoals(k).find(g=>g.id===id)||{text:'',krId:'',concretization:'',minutes:60,impact:3,confidence:3,actualImpact:''};
  attrs=`data-date="${esc(k)}"`;fields=field('Что конкретно сделаю?','text',e.text,'text','required maxlength="200" placeholder="Действие, которое приближает KR"')+select('Связанный Key Result','krId',krOptions(),e.krId)+field('Готово, когда...','concretization',e.concretization,'text','placeholder="Измеримый критерий завершения"')+`<div class="form-grid three">${field('Влияние (1–5)','impact',e.impact,'number','min="1" max="5"')}${field('Уверенность (1–5)','confidence',e.confidence,'number','min="1" max="5"')}${field('Минут','minutes',e.minutes,'number','min="10" max="1440" step="5"')}</div>`+field('Оценка результата (0–5, после выполнения)','actualImpact',e.actualImpact,'number','min="0" max="5" step="0.5" placeholder="Необязательно"')+(id?`${btn('Удалить задачу','delete-task',`data-id="${esc(id)}" data-date="${esc(k)}"`,'danger small')}`:'');
 }
 else if(kind==='backlog'){
  e=db.backlog.find(b=>b.id===id)||{title:'',krId:'',concretization:'',impact:3,confidence:3,minutes:60};
  fields=field('Идея / возможное действие','title',e.title,'text','required maxlength="200"')+select('Связанный Key Result','krId',krOptions(),e.krId)+field('Критерий завершения','concretization',e.concretization)+`<div class="form-grid three">${field('Влияние (1–5)','impact',e.impact,'number','min="1" max="5" required')}${field('Уверенность (1–5)','confidence',e.confidence,'number','min="1" max="5" required')}${field('Минут','minutes',e.minutes,'number','min="10" max="1440" required')}</div><p class="hint">Рейтинг гипотетический: влияние × уверенность / часы. Пересматривай его после результатов.</p>`;
 }
 else if(kind==='experiment'){
  e=db.experiments.find(x=>x.id===id)||{hypothesis:'',krId:'',expected:'',deadline:plus(today(),7),status:'running',actual:'',learned:''};
  fields=area('Гипотеза: если X, то Y','hypothesis',e.hypothesis,'Например, если прозвонить 30 клиентов, получу 5 заказов')+select('Какой KR проверяем?','krId',krOptions(),e.krId)+field('Ожидаемое изменение метрики','expected',e.expected,'text','placeholder="+5 заявок за 7 дней"')+field('Дата проверки','deadline',e.deadline,'date','required')+select('Статус','status',[['running','Проверяю'],['success','Подтверждена'],['failed','Не подтверждена'],['stopped','Остановлена']],e.status)+area('Фактический результат','actual',e.actual)+area('Вывод / что поменять','learned',e.learned);
 }
 else if(kind==='decision'){
  e=db.decisions.find(x=>x.id===id)||{observation:'',orientation:'',options:'',action:'',expected:'',deadline:plus(today(),7),reversible:true,status:'open',outcome:''};
  fields=area('Наблюдение — проверенные факты','observation',e.observation,'Что произошло?')+area('Ориентация — гипотезы и риски','orientation',e.orientation,'Что может значить это событие?')+area('Какие есть альтернативы?','options',e.options)+area('Какое действие выбираю?','action',e.action)+area('Ожидаемый эффект','expected',e.expected)+field('Когда проверить','deadline',e.deadline,'date','required')+`<label class="checkline"><input type="checkbox" name="reversible" ${e.reversible?'checked':''}> Решение обратимое (можно откатить)</label>`+select('Статус','status',[['open','Ожидает проверки'],['done','Проверено']],e.status)+area('Что произошло на самом деле?','outcome',e.outcome);
 }
 else if(kind==='weekly'){
  const k=weekStart(today()),r=db.reviews[k]||{},w=weekStats(k);
  attrs=`data-date="${esc(k)}"`;fields=`<div class="note" style="margin-bottom:14px">${esc(fmt(k))} — ${esc(fmt(plus(k,6)))} · ${w.done}/${w.total} выполненных задач · ${w.closed} закрытых дней · ${w.minutes} мин фокуса</div>`+
  `<div class="metric-list" style="margin-bottom:14px">${db.objectives.filter(o=>o.status==='active').flatMap(o=>o.keyResults.map(kr=>`<div class="metric"><div class="metric-top"><strong>${esc(kr.title)}</strong>${badge(progress(kr)+'%')}</div><div class="metric-meta"><span>План ${planPct(o)}%</span><span>${esc(forecast(kr,o).label)}</span></div></div>`)).join('')}</div>`+
  area('Что улучшилось в KR и почему?','wins',r.wins||'')+area('Что помешало росту метрик?','blocked',r.blocked||'')+area('Продолжить','keep',r.keep||'')+area('Перестать делать','stop',r.stop||'')+area('Попробовать в следующую неделю','try',r.try||'');
 }
 modalForm(kind,id,attrs,fields,label);
}
function snapshot(k){const d=ensureDay(k);d.snap={};d.snapMeta=allKR().map(r=>{const v={id:r.id,title:r.title,progress:progress(r),current:num(r.current),start:num(r.start),target:num(r.target),unit:r.unit};d.snap[r.id]=v.progress;return v})}
function closeDay(k=today()){const d=ensureDay(k),next=ensureDay(plus(k,1));next.goals=next.goals.filter(g=>g.text.trim());
 if(k===today()&&next.goals.find(g=>!g.krId)&&allKR().length){toast('Привяжи завтрашние задачи к Key Results');return}
 if(!d.goals.some(g=>g.text.trim())&&!Object.values(d.review||{}).some(v=>String(v).trim())&&!Object.values(d.swot||{}).some(v=>String(v).trim())){toast('Сначала добавь действие или короткий итог дня');return}
 d.closed=true;d.closedAt=new Date().toISOString();snapshot(k);if(k===today())allKR().forEach(r=>recordKR(r,k));save();render();toast('День закрыт — сохранён снимок KR');
}
function focusStart(duration){if(db.focus){toast('Сначала заверши текущую сессию');return}const selected=$('select[name=focusTarget]')?.value||'';db.focus={duration,remaining:duration,running:true,startedAt:Date.now(),goalId:selected,goalDate:today()};save();render()}
function focusPause(){const f=db.focus;if(!f||!f.running)return;f.remaining=focusRemaining()/60;f.running=false;f.startedAt=null;save();render()}
function focusResume(){const f=db.focus;if(!f)return;f.running=true;f.startedAt=Date.now();save();render()}
function focusCancel(){if(!db.focus)return;if(confirm('Отменить сессию фокуса без записи времени?')){db.focus=null;save();render()}}
function focusFinish(){const f=db.focus;if(!f)return;const elapsed=f.duration-focusRemaining()/60;const minutes=clamp(Math.round(elapsed),0,f.duration);if(!minutes){toast('Сессия ещё не началась');return}const g=currentFocusGoal();if(g)g.focusMinutes=num(g.focusMinutes)+minutes;db.focus=null;save();render();toast('Записано: '+minutes+' мин'+(g?' к задаче':' без задачи'))}
function updateTimerDisplay(){const el=$('#focus-clock');if(el)el.textContent=db.focus?focusClock():'25:00';if(db.focus&&focusRemaining()<=0&&db.focus.running){db.focus.running=false;db.focus.remaining=0;db.focus.startedAt=null;save();if(el)el.textContent='00:00';const tag='focus-done-'+today();if(noticeShown!==tag){noticeShown=tag;toast('Сессия завершена. Нажми «Завершить и записать».')}}}
function handleAction(btn){const a=btn.dataset.action,id=btn.dataset.id||'',k=btn.dataset.date||today();
 switch(a){
  case'nav':navigate(btn.dataset.tab);break;
  case'more-tab':subtab=btn.dataset.tab;historyDate=null;render();break;
  case'more-backlog':tab='more';subtab='backlog';render();scrollTo(0,0);break;
  case'toggle-theme':db.prefs.theme=db.prefs.theme==='light'?'dark':'light';applyTheme();save();render();break;
  case'open-notices':openModal('Напоминания',`<div class="note">${esc(reminderText()||'Сейчас нет срочных ритуалов.')}</div>${backupDue()?`<div class="notice" style="margin-top:12px">Рекомендуем сделать резервную копию.</div><div style="margin-top:10px">${btn('Сохранить копию','backup')}</div>`:''}<p class="hint" style="margin-top:12px">Автоматических push-уведомлений в фоне нет.</p>`);break;
  case'modal-close':$('#modal').close();break;
  case'new-objective':openEditor('objective');break;
  case'edit-objective':openEditor('objective',id);break;
  case'activate-objective':db.activeObjectiveId=id;save();render();toast('Главная цель изменена');break;
  case'archive-objective':{const o=db.objectives.find(o=>o.id===id);if(!o)return;if(!confirm('Переместить Objective в архив? Данные останутся.'))return;o.status='archived';const next=db.objectives.find(o=>o.status==='active');if(next)db.activeObjectiveId=next.id;save();render();break}
  case'restore-objective':{const o=db.objectives.find(o=>o.id===id);if(!o)return;o.status='active';save();render();break}
  case'new-kr':openEditor('kr','',id);break;
  case'edit-kr':openEditor('kr',id);break;
  case'check-kr':openEditor('checkkr',id);break;
  case'chart-point':{const r=findKR(id),pt=r&&krPoints(r).find(x=>x.date===k);if(!pt)return;openModal('Замер Key Result',`<h3>${esc(r.title)}</h3><div class="stat-box" style="margin-top:12px"><strong>${pt.progress}%</strong><span>${esc(fmt(pt.date,{day:'numeric',month:'long',year:'numeric'}))} · план к дате ${planPct(objectiveForKR(id),pt.date)}%</span></div>`);break}
  case'show-kr-graph':{const r=findKR(id);if(!r)return;openModal('Динамика KR',`<h3>${esc(r.title)}</h3>${svgChart(r,objectiveForKR(id))}<p class="hint" style="margin-top:12px">${esc(forecast(r).label)}. Прогноз оценочный, основан на последних замерах.</p>`);break}
  case'delete-kr':{const r=findKR(id);if(!r||!confirm('Удалить Key Result? Исторические снимки его имени и значений сохранятся.'))return;const o=objectiveForKR(id);o.keyResults=o.keyResults.filter(x=>x.id!==id);save();$('#modal').close();render();break}
  case'new-task':if(dayGoals(k).length>=2){toast('На день допускается максимум два действия');return}if(db.days[k]?.closed){toast('Сначала открой день для правок');return}openEditor('task','',k);break;
  case'edit-task':if(db.days[k]?.closed){toast('Сначала открой день для правок');return}openEditor('task',id,k);break;
  case'toggle-task':{const d=ensureDay(k),g=d.goals.find(g=>g.id===id);if(!g)return;if(d.closed){toast('День закрыт. Открой его из истории');return}g.done=!g.done;g.completedAt=g.done?new Date().toISOString():null;save();render();if(g.done&&g.actualImpact==='')toast('Задача выполнена. При желании оцени фактическую отдачу через ✎');break}
  case'delete-task':{const d=ensureDay(k);if(d.closed)return;if(!confirm('Удалить действие?'))return;d.goals=d.goals.filter(g=>g.id!==id);save();$('#modal').close();render();break}
  case'new-backlog':openEditor('backlog');break;
  case'edit-backlog':openEditor('backlog',id);break;
  case'delete-backlog':if(!confirm('Удалить идею из бэклога?'))return;db.backlog=db.backlog.filter(b=>b.id!==id);save();render();break;
  case'plan-backlog':{const b=db.backlog.find(b=>b.id===id);if(!b)return;const d=ensureDay(k);if(d.closed){toast('Нельзя менять закрытый день');return}if(d.goals.length>=2){toast('В плане уже два действия');return}d.goals.push({id:uid(),text:b.title,krId:b.krId,concretization:b.concretization,minutes:b.minutes,impact:b.impact,confidence:b.confidence,done:false,focusMinutes:0,actualImpact:'',sourceBacklogId:b.id});b.status='done';save();render();toast('Действие добавлено в план');break}
  case'close-day':closeDay();break;
  case'new-experiment':openEditor('experiment');break;
  case'edit-experiment':openEditor('experiment',id);break;
  case'delete-experiment':if(!confirm('Удалить эксперимент?'))return;db.experiments=db.experiments.filter(e=>e.id!==id);save();render();break;
  case'new-decision':openEditor('decision');break;
  case'edit-decision':openEditor('decision',id);break;
  case'delete-decision':if(!confirm('Удалить решение?'))return;db.decisions=db.decisions.filter(e=>e.id!==id);save();render();break;
  case'weekly-review':openEditor('weekly');break;
  case'open-focus':{tab='more';subtab='focus';render();if(id&&$('[name=focusTarget]'))$('[name=focusTarget]').value=id;scrollTo(0,0);break}
  case'start-focus':focusStart(num(btn.dataset.duration,25));break;
  case'pause-focus':focusPause();break;
  case'resume-focus':focusResume();break;
  case'finish-focus':focusFinish();break;
  case'cancel-focus':focusCancel();break;
  case'history-open':historyDate=k;render();scrollTo(0,0);break;
  case'history-back':historyDate=null;render();break;
  case'reopen-day':{if(!confirm('Открыть день для правок? Сохранённый снимок KR останется до повторного закрытия.'))return;ensureDay(k).closed=false;save();render();break}
  case'close-history-day':closeDay(k);break;
  case'delete-day':if(!confirm('Удалить день и его задачи без возможности отмены?'))return;delete db.days[k];historyDate=null;save();render();break;
  case'backup':backupData();break;
  case'import-file':$('#import-file-input')?.click();break;
  case'ai-prompt':copyText(aiPrompt());break;
  case'reset-data':if(!confirm('ВНИМАНИЕ! Стереть данные этой версии? Сначала сохрани резервную копию.'))return;if(!confirm('Точно стереть все OKR, дни, эксперименты и решения?'))return;try{localStorage.setItem(AUTO_BACKUP,JSON.stringify(db))}catch{};db=normalize(initial());save();render();toast('Данные очищены. Аварийная копия сохранена в браузере.');break;
 }
}
function fromFD(fd,key,fallback=''){return String(fd.get(key)??fallback).trim()}
function readForm(form){const fd=new FormData(form),kind=form.dataset.form,id=fromFD(fd,'id'),k=form.dataset.date||today();let item;
 if(kind==='daily-review'){
  if(ensureDay(k).closed){toast('Сначала открой день для изменений');return false}
  const d=ensureDay(k);d.review={win:fromFD(fd,'win'),blocker:fromFD(fd,'blocker'),change:fromFD(fd,'change')};d.swot={s:fromFD(fd,'s'),w:fromFD(fd,'w'),o:fromFD(fd,'o'),t:fromFD(fd,'t')};
 }else if(kind==='settings'){
  db.prefs.theme=fromFD(fd,'theme')==='light'?'light':'dark';db.prefs.morning=fromFD(fd,'morning','08:00');db.prefs.evening=fromFD(fd,'evening','21:00');db.prefs.reminders=fd.has('reminders');applyTheme();
 }else if(kind==='objective'){
  const startDate=fromFD(fd,'startDate'),endDate=fromFD(fd,'endDate');if(endDate<startDate){toast('Дедлайн не может быть раньше даты начала');return false}
  item=db.objectives.find(o=>o.id===id);if(!item){item={id:uid(),status:'active',keyResults:[]};db.objectives.push(item);if(db.objectives.filter(o=>o.status==='active').length===1)db.activeObjectiveId=item.id}
  Object.assign(item,{title:fromFD(fd,'title'),description:fromFD(fd,'description'),startDate,endDate});
  item.keyResults.forEach(r=>{if(!(r.history||[]).length)r.startDate=startDate});
 }else if(kind==='kr'){
  const parent=db.objectives.find(o=>o.id===fromFD(fd,'objectiveId'));if(!parent){toast('Objective не найден');return false}
  const start=num(fd.get('start')),target=num(fd.get('target'));
  const metric=fromFD(fd,'metric')==='manual'?'manual':'number';
  if(metric==='number'&&start===target){toast('У числового KR начальное и целевое значения должны отличаться');return false}
  item=findKR(id);if(!item){item={id:uid(),history:[],startDate:parent.startDate};parent.keyResults.push(item)}
  Object.assign(item,{title:fromFD(fd,'title'),metric,start,target,current:num(fd.get('current')),progress:clamp(num(fd.get('progress')),0,100),direction:target<start?'down':'up',unit:fromFD(fd,'unit')});recordKR(item);
 }else if(kind==='checkkr'){
  item=findKR(id);if(!item)return false;
  if(item.metric==='manual')item.progress=clamp(num(fd.get('progress')),0,100);
  else item.current=num(fd.get('current'));
  recordKR(item);
 }else if(kind==='task'){
  const d=ensureDay(k);if(d.closed){toast('Сначала открой день для правок');return false}
  item=d.goals.find(g=>g.id===id);
  if(!item&&d.goals.length>=2){toast('На день можно выбрать максимум две задачи');return false}
  if(!item){item={id:uid(),done:false,focusMinutes:0};d.goals.push(item)}
  Object.assign(item,{text:fromFD(fd,'text'),krId:fromFD(fd,'krId'),concretization:fromFD(fd,'concretization'),impact:clamp(num(fd.get('impact'),3),1,5),confidence:clamp(num(fd.get('confidence'),3),1,5),minutes:clamp(num(fd.get('minutes'),60),10,1440),actualImpact:fromFD(fd,'actualImpact')===''?'':clamp(num(fd.get('actualImpact')),0,5)});
 }else if(kind==='backlog'){
  item=db.backlog.find(b=>b.id===id);if(!item){item={id:uid(),createdAt:today(),status:'open'};db.backlog.push(item)}
  Object.assign(item,{title:fromFD(fd,'title'),krId:fromFD(fd,'krId'),concretization:fromFD(fd,'concretization'),impact:clamp(num(fd.get('impact'),3),1,5),confidence:clamp(num(fd.get('confidence'),3),1,5),minutes:clamp(num(fd.get('minutes'),60),10,1440)});
 }else if(kind==='experiment'){
  item=db.experiments.find(x=>x.id===id);if(!item){item={id:uid(),createdAt:today()};db.experiments.push(item)}
  Object.assign(item,{hypothesis:fromFD(fd,'hypothesis'),krId:fromFD(fd,'krId'),expected:fromFD(fd,'expected'),deadline:fromFD(fd,'deadline'),status:fromFD(fd,'status'),actual:fromFD(fd,'actual'),learned:fromFD(fd,'learned')});
 }else if(kind==='decision'){
  item=db.decisions.find(x=>x.id===id);if(!item){item={id:uid(),createdAt:today()};db.decisions.push(item)}
  Object.assign(item,{observation:fromFD(fd,'observation'),orientation:fromFD(fd,'orientation'),options:fromFD(fd,'options'),action:fromFD(fd,'action'),expected:fromFD(fd,'expected'),deadline:fromFD(fd,'deadline'),reversible:fd.has('reversible'),status:fromFD(fd,'status'),outcome:fromFD(fd,'outcome')});
 }else if(kind==='weekly'){
  db.reviews[k]={wins:fromFD(fd,'wins'),blocked:fromFD(fd,'blocked'),keep:fromFD(fd,'keep'),stop:fromFD(fd,'stop'),try:fromFD(fd,'try'),metrics:allKR().map(r=>({id:r.id,title:r.title,progress:progress(r),value:r.current})),updatedAt:new Date().toISOString()};
 }else return false;
 save();render();toast('Сохранено');return true;
}
async function importFile(file){if(!file)return;
 if(file.size>5*1024*1024){toast('Файл слишком большой (до 5 МБ)');return}
 try{
  const content=await file.text(),raw=JSON.parse(content);
  if(!raw||typeof raw!=='object'||(!raw.days&&!raw.objectives&&!raw.objective))throw new Error('not OKR data');
  if(!confirm('Импорт заменит текущие данные на данные из файла. Сохранить старые данные можно через экспорт. Продолжить?'))return;
  try{localStorage.setItem(AUTO_BACKUP,JSON.stringify(db))}catch{}
  db=normalize(raw);applyTheme();save();historyDate=null;tab='today';render();toast('Импорт выполнен. Текущие данные заменены.');
 }catch(err){console.error('Import failed',err);toast('Не получилось прочитать JSON. Проверь формат файла.')}
}
document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el){event.preventDefault();handleAction(el)}});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('.chart-point')){event.preventDefault();handleAction(event.target)}});
document.addEventListener('submit',event=>{const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(readForm(form)&&$('#modal').open)$('#modal').close()});
document.addEventListener('change',event=>{if(event.target.id==='import-file-input'){const f=event.target.files?.[0];if(f)importFile(f);event.target.value=''}});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal'))$('#modal').close()});
window.addEventListener('storage',event=>{if(event.key===STORE&&event.newValue){toast('Данные изменились в другой вкладке. Обновляем страницу.');setTimeout(()=>location.reload(),800)}});
window.addEventListener('visibilitychange',()=>{if(!document.hidden){updateTimerDisplay();maybeRemind()}});
function boot(){load();const h=new Date().getHours();tab=h>=18||h<3?'evening':'today';render();focusTick=setInterval(()=>{updateTimerDisplay();if(Math.floor(Date.now()/60000)%2===0)maybeRemind()},1000);setTimeout(maybeRemind,2500)}
boot();
