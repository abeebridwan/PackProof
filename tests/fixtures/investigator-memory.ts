import {readFile} from 'node:fs/promises';
import {MemorySaver} from '@langchain/langgraph';
import {createEvidenceServices} from '../../src/server/evidence/services.js';
import {Dataset,RootPin} from '../../src/contracts/evidence.js';
import {recordedMuse} from '../../src/server/providers/muse.js';
import {RecordedImageInspector} from '../../src/server/providers/recorded-image.js';
import {safeTracing} from '../../scripts/spikes/safe-tracing.js';
import {canonical,InvestigationError} from '../../src/server/investigator/store.js';
import type {InvestigationStore,Owner,Row,ToolResult} from '../../src/server/investigator/types.js';
import type {InvestigationInput,Capture,ToolName} from '../../src/contracts/investigation.js';
export const OWNER:Owner={sessionHash:'a'.repeat(64),userId:null};
export class MemoryStore implements InvestigationStore{
 rows=new Map<string,Row>();owners=new Map<string,string>();ops=new Map<string,{hash:string;status:string;value:unknown}>();captures=new Map<string,Capture>();logs=new Map<string,{tool:ToolName;result:ToolResult;source:'model_tool'|'mandatory_finalizer'}[]>();reserved=new Map<string,number>();
 async create(o:Owner,input:InvestigationInput){const row:Row={id:crypto.randomUUID(),revision:1,status:'created',input,actions:0,recaptures:0,retries:0,request:null,finding:null,error:null,createdAt:new Date().toISOString()};this.rows.set(row.id,row);this.owners.set(row.id,o.sessionHash);return structuredClone(row);}
 async get(o:Owner,id:string){if(this.owners.get(id)!==o.sessionHash)throw new InvestigationError('not_found',404);return structuredClone(this.rows.get(id)!);}
 async save(o:Owner,id:string,p:Partial<Row>){await this.get(o,id);Object.assign(this.rows.get(id)!,p);}
 async operation<T>(o:Owner,id:string,key:string,args:unknown,kind:'model'|'tool'|'retry'|'resume',effect:()=>Promise<T>,options:{recapture?:boolean;reservationCents?:number;sessionCapCents?:number}={}){
  await this.get(o,id);const k=id+':'+key,hash=canonical(args),old=this.ops.get(k);
  if(old){if(old.hash!==hash)throw new InvestigationError('idempotency_conflict');if(old.status!=='complete')throw new InvestigationError('operation_in_doubt');return structuredClone(old.value) as T;}
  const row=this.rows.get(id)!;if(kind==='tool'&&row.actions>=8)throw new InvestigationError('action_limit');if(options.recapture&&row.recaptures>=3)throw new InvestigationError('recapture_limit');if(kind==='retry'&&row.retries>=2)throw new InvestigationError('retry_limit');
  const reserved=(this.reserved.get(id)??0)+(options.reservationCents??0);if(reserved>(options.sessionCapCents??50))throw new InvestigationError('budget_exhausted');this.reserved.set(id,reserved);
  if(kind==='tool')row.actions++;if(options.recapture)row.recaptures++;if(kind==='retry')row.retries++;
  this.ops.set(k,{hash,status:'reserved',value:null});
  try{const value=await effect();this.ops.set(k,{hash,status:'complete',value:structuredClone(value)});if(kind==='tool'){const name=(args as {name:ToolName}).name;this.logs.set(id,[...(this.logs.get(id)??[]),{tool:name,result:value as ToolResult,source:'model_tool'}]);}return value;}catch(e){this.ops.set(k,{hash,status:'failed',value:null});throw e;}
 }
 async revise(o:Owner,id:string,expected:number,input:InvestigationInput){const r=await this.get(o,id);if(r.revision!==expected||r.status!=='needs_input')throw new InvestigationError('revision_conflict');await this.save(o,id,{revision:expected+1,input,status:'running',request:null});return this.get(o,id);}
 async capture(o:Owner,id:string,captureId:string){await this.get(o,id);const c=this.captures.get(captureId);if(!c||c.investigationId!==id)throw new InvestigationError('capture_not_found',404);return structuredClone(c);}
 async addCapture(o:Owner,c:Capture){await this.get(o,c.investigationId);this.captures.set(c.id,c);}
 async audit(o:Owner,id:string,name:ToolName,result:ToolResult,key:string){await this.get(o,id);const logs=this.logs.get(id)??[];if(!logs.some(l=>l.source==='mandatory_finalizer'&&l.tool===name&&canonical(l.result)===canonical(result)))this.logs.set(id,[...logs,{tool:name,result,source:'mandatory_finalizer'}]);}
 async events(o:Owner,id:string){await this.get(o,id);return this.logs.get(id)??[];}
}
export async function fixture(){
 const material=JSON.parse(await readFile('docs/packproof/demo/signed-demo.json','utf8'));
 const dataset=Dataset.parse(material.dataset);const pin=RootPin.parse(material.root);
 const store=new MemoryStore();
 return {dataset,pin,store,options:{owner:OWNER,store,services:createEvidenceServices({load:async()=>structuredClone(dataset)},pin),planner:recordedMuse(),inspector:new RecordedImageInspector(),checkpointer:new MemorySaver(),trace:safeTracing({enabled:false})}};
}
export const input=(p:Partial<InvestigationInput>={}):InvestigationInput=>({namespace:'packproof-demo',productMark:'FP-1002',packagingMark:'PK-2002',sellerId:'30000000-0000-4000-8000-000000000005',listingText:'',context:'listing',captureId:null,...p});
