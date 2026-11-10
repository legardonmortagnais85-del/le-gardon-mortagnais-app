import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('app-78.js',root),'utf8');
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const nodes=new Map();
function $(id){
 if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',disabled:false,classList:{toggle(){}},setAttribute(){}});
 return nodes.get(id);
}
const queue=new Map(),received=new Map();
const storage={put:item=>queue.set(item.id,item),getAll:()=>[...queue.values()],delete:id=>queue.delete(id)};
let open=false,simulateLostReply=false,uploadCount=0;
const ctx=vm.createContext({
 $,team:{id:'team',registration_status:'confirmed'},user:{id:'user'},staff:false,
 navigator:{onLine:false},catchWindow:null,catchSubmitting:false,syncing:false,
 species:['Brochet'],minimums:{},photoSource:'camera',photoBlob:new Blob(['photo']),
 crypto:{randomUUID:()=>'test-id'},queueOp:async(mode,action)=>action(storage),
 refreshCatchWindow:async()=>true,catchesAreOpen:()=>open,updateCatchAccess(){},
 clearPhoto(){ctx.photoBlob=null},paintLength(){},showQueue(){},loadMine(){},
 message(id,text){$(id).textContent=text},
 db:{
  storage:{from:()=>({upload:async()=>{uploadCount++;return {error:null}}})},
  from:()=>({
   select:()=>({eq:(_,id)=>({maybeSingle:async()=>({data:received.get(id)||null})})}),
   insert:async row=>{
    received.set(row.id,row);
    if(simulateLostReply)throw Error('Réponse interrompue');
    return {error:null};
   }
  })
 }
});
function portion(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);
 return source.slice(a,b);
}
vm.runInContext(portion('async function syncQueue()', "$('syncQueue').onclick"),ctx);
vm.runInContext(portion("$('send').onclick=async()=>", 'function stateText'),ctx);
$('mm').value='780';$('fish').value='Brochet';
await $('send').onclick();
assert.equal(queue.size,1);assert.equal(received.size,0);
const draft=queue.get('test-id');assert.ok(draft.blob);assert.ok(Date.parse(draft.capturedAt));
ctx.navigator.onLine=true;
await ctx.syncQueue();assert.equal(queue.size,1);assert.equal(uploadCount,0);
open=true;simulateLostReply=true;
await ctx.syncQueue();assert.equal(queue.size,1);assert.equal(received.size,1);
await Promise.all([ctx.syncQueue(),ctx.syncQueue()]);
assert.equal(queue.size,0);assert.equal(uploadCount,1);
assert.equal(received.get('test-id').declared_on_device_at,draft.capturedAt);
assert.equal(received.get('test-id').status,'pending');
ctx.navigator.onLine=false;ctx.photoBlob=new Blob(['photo']);ctx.minimums.Brochet=600;$('mm').value='25';
await $('send').onclick();assert.equal(queue.get('test-id').mm,25);
ctx.navigator.onLine=true;
vm.runInContext(portion('function paintHomeContest()', 'function paintCatchWindow()')+portion('function rankingClock(', 'function paintRankingTimer()'),ctx);
ctx.catchWindowOffset=0;
ctx.catchWindow={mode:'manual',is_open:false};ctx.paintHomeContest();assert.match($('homeContest').textContent,/Prises fermées/);
ctx.catchWindow={mode:'scheduled',opens_at:new Date(Date.now()-60000).toISOString(),closes_at:new Date(Date.now()+60000).toISOString()};ctx.paintHomeContest();assert.match($('homeContest').textContent,/Pêche en cours/);
ctx.catchWindow.closes_at=new Date(Date.now()-1000).toISOString();ctx.paintHomeContest();assert.equal($('homeContest').textContent,'Concours terminé');
const pilot=html.slice(html.indexOf('id="staffPilot"'),html.indexOf('id="staffSettings"'));
for(const id of ['startContestTimer','staffCatchWindow','openCatches','closeCatches','catchStart','catchEnd','scheduleCatches'])assert.ok(pilot.includes('id="'+id+'"'),id);
assert.equal((html.match(/data-minimum=/g)||[]).length,0);
console.log('Brouillon hors ligne, fermeture, réponse perdue, reprise concurrente, petite prise, pilotage et état du concours vérifiés.');
