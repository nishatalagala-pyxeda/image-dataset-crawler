import test from 'node:test';
import assert from 'node:assert/strict';
import {safeURL,extractPage,extractHub,robotsAllows,discoverLinks,csv} from '../lib/crawler.mjs';
test('blocks dataset files and local targets before any fetch',()=>{
 for(const url of ['http://127.0.0.1/a','http://2130706433/a','http://[::1]/','http://host.local/a','https://example.com/a.zip','https://example.com/photo.jpg','https://huggingface.co/datasets/a/b/resolve/main/data.parquet','file:///etc/passwd','https://user:pass@example.com/','https://example.com:8080/a']) assert.throws(()=>safeURL(url),url);
 assert.equal(safeURL('https://example.com/dataset#download'),'https://example.com/dataset');
});
test('honors robots groups, wildcard rules and allow precedence',()=>{
 const robots='User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.zip$\n\nUser-agent: otherbot\nDisallow: /';
 assert.equal(robotsAllows(robots,'/private/secret'),false);assert.equal(robotsAllows(robots,'/private/open'),true);assert.equal(robotsAllows(robots,'/data.zip'),false);assert.equal(robotsAllows(robots,'/dataset'),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: DatasetObservatory\nAllow: /','/dataset'),true);
});
test('extracts both CIFAR datasets without mixing fine and coarse classes',()=>{
 const html='<title>CIFAR datasets</title><p>The CIFAR-10 dataset consists of 60000 32x32 colour images in 10 classes.</p><p>CIFAR-100 has 100 classes containing 600 images each and 20 superclasses.</p>';
 const rows=extractPage('https://cave.cs.toronto.edu/kriz/cifar.html',html);assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>[x.images,x.categories]),[[60000,10],[60000,100]]);assert(rows.every(x=>x.status==='matched'));
});
test('requires image category evidence and retains unknowns for review',()=>{
 assert.equal(extractPage('https://example.com/','<p>Classification dataset: 1000 audio files in 10 classes</p>').length,0);
 const [r]=extractPage('https://example.com/','<title>Birds</title><p>A dataset of bird images organized into categories.</p>');assert.equal(r.images,null);assert.equal(r.categories,null);assert.equal(r.status,'review');
});
test('HF structured counts sum splits within a configuration, not across overlapping variants',()=>{
 const info=(n)=>({splits:[{num_examples:n},{num_examples:100}],features:[{name:'image',dtype:'image'},{name:'label',dtype:{class_label:{names:{0:'a',1:'b'}}}}]});
 const [r]=extractHub([{id:'owner/birds',tags:['task_categories:image-classification'],cardData:{dataset_info:[info(500),info(1000)]}}]);assert.equal(r.images,1100);assert.equal(r.categories,2);assert.equal(r.status,'matched');
});
test('does not discover archive/image links',()=>{
 const urls=discoverLinks('https://example.com/', '<a href="birds.zip">Image dataset</a><a href="/birds">Bird classification dataset</a><a href="/x.jpg">Dataset</a>');assert.deepEqual(urls,['https://example.com/birds']);
});
test('escapes CSV quotes, newlines and spreadsheet formulas',()=>{
 const result=csv([{name:'=HYPERLINK("x")',subject:'a, b\nc',url:'https://example.com'}]);assert(result.includes('"\'=HYPERLINK(""x"")"'));assert(result.includes('"a, b\nc"'));
});

test('HF multiple-image and multimodal examples are not silently counted as images',()=>{
 const [r]=extractHub([{id:'owner/pairs',tags:['task_categories:image-classification'],cardData:{dataset_info:{splits:[{num_examples:400}],features:[{name:'image_0',dtype:'image'},{name:'image_1',dtype:'image'}]}}}]);assert.equal(r.images,null);assert.equal(r.status,'review');
});
