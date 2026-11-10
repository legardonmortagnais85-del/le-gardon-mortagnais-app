/* Street Fishing — raccourcis du HUD (Quêtes, Classement, Zones, Collection, Boutique). */
const sf = id => document.getElementById(id);
const hud = document.querySelector('.hud-v160');
const header = document.querySelector('.hud-v160 .top');
function updateQuickPositions(){
  if(!hud || !header)return;
  const top = header.getBoundingClientRect(), outer = hud.getBoundingClientRect();
  const offset = Math.max(66,Math.ceil(top.bottom-outer.top));
  hud.style.setProperty('--sf-head-bottom', offset+'px');
}
updateQuickPositions();
if('ResizeObserver' in window){new ResizeObserver(updateQuickPositions).observe(header)}
addEventListener('resize', updateQuickPositions,{passive:true});
// All actions delegate to existing game buttons and preserve their auth/permissions.
const open = id => {const el=sf(id); if(el && !el.disabled) el.click()};
sf('sfRewardQuick')?.addEventListener('click',()=>open('questBtn'));
sf('sfLegendQuick')?.addEventListener('click',()=>open('zonesBtn'));
sf('sfTournamentQuick')?.addEventListener('click',()=>open('boardBtn'));
sf('sfShopQuick')?.addEventListener('click',()=>{open('shopBtn');if(!sf('shop')?.open){const welcome=sf('welcome');if(welcome && !welcome.open)welcome.showModal();}});
sf('sfCollectionQuick')?.addEventListener('click',()=>open('logBtn'));
sf('sfMenuMap')?.addEventListener('click',()=>{const dlg=sf('menu');if(dlg?.open)dlg.close();open('mapBtn')});
sf('sfDailyFish')?.addEventListener('click',()=>{if(!(window.focusUniqueZone&&window.focusUniqueZone()))open('zonesBtn')});
// Notification states come from the real quest tracker, rather than fictitious rewards.
function updateQuickDots(){
 const quests=sf('questTracker');
 const available=quests && quests.dataset.ready==='true';
 for(const id of ['sfRewardDot']){
   const dot=sf(id);if(dot)dot.hidden=!available;
 }
}
if('MutationObserver' in window && sf('questTracker')){
 new MutationObserver(updateQuickDots).observe(sf('questTracker'),{attributes:true,attributeFilter:['data-ready','hidden']});
}
updateQuickDots();
