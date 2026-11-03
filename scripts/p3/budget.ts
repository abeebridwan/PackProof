import {mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,fsyncSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
export const P3_APPROVAL='approve 5 usd for unlimited requests untill done';
const Receipt=z.strictObject({id:z.uuid(),model:z.enum(['sam-3.1','muse-spark-1.3']),reservedCents:z.literal(25),at:z.iso.datetime(),state:z.enum(['reserved','responded','failed','ambiguous']),responseId:z.string().max(128).nullable(),requestId:z.string().max(128).nullable(),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()}).nullable()});
const Ledger=z.strictObject({grantId:z.literal('p3-2026-11-03'),approval:z.strictObject({statement:z.literal(P3_APPROVAL),at:z.iso.datetime()}),totalCents:z.literal(500),requests:z.array(Receipt),actualBilledUsd:z.null()}).refine(l=>l.requests.length*25<=l.totalCents);
export class P3Budget{
 private active=false;
 constructor(readonly directory='.local/p3'){}
 status(){return Ledger.parse(JSON.parse(readFileSync(`${this.directory}/budget.json`,'utf8')));}
 approve(statement:string){if(statement!==P3_APPROVAL)throw new Error('p3_approval_required');mkdirSync(this.directory,{recursive:true,mode:0o700});
  const registration=`${this.directory}-registration.json`,binding=JSON.stringify({grantId:'p3-2026-11-03',directory:resolve(this.directory)});
  if(existsSync(registration)){if(readFileSync(registration,'utf8')!==binding)throw new Error('p3_registration_mismatch');this.status();return;}
  // An approved existing ledger can be registered without resetting it.
  const prior=existsSync(`${this.directory}/budget.json`)?this.status():null;
  if(!prior&&existsSync(`${this.directory}/grant.json`))throw new Error('p3_missing_registered_ledger');
  const fd=openSync(registration,'wx',0o600);try{writeFileSync(fd,binding);fsyncSync(fd);}finally{closeSync(fd);}
  if(prior)return;
  this.write({grantId:'p3-2026-11-03',approval:{statement:P3_APPROVAL,at:new Date().toISOString()},totalCents:500,requests:[],actualBilledUsd:null});
 }
 private write(value:z.infer<typeof Ledger>){const fd=openSync(`${this.directory}/budget.tmp`,'w',0o600);try{writeFileSync(fd,JSON.stringify(Ledger.parse(value),null,2));fsyncSync(fd);}finally{closeSync(fd);}renameSync(`${this.directory}/budget.tmp`,`${this.directory}/budget.json`);}
 run(){if(!existsSync(`${this.directory}-registration.json`))throw new Error('p3_registration_required');const l=this.status();if(l.requests.some(r=>r.state==='reserved'||r.state==='ambiguous'))throw new Error('p3_operation_in_doubt');mkdirSync(`${this.directory}/run.lock`,{mode:0o700});this.active=true;return()=>{this.active=false;rmdirSync(`${this.directory}/run.lock`);};}
 reserve(model:'sam-3.1'|'muse-spark-1.3'){
  if(!this.active)throw new Error('p3_run_required');const l=this.status();if(l.requests.length*25+25>500)throw new Error('p3_budget_exhausted');const id=crypto.randomUUID();l.requests.push({id,model,reservedCents:25,at:new Date().toISOString(),state:'reserved',responseId:null,requestId:null,usage:null});this.write(l);return id;
 }
 settle(id:string,receipt:Partial<z.infer<typeof Receipt>>){if(!this.active)throw new Error('p3_run_required');const l=this.status(),entry=l.requests.find(r=>r.id===id);if(!entry||entry.state!=='reserved')throw new Error('p3_receipt_conflict');Object.assign(entry,receipt);this.write(l);}
}
