
import {createClient} from './vendor/supabase.bundle.mjs';
import {validateTwoPointRuler} from './ruler-math.mjs';
import {cmEstimateFromMm} from './ruler-centimeters.mjs';
const SUPABASE_URL='https://poqsalgjouoznsfalagi.supabase.co';
const SUPABASE_KEY='sb_publishable_suBSeZ05lscodphHQa0tRA_DHGRN2or';
// Credentials persist in this tab only. A unique runtime key also isolates
// Supabase auth broadcasts and locks, including in duplicated tabs.
const authChannelKey='sf2027-auth-'+crypto.randomUUID();
const authMemory=new Map();
const REMEMBER_KEY='sf2027-remember-login',PERSISTED_AUTH='sf2027-remembered-auth';
function rememberEnabled(){try{return localStorage.getItem(REMEMBER_KEY)==='true'}catch(e){return false}}
function configureRemember(enabled){try{if(enabled){localStorage.setItem(REMEMBER_KEY,'true')}else{localStorage.removeItem(REMEMBER_KEY);localStorage.removeItem(PERSISTED_AUTH);localStorage.removeItem('sf2027-offline-account-v1')}}catch(e){if(enabled)throw new Error('Ce navigateur bloque la mémorisation. Autorise le stockage du site ou décoche Rester connecté.')}}
const tabAuthStorage={
 getItem(key){const name=key.replace(authChannelKey,'sf2027-tab-auth');try{return sessionStorage.getItem(name)||(rememberEnabled()?localStorage.getItem(PERSISTED_AUTH):null)}catch(e){return authMemory.get(name)??null}},
 setItem(key,value){const name=key.replace(authChannelKey,'sf2027-tab-auth');authMemory.set(name,value);try{sessionStorage.setItem(name,value);if(rememberEnabled())localStorage.setItem(PERSISTED_AUTH,value)}catch(e){}},
 removeItem(key){const name=key.replace(authChannelKey,'sf2027-tab-auth');authMemory.delete(name);try{sessionStorage.removeItem(name);localStorage.removeItem(PERSISTED_AUTH)}catch(e){}}
};
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,storage:tabAuthStorage,storageKey:authChannelKey}});
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let recoveryMode=false;
let catchWindow=null,catchWindowOffset=0,catchWindowBusy=false,windowSaving=false,catchWindowRequest=null,catchSubmitting=false;
let user=null,team=null,staff=false,photoBlob=null,tab='account',loading=false;
let accountRefreshVersion=0,tabOwner=null,pendingApprovalIds=[],bulkApproving=false;
const selectedPendingCatches=new Set();
let rankingVisibleState=null,rankingVisibilitySaving=false,visibilityCheckBusy=false;
const aiAnalysisCache=new Map();let aiSettingsDirty=false,aiSettingsSaving=false,aiSettingsBusy=false;
let alertOwner=null,alertCursor=null,alertBusy=false,alertStart=Date.now(),pushBusy=false;
let publicCoefficientVersion=0,badgeRead=0;
const species=['Brochet','Sandre','Perche','Chevesne','Silure'];
function message(id,s,error=false){$(id).textContent=s;$(id).className=error?'bad':'good'}
function notice(s,error=false,accountOnly=false){const box=$('notice');box.dataset.scope=accountOnly?'account':'global';box.classList.toggle('hidden',accountOnly&&tab!=='account');box.textContent=s;$('notice').style.background=error?'#ffebec':'#e5f4ed'}
const staffPageIds=['staffPending','staffHistory','staffTeams','staffTrash','staffPilot','staffSettings'];
let staffPage='staffPending',staffPageOwner=null;
function showStaffPage(id,restore=false){const uid=user?.id||null;if(restore&&staffPageOwner!==uid){try{id=sessionStorage.getItem('sf2027-staff-page-'+uid)||'staffPending'}catch(e){id='staffPending'}}if(!staffPageIds.includes(id))id='staffPending';staffPage=id;staffPageOwner=uid;if(id==='staffSettings'){loadAISettings()}if(id==='staffPilot')refreshCatchWindow(true);for(const page of staffPageIds)$(page).classList.toggle('hidden',page!==id);document.querySelectorAll('[data-staff-page]').forEach(button=>{const selected=button.dataset.staffPage===id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});if(uid){try{sessionStorage.setItem('sf2027-staff-page-'+uid,id)}catch(e){}}}
document.querySelectorAll('[data-staff-page]').forEach(button=>button.addEventListener('click',()=>showStaffPage(button.dataset.staffPage)));
const panelIds=['account','catchPanel','rankingPanel','staffPanel','chatPanel'];
function rememberedTab(uid){try{return sessionStorage.getItem('sf2027-tab-'+uid)||'account'}catch(e){return 'account'}}
function allowedTab(id){if(!user&&['catchPanel','chatPanel'].includes(id))return 'account';if(!panelIds.includes(id))return 'account';if(id==='staffPanel'&&(!user||!staff))return 'account';return id}
function updateCatchAccess(){
 const confirmed=team?.registration_status==='confirmed';
 const localDraft=confirmed&&(!navigator.onLine||!catchWindow);
 const enabled=!!user&&(localDraft||catchesAreOpen());
 $('catchTeam').textContent=team?'Équipe n° '+(team.team_number??'—')+' — '+team.team_name:staff?'Compte staff sans équipe de pêcheurs.':'Aucune équipe associée.';
 const help=staff&&!team?'Utilise l’onglet Staff pour contrôler les prises.':!confirmed?'Inscris ton duo et attends la confirmation du staff.':'';
 $('catchAccess').textContent=help;
 $('catchAccess').classList.toggle('hidden',!help);
 $('galleryPhoto').classList.toggle('hidden',!galleryAllowed);
 $('galleryPhoto').disabled=!enabled||!navigator.onLine||!galleryAllowed;
 for(const id of ['nativeCamera','fish','mm'])$(id).disabled=!enabled;
 $('send').textContent=localDraft?'Enregistrer sur ce téléphone':'Envoyer ma prise';
 $('send').disabled=catchSubmitting||!enabled||!confirmed||!photoBlob;
 if(!team)$('mine').textContent='Aucune prise associée à ce compte.';
}
function showTab(id){if(id==='chatPanel')$('staffAlert').classList.add('hidden');const previousTab=tab;$('rankingVisibilityControls').classList.toggle('hidden',!user||!staff);paintRankingVisibility();$('goPilot').classList.toggle('hidden',!user||!staff);$('rankingTimerControls').classList.toggle('hidden',!user||!staff);stopChatPolling();tab=allowedTab(id);if(previousTab==='catchPanel'&&tab!=='catchPanel')stopWebcam();if(tab!=='account'&&$('notice').dataset.scope==='account'){notice('');$('notice').classList.add('hidden')}if(tab!==id&&!user){notice(id==='catchPanel'?'Connecte-toi pour déclarer une prise avec ton équipe.':'Connecte-toi pour lire et envoyer les messages du concours.',false,true);setTimeout(()=>{if(tab==='account')$('email').focus()},0)}$('eventIntro').classList.toggle('hidden',tab!=='account');$('welcome').classList.toggle('hidden',tab!=='account');if(tab==='account'){loadRankingCoefficients();refreshCatchWindow()}tabOwner=user?.id||null;if(user){try{sessionStorage.setItem('sf2027-tab-'+user.id,tab)}catch(e){}}$('installer').classList.toggle('hidden',tab!=='account');$('eventDocuments').classList.toggle('hidden',tab!=='account');for(const p of panelIds)$(p).classList.toggle('hidden',p!==tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('inactive',b.dataset.tab!==tab));if(tab==='catchPanel'){refreshCatchWindow();updateCatchAccess();showQueue();syncQueue()}if(tab==='rankingPanel'){loadRanking()};if(staff)refreshPendingBadge();if(tab==='staffPanel'){showStaffPage(staffPage,true);if(!staffDraftDirty&&!coefficientDraftDirty&&!$('staffPanel').querySelector('details[open]'))loadStaff()};if(tab==='chatPanel'){startChatPolling();updatePushSettings()}if(tab!=='chatPanel'||!chatAllowed())refreshChatBadge();checkStaffAlerts();document.querySelectorAll('#tabs [data-tab]').forEach(button=>{if(button.dataset.tab===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});if(previousTab!==tab)window.scrollTo({top:0,behavior:'instant'})}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{showTab(b.dataset.tab);if(b.dataset.scrollTarget){if(!user)setAuthMode('signup');$(b.dataset.scrollTarget).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}else window.scrollTo({top:0,behavior:'instant'})}));
const ACCOUNT_CACHE='sf2027-offline-account-v1';
let explicitLogout=false;
function cachedAccount(){try{const value=JSON.parse(sessionStorage.getItem(ACCOUNT_CACHE)||(rememberEnabled()?localStorage.getItem(ACCOUNT_CACHE):null)||'null');return value&&typeof value.user?.id==='string'&&(!value.team||typeof value.team.id==='string')?value:null}catch(e){return null}}
function forgetAccount(){try{sessionStorage.removeItem(ACCOUNT_CACHE);localStorage.removeItem(ACCOUNT_CACHE)}catch(e){}}
function saveAccount(){if(!user)return;try{const value=JSON.stringify({user:{id:user.id,email:user.email||''},team,staff,savedAt:new Date().toISOString()});sessionStorage.setItem(ACCOUNT_CACHE,value);if(rememberEnabled())localStorage.setItem(ACCOUNT_CACHE,value)}catch(e){}}
function renderAccount(){const uid=user?.id;$('signedOut').classList.toggle('hidden',!!user||recoveryMode);$('signedIn').classList.toggle('hidden',!user||recoveryMode);$('staffTab').classList.toggle('hidden',!staff||!user);$('who').textContent=user?.email||'Utilisateur';$('myTeam').textContent=team?`Équipe n° ${team.team_number??'à attribuer'} — ${team.team_name} (${registrationLabel(team.registration_status)})`:staff?'Compte staff : utilise l’onglet Staff pour gérer les équipes et les prises.':'Aucune équipe inscrite pour le moment. Remplis le formulaire ci-dessous.';$('registerBox').classList.toggle('hidden',!!team||staff||!user);const destination=tabOwner===uid?tab:uid?rememberedTab(uid):'account';showTab(destination);updateNetworkStatus()}
function restoreCachedAccount(expectedUid=null){const saved=cachedAccount();if(!saved||explicitLogout||(expectedUid&&saved.user.id!==expectedUid))return false;user=saved.user;team=saved.team||null;staff=!!saved.staff;renderAccount();notice(navigator.onLine?'Compte mémorisé sur cet appareil. Vérification de la connexion…':'Mode hors ligne : compte et équipe conservés sur cet appareil.');return true}
function updateNetworkStatus(){const offline=!navigator.onLine;$('networkStatus').dataset.state=offline?'offline':'online';$('networkStatus').textContent=offline?'Sans réseau · Les brouillons sont conservés sur ce téléphone.':'En ligne';$('syncQueue').disabled=offline||syncing;updateCatchAccess()}
async function init(){restoreCachedAccount();if(!navigator.onLine){if(!user){notice('Première connexion nécessaire avec du réseau.');renderAccount()}return}try{const {data:{session},error}=await db.auth.getSession();if(error)throw error;await refreshAccount(session?.user||null)}catch(e){if(!restoreCachedAccount())notice('Connexion indisponible : '+e.message,true)}}
function clearStaffView(){aiAnalysisCache.clear();aiSettingsDirty=false;selectedPendingCatches.clear();pendingApprovalIds=[];paintBulkApproval();staffLoadVersion++;registrationLoadVersion++;coefficientLoadVersion++;staffDraftDirty=false;coefficientDraftDirty=false;selectedCatches.clear();selectedTrash.clear();selectedTeams.clear();activeCatchIds=[];trashCatches=[];participantTeams=[];for(const id of ['pending','history','registrations','trash','coefficientFields'])$(id).replaceChildren();$('staffMsg').textContent='';$('participantDeleteMsg').textContent='';$('coefficientMsg').textContent=''}
function registrationLabel(value){return {pending:'En attente',payment_pending:'Paiement en attente',confirmed:'Confirmée',rejected:'Refusée',cancelled:'Annulée'}[value]||value}
async function refreshAccount(u){const version=++accountRefreshVersion;if(!navigator.onLine&&!explicitLogout){if(restoreCachedAccount(u?.id))return;if(user){renderAccount();notice('Mode hors ligne : compte conservé.');return}}const changed=user?.id!==u?.id;user=u;if(changed){++badgeRequest;paintChatBadge(false);++queueViewVersion;for(const url of queuePhotoUrls)URL.revokeObjectURL(url);queuePhotoUrls=[];$('queueStatus').replaceChildren();paintPendingBadge(0);clearRankingPhotos();galleryAllowed=false;gallerySettingKnown=false;team=null;staff=false;$('password').value='';clearStaffView();clearPhoto();stopChatPolling();$('chatBody').value='';$('chatMessages').replaceChildren();chatFingerprint=''}$('signedOut').classList.toggle('hidden',!!user||recoveryMode);$('signedIn').classList.toggle('hidden',!user||recoveryMode);if(!user){forgetAccount();$('staffTab').classList.add('hidden');notice('Connecte-toi pour accéder à ton équipe.',false,true);showTab(tab==='rankingPanel'?'rankingPanel':'account');return}const uid=user.id;$('who').textContent=user.email||'Utilisateur';const [{data:role,error:roleErr},{data:teams,error:teamErr}]=await Promise.all([db.from('staff_members').select('role').eq('user_id',uid).maybeSingle(),db.from('teams').select('id,team_number,team_name,registration_status').eq('owner_user_id',uid).limit(1)]);if(version!==accountRefreshVersion||user?.id!==uid)return;if(roleErr||teamErr){if(restoreCachedAccount(uid)){notice('Réseau indisponible : équipe mémorisée conservée sur ce téléphone.');return}notice('Connexion indisponible : '+(roleErr||teamErr).message,true);return}staff=!!role;team=teams?.[0]||null;saveAccount();$('staffTab').classList.toggle('hidden',!staff);$('myTeam').textContent=team?`Équipe n° ${team.team_number??'à attribuer'} — ${team.team_name} (${registrationLabel(team.registration_status)})`:staff?'Compte staff : utilise l’onglet Staff pour gérer les équipes et les prises.':'Aucune équipe inscrite pour le moment. Remplis le formulaire ci-dessous.';$('registerBox').classList.toggle('hidden',!!team||staff);$('catchTeam').textContent=team?`Équipe n° ${team.team_number??'—'} — ${team.team_name}`:'';notice(staff?'Connexion staff active.':team?'Connexion réussie.':'Compte connecté. Aucune équipe 2027 encore inscrite.');const destination=location.hash==='#messages'&&chatAllowed()?'chatPanel':tabOwner===uid?tab:rememberedTab(uid);if(location.hash==='#messages'&&destination==='chatPanel')history.replaceState(null,'',location.pathname+location.search);showTab(destination);updateNetworkStatus();if(team?.registration_status==='confirmed')await loadMine()}
$('login').onclick=async()=>{explicitLogout=false;if(!navigator.onLine)return message('loginMsg','La première connexion nécessite du réseau.',true);message('loginMsg','Connexion…');$('login').disabled=true;try{configureRemember($('rememberMe').checked);const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';message('loginMsg','Connecté.')}catch(e){message('loginMsg',e.message,true)}finally{$('login').disabled=false}};
$('signup').onclick=async()=>{explicitLogout=false;if(!navigator.onLine)return message('loginMsg','La création du compte nécessite du réseau.',true);const email=$('email').value.trim(),password=$('password').value;if(!email||!$('email').checkValidity()||password.length<8)return message('loginMsg','Saisis un e-mail et un mot de passe de 8 caractères minimum.',true);if(password!==$('signupPasswordConfirm').value)return message('loginMsg','Les deux mots de passe doivent être identiques.',true);$('signup').disabled=true;try{configureRemember($('rememberMe').checked);const {data,error}=await db.auth.signUp({email,password,emailRedirectTo:location.origin});if(error)throw error;$('password').value='';$('signupPasswordConfirm').value='';message('loginMsg',data.session?'Compte créé. Tu peux inscrire ton duo.':'Compte créé : vérifie ton e-mail et clique sur le lien de confirmation, puis connecte-toi.')}catch(e){message('loginMsg',e.message,true)}finally{$('signup').disabled=false}};
$('register').onclick=async()=>{if(containsEmail($('regName').value))return message('regMsg','Choisis un nom de duo sans adresse e-mail. Ce nom apparaît au classement.',true);const payload={p_team_name:$('regName').value,p_captain_first_name:$('captainFirst').value,p_captain_last_name:$('captainLast').value,p_captain_phone:$('captainPhone').value,p_partner_first_name:$('partnerFirst').value,p_partner_last_name:$('partnerLast').value,p_partner_email:$('partnerEmail').value,p_partner_phone:$('partnerPhone').value};$('register').disabled=true;message('regMsg','Enregistrement…');try{const {data,error}=await db.rpc('register_duo',payload);if(error)throw error;message('regMsg','Inscription envoyée. Le staff attribuera ton numéro lors de la confirmation, dans la limite des 40 équipes.');await refreshAccount(user)}catch(e){message('regMsg',e.message,true)}finally{$('register').disabled=false}};
const selectedTeams=new Set();let participantTeams=[],registrationLoadVersion=0;
async function loadRegistrations(){if(!staff)return;const version=++registrationLoadVersion,uid=user?.id;const {data,error}=await db.from('teams').select('id,owner_user_id,team_number,team_name,captain_first_name,captain_last_name,captain_email,captain_phone,partner_first_name,partner_last_name,partner_email,partner_phone,registration_status').order('team_number');if(version!==registrationLoadVersion||!staff||user?.id!==uid)return;const box=$('registrations');if(error){box.textContent=error.message;participantTeams=[];selectedTeams.clear();updateTeamSelection();return}participantTeams=(data||[]).filter(t=>t.owner_user_id&&t.owner_user_id!==user?.id);for(const id of selectedTeams)if(!participantTeams.some(t=>t.id===id))selectedTeams.delete(id);box.replaceChildren();for(const t of data||[]){const div=document.createElement('div');div.className='item';const title=document.createElement('strong');if(participantTeams.some(item=>item.id===t.id)){const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:10px;min-height:44px';label.className='teamActionChoice';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='teamSelect';checkbox.dataset.teamId=t.id;checkbox.style.cssText='width:24px;min-height:24px;margin:0';checkbox.checked=selectedTeams.has(t.id);checkbox.onchange=()=>{if(checkbox.checked)selectedTeams.add(t.id);else selectedTeams.delete(t.id);updateTeamSelection()};const text=document.createElement('span');text.textContent='Sélectionner ce compte et cette équipe';label.append(checkbox,text);div.append(label)}title.textContent=`${t.team_number==null?'En attente':'N° '+t.team_number} — ${t.team_name} (${registrationLabel(t.registration_status)})`;div.append(title);const detail=document.createElement('p');detail.className='muted';detail.textContent=`Responsable : ${t.captain_first_name} ${t.captain_last_name} · ${t.captain_email} · ${t.captain_phone||'—'} | Second : ${t.partner_first_name} ${t.partner_last_name} · ${t.partner_email||'—'} · ${t.partner_phone||'—'}`;div.append(detail);if(t.registration_status==='pending'){for(const [status,label] of [['confirmed','Confirmer'],['rejected','Refuser']]){const b=document.createElement('button');b.textContent=label;b.className=status==='rejected'?'danger':'';b.style.marginRight='8px';b.onclick=async()=>{if(!confirm(label+' cette inscription ?'))return;const {error}=await db.rpc('staff_set_registration',{p_team_id:t.id,p_status:status});if(error)alert(error.message);else await loadRegistrations()};div.append(b)}}div.append(teamEditForm(t));box.append(div)}if(!data?.length)box.textContent='Aucune inscription.';updateTeamSelection()}
function teamEditForm(t){const details=document.createElement('details');details.className='teamEditor';const summary=document.createElement('summary');summary.textContent=' Modifier l’équipe et les pêcheurs';const form=document.createElement('form');const fields=[['team_name','Nom de l’équipe','text',70],['captain_first_name','Prénom du responsable','text',70],['captain_last_name','Nom du responsable','text',70],['captain_phone','Téléphone du responsable','tel',30],['partner_first_name','Prénom du second pêcheur','text',70],['partner_last_name','Nom du second pêcheur','text',70],['partner_email','E-mail du second pêcheur','email',254],['partner_phone','Téléphone du second pêcheur','tel',30]];for(const [key,labelText,type,max] of fields){const label=document.createElement('label'),input=document.createElement('input');input.id=`team-${t.id}-${key}`;input.name=key;input.type=type;input.maxLength=max;input.required=true;input.className='teamEdit';input.value=t[key]||'';label.htmlFor=input.id;label.textContent=labelText;form.append(label,input)}const login=document.createElement('p');login.className='muted';login.textContent='Adresse de connexion du responsable : '+(t.captain_email||'—');const actions=document.createElement('div');actions.className='actions';const save=document.createElement('button');save.type='submit';save.textContent='Enregistrer les modifications';const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Annuler';cancel.onclick=()=>{form.reset();for(const [key] of fields)form.elements.namedItem(key).value=t[key]||'';details.open=false};actions.append(save,cancel);const feedback=document.createElement('p');feedback.className='teamEditMsg';feedback.setAttribute('role','status');form.append(login,actions,feedback);form.onsubmit=event=>{event.preventDefault();saveTeamChanges(t,form)};details.append(summary,form);return details}
async function saveTeamChanges(t,form){if(!staff||loading)return;const feedback=form.querySelector('.teamEditMsg');const fail=text=>{feedback.textContent=text;feedback.className='teamEditMsg bad'};if(!navigator.onLine)return fail('La modification d’une équipe nécessite du réseau.');if(!form.reportValidity())return;if(containsEmail(form.elements.namedItem('team_name').value))return fail('Choisis un nom de duo sans adresse e-mail.');const payload={p_team_id:t.id};for(const key of ['team_name','captain_first_name','captain_last_name','captain_phone','partner_first_name','partner_last_name','partner_email','partner_phone'])payload['p_'+key]=form.elements.namedItem(key).value.trim();if(!confirm(`Enregistrer les modifications de l’équipe n° ${t.team_number} — ${payload.p_team_name} ?`))return;loading=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);try{const {error}=await db.rpc('staff_update_team',payload);if(error)throw error;message('participantDeleteMsg','Informations de l’équipe enregistrées. Le classement affichera le nouveau nom.');await loadRegistrations()}catch(e){fail('Enregistrement impossible : '+e.message)}finally{loading=false;form.querySelectorAll('button').forEach(button=>button.disabled=false)}}
function updateTeamSelection(){$('teamActions').classList.toggle('hidden',!participantTeams.length);const count=selectedTeams.size;$('teamSelectionCount').textContent=count?`${count} équipe(s) et compte(s) sélectionné(s).`:'Aucune équipe sélectionnée.';$('deleteParticipants').disabled=loading||!count;const all=$('selectAllTeams');all.checked=participantTeams.length>0&&count===participantTeams.length;all.indeterminate=count>0&&count<participantTeams.length;all.disabled=loading||!participantTeams.length;document.querySelectorAll('.teamSelect').forEach(box=>{box.checked=selectedTeams.has(box.dataset.teamId);box.disabled=loading})}
$('teamActions').ontoggle=()=>{
 if(!$('teamActions').open){selectedTeams.clear();updateTeamSelection()}
};
$('selectAllTeams').onchange=()=>{selectedTeams.clear();if($('selectAllTeams').checked)participantTeams.forEach(t=>selectedTeams.add(t.id));updateTeamSelection()};
async function deleteParticipants(){if(loading||!staff||!selectedTeams.size)return;const items=participantTeams.filter(t=>selectedTeams.has(t.id));const names=items.map(t=>`N° ${t.team_number} — ${t.team_name} (${t.captain_email})`).join('\n');if(!confirm(`SUPPRESSION DÉFINITIVE :\n${names}\n\nLes comptes de connexion responsables, les équipes, leurs prises, leurs photos et leurs enregistrements de paiement seront effacés. Aucun remboursement ne sera effectué. Aucune restauration ne sera possible. Confirmer ?`))return;loading=true;updateTeamSelection();updateSelection();updateTrashSelection();let deleted=0;const failures=[];try{for(const t of items){try{const start=await db.rpc('staff_delete_participant',{p_team_id:t.id,p_finalize:false});if(start.error)throw start.error;const paths=start.data?.photo_paths;if(!Array.isArray(paths))throw Error('Réponse de préparation invalide');for(let i=0;i<paths.length;i+=100){const result=await db.storage.from('photos-prises').remove(paths.slice(i,i+100));if(result.error&&result.error.code!=='23505')throw result.error;if(result.error){const replay=await db.from('catches').select('id').eq('id',item.id).maybeSingle();if(replay.error||!replay.data)throw result.error}}const done=await db.rpc('staff_delete_participant',{p_team_id:t.id,p_finalize:true});if(done.error)throw done.error;selectedTeams.delete(t.id);deleted++}catch(e){failures.push(`${t.team_name} : ${e.message}`)}}await loadRegistrations();await loadStaff();message('participantDeleteMsg',failures.length?`${deleted} compte(s) supprimé(s). ${failures.length} échec(s) : ${failures.join(' | ')}. Les suppressions engagées peuvent être reprises avec la même sélection.`:`${deleted} compte(s), équipes et données associées supprimés définitivement.`,failures.length>0)}finally{loading=false;updateTeamSelection();updateSelection();updateTrashSelection()}}
$('deleteParticipants').onclick=deleteParticipants;
$('rememberMe').checked=rememberEnabled();
$('logout').onclick=async()=>{try{await detachNotifications()}catch{rememberAlert('staff-push-owner',null)}configureRemember(false);$('rememberMe').checked=false;$('password').value='';explicitLogout=true;forgetAccount();await refreshAccount(null);const {error}=await db.auth.signOut({scope:'local'});if(error)notice('Déconnexion locale effectuée.',false)};
db.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;setTimeout(()=>{showTab('account');$('recoveryForm').classList.remove('hidden');$('signedOut').classList.add('hidden');$('signedIn').classList.add('hidden');$('newPassword').focus()},0);return}if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='TOKEN_REFRESHED')setTimeout(()=>{if(explicitLogout&&event!=='SIGNED_OUT')return;if(!navigator.onLine&&!explicitLogout){restoreCachedAccount(session?.user?.id);return}refreshAccount(session?.user||null)},0)});
let previewUrl=null,photoSource=null,galleryAllowed=false,gallerySettingKnown=false,gallerySaving=false,galleryRequest=null;
function setPhoto(blob){if(previewUrl)URL.revokeObjectURL(previewUrl);photoBlob=blob;previewUrl=URL.createObjectURL(blob);$('preview').src=previewUrl;$('preview').classList.remove('hidden');updateCatchAccess();$('photoInfo').textContent='Photo prête · '+Math.round(blob.size/1024)+' Ko. Vérifie la photo et la taille avant l’envoi.'}
function clearPhoto(){if(webcamDialog.open)stopWebcam();photoBlob=null;photoSource=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('preview').removeAttribute('src');$('preview').classList.add('hidden');$('send').disabled=true;$('photoInfo').textContent='Aucune photo sélectionnée.'}
let cameraAttempt=0;
const webcamDialog=$('webcamDialog'),webcamVideo=$('webcamVideo');
function stopWebcam(){
 cameraAttempt++;
 const stream=webcamVideo.srcObject;
 if(stream)for(const track of stream.getTracks())track.stop();
 webcamVideo.srcObject=null;
 if(webcamDialog.open)webcamDialog.close();
}
function cameraError(error){
 if(error.name==='NotAllowedError'||error.name==='SecurityError')return 'Accès à la webcam refusé. Autorise la caméra dans les permissions du site, puis réessaie.';
 if(error.name==='NotFoundError')return 'Aucune webcam détectée. Branche une caméra, puis réessaie.';
 if(error.name==='NotReadableError')return 'La webcam est indisponible. Ferme les autres applications qui l’utilisent, puis réessaie.';
 return 'Impossible d’ouvrir la webcam. Vérifie la caméra et les permissions de ton navigateur.';
}
$('nativeCamera').onclick=async()=>{
 if(!user)restoreCachedAccount();
 if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){
  $('cameraFile').click();return;
 }
 // Phones in desktop mode can advertise Linux or macOS instead of Android or iOS.
 const touchMobile=navigator.maxTouchPoints>1&&/Linux|Macintosh|Mac OS/i.test(navigator.userAgent)&&!/CrOS/i.test(navigator.userAgent);
 if(touchMobile&&(!navigator.mediaDevices?.getUserMedia||(navigator.mediaDevices.getSupportedConstraints&&!navigator.mediaDevices.getSupportedConstraints().facingMode))){
  $('cameraFile').click();return;
 }
 if(!navigator.mediaDevices?.getUserMedia){message('catchMsg','Ce navigateur ne permet pas d’ouvrir la webcam. Ouvre le site en HTTPS dans un navigateur compatible.',true);return}
 if(webcamDialog.open)return;
 const attempt=++cameraAttempt;
 $('webcamSnap').disabled=true;
 $('webcamStatus').textContent='Autorise l’accès à ta webcam dans le navigateur.';
 webcamDialog.showModal();
 try{
  const facingMode=touchMobile?{exact:'environment'}:{ideal:'environment'};
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode},audio:false});
  if(attempt!==cameraAttempt||!webcamDialog.open){for(const track of stream.getTracks())track.stop();return}
  webcamVideo.srcObject=stream;
  await webcamVideo.play();
  if(attempt!==cameraAttempt)return;
  $('webcamStatus').textContent='Cadre le poisson et la toise, puis prends la photo.';
  $('webcamSnap').disabled=false;
 }catch(error){
  if(attempt!==cameraAttempt)return;
  stopWebcam();
  if(touchMobile&&['OverconstrainedError','NotFoundError'].includes(error.name)){
   message('catchMsg','Caméra arrière indisponible dans ce mode. Désactive « Version pour ordinateur » puis appuie sur « Prendre une photo ».',true);
  }else message('catchMsg',cameraError(error),true);
 }
};
$('webcamSnap').onclick=async()=>{
 if(!webcamDialog.open||!webcamVideo.videoWidth||!webcamVideo.videoHeight)return;
 const attempt=cameraAttempt;
 $('webcamSnap').disabled=true;
 try{
  const canvas=$('canvas'),scale=Math.min(1,1600/Math.max(webcamVideo.videoWidth,webcamVideo.videoHeight));
  canvas.width=Math.round(webcamVideo.videoWidth*scale);
  canvas.height=Math.round(webcamVideo.videoHeight*scale);
  canvas.getContext('2d').drawImage(webcamVideo,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
  if(attempt!==cameraAttempt)return;
  if(!blob)throw Error();
  photoSource='camera';setPhoto(blob);stopWebcam();message('catchMsg','Photo prise. Vérifie-la avant l’envoi.');
 }catch{
  if(attempt===cameraAttempt){$('webcamSnap').disabled=false;$('webcamStatus').textContent='Capture impossible. Réessaie de prendre la photo.'}
 }
};
$('webcamCancel').onclick=stopWebcam;
webcamDialog.addEventListener('cancel',event=>{event.preventDefault();stopWebcam()});
window.addEventListener('pagehide',stopWebcam);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&webcamDialog.open)stopWebcam()});

