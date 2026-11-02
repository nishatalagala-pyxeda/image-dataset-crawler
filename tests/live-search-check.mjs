// Optional smoke test for a running local preview; inspects metadata only.
import assert from 'node:assert/strict';
const base=process.env.CATALOG_URL||'http://127.0.0.1:5173';
const get=async path=>{const r=await fetch(base+path);assert(r.ok,await r.clone().text());return r.json();};
const post=async body=>{const r=await fetch(base+'/api/crawl',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert(r.ok,d.error);return d.run;};
const before=await get('/api/catalog');
let run=await post({action:'start',mode:'refresh',limit:5});while(run.status==='running'){run=await post({action:'step',id:run.id});await new Promise(resolve=>setTimeout(resolve,1000));}
const after=await get('/api/catalog');assert(after.records.some(r=>r.domains.includes('biodiversity')),'existing records should have inferred domain labels');
const sample=after.records.find(r=>r.publicationDate&&r.domains.length&&r.images!==null);assert(sample,'refresh should collect source publication/hosting metadata');
const params=new URLSearchParams({format:'json',domain:sample.domains[0],publishedFrom:sample.publicationDate,publishedTo:sample.publicationDate,minImages:String(sample.images),maxImages:String(sample.images)});
const filtered=await get('/api/export?'+params);assert(filtered.some(r=>r.id===sample.id));assert(filtered.every(r=>r.domains.includes(sample.domains[0])&&r.images===sample.images&&r.publicationDate===sample.publicationDate));
for(const row of before.records)assert.equal(after.records.find(r=>r.id===row.id).foundAt,row.foundAt);
const unknown=await get('/api/export?format=json&dateAvailability=unknown');assert(unknown.every(r=>r.publicationDate===null));
const invalid=await fetch(base+'/api/export?minImages=100&maxImages=10');assert.equal(invalid.status,400);
const csv=await fetch(base+'/api/export?domain=biodiversity');const body=await csv.text();assert(body.includes('publicationDateSource'));assert(body.includes('domainEvidence'));
console.log(JSON.stringify({records:after.records.length,knownSourceDates:after.records.filter(r=>r.publicationDate).length,biodiversity:after.records.filter(r=>r.domains.includes('biodiversity')).length,combinedFilterRows:filtered.length,preservedDiscoveryDates:true,csv:'passed',invalidRange:400}));
