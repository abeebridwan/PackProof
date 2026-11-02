import {mkdirSync,readFileSync,writeFileSync,renameSync,rmdirSync,unlinkSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {z} from 'zod';
import {createHash} from 'node:crypto';

export const P1_APPROVAL='I approve up to $2 USD for P1 live Meta validation, maximum 8 inference requests.';
export const P1_LIMITS={totalCents:200,requests:8,reservationCents:25,inputTokens:16000,outputTokens:2048,timeoutMs:45000,retries:2} as const;
export const P1_COMPLETION_APPROVAL='I approve up to $4 USD for P1C completion, maximum 16 additional Meta inference requests including retries.';
export const P1_COMPLETION_ID='p1c-completion-2026-11-02';
export const P1_COMPLETION_DIRECTORY='.local/p1c-completion-2026-11-02';
export const P1_COMPLETION_LIMITS={...P1_LIMITS,totalCents:400,requests:16} as const;
export const P1_REPAIR_APPROVAL='I approve up to $4 USD for P1C completion, unilimieted additional Meta inference requests including retries.';
export const P1_REPAIR_ID='p1c-repair-2026-11-02';
export const P1_REPAIR_DIRECTORY=`.local/${P1_REPAIR_ID}`;
// No separate request-count ceiling. Conservative, nonrefundable reservations
// still bound execution by the separately approved dollar allowance.
export const P1_REPAIR_LIMITS={...P1_LIMITS,totalCents:400,requests:null} as const;
export const MUSE_PRICING={verifiedAt:'2026-11-02',source:'https://dev.meta.ai/docs/pricing-rate-limits',inputPerMillion:1.25,cachedInputPerMillion:0.15,outputPerMillion:4.25} as const;
export const Usage=z.strictObject({inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),cachedTokens:z.number().int().nonnegative()}).refine(v=>v.cachedTokens<=v.inputTokens);
export type Usage=z.infer<typeof Usage>;
export const estimateUsd=(u:Usage)=>((u.inputTokens-u.cachedTokens)*MUSE_PRICING.inputPerMillion+u.cachedTokens*MUSE_PRICING.cachedInputPerMillion+u.outputTokens*MUSE_PRICING.outputPerMillion)/1e6;
const Entry=z.strictObject({id:z.uuid(),operationKey:z.string().min(1).max(200),inputTokens:z.number().int().min(0).max(16000),retry:z.boolean(),reservedCents:z.literal(25),state:z.enum(['reserved','responded','failed','ambiguous']),responseId:z.string().max(128).nullable(),requestId:z.string().max(128).nullable(),model:z.literal('muse-spark-1.3').nullable(),usage:Usage.nullable(),estimatedUsd:z.number().nonnegative().nullable(),actualBilledUsd:z.null(),reservedAt:z.iso.datetime()});
const Ledger=z.strictObject({schemaVersion:z.literal(1),approval:z.strictObject({statement:z.literal(P1_APPROVAL),approvedAt:z.iso.datetime()}).nullable(),reservedCents:z.number().int().min(0).max(200),requests:z.array(Entry).max(8)}).refine(l=>l.reservedCents===l.requests.length*25&&new Set(l.requests.map(r=>r.operationKey)).size===l.requests.length&&l.requests.filter(r=>r.retry).length<=2);
const completionLedger=(predecessorSha256:string)=>z.strictObject({schemaVersion:z.literal(2),grantId:z.literal(P1_COMPLETION_ID),predecessorSha256:z.literal(predecessorSha256),approval:z.strictObject({statement:z.literal(P1_COMPLETION_APPROVAL),approvedAt:z.iso.datetime()}).nullable(),reservedCents:z.number().int().min(0).max(400),requests:z.array(Entry).max(16)}).refine(l=>l.reservedCents===l.requests.length*25&&new Set(l.requests.map(r=>r.operationKey)).size===l.requests.length&&l.requests.filter(r=>r.retry).length<=2);
const repairLedger=(predecessorSha256:string)=>z.strictObject({schemaVersion:z.literal(3),grantId:z.literal(P1_REPAIR_ID),predecessorSha256:z.literal(predecessorSha256),limits:z.strictObject({totalCents:z.literal(400),requests:z.null(),reservationCents:z.literal(25),inputTokens:z.literal(16000),outputTokens:z.literal(2048),timeoutMs:z.literal(45000),retries:z.literal(2)}),approval:z.strictObject({statement:z.literal(P1_REPAIR_APPROVAL),approvedAt:z.iso.datetime()}).nullable(),reservedCents:z.number().int().min(0).max(400),requests:z.array(Entry)}).refine(l=>l.reservedCents===l.requests.length*25&&new Set(l.requests.map(r=>r.operationKey)).size===l.requests.length&&l.requests.filter(r=>r.retry).length<=2);
type LedgerData=z.infer<typeof Ledger>|z.infer<ReturnType<typeof completionLedger>>|z.infer<ReturnType<typeof repairLedger>>;
export class P1BudgetError extends Error{constructor(readonly code:string){super(code);}}
export class P1Budget{
 private runId:string|null=null;
 private initializeRepair=false;
 private readonly schema:typeof Ledger|ReturnType<typeof completionLedger>|ReturnType<typeof repairLedger>;
 private readonly predecessorSha256:string|null;
 readonly limits:typeof P1_LIMITS|typeof P1_COMPLETION_LIMITS|typeof P1_REPAIR_LIMITS;
 readonly approvalStatement:typeof P1_APPROVAL|typeof P1_COMPLETION_APPROVAL|typeof P1_REPAIR_APPROVAL;
 constructor(readonly directory='.local/p1c',private readonly completion?:{grantId:typeof P1_COMPLETION_ID|typeof P1_REPAIR_ID;predecessorPath:string}){
  const repair=completion?.grantId===P1_REPAIR_ID;
  this.limits=repair?P1_REPAIR_LIMITS:completion?P1_COMPLETION_LIMITS:P1_LIMITS;
  this.approvalStatement=repair?P1_REPAIR_APPROVAL:completion?P1_COMPLETION_APPROVAL:P1_APPROVAL;
  this.predecessorSha256=null;this.schema=Ledger;
  if(completion){
   if(!repair&&completion.grantId!==P1_COMPLETION_ID)throw new P1BudgetError('p1_unknown_grant');
   if(repair&&resolve(directory)!==resolve(dirname(dirname(completion.predecessorPath)),P1_REPAIR_ID))throw new P1BudgetError('p1_grant_directory_mismatch');
   const bytes=readFileSync(completion.predecessorPath);const raw=JSON.parse(bytes.toString('utf8'));
   const prior=repair?completionLedger(z.string().regex(/^[a-f0-9]{64}$/).parse(raw.predecessorSha256)).parse(raw):Ledger.parse(raw);
   if(!prior.approval||prior.requests.length!==(repair?16:8)||prior.requests.some(r=>r.state==='reserved'||r.state==='ambiguous'))throw new P1BudgetError('p1_predecessor_not_settled');
   this.predecessorSha256=createHash('sha256').update(bytes).digest('hex');this.schema=repair?repairLedger(this.predecessorSha256):completionLedger(this.predecessorSha256);
   if(repair){
    // Keep registration outside this grant's directory. Losing/deleting its
    // ledger must not turn the same approval into a fresh allowance.
    const registration=join(dirname(completion.predecessorPath),`${P1_REPAIR_ID}-registration.json`);
    const binding={grantId:P1_REPAIR_ID,directory:resolve(directory),predecessorSha256:this.predecessorSha256};
    if(existsSync(registration)){
     if(JSON.stringify(JSON.parse(readFileSync(registration,'utf8')))!==JSON.stringify(binding))throw new P1BudgetError('p1_grant_registration_mismatch');
    }else{
     this.initializeRepair=!existsSync(join(directory,'budget.json'));
     const fd=openSync(registration,'wx',0o600);try{writeFileSync(fd,JSON.stringify(binding));fsyncSync(fd);}finally{closeSync(fd);}
     const dir=openSync(dirname(registration),'r');try{fsyncSync(dir);}finally{closeSync(dir);}
    }
   }
  }
  mkdirSync(directory,{recursive:true,mode:0o700});
  this.change(l=>l);
 }
 private change<T>(effect:(ledger:LedgerData)=>T):T{
  if(this.completion&&createHash('sha256').update(readFileSync(this.completion.predecessorPath)).digest('hex')!==this.predecessorSha256)throw new P1BudgetError('p1_predecessor_changed');
  const lock=join(this.directory,'ledger.lock');
  try{mkdirSync(lock,{mode:0o700});}catch{throw new P1BudgetError('p1_ledger_locked');}
  try{
   let ledger:LedgerData;
   try{ledger=this.schema.parse(JSON.parse(readFileSync(join(this.directory,'budget.json'),'utf8')));}
   catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'){
    if(this.completion?.grantId===P1_REPAIR_ID&&!this.initializeRepair)throw new P1BudgetError('p1_grant_history_missing');
    ledger=this.completion?.grantId===P1_REPAIR_ID?{schemaVersion:3,grantId:P1_REPAIR_ID,predecessorSha256:this.predecessorSha256!,limits:P1_REPAIR_LIMITS,approval:null,reservedCents:0,requests:[]}:this.completion?{schemaVersion:2,grantId:P1_COMPLETION_ID,predecessorSha256:this.predecessorSha256!,approval:null,reservedCents:0,requests:[]}:{schemaVersion:1,approval:null,reservedCents:0,requests:[]};
   }else throw new P1BudgetError('p1_ledger_invalid');}
   const value=effect(ledger);this.schema.parse(ledger);
   const temporary=join(this.directory,'budget.tmp');
   const fd=openSync(temporary,'w',0o600);
   try{writeFileSync(fd,JSON.stringify(ledger,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   renameSync(temporary,join(this.directory,'budget.json'));
   this.initializeRepair=false;
   const dir=openSync(this.directory,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
   return value;
  }finally{rmdirSync(lock);}
 }
 status(){return this.change(l=>structuredClone(l));}
 approve(statement:string){
  if(statement!==this.approvalStatement)throw new P1BudgetError('p1_explicit_approval_required');
  this.change(l=>{if(!l.approval)l.approval={statement:this.approvalStatement,approvedAt:new Date().toISOString()};});
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
  if(this.limits.requests!==null&&l.requests.length>=this.limits.requests||l.reservedCents+25>this.limits.totalCents)throw new P1BudgetError('p1_budget_exhausted');
  if(retry&&l.requests.filter(r=>r.retry).length>=2)throw new P1BudgetError('p1_retry_limit');
 }
 reserve(operationKey:string,inputTokens:number,retry:boolean){
  this.assertRun();
  if(!Number.isInteger(inputTokens)||inputTokens<0||inputTokens>P1_LIMITS.inputTokens)throw new P1BudgetError('p1_input_limit');
  return this.change(l=>{
   if(!l.approval)throw new P1BudgetError('p1_approval_required');
   if(l.requests.some(r=>r.operationKey===operationKey))throw new P1BudgetError('p1_operation_in_doubt');
   if(this.limits.requests!==null&&l.requests.length>=this.limits.requests||l.reservedCents+25>this.limits.totalCents)throw new P1BudgetError('p1_budget_exhausted');
   if(retry&&l.requests.filter(r=>r.retry).length>=2)throw new P1BudgetError('p1_retry_limit');
   const entry:z.infer<typeof Entry>={id:crypto.randomUUID(),operationKey,inputTokens,retry,reservedCents:25,state:'reserved',responseId:null,requestId:null,model:null,usage:null,estimatedUsd:null,actualBilledUsd:null,reservedAt:new Date().toISOString()};
   l.requests.push(entry);l.reservedCents+=25;return entry.id;
  });
 }
 settle(id:string,receipt:{state:'responded'|'failed'|'ambiguous';responseId:string|null;requestId:string|null;model:'muse-spark-1.3'|null;usage:Usage|null}){
  this.assertRun();this.change(l=>{const entry=l.requests.find(r=>r.id===id);if(!entry||entry.state!=='reserved')throw new P1BudgetError('p1_receipt_conflict');Object.assign(entry,receipt,{estimatedUsd:receipt.model==='muse-spark-1.3'&&receipt.usage?estimateUsd(receipt.usage):null});});
 }
}