async function importPhoto(input){const source=input.id==='galleryFile'?'gallery':'camera',uid=user?.id;if(source==='gallery'&&(!await refreshPhotoSettings()||!galleryAllowed)){input.value='';return message('catchMsg','Le staff n’autorise pas les photos de la galerie.',true)}const file=input.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){input.value='';return message('catchMsg','Sélectionne une image.',true)}if(file.size>25*1024*1024){input.value='';return message('catchMsg','Image trop volumineuse (25 Mo maximum).',true)}try{const url=URL.createObjectURL(file);const image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});const c=$('canvas'),scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));c.width=Math.round(image.naturalWidth*scale);c.height=Math.round(image.naturalHeight*scale);c.getContext('2d').drawImage(image,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.85));if(!blob)throw Error();if(user?.id!==uid)return;if(source==='gallery'&&!galleryAllowed)return message('catchMsg','La galerie a été désactivée par le staff.',true);setPhoto(blob);photoSource=source;message('catchMsg','Photo sélectionnée.')}finally{URL.revokeObjectURL(url)}}catch(e){message('catchMsg','Ce format ne peut pas être lu. Essaie une photo JPEG ou l’appareil photo.',true)}finally{input.value=''}}
$('cameraFile').onchange=()=>importPhoto($('cameraFile'));
$('galleryFile').onchange=()=>importPhoto($('galleryFile'));
$('galleryPhoto').onclick=()=>{if(!user||!navigator.onLine||!catchesAreOpen()||!galleryAllowed||!gallerySettingKnown)return;$('galleryFile').click()};
let syncing=false;
let queuePhotoUrls=[],queueViewVersion=0;
function setQueueProgress(text,kind='local'){const node=$('queueProgress');if(!node)return;node.textContent=text;node.dataset.kind=kind;}

function queueDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('sf2027-mobile',1);req.onupgradeneeded=()=>req.result.createObjectStore('catches',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function queueOp(mode,action){const idb=await queueDB();try{return await new Promise((resolve,reject)=>{const tx=idb.transaction('catches',mode),req=action(tx.objectStore('catches'));let result;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{idb.close()}}
async function showQueue(){
 const version=++queueViewVersion,owner=user?.id;
 try{
  const all=await queueOp('readonly',store=>store.getAll());
  if(version!==queueViewVersion||owner!==user?.id)return;
  for(const url of queuePhotoUrls)URL.revokeObjectURL(url);
  queuePhotoUrls=[];
  const mine=all.filter(c=>c.userId===owner),box=$('queueStatus');
  box.replaceChildren();
  if(!mine.length){box.textContent='Aucune prise en attente sur cet appareil.';setQueueProgress('Toutes les prises locales ont été transmises ou aucune n’est en attente.','ok');return}
  if(!syncing)setQueueProgress(`${mine.length} prise${mine.length>1?'s':''} conservée${mine.length>1?'s':''} sur cet appareil · envoi automatique dès que possible.`,'local');
  for(const item of mine){
   const details=document.createElement('details'),summary=document.createElement('summary');
   summary.textContent=item.species+' · '+item.mm+' mm · À transmettre au staff';
   details.append(summary);
   if(item.capturedAt){const when=document.createElement('p');when.textContent='Heure du téléphone : '+new Date(item.capturedAt).toLocaleString('fr-FR');details.append(when)}
   if(item.blob){const img=document.createElement('img'),url=URL.createObjectURL(item.blob);queuePhotoUrls.push(url);img.src=url;img.alt='Photo conservée sur ce téléphone';img.className='photo';details.append(img)}
   box.append(details);
  }
 }catch{$('queueStatus').textContent='Le stockage local est indisponible. Garde la photo originale.';setQueueProgress('Impossible de lire les prises sauvegardées sur cet appareil.','error')}
}
// La file reste sur le telephone tant que Supabase n'a pas confirme la prise.
let lastQueueError='',lastQueueAttempt=0;
async function syncQueue(){
 if(syncing||!user||!navigator.onLine||(typeof explicitLogout!=='undefined'&&explicitLogout))return;
 const owner=user.id;
 syncing=true;lastQueueAttempt=Date.now();$('syncQueue').disabled=true;
 if(typeof setQueueProgress==='function')setQueueProgress('Synchronisation automatique des prises…','sending');
 let sent=0,failed=0,waiting=0,reason='';
 try{
  if(db.auth?.getSession){const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.user||session.user.id!==owner){reason='Connexion expirée : reconnecte-toi pour transmettre les prises.';return}}
  if(!await refreshCatchWindow()||!catchesAreOpen()){reason='Prises fermées ou horaires indisponibles : envoi suspendu. Les photos sont conservées.';return}
  const all=await queueOp('readonly',store=>store.getAll());
  for(const item of all.filter(c=>c.userId===owner)){
   if(user?.id!==owner||(typeof explicitLogout!=='undefined'&&explicitLogout))break;
   if(!team||team.id!==item.teamId||team.registration_status!=='confirmed'){waiting++;continue}
   try{
    const existing=await db.from('catches').select('id').eq('id',item.id).maybeSingle();
    if(existing.error)throw existing.error;
    if(!existing.data){
     if(item.source==='gallery'&&(!gallerySettingKnown||!galleryAllowed)){waiting++;reason='Une photo de galerie attend l’autorisation du staff.';continue}
     const upload=await db.storage.from('photos-prises').upload(item.path,item.blob,{contentType:'image/jpeg',upsert:false});
     if(upload.error&&String(upload.error.statusCode)!=='409'&&!/already exists|duplicate|resource already exists/i.test(upload.error.message||''))throw upload.error;
     const result=await db.from('catches').insert({id:item.id,team_id:item.teamId,species:item.species,length_mm:item.mm,photo_path:item.path,status:'pending',...(item.capturedAt?{declared_on_device_at:item.capturedAt}:{})});
     if(result.error&&result.error.code!=='23505')throw result.error;
     if(result.error){const replay=await db.from('catches').select('id').eq('id',item.id).maybeSingle();if(replay.error||!replay.data)throw result.error}
    }
    // Ne supprimer le brouillon qu'apres confirmation explicite cote serveur.
    await queueOp('readwrite',store=>store.delete(item.id));sent++;
   }catch(e){failed++;lastQueueError=e?.message||'Erreur réseau';/* Les autres prises restent envoyables. */}
  }
  if(sent){message('catchMsg',`${sent} prise${sent>1?'s':''} transmise${sent>1?'s':''} au staff · en attente de validation.`);if(team)loadMine().catch(()=>{})}
  if(failed)reason=`${failed} prise${failed>1?'s':''} non transmise${failed>1?'s':''} · nouvel essai automatique. ${lastQueueError}`;
  else if(waiting&&!reason)reason=`${waiting} prise${waiting>1?'s':''} en attente de confirmation de l’équipe.`;
 }catch(e){lastQueueError=e?.message||'Erreur réseau';reason='Envoi momentanément indisponible : nouvel essai automatique. '+lastQueueError}
 finally{
  syncing=false;$('syncQueue').disabled=!navigator.onLine;
  await showQueue();
  if(reason&&typeof setQueueProgress==='function')setQueueProgress(reason,failed?'error':'local');
  else if(sent&&typeof setQueueProgress==='function')setQueueProgress('Toutes les prises éligibles ont été transmises au staff.','ok');
 }
}
// Retente en arriere-plan uniquement lorsque cette page est ouverte ;
// les navigateurs mobiles ne garantissent pas l'execution si l'app est fermee.
function autoSyncPendingCatches(){if(!document.hidden&&navigator.onLine&&user&&!explicitLogout&&!syncing)syncQueue().catch(()=>{});}
if(typeof setInterval==='function')setInterval(autoSyncPendingCatches,20000);
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoSyncPendingCatches()});
if(typeof window!=='undefined')window.addEventListener('focus',autoSyncPendingCatches);
$('syncQueue').onclick=syncQueue;
window.addEventListener('offline',()=>{saveAccount();updateNetworkStatus();if(user)notice('Mode hors ligne : compte et équipe conservés.');});
window.addEventListener('online',async()=>{updateNetworkStatus();if(explicitLogout)return;try{const {data:{session},error}=await db.auth.getSession();if(error)throw error;await refreshAccount(session?.user||null);await syncQueue()}catch(e){notice('Réseau revenu : reconnecte-toi si nécessaire. Tes prises en attente restent sur cet appareil.',true)}});
$('send').onclick=async()=>{
 if(catchSubmitting||!user||team?.registration_status!=='confirmed')return;
 const mm=Number($('mm').value),fish=$('fish').value;
 if(!Number.isInteger(mm)||mm<1||mm>3000)return message('catchMsg','Saisis une taille entière en mm (1 à 3000).',true);
 if(!species.includes(fish)||!photoBlob)return message('catchMsg','Vérifie l’espèce et prends une photo.',true);
 if(navigator.onLine&&catchWindow&&!catchesAreOpen())return message('catchMsg','Les prises sont fermées.',true);
 const id=crypto.randomUUID(),item={id,userId:user.id,teamId:team.id,path:team.id+'/'+id+'.jpg',species:fish,mm,blob:photoBlob,source:photoSource,capturedAt:new Date().toISOString()};
 catchSubmitting=true;updateCatchAccess();
 try{
  await queueOp('readwrite',store=>store.put(item));
  clearPhoto();$('mm').value='';paintLength();
  message('catchMsg','Photo et prise enregistrées sur ce téléphone. Envoi au staff en cours si le réseau est disponible.');setQueueProgress('Enregistrée sur cet appareil · pas encore reçue par le staff.','local');
  await showQueue();await syncQueue();
 }catch(e){message('catchMsg','Enregistrement impossible : '+e.message,true)}
 finally{catchSubmitting=false;updateCatchAccess()}
};
function stateText(s){return {pending:'En attente',approved:'Validée',rejected:'Refusée'}[s]||s}
function photoFilename(c){return `equipe-${c.teams?.team_number??'sans-numero'}-${String(c.species).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]/g,'-')}-${c.length_mm}mm-${c.id}.jpg`}
async function downloadStaffPhoto(c,control){if(!staff||!user)return;if(!navigator.onLine)return message('staffMsg','Le téléchargement des photos sauvegardées nécessite du réseau.',true);if(!c.photo_path)return message('staffMsg','Cette prise ne possède pas de photo sauvegardée.',true);control.setAttribute('aria-disabled','true');try{const {data,error}=await db.storage.from('photos-prises').download(c.photo_path);if(error)throw error;if(!data)throw Error('Photo introuvable');const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download=photoFilename(c);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('staffMsg','Téléchargement de la photo lancé.')}catch(e){message('staffMsg','Téléchargement impossible : '+e.message,true)}finally{control.removeAttribute('aria-disabled')}}
function photoDownloadControl(c){const link=document.createElement('a');link.href='#';link.className='photoDownload';link.textContent=' Télécharger la photo';link.onclick=event=>{event.preventDefault();if(link.getAttribute('aria-disabled')!=='true')downloadStaffPhoto(c,link)};return link}
async function signedPhoto(path){if(!path)return null;const {data,error}=await db.storage.from('photos-prises').createSignedUrl(path,180);return error?null:data.signedUrl}
async function loadMine(){if(!team)return;if(!navigator.onLine){try{$('mine').textContent=sessionStorage.getItem('sf2027-mine-'+user.id)||'Les prises envoyées seront actualisées au retour du réseau.'}catch(e){}return;}const {data,error}=await db.from('catches').select('id,species,length_mm,status,created_at').eq('team_id',team.id).is('deleted_at',null).order('created_at',{ascending:false}).limit(100);$('mine').innerHTML=error?`<p class="bad">${esc(error.message)}</p>`:data.length?data.map(c=>`<div class="item">${esc(c.species)} · ${c.length_mm} mm · <strong>${stateText(c.status)}</strong></div>`).join(''):'<p class="muted">Aucune prise envoyée.</p>'}
let bestRankFingerprint=null;
let rankingRequest=0,rankingPhotoVersion=0,teamPhotoVersion=0,teamPhotoNumber=null,teamPhotoOffset=0,teamPhotoBusy=false;
function containsEmail(name){
 return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(name||'');
}
function rankingTeamName(name){
 return containsEmail(name)?'Équipe':name;
}
async function loadRanking(){if(user)refreshCatchWindow();else paintRankingTimer();const version=++rankingRequest;if(!navigator.onLine){$('rankingStatus').textContent='Le classement nécessite une connexion au réseau.';return}$('rankingStatus').textContent='Chargement du classement…';try{const publicView=!user;const {data,error}=await db.rpc(publicView?'get_public_ranking':'get_ranking_details');if(version!==rankingRequest)return;if(error)throw error;const {data:visible,error:visibilityError}=await db.rpc('is_ranking_public');if(version!==rankingRequest)return;if(visibilityError)throw visibilityError;applyRankingVisibility(visible);if(visible===false&&!staff){$('ranking').replaceChildren();clearRankingPhotos();$('rankingStatus').textContent='Classement masqué par l’organisation.';return}loadRankingCoefficients();$('rankingStatus').textContent=data?.length?'Classement provisoire · Équipes confirmées · Actualisé à '+new Date().toLocaleTimeString('fr-FR'):'Aucune équipe confirmée pour le moment.';const rankingHtml=(data||[]).map((r,i)=>`<tr><td data-label="Rang">${i+1}</td><td data-label="Équipe">${Number.isInteger(r.team_number)?`<button type="button" class="rankTeamButton" data-team-number="${r.team_number}" aria-label="Voir les prises de ${esc(rankingTeamName(r.team_name))}">${esc(rankingTeamName(r.team_name))}</button>`:esc(rankingTeamName(r.team_name))} <small>n° ${r.team_number??'—'}</small></td><td data-label="Prises">${r.catch_count}</td><td data-label="Espèces">${r.species_count}/5</td><td data-label="Points prises">${r.base_points}</td><td data-label="Bonus">+${r.bonus_points}</td><td data-label="Total"><strong>${r.points}</strong></td></tr>`).join('');if($('ranking').innerHTML!==rankingHtml)$('ranking').innerHTML=rankingHtml;await loadBestRankCatches()}catch(e){if(version===rankingRequest)$('rankingStatus').textContent='Le classement est momentanément indisponible. Réessaie dans quelques instants.'}}

let staffLoadVersion=0,staffDraftDirty=false;
const selectedCatches=new Set();let activeCatchIds=[];
const selectedTrash=new Set();let trashCatches=[];
async function loadStaff(){if(!staff)return;if(!navigator.onLine){message('staffMsg','La gestion staff nécessite du réseau. Le compte reste connecté sur cet appareil.',true);return;}pendingApprovalIds=[];paintBulkApproval();const version=++staffLoadVersion;loadRegistrations();loadCoefficientSettings();refreshCatchWindow(true);$('pending').textContent='Chargement…';try{const settings=await db.from('contest_settings').select('ranking_visible').eq('id',1).maybeSingle();if(settings.error)throw settings.error;const data=[];for(let offset=0;;offset+=200){const page=await db.from('catches').select('id,team_id,species,length_mm,photo_path,status,created_at,declared_on_device_at,reviewed_at,deleted_at,purge_started_at,teams(team_number,team_name)').order('created_at',{ascending:false}).order('id').range(offset,offset+199);if(page.error)throw page.error;data.push(...page.data);if(page.data.length<200)break}if(version!==staffLoadVersion||!staff||!user)return;activeCatchIds=data.filter(c=>!c.deleted_at&&c.status!=='pending').map(c=>c.id);for(const id of selectedCatches)if(!activeCatchIds.includes(id))selectedCatches.delete(id);applyRankingVisibility(!!settings.data?.ranking_visible);const pending=data.filter(c=>!c.deleted_at&&c.status==='pending'),history=data.filter(c=>!c.deleted_at&&c.status!=='pending'),trash=data.filter(c=>c.deleted_at);trashCatches=trash;const trashIds=new Set(trash.map(c=>c.id));for(const id of selectedTrash)if(!trashIds.has(id))selectedTrash.delete(id);$('pending').replaceChildren();$('history').replaceChildren();$('trash').replaceChildren();if(!trash.length)$('trash').textContent='La corbeille est vide.';for(const c of trash)$('trash').append(trashItem(c));if(!pending.length)$('pending').textContent='Aucune prise en attente.';if(!history.length)$('history').textContent='Aucun historique.';for(const c of pending)$('pending').append(catchEditor(c,false));for(const c of history)$('history').append(catchEditor(c,true));staffDraftDirty=false;coefficientDraftDirty=false;pendingApprovalIds=pending.map(c=>c.id);paintPendingBadge(pending.length);for(const id of selectedPendingCatches)if(!pendingApprovalIds.includes(id))selectedPendingCatches.delete(id);paintBulkApproval();updateSelection();updateTrashSelection();await hydrateAIReviews(version)}catch(e){if(version===staffLoadVersion){$('pending').textContent='Chargement impossible : '+e.message;$('history').replaceChildren();$('trash').replaceChildren();activeCatchIds=[];selectedCatches.clear();trashCatches=[];selectedTrash.clear();updateSelection();updateTrashSelection()}}}
function catchEditor(c,collapsed){const div=document.createElement(collapsed?'details':'div');div.className='item';const heading=document.createElement(collapsed?'summary':'strong');heading.textContent=`Équipe ${c.teams?.team_number??'—'} — ${c.teams?.team_name??''} · ${c.species} · ${c.length_mm} mm · ${stateText(c.status)}${!species.includes(c.species)?' · Hors concours':''}`;const selector=document.createElement('label');selector.style.cssText='display:flex;align-items:center;gap:10px;margin:0 0 12px;min-height:44px';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='catchSelect';checkbox.dataset.catchId=c.id;checkbox.style.cssText='width:24px;min-height:24px;margin:0;flex:none';checkbox.checked=selectedCatches.has(c.id);checkbox.setAttribute('aria-label',`Sélectionner ${c.species} ${c.length_mm} mm, équipe ${c.teams?.team_number??'—'}`);checkbox.onchange=()=>{if(checkbox.checked)selectedCatches.add(c.id);else selectedCatches.delete(c.id);updateSelection()};const selectorText=document.createElement('span');selectorText.textContent='Sélectionner cette prise';selector.append(checkbox,selectorText);div.append(heading);if(collapsed){const wrapper=document.createElement('div');wrapper.className='item';div.className='';wrapper.append(selector,div);div._selectionWrapper=wrapper}else{checkbox.className='pendingSelect';checkbox.checked=selectedPendingCatches.has(c.id);checkbox.onchange=()=>{if(checkbox.checked)selectedPendingCatches.add(c.id);else selectedPendingCatches.delete(c.id);paintBulkApproval()};div.prepend(selector)}const body=document.createElement('div');const id='edit-'+c.id;body.innerHTML=`<p class="muted">Reçue le ${esc(new Date(c.created_at).toLocaleString('fr-FR'))}${c.declared_on_device_at?' · Heure du téléphone : '+esc(new Date(c.declared_on_device_at).toLocaleString('fr-FR')):''}${c.reviewed_at?' · Dernière décision le '+esc(new Date(c.reviewed_at).toLocaleString('fr-FR')):''}</p><div class="staffPhoto"><p class="muted">Chargement de la photo…</p></div><div class="grid"><div><label for="${id}-fish">Espèce</label><select id="${id}-fish" class="fishEdit">${!species.includes(c.species)?`<option selected disabled value="${esc(c.species)}">${esc(c.species)} (hors concours)</option>`:''}${species.map(s=>`<option ${s===c.species?'selected':''}>${s}</option>`).join('')}</select></div><div><label for="${id}-mm">Taille (mm)</label><input id="${id}-mm" class="mmEdit" type="number" inputmode="numeric" min="1" max="3000" step="1" value="${c.length_mm}"></div></div><label for="${id}-status">Statut</label><select id="${id}-status" class="statusEdit"><option value="pending">En attente</option><option value="approved">Validée</option><option value="rejected">Refusée</option></select><p class="muted">Seules les prises validées comptent dans le classement. Toute correction d’une prise validée modifie ses points.</p><div class="actions"><button class="saveCatch">Enregistrer les modifications</button><button class="trashCatch danger"> Supprimer la prise</button>${c.status==='pending'?'<button class="approve">Valider</button><button class="reject danger">Refuser</button>':''}</div><p class="editMsg" role="status"></p>`;div.append(body);
 if(c.status==='pending'){
  const actions=document.createElement('div');actions.className='actions';
  actions.append(body.querySelector('.approve'),body.querySelector('.reject'));
  body.querySelector('.grid').after(actions);
 }
 attachCatchAI(c,body);body.querySelector('.statusEdit').value=c.status;body.querySelector('.trashCatch').onclick=()=>trashCatch(c,false,body);body.querySelector('.saveCatch').onclick=()=>review(c,body,body.querySelector('.statusEdit').value);if(c.status==='pending'){body.querySelector('.approve').onclick=()=>review(c,body,'approved');body.querySelector('.reject').onclick=()=>review(c,body,'rejected')}let photoLoaded=false;async function loadPhoto(){if(photoLoaded)return;photoLoaded=true;const url=await signedPhoto(c.photo_path);const box=body.querySelector('.staffPhoto');box.replaceChildren();if(url){const img=document.createElement('img');img.className='photo';img.src=url;img.alt='Photo de la prise à contrôler';box.append(img)}else box.textContent='Aperçu indisponible.';if(c.photo_path)box.append(photoDownloadControl(c))}if(collapsed)div.addEventListener('toggle',()=>{if(div.open)loadPhoto()});else loadPhoto();return div._selectionWrapper||div}
async function review(c,div,status){if(loading)return;const feedback=div.querySelector('.editMsg');const fail=text=>{feedback.textContent=text;feedback.className='editMsg bad'};const mm=Number(div.querySelector('.mmEdit').value),fish=div.querySelector('.fishEdit').value;if(!Number.isInteger(mm)||mm<1||mm>3000)return fail('Saisis une taille entière de 1 à 3000 mm.');if((!species.includes(fish)&&fish!==c.species)||!['pending','approved','rejected'].includes(status))return fail('Espèce ou statut invalide.');if(fish===c.species&&mm===c.length_mm&&status===c.status)return fail('Aucune modification à enregistrer.');if(!confirm(`Enregistrer cette prise : ${fish}, ${mm} mm, ${stateText(status)} ? Le classement sera recalculé selon le statut.`))return;loading=true;div.querySelectorAll('button').forEach(b=>b.disabled=true);try{let query=db.from('catches').update({species:fish,length_mm:mm,status}).eq('id',c.id).eq('status',c.status).eq('species',c.species).eq('length_mm',c.length_mm).is('deleted_at',null);query=c.reviewed_at?query.eq('reviewed_at',c.reviewed_at):query.is('reviewed_at',null);const {data,error}=await query.select('id');if(error)throw error;if(!data?.length)throw Error('Cette prise a été modifiée par un autre membre du staff. Clique sur Actualiser avant de recommencer.');message('staffMsg','Prise modifiée. Le classement tient compte des nouvelles valeurs pour les prises validées.');await loadStaff()}catch(e){fail(e.message)}finally{loading=false;div.querySelectorAll('button').forEach(b=>b.disabled=false)}}
function updateSelection(){$('historyControls').classList.toggle('hidden',activeCatchIds.length===0);const count=selectedCatches.size;$('selectionCount').textContent=count?`${count} prise(s) sélectionnée(s).`:'Aucune prise sélectionnée.';$('deleteSelection').disabled=loading||count===0;const all=$('selectAllCatches');all.checked=activeCatchIds.length>0&&count===activeCatchIds.length;all.indeterminate=count>0&&count<activeCatchIds.length;all.disabled=loading||activeCatchIds.length===0;document.querySelectorAll('.catchSelect').forEach(box=>{box.checked=selectedCatches.has(box.dataset.catchId);box.disabled=loading})}
$('selectAllCatches').onchange=()=>{selectedCatches.clear();if($('selectAllCatches').checked)activeCatchIds.forEach(id=>selectedCatches.add(id));updateSelection()};
async function deleteSelected(){if(loading||!staff||!selectedCatches.size)return;const ids=[...selectedCatches];if(!confirm(`Supprimer les ${ids.length} prises sélectionnées ? Leurs points seront retirés. Tu pourras les restaurer dans la corbeille.`))return;loading=true;updateSelection();let deleted=0;const failures=[];try{for(const id of ids){try{const {error}=await db.rpc('staff_trash_catch',{p_catch_id:id,p_restore:false});if(error)throw error;selectedCatches.delete(id);deleted++}catch(e){failures.push(e.message)}$('selectionCount').textContent=`Traitement : ${deleted+failures.length} / ${ids.length}`;}await loadStaff();message('staffMsg',failures.length?`${deleted} prise(s) supprimée(s), ${failures.length} échec(s). Les prises restantes sont sélectionnées : ${failures[0]}`:`${deleted} prise(s) supprimée(s). Elles sont récupérables dans la corbeille.`,failures.length>0)}finally{loading=false;updateSelection()}}
$('deleteSelection').onclick=deleteSelected;
function updateTrashSelection(){$('trashControls').classList.toggle('hidden',trashCatches.length===0);const count=selectedTrash.size;$('trashSelectionCount').textContent=count?`${count} prise(s) sélectionnée(s) dans la corbeille.`:'Aucune prise sélectionnée.';$('purgeSelection').disabled=loading||count===0;const all=$('selectAllTrash');all.checked=trashCatches.length>0&&count===trashCatches.length;all.indeterminate=count>0&&count<trashCatches.length;all.disabled=loading||!trashCatches.length;document.querySelectorAll('.trashSelect').forEach(box=>{box.checked=selectedTrash.has(box.dataset.catchId);box.disabled=loading})}
$('selectAllTrash').onchange=()=>{selectedTrash.clear();if($('selectAllTrash').checked)trashCatches.forEach(c=>selectedTrash.add(c.id));updateTrashSelection()};
async function purgeSelectedTrash(){if(loading||!staff||!selectedTrash.size)return;const items=trashCatches.filter(c=>selectedTrash.has(c.id));if(!confirm(`SUPPRESSION DÉFINITIVE de ${items.length} prise(s) et de leurs photos. Aucune restauration ne sera possible. Confirmer ?`))return;loading=true;updateSelection();updateTrashSelection();let deleted=0,failed=0;try{for(const c of items){const div=$('trash-'+c.id);if(div&&await purgeCatch(c,div,{bulk:true,confirmed:true}))deleted++;else failed++;$('trashSelectionCount').textContent=`Traitement : ${deleted+failed} / ${items.length}`;}await loadStaff();message('staffMsg',failed?`${deleted} prise(s) supprimée(s) définitivement, ${failed} échec(s). Les prises restantes restent sélectionnées pour réessayer.`:`${deleted} prise(s) et leurs photos supprimées définitivement.`,failed>0)}finally{loading=false;updateSelection();updateTrashSelection()}}
$('purgeSelection').onclick=purgeSelectedTrash;
function trashItem(c){const div=document.createElement('div');div.className='item';div.id='trash-'+c.id;const selector=document.createElement('label');selector.style.cssText='display:flex;align-items:center;gap:10px;min-height:44px';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='trashSelect';checkbox.dataset.catchId=c.id;checkbox.style.cssText='width:24px;min-height:24px;margin:0';checkbox.checked=selectedTrash.has(c.id);checkbox.onchange=()=>{if(checkbox.checked)selectedTrash.add(c.id);else selectedTrash.delete(c.id);updateTrashSelection()};const selectorText=document.createElement('span');selectorText.textContent='Sélectionner cette prise';selector.append(checkbox,selectorText);div.append(selector);const label=document.createElement('p');label.textContent=`Équipe ${c.teams?.team_number??'—'} — ${c.teams?.team_name??''} · ${c.species} · ${c.length_mm} mm · Supprimée le ${new Date(c.deleted_at).toLocaleString('fr-FR')}`;const actions=document.createElement('div');actions.className='actions';const button=document.createElement('button');button.className='secondary';button.textContent='Restaurer la prise';button.disabled=!!c.purge_started_at;button.onclick=()=>trashCatch(c,true,div);const purge=document.createElement('button');purge.className='danger';purge.textContent=c.purge_started_at?'Terminer la suppression définitive':'Supprimer définitivement';purge.onclick=()=>purgeCatch(c,div);const feedback=document.createElement('p');feedback.className='editMsg';feedback.setAttribute('role','status');actions.append(button,purge);div.append(label,actions);if(c.photo_path&&!c.purge_started_at)div.append(photoDownloadControl(c));div.append(feedback);return div}
async function purgeCatch(c,div,options={}){if((loading&&!options.bulk)||!staff)return false;if(!options.confirmed&&!confirm(`SUPPRESSION DÉFINITIVE : ${c.species}, ${c.length_mm} mm, équipe ${c.teams?.team_number??'—'}. La prise et sa photo seront effacées sans possibilité de restauration. Confirmer ?`))return false;if(!options.bulk)loading=true;updateSelection();updateTrashSelection();div.querySelectorAll('button').forEach(b=>b.disabled=true);let prepared=false;try{const start=await db.rpc('staff_purge_catch',{p_catch_id:c.id,p_finalize:false});if(start.error)throw start.error;prepared=true;if(start.data){const removal=await db.storage.from('photos-prises').remove([start.data]);if(removal.error)throw removal.error}const done=await db.rpc('staff_purge_catch',{p_catch_id:c.id,p_finalize:true});if(done.error)throw done.error;selectedTrash.delete(c.id);if(!options.bulk){message('staffMsg','Prise et photo supprimées définitivement.');await loadStaff()}return true}catch(e){const feedback=div.querySelector('.editMsg');feedback.textContent='Suppression incomplète : '+e.message+(prepared?' La restauration est bloquée. Clique sur Terminer la suppression définitive pour réessayer.':'');feedback.className='editMsg bad';if(prepared){c.purge_started_at=true;const buttons=div.querySelectorAll('button');buttons[0].disabled=true;buttons[1].textContent='Terminer la suppression définitive'}return false}finally{if(!options.bulk)loading=false;const buttons=div.querySelectorAll('button');buttons[0].disabled=!!c.purge_started_at;buttons[1].disabled=false;updateSelection();updateTrashSelection()}}
async function trashCatch(c,restore,div){if(loading||!staff)return;const question=restore?'Restaurer cette prise ? Elle sera remise en attente de validation.':`Supprimer la prise ${c.species} de ${c.length_mm} mm ? Ses points seront retirés et elle restera récupérable dans la corbeille.`;if(!confirm(question))return;loading=true;div.querySelectorAll('button').forEach(b=>b.disabled=true);try{const {error}=await db.rpc('staff_trash_catch',{p_catch_id:c.id,p_restore:restore});if(error)throw error;message('staffMsg',restore?'Prise restaurée et remise en attente.':'Prise supprimée. Elle ne compte plus dans le classement.');await loadStaff()}catch(e){const feedback=div.querySelector('.editMsg');feedback.textContent='Action impossible : '+e.message;feedback.className='editMsg bad'}finally{loading=false;div.querySelectorAll('button').forEach(b=>b.disabled=false)}}
$('refresh').onclick=()=>{if((staffDraftDirty||coefficientDraftDirty)&&!confirm('Actualiser et abandonner les modifications non enregistrées ?'))return;loadStaff()};

let chatTimer=null,chatBusy=false,chatSending=false,chatFingerprint='',chatReadVersion=0;
let badgeRequest=0;
function paintChatBadge(unread){
 for(const button of document.querySelectorAll('[data-tab="chatPanel"]')){
  button.classList.toggle('chatUnread',unread);
  button.setAttribute('aria-label',unread?'Messages, nouveaux messages non lus':'Messages');button.setAttribute('data-unread',unread?'oui':'non');
 }
}
async function refreshChatBadge(displayedId=null){
 const request=++badgeRequest,uid=user?.id;
 if(!chatAllowed()){paintChatBadge(false);return}
 if(document.hidden||!navigator.onLine)return;
 try{
  const {data,error}=await db.rpc('contest_chat_unread',{displayed_id:displayedId});
  if(!error&&request===badgeRequest&&uid===user?.id&&chatAllowed())paintChatBadge(data===true);
 }catch{/* Conserver le dernier état connu en cas de coupure. */}
}
function chatAllowed(){return !!user&&(staff||!!team&&!['rejected','cancelled'].includes(team.registration_status))}
function stopChatPolling(){if(chatTimer){clearInterval(chatTimer);chatTimer=null}chatReadVersion++}
function startChatPolling(){const allowed=chatAllowed();$('chatForm').classList.toggle('hidden',!allowed);$('chatAccess').textContent=allowed?'':user?'Le chat est réservé aux équipes inscrites et au staff. Inscris ton duo dans Compte.':'Connecte-toi pour accéder au chat.';if(!allowed){$('chatMessages').replaceChildren();chatFingerprint='';return}loadChat();chatTimer=setInterval(()=>{if(!document.hidden&&tab==='chatPanel')loadChat()},appRefreshSeconds*1000)}
async function loadChat(){if(!navigator.onLine){$('chatAccess').textContent='Le chat nécessite du réseau. Ton message peut rester en brouillon dans cette page.';return}if(chatBusy||!chatAllowed()||tab!=='chatPanel')return;chatBusy=true;const version=chatReadVersion,uid=user.id;try{const {data,error}=await db.from('contest_messages').select('id,sender_name,sender_staff,body,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);if(version!==chatReadVersion||user?.id!==uid||tab!=='chatPanel')return;if(error)throw error;const rows=(data||[]).slice().reverse(),fingerprint=JSON.stringify([uid,staff,rows]);$('chatAccess').textContent='Les 100 derniers messages sont affichés.';const markDisplayed=()=>{if(!document.hidden)refreshChatBadge(rows.at(-1)?.id||null)};
if(fingerprint===chatFingerprint){markDisplayed();return}chatFingerprint=fingerprint;const box=$('chatMessages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90||!box.children.length,oldScroll=box.scrollTop;box.replaceChildren();if(!rows.length){const empty=document.createElement('p');empty.className='chatempty';empty.textContent='Pas encore de message. Lance la discussion !';box.append(empty)}for(const row of rows){const article=document.createElement('article');article.className='chatmessage'+(row.sender_staff?' staffmessage':'');const meta=document.createElement('div');meta.className='chatmeta';const author=document.createElement('strong');author.textContent=(row.sender_staff?' ':'')+row.sender_name;const time=document.createElement('time');time.dateTime=row.created_at;time.textContent=new Date(row.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});meta.append(author,time);const body=document.createElement('p');body.textContent=row.body;article.append(meta,body);if(staff){const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Retirer le message';remove.onclick=async()=>{if(!confirm('Retirer ce message du chat pour tous les participants ?'))return;remove.disabled=true;try{const {error}=await db.rpc('staff_hide_contest_message',{p_message_id:row.id});if(error)throw error;await loadChat()}catch(e){message('chatMsg','Retrait impossible : '+e.message,true)}finally{remove.disabled=false}};article.append(remove)}box.append(article)}box.scrollTop=nearBottom?box.scrollHeight:oldScroll;markDisplayed()}catch(e){if(version===chatReadVersion)$('chatAccess').textContent='Chat indisponible : '+e.message+' — Vérifie que le fichier 04-chat.sql a été exécuté dans Supabase.'}finally{chatBusy=false}}
$('refreshChat').onclick=loadChat;
$('chatForm').onsubmit=async event=>{event.preventDefault();if(chatSending||!chatAllowed())return;const text=$('chatBody').value.trim();if(!text||text.length>1000)return message('chatMsg','Écris un message de 1 à 1 000 caractères.',true);chatSending=true;$('sendChat').disabled=true;message('chatMsg','Envoi…');const uid=user.id;try{const {error}=await db.rpc('send_contest_message',{p_body:text});if(error)throw error;if(user?.id!==uid)return;if($('chatBody').value.trim()===text)$('chatBody').value='';message('chatMsg','Message envoyé.');await loadChat();$('chatMessages').scrollTop=$('chatMessages').scrollHeight}catch(e){message('chatMsg','Message non envoyé : '+e.message,true)}finally{chatSending=false;$('sendChat').disabled=false}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&tab==='chatPanel')loadChat()});
window.addEventListener('pagehide',stopChatPolling);
let coefficientLoadVersion=0,coefficientSaving=false,coefficientDraftDirty=false;
async function readCoefficients(){const {data,error}=await db.from('species_coefficients').select('species,coefficient');if(error)throw error;const values=Object.fromEntries((data||[]).map(row=>[row.species,Number(row.coefficient)]));if(species.some(name=>!Number.isFinite(values[name])))throw Error('Barème incomplet. Exécute 07-bonus-especes.sql.');return values}
async function loadRankingCoefficients(){
 const request=++publicCoefficientVersion;
 let values=null,status;
 try{
  values=await readCoefficients();
  status='Barème officiel à jour.';
 }catch{
  status='Barème officiel indisponible. Reconnecte-toi pour consulter les coefficients.';
 }
 if(request!==publicCoefficientVersion)return;
 for(const cell of document.querySelectorAll('[data-species-coefficient]')){
  cell.textContent=values?'×'+values[cell.dataset.speciesCoefficient].toLocaleString('fr-FR'):'—';
 }
 $('homeCoefficients').textContent=status;
 $('rankingCoefficients').textContent=status;
}
async function loadCoefficientSettings(){if(!staff||!navigator.onLine||coefficientSaving)return;const version=++coefficientLoadVersion;try{const values=await readCoefficients();if(version!==coefficientLoadVersion||coefficientSaving||!staff||!user)return;const box=$('coefficientFields');box.replaceChildren();species.forEach((name,index)=>{const field=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');input.id='coefficient-'+index;label.htmlFor=input.id;label.textContent=name;input.type='number';input.inputMode='decimal';input.min='0';input.max='100';input.step='0.01';input.value=values[name];input.className='coefEdit';input.dataset.species=name;field.append(label,input);box.append(field)})}catch(e){message('coefficientMsg','Chargement impossible : '+e.message+' — Exécute 07-bonus-especes.sql dans Supabase.',true)}}
async function saveCoefficients(){if(!staff||coefficientSaving||loading)return;if(!navigator.onLine)return message('coefficientMsg','La modification du barème nécessite du réseau.',true);const inputs=[...$('coefficientFields').querySelectorAll('.coefEdit')],values={};if(inputs.length!==species.length)return message('coefficientMsg','Attends le chargement des cinq coefficients.',true);for(const input of inputs){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value<0||value>100||Math.abs(value*100-Math.round(value*100))>1e-8)return message('coefficientMsg','Chaque coefficient doit être compris entre 0 et 100, avec deux décimales maximum.',true);values[input.dataset.species]=value}if(!confirm('Appliquer ces coefficients à toutes les prises, y compris celles déjà validées ? Le classement sera recalculé.\n'+species.map(name=>`${name} × ${values[name]}`).join(' · ')))return;coefficientSaving=true;loading=true;++coefficientLoadVersion;$('saveCoefficients').disabled=true;try{const {error}=await db.rpc('staff_set_coefficients',{p_coefficients:values});if(error)throw error;coefficientDraftDirty=false;message('coefficientMsg','Coefficients enregistrés. Le classement est recalculé avec ce barème.');await loadRankingCoefficients()}catch(e){message('coefficientMsg','Enregistrement impossible : '+e.message,true)}finally{coefficientSaving=false;loading=false;$('saveCoefficients').disabled=false}}
$('saveCoefficients').onclick=saveCoefficients;
let autoRefreshBusy=false,appRefreshSeconds=15,refreshSettingsBusy=false,appRefreshSaving=false,appRefreshDraft=false;
$('staffPanel').addEventListener('input',event=>{if(event.target.matches('.coefEdit')){coefficientDraftDirty=true;coefficientLoadVersion++}else if(event.target.matches('.fishEdit,.mmEdit,.statusEdit,.teamEdit'))staffDraftDirty=true});
$('staffPanel').addEventListener('change',event=>{if(event.target.matches('.coefEdit')){coefficientDraftDirty=true;coefficientLoadVersion++}else if(event.target.matches('.fishEdit,.mmEdit,.statusEdit,.teamEdit'))staffDraftDirty=true});
async function autoRefreshCurrentTab(){if(autoRefreshBusy||(!user&&!['account','rankingPanel'].includes(tab))||!navigator.onLine||document.hidden||loading||chatSending)return;const current=tab;if(staff)refreshPendingBadge();if(!user&&current==='account'){await refreshCatchWindow();return}if(current==='chatPanel')return;if(current==='staffPanel'&&(staffDraftDirty||coefficientDraftDirty||$('staffPanel').querySelector('details[open]'))){$('autoRefreshStatus').textContent='Actualisation en pause pendant la modification d’une prise. Enregistre ou utilise Actualiser.';return}if(document.activeElement?.matches('input:not([type="checkbox"]),select,textarea'))return;autoRefreshBusy=true;try{if(current==='staffPanel')await loadStaff();else if(current==='rankingPanel')await loadRanking();else if(current==='catchPanel'){await refreshAccount(user);await showQueue();await syncQueue()}else if(current==='account'){await refreshAccount(user);if(team)await syncQueue()}$('autoRefreshStatus').textContent='Actualisation toutes les '+refreshDuration(appRefreshSeconds)+' · Dernière : '+new Date().toLocaleTimeString('fr-FR')}catch(e){$('autoRefreshStatus').textContent='Actualisation indisponible. Nouvelle tentative dans '+refreshDuration(appRefreshSeconds)+'.'}finally{autoRefreshBusy=false}}
let autoRefreshTimer=setInterval(autoRefreshCurrentTab,appRefreshSeconds*1000);
window.addEventListener('pagehide',()=>clearInterval(autoRefreshTimer));
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('installApp').classList.remove('hidden')});
$('installApp').onclick=async()=>{if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true){$('installInstructions').open=true;$('installHelp').textContent='L’application est déjà ouverte depuis ton écran d’accueil.';return}if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')$('installHelp').textContent='Installation demandée. Retrouve ensuite l’icône sur ton écran d’accueil.';else{$('installInstructions').open=true;$('installHelp').textContent='Tu peux aussi utiliser les étapes ci-dessus.'}}catch(e){$('installInstructions').open=true;$('installHelp').textContent='Suis les étapes ci-dessus pour ton téléphone.'}}else{$('installInstructions').open=true;const iphone=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);$('installHelp').textContent=iphone?'Sur iPhone : utilise le bouton Partager de Safari, puis Sur l’écran d’accueil.':'Ouvre le menu de ton navigateur, puis Installer l’application ou Ajouter à l’écran d’accueil.'}};
window.addEventListener('appinstalled',()=>{$('installHelp').textContent='Application installée. Retrouve son icône sur ton écran d’accueil.';$('installApp').textContent='Application installée'});
$('shareApp').onclick=async()=>{const url=new URL('./',location.href).href;try{if(navigator.share)await navigator.share({title:'Street Fishing Mortagne 2027',url});else{await navigator.clipboard.writeText(url);$('installHelp').textContent='Lien copié. Tu peux l’envoyer aux participants.'}}catch(e){if(e.name!=='AbortError')$('installHelp').textContent='Lien de l’application : '+url}};
async function checkOfflineReady(){try{const cached=await caches.match(new URL('./vendor/supabase.bundle.mjs',location.href).href);$('offlineReady').textContent=cached?' Application prête pour le mode hors ligne sur cet appareil.':'Ouvre cette version avec du réseau pour préparer le mode hors ligne.'}catch(e){$('offlineReady').textContent='Le stockage hors ligne est indisponible dans ce navigateur.'}}
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'||worker.state==='activated')checkOfflineReady()});return navigator.serviceWorker.ready}).then(checkOfflineReady).catch(()=>{$('offlineReady').textContent='Installation hors ligne impossible. Ouvre le site en HTTPS hors navigation privée.'});navigator.serviceWorker.addEventListener('controllerchange',checkOfflineReady)}else $('offlineReady').textContent='Ce navigateur ne permet pas de préparer le mode hors ligne.';

init().catch(e=>notice('Erreur : '+e.message,true));

$('forgotPassword').onclick=async()=>{const email=$('email').value.trim();if(!email||!$('email').checkValidity())return message('loginMsg','Saisis ton adresse e-mail dans le champ ci-dessus.',true);if(!navigator.onLine)return message('loginMsg','Connecte-toi au réseau pour recevoir le lien.',true);$('forgotPassword').disabled=true;try{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:new URL('./',location.href).href});if(error)throw error;message('loginMsg','Si un compte correspond à cette adresse, tu recevras un lien pour choisir un nouveau mot de passe. Vérifie aussi tes indésirables.')}catch(e){message('loginMsg','Envoi impossible pour le moment. Réessaie plus tard.',true)}finally{$('forgotPassword').disabled=false}};
$('recoveryForm').onsubmit=async event=>{event.preventDefault();if(!recoveryMode)return;const password=$('newPassword').value;if(password.length<8||password!==$('confirmPassword').value)return message('recoveryMsg','Indique deux mots de passe identiques de 8 caractères minimum.',true);$('savePassword').disabled=true;try{const {error}=await db.auth.updateUser({password});if(error)throw error;recoveryMode=false;$('newPassword').value='';$('confirmPassword').value='';$('recoveryForm').classList.add('hidden');await db.auth.signOut();message('loginMsg','Mot de passe enregistré. Connecte-toi avec ton nouveau mot de passe.')}catch(e){message('recoveryMsg','Modification impossible : le lien a peut-être expiré. Demande un nouveau lien si nécessaire.',true)}finally{$('savePassword').disabled=false}};

