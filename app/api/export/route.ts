import {catalog} from '../../../lib/catalog';
import {csv,filterDatasets,filterError,searchParams} from '../../../lib/catalog-search.mjs';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,filters=searchParams(params),error=filterError(filters);
 if(error)return Response.json({error},{status:400});
 const rows=filterDatasets(await catalog(),filters),json=params.get('format')==='json';
 return new Response(json?JSON.stringify(rows,null,2):csv(rows),{headers:{'Content-Type':json?'application/json':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="image-datasets.'+(json?'json':'csv')+'"'}});
}
