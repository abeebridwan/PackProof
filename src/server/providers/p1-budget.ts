import {mkdirSync,readFileSync,writeFileSync,renameSync,rmdirSync,unlinkSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';

export const P1_APPROVAL='I approve up to $2 USD for P1 live Meta validation, maximum 8 inference requests.';
export const P1_LIMITS={totalCents:200,requests:8,reservationCents:25,inputTokens:16000,outputTokens:2048,timeoutMs:45000,retries:2} as const;
export const MUSE_PRICING={verifiedAt:'2026-11-02',source:'https://dev.meta.ai/docs/pricing-rate-limits',inputPerMillion:1.25,cachedInputPerMillion:0.15,outputPerMillion:4.25} as const;
export const Usage=z.strictObject({inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),cachedTokens:z.number().int().nonnegative()}).refine(v=>v.cachedTokens<=v.inputTokens);
export type Usage=z.infer<typeof Usage>;
export const estimateUsd=(u:Usage)=>((u.inputTokens-u.cachedTokens)*MUSE_PRICING.inputPerMillion+u.cachedTokens*MUSE_PRICING.cachedInputPerMillion+u.outputTokens*MUSE_PRICING.outputPerMillion)/1e6;
const Entry=z.strictObject({id:z.uuid(),operationKey:z.string().min(1).max(200),inputTokens:z.number().int().min(0).max(16000),retry:z.boolean(),reservedCents:z.literal(25),state:z.enum(['reserved','responded','failed','ambiguous']),responseId:z.string().max(128).nullable(),requestId:z.string().max(128).nullable(),model:z.literal('muse-spark-1.3').nullable(),usage:Usage.nullable(),estimatedUsd:z.number().nonnegative().nullable(),actualBilledUsd:z.null(),reservedAt:z.iso.datetime()});
const Ledger=z.strictObject({schemaVersion:z.literal(1),approval:z.strictObject({statement:z.literal(P1_APPROVAL),approvedAt:z.iso.datetime()}).nullable(),reservedCents:z.number().int().min(0).max(200),requests:z.array(Entry).max(8)}).refine(l=>l.reservedCents===l.requests.length*25&&new Set(l.requests.map(r=>r.operationKey)).size===l.requests.length&&l.requests.filter(r=>r.retry).length<=2);
export class P1BudgetError extends Error{constructor(readonly code:string){super(code);}}
export class P1Budget{
 private runId:string|null=null;
 constructor(readonly directory='.local/p1c'){
  mkdirSync(directory,{recursive:true,mode:0o700});
  this.change(l=>l);
 }
 private change<T>(effect:(ledger:z.infer<typeof Ledger>)=>T):T{
  const lock=join(this.directory,'ledger.lock');
  try{mkdirSync(lock,{mode:0o700});}catch{throw new P1BudgetError('p1_ledger_locked');}
  try{
   let ledger:z.infer<typeof Ledger>;
   try{ledger=Ledger.parse(JSON.parse(readFileSync(join(this.directory,'budget.json'),'utf8')));}
   catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')ledger={schemaVersion:1,approval:null,reservedCents:0,requests:[]};else throw new P1BudgetError('p1_ledger_invalid');}
   const value=effect(ledger);Ledger.parse(ledger);
   const temporary=join(this.directory,'budget.tmp');
   const fd=openSync(temporary,'w',0o600);
   try{writeFileSync(fd,JSON.stringify(ledger,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   renameSync(temporary,join(this.directory,'budget.json'));
   const dir=openSync(this.directory,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
   return value;
  }finally{rmdirSync(lock);}
 }
 status(){return this.change(l=>structuredClone(l));}
 approve(statement:string){
  if(statement!==P1_APPROVAL)throw new P1BudgetError('p1_explicit_approval_required');
  this.change(l=>{if(!l.approval)l.approval={statement:P1_APPROVAL,approvedAt:new Date().toISOString()};});
 }
 assertApproved(){if(!this.status().approval)throw new P1BudgetError('p1_approval_required');}
 acquire(){
  this.assertApproved();
  if(this.status().requests.some(r=>r.state==='reserved'||r.state==='ambiguous'))throw new P1BudgetError('p1_operation_in_doubt');
  if(this.runId)throw new P1BudgetError('p1_run_locked');
  const path=join(this.directory,'run.lock');
  try{mkdirSync(path,{mode:0o700});}catch{throw new P1BudgetError('p1_run_locked');}
  this.runId=crypto.randomUUID();
  writeFileSync(join(path,'owner.json'),JSON.stringify({id:this.runId,pid:process.pid}),{mode:0o600});
  return ()=>{this.assertRun();unlinkSync(join(path,'owner.json'));rmdirSync(path);this.runId=null;};
 }
 assertRun(){
  this.assertApproved();
  if(!this.runId)throw new P1BudgetError('p1_run_required');
  const owner=JSON.parse(readFileSync(join(this.directory,'run.lock','owner.json'),'utf8'));
  if(owner.id!==this.runId)throw new P1BudgetError('p1_run_locked');
 }
 assertCapacity(retry:boolean){
  this.assertRun();const l=this.status();
  if(l.requests.length>=8||l.reservedCents+25>200)throw new P1BudgetError('p1_budget_exhausted');
  if(retry&&l.requests.filter(r=>r.retry).length>=2)throw new P1BudgetError('p1_retry_limit');
 }
 reserve(operationKey:string,inputTokens:number,retry:boolean){
  this.assertRun();
  if(!Number.isInteger(inputTokens)||inputTokens<0||inputTokens>P1_LIMITS.inputTokens)throw new P1BudgetError('p1_input_limit');
  return this.change(l=>{
   if(!l.approval)throw new P1BudgetError('p1_approval_required');
   if(l.requests.some(r=>r.operationKey===operationKey))throw new P1BudgetError('p1_operation_in_doubt');
   if(l.requests.length>=8||l.reservedCents+25>200)throw new P1BudgetError('p1_budget_exhausted');
   if(retry&&l.requests.filter(r=>r.retry).length>=2)throw new P1BudgetError('p1_retry_limit');
   const entry:z.infer<typeof Entry>={id:crypto.randomUUID(),operationKey,inputTokens,retry,reservedCents:25,state:'reserved',responseId:null,requestId:null,model:null,usage:null,estimatedUsd:null,actualBilledUsd:null,reservedAt:new Date().toISOString()};
   l.requests.push(entry);l.reservedCents+=25;return entry.id;
  });
 }
 settle(id:string,receipt:{state:'responded'|'failed'|'ambiguous';responseId:string|null;requestId:string|null;model:'muse-spark-1.3'|null;usage:Usage|null}){
  this.assertRun();this.change(l=>{const entry=l.requests.find(r=>r.id===id);if(!entry||entry.state!=='reserved')throw new P1BudgetError('p1_receipt_conflict');Object.assign(entry,receipt,{estimatedUsd:receipt.model==='muse-spark-1.3'&&receipt.usage?estimateUsd(receipt.usage):null});});
 }
}