function setAuthMode(mode){const creating=mode==='signup';$('authTitle').textContent=creating?'Créer le compte de mon équipe':'Retrouver mon équipe';$('authHelp').textContent=creating?'Première participation ? Choisis une adresse e-mail et un mot de passe. Un seul compte suffit pour ton duo.':'Saisis les identifiants de ton compte existant.';$('signupConfirmation').classList.toggle('hidden',!creating);$('signup').classList.toggle('hidden',!creating);$('login').classList.toggle('hidden',creating);$('forgotPassword').classList.toggle('hidden',creating);$('password').autocomplete=creating?'new-password':'current-password';$('password').value='';$('signupPasswordConfirm').value='';$('loginMsg').textContent='';for(const id of ['loginMode','signupMode']){const selected=id===(creating?'signupMode':'loginMode');$(id).setAttribute('aria-pressed',String(selected));$(id).classList.toggle('secondary',!selected)}}
$('loginMode').onclick=()=>setAuthMode('login');
$('signupMode').onclick=()=>setAuthMode('signup');

function catchesAreOpen(){if(!catchWindow)return false;if(catchWindow.mode!=='scheduled')return catchWindow.is_open===true;const now=Date.now()+catchWindowOffset;return now>=Date.parse(catchWindow.opens_at)&&now<Date.parse(catchWindow.closes_at)}
function paintHomeContest(){
 const clock=rankingClock(catchWindow,Date.now()+catchWindowOffset);
 let text;
 if(!navigator.onLine)text='Sans réseau · Horaires à vérifier';
 else if(!catchWindow)text='Horaires indisponibles';
 else if(clock.state==='open')text='Pêche en cours'+(catchWindow.mode==='scheduled'?' · Fin à '+parisInput(catchWindow.closes_at).slice(11):'');
 else if(clock.state==='waiting'&&catchWindow.mode==='scheduled')text='Ouverture le '+new Date(catchWindow.opens_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+' · '+clock.value;
 else text=catchWindow.mode==='scheduled'?'Concours terminé':'Prises fermées';
 if($('homeContest').textContent!==text)$('homeContest').textContent=text;
}
function parisInput(value){if(!value)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));return parts.replace(' ','T')}
function paintCatchWindow(){paintRankingTimer();paintHomeContest();const open=catchesAreOpen(),label=catchWindow?(open?'Prises ouvertes':'Prises fermées'):'Ouverture des prises non vérifiée';let text=label;if(catchWindow?.mode==='scheduled'){const fmt=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});text+=' · Automatique : du '+fmt(catchWindow.opens_at)+' au '+fmt(catchWindow.closes_at)+' (heure de Paris)'}else if(catchWindow)text+=' · Mode manuel';$('catchWindowStatus').textContent=text;$('staffCatchWindow').textContent=text;updateCatchAccess()}
async function refreshCatchWindow(fill=false){if(!navigator.onLine){paintCatchWindow();return false}if(catchWindowRequest){await catchWindowRequest;return !!catchWindow}const uid=user?.id;catchWindowRequest=(async()=>{catchWindowBusy=true;try{if(user)await refreshPhotoSettings();const {data,error}=await db.rpc('get_catch_window');if(user?.id!==uid)return;if(error||!data)throw error||Error('Réglages absents');catchWindow=data;catchWindowOffset=Date.parse(data.server_now)-Date.now();if(fill&&!windowSaving&&!staffDraftDirty){if(data.opens_at)$('catchStart').value=parisInput(data.opens_at);if(data.closes_at)$('catchEnd').value=parisInput(data.closes_at)}}catch(e){catchWindow=null;$('catchWindowMsg').textContent='Ouverture indisponible. Vérifie que 11-ouverture-prises.sql a été exécuté dans Supabase.'}finally{catchWindowBusy=false;paintCatchWindow()}})();try{await catchWindowRequest;return !!catchWindow}finally{catchWindowRequest=null}}

