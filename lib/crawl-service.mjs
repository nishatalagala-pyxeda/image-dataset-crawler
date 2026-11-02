import {hubPublication,HOSTING_DATE_ROOT,hostingDatesURL} from './dataset-metadata.mjs';
import {eq,desc,asc,and,lte,or,lt,sql} from 'drizzle-orm';
import {DEFAULTS,inspectURL,extractPage,extractHub,discoverLinks,metadataURL} from './crawler.mjs';

// Inject the inspector and clock for deterministic tests using the real SQL schema.
export function createCatalogService(db,{datasets,runs,frontier,crawlState},{inspect=inspectURL,clock=()=>Date.now(),defaults=DEFAULTS}={}){
 const iso=()=>new Date(clock()).toISOString();
 const latestRun=async()=> (await db.select().from(runs).orderBy(desc(runs.startedAt),desc(runs.id)).limit(1))[0]||null;
 const catalog=()=>db.select().from(datasets).orderBy(desc(datasets.foundAt));
 const due=()=>or(eq(frontier.status,'pending'),and(eq(frontier.status,'failed'),lt(frontier.attempts,3),lte(frontier.retryAfter,clock())));
 async function discoveryStats(){
  const rows=await db.select({status:frontier.status,total:sql`count(*)`}).from(frontier).groupBy(frontier.status);
  const [available]=await db.select({total:sql`count(*)`}).from(frontier).where(due());
  return {pending:rows.find(r=>r.status==='pending')?.total||0,visited:rows.find(r=>r.status==='visited')?.total||0,failed:rows.find(r=>r.status==='failed')?.total||0,available:available?.total||0};
 }
 async function enqueue(url,depth=0,priority=10,status='pending'){
  try{url=metadataURL(url);}catch{return;}
  await db.insert(frontier).values({url,depth,priority,status,discoveredAt:iso()}).onConflictDoNothing();
 }
 async function initialize(){
  const [state]=await db.select().from(crawlState).where(eq(crawlState.id,'shared'));
  if(state.initialized)return;
  // Preserve work from old budget-limited runs and avoid revisiting their pages.
  const history=await db.select({seen:runs.seen,queue:runs.queue,status:runs.status}).from(runs).where(eq(runs.mode,'legacy'));
  for(const r of history){
   for(const url of JSON.parse(r.seen)){
    // Listing page needs one new inspection to obtain its previously unsaved cursor.
    const u=new URL(metadataURL(url));if(u.hostname==='huggingface.co'&&u.pathname==='/api/datasets')continue;
    await enqueue(url,0,10,'visited');
   }
  }
  for(const record of await catalog())await enqueue(record.url,0,10,'visited');
  for(const r of history)for(const item of JSON.parse(r.queue))await enqueue(item.url,item.depth||0);
  for(const url of defaults)await enqueue(url,0,new URL(url).pathname==='/api/datasets'?0:10);
  await db.update(crawlState).set({initialized:1}).where(eq(crawlState.id,'shared'));
 }
 async function lock(){
  await db.insert(crawlState).values({id:'shared'}).onConflictDoNothing();
  const token=crypto.randomUUID();
  const result=await db.update(crawlState).set({token,leaseUntil:clock()+180000}).where(and(eq(crawlState.id,'shared'),lte(crawlState.leaseUntil,clock()))).returning();
  return result.length?token:null;
 }
 async function unlock(token){await db.update(crawlState).set({token:null,leaseUntil:0}).where(and(eq(crawlState.id,'shared'),eq(crawlState.token,token)));}
 async function startRun(urls=[],limit=20,mode='discover'){
  if(!['discover','refresh','dates'].includes(mode))throw new Error('Choose discover, refresh, or dates');
  const normalized=mode==='discover'?urls.map(metadataURL):[]; // Validate before any mutations.
  const token=await lock();if(!token)throw new Error('Another crawl is inspecting a page. Please retry shortly.');
  try{
   const current=await latestRun();if(current?.status==='running')return current;
   if(mode==='discover')await initialize();
   let queue=[];
   if(mode==='discover'){for(const url of normalized)await enqueue(url,0,1);}
   else if(mode==='dates'){
    const missing=(await catalog()).filter(r=>r.url.startsWith('https://huggingface.co/datasets/')&&!r.publicationDate);
    if(missing.length){
     const [prior]=await db.select().from(runs).where(eq(runs.mode,'dates')).orderBy(desc(runs.startedAt)).limit(1);
     const saved=prior?JSON.parse(prior.queue):[];queue=saved.length?saved:[{url:hostingDatesURL(HOSTING_DATE_ROOT),depth:0}];
    }
   }
   else queue=[...new Set((await catalog()).sort((a,b)=>a.crawledAt.localeCompare(b.crawledAt)).map(r=>metadataURL(r.url)))].map(url=>({url,depth:0}));
   const available=mode==='discover'?(await discoveryStats()).available:queue.length;
   const row={id:crypto.randomUUID(),mode,startedAt:iso(),finishedAt:available?null:iso(),queue:JSON.stringify(queue),seen:'[]',logs:'[]',processed:0,added:0,updated:0,failed:0,status:available?'running':'complete',lease:0,pageLimit:limit};
   await db.insert(runs).values(row);return row;
  }finally{await unlock(token);}
 }
 async function stepRun(id){
  let [run]=await db.select().from(runs).where(eq(runs.id,id));if(!run)throw new Error('Crawl not found');if(run.status!=='running')return run;
  const token=await lock();if(!token)return run;
  try{
   // Reload after acquiring the lock: another tab may have advanced this run.
   [run]=await db.select().from(runs).where(eq(runs.id,id));if(run.status!=='running')return run;
   const mode=run.mode==='legacy'?'refresh':run.mode;
   if(mode==='discover')await initialize();
   const queue=JSON.parse(run.queue),seen=new Set(JSON.parse(run.seen)),logs=JSON.parse(run.logs);
   let item;
   if(mode==='discover')item=(await db.select().from(frontier).where(due()).orderBy(asc(frontier.priority),asc(frontier.discoveredAt),asc(frontier.url)).limit(1))[0];
   else{while(queue.length&&!item){const next=queue.shift();if(!seen.has(next.url))item=next;}}
   let {processed,added,updated,failed}=run;
   if(item){
    const at=iso();processed++;seen.add(item.url);
    try{
     const page=await inspect(item.url);
     const hub=page.type.includes('json')&&new URL(page.url).hostname==='huggingface.co';
     if(mode==='dates'){
      if(!hub)throw new Error('Expected a hosting metadata directory');
      const entries=JSON.parse(page.body);if(!Array.isArray(entries))throw new Error('Invalid hosting metadata list');
      const known=new Map((await catalog()).map(r=>[r.url,r]));const updates=[];let collected=0;
      for(const entry of entries){
       const url='https://huggingface.co/datasets/'+entry.id,existing=known.get(url);
       if(!existing||existing.publicationDate)continue;
       const publication=hubPublication(entry,url);if(!publication.publicationDate)continue;
       updates.push(db.update(datasets).set(publication).where(eq(datasets.id,existing.id)));collected++;
      }
      if(updates.length)await db.batch(updates);updated+=collected;
      const missing=(await catalog()).some(r=>r.url.startsWith('https://huggingface.co/datasets/')&&!r.publicationDate);
      if(missing&&page.next)queue.push({url:hostingDatesURL(page.next),depth:0});
      logs.unshift({url:item.url,at,state:'ok',message:`Collected ${collected} hosting dates for existing records; dataset counts and discovery dates retained.`});
     }else{
     const records=hub?extractHub([JSON.parse(page.body)].flat()):extractPage(page.url,page.body);
     const knownOnPage=mode==='refresh'?(await catalog()).filter(r=>metadataURL(r.url)===item.url):[];
     const refreshedIds=new Set();
     for(let record of records){
      let previous=(await db.select().from(datasets).where(eq(datasets.id,record.id)))[0];
      if(mode==='refresh'&&!previous&&records.length===1&&knownOnPage.length===1){previous=knownOnPage[0];record={...record,id:previous.id};}
      if(mode==='refresh'&&!previous)continue;
      if(previous?.publicationDate&&!record.publicationDate)record={...record,publicationDate:previous.publicationDate,publicationDateSource:previous.publicationDateSource,publicationDateBasis:previous.publicationDateBasis,publicationDateEvidence:previous.publicationDateEvidence};
      refreshedIds.add(record.id);
      await db.insert(datasets).values({...record,foundAt:at,crawledAt:at,lastSuccessAt:at,error:null}).onConflictDoUpdate({target:datasets.id,set:{...record,crawledAt:at,lastSuccessAt:at,error:null}});
      if(previous)updated++;else added++;
     }
     for(const known of knownOnPage)if(!refreshedIds.has(known.id))await db.update(datasets).set({crawledAt:at,error:'Page inspected, but matching dataset metadata was not found; previous values retained.'}).where(eq(datasets.id,known.id));
     if(mode==='discover'){
      if(hub&&page.next)await enqueue(page.next,0,10);
      if(!hub&&item.depth<3)for(const url of discoverLinks(page.url,page.body))await enqueue(url,item.depth+1,10);
      await db.update(frontier).set({status:'visited',lastAttemptAt:at,attempts:sql`${frontier.attempts}+1`,error:null}).where(eq(frontier.url,item.url));
     }
     logs.unshift({url:item.url,at,state:'ok',message:records.length?`${records.length} dataset record(s) inspected${mode==='discover'&&page.next?' · next page saved':''}`:'No qualifying image classification evidence found'});
     }
    }catch(e){
     failed++;const message=e instanceof Error?e.message:'Fetch failed';logs.unshift({url:item.url,at,state:'error',message});
     // Match canonical metadata URLs back to dataset page URLs for failure dates.
     for(const record of await catalog())if(metadataURL(record.url)===item.url)await db.update(datasets).set({crawledAt:at,error:message}).where(eq(datasets.id,record.id));
     if(mode==='discover')await db.update(frontier).set({status:'failed',lastAttemptAt:at,attempts:sql`${frontier.attempts}+1`,retryAfter:clock()+3600000,error:message}).where(eq(frontier.url,item.url));
    }
   }
   const remaining=mode==='discover'?(await discoveryStats()).available:queue.length;
   const done=processed>=run.pageLimit||!remaining;
   const values={queue:JSON.stringify(queue),seen:JSON.stringify([...seen]),logs:JSON.stringify(logs.slice(0,80)),processed,added,updated,failed,status:done?'complete':'running',finishedAt:done?iso():null,lease:0};
   await db.update(runs).set(values).where(eq(runs.id,id));return {...run,...values};
  }finally{await unlock(token);}
 }
 return {catalog,latestRun,startRun,stepRun,discoveryStats};
}
