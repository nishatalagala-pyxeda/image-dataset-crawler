import { catalog,latestRun } from '../../../lib/catalog';
export async function GET(){try{return Response.json({records:await catalog(),run:await latestRun()});}catch(e){return Response.json({error:'Catalog unavailable. '+(e instanceof Error?e.message:'')},{status:503});}}
