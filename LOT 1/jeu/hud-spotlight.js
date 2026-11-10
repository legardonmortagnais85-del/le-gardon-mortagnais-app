/* Street Fishing — bandeau du poisson unique et compteurs live. */
const $ = id => document.getElementById(id);
function mirrorCounter(sourceId,targetId) {
 const source=$(sourceId), target=$(targetId);
 if(!source||!target)return;
 const refresh=()=>{const value=source.textContent?.trim()||'0';if(target.textContent!==value)target.textContent=value;};
 refresh();
 new MutationObserver(refresh).observe(source,{childList:true,characterData:true,subtree:true});
}
mirrorCounter('coins','sfCoinsLive');
mirrorCounter('points','sfPointsLive');
mirrorCounter('count','sfCatchesLive');
function formatCountdown(seconds){
 seconds=Math.max(0,Number(seconds)||0);
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
 if(h>0)return h+' h '+String(m).padStart(2,'0');
 return m+':'+String(s).padStart(2,'0');
}
// ----- Annonce du poisson unique : rendu complet seulement quand les données changent ; chaque seconde, seulement l'horloge et la barre -----
let lastArtKey='',current=null,deadline=0,toastKey='',toastReady=false,lastClock='',toastTimer=0;
const artCache=new Map();
function fishSvg(accent){
 const c=/^#[0-9a-f]{6}$/i.test(accent||'')?accent:'#ffe866';
 return '<svg viewBox="0 0 64 32" width="100%" height="100%" focusable="false"><defs><linearGradient id="uqFishGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c+'"/><stop offset="1" stop-color="'+c+'" stop-opacity=".5"/></linearGradient></defs>'
  +'<path d="M3 16C13 2 37 2 48 13L61 4 56 16 61 28 48 19C37 30 13 30 3 16Z" fill="url(#uqFishGrad)" stroke="#fffdf0" stroke-width="1.2" stroke-linejoin="round"/>'
  +'<circle cx="12" cy="14" r="2.4" fill="#0b2a2a"/></svg>';
}
function artFor(data){
 const key=data.key;
 if(!artCache.has(key)){const real=window.uniqueFishMarkup?window.uniqueFishMarkup(data):'';artCache.set(key,real||fishSvg(data.accent));if(artCache.size>8)artCache.delete(artCache.keys().next().value)}
 return artCache.get(key);
}
function showUniqueToast(data){
 let t=$('uniqueToast');
 if(!t){t=document.createElement('button');t.id='uniqueToast';t.type='button';t.setAttribute('role','status');t.onclick=()=>{t.classList.remove('show');if(!(window.focusUniqueZone&&window.focusUniqueZone()))$('zonesBtn')?.click()};document.body.append(t)}
 t.style.setProperty('--uq',data.accent||'#ffe866');
 t.innerHTML='';
 const art=document.createElement('span');art.className='ut-art';art.innerHTML=artFor(data);
 const txt=document.createElement('span');txt.className='ut-txt';
 const k=document.createElement('small');k.textContent='★ POISSON UNIQUE · 10 MIN';
 const n=document.createElement('b');n.textContent=data.title+' · '+data.size+' mm';
 const z=document.createElement('em');z.textContent='📍 Zone '+(data.zoneNumber||'')+' · '+data.zoneName+' · touche pour y aller';
 txt.append(k,n,z);t.append(art,txt);
 t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),6500);
 try{navigator.vibrate?.([50,40,50])}catch{}
}
function renderSpotlight(data){
 const daily=$('sfDailyFish'),label=$('sfDailyFishLabel'),clock=$('sfDailyClock'),title=$('sfDailyTitle'),zone=$('sfDailyZone'),art=$('sfUniqueArt');
 if(!daily||!label||!clock)return;
 current=data||null;
 if(!data){title.textContent='Poisson unique';label.textContent='Chargement…';zone.textContent='';clock.textContent='--:--';daily.dataset.active='false';return;}
 deadline=Date.now()+(Number(data.secondsLeft)||0)*1000;
 const active=!!data.active,reward=data.reward||{};
 daily.dataset.active=String(active);
 daily.style.setProperty('--uq',data.accent||'#ffe866');
 title.textContent=active?'★ UNIQUE EN COURS !':'Prochain unique';
 label.textContent=data.title+' · '+data.size+' mm';
 zone.textContent=active?'📍 '+data.zoneName+' · +'+(reward.coins||0)+' 🪙':'📍 Zone '+(data.zoneNumber||'')+' · '+data.zoneName;
 daily.title=active
   ? data.title+' : très rare, pendant '+(data.minutes||10)+' min dans '+data.zoneName+'. Touche pour zoomer sur la zone.'
   : 'Prochain poisson unique : '+data.title+' dans '+data.zoneName+'. Un nouveau poisson toutes les '+(data.everyMinutes||20)+' min, disponible '+(data.minutes||10)+' min.';
 const key=data.key+':'+active;
 if(art&&key!==lastArtKey){lastArtKey=key;art.innerHTML=artFor(data)}
 // annonce : un nouveau poisson vient d'apparaître
 if(active&&data.key!==toastKey){if(toastReady)showUniqueToast(data);toastKey=data.key}
 toastReady=true;
 tick();
}
function tick(){
 const data=current;if(!data)return;
 const left=Math.max(0,Math.ceil((deadline-Date.now())/1000)),active=!!data.active;
 const text=active?formatCountdown(left):'dans '+formatCountdown(left);
 if(text!==lastClock){lastClock=text;$('sfDailyClock').textContent=text}
 const bar=$('sfUniqueBar');
 if(bar){const total=active?(data.minutes||10)*60:((data.everyMinutes||20)-(data.minutes||10))*60;bar.style.transform='scaleX('+Math.max(0,Math.min(1,left/total))+')'}
 const daily=$('sfDailyFish');
 if(daily){const soon=!active&&left<=60?'true':'false';if(daily.dataset.soon!==soon)daily.dataset.soon=soon}
}
renderSpotlight(window.sfSpotlight||null);
document.addEventListener('sf-spotlight-update',e=>{const d=e.detail;if(!d||!current||d.key!==current.key||d.active!==current.active||Math.abs((d.secondsLeft||0)-Math.max(0,Math.ceil((deadline-Date.now())/1000)))>3)renderSpotlight(d);else deadline=Date.now()+(d.secondsLeft||0)*1000});
setInterval(()=>{if(!document.hidden)tick()},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