async function saveCatchWindow(mode,open){if(windowSaving||!staff)return;if(!navigator.onLine)return message('catchWindowMsg','Connecte-toi au réseau pour modifier l’ouverture.',true);const start=$('catchStart').value,end=$('catchEnd').value;if(mode==='scheduled'&&(!start||!end||end<=start))return message('catchWindowMsg','Choisis une fermeture après l’ouverture.',true);windowSaving=true;for(const id of ['openCatches','closeCatches','scheduleCatches'])$(id).disabled=true;try{const {error}=await db.rpc('staff_set_catch_window',{p_mode:mode,p_open:open,p_start:mode==='scheduled'?start:null,p_end:mode==='scheduled'?end:null});if(error)throw error;message('catchWindowMsg',mode==='scheduled'?'Horaires automatiques activés.':open?'Prises ouvertes manuellement.':'Prises fermées manuellement.');await refreshCatchWindow()}catch(e){message('catchWindowMsg','Modification impossible : '+e.message,true)}finally{windowSaving=false;for(const id of ['openCatches','closeCatches','scheduleCatches'])$(id).disabled=false}}
$('goPilot').onclick=()=>{showTab('staffPanel');showStaffPage('staffPilot')};
$('openCatches').onclick=()=>saveCatchWindow('manual',true);
$('closeCatches').onclick=()=>saveCatchWindow('manual',false);
$('scheduleCatches').onclick=()=>saveCatchWindow('scheduled',false);
for(const id of ['catchStart','catchEnd'])$(id).addEventListener('input',()=>{staffDraftDirty=true});
setInterval(()=>{if(!document.hidden&&['account','rankingPanel','catchPanel','staffPanel'].includes(tab))paintCatchWindow()},1000);

