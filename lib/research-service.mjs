import {eq,lte,and} from 'drizzle-orm';
import {researchScope,researchTerms,inspectResearch} from './research-search.mjs';
export function createResearchService(db,{research,researchControl},{inspect=inspectResearch,clock=()=>Date.now()}={}){
 const fail=(message,status)=>{const error=new Error(message);error.status=status;throw error;};
 const summary=row=>({researchPaperCount:row?.paperCount??null,researchMentionCount:row?.mentionCount??null,researchSearchedAt:row?.searchedAt||null,researchExamined:row?.examined??null,researchTotalResults:row?.totalResults??null,researchError:row?.error||null,researchStatus:row?.error?'error':row?.searchedAt?'searched':'not_searched',researchProvider:row?.provider||'OpenAlex'});
 async function attach(groups){
  // Catalog responses contain summaries, not hundreds of abstracts per dataset.
  const rows=await db.select({scope:research.scope,provider:research.provider,paperCount:research.paperCount,mentionCount:research.mentionCount,searchedAt:research.searchedAt,examined:research.examined,totalResults:research.totalResults,error:research.error}).from(research),byScope=new Map(rows.map(r=>[r.scope,r]));
  return groups.map(group=>({...group,...summary(byScope.get(researchScope(group)))}));
 }
 async function details(group){const [row]=await db.select().from(research).where(eq(research.scope,researchScope(group)));return {scope:researchScope(group),...summary(row),papers:JSON.parse(row?.papers||'[]'),query:row?.query||'',terms:JSON.parse(row?.terms||'[]'),lastAttemptAt:row?.lastAttemptAt||null};}
 async function search(group,term){
  if(term!==undefined&&(typeof term!=='string'||term.trim().length<3||term.length>120))fail('Use a dataset name between 3 and 120 characters.',400);
  const terms=researchTerms(group,term);if(!terms.length)fail('Enter a more specific dataset name for research search.',400);
  const scope=researchScope(group),now=clock(),token=crypto.randomUUID();
  await db.insert(researchControl).values({id:'shared'}).onConflictDoNothing();
  const [lock]=await db.update(researchControl).set({leaseUntil:now+60000,token}).where(and(eq(researchControl.id,'shared'),lte(researchControl.leaseUntil,now),lte(researchControl.nextAllowedAt,now))).returning();
  if(!lock)fail('Another research search is running or just finished. Try again in a few seconds.',429);
  try{
   const [previous]=await db.select().from(research).where(eq(research.scope,scope));
   if(previous?.searchedAt&&now-Date.parse(previous.searchedAt)<60000){if(previous.terms!==JSON.stringify(terms))fail('Wait one minute before changing this dataset’s research query.',429);return details(group);}
   try{
    const result=await inspect(terms),at=new Date(clock()).toISOString(),paperCount=result.papers.filter(p=>p.basis==='use_evidence').length;
    const values={provider:result.provider||'OpenAlex',query:result.query,terms:JSON.stringify(terms),papers:JSON.stringify(result.papers),paperCount,mentionCount:result.papers.length-paperCount,examined:result.examined,totalResults:result.totalResults,searchedAt:at,lastAttemptAt:at,error:null};
    await db.insert(research).values({scope,...values}).onConflictDoUpdate({target:research.scope,set:values});return details(group);
   }catch(error){
    const message=error instanceof Error?error.message:'Research search failed.',values={lastAttemptAt:new Date(clock()).toISOString(),error:message};
    await db.insert(research).values({scope,...values}).onConflictDoUpdate({target:research.scope,set:values});fail(message,502);
   }
  }finally{await db.update(researchControl).set({leaseUntil:0,token:null,nextAllowedAt:clock()+1500}).where(and(eq(researchControl.id,'shared'),eq(researchControl.token,token)));}
 }
 return {attach,details,search};
}
