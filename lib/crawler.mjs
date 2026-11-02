// Metadata only: never follow image, dataset-file, archive, or download endpoints.
export const AGENT = 'DatasetObservatory/1.0 (metadata-only catalog; no dataset downloads)';
export const DEFAULTS = [
 'https://cave.cs.toronto.edu/kriz/cifar.html',
 'https://www.robots.ox.ac.uk/~vgg/data/flowers/102/',
 'https://www.robots.ox.ac.uk/~vgg/data/pets/',
 'https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/',
 'https://huggingface.co/api/datasets?filter=task_categories%3Aimage-classification&limit=20&full=true&sort=downloads&direction=-1',
];
const file = /\.(?:zip|gz|tar|tgz|rar|7z|bz2|xz|jpg|jpeg|png|gif|webp|svg|bmp|tif|tiff|parquet|arrow|npy|npz|pkl|bin|h5|hdf5|csv|mp4|pdf)(?:$|[?#])/i;
export function safeURL(value) {
 const u = new URL(value);
 const h = u.hostname.toLowerCase();
 if (!['https:','http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port)) || !h.includes('.') || /[\[\]:]/.test(h) || /^\d/.test(h) || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(h) || h==='metadata.google.internal' || file.test(u.pathname) || /\/(?:resolve|download|blob)\//i.test(u.pathname) || /(?:download|raw)=/i.test(u.search)) throw new Error('Only public metadata page URLs are allowed; dataset files are blocked.');
 u.hash=''; return u.href;
}
export function textOf(html) {
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}
export function robotsAllows(body, path) {
 const groups=[]; let current=null; let hasRules=false;
 for(const raw of body.split(/\r?\n/)) {
  const line=raw.replace(/#.*/,'').trim(); const m=line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i); if(!m) continue;
  const k=m[1].toLowerCase(),v=m[2].trim();
  if(k==='user-agent'){ if(!current || hasRules){current={agents:[],rules:[]};groups.push(current);hasRules=false;} current.agents.push(v.toLowerCase()); }
  else if(current){current.rules.push({allow:k==='allow',path:v});hasRules=true;}
 }
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*' && 'datasetobservatory'.includes(a)));
 const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 let best={length:-1,allow:true};
 for(const g of selected) for(const r of g.rules){if(!r.path)continue; const end=r.path.endsWith('$'); const pattern=r.path.replace(/\$$/,'').split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*'); if(new RegExp('^'+pattern+(end?'$':'')).test(path)){const length=r.path.replace(/[*$]/g,'').length;if(length>best.length || length===best.length&&r.allow)best={length,allow:r.allow};}}
 return best.allow;
}
async function readLimited(r,max=700000){
 const type=r.headers.get('content-type')||'';
 if(!/text\/(?:html|plain)|application\/(?:json|xhtml\+xml)/i.test(type) || /attachment/i.test(r.headers.get('content-disposition')||'')){await r.body?.cancel();throw new Error('Blocked non-page content: '+type);}
 if(Number(r.headers.get('content-length'))>max){await r.body?.cancel();throw new Error('Metadata page exceeds size limit');}
 const reader=r.body?.getReader();if(!reader)return '';let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Metadata page exceeds size limit');chunks.push(value);}}finally{await reader.cancel();}
 const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}return new TextDecoder().decode(all);
}
async function fetchPage(url, robots=false){
 let target=safeURL(url);
 for(let i=0;i<5;i++){
  const r=await fetch(target,{redirect:'manual',headers:{'User-Agent':AGENT,'Accept':'text/html, text/plain, application/json'},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');await r.body?.cancel();if(!location)throw new Error('Redirect without location');const next=safeURL(new URL(location,target).href);if(!robots)await checkRobots(next);target=next;continue;}
  if(!r.ok){await r.body?.cancel();const e=new Error('HTTP '+r.status);e.status=r.status;throw e;}
  return {url:target,body:await readLimited(r),type:r.headers.get('content-type')||''};
 }throw new Error('Too many redirects');
}
async function checkRobots(url){
 const u=new URL(url);
 try{const r=await fetchPage(u.origin+'/robots.txt',true);if(!robotsAllows(r.body,u.pathname+u.search))throw new Error('Blocked by robots.txt');}
 catch(e){if(e.status===404||e.status===410)return;throw e;}
}
export async function inspectURL(url){await checkRobots(url);return fetchPage(url);}
const number=s=>{const n=Number(String(s).replace(/[,'’\s]/g,''));return Number.isSafeInteger(n)&&n>0?n:null;};
export function extractPage(url,html){
 const text=textOf(html), title=textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Image dataset').replace(/\s*[|–]\s*.*$/,'').slice(0,160);
 const make=(name,subject,categories,images,evidence,status='matched')=>({id:url+'#'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,subject,categories,images,url,source:new URL(url).hostname,evidence,status});
 if(/(?:cs\.toronto\.edu|cave\.cs\.toronto\.edu)/.test(new URL(url).hostname)&&/cifar/i.test(url)&&/60000.*?10 classes/.test(text)){
  const result=[make('CIFAR-10 · everyday objects','Tiny color images of animals and vehicles',10,60000,'Publisher reports 60,000 images across 10 classes; 50,000 training and 10,000 test images.')];
  if(/100 classes containing 600 images/.test(text))result.push(make('CIFAR-100 · object categories','Tiny color images of objects, animals, plants and people',100,60000,'Publisher reports 100 classes × 600 images, using fine labels; 20 coarse superclasses.'));return result;
 }
 if(new URL(url).hostname==='data.vision.ee.ethz.ch'&&/food-101/.test(url)&&/101 food categories/.test(text)&&/101['’,]?000 images/.test(text))return [make('Food-101 · food photographs','Food photographs grouped by dish, including pizza, sushi, cakes and other foods',101,101000,'Publisher documents 101 food categories and 101,000 images; 750 training and 250 test images per category.')];
 const c=text.match(/([\d,'’]+)\s+(?:[a-z-]+\s+){0,2}(?:classes|categories|breeds)\b/i);
 let im=text.match(/([\d,'’]+)\s+(?:(?:color|colour|RGB|labeled|labelled|total|training and test)\s+){0,3}(?:images|photographs|pictures)\b/i);
 let categories=c?number(c[1]):null, images=im?number(im[1]):null;
 const per=text.match(/([\d,]+)\s+(?:images|pictures)\s+(?:for|per|in each)\s+(?:each\s+)?(?:class|category|breed)/i);
 if(!images&&categories&&per)images=categories*number(per[1]);
 if(!/\b(?:images|photographs|pictures)\b/i.test(text)||!/(?:dataset|data set|database)/i.test(text)||!/(?:classif|classes|categories|breeds|labels)/i.test(text))return [];
 const sentences=text.split(/(?<=[.!?])\s+/).filter(s=>/\b(?:images|classes|categories|breeds)\b/i.test(s));
 const evidence=sentences.slice(0,4).map(s=>s.slice(0,350)).join(' ').slice(0,1000);
 const description=(text.match(/(?:description|overview)\s*[:.]?\s*(.{30,240}?)[.!?]/i)?.[1]||sentences.find(s=>/images/i.test(s))||title).slice(0,240);
 return [make(title,description,categories,images,evidence,'review')];
}
export function extractHub(items){
 return items.filter(x=>x.id&&((x.tags||[]).includes('task_categories:image-classification')||[x.cardData?.task_categories].flat().includes('image-classification'))).map(x=>{
 const infos=[x.cardData?.dataset_info].flat().filter(Boolean);let images=null,categories=null,labelName='';
 for(const info of infos){
 const features=Array.isArray(info.features)?info.features:[];
 const imageFeatures=features.filter(f=>f.dtype==='image');
 const splits=Array.isArray(info.splits)?info.splits:Object.values(info.splits||{});
 const total=splits.reduce((s,p)=>s+(Number(p.num_examples)||0),0);
 // Examples are image counts only when the schema contains exactly one image.
 if(imageFeatures.length!==1 || total<=0 || total<(images||0))continue;
 let count=null,field='';
 for(const f of features){const names=f.dtype?.class_label?.names;if(names&&Object.keys(names).length>1){count=Object.keys(names).length;field=f.name;break;}}
 images=total;categories=count;labelName=field;
 }
 const name=x.cardData?.pretty_name||x.id.split('/').pop().replace(/[-_]/g,' ');
 const url='https://huggingface.co/datasets/'+x.id;
 const description=(x.description||'').trim();
 const heuristic=extractPage(url,'<title>'+name+'</title><p>'+description.replace(/[<>]/g,' ')+'</p>')[0];
 return {id:url,name,subject:description.slice(0,240)||'Image classification dataset: '+name,categories:categories||heuristic?.categories||null,images:images||heuristic?.images||null,url,source:'Hugging Face',status:categories>1&&images>=20?'matched':'review',evidence:'Hugging Face image-classification task tag. '+(images?'Largest documented configuration with one image feature: '+images+' split examples. ':'Total image count not confirmed in structured metadata. ')+(categories?'ClassLabel field '+labelName+': '+categories+' categories.':'Category count needs page review. ')+(heuristic?'Description evidence: '+heuristic.evidence:'')};
 });
}
export function discoverLinks(url,html){
 const out=[];
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  try{const target=safeURL(new URL(m[1].replace(/&amp;/g,'&'),url).href);const label=textOf(m[2]);if(target!==url&&/(?:dataset|data set|classification|benchmark)/i.test(label+' '+new URL(target).pathname)&&!/(?:login|signin|signup|search|issues|pulls|privacy|terms)/i.test(target))out.push(target);}catch{}
 }return [...new Set(out)].slice(0,25);
}
export function csv(rows){
 const keys=['name','subject','categories','images','url','status','foundAt','crawledAt','lastSuccessAt','source','evidence','error'];
 const cell=v=>{let s=v==null?'':String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\ufeff'+keys.join(',')+'\r\n'+rows.map(r=>keys.map(k=>cell(r[k])).join(',')).join('\r\n');
}
