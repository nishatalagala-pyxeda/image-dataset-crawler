import {normalizePublicationDate} from './dataset-metadata.mjs';
export const CSV_FIELDS=['name','subject','domains','domainEvidence','categories','images','publicationDate','publicationDateBasis','publicationDateSource','publicationDateEvidence','url','sourceUrls','sources','sourceCount','grouping','countConflicts','usageStatus','status','foundAt','crawledAt','lastSuccessAt','source','evidence','error'];
export function csv(rows){
 const cell=v=>{let s=v==null?'':Array.isArray(v)?v.some(x=>typeof x==='object')?JSON.stringify(v):v.join('; '):String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\ufeff'+CSV_FIELDS.join(',')+'\r\n'+rows.map(r=>CSV_FIELDS.map(k=>cell(r[k])).join(',')).join('\r\n');
}
const count=value=>value===''||value==null?null:Number(value);
export function filterError(filters={}){
 for(const key of ['minImages','maxImages']){const value=count(filters[key]);if(value!==null&&(!Number.isSafeInteger(value)||value<0))return 'Image counts must be whole numbers of zero or more.';}
 if(count(filters.minImages)!==null&&count(filters.maxImages)!==null&&count(filters.minImages)>count(filters.maxImages))return 'Minimum image count must be no greater than maximum image count.';
 for(const key of ['publishedFrom','publishedTo'])if(filters[key]&&!normalizePublicationDate(filters[key],true))return 'Choose a valid publication date.';
 if(filters.publishedFrom&&filters.publishedTo&&filters.publishedFrom>filters.publishedTo)return 'The publication start date must be on or before the end date.';
 return '';
}
export function filterDatasets(rows,filters={}){
 if(filterError(filters))return [];
 const {query='',status='all',source='all',usageStatus='all',domain='all',publishedFrom='',publishedTo='',dateAvailability='any',sort='recent'}=filters;
 const min=count(filters.minImages),max=count(filters.maxImages),term=query.trim().toLowerCase();
 const filtered=rows.filter(r=>{
  if(status!=='all'&&r.status!==status||source!=='all'&&r.source!==source&&!r.sources?.some(s=>s.source===source))return false;
  if(usageStatus!=='all'&&(r.usageStatus||'new')!==usageStatus)return false;
  const domains=r.domains||[];
  if(domain==='unknown'?domains.length>0:domain!=='all'&&!domains.includes(domain))return false;
  const published=normalizePublicationDate(r.publicationDate);
  if(dateAvailability==='known'&&!published||dateAvailability==='unknown'&&published)return false;
  if(dateAvailability==='published'&&!['dataset_published','page_published'].includes(r.publicationDateBasis)||dateAvailability==='repository'&&r.publicationDateBasis!=='repository_created')return false;
  if(publishedFrom&&(!published||published<publishedFrom)||publishedTo&&(!published||published>publishedTo))return false;
  if(min!==null&&(r.images==null||r.images<min)||max!==null&&(r.images==null||r.images>max))return false;
  return !term||[r.name,r.subject,r.source,...(r.sources||[]).flatMap(s=>[s.name,s.subject,s.source,s.url]),...domains].join(' ').toLowerCase().includes(term);
 });
 return filtered.sort((a,b)=>{
  if(sort==='publishedNewest'||sort==='publishedOldest'){
   if(!a.publicationDate)return b.publicationDate?1:0;if(!b.publicationDate)return -1;
   return sort==='publishedNewest'?b.publicationDate.localeCompare(a.publicationDate):a.publicationDate.localeCompare(b.publicationDate);
  }
  return sort==='images'?(b.images??-1)-(a.images??-1):sort==='categories'?(b.categories??-1)-(a.categories??-1):sort==='name'?a.name.localeCompare(b.name):(b.foundAt||'').localeCompare(a.foundAt||'');
 });
}
export function searchParams(params){return Object.fromEntries(['query','status','usageStatus','source','domain','publishedFrom','publishedTo','dateAvailability','minImages','maxImages','sort'].map(key=>[key,params.get(key)||undefined]));}
