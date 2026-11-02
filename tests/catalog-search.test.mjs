import test from 'node:test';
import assert from 'node:assert/strict';
import {inferDomains,pagePublication,hubPublication,displayRecord,normalizePublicationDate} from '../lib/dataset-metadata.mjs';
import {filterDatasets,filterError,csv} from '../lib/catalog-search.mjs';
import {extractPage,extractHub,metadataURL} from '../lib/crawler.mjs';
const url='https://example.org/birds';
const rows=[
 {id:'birds',name:'Bird species',subject:'Wild birds',source:'Publisher',status:'matched',domains:['biodiversity'],images:500,publicationDate:'2021-03-15',foundAt:'2026-11-02T10:00:00Z'},
 {id:'leaves',name:'Leaf disease',subject:'Crop leaves',source:'Hub',status:'matched',domains:['biodiversity','agriculture'],images:2000,publicationDate:'2024-01-01',foundAt:'2026-10-01T00:00:00Z'},
 {id:'unknown',name:'Unknown dates',subject:'Species dataset',source:'Hub',status:'review',domains:['biodiversity'],images:1000,publicationDate:null,foundAt:'2026-11-02T10:00:00Z'},
 {id:'scans',name:'CT scans',subject:'Clinical images',source:'Hub',status:'matched',domains:['medical'],images:1000,publicationDate:'2022-07-01',foundAt:'2026-11-02T10:00:00Z'},
 {id:'missing',name:'Uncataloged',subject:'Unclear subject',source:'Hub',status:'review',domains:[],images:null,publicationDate:null,foundAt:'2026-11-02T10:00:00Z'},
];
test('domain, publication and image-count filters combine with inclusive bounds',()=>{
 assert.deepEqual(filterDatasets(rows,{domain:'biodiversity',publishedFrom:'2021-03-15',publishedTo:'2024-01-01',minImages:'500',maxImages:'2000'}).map(r=>r.id).sort(),['birds','leaves']);
 assert.deepEqual(filterDatasets(rows,{domain:'biodiversity',minImages:'1000',maxImages:'1000'}).map(r=>r.id),['unknown']);
 assert.deepEqual(filterDatasets(rows,{domain:'medical',source:'Hub',status:'matched',query:'clinical'}).map(r=>r.id),['scans']);
});
test('publication filtering never substitutes crawl discovery dates',()=>{
 assert.deepEqual(filterDatasets(rows,{publishedFrom:'2026-01-01'}),[]);
 assert.deepEqual(filterDatasets(rows,{dateAvailability:'unknown'}).map(r=>r.id).sort(),['missing','unknown']);
 assert.deepEqual(filterDatasets(rows,{domain:'unknown'}).map(r=>r.id),['missing']);
 assert(!filterDatasets(rows,{minImages:'0'}).some(r=>r.id==='missing'));
 assert(!filterDatasets(rows,{publishedTo:'2024-12-31'}).some(r=>r.id==='unknown'));
});
test('invalid ranges fail visibly; future filter bounds are allowed',()=>{
 assert.match(filterError({minImages:'10',maxImages:'5'}),/Minimum/);
 assert.match(filterError({minImages:'1.5'}),/whole/);
 assert.match(filterError({publishedFrom:'2024-02-30'}),/valid/);
 assert.match(filterError({publishedFrom:'2024-01-01',publishedTo:'2020-01-01'}),/start/);
 assert.equal(filterError({publishedTo:'2099-01-01'}),'');
 assert.equal(filterDatasets(rows,{minImages:'-1'}).length,0);
});
test('publication sorting keeps unknowns last in both directions',()=>{
 assert.equal(filterDatasets(rows,{sort:'publishedNewest'})[0].id,'leaves');
 assert.equal(filterDatasets(rows,{sort:'publishedOldest'})[0].id,'birds');
 assert.equal(filterDatasets(rows,{sort:'publishedOldest'}).at(-1).publicationDate,null);
});
test('domains are inferred, support multiple labels and handle existing records immediately',()=>{
 assert.deepEqual(JSON.parse(inferDomains({name:'Bird species classification',subject:'Wildlife photographs'}).domains),['biodiversity']);
 const plant=inferDomains({name:'Plant disease',subject:'Crop leaf images'});assert(JSON.parse(plant.domains).includes('biodiversity'));assert(JSON.parse(plant.domains).includes('agriculture'));
 assert.deepEqual(JSON.parse(inferDomains({name:'CIFAR-10',subject:'Animals and cars'}).domains),['general']);
 assert(displayRecord({name:'Oxford flowers',subject:'102 flower species',domains:'[]',publicationDate:null,foundAt:'2026-11-02'}).domains.includes('biodiversity'));
});
test('extracts publication from primary dataset JSON-LD and preserves source evidence',()=>{
 const html='<title>Birds</title><script type="application/ld+json">'+JSON.stringify({'@type':'Dataset',name:'Birds',datePublished:'2021-03-15',citation:{'@type':'ScholarlyArticle',datePublished:'2010-01-01'}})+'</script><p>A dataset of 500 bird images in 10 classes.</p>';
 const publication=pagePublication(html,url,'Birds');assert.equal(publication.publicationDate,'2021-03-15');assert.equal(publication.publicationDateSource,url);assert.equal(publication.publicationDateBasis,'dataset_published');
 const [r]=extractPage(url,html);assert.equal(r.publicationDate,'2021-03-15');assert(JSON.parse(r.domains).includes('biodiversity'));
});
test('does not use paper publication, copyright, modified dates or last crawl as posting dates',()=>{
 const html='<meta property="article:modified_time" content="2025-01-01"><meta name="citation_publication_date" content="2010/01/01"><script type="application/ld+json">{"@type":"ScholarlyArticle","datePublished":"2010-01-01"}</script><p>Copyright 2024. Dataset discovered 2026-11-02.</p>';
 assert.equal(pagePublication(html,url).publicationDate,null);
 assert.equal(displayRecord({...rows[0],publicationDate:null}).publicationDate,null);
});
test('parses published meta tags regardless of attribute order and rejects invalid dates',()=>{
 assert.equal(pagePublication('<meta content="2020-05-02T12:30:00Z" property="article:published_time">',url).publicationDate,'2020-05-02');
 assert.equal(normalizePublicationDate('2024-02-30'),null);assert.equal(normalizePublicationDate('2024'),null);assert.equal(normalizePublicationDate('2099-01-01'),null);
});
test('HF hosting date uses createdAt with explicit basis and never lastModified',()=>{
 const item={id:'owner/birds',description:'Bird species images',createdAt:'2020-04-01T12:00:00Z',lastModified:'2026-11-01T00:00:00Z',tags:['task_categories:image-classification']};
 const [r]=extractHub([item]);assert.equal(r.publicationDate,'2020-04-01');assert.equal(r.publicationDateBasis,'repository_created');assert.equal(r.publicationDateSource,'https://huggingface.co/datasets/owner/birds');assert.match(r.publicationDateEvidence,/not the original/);
 assert.equal(hubPublication({lastModified:item.lastModified},url).publicationDate,null);
 assert(new URL(metadataURL(r.url)).searchParams.getAll('expand[]').includes('createdAt'));
});
test('filtered CSV includes domain and posting-date provenance alongside crawl dates',()=>{
 const selected=filterDatasets(rows,{domain:'biodiversity',maxImages:'500'});const out=csv(selected);
 assert(out.includes('publicationDateBasis'));assert(out.includes('publicationDateSource'));assert(out.includes('foundAt'));assert(out.includes('biodiversity'));assert(out.includes('2021-03-15'));assert(!out.includes('CT scans'));
});

