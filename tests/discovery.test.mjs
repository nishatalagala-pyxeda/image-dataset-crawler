import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {drizzle} from 'drizzle-orm/d1';
import {eq} from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import {createCatalogService} from '../lib/crawl-service.mjs';
import {metadataURL,nextPageURL} from '../lib/crawler.mjs';

// Exercise Drizzle's D1 queries against a real SQLite database and committed migrations.
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const client={prepare(query){const stmt=sqlite.prepare(query);let params=[];return {bind(...p){params=p;return this;},async run(){const r=stmt.run(...params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)},results:[]};},async all(){return {results:stmt.all(...params),success:true};},async raw(){stmt.setReturnArrays(true);return stmt.all(...params);}};}};
 return {db:drizzle(client),sqlite};
}
const root=metadataURL('https://huggingface.co/api/datasets?filter=task_categories:image-classification&limit=1');
const next=metadataURL(root+'&cursor=second');
const third=metadataURL(root+'&cursor=third');
const dataset=(name,total=40)=>({id:'fixture/'+name,tags:['task_categories:image-classification'],description:'A dataset of categorized animal images.',cardData:{dataset_info:{features:[{name:'image',dtype:'image'},{name:'label',dtype:{class_label:{names:['cat','dog']}}}],splits:[{num_examples:total}]}}});
const jsonPage=(url,items,next=null)=>({url,body:JSON.stringify(items),type:'application/json',next});

test('pagination accepts provider cursors and rejects off-site or file links',()=>{
 const link='<'+root+'&cursor=opaque%2Ftoken>; rel="next"';
 const parsed=nextPageURL(link,root);assert.equal(new URL(parsed).searchParams.get('cursor'),'opaque/token');
 assert.equal(nextPageURL('<https://evil.example/api/datasets?cursor=x>; rel="next"',root),null);
 assert.equal(nextPageURL('<https://huggingface.co/data.zip?cursor=x>; rel="next"',root),null);
 assert.equal(nextPageURL('<'+root+'>; rel="prev"',root),null);
 assert.equal(metadataURL('https://huggingface.co/datasets/fixture/alpha'),metadataURL('https://huggingface.co/api/datasets/fixture/alpha?full=true'));
});

test('successive budget-limited runs survive service recreation and discover new records',async()=>{
 const {db}=fixture();let now=1000;const calls=[];
 const inspect=async url=>{calls.push(url);if(url===root)return jsonPage(url,[dataset('alpha')],next);if(url===next)return jsonPage(url,[dataset('beta')],third);throw new Error('Unexpected URL '+url);};
 const make=()=>createCatalogService(db,schema,{defaults:[root],inspect,clock:()=>now++});
 let service=make(),run=await service.startRun([],1,'discover');run=await service.stepRun(run.id);
 assert.equal(run.status,'complete');assert.equal(run.added,1);assert.equal((await service.discoveryStats()).pending,1);
 service=make();run=await service.startRun([],1,'discover');run=await service.stepRun(run.id);
 assert.equal(run.added,1);assert.equal((await service.catalog()).length,2);assert.deepEqual(calls,[root,next]);
 assert.equal((await db.select().from(schema.frontier).where(eq(schema.frontier.url,third)))[0].status,'pending');
});

test('refresh preserves discovery dates, updates counts and leaves the unexplored queue untouched',async()=>{
 const {db}=fixture();let now=1000;let refreshing=false;
 const inspect=async url=>refreshing?jsonPage(url,dataset('alpha',90),third):jsonPage(url,[dataset('alpha')],next);
 const service=createCatalogService(db,schema,{defaults:[root],inspect,clock:()=>now++});
 let run=await service.startRun([],1,'discover');await service.stepRun(run.id);
 const original=(await service.catalog())[0];const before=await service.discoveryStats();refreshing=true;
 run=await service.startRun([],1,'refresh');run=await service.stepRun(run.id);
 const updated=(await service.catalog())[0];assert.equal(run.added,0);assert.equal(run.updated,1);assert.equal(updated.images,90);assert.equal(updated.foundAt,original.foundAt);assert(updated.crawledAt>original.crawledAt);assert.deepEqual(await service.discoveryStats(),before);
});

test('HTML discovery retains links beyond the page budget, deduplicates cycles and explores deeper',async()=>{
 const {db}=fixture();let now=1000;const calls=[];
 const inspect=async url=>{calls.push(url);return {url,type:'text/html',body:url.endsWith('/index')?'<a href="/birds">Bird dataset</a>':'<title>Bird dataset</title><p>A dataset of 40 images in 2 categories.</p><a href="/index">Dataset index</a><a href="/birds.zip">Dataset download</a><a href="/birds2">More datasets</a>'};};
 const make=()=>createCatalogService(db,schema,{defaults:[],inspect,clock:()=>now++});
 let service=make();let run=await service.startRun(['https://example.org/index'],1,'discover');await service.stepRun(run.id);
 assert.equal((await service.discoveryStats()).pending,1);
 service=make();run=await service.startRun(['https://example.org/index'],1,'discover');run=await service.stepRun(run.id);
 assert.equal(run.added,1);assert.equal((await service.discoveryStats()).pending,1);assert.deepEqual(calls,['https://example.org/index','https://example.org/birds']);
});

