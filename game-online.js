(() => {
  const badge=document.getElementById('gameOnline'), roster=document.getElementById('gameRoster');
  const list=roster.querySelector('ul'), status=roster.querySelector('p');
  let current;
  function display(label,active=false){
    badge.textContent=label;
    badge.dataset.active=String(active);
    badge.setAttribute('aria-label',label+' · '+(roster.hidden?'Afficher':'Masquer')+' les pseudos');
  }
  async function refresh(){
    current?.abort();
    if(document.hidden||!badge.getClientRects().length)return;
    const detailed=!roster.hidden;
    const controller=new AbortController();current=controller;
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      if(!navigator.onLine)throw new Error();
      const response=await fetch('./jeu/api/online'+(detailed?'?players=1':''),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error();
      const {humanOnline:n,players}=await response.json();
      if(current!==controller)return;
      if(!Number.isInteger(n)||n<0)throw new Error();
      display(n+(n>1?' joueurs en ligne':' joueur en ligne'),n>0);
      if(detailed){
        list.replaceChildren();status.textContent=n?'':'Aucun joueur en partie.';
        if(!Array.isArray(players)&&n)throw new Error();
        for(const name of players||[]){
          const item=document.createElement('li');item.textContent=name;list.append(item);
        }
      }
    }catch{
      if(current!==controller)return;
      display(navigator.onLine?'Compteur indisponible':'Hors ligne');
      list.replaceChildren();status.textContent='Liste indisponible.';
    }finally{clearTimeout(timeout)}
  }
  badge.onclick=()=>{
    roster.hidden=!roster.hidden;badge.setAttribute('aria-expanded',String(!roster.hidden));
    if(!roster.hidden)status.textContent='Actualisation…';
    refresh();
  };
  document.addEventListener('visibilitychange',refresh);
  for(const event of ['pageshow','online','offline'])window.addEventListener(event,refresh);
  setInterval(refresh,10000);refresh();
})();
