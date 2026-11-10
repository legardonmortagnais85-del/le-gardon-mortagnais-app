/* Street Fishing — grades des joueurs : un grade tous les 10 niveaux, du niveau 10 au niveau 250.
   Plus le grade est haut, plus le badge est riche (formes, lueur, animation). Script classique : fonctions globales. */
(function(){
 const FAMILIES=[
  {to:3,  c1:'#f6c29d',c2:'#7a4630',glow:'#f6a86d'},   // bronze
  {to:6,  c1:'#e9f4fc',c2:'#4d6f8a',glow:'#bfe3ff'},   // argent
  {to:9,  c1:'#ffe58a',c2:'#9a6a14',glow:'#ffd24a'},   // or
  {to:12, c1:'#c8fbff',c2:'#1f7f93',glow:'#5df0ff'},   // platine
  {to:14, c1:'#a4ffcc',c2:'#157a4f',glow:'#3dffa0'},   // émeraude
  {to:16, c1:'#b3d0ff',c2:'#2a4fa8',glow:'#5b8dff'},   // saphir
  {to:18, c1:'#e6bfff',c2:'#6a2fa8',glow:'#b45cff'},   // améthyste
  {to:20, c1:'#ffb6bd',c2:'#a01935',glow:'#ff4a66'},   // rubis
  {to:21, c1:'#ffd885',c2:'#d8420f',glow:'#ff8a1f'},   // feu
  {to:22, c1:'#bafff4',c2:'#3b67ff',glow:'#6ee7ff'},   // holographique
  {to:25, c1:'#ffffff',c2:'#6a2fa8',glow:'#ffffff'}    // arc-en-ciel
 ];
 const NAMES=[
  ['Recrue','🎣'],['Pêcheur','🐟'],['Pêcheur confirmé','🪝'],['Lanceur','🎯'],['Moulineur','⚙️'],['Pisteur','🧭'],
  ['Rôdeur de berge','🌲'],['Maître du leurre','🪱'],['Traqueur','🔎'],['Chasseur de trophées','🏆'],['Capitaine','⚓'],
  ['Dompteur de brochets','🐊'],['Roi du sandre','👑'],['Seigneur de la Sèvre','🌊'],['Gardien du Gardon','🛡️'],
  ['Légende vivante','⭐'],['Maître des eaux','🔱'],['Tempête','⚡'],['Aigle des rivières','🦅'],['Titan','🗿'],
  ['Champion immortel','🏅'],['Phénix','🔥'],['Léviathan','🐉'],['Démiurge','💎'],['Mythique','✨'],['Dieu de la pêche','🌌']
 ];
 const GRADES=NAMES.map(([name,icon],tier)=>{
  const fam=tier===0?{c1:'#d8cbb4',c2:'#6b5a46',glow:'#00000000'}:FAMILIES.find(f=>tier<=f.to);
  // 0 : rien · 1 : reflet · 2 : lueur · 3 : lueur pulsée · 4 : dégradé animé · 5 : arc-en-ciel + étincelles
  const fx=tier<4?0:tier<9?1:tier<15?2:tier<19?3:tier<23?4:5;
  const shape=tier<4?0:tier<7?1:tier<10?2:tier<15?3:tier<22?4:5;
  return {tier,min:tier===0?1:tier*10,name,icon,edge:fam.c1,core:fam.c2,glow:fam.glow,fx,shape,rainbow:tier>=23};
 });
 function gradeFor(level){level=Math.max(1,Math.floor(Number(level)||1));return GRADES.findLast(g=>level>=g.min)||GRADES[0]}
 function nextGrade(level){const g=gradeFor(level);return GRADES[g.tier+1]||null}
 // Pastille HTML (HUD, classements, duels, profil, staff).
 function gradeChip(level,opts={}){
  const g=gradeFor(level),chip=document.createElement('span');
  chip.className='grade-chip';chip.dataset.fx=String(g.fx);chip.dataset.tier=String(g.tier);
  chip.style.setProperty('--g1',g.edge);chip.style.setProperty('--g2',g.core);chip.style.setProperty('--gg',g.glow);
  chip.style.setProperty('--gb',(g.tier?Math.min(16,3+g.tier*.6):0)+'px');
  const icon=document.createElement('span');icon.className='grade-icon';icon.textContent=g.icon;
  const num=document.createElement('b');num.textContent=String(Math.floor(Number(level)||1));
  chip.append(icon,num);
  if(opts.name){const n=document.createElement('span');n.className='grade-name';n.textContent=g.name;chip.append(n)}
  chip.title=g.name+(g.tier?' (grade '+g.tier+'/25)':'');
  return chip;
 }
 // HUD du joueur : pastille de niveau + cadre de l'avatar aux couleurs du grade.
 function applyHudGrade(level){
  const g=gradeFor(level),pill=document.querySelector('.hud-v160 .hud-level'),root=document.querySelector('.hud-v160');
  if(root){root.style.setProperty('--me-g1',g.edge);root.style.setProperty('--me-g2',g.core);root.style.setProperty('--me-gg',g.glow);root.dataset.gradeFx=String(g.fx);root.dataset.gradeTier=String(g.tier)}
  if(pill){pill.classList.add('grade-live');pill.dataset.fx=String(g.fx);pill.dataset.icon=g.tier?g.icon:'';pill.title=g.name+' · niveau '+level}
  const card=document.getElementById('gradeCard');
  if(card){
   const next=nextGrade(level);card.replaceChildren();
   const head=document.createElement('div');head.className='grade-card-head';
   head.append(gradeChip(level,{name:true}));
   const line=document.createElement('p');line.className='grade-card-next';
   line.textContent=next?'Prochain grade : '+next.icon+' '+next.name+' au niveau '+next.min+' (encore '+(next.min-level)+' niveau'+((next.min-level)>1?'x':'')+')':'Grade maximum atteint : tu es une légende de la Sèvre !';
   card.append(head,line);
  }
 }
 function renderGradeList(box){
  if(!box)return;box.replaceChildren();
  for(const g of GRADES){
   const row=document.createElement('div');row.className='grade-row';
   const chip=gradeChip(g.min,{});chip.querySelector('b').textContent=g.tier===0?'1':String(g.min);
   const t=document.createElement('span');t.textContent=g.name;
   const s=document.createElement('small');s.textContent='Niv. '+g.min+(g.tier===0?' à 9':'+');
   row.append(chip,t,s);box.append(row);
  }
 }
 if(document.getElementById('gradeList'))renderGradeList(document.getElementById('gradeList'));
 window.SFGRADES=GRADES;window.gradeFor=gradeFor;window.nextGrade=nextGrade;window.gradeChip=gradeChip;window.applyHudGrade=applyHudGrade;window.renderGradeList=renderGradeList;
})();
