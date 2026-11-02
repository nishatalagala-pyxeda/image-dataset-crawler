import {catalog,mergeDatasets,separateSource} from '../../../lib/catalog';
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let body:{action?:unknown;ids?:unknown;id?:unknown}|null;
 try{body=await request.json() as typeof body;}catch{return Response.json({error:'Invalid JSON request.'},{status:400});}
 try{
  if(body?.action==='merge'&&Array.isArray(body.ids))await mergeDatasets(body.ids as string[]);
  else if(body?.action==='separate'&&typeof body.id==='string')await separateSource(body.id);
  else return Response.json({error:'Choose datasets to group or a source to separate.'},{status:400});
  return Response.json({records:await catalog()});
 }catch(error){const status=(error as Error&{status?:number}).status;if(status===400||status===404)return Response.json({error:(error as Error).message},{status});console.error('Dataset grouping failed',error);return Response.json({error:'Could not save dataset grouping. Please try again.'},{status:500});}
}
