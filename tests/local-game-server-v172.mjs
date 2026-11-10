import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../_worker.js';
const db=new DatabaseSync(':memory:');
class D1 {
  constructor(db){this.db=db}
  prepare(sql){let values=[];const self=this;return {bind(...v){values=v;return this},async first(field){const row=self.db.prepare(sql).get(...values)??null;return field?row?.[field]??null:row},async all(){return {results:self.db.prepare(sql).all(...values)}},async run(){const x=self.db.prepare(sql).run(...values);return {meta:{changes:x.changes}}},sync(){const q=self.db.prepare(sql);if(/^\s*SELECT\b/i.test(sql)||/\bRETURNING\b/i.test(sql))return {results:q.all(...values),meta:{changes:0}};return{results:[],meta:{changes:q.run(...values).changes}}}}}
  async batch(statements){this.db.exec('BEGIN');try{const r=statements.map(s=>s.sync());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.json':'application/json'};
const env={DB:new D1(db)};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:8792');
  if(url.pathname.startsWith('/jeu/api/')){
   let body='';for await(const chunk of req)body+=chunk;
   const request=new Request('http://localhost:8792'+req.url,{method:req.method,headers:req.headers,body:req.method==='POST'?body:undefined});
   const result=await worker.fetch(request,env);
   res.writeHead(result.status,Object.fromEntries(result.headers.entries()));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  const pathname=decodeURIComponent(url.pathname),file=resolve(join(process.cwd(),pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(process.cwd())){res.writeHead(403);res.end();return}
  const content=await readFile(file);
  const extension=file.slice(file.lastIndexOf('.'));
  res.writeHead(200,{'content-type':mime[extension]??'application/octet-stream'});res.end(content);
 }catch(e){res.writeHead(404);res.end(String(e.message))}
});
server.listen(8792,'127.0.0.1',()=>console.log('Local game server on 8792'));