test('users can distinguish publication metadata from repository creation date proxies',()=>{
 const data=[{...rows[0],publicationDateBasis:'repository_created'},{...rows[1],publicationDateBasis:'page_published'}];
 assert.deepEqual(filterDatasets(data,{dateAvailability:'published'}).map(r=>r.id),['leaves']);
 assert.deepEqual(filterDatasets(data,{dateAvailability:'repository'}).map(r=>r.id),['birds']);
});

test('domain inference handles benchmark names and avoids mistaking the LEAF framework for plant images',()=>{
 assert(JSON.parse(inferDomains({name:'CUB_200_2011',subject:'Fine-grained image classification'}).domains).includes('biodiversity'));
 assert(JSON.parse(inferDomains({name:'Alzheimer_MRI',subject:'Classification'}).domains).includes('medical'));
 assert(!JSON.parse(inferDomains({name:'FEMNIST',subject:'Part of the LEAF benchmark. Handwritten digits.'}).domains).includes('biodiversity'));
});

test('usage filters combine with metadata filters and exports carry the shared status',()=>{
 const data=rows.map((r,i)=>({...r,usageStatus:i===0?'partially_used':i===1?'used':'new'}));
 const selected=filterDatasets(data,{usageStatus:'partially_used',status:'matched',domain:'biodiversity',maxImages:'500'});
 assert.deepEqual(selected.map(r=>r.id),['birds']);assert(csv(selected).includes('usageStatus'));assert(csv(selected).includes('partially_used'));
 assert.deepEqual(filterDatasets(data,{usageStatus:'used'}).map(r=>r.id),['leaves']);assert.equal(filterDatasets(data,{usageStatus:'new'}).length,3);
});
