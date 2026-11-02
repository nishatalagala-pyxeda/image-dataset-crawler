// Optional network smoke test against an already initialized local preview.
import assert from 'node:assert/strict';
const base=process.env.CATALOG_URL||'http://127.0.0.1:5173';
const post=async body=>{const r=await fetch(base+'/api/crawl',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert(r.ok,d.error);return d.run;};
const catalog=async()=>{const r=await fetch(base+'/api/catalog');assert(r.ok);return r.json();};
const execute=async mode=>{let run=await post({action:'start',mode,limit:1});while(run.status==='running')run=await post({action:'step',id:run.id});return run;};
const first=await execute('discover'),second=await execute('discover');
const firstURL=JSON.parse(first.logs)[0]?.url,secondURL=JSON.parse(second.logs)[0]?.url;
assert(firstURL&&secondURL&&firstURL!==secondURL,'successive discoveries must advance to different pages');
assert(new URL(secondURL).searchParams.has('cursor'),'second discovery should use a saved pagination cursor');
assert(second.added>0,'second discovery should add newly found dataset records');
const before=await catalog();const refreshed=await execute('refresh');const after=await catalog();
assert.equal(refreshed.added,0);assert(refreshed.updated>0,'refresh must update existing metadata');assert.equal(after.records.length,before.records.length);
assert.deepEqual(after.discovery,before.discovery,'refresh must not consume discovery queue');
for(const r of before.records){assert.equal(after.records.find(x=>x.id===r.id).foundAt,r.foundAt);}
const csv=await fetch(base+'/api/export');assert(csv.ok);assert(csv.headers.get('content-disposition').includes('.csv'));assert((await csv.text()).includes('foundAt'));
const json=await fetch(base+'/api/export?format=json');assert.equal((await json.json()).length,after.records.length);
console.log(JSON.stringify({first:{pages:first.processed,added:first.added},second:{pages:second.processed,added:second.added,usesSavedCursor:true},refresh:{updated:refreshed.updated,added:refreshed.added},pending:after.discovery.pending,exports:'passed'}));
