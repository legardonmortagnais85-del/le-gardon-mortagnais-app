
import {createClient} from '../vendor/supabase.bundle.mjs';
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

window.participantToken = async () => {
 const {data, error} = await db.auth.getSession();
 if(error)throw new Error('Impossible de vérifier ta session. Réessaie dans un instant.');
 return data.session?.access_token||null;
};
const grades = document.createElement('script');
grades.src = './grades.js?v=193';
grades.onload = () => {
  const script = document.createElement('script');
  script.src = './game.js?v=193';
  document.head.append(script);
};
document.head.append(grades);