function rankingClock(window,now){if(!window)return {state:'waiting',label:'Horaires du concours',value:'—',help:'Horaires indisponibles pour le moment.'};if(window.mode!=='scheduled')return {state:window.is_open?'open':'closed',label:window.is_open?'Prises ouvertes':'Prises fermées',value:window.is_open?'EN COURS':'FERMÉ',help:window.is_open?'Fermeture manuelle par le staff.':'En attente d’une ouverture par le staff.'};const start=Date.parse(window.opens_at),end=Date.parse(window.closes_at);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return {state:'waiting',label:'Horaires du concours',value:'—',help:'Horaires indisponibles pour le moment.'};if(now>=end)return {state:'closed',label:'Déclarations de prises fermées',value:'00:00:00',help:'Le classement reste provisoire jusqu’à la validation du staff.'};const before=now<start;const remaining=Math.max(0,Math.ceil(((before?start:end)-now)/1000));const days=Math.floor(remaining/86400),hours=Math.floor(remaining%86400/3600),minutes=Math.floor(remaining%3600/60),seconds=remaining%60;const value=(days?days+' j ':'')+[hours,minutes,seconds].map(v=>String(v).padStart(2,'0')).join(':');return {state:before?'waiting':'open',label:before?'Ouverture des prises dans':'Temps restant pour déclarer une prise',value,help:'Horaire de '+(before?'début':'fin')+' : '+new Date(before?start:end).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · heure de Paris'};}
function paintRankingTimer(){const now=Date.now()+catchWindowOffset,window=catchWindow,clock=rankingClock(window,now);const scheduled=window?.mode==='scheduled',start=Date.parse(window?.opens_at),end=Date.parse(window?.closes_at),before=scheduled&&Number.isFinite(start)&&now<start,active=scheduled&&now>=start&&now<end,finished=scheduled&&Number.isFinite(end)&&now>=end;$('rankingTimer').classList.toggle('hidden',!active&&!finished);$('rankingTimer').dataset.state=clock.state;$('timerLabel').textContent=active?'Temps restant du concours':'Concours terminé';$('timerValue').textContent=clock.value;$('timerHelp').textContent=clock.help+(!navigator.onLine?' · Derniers horaires reçus.':'');$('rankingTimerWaiting').classList.toggle('hidden',active||finished);}


setInterval(()=>{if(tab==='rankingPanel'&&!document.hidden)paintRankingTimer()},1000);

$('startContestTimer').onclick=async()=>{if(windowSaving||!staff)return;const minutes=Number($('contestDuration').value);if(!Number.isInteger(minutes)||minutes<1||minutes>1440)return message('rankingStartMsg','Choisis une durée de 1 à 1 440 minutes.',true);if(!navigator.onLine)return message('rankingStartMsg','Une connexion est nécessaire pour démarrer le concours.',true);if(!confirm('Démarrer le concours maintenant pour '+minutes+' minutes ? Les prises s’ouvrent immédiatement et se fermeront à la fin.'))return;windowSaving=true;$('startContestTimer').disabled=true;try{const {error}=await db.rpc('staff_start_contest_timer',{p_minutes:minutes});if(error)throw error;await refreshCatchWindow();message('rankingStartMsg','Concours démarré : le timer du classement est lancé.')}catch(e){message('rankingStartMsg','Démarrage impossible : '+e.message,true)}finally{windowSaving=false;$('startContestTimer').disabled=false}};

$('accessMyTeam').onclick=()=>{showTab('account');if(!user)setAuthMode('signup');const target=user&&!$('registerBox').classList.contains('hidden')?$('registerBox'):$('account');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});if(!user)$('email').focus({preventScroll:true})};

function paintPhotoSettings(){
 $('galleryPhoto').classList.toggle('hidden',!galleryAllowed);
 $('galleryPhoto').disabled=!user||!navigator.onLine||!catchesAreOpen();
 $('galleryHelp').textContent=galleryAllowed?'Galerie autorisée par le staff : tu peux choisir une image sur ton appareil.':'Galerie non autorisée : utilise le bouton « Prendre une photo ».';
 $('gallerySettingStatus').textContent=!gallerySettingKnown?'Réglage indisponible. Exécute 13-autoriser-galerie.sql dans Supabase.':galleryAllowed?'Galerie autorisée pour les participants.':'Galerie désactivée pour les participants.';
 $('enableGallery').disabled=gallerySaving||!gallerySettingKnown||galleryAllowed;
 $('disableGallery').disabled=gallerySaving||!gallerySettingKnown||!galleryAllowed;
}
async function refreshPhotoSettings(){
 if(galleryRequest)return galleryRequest;
 const uid=user?.id;
 if(!uid||!navigator.onLine){galleryAllowed=false;gallerySettingKnown=false;paintPhotoSettings();return false}
 galleryRequest=(async()=>{try{const {data,error}=await db.rpc('get_gallery_permission');if(user?.id!==uid)return false;if(error||typeof data!=='boolean')throw error||Error('Réglage absent');galleryAllowed=data;gallerySettingKnown=true;return true}catch(e){if(user?.id===uid){galleryAllowed=false;gallerySettingKnown=false}return false}finally{if(user?.id===uid){if(!galleryAllowed&&photoSource==='gallery'){clearPhoto();message('catchMsg','La galerie n’est plus autorisée. Prends une nouvelle photo.',true)}paintPhotoSettings()}}})();
 try{return await galleryRequest}finally{galleryRequest=null}
}
async function saveGalleryPermission(enabled){
 if(!staff||!user||gallerySaving)return;
 if(!navigator.onLine)return message('gallerySettingMsg','Connexion nécessaire.',true);
 gallerySaving=true;paintPhotoSettings();
 try{const {error}=await db.rpc('staff_set_gallery_permission',{p_enabled:enabled});if(error)throw error;await refreshPhotoSettings();message('gallerySettingMsg',enabled?'Galerie autorisée. Les participants verront le bouton dans Prise.':'Galerie désactivée.')}catch(e){message('gallerySettingMsg','Modification impossible : '+e.message,true)}finally{gallerySaving=false;paintPhotoSettings()}
}
$('enableGallery').onclick=()=>saveGalleryPermission(true);
$('disableGallery').onclick=()=>saveGalleryPermission(false);

function paintBulkApproval(){
 const count=pendingApprovalIds.length;
 $('pendingControls').classList.toggle('hidden',count===0);
 $('pendingApprovalCount').textContent=count?`${count} prise(s) en attente de validation.`:'Aucune prise en attente de validation.';
 const selected=pendingApprovalIds.filter(id=>selectedPendingCatches.has(id)).length,blocked=!user||!staff||loading||bulkApproving||!navigator.onLine;
 $('pendingSelectedCount').textContent=selected?`${selected} prise(s) sélectionnée(s).`:'Aucune prise sélectionnée.';
 $('approveSelectedPending').textContent=bulkApproving?'Validation en cours…':`Valider la sélection${selected?' ('+selected+')':''}`;
 $('approveSelectedPending').disabled=blocked||selected===0;
 const all=$('selectAllPending');all.checked=count>0&&selected===count;all.indeterminate=selected>0&&selected<count;all.disabled=blocked||count===0;
 document.querySelectorAll('.pendingSelect').forEach(box=>{box.checked=selectedPendingCatches.has(box.dataset.catchId);box.disabled=blocked});
}
async function approveSelectedPending(){
 if(!user||!staff||loading||bulkApproving)return;
 if(!navigator.onLine)return message('bulkApprovalMsg','Connexion nécessaire pour valider les prises.',true);
 if(staffDraftDirty)return message('bulkApprovalMsg','Enregistre tes modifications ou actualise les prises avant la validation groupée.',true);
 const ids=pendingApprovalIds.filter(id=>selectedPendingCatches.has(id)),uid=user.id;
 if(!ids.length)return;
 if(!confirm(`Valider les ${ids.length} prises sélectionnées ? Toutes compteront dans le classement. Les nouvelles prises reçues ensuite resteront en attente.`))return;
 bulkApproving=true;loading=true;paintBulkApproval();
 const controls=[...$('staffPending').querySelectorAll('button,input,select')];
 controls.forEach(control=>{control.dataset.beforeBulkDisabled=String(control.disabled);control.disabled=true});
 let approved=0,attempted=0;
 try{
  for(let offset=0;offset<ids.length;offset+=100){
   if(user?.id!==uid||!staff)throw Error('La session staff a changé.');
   const batch=ids.slice(offset,offset+100);
   const {data,error}=await db.from('catches').update({status:'approved'}).in('id',batch).eq('status','pending').is('deleted_at',null).is('purge_started_at',null).select('id');
   if(error)throw error;
   approved+=(data||[]).length;attempted+=batch.length;
   message('bulkApprovalMsg',`${approved} prise(s) validée(s) · ${attempted}/${ids.length} traitées.`);
  }
  const skipped=ids.length-approved;
  message('bulkApprovalMsg',`${approved} prise(s) validée(s).${skipped?' '+skipped+' prise(s) déjà traitée(s), supprimée(s) ou non modifiable(s).':''} Le classement est mis à jour.`);
 }catch(e){message('bulkApprovalMsg',`${approved} prise(s) validée(s) avant l’arrêt. ${e.message} Actualise pour vérifier les prises restantes.`,true)}
 finally{
  loading=false;bulkApproving=false;
  controls.forEach(control=>{if(control.isConnected){control.disabled=control.dataset.beforeBulkDisabled==='true';delete control.dataset.beforeBulkDisabled}});
  if(user?.id===uid&&staff)await loadStaff();
  paintBulkApproval();
 }
}
$('approveSelectedPending').onclick=approveSelectedPending;
$('selectAllPending').onchange=()=>{if(loading||bulkApproving)return;for(const id of pendingApprovalIds){if($('selectAllPending').checked)selectedPendingCatches.add(id);else selectedPendingCatches.delete(id)}paintBulkApproval()};

function clearRankingPhotos(){
 bestRankFingerprint=null;++rankingPhotoVersion;++teamPhotoVersion;teamPhotoNumber=null;teamPhotoBusy=false;
 if($('teamCatchDialog').open)$('teamCatchDialog').close();
 $('teamCatchPhotos').replaceChildren();$('bestCatchCards').replaceChildren();
}
function rankPhotoCard(caption,catchData,valid){
 const card=document.createElement('article');card.className='catchPhotoCard';
 const title=document.createElement('h4');title.textContent=caption;
 const size=document.createElement('p');size.className='catchPhotoSize';size.textContent=`${catchData.length_mm} mm · ${(catchData.length_mm/10).toLocaleString('fr-FR')} cm`;
 const photo=document.createElement('p');photo.className='muted';photo.textContent='Chargement de la photo…';
 card.append(title,size,photo);
 signedPhoto(catchData.photo_path).then(url=>{
  if(!valid()||!card.isConnected)return;
  if(!url){photo.textContent='Photo indisponible.';return}
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Agrandir la photo : '+caption);
  const img=document.createElement('img');img.src=url;img.alt=caption+' — '+catchData.length_mm+' mm';img.loading='lazy';img.onerror=()=>{if(valid())photo.textContent='Photo indisponible.'};
  link.append(img);photo.replaceChildren(link);
 });
 return card;
}
async function loadBestRankCatches(){
 let version=rankingPhotoVersion;const uid=user?.id,requestVersion=rankingRequest;
 if(!uid){$('bestCatchCards').replaceChildren();bestRankFingerprint=null;$('bestCatchStatus').textContent='Connecte-toi avec ton équipe pour voir les photos et les plus belles prises.';return}
 if(bestRankFingerprint===null)$('bestCatchStatus').textContent='Chargement des plus belles prises…';
 try{
  const {data,error}=await db.rpc('get_best_rank_catches');
  if(requestVersion!==rankingRequest||user?.id!==uid)return;if(error)throw error;
  const rows=data||[],fingerprint=JSON.stringify([uid,rows]);if(bestRankFingerprint===fingerprint)return;bestRankFingerprint=fingerprint;version=++rankingPhotoVersion;$('bestCatchCards').replaceChildren();$('bestCatchStatus').textContent=rows.length?'Prises validées uniquement. En cas d’égalité, la première prise déclarée est illustrée.':'Aucune prise validée pour le moment.';
  for(const name of species){
   const fish=rows.find(r=>r.species===name);
   if(!fish){const empty=document.createElement('p');empty.className='item muted';empty.textContent=name+' : aucune prise validée.';$('bestCatchCards').append(empty);continue}
   const card=rankPhotoCard(name,fish,()=>version===rankingPhotoVersion&&user?.id===uid);
   const button=document.createElement('button');button.className='rankTeamButton';button.type='button';button.textContent=`${rankingTeamName(fish.team_name)} · n° ${fish.team_number}`;button.onclick=()=>openTeamCatches(fish.team_number);card.append(button);
   if(Number(fish.tied_count)>1){const tie=document.createElement('p');tie.className='muted';tie.textContent=fish.tied_count+' prises à égalité sur cette longueur.';card.append(tie)}
   $('bestCatchCards').append(card);
  }
 }catch(e){if(version===rankingPhotoVersion)$('bestCatchStatus').textContent='Photos indisponibles. Accès réservé aux équipes confirmées ; vérifie aussi que 14-photos-classement.sql a été exécuté.'}
}
async function openTeamCatches(number){
 if(!Number.isInteger(number))return;
 ++teamPhotoVersion;teamPhotoBusy=false;teamPhotoNumber=number;teamPhotoOffset=0;
 $('teamCatchPhotos').replaceChildren();$('teamCatchTitle').textContent='Équipe n° '+number;$('teamCatchSummary').textContent='';$('moreTeamCatches').classList.add('hidden');
 if(!$('teamCatchDialog').open)$('teamCatchDialog').showModal();
 if(!user){$('teamCatchStatus').textContent='Connecte-toi avec une équipe confirmée pour voir les prises et leurs photos.';return}
 await loadTeamCatchPage();
}
async function loadTeamCatchPage(){
 if(teamPhotoBusy||teamPhotoNumber===null||!user)return;
 const version=teamPhotoVersion,uid=user.id,number=teamPhotoNumber,offset=teamPhotoOffset;teamPhotoBusy=true;$('moreTeamCatches').disabled=true;$('teamCatchStatus').textContent='Chargement des prises…';
 try{
  const {data,error}=await db.rpc('get_rank_team_catches',{p_team_number:number,p_offset:offset});
  if(version!==teamPhotoVersion||user?.id!==uid)return;if(error)throw error;if(!data)throw Error('Équipe absente');
  $('teamCatchTitle').textContent=rankingTeamName(data.team_name)+' · n° '+data.team_number;
  $('teamCatchSummary').textContent=`${data.catch_count} prise(s) validée(s) au total.`;
  const rows=data.catches||[];
  for(const fish of rows)$('teamCatchPhotos').append(rankPhotoCard(fish.species,fish,()=>version===teamPhotoVersion&&user?.id===uid));
  teamPhotoOffset+=rows.length;
  $('teamCatchStatus').textContent=data.catch_count?`${teamPhotoOffset} photo(s) affichée(s) sur ${data.catch_count} prises validées.`:'Aucune prise validée pour cette équipe.';
  $('moreTeamCatches').classList.toggle('hidden',!rows.length||teamPhotoOffset>=Number(data.catch_count));
 }catch(e){if(version===teamPhotoVersion)$('teamCatchStatus').textContent='Chargement impossible. Réservé aux équipes confirmées ; vérifie la connexion et 14-photos-classement.sql.'}
 finally{if(version===teamPhotoVersion){teamPhotoBusy=false;$('moreTeamCatches').disabled=false}}
}
$('ranking').addEventListener('click',event=>{const button=event.target.closest('[data-team-number]');if(button)openTeamCatches(Number(button.dataset.teamNumber))});
$('closeTeamCatches').onclick=()=>$('teamCatchDialog').close();
$('teamCatchDialog').addEventListener('close',()=>{++teamPhotoVersion;teamPhotoBusy=false;teamPhotoNumber=null;$('teamCatchPhotos').replaceChildren()});
$('moreTeamCatches').onclick=loadTeamCatchPage;

