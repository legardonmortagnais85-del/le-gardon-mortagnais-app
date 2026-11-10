/* Street Fishing v162 — repositionnement local du HUD, sans effet sur les scores. */
const panels = [
  ['playerStats', 'Profil'],
  ['hudNavigation', 'Menu'],
  ['hudQuickNav', 'Raccourcis'],
  ['sfDailyFish', 'Poisson du jour'],
  ['liveRanks', 'Top 5'],
  ['hudFishing', 'Pêche'],
  ['hudZoom', 'Zoom'],
].map(([id, label]) => ({ id, label, node: document.getElementById(id) }));
const $ = id => document.getElementById(id);
const editBar = $('hudEditBar');
const prefix = 'sf-hud-layout-v175-';
let editing = false;
let dragging = null;
let currentOrientation = orientation();
function orientation() { return innerWidth > innerHeight ? 'landscape' : 'portrait'; }
function storageKey() { return prefix + currentOrientation; }
function viewport() { return { width: document.documentElement.clientWidth || innerWidth, height: innerHeight }; }
function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }
function getSaved() {
  try {
    const obj = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}
function persist() {
  const { width, height } = viewport();
  const data = {};
  for (const { id, node } of panels) {
    if (!node.classList.contains('hud-panel-positioned')) continue;
    const box = node.getBoundingClientRect();
    data[id] = {
      x: clamp(box.left / Math.max(1, width - box.width), 0, 1),
      y: clamp(box.top / Math.max(1, height - box.height), 0, 1),
      w: Math.min(box.width, width - 12),
    };
  }
  try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch {}
}
function positionPanel(node, x, y, width) {
  const vp = viewport();
  node.classList.add('hud-panel-positioned');
  const w = clamp(Number(width) || node.getBoundingClientRect().width || 100, 24, vp.width - 12);
  node.style.setProperty('--hud-w', `${w}px`);
  // Read the actual width after setting it: on small screens the CSS may shrink a panel.
  const rect = node.getBoundingClientRect();
  node.style.setProperty('--hud-x', `${Math.round(clamp(x, 6, Math.max(6, vp.width - rect.width - 6)))}px`);
  node.style.setProperty('--hud-y', `${Math.round(clamp(y, 6, Math.max(6, vp.height - rect.height - 6)))}px`);
}
function restorePanels() {
  const data = getSaved();
  const vp = viewport();
  for (const { id, node } of panels) {
    const loc = data[id];
    if (!loc || ![loc.x, loc.y, loc.w].every(Number.isFinite) || loc.x < 0 || loc.x > 1 || loc.y < 0 || loc.y > 1) continue;
    const width = clamp(loc.w, 24, vp.width - 12);
    node.classList.add('hud-panel-positioned');
    node.style.setProperty('--hud-w', `${width}px`);
    const rect = node.getBoundingClientRect();
    positionPanel(node, loc.x * Math.max(0, vp.width - rect.width), loc.y * Math.max(0, vp.height - rect.height), width);
  }
}
function resetPanels() {
  dragging = null;
  for (const { node } of panels) {
    node.classList.remove('hud-panel-positioned');
    for (const prop of ['--hud-x', '--hud-y', '--hud-w']) node.style.removeProperty(prop);
  }
  try { localStorage.removeItem(prefix + 'portrait'); localStorage.removeItem(prefix + 'landscape'); } catch {}
}
function quitEditing(save = true) {
  if (!editing) return;
  if (save) persist();
  editing = false;
  dragging = null;
  document.body.classList.remove('hud-editing');
  editBar.hidden = true;
}
function startEditing() {
  if (editing) return;
  // Grab all geometry first, before detaching any element from the layout flow.
  const positions = panels.map(({node}) => {
    const rect = node.getBoundingClientRect();
    return { node, x:rect.left, y:rect.top, w:rect.width };
  });
  const settings = $('playerSettings');
  if (settings?.open) settings.close();
  const ranks = $('liveRanks');
  // Collapsing Top 5 before dragging helps avoid covering most of the map.
  if (ranks.open) ranks.open = false;
  document.body.classList.add('hud-editing');
  for (const p of positions) positionPanel(p.node, p.x, p.y, p.w);
  editing = true;
  editBar.hidden = false;
}
for (const { id, label, node } of panels) {
  if (!node) continue;
  const handle = document.createElement('button');
  handle.className = 'hud-drag-handle';
  handle.type = 'button';
  handle.textContent = '✥ ' + label;
  handle.setAttribute('aria-label', 'Déplacer ' + label);
  handle.title = 'Maintenir et glisser pour déplacer';
  if (id === 'liveRanks') node.querySelector('summary').append(handle);
  else node.append(handle);
  handle.addEventListener('click', event => { if (editing) { event.preventDefault(); event.stopPropagation(); } });
  handle.addEventListener('pointerdown', event => {
    if (!editing || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = node.getBoundingClientRect();
    dragging = { id, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
      left:rect.left, top:rect.top, width:rect.width };
    try { handle.setPointerCapture(event.pointerId); } catch {}
  });
  handle.addEventListener('pointermove', event => {
    if (!dragging || dragging.id !== id || dragging.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    positionPanel(node, dragging.left + event.clientX - dragging.startX,
      dragging.top + event.clientY - dragging.startY, dragging.width);
  });
  handle.addEventListener('pointerup', event => {
    if (!dragging || dragging.id !== id || dragging.pointerId !== event.pointerId) return;
    dragging = null; event.preventDefault(); event.stopPropagation(); persist();
  });
  handle.addEventListener('pointercancel', () => { dragging = null; });
  // Keyboard accessibility for repositioning: arrows step 12px, Shift + arrows 32px.
  handle.addEventListener('keydown', event => {
    const steps = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
    const dir = steps[event.key];
    if (!editing || !dir) return;
    event.preventDefault(); event.stopPropagation();
    const rect = node.getBoundingClientRect(), unit = event.shiftKey ? 32 : 12;
    positionPanel(node, rect.left + dir[0]*unit, rect.top + dir[1]*unit, rect.width);
    persist();
  });
}
$('customizeHud').addEventListener('click', startEditing);
$('resetHudPositions').addEventListener('click', () => {
  quitEditing(false); resetPanels();
  const status=$('settingsStatus'); if (status) status.textContent='Tous les panneaux ont retrouvé leur position initiale.';
});
$('hudSaveLayout').addEventListener('click', () => quitEditing(true));
$('hudResetNow').addEventListener('click', () => { quitEditing(false); resetPanels(); });
// Les panneaux dont la taille change (classement déplié, combat, quêtes reçues)
// doivent rester entièrement dans l'écran, sans glisser sur la barre du système.
let resizePending = false;
function clampPlacedPanels(){
  if (resizePending || dragging) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    if (dragging) return;
    const {width,height}=viewport();
    for (const {node} of panels){
      if (!node.classList.contains('hud-panel-positioned')) continue;
      const b=node.getBoundingClientRect();
      const x=clamp(b.left,6,Math.max(6,width-b.width-6));
      const y=clamp(b.top,6,Math.max(6,height-b.height-6));
      if(Math.abs(b.left-x)>1 || Math.abs(b.top-y)>1) positionPanel(node,x,y,b.width);
    }
  });
}
if ('ResizeObserver' in window){
  const ro = new ResizeObserver(clampPlacedPanels);
  for (const {node} of panels) ro.observe(node);
}
$('liveRanks').addEventListener('toggle',clampPlacedPanels);
document.addEventListener('keydown',event=>{
  if(editing && event.key==='Escape'){event.preventDefault();event.stopPropagation();quitEditing(true)}
},true);

// Avoid restoring portrait coordinates into landscape (and vice versa).
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (dragging) return;
    const next=orientation();
    if (next !== currentOrientation) {
      if (editing) quitEditing(true);
      for (const { node } of panels) {
        node.classList.remove('hud-panel-positioned');
        for (const p of ['--hud-x','--hud-y','--hud-w']) node.style.removeProperty(p);
      }
      currentOrientation=next;
      restorePanels();
    } else {
      const {width,height}=viewport();
      for (const {node} of panels) {
        if(!node.classList.contains('hud-panel-positioned'))continue;
        const rect=node.getBoundingClientRect();
        positionPanel(node,clamp(rect.left,6,Math.max(6,width-rect.width-6)),clamp(rect.top,6,Math.max(6,height-rect.height-6)),rect.width);
      }
    }
  }, 130);
});
restorePanels();
