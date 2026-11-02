import {getDb} from '../db';
import * as schema from '../db/schema';
import {createCatalogService} from './crawl-service.mjs';
const service=()=>createCatalogService(getDb(),schema);
export const catalog=()=>service().catalog();
export const latestRun=()=>service().latestRun();
export const discoveryStats=()=>service().discoveryStats();
export const startRun=(urls:string[],limit=20,mode='discover')=>service().startRun(urls,limit,mode);
export const stepRun=(id:string)=>service().stepRun(id);
