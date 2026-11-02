import { catalog } from '../../../lib/catalog';
import { csv } from '../../../lib/crawler.mjs';
export async function GET(request:Request){const rows=await catalog();const json=new URL(request.url).searchParams.get('format')==='json';return new Response(json?JSON.stringify(rows,null,2):csv(rows),{headers:{'Content-Type':json?'application/json':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="image-datasets.'+(json?'json':'csv')+'"'}});}