function refreshDuration(seconds){return seconds<60?seconds+' seconde'+(seconds>1?'s':''):seconds%60===0?(seconds/60)+' minute'+(seconds>60?'s':''):seconds+' secondes'}
function applyRefreshSeconds(seconds){
 if(!Number.isInteger(seconds)||seconds<1||seconds>300)return false;
 if(seconds!==appRefreshSeconds){appRefreshSeconds=seconds;clearInterval(autoRefreshTimer);autoRefreshTimer=setInterval(autoRefreshCurrentTab,seconds*1000);if(chatTimer){clearInterval(chatTimer);chatTimer=setInterval(()=>{if(!document.hidden&&tab==='chatPanel')loadChat()},seconds*1000)}}
 $('appRefreshCurrent').textContent='Fréquence actuelle : '+refreshDuration(seconds)+'.';
 if(!appRefreshDraft&&!appRefreshSaving){$('appRefreshSeconds').value=String(seconds);$('appRefreshPreset').value=[1,5,10,15,30,60,120,300].includes(seconds)?String(seconds):''}
 return true;
}
async function loadAppRefreshSettings(){
 if(refreshSettingsBusy||appRefreshSaving||!navigator.onLine||document.hidden)return;
 refreshSettingsBusy=true;
 try{const {data,error}=await db.rpc('get_app_refresh_seconds');if(error)throw error;if(appRefreshSaving)return;if(!applyRefreshSeconds(data))throw Error('Fréquence invalide');if(staff)$('appRefreshMsg').textContent=''}catch(e){if(staff)$('appRefreshMsg').textContent='Réglage indisponible : exécute 15-frequence-actualisation.sql dans Supabase.'}finally{refreshSettingsBusy=false}
}
$('appRefreshSeconds').oninput=()=>{appRefreshDraft=true;const value=Number($('appRefreshSeconds').value);$('appRefreshPreset').value=[1,5,10,15,30,60,120,300].includes(value)?String(value):''};
$('appRefreshPreset').onchange=()=>{if($('appRefreshPreset').value){appRefreshDraft=true;$('appRefreshSeconds').value=$('appRefreshPreset').value}};
$('saveAppRefresh').onclick=async()=>{
 if(!staff||!user||appRefreshSaving)return;
 if(!navigator.onLine)return message('appRefreshMsg','Connexion nécessaire.',true);
 const seconds=Number($('appRefreshSeconds').value);
 if(!$('appRefreshSeconds').value.trim()||!Number.isInteger(seconds)||seconds<1||seconds>300)return message('appRefreshMsg','Choisis un nombre entier entre 1 et 300 secondes.',true);
 appRefreshSaving=true;$('saveAppRefresh').disabled=true;
 try{const {error}=await db.rpc('staff_set_app_refresh_seconds',{p_seconds:seconds});if(error)throw error;appRefreshDraft=false;applyRefreshSeconds(seconds);message('appRefreshMsg','Fréquence enregistrée : '+refreshDuration(seconds)+'.')}catch(e){message('appRefreshMsg','Modification impossible : '+e.message,true)}finally{appRefreshSaving=false;$('saveAppRefresh').disabled=false}
};
let refreshSettingsTimer=setInterval(loadAppRefreshSettings,15000);
loadAppRefreshSettings();
window.addEventListener('pagehide',()=>{clearInterval(refreshSettingsTimer);clearInterval(autoRefreshTimer)});
window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(autoRefreshTimer);autoRefreshTimer=setInterval(autoRefreshCurrentTab,appRefreshSeconds*1000);clearInterval(refreshSettingsTimer);refreshSettingsTimer=setInterval(loadAppRefreshSettings,15000);loadAppRefreshSettings();if(tab==='chatPanel')startChatPolling()}});

const AI_PROMPT_VERSION='toise-v2-reperes-double';
function aiPhotoKey(c){return c.id+':'+c.photo_path}
function attachCatchAI(c,body){
 const box=document.createElement('details');box.className='catchAI';box.dataset.aiCatchId=c.id;box.dataset.aiPhotoPath=c.photo_path||'';
 const heading=document.createElement('summary');heading.textContent='Analyse IA';
 const output=document.createElement('div');output.className='aiOutput';output.setAttribute('aria-live','polite');output.textContent='En mode automatique, la suggestion apparaîtra ici après analyse.';
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Analyser avec l’IA';
 const verify=document.createElement('button');verify.type='button';verify.className='secondary';verify.textContent='📏 Vérifier sur la toise (2 repères)';verify.onclick=()=>openRulerCheck(c,body);
 box.append(heading,output,button,verify);body.append(box);
 function render(result){
  heading.textContent=result.measurement_verified&&result.verification==='double_lecture_coherente'?'Analyse IA · 2 lectures cohérentes':'Analyse IA · Mesure à vérifier';
  output.replaceChildren();
  const line=document.createElement('p');line.textContent='Espèce proposée : '+result.species;output.append(line);
  const size=document.createElement('p');size.textContent=result.estimated_length_mm===null?'Longueur non proposée : graduations insuffisantes ou lectures discordantes. Vérifie sur la photo.':`Lecture indicative : environ ${result.estimated_length_mm} mm · plage ${result.lower_mm}–${result.upper_mm} mm.`;output.append(size);
  const confidence=document.createElement('p');confidence.className='muted';confidence.textContent='Appréciation IA : '+result.confidence+' · Même avec deux lectures, la mesure n’est pas certifiée. Seule la vérification staff sur la toise fait foi.';output.append(confidence);
  const notes=document.createElement('ul');for(const note of result.notes||[]){const li=document.createElement('li');li.textContent=note;notes.append(li)}output.append(notes);
  const checks=document.createElement('p');checks.className='muted';checks.textContent=`Toise lisible : ${result.scale_legible?'oui':'non'} · zéro visible : ${result.zero_visible?'oui':'non'} · bouche au zéro : ${result.mouth_at_zero===true?'oui':result.mouth_at_zero===false?'non':'incertain'} · poisson entier : ${result.whole_fish_visible?'oui':'non'}.`;output.append(checks);
  if(result.measurement_verified&&result.verification==='double_lecture_coherente'&&species.includes(result.species)&&result.species!=='Indéterminée'&&Number.isInteger(result.estimated_length_mm)){
   const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent='Reporter la suggestion dans les champs';apply.onclick=()=>{if(!staff||!user||loading)return;body.querySelector('.fishEdit').value=result.species;body.querySelector('.mmEdit').value=String(result.estimated_length_mm);staffDraftDirty=true;const feedback=body.querySelector('.editMsg');feedback.textContent='Suggestion reportée. Vérifie la photo, puis enregistre ou valide la prise.';feedback.className='editMsg';};output.append(apply);
  }
  button.textContent='Relire l’analyse enregistrée';
 }
 box._renderAI=render;
 if(aiAnalysisCache.has(aiPhotoKey(c)))render(aiAnalysisCache.get(aiPhotoKey(c)));
 button.onclick=async()=>{
  if(!user||!staff||loading)return;if(!navigator.onLine){output.textContent='Connexion nécessaire.';return}
  const uid=user.id;loading=true;button.disabled=true;output.textContent='Analyse de la photo en cours…';
  try{const {data,error}=await db.functions.invoke('analyze-catch',{body:{catch_id:c.id}});if(user?.id!==uid||!staff||!box.isConnected)return;if(error){let reason='Analyse indisponible. Vérifie la fonction serveur, ses secrets et les réglages IA.';try{const details=await error.context.json();if(details.error)reason=details.error}catch{}throw Error(reason)}if(data?.error)throw Error(data.error);if(!data?.analysis)throw Error('Analyse absente.');aiAnalysisCache.set(aiPhotoKey(c),data.analysis);render(data.analysis)}catch(e){if(user?.id===uid&&box.isConnected)output.textContent=e.message}finally{loading=false;if(box.isConnected)button.disabled=false}
 };
}
// Estimation guidée : deux repères sur la photo (zéro et queue), lecture des chiffres
// physiques de la toise par Supabase, estimation en cm entiers, puis correction en mm par le staff.
const rulerDlg=$('rulerCheckDialog'),rulerImg=$('rulerCheckPhoto');
let rulerTarget=null,rulerMarks=[],rulerZoom=1,rulerBusy=false,rulerRun=0,rulerSuggested=null,rulerRetry=0;
const rulerEl=id=>$(id);
function updateRulerMarks(){
 const layer=rulerEl('rulerMarkers');layer.replaceChildren();
 rulerMarks.forEach((p,i)=>{
  const d=document.createElement('span');d.className='rulerMarker';
  d.dataset.point=i===0?'zero':'tail';d.style.left=(p.x*100)+'%';d.style.top=(p.y*100)+'%';
  d.textContent=i===0?'0':'Q';layer.append(d);
 });
 const phases=['1/2 — Touche la butée zéro de la toise.','2/2 — Touche le bout de la queue.','2 repères placés : estimation des graduations.'];
 rulerEl('rulerStep').textContent=phases[Math.min(rulerMarks.length,2)];
 rulerEl('rulerUndo').disabled=rulerMarks.length<2;
 rulerEl('rulerAutoEstimate').disabled=rulerMarks.length!==2||rulerBusy;
 computeRulerMeasure();
}
function computeRulerMeasure(){
 const out=rulerEl('rulerResult'),apply=rulerEl('rulerApply'),check=rulerEl('rulerConfirmed');
 apply.disabled=true;delete apply.dataset.value;
 if(rulerMarks.length!==2){out.textContent='Place les 2 repères : zéro et bout de queue.';return}
 const result=validateTwoPointRuler(rulerMarks,rulerEl('rulerMeasuredMm').value,rulerImg.naturalWidth,rulerImg.naturalHeight);
 if(result.error){out.textContent=rulerSuggested?'Vérifie la suggestion IA puis ajuste la longueur si nécessaire.':result.error;return}
 out.textContent=(rulerSuggested!==null&&result.value===rulerSuggested?'Base estimée par IA : ':'Longueur ajustée par le staff : ')+result.value+' mm. Vérifie les graduations visibles avant de reporter.';
 if(!check.checked){out.textContent+=' Coche la confirmation pour autoriser le report.';return}
 apply.disabled=!rulerTarget||!staff||!user||!rulerTarget.body?.isConnected||rulerBusy;
 apply.dataset.value=String(result.value);
}
function resetRulerPoints(){
 ++rulerRun;rulerMarks=[];rulerSuggested=null;rulerBusy=false;rulerRetry=0;
 rulerEl('rulerMeasuredMm').value='';rulerEl('rulerConfirmed').checked=false;
 rulerEl('rulerEstimatedCm').textContent='Estimation IA : — cm';
 rulerEl('rulerAIStatus').textContent='Place les deux repères pour lancer la lecture IA des graduations en cm.';
 updateRulerMarks();
}
// Le visuel marqué facilite la localisation de Q ; l'original de la photo est
// toujours récupéré par le serveur et sert à vérifier les chiffres de la toise.
function makeMarkedPreview(){
 try{
  const w=rulerImg.naturalWidth,h=rulerImg.naturalHeight;if(!w||!h)return undefined;
  const factor=Math.min(1,1400/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.round(w*factor);canvas.height=Math.round(h*factor);
  const ctx=canvas.getContext('2d');if(!ctx)return undefined;
  ctx.drawImage(rulerImg,0,0,canvas.width,canvas.height);
  rulerMarks.forEach((point,i)=>{
   const x=point.x*canvas.width,y=point.y*canvas.height;
   ctx.beginPath();ctx.strokeStyle=i===0?'#F0BA37':'#19F0E5';ctx.lineWidth=5;ctx.arc(x,y,16,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle=i===0?'#F0BA37':'#19F0E5';ctx.font='bold 26px sans-serif';
   ctx.fillText(i===0?'0':'Q',Math.min(canvas.width-35,x+19),Math.max(32,y-17));
  });
  const result=canvas.toDataURL('image/jpeg',.74);
  return result.length<1000000?result:undefined;
 }catch{return undefined}
}
async function estimateRuler(again=false){
 if(rulerBusy||rulerMarks.length!==2||!staff||!user||!rulerTarget||!navigator.onLine)return;
 if(again)rulerRetry=Math.min(10,rulerRetry+1);
 const token=++rulerRun,target=rulerTarget,marks=rulerMarks.map(p=>({...p})),uid=user.id,initialInput=rulerEl('rulerMeasuredMm').value;
 rulerBusy=true;rulerSuggested=null;rulerEl('rulerConfirmed').checked=false;
 rulerEl('rulerEstimatedCm').textContent='Estimation IA : lecture en cours…';
 rulerEl('rulerAIStatus').textContent='🔎 Lecture automatique des chiffres et graduations en centimètres sur la toise…';
 updateRulerMarks();
 try{
  const payload={catch_id:target.id,ruler_points:marks,recheck:rulerRetry};
  const preview=makeMarkedPreview();if(preview)payload.marked_preview=preview;
  const {data,error}=await db.functions.invoke('analyze-catch',{body:payload});
  if(token!==rulerRun||!rulerDlg.open||user?.id!==uid||rulerTarget!==target)return;
  if(error){let reason='La fonction IA n’a pas pu lire la photo.';try{const details=await error.context.json();if(details.error)reason=details.error}catch{}throw Error(reason)}
  if(data?.error)throw Error(data.error);
  const analysis=data?.analysis;
  if(!analysis)throw Error('Réponse IA absente.');
  if(analysis.measurement_verified&&analysis.verification==='double_lecture_coherente'&&Number.isInteger(analysis.estimated_length_mm)){
   const rounded=cmEstimateFromMm(analysis.estimated_length_mm);
   if(!rounded)throw Error('Mesure IA hors limites.');
   rulerSuggested=rounded.mm;
   rulerEl('rulerEstimatedCm').textContent='Estimation IA : environ '+rounded.cm+' cm';
   const unchanged=rulerEl('rulerMeasuredMm').value===initialInput;
   if(unchanged)rulerEl('rulerMeasuredMm').value=String(rulerSuggested);
   rulerEl('rulerAIStatus').textContent='✅ Base convertie : '+rounded.cm+' cm ≈ '+rulerSuggested+' mm. '+(unchanged?'Corrige les millimètres dans le champ si nécessaire (ex. 203 mm).':'Ta longueur manuelle a été conservée : compare avec la suggestion en cm.');
  }else{
   rulerEl('rulerEstimatedCm').textContent='Estimation IA : indisponible';
   rulerEl('rulerAIStatus').textContent='⚠️ Graduations en cm illisibles ou lectures incohérentes. L’IA ne propose pas de longueur : saisis les mm lus sur la photo.';
  }
 }catch(e){if(token===rulerRun&&rulerDlg.open){rulerEl('rulerEstimatedCm').textContent='Estimation IA : indisponible';rulerEl('rulerAIStatus').textContent='⚠️ '+e.message+' Saisis la longueur manuellement si nécessaire.'}}
 finally{if(token===rulerRun){rulerBusy=false;updateRulerMarks()}}
}
async function openRulerCheck(c,body){
 if(!staff||!user||!navigator.onLine)return message('staffMsg','Le contrôle sur photo nécessite le réseau et une session staff.',true);
 rulerTarget=null;resetRulerPoints();rulerImg.removeAttribute('src');rulerEl('rulerStep').textContent='Chargement de la photo…';
 rulerEl('rulerZoom').value='1';rulerZoom=1;rulerEl('rulerFrame').style.width='100%';
 const uid=user.id;
 try{const url=await signedPhoto(c.photo_path);if(!url)throw Error('Photo introuvable.');if(!staff||user?.id!==uid)return;
  rulerTarget={id:c.id,body};rulerImg.crossOrigin='anonymous';rulerImg.src=url;if(!rulerDlg.open)rulerDlg.showModal();updateRulerMarks();}
 catch(e){message('staffMsg','Photo indisponible : '+e.message,true)}
}
rulerImg.addEventListener('click',e=>{
 if(!rulerTarget||rulerMarks.length>=2||!rulerImg.naturalWidth)return;
 const rect=rulerImg.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
 if(x<0||y<0||x>1||y>1)return;
 rulerMarks.push({x,y});updateRulerMarks();
 if(rulerMarks.length===2)estimateRuler();
});
rulerEl('rulerMeasuredMm').addEventListener('input',()=>{rulerEl('rulerConfirmed').checked=false;computeRulerMeasure()});
rulerEl('rulerConfirmed').addEventListener('change',computeRulerMeasure);
rulerEl('rulerAutoEstimate').onclick=()=>estimateRuler(true);
rulerEl('rulerClear').onclick=resetRulerPoints;
rulerEl('rulerUndo').onclick=()=>{if(rulerMarks.length===2){++rulerRun;rulerMarks.pop();rulerBusy=false;rulerSuggested=null;rulerRetry=0;rulerEl('rulerMeasuredMm').value='';rulerEl('rulerConfirmed').checked=false;rulerEl('rulerEstimatedCm').textContent='Estimation IA : — cm';rulerEl('rulerAIStatus').textContent='Déplace le repère Q : l’estimation en cm repartira automatiquement.';updateRulerMarks()}};
rulerEl('rulerZoom').addEventListener('input',()=>{
 rulerZoom=Number(rulerEl('rulerZoom').value);rulerEl('rulerFrame').style.width=(rulerZoom*100)+'%';
});
rulerEl('rulerApply').onclick=()=>{
 if(!staff||!user||!rulerTarget||!rulerEl('rulerConfirmed').checked||rulerEl('rulerApply').disabled)return;
 const result=validateTwoPointRuler(rulerMarks,rulerEl('rulerMeasuredMm').value,rulerImg.naturalWidth,rulerImg.naturalHeight);
 if(result.error)return;
 const field=rulerTarget.body.querySelector('.mmEdit');if(!field?.isConnected)return;
 field.value=String(result.value);staffDraftDirty=true;
 const feedback=rulerTarget.body.querySelector('.editMsg');
 feedback.textContent='Longueur vérifiée sur la toise : '+result.value+' mm. La prise reste à enregistrer et valider par le staff.';
 rulerDlg.close();
};
rulerEl('rulerClose').onclick=()=>rulerDlg.close();
rulerDlg.addEventListener('close',()=>{rulerTarget=null;rulerImg.removeAttribute('src');resetRulerPoints()});

async function hydrateAIReviews(version){
 if(!user||!staff||!navigator.onLine)return;const uid=user.id,boxes=[...document.querySelectorAll('[data-ai-catch-id]')];if(!boxes.length)return;
 try{
  const ids=[...new Set(boxes.map(box=>box.dataset.aiCatchId))],latest=new Map();
  for(let offset=0;offset<ids.length;offset+=100){const {data,error}=await db.from('catch_ai_reviews').select('catch_id,photo_path,state,result,started_at,prompt_version').in('catch_id',ids.slice(offset,offset+100)).order('started_at',{ascending:false}).limit(1000);if(error)return;for(const row of data||[])if(row.prompt_version===AI_PROMPT_VERSION&&!latest.has(row.catch_id))latest.set(row.catch_id,row)}
  if(version!==staffLoadVersion||user?.id!==uid||!staff)return;
  for(const box of boxes){if(!box.isConnected)continue;const row=latest.get(box.dataset.aiCatchId);if(!row||row.photo_path!==box.dataset.aiPhotoPath)continue;if(row.state==='done'&&row.result&&row.prompt_version===AI_PROMPT_VERSION){aiAnalysisCache.set(row.catch_id+':'+row.photo_path,row.result);box._renderAI(row.result)}else box.querySelector('.aiOutput').textContent=row.state==='processing'?'Analyse automatique en cours…':row.prompt_version!==AI_PROMPT_VERSION?'Ancienne analyse : nouvelle vérification nécessaire. Clique sur « Analyser avec l’IA ».':'Analyse non terminée. Réessaie avec le bouton IA.'}
 }catch{}
}
async function loadAISettings(){
 if(!staff||!user||!navigator.onLine||aiSettingsBusy||aiSettingsSaving)return;const uid=user.id;aiSettingsBusy=true;
 try{const {data,error}=await db.rpc('staff_get_ai_settings');if(user?.id!==uid||!staff)return;if(error||!data)throw error||Error('Réglages absents');$('aiSettingsStatus').textContent=`IA ${data.enabled?'activée':'désactivée'} · automatique ${data.automatic?'activée':'désactivée'} · ${data.used_today}/${data.daily_limit} appels réservés aujourd’hui (UTC).`;if(!aiSettingsDirty&&!aiSettingsSaving){$('aiEnabled').checked=data.enabled;$('aiAutomatic').checked=data.automatic;$('aiDailyLimit').value=String(data.daily_limit)}}catch(e){if(user?.id===uid)$('aiSettingsStatus').textContent='Configuration requise : scripts 16 et 17, fonction analyze-catch et secrets serveur.'}finally{aiSettingsBusy=false}
}
for(const id of ['aiEnabled','aiAutomatic','aiDailyLimit'])$(id).addEventListener('input',()=>{aiSettingsDirty=true});
$('saveAISettings').onclick=async()=>{
 if(!staff||!user||aiSettingsSaving)return;const limit=Number($('aiDailyLimit').value);if(!$('aiDailyLimit').value.trim()||!Number.isInteger(limit)||limit<1||limit>1000)return message('aiSettingsMsg','Choisis une limite entière de 1 à 1 000.',true);if(!navigator.onLine)return message('aiSettingsMsg','Connexion nécessaire.',true);
 aiSettingsSaving=true;$('saveAISettings').disabled=true;
 try{const {error}=await db.rpc('staff_set_ai_settings',{p_enabled:$('aiEnabled').checked,p_daily_limit:limit,p_automatic:$('aiAutomatic').checked});if(error)throw error;aiSettingsDirty=false;message('aiSettingsMsg','Réglages IA enregistrés. La validation des prises reste manuelle.')}catch(e){message('aiSettingsMsg','Enregistrement impossible : '+e.message,true)}finally{aiSettingsSaving=false;$('saveAISettings').disabled=false;loadAISettings()}
};

function paintRankingVisibility(){
 const hidden=rankingVisibleState===false;
 document.querySelectorAll('[data-ranking-visibility-status]').forEach(node=>{node.textContent=rankingVisibleState===null?'Vérification de l’affichage…':hidden?'Classement masqué pour les participants · visible par le staff.':'Classement visible pour les participants et les visiteurs.'});
 const toggle=$('toggleRankingVisibility');
 toggle.textContent=hidden?'Afficher le classement':'Masquer le classement';
 toggle.disabled=!staff||!user||rankingVisibilitySaving||rankingVisibleState===null;
 $('rankingPanel').classList.toggle('rankingConcealed',hidden&&!staff);
 $('rankingHiddenMessage').classList.toggle('hidden',!hidden||staff);
}
function applyRankingVisibility(visible){
 if(typeof visible!=='boolean')return;
 rankingVisibleState=visible;paintRankingVisibility();
 if(!visible&&!staff){++rankingRequest;$('ranking').replaceChildren();clearRankingPhotos();$('rankingStatus').textContent='Classement temporairement masqué par l’organisation.'}
}
async function saveRankingVisibility(visible){
 if(!user||!staff||rankingVisibilitySaving)return;const feedback=(text,bad=false)=>{message('staffMsg',text,bad);message('rankingVisibilityMsg',text,bad)};
 if(!navigator.onLine)return feedback('Connexion nécessaire pour modifier l’affichage.',true);
 rankingVisibilitySaving=true;paintRankingVisibility();
 try{const {data,error}=await db.from('contest_settings').update({ranking_visible:visible,updated_at:new Date().toISOString()}).eq('id',1).select('ranking_visible').maybeSingle();if(error)throw error;if(!data||data.ranking_visible!==visible)throw Error('Modification non confirmée. Vérifie les droits staff.');applyRankingVisibility(visible);feedback(visible?'Classement affiché.':'Classement masqué pour les participants. Le staff garde accès.');if(tab==='rankingPanel')await loadRanking()}catch(e){feedback('Affichage inchangé : '+e.message,true)}finally{rankingVisibilitySaving=false;paintRankingVisibility()}
}
async function checkRankingVisibility(){
 if(tab!=='rankingPanel'||document.hidden||!navigator.onLine||visibilityCheckBusy||rankingVisibilitySaving)return;
 visibilityCheckBusy=true;
 try{const {data,error}=await db.rpc('is_ranking_public');if(error||typeof data!=='boolean')return;const previous=rankingVisibleState;applyRankingVisibility(data);if(previous!==data&&(data||staff))await loadRanking()}catch{}finally{visibilityCheckBusy=false}
}
$('toggleRankingVisibility').onclick=()=>saveRankingVisibility(!rankingVisibleState);
let rankingVisibilityTimer=setInterval(checkRankingVisibility,5000);
window.addEventListener('pagehide',()=>clearInterval(rankingVisibilityTimer));
window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(rankingVisibilityTimer);rankingVisibilityTimer=setInterval(checkRankingVisibility,5000);checkRankingVisibility()}});

