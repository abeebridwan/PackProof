import {z} from 'zod';
import {P1BudgetError,Usage} from '../providers/p1-budget.js';
import {reviewTransaction} from './database.js';
import {REVIEW_EVIDENCE_POLICY,REVIEW_EVIDENCE_MAX_AGE_MS} from '../../domain/verification/freshness.js';
import type {InvestigationInput} from '../../contracts/investigation.js';
export const REVIEW_GRANT='review-live-2026-11-04';
export const RESERVATION={ 'muse-spark-1.3':5, 'sam-3.1':1 } as const;
export type ReviewModel=keyof typeof RESERVATION;
export async function reviewer(userId:string|null){
 if(!userId)return null;
 return reviewTransaction(async c=>(await c.query('SELECT user_id,role,pair_id,expires_at FROM packproof.review_access WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()',[z.uuid().parse(userId)])).rows[0]??null);
}
export async function reviewPolicy(userId:string|null,input:InvestigationInput,transaction:typeof reviewTransaction=reviewTransaction){
 if(input.namespace!=='packproof-demo')return {};
 return transaction(async c=>{
  // The three original public examples are synthetic too. Their read-only
  // assessment uses the same finite review window in recorded and live mode.
  // Signed dates, issuer expiry and ChainProof's commit policy do not change.
  const r=await c.query(`SELECT 1 FROM packproof.review_units u JOIN packproof.review_access a ON a.pair_id=u.pair_id JOIN packproof.items i ON i.id=u.item_id WHERE a.user_id=$1 AND a.revoked_at IS NULL AND a.expires_at>now() AND u.authority_until>now() AND u.product_mark=$2 AND (u.packaging_mark=$3 OR $3 IS NULL) AND i.model_code='JUDGE-SAMPLE' AND i.unit_mark LIKE 'JR-%'
   UNION ALL SELECT 1 FROM packproof.items i WHERE i.id IN('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000103') AND i.namespace='packproof-demo' AND i.model_code='DEMO-FORMULA' AND i.unit_mark=$2 AND i.unit_mark IN('FP-1001','FP-1002','FP-GAP-01') AND EXISTS(SELECT 1 FROM packproof.review_units WHERE authority_until>now()) LIMIT 1`,[userId,input.productMark,input.packagingMark]);
  return r.rowCount?{maxAgeMs:REVIEW_EVIDENCE_MAX_AGE_MS,policyVersion:REVIEW_EVIDENCE_POLICY}:{};
 });
}
// Durable reservations are never refunded: ambiguous requests still consume
// allowance. PostgreSQL serializes across Vercel instances, unlike local ledgers.
export class HostedBudget{
 constructor(readonly userId:string,private readonly transaction:typeof reviewTransaction=reviewTransaction){}
 async assertRun(){if(process.env.REVIEW_LIVE_ENABLED!=='1'||!process.env.MODEL_API_KEY||!await reviewer(this.userId))throw new P1BudgetError('review_live_unavailable');}
 async assertCapacity(_retry:boolean){await this.assertRun();}
 async reserveModel(model:ReviewModel,operationKey:string,inputTokens=0,retry=false){
  await this.assertRun();
  if(!Number.isInteger(inputTokens)||inputTokens<0||inputTokens>16000)throw new P1BudgetError('p1_input_limit');
  return this.transaction(async c=>{
   const grant=(await c.query('SELECT * FROM packproof.review_budget WHERE id=$1 FOR UPDATE',[REVIEW_GRANT])).rows[0];
   // Keep the prior grant working during rollout; only explicitly approved caps are accepted.
   if(!grant?.enabled||![500,1000].includes(grant.limit_cents))throw new P1BudgetError('review_live_unavailable');
   const pending=await c.query("SELECT 1 FROM packproof.review_calls WHERE grant_id=$1 AND (state='ambiguous' OR state='reserved' AND reserved_at<now()-interval '120 seconds') LIMIT 1",[REVIEW_GRANT]);
   if(pending.rowCount)throw new P1BudgetError('p1_operation_in_doubt');
   const rate=(await c.query("SELECT count(*)::int n,coalesce(sum(cents),0)::int cents,count(*) FILTER(WHERE state='reserved')::int pending FROM packproof.review_calls WHERE user_id=$1 AND reserved_at>now()-interval '1 hour'",[this.userId])).rows[0];
   if(rate.n>=80||rate.cents+RESERVATION[model]>150||rate.pending>=1)throw new P1BudgetError('review_rate_limit');
   if(grant.reserved_cents+RESERVATION[model]>grant.limit_cents)throw new P1BudgetError('p1_budget_exhausted');
   const recent=(await c.query("SELECT count(*)::int n FROM packproof.review_calls WHERE user_id=$1 AND reserved_at>now()-interval '1 minute'",[this.userId])).rows[0];if(recent.n>=12)throw new P1BudgetError('review_rate_limit');
   const id=crypto.randomUUID();
   await c.query('INSERT INTO packproof.review_calls(id,grant_id,user_id,operation_key,model,cents,input_tokens,retry) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,REVIEW_GRANT,this.userId,operationKey,model,RESERVATION[model],inputTokens,retry]);
   await c.query('UPDATE packproof.review_budget SET reserved_cents=reserved_cents+$2 WHERE id=$1',[REVIEW_GRANT,RESERVATION[model]]);
   return id;
  });
 }
 reserve(operationKey:string,inputTokens:number,retry:boolean){return this.reserveModel('muse-spark-1.3',operationKey,inputTokens,retry);}
 async settle(id:string,receipt:{state:'responded'|'failed'|'ambiguous';responseId:string|null;requestId:string|null;model?:string|null;usage:Usage|null}){
  const safe=z.strictObject({state:z.enum(['responded','failed','ambiguous']),responseId:z.string().max(128).nullable(),requestId:z.string().max(128).nullable(),usage:Usage.nullable()}).parse({state:receipt.state,responseId:receipt.responseId,requestId:receipt.requestId,usage:receipt.usage});
  await this.transaction(async c=>{const r=await c.query("UPDATE packproof.review_calls SET state=$3,response_id=$4,request_id=$5,usage=$6,settled_at=now() WHERE id=$1 AND user_id=$2 AND state='reserved'",[z.uuid().parse(id),this.userId,safe.state,safe.responseId,safe.requestId,safe.usage]);if(r.rowCount!==1)throw new P1BudgetError('p1_receipt_conflict');});
 }
 image(){return {reserve:(model:ReviewModel)=>this.reserveModel(model,crypto.randomUUID()),settle:(id:string,r:{state:'responded'|'ambiguous';responseId:string|null;requestId:string|null;usage:{input_tokens:number;output_tokens:number}|null})=>this.settle(id,{...r,usage:r.usage?{inputTokens:r.usage.input_tokens,outputTokens:r.usage.output_tokens,cachedTokens:0}:null})};}
}
