// Optional local-preview smoke test. Restores the selected dataset's original status.
import assert from 'node:assert/strict';
const base=process.env.CATALOG_URL||'http://127.0.0.1:5173';
const catalog=async()=>{const r=await fetch(base+'/api/catalog');assert(r.ok);return (await r.json()).records;};
const patch=(id,usageStatus,origin)=>fetch(base+'/api/dataset-usage',{method:'PATCH',headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify({id,usageStatus})});
const records=await catalog(),sample=records[0];assert(sample,'local preview must contain a dataset');
try{
 for(const value of ['partially_used','used','new']){
  const r=await patch(sample.id,value);assert.equal(r.status,200);assert.equal((await r.json()).record.usageStatus,value);
  const saved=(await catalog()).find(r=>r.id===sample.id);assert.equal(saved.usageStatus,value);assert.equal(saved.foundAt,sample.foundAt);assert.equal(saved.crawledAt,sample.crawledAt);
  const selected=await fetch(base+'/api/export?format=json&usageStatus='+value);const rows=await selected.json();assert(rows.some(r=>r.id===sample.id));assert(rows.every(r=>r.usageStatus===value));
 }
 assert.equal((await patch(sample.id,'invalid')).status,400);
 assert.equal((await patch('missing','used')).status,404);
 assert.equal((await patch(sample.id,'used','https://other.example')).status,403);
 const csv=await (await fetch(base+'/api/export?usageStatus=new')).text();assert(csv.includes('usageStatus'));assert(csv.includes('"new"'));
 console.log(JSON.stringify({records:records.length,allStatuses:'persisted',filteredExports:'passed',invalid:400,missing:404,foreignOrigin:403}));
}finally{assert.equal((await patch(sample.id,sample.usageStatus)).status,200);}
