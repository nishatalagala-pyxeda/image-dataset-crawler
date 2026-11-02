import {createResearchService} from './research-service.mjs';
import {getDb} from '../db';
import * as schema from '../db/schema';
import {createCatalogService} from './crawl-service.mjs';
const service=()=>createCatalogService(getDb(),schema);
const researchService=()=>createResearchService(getDb(),schema);
export const catalog=async()=>researchService().attach(await service().groupedCatalog());
export const latestRun=()=>service().latestRun();
export const discoveryStats=()=>service().discoveryStats();
export const startRun=(urls:string[],limit=20,mode='discover')=>service().startRun(urls,limit,mode);
export const stepRun=(id:string)=>service().stepRun(id);
export const updateUsage=async(id:string,usageStatus:string)=>await service().updateUsage(id,usageStatus);
export const mergeDatasets=(ids:string[])=>service().mergeDatasets(ids);
export const separateSource=(id:string)=>service().separateSource(id);
async function researchGroup(id:string){const group=(await service().groupedCatalog()).find(r=>r.id===id);if(!group){const error=new Error('Dataset not found.');Object.assign(error,{status:404});throw error;}return group;}
export const researchDetails=async(id:string)=>researchService().details(await researchGroup(id));
export const searchResearch=async(id:string,term?:string)=>researchService().search(await researchGroup(id),term);
