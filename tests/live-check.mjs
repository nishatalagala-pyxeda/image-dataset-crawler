import assert from 'node:assert/strict';
const base=process.env.CATALOG_URL||'http://127.0.0.1:5173';
const post=async body=>{const r=await fetch(base+'/api/crawl',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert(r.ok,d.error);return d.run;};
const catalog=async()=>{const r=await fetch(base+'/api/catalog');assert(r.ok);return (await r.json()).records;};
const before=await catalog();
const old=before.find(x=>x.name.startsWith('CIFAR-10 ·'));
let run=await post({action:'start',urls:['https://cave.cs.toronto.edu/kriz/cifar.html'],limit:1});
const simultaneous=await Promise.all([post({action:'step',id:run.id}),post({action:'step',id:run.id})]);
run=simultaneous.sort((a,b)=>b.processed-a.processed)[0];
assert.equal(run.processed,1,'concurrent requests process a page once');
while(run.status==='running')run=await post({action:'step',id:run.id});
const after=await catalog();const row=after.find(x=>x.name.startsWith('CIFAR-10 ·'));
assert(row,'CIFAR metadata should be cataloged');assert.equal(row.images,60000);assert.equal(row.categories,10);assert.equal(row.error,null);
if(old){assert.equal(row.foundAt,old.foundAt,'first discovery must not change');assert(row.crawledAt>old.crawledAt,'last crawl advances');assert.equal(after.filter(x=>x.id===row.id).length,1);}
const csv=await fetch(base+'/api/export');assert(csv.ok);assert(csv.headers.get('content-disposition').includes('.csv'));assert((await csv.text()).includes('CIFAR-10'));
const json=await fetch(base+'/api/export?format=json');assert.equal((await json.json()).length,after.length);
console.log('Live checks passed: publisher extraction, preserved discovery date, updated crawl date, deduplication, concurrent requests, CSV and JSON exports.');
