import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {drizzle} from 'drizzle-orm/d1';
import * as schema from '../db/schema.ts';
import {researchTerms,researchScope,analyzeWorks,inspectResearch} from '../lib/research-search.mjs';
import {createResearchService} from '../lib/research-service.mjs';
import {filterDatasets,csv} from '../lib/catalog-search.mjs';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const client={prepare(query){const stmt=sqlite.prepare(query);let params=[];return {bind(...p){params=p;return this;},async run(){const r=stmt.run(...params);return {success:true,meta:{changes:Number(r.changes)},results:[]};},async all(){return {results:stmt.all(...params),success:true};},async raw(){stmt.setReturnArrays(true);return stmt.all(...params);}};}};return {db:drizzle(client),sqlite};
}
const index=text=>{const out={};text.split(' ').forEach((word,i)=>(out[word]??=[]).push(i));return out;};
const work=(id,text,extra={})=>({id:'https://openalex.org/'+id,doi:'https://doi.org/10.1/'+id,display_name:'A visual learning method',publication_year:2024,type:'article',abstract_inverted_index:index(text),...extra});
const group={id:'a',name:'CIFAR-10 · everyday objects',sources:[{id:'a',name:'CIFAR-10 · everyday objects'},{id:'b',name:'Cifar10'}]};
const papers=analyzeWorks([work('W1','We evaluate our model on CIFAR-10 and obtain strong results.')],['CIFAR-10']);
const result={papers,examined:100,totalResults:3000,query:'"CIFAR-10"',terms:['CIFAR-10']};
test('use evidence is separate from mentions, negations, surveys and different dataset variants',()=>{
 const works=[work('use','We evaluate our model on CIFAR-10 and outperform prior methods.'),work('mention','CIFAR-10 is a popular dataset.'),work('negative','We do not use CIFAR-10 for training our model.'),work('survey','Our survey reviews experiments on CIFAR-10.'),work('other','We evaluate our model on CIFAR-100.')];
 const data=analyzeWorks(works,['Cifar10']);assert.equal(data.filter(p=>p.basis==='use_evidence').length,1);assert.equal(data.filter(p=>p.basis==='mention').length,3);assert(data[0].evidence.includes('CIFAR-10'));assert(!data.some(p=>p.id.endsWith('other')));
 assert.equal(analyzeWorks([work('fashion','We train our model on Fashion-MNIST.')],['MNIST']).length,0);
});
test('papers deduplicate by DOI or title/year, and missing abstracts remain mentions',()=>{
 const data=analyzeWorks([work('a','CIFAR-10 is common.',{doi:'https://doi.org/10.1/same'}),work('b','We evaluate our method on CIFAR-10.',{doi:'https://doi.org/10.1/same'}),work('c','',{display_name:'A CIFAR-10 benchmark',abstract_inverted_index:null})],['CIFAR-10']);assert.equal(data.length,2);assert.equal(data.filter(p=>p.basis==='use_evidence').length,1);assert.equal(data.find(p=>p.id.endsWith('c')).basis,'mention');
});
test('search terms normalize duplicate source titles and explicit query overrides, scopes change on regrouping',()=>{
 assert.deepEqual(researchTerms(group),['CIFAR-10']);assert.deepEqual(researchTerms(group,'Oxford Flowers 102'),['Oxford Flowers 102']);assert.notEqual(researchScope(group),researchScope({...group,sources:[group.sources[0]]}));assert.equal(researchScope(group),researchScope({...group,sources:[...group.sources].reverse()}));
});
test('provider fetch is bounded, queries names as phrases and never equates search hits with use count',async()=>{
 const data=await inspectResearch(['CIFAR-10'],{fetcher:async url=>{const u=new URL(url);assert.equal(u.hostname,'api.openalex.org');assert.equal(u.searchParams.get('per_page'),'100');assert.equal(u.searchParams.get('search'),'"CIFAR-10"');return Response.json({meta:{count:50000},results:[work('a','We evaluate our model on CIFAR-10.')]});}});assert.equal(data.papers.length,1);assert.equal(data.totalResults,50000);assert.equal(data.examined,1);
 await assert.rejects(inspectResearch(['CIFAR-10'],{fetcher:async()=>new Response('busy',{status:429})}),/rate limiting/);
 await assert.rejects(inspectResearch(['CIFAR-10'],{fetcher:async()=>Response.json({invalid:true})}),/invalid/);
});
test('counts persist, unsearched is unknown, cache prevents repeat work and regrouping does not misattribute papers',async()=>{
 const {db}=fixture();let now=100000,calls=0;const service=createResearchService(db,schema,{clock:()=>now,inspect:async()=>{calls++;return result;}});
 assert.equal((await service.attach([group]))[0].researchPaperCount,null);const saved=await service.search(group);assert.equal(saved.researchPaperCount,1);assert.equal(saved.researchTotalResults,3000);assert.equal(saved.papers.length,1);
 const recreated=createResearchService(db,schema,{clock:()=>now,inspect:async()=>{calls++;return result;}});assert.equal((await recreated.attach([group]))[0].researchPaperCount,1);
 now+=2000;await recreated.search(group);assert.equal(calls,1);assert.equal((await recreated.attach([{...group,sources:[group.sources[0]]}]))[0].researchPaperCount,null);
 assert(csv(await service.attach([group])).includes('researchPaperCount'));assert.equal(filterDatasets([{researchPaperCount:null},{researchPaperCount:1}],{sort:'papers'})[0].researchPaperCount,1);
});
test('provider errors preserve last successful findings and never turn a failure into zero papers',async()=>{
 const {db}=fixture();let now=100000;const good=createResearchService(db,schema,{clock:()=>now,inspect:async()=>result});await good.search(group);now+=70000;
 const bad=createResearchService(db,schema,{clock:()=>now,inspect:async()=>{throw new Error('Provider unavailable');}});await assert.rejects(bad.search(group),{status:502});const saved=await bad.details(group);assert.equal(saved.researchPaperCount,1);assert.equal(saved.researchStatus,'error');assert.equal(saved.papers.length,1);
 now+=70000;const fresh={id:'z',name:'New dataset',sources:[{id:'z',name:'New dataset'}]};await assert.rejects(bad.search(fresh),{status:502});assert.equal((await bad.details(fresh)).researchPaperCount,null);
});
test('shared lease blocks overlapping searches and releases after failures',async()=>{
 const {db}=fixture();let now=100000,release,started;const wait=new Promise(r=>release=r),entered=new Promise(r=>started=r);const service=createResearchService(db,schema,{clock:()=>now,inspect:async()=>{started();await wait;return result;}});
 const first=service.search(group);await entered;await assert.rejects(service.search(group),{status:429});release();await first;now+=2000;await service.search(group);
});

test('a rate-limited OpenAlex query falls back to Europe PMC and labels its actual coverage',async()=>{
 const result=await inspectResearch(['CIFAR-10'],{fetcher:async url=>new URL(url).hostname==='api.openalex.org'?new Response('limited',{status:429}):Response.json({hitCount:1000,resultList:{result:[{id:'123',source:'MED',title:'Visual learning',doi:'10.1/example',pubYear:'2025',abstractText:'<h4>Results</h4> We evaluate our model on CIFAR-10.'}]}})});
 assert.equal(result.provider,'Europe PMC');assert.equal(result.totalResults,1000);assert.equal(result.papers.length,1);assert.equal(result.papers[0].basis,'use_evidence');assert.equal(result.papers[0].url,'https://doi.org/10.1/example');
});
