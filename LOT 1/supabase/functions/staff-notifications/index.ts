import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
async function rpc(name:string,args:Record<string,unknown>={}){
 const {data,error}=await admin.rpc(name,args);if(error)throw new Error(name);return data;
}
function allowedEndpoint(value:unknown){
 if(typeof value!=='string'||value.length>3000)return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&
   (['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'].includes(u.hostname)||
   u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname.endsWith('.notify.windows.com'));
 }catch{return false}
}
async function settings(){
 const current=await rpc('staff_push_settings');
 return current.keys?current:await rpc('staff_push_settings',{candidate:webpush.generateVAPIDKeys()});
}
async function dispatch(token:string|null){
 if(!token)return reply(403,{error:'Accès refusé'});
 const config=await settings();
 if(token!==config.token)return reply(403,{error:'Accès refusé'});
 const jobs=await rpc('staff_push_claim');
 for(let i=0;i<jobs.length;i+=10){
  await Promise.all(jobs.slice(i,i+10).map(async job=>{
   let outcome='retry';
   if(!allowedEndpoint(job.subscription.endpoint))outcome='expired';
   else try{
    const request=webpush.generateRequestDetails(job.subscription,JSON.stringify({id:job.message_id}),{
     TTL:3600,urgency:'high',vapidDetails:{subject:'mailto:legardonmortagnais85@gmail.com',publicKey:config.keys.publicKey,privateKey:config.keys.privateKey}
    });
    const response=await fetch(request.endpoint,{method:'POST',headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(7000)});
    await response.body?.cancel();
    if(response.ok)outcome='done';
    if([404,410].includes(response.status))outcome='expired';
   }catch{/* Une livraison en attente sera reprise au prochain passage. */}
   await rpc('staff_push_finish',{device:job.device_id,msg:job.message_id,attempt_no:job.attempt,outcome});
  }));
 }
 return reply(200,{processed:jobs.length});
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply(405,{error:'Méthode invalide'});
 try{
  const data=await req.json();
  if(data.action==='dispatch')return await dispatch(req.headers.get('x-dispatch-token'));
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
  if(!token)return reply(401,{error:'Connexion requise'});
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return reply(401,{error:'Connexion requise'});
  if(data.action==='config')return reply(200,{publicKey:(await settings()).keys.publicKey});
  if(!['subscribe','unsubscribe'].includes(data.action)||!allowedEndpoint(data.subscription?.endpoint))return reply(400,{error:'Abonnement invalide'});
  const enable=data.action==='subscribe',sub=data.subscription;
  if(enable&&(!/^[A-Za-z0-9_-]{87}$/.test(sub.keys?.p256dh??'')||!/^[A-Za-z0-9_-]{22}$/.test(sub.keys?.auth??'')))return reply(400,{error:'Clés invalides'});
  const ok=await rpc('staff_push_device',{owner:user.id,sub:{endpoint:sub.endpoint,keys:sub.keys},enable});
  return ok?reply(200,{ok:true}):reply(403,{error:'Compte non autorisé'});
 }catch{return reply(503,{error:'Service de notifications indisponible'});}
});