test('concurrent tabs do not inspect a page twice or create two active runs',async()=>{
 const {db}=fixture();let now=1000;let calls=0;let release;
 const waiting=new Promise(resolve=>{release=resolve;});
 const service=createCatalogService(db,schema,{defaults:[root],clock:()=>now++,inspect:async url=>{calls++;await waiting;return jsonPage(url,[dataset('alpha')],next);}});
 const starts=await Promise.allSettled([service.startRun([],1,'discover'),service.startRun([],1,'discover')]);
 assert.equal((await db.select().from(schema.runs)).length,1);const run=starts.find(r=>r.status==='fulfilled').value;
 const first=service.stepRun(run.id);while(!calls)await new Promise(resolve=>setImmediate(resolve));
 const second=await service.stepRun(run.id);assert.equal(second.processed,0);release();await first;
 assert.equal(calls,1);assert.equal((await service.catalog()).length,1);
});

test('failed discovery pages remain saved, back off and do not block new pages',async()=>{
 const {db}=fixture();let now=1000;let calls=0;
 const service=createCatalogService(db,schema,{defaults:[root,'https://example.org/broken'],clock:()=>now++,inspect:async url=>{calls++;if(url===root)throw new Error('temporary timeout');return {url,type:'text/html',body:'No dataset here'};}});
 let run=await service.startRun([],1,'discover');run=await service.stepRun(run.id);assert.equal(run.failed,1);assert.equal((await service.discoveryStats()).failed,1);
 run=await service.startRun([],1,'discover');await service.stepRun(run.id);assert.equal(calls,2);assert.equal((await service.discoveryStats()).pending,0);
 run=await service.startRun([],1,'discover');assert.equal(run.status,'complete');assert.equal(calls,2);
});

test('first upgraded discovery imports legacy leftovers without losing records or rechecking known pages',async()=>{
 const {db}=fixture();let now=1000;const known='https://example.org/known';const pending='https://example.org/new';
 await db.insert(schema.runs).values({id:'old',startedAt:new Date(0).toISOString(),queue:JSON.stringify([{url:pending,depth:1}]),seen:JSON.stringify([known]),logs:'[]',status:'complete'});
 const calls=[];const service=createCatalogService(db,schema,{defaults:[known],clock:()=>now++,inspect:async url=>{calls.push(url);return {url,type:'text/html',body:'<title>New dataset</title>A dataset of 40 images in 2 classes'};}});
 let run=await service.startRun([],1,'discover');run=await service.stepRun(run.id);assert.deepEqual(calls,[pending]);assert.equal(run.added,1);
});

test('refresh retains an existing identifier when a single publisher page changes its generated name',async()=>{
 const {db}=fixture();let now=1000;
 const service=createCatalogService(db,schema,{defaults:[],clock:()=>now++,inspect:async url=>({url,type:'text/html',body:'<title>Original dataset</title>A dataset of 40 images in 2 classes'})});
 let run=await service.startRun(['https://example.org/old'],1,'discover');await service.stepRun(run.id);
 const old=(await service.catalog())[0];
 const revised=createCatalogService(db,schema,{defaults:[],clock:()=>now++,inspect:async url=>({url,type:'text/html',body:'<title>Renamed dataset</title>A dataset of 80 images in 2 classes'})});
 run=await revised.startRun([],1,'refresh');run=await revised.stepRun(run.id);
 const rows=await revised.catalog();assert.equal(rows.length,1);assert.equal(rows[0].id,old.id);assert.equal(rows[0].foundAt,old.foundAt);assert.equal(rows[0].images,80);assert.equal(run.updated,1);assert.equal(run.added,0);
});

test('directory pagination does not starve other websites or newly supplied starting pages',async()=>{
 const {db}=fixture();let now=1000;const calls=[];
 const service=createCatalogService(db,schema,{defaults:[root,'https://example.org/directory'],clock:()=>now++,inspect:async url=>{calls.push(url);return url===root?jsonPage(url,[dataset('alpha')],next):{url,type:'text/html',body:'Dataset directory'};}});
 let run=await service.startRun([],1,'discover');await service.stepRun(run.id);
 run=await service.startRun([],1,'discover');await service.stepRun(run.id);
 assert.equal(calls[1],'https://example.org/directory');
 run=await service.startRun(['https://other.example.org/datasets'],1,'discover');await service.stepRun(run.id);
 assert.equal(calls[2],'https://other.example.org/datasets');
});
