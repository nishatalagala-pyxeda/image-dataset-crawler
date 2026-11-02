import {displayRecord} from './dataset-metadata.mjs';

// Match titles, never descriptions: a derivative can mention its parent dataset.
const aliases=new Map([
 ['cifar10','cifar10'],['cifar100','cifar100'],
 ['flowers102','flowers102'],['oxfordflowers102','flowers102'],['oxford102flowers','flowers102'],['oxfordflowers','flowers102'],
 ['oxfordiiitpet','oxfordpets'],['oxfordiiitpets','oxfordpets'],['stanforddogs','stanforddogs'],
 ['cub2002011','cub2002011'],['caltechucsdbirds2002011','cub2002011'],
 ['fashionmnist','fashionmnist'],['mnist','mnist'],['food101','food101'],['caltech101','caltech101'],['caltech256','caltech256'],
]);
function title(record){return (record.name||'').split(/[·|]/)[0].normalize('NFKD').toLowerCase().replace(/\b(dataset|datasets|card|for|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();}
function identity(record){
 const name=title(record),compact=name.replaceAll(' ','');
 if(aliases.has(compact))return 'known:'+aliases.get(compact);
 // Unknown names require informative titles and both documented counts.
 if(record.images==null||record.categories==null||compact.length<8||!(/\d/.test(name)||name.split(' ').length>=2))return null;
 if(/^(image|images|animal|animals|classification|object|objects|data|train|test|training|testing)( (image|images|animal|animals|classification|object|objects|data|train|test|training|testing))*$/.test(name))return null;
 return 'title:'+compact;
}
const compatible=(a,b)=>['categories','images'].every(key=>a[key]==null||b[key]==null||a[key]===b[key]);
const order=(a,b)=>(a.foundAt||'').localeCompare(b.foundAt||'')||a.id.localeCompare(b.id);
export const combinedUsage=rows=>rows.some(r=>r.usageStatus==='used')?'used':rows.some(r=>r.usageStatus==='partially_used')?'partially_used':'new';
function aggregate(members){
 members.sort(order);
 // Prefer a publisher page with supported counts; never sum mirrors' counts.
 const ranked=[...members].sort((a,b)=>Number(b.status==='matched')-Number(a.status==='matched') || Number(a.source==='Hugging Face')-Number(b.source==='Hugging Face') || Number(b.images!=null)-Number(a.images!=null) || order(a,b));
 const primary=ranked[0],publication=primary.publicationDate?primary:ranked.find(r=>r.publicationDate);
 const values=key=>[...new Set(members.map(r=>r[key]).filter(v=>v!=null))];
 const countConflicts=['images','categories'].filter(key=>values(key).length>1);
 return {...primary,id:members[0].id,usageStatus:combinedUsage(members),
  domains:[...new Set(members.flatMap(r=>r.domains))],
  foundAt:members[0].foundAt,crawledAt:values('crawledAt').sort().at(-1),lastSuccessAt:values('lastSuccessAt').sort().at(-1),
  ...(publication?Object.fromEntries(['publicationDate','publicationDateBasis','publicationDateSource','publicationDateEvidence'].map(key=>[key,publication[key]])):{}),
  images:primary.images??ranked.find(r=>r.images!=null)?.images??null,categories:primary.categories??ranked.find(r=>r.categories!=null)?.categories??null,
  sourceCount:members.length,sourceUrls:values('url'),sources:members,countConflicts,
  grouping:members.length===1?'single':members.some(r=>r.groupKey?.startsWith('manual:'))?'manual':'automatic',
 };
}
export function groupDatasets(raw){
 const rows=raw.map(displayRecord).sort(order),groups=[],explicit=new Map(),candidates=new Map();
 const keys=new Map(rows.map(r=>[r.id,identity(r)]));
 const index=(group,key)=>{if(!key||group.some(r=>r.groupKey?.startsWith('separate:')))return;if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(group);};
 for(const record of rows.filter(r=>r.groupKey)){
  if(!explicit.has(record.groupKey)){const group=[];explicit.set(record.groupKey,group);groups.push(group);}
  explicit.get(record.groupKey).push(record);
 }
 for(const group of groups)for(const record of group)index(group,keys.get(record.id));
 for(const record of rows.filter(r=>!r.groupKey)){
  const key=keys.get(record.id);
  const matches=key?[...(candidates.get(key)||[])].filter(group=>group.every(r=>compatible(r,record))):[];
  // Ambiguous identity stays separate for human review instead of bridging variants.
  if(matches.length===1)matches[0].push(record);else{const group=[record];groups.push(group);index(group,key);}
 }
 return groups.map(aggregate).sort((a,b)=>b.foundAt.localeCompare(a.foundAt)||a.id.localeCompare(b.id));
}
