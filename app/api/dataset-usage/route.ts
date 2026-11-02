import {updateUsage} from '../../../lib/catalog';
export async function PATCH(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let body: {id?:unknown;usageStatus?:unknown}|null;
 try{body=await request.json() as typeof body;}catch{return Response.json({error:'Invalid JSON request.'},{status:400});}
 if(!body||typeof body.id!=='string'||typeof body.usageStatus!=='string')return Response.json({error:'Dataset and usage status are required.'},{status:400});
 try{return Response.json({record:await updateUsage(body.id,body.usageStatus)});}
 catch(error){const status=(error as Error&{status?:number}).status;if(status===400||status===404)return Response.json({error:(error as Error).message},{status});console.error('Usage update failed',error);return Response.json({error:'Could not save usage status. Please try again.'},{status:500});}
}
