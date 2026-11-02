import test from 'node:test';
import assert from 'node:assert/strict';
import {groupDatasets} from '../lib/dataset-groups.mjs';
import {filterDatasets,csv} from '../lib/catalog-search.mjs';
const row=(id,name,extra={})=>({id,name,subject:'Image classification',domains:[],categories:10,images:60000,url:'https://example.org/'+id,source:'Publisher',status:'matched',usageStatus:'new',foundAt:'2026-01-01',crawledAt:'2026-02-01',lastSuccessAt:'2026-02-01',publicationDate:null,...extra});
test('same benchmark across links becomes one record with original source metadata and counts counted once',()=>{
 const records=[row('a','CIFAR-10 · everyday objects'),row('b','Cifar10',{source:'Hugging Face',url:'https://huggingface.co/datasets/owner/cifar10',usageStatus:'partially_used',foundAt:'2026-02-01',crawledAt:'2026-03-01',publicationDate:'2022-01-01',publicationDateSource:'https://huggingface.co/datasets/owner/cifar10'})];
 const [group]=groupDatasets(records);assert.equal(groupDatasets(records).length,1);assert.equal(group.id,'a');assert.equal(group.images,60000);assert.equal(group.categories,10);assert.equal(group.sourceCount,2);assert.equal(group.usageStatus,'partially_used');assert.equal(group.foundAt,'2026-01-01');assert.equal(group.crawledAt,'2026-03-01');assert.deepEqual(group.sourceUrls,records.map(r=>r.url));assert.equal(group.sources[1].foundAt,'2026-02-01');assert.equal(group.publicationDateSource,records[1].publicationDateSource);
 assert.equal(filterDatasets([group],{source:'Hugging Face'}).length,1);assert.equal(filterDatasets([group],{query:'owner/cifar10'}).length,1);assert(csv([group]).includes(records[1].url));
});
test('different benchmarks, derivatives, incompatible counts and generic titles remain separate',()=>{
 for(const pair of [
 [row('a','CIFAR-10'),row('b','CIFAR-100',{categories:100})],
 [row('a','Cifar10'),row('b','Cifar10 resized')],
 [row('a','Cifar10'),row('b','Cifar10',{images:1000})],
 [row('a','Fashion MNIST'),row('b','MNIST')],
 [row('a','Animal images'),row('b','Animal images')],
 [row('a','Bird species',{images:null}),row('b','Bird species',{images:null})],
 ])assert.equal(groupDatasets(pair).length,2,pair.map(r=>r.name).join(' / '));
});
test('normalized informative names require compatible documented counts',()=>{
 assert.equal(groupDatasets([row('a','River-Bird Survey'),row('b','river_bird_survey dataset')]).length,1);
 assert.equal(groupDatasets([row('a','River Bird Survey'),row('b','River Bird Survey',{categories:20})]).length,2);
});
test('two datasets on one URL are kept separate and a mention in a description is not a match',()=>{
 assert.equal(groupDatasets([row('a','CIFAR-10'),row('b','CIFAR-100',{url:'https://example.org/a'})]).length,2);
 assert.equal(groupDatasets([row('a','CIFAR-10'),row('b','CINIC-10',{subject:'Derived from CIFAR-10'})]).length,2);
});
test('manual grouping retains conflicting source counts and preserves the most advanced usage',()=>{
 const rows=[row('a','Different title',{groupKey:'manual:one',usageStatus:'used'}),row('b','CIFAR-10',{groupKey:'manual:one',images:1000})];
 const [group]=groupDatasets(rows);assert.equal(group.sourceCount,2);assert.equal(group.grouping,'manual');assert.equal(group.usageStatus,'used');assert.deepEqual(group.countConflicts,['images']);assert.equal(group.sources[1].images,1000);assert.equal(group.images,60000);
});
test('a separated source is not automatically regrouped; grouping is deterministic and does not mutate source data',()=>{
 const rows=[row('a','Cifar10'),row('b','Cifar10',{groupKey:'separate:b'}),row('c','Cifar10')],before=JSON.stringify(rows);
 assert.equal(groupDatasets(rows).length,2);assert.equal(JSON.stringify(rows),before);assert.deepEqual(groupDatasets(rows),groupDatasets([...rows].reverse()));
});
test('a future matching listing joins an existing manual group without erasing source evidence',()=>{
 const rows=[row('a','Cifar10',{groupKey:'manual:a'}),row('b','CIFAR-10',{groupKey:'manual:a'}),row('c','Cifar10',{foundAt:'2026-03-01'})];
 assert.equal(groupDatasets(rows).length,1);assert.equal(groupDatasets(rows)[0].sourceCount,3);
});
