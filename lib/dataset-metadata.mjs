// Domain labels are inferred from descriptions, never asserted as publisher taxonomy.
export const DOMAIN_LABELS={
 biodiversity:'Biodiversity',agriculture:'Agriculture',medical:'Medical & health',food:'Food',
 remote_sensing:'Earth observation',vehicles:'Vehicles & transport',documents:'Documents & handwriting',
 fashion:'Fashion',art:'Art & illustrations',industrial:'Industry & defects',people:'People & faces',general:'General objects & scenes',
};
const RULES={
 biodiversity:/\b(?:biodiversity|wildlife|species|birds?|ornithology|insects?|butterfl(?:y|ies)|flowers?|plants?|leaves|leaf|fish|fishes|marine|fungi|fungal|animals?|pets?|breeds?|ecology|botanical|fauna|flora)\b/gi,
 agriculture:/\b(?:agricultur\w*|crops?|plant disease|leaf disease|farming|weeds?|orchards?|harvest)\b/gi,
 medical:/\b(?:medical|clinical|patients?|radiology|radiograph\w*|x-ray|chest ct|mri|histopatholog\w*|cancer|tumou?r\w*|skin lesion|retina\w*|pathology|microscopy)\b/gi,
 food:/\b(?:food|dishes|cuisine|meals?|cooking|fruits?|vegetables?|food101|food-101)\b/gi,
 remote_sensing:/\b(?:satellite|aerial|remote sensing|geospatial|land cover|land use|earth observation|eurosat)\b/gi,
 vehicles:/\b(?:vehicles?|cars?|traffic|transport\w*|aircraft|airplanes?|ships?|boats?|roads?|driving)\b/gi,
 documents:/\b(?:handwrit\w*|digits?|documents?|ocr|characters?|signatures?)\b/gi,
 fashion:/\b(?:fashion|clothing|garments?|apparel|shoes?|textiles?)\b/gi,
 art:/\b(?:artwork|paintings?|artists?|illustrations?|anime|wikiart|sketch\w*)\b/gi,
 industrial:/\b(?:industrial|manufactur\w*|defects?|anomal(?:y|ies)|quality inspection|mvtec)\b/gi,
 people:/\b(?:faces?|facial|human expressions?|gestures?|human actions?|celebrit\w*|portraits?)\b/gi,
 general:/\b(?:imagenet|cifar\w*|everyday objects|object recognition|scene recognition|scenes?|general objects)\b/gi,
};
export function inferDomains(record,extra=''){
 const text=[record.name,record.subject,extra].filter(Boolean).join(' ');
 const domains=[],matches=[];
 for(const [domain,pattern] of Object.entries(RULES)){
  const words=[...new Set((text.match(pattern)||[]).map(x=>x.toLowerCase()))];
  if(words.length&&!(domain!=='general'&&domain!=='art'&&/cifar|imagenet/i.test(record.name||''))){domains.push(domain);matches.push(DOMAIN_LABELS[domain]+': '+words.slice(0,3).join(', '));}
 }
 return {domains:JSON.stringify(domains),domainEvidence:matches.length?'Inferred from metadata keywords — '+matches.join('; '):'No domain confidently inferred from the available description.'};
}
export function normalizePublicationDate(value,allowFuture=false){
 if(typeof value!=='string')return null;
 const m=value.trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:$|T\d{2}:\d{2})/);
 if(!m||value.includes('T')&&!Number.isFinite(Date.parse(value)))return null;
 const date=`${m[1]}-${m[2]}-${m[3]}`,parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||!allowFuture&&date>new Date().toISOString().slice(0,10))return null;
 return date;
}
const emptyPublication=()=>({publicationDate:null,publicationDateSource:null,publicationDateBasis:null,publicationDateEvidence:null});
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),(m[2]??m[3]).replace(/&quot;/g,'"').replace(/&amp;/g,'&')]));
export function pagePublication(html,url,name=''){
 const make=(value,basis,evidence)=>{const publicationDate=normalizePublicationDate(value);return publicationDate?{publicationDate,publicationDateSource:url,publicationDateBasis:basis,publicationDateEvidence:evidence}:null;};
 // Only inspect primary JSON-LD nodes. Never traverse citations or paper references.
 const nodes=[];
 for(const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{for(const node of [JSON.parse(script[1])].flat()){if(node&&typeof node==='object'){nodes.push(node);if(Array.isArray(node['@graph']))nodes.push(...node['@graph']);}}}catch{}
 }
 const types=node=>[node?.['@type']].flat().map(x=>String(x).split('/').pop());
 const datasetNodes=nodes.filter(node=>types(node).includes('Dataset'));
 const normalized=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
 const named=datasetNodes.find(node=>node.name&&normalized(name).includes(normalized(node.name)));
 const dataset=named||(datasetNodes.length===1?datasetNodes[0]:null);
 if(dataset){const result=make(dataset.datePublished,'dataset_published','Dataset JSON-LD datePublished: '+dataset.datePublished);if(result)return result;}
 for(const node of nodes.filter(node=>types(node).some(type=>['WebPage','Article','BlogPosting','CollectionPage'].includes(type)))){
  const result=make(node.datePublished,'page_published','Page JSON-LD datePublished: '+node.datePublished);if(result)return result;
 }
 for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
  const a=attrs(tag[0]),key=(a.property||a.name||a.itemprop||'').toLowerCase();
  if(['article:published_time','datepublished','date_published','dcterms.issued'].includes(key)){
   const result=make(a.content,'page_published','Page metadata '+key+': '+a.content);if(result)return result;
  }
 }
 return emptyPublication();
}
export function hubPublication(item,url){
 const date=normalizePublicationDate(item.createdAt);
 return date?{publicationDate:date,publicationDateSource:url,publicationDateBasis:'repository_created',publicationDateEvidence:'Hugging Face createdAt: '+item.createdAt+'. This is the repository creation date at this URL, not the original dataset release or a verified date when a private repository became public.'}:emptyPublication();
}
export function displayRecord(record){
 let domains=[];try{domains=Array.isArray(record.domains)?record.domains:JSON.parse(record.domains||'[]');}catch{}
 domains=domains.filter(d=>Object.hasOwn(DOMAIN_LABELS,d));
 const inferred=domains.length?null:inferDomains(record);
 return {...record,domains:domains.length?domains:JSON.parse(inferred.domains),domainEvidence:record.domainEvidence||inferred?.domainEvidence||'Inferred from source metadata.',publicationDate:normalizePublicationDate(record.publicationDate)};
}
