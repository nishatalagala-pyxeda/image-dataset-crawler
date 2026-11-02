import {startRun,stepRun} from '../../../lib/catalog';
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{const body=await request.json() as {action?:string;urls?:unknown[];limit?:number;id?:string;mode?:string};const limit=Math.min(40,Math.max(1,Math.floor(Number(body.limit))||20));
 if(body.action==='start'){const urls=Array.isArray(body.urls)?body.urls.filter((x):x is string=>typeof x==='string').slice(0,20):[];return Response.json({run:await startRun(urls,limit,body.mode||'discover')});}
 if(body.action==='step'&&typeof body.id==='string')return Response.json({run:await stepRun(body.id)});
 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('Crawl request failed',e);return Response.json({error:e instanceof Error?e.message:'Crawl failed'},{status:400});}
}
