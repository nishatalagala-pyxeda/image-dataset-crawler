import {researchDetails,searchResearch} from '../../../lib/catalog';
function failure(error:unknown){const status=(error as Error&{status?:number}).status||500;return Response.json({error:status===500?'Research search unavailable.':(error as Error).message},{status});}
export async function GET(request:Request){const id=new URL(request.url).searchParams.get('id');if(!id)return Response.json({error:'Choose a dataset.'},{status:400});try{return Response.json(await researchDetails(id));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let body:{id?:unknown;term?:unknown}|null;try{body=await request.json() as typeof body;}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
 if(!body||typeof body.id!=='string'||body.term!==undefined&&typeof body.term!=='string')return Response.json({error:'Choose a dataset and a valid search name.'},{status:400});
 try{return Response.json(await searchResearch(body.id,body.term as string|undefined));}catch(error){return failure(error);}
}