loadRankingCoefficients();

function paintPendingBadge(count){
 ++badgeRead;
 $('staffCountLabel').textContent=count?'Staff · '+count:'Staff';
 $('staffTab').setAttribute('aria-label',count?'Staff · '+count+' prise(s) à valider':'Staff');
}
async function refreshPendingBadge(){
 if(!user||!staff||!navigator.onLine)return;
 const request=++badgeRead,uid=user.id;
 const {count,error}=await db.from('catches').select('id',{count:'exact',head:true}).eq('status','pending').is('deleted_at',null);
 if(!error&&request===badgeRead&&staff&&user?.id===uid)paintPendingBadge(count);
}
function paintLength(){
 const mm=Number($('mm').value);
 $('lengthHelp').textContent=mm>0?mm+' mm = '+(mm/10).toLocaleString('fr-FR')+' cm':'';
}
$('mm').addEventListener('input',paintLength);
paintLength();

function rememberAlert(key,value){
 try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{}
}
function storedAlert(key){try{return localStorage.getItem(key)}catch{return null}}
async function checkStaffAlerts(){
 const uid=user?.id;
 if(alertOwner!==uid){
  alertOwner=uid;alertStart=Date.now();alertCursor=uid?storedAlert('staff-alert-seen-'+uid):null;
  $('staffAlert').classList.add('hidden');$('staffAlertText').textContent='';
 }
 if(!uid||!chatAllowed()||alertBusy||document.hidden||!navigator.onLine)return;
 alertBusy=true;
 try{
  const {data,error}=await db.rpc('latest_staff_alert');
  if(error||user?.id!==uid||!chatAllowed())return;
  const latest=data?.[0];if(!latest)return;
  const cursor=latest.created_at+'|'+latest.id;
  const previous=alertCursor;
  if(previous&&cursor<=previous)return;
  alertCursor=cursor;rememberAlert('staff-alert-seen-'+uid,cursor);
  if(tab==='chatPanel'||(!previous&&Date.parse(latest.created_at)<alertStart))return;
  $('staffAlertText').textContent=latest.body;
  $('staffAlert').classList.remove('hidden');
 }finally{alertBusy=false}
}
$('dismissStaffAlert').onclick=()=>$('staffAlert').classList.add('hidden');
$('readStaffAlert').onclick=()=>showTab('chatPanel');
setInterval(()=>{if(!document.hidden){checkStaffAlerts();if(tab!=='chatPanel')refreshChatBadge()}},12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkStaffAlerts();if(tab!=='chatPanel')refreshChatBadge()}});
function supportsStaffPush(){
 return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}
function deviceEnabled(){
 return !!user&&storedAlert('staff-push-owner')===user.id;
}
function updatePushSettings(){
 $('pushSettings').classList.toggle('hidden',!chatAllowed());
 if(!chatAllowed())return;
 const supported=supportsStaffPush(),enabled=deviceEnabled();
 $('pushToggle').textContent=enabled?'Désactiver les notifications du staff':'Activer les notifications du staff';
 $('pushToggle').disabled=pushBusy||!supported||(!enabled&&Notification.permission==='denied');
 $('pushStatus').textContent=!supported?'Sur iPhone, ajoute l’application à l’écran d’accueil et ouvre-la depuis son icône.':
  Notification.permission==='denied'?'Notifications bloquées. Autorise-les dans les réglages de ce site.':
  enabled?'Notifications activées sur cet appareil.':'Reçois une notification pour les nouveaux messages du staff, même quand l’application est fermée.';
}
async function pushServer(body){
 const {data,error}=await db.functions.invoke('staff-notifications',{body});
 if(error||data?.error)throw Error('Service de notifications indisponible. Réessaie après la configuration par le staff.');
 return data;
}
async function detachNotifications(){
 if(!deviceEnabled())return;
 const uid=user.id;
 try{
  const reg=await navigator.serviceWorker.getRegistration();
  const sub=await reg?.pushManager.getSubscription();
  if(sub){
   const stopped=await sub.unsubscribe();
   if(navigator.onLine){try{await pushServer({action:'unsubscribe',subscription:{endpoint:sub.endpoint}})}catch(e){if(!stopped)throw e}}else if(!stopped)throw Error('Abonnement encore actif');
  }
 }catch(e){throw Error('La désactivation a échoué. Réessaie dans Messages.')}
 if(storedAlert('staff-push-owner')===uid)rememberAlert('staff-push-owner',null);
}
$('pushToggle').onclick=async()=>{
 if(pushBusy||!chatAllowed()||!supportsStaffPush())return;
 pushBusy=true;updatePushSettings();let failure='';
 const uid=user.id;
 try{
  if(deviceEnabled()){await detachNotifications();return}
  if(!navigator.onLine)throw Error('Connecte-toi au réseau pour activer les notifications.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw Error(permission==='denied'?'Notifications bloquées dans les réglages du téléphone.':'Activation annulée.');
  const {publicKey}=await pushServer({action:'config'});
  const reg=await navigator.serviceWorker.ready;
  if(user?.id!==uid)return;
  let sub=await reg.pushManager.getSubscription();
  // Un abonnement est propre au compte qui a activé les notifications sur ce téléphone.
  if(sub&&storedAlert('staff-push-owner')!==uid){await sub.unsubscribe();sub=null}
  if(!sub){
   const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  }
  try{
   if(user?.id!==uid)throw Error('La session a changé.');
   await pushServer({action:'subscribe',subscription:sub.toJSON()});
   if(user?.id!==uid)throw Error('La session a changé.');
   rememberAlert('staff-push-owner',uid);
  }catch(e){await sub.unsubscribe();throw e}
 }catch(e){failure=e.message||'Activation impossible sur cet appareil.'}
 finally{pushBusy=false;updatePushSettings();if(failure)$('pushStatus').textContent=failure}
};
if('serviceWorker' in navigator){
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='open-staff-chat'){
   if(chatAllowed())showTab('chatPanel');else location.hash='messages';
  }
 });
}
