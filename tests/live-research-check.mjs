// Optional local-preview smoke test. Saves real public scholarly metadata only.
import assert from 'node:assert/strict';
const base=process.env.CATALOG_URL||'http://127.0.0.1:5173';
const get=async path=>{const response=await fetch(base+path);assert(response.ok,await response.clone().text());return response.json();};
const before=await get('/api/catalog'),record=before.records.find(r=>r.name.startsWith('CIFAR-10'));assert(record);
const response=await fetch(base+'/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:record.id})});const result=await response.json();assert(response.ok,result.error);
assert.equal(result.researchPaperCount,result.papers.filter(p=>p.basis==='use_evidence').length);assert(result.researchExamined<=100);assert(result.researchTotalResults>=result.researchExamined);
const saved=await get('/api/research?'+new URLSearchParams({id:record.id}));assert.equal(saved.researchPaperCount,result.researchPaperCount);const after=(await get('/api/catalog')).records.find(r=>r.id===record.id);assert.equal(after.researchPaperCount,result.researchPaperCount);assert.equal(after.usageStatus,record.usageStatus);assert.equal(after.crawledAt,record.crawledAt);
const csv=await (await fetch(base+'/api/export')).text();assert(csv.includes('researchPaperCount'));assert(csv.includes('researchSearchedAt'));
const missing=await fetch(base+'/api/research?id=missing');assert.equal(missing.status,404);
console.log(JSON.stringify({paperCount:result.researchPaperCount,mentionCount:result.researchMentionCount,examined:result.researchExamined,totalSearchHits:result.researchTotalResults,persisted:true,csv:'passed'}));
