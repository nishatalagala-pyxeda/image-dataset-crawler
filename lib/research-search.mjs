const generic=new Set(['dataset','images','image','classification','data','train','test','animals']);
const normalize=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim();
const cleanName=value=>String(value||'').split(/[·|]/)[0].replace(/\b(dataset|datasets|card|for|the)\b/gi,' ').replace(/\s+/g,' ').trim();
export function researchTerms(group,override){
 const names=override?[override]:[group.name,...(group.sources||[]).map(r=>r.name)];
 const terms=new Map();for(const name of names){const term=cleanName(name).slice(0,120),key=normalize(term);if(key.length>=3&&!generic.has(key)&&!terms.has(key))terms.set(key,term);}
 return [...terms.values()].slice(0,4);
}
export const researchScope=group=>JSON.stringify((group.sources?.length?group.sources:[group]).map(s=>s.id).sort());
function abstract(index){
 if(!index||typeof index!=='object')return '';
 const words=[];for(const [word,positions] of Object.entries(index))if(Array.isArray(positions))for(const pos of positions)if(Number.isInteger(pos)&&pos>=0&&pos<12000)words[pos]=word;
 return words.join(' ').replace(/\s+/g,' ').trim();
}
const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
function mentions(text,term){const normalized=' '+normalize(text)+' ',key=normalize(term);return normalized.includes(' '+key+' ')&&!((key==='mnist')&&normalized.replaceAll(' fashion mnist ',' ').indexOf(' mnist ')===-1);}
export function analyzeWorks(works,terms){
 const papers=new Map();
 for(const work of works){
  if(!work||['dataset','paratext','retraction'].includes(work.type))continue;
  const title=String(work.display_name||'').slice(0,500),summary=abstract(work.abstract_inverted_index),all=title+' '+summary;
  const matched=terms.filter(term=>mentions(all,term));if(!matched.length)continue;
  const sentences=summary.match(/[^.!?]+(?:[.!?]|$)/g)||[];
  const use=sentences.find(sentence=>matched.some(term=>mentions(sentence,term))&&
   /\b(evaluat\w*|experiment\w*|train\w*|test(?:ed|ing|s)?|benchmark\w*|validat\w*|achiev\w*|outperform\w*)\b/i.test(sentence)&&
   /\b(we|our|results?|performance|accuracy|experiments?|proposed|method|model|approach)\b/i.test(sentence)&&
   !/\b(not|never|without)\b.{0,35}\b(us\w*|evaluat\w*|train\w*|test\w*)\b|\b(survey|review of|future work|plan to|will evaluate)\b/i.test(sentence));
  // A mention is a separate result, never silently counted as experimental use.
  const evidence=(use||sentences.find(sentence=>matched.some(term=>mentions(sentence,term)))||title).trim();
  const doi=safeURL(work.doi),url=doi||safeURL(work.primary_location?.landing_page_url)||safeURL(work.id);if(!url)continue;
  const key=doi?.toLowerCase()||normalize(title)+'|'+(work.publication_year||'');
  const paper={id:String(work.id||key),title,url,doi,year:work.publication_year||null,evidence:evidence.slice(0,320),basis:use?'use_evidence':'mention',matchedTerms:matched};
  const previous=papers.get(key);if(!previous||previous.basis==='mention'&&paper.basis==='use_evidence')papers.set(key,paper);
 }
 return [...papers.values()].sort((a,b)=>Number(b.basis==='use_evidence')-Number(a.basis==='use_evidence')||(b.year||0)-(a.year||0));
}
async function inspectOpenAlex(terms,{fetcher=fetch}={}){
 const query=terms.map(term=>'"'+term.replace(/[^\p{L}\p{N}\s_-]/gu,' ')+'"').join(' OR ');
 const url=new URL('https://api.openalex.org/works');url.search=new URLSearchParams({search:query,per_page:'100',select:'id,doi,display_name,publication_year,abstract_inverted_index,type,primary_location'}).toString();
 const response=await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'manual'});
 if(!response.ok){await response.body?.cancel();throw new Error(response.status===429?'OpenAlex is rate limiting searches. Try again later.':'OpenAlex search failed ('+response.status+').');}
 if(!response.headers.get('content-type')?.includes('json'))throw new Error('OpenAlex returned an unexpected response.');
 const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>4000000)throw new Error('Research response exceeded the metadata limit.');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data.results)||!Number.isFinite(data.meta?.count))throw new Error('OpenAlex returned invalid research metadata.');
 const papers=analyzeWorks(data.results,terms);
 return {papers,examined:data.results.length,totalResults:data.meta.count,query,terms,provider:'OpenAlex'};
}

async function inspectEuropePMC(terms,{fetcher=fetch}={}){
 const query=terms.map(term=>'TITLE_ABS:"'+term.replace(/[^\p{L}\p{N}\s_-]/gu,' ')+'"').join(' OR ');
 const url=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');url.search=new URLSearchParams({query,resultType:'core',format:'json',pageSize:'100'}).toString();
 const response=await fetcher(url.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'manual'});
 if(!response.ok){await response.body?.cancel();throw new Error('Europe PMC search failed ('+response.status+'). Try again later.');}
 const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>4000000)throw new Error('Europe PMC response exceeded the metadata limit.');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data.resultList?.result)||!Number.isFinite(data.hitCount))throw new Error('Europe PMC returned invalid research metadata.');
 const works=data.resultList.result.map(item=>{
  const text=String(item.abstractText||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(),index={};text.split(' ').forEach((word,i)=>(index[word]??=[]).push(i));
  const article='https://europepmc.org/article/'+encodeURIComponent(item.source||'MED')+'/'+encodeURIComponent(item.id);
  return {id:article,display_name:item.title,doi:item.doi?'https://doi.org/'+item.doi:null,publication_year:Number(item.pubYear)||null,type:'article',abstract_inverted_index:index,primary_location:{landing_page_url:article}};
 });
 return {papers:analyzeWorks(works,terms),examined:works.length,totalResults:data.hitCount,query,terms,provider:'Europe PMC'};
}
export async function inspectResearch(terms,options={}){
 try{return await inspectOpenAlex(terms,options);}
 catch(primary){try{return await inspectEuropePMC(terms,options);}catch(fallback){throw new Error((primary instanceof Error?primary.message:'OpenAlex unavailable.')+' Fallback: '+(fallback instanceof Error?fallback.message:'Europe PMC unavailable.'));}}
}
