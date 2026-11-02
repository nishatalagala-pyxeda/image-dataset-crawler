import { getDb } from '../db';
import { datasets, runs } from '../db/schema';
import { eq, desc, and, lte } from 'drizzle-orm';
import { DEFAULTS, inspectURL, extractPage, extractHub, discoverLinks, safeURL } from './crawler.mjs';
export async function catalog(){return getDb().select().from(datasets).orderBy(desc(datasets.foundAt));}
export async function latestRun(){return (await getDb().select().from(runs).orderBy(desc(runs.startedAt)).limit(1))[0]||null;}
export async function startRun(urls:string[],limit=20){
 const db=getDb();const previous=await latestRun();if(previous?.status==='running')return previous;
 const existing=urls.length?[]:await catalog();
 const recheck=existing.map(r=>r.url.startsWith('https://huggingface.co/datasets/')?r.url.replace('/datasets/','/api/datasets/'):r.url);
 const queue=[...new Set(urls.length?urls.map(safeURL):[...DEFAULTS,...recheck])].map(url=>({url,depth:0}));
 const row={id:crypto.randomUUID(),startedAt:new Date().toISOString(),queue:JSON.stringify(queue),seen:'[]',logs:'[]',processed:0,added:0,status:'running',lease:0,pageLimit:limit};
 await db.insert(runs).values(row);return {...row,limit};
}
export async function stepRun(id:string,limit=20){
 const db=getDb();const [run]=await db.select().from(runs).where(eq(runs.id,id));if(!run)throw new Error('Crawl not found');if(run.status!=='running')return run;
 // Atomic lease prevents duplicate browser tabs from processing the same queue.
 const now=Date.now();
 const claimed=await db.update(runs).set({lease:now+90000}).where(and(eq(runs.id,id),eq(runs.status,'running'),eq(runs.processed,run.processed),lte(runs.lease,now))).returning();
 if(!claimed.length)return run;
 const queue=JSON.parse(run.queue) as {url:string;depth:number}[],seen=new Set<string>(JSON.parse(run.seen)),logs=JSON.parse(run.logs);
 let processed=run.processed,added=run.added;
 limit=run.pageLimit;
 try{
 const item=queue.shift();
 if(item&&!seen.has(item.url)){
  seen.add(item.url);processed++;const at=new Date().toISOString();
  try{
   const page=await inspectURL(item.url);const hub=page.type.includes('json')&&new URL(page.url).hostname==='huggingface.co';
   const records=hub?extractHub([JSON.parse(page.body)].flat()):extractPage(page.url,page.body);
   for(const record of records){
    const old=(await db.select().from(datasets).where(eq(datasets.id,record.id)))[0];
    await db.insert(datasets).values({...record,foundAt:at,crawledAt:at,lastSuccessAt:at,error:null}).onConflictDoUpdate({target:datasets.id,set:{...record,crawledAt:at,lastSuccessAt:at,error:null}});
    if(!old)added++;
   }
   if(item.depth<1&&!hub){for(const url of discoverLinks(page.url,page.body))if(!seen.has(url)&&!queue.some(q=>q.url===url))queue.push({url,depth:item.depth+1});}
   logs.unshift({url:item.url,at,state:'ok',message:records.length?records.length+' dataset record(s) inspected':'No qualifying image classification evidence found'});
  }catch(e){const message=e instanceof Error?e.message:'Fetch failed';logs.unshift({url:item.url,at,state:'error',message});await db.update(datasets).set({crawledAt:at,error:message}).where(eq(datasets.url,item.url));}
 }
 const done=!queue.length||processed>=limit;
 await db.update(runs).set({queue:JSON.stringify(queue),seen:JSON.stringify([...seen]),logs:JSON.stringify(logs.slice(0,80)),processed,added,status:done?'complete':'running',finishedAt:done?new Date().toISOString():null,lease:0}).where(eq(runs.id,id));
 return (await db.select().from(runs).where(eq(runs.id,id)))[0];
 }catch(e){await db.update(runs).set({lease:0}).where(eq(runs.id,id));throw e;}
}
