import {readFile,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {P1Budget,P1BudgetError,P1_COMPLETION_ID,P1_COMPLETION_DIRECTORY,P1_REPAIR_ID,P1_REPAIR_DIRECTORY,MUSE_PRICING} from '../../src/server/providers/p1-budget.js';
import {liveMuse,type LiveEvidence} from '../../src/server/providers/p1-live.js';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation,resumeInvestigation,publicView} from '../../src/server/investigator/graph.js';
import {PublicInvestigation,type InvestigationInput} from '../../src/contracts/investigation.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';

// One fixed, separately approved grant; never create a timestamped fresh budget.
const missingFlow=['--missing-package','--missing-resume'].includes(process.argv[2]??'');
const directory=missingFlow?P1_REPAIR_DIRECTORY:P1_COMPLETION_DIRECTORY;
const budget=missingFlow?new P1Budget(P1_REPAIR_DIRECTORY,{grantId:P1_REPAIR_ID,predecessorPath:`${P1_COMPLETION_DIRECTORY}/budget.json`}):new P1Budget(P1_COMPLETION_DIRECTORY,{grantId:P1_COMPLETION_ID,predecessorPath:'.local/p1c/budget.json'});
const events:LiveEvidence[]=[];const preflights={count:0};
const root='docs/packproof/evidence';
const names=['a','c','e-pause','e-pause-repair','e-resume','p-pause','p-resume'] as const;
type Stage=typeof names[number];
type Report={attemptId:string;scenarioVersion:string;grantId:string;originalAttempts:string[];startedAt:string;completedAt:string;stage:Stage;status:'passed'|'failed'|'paused'|'not_run';error:string|null;requests:LiveEvidence[];tokenPreflights:number;totalMs:number;providerInferenceMs:number;tokenPreflightMs:number;modelOperationMs:number;toolOperationMs:number;verificationMs:number;result:PublicInvestigation|null;roundTrip:boolean;structuredAnswer:boolean;identifiersComplete:boolean;mandatoryChecks:boolean;outcome:boolean};
const Context=z.strictObject({owner:z.strictObject({sessionHash:z.string().regex(/^[a-f0-9]{64}$/),userId:z.null()}),resumeKey:z.uuid(),investigationId:z.uuid().nullable(),revision:z.number().int().positive().nullable()});
const path=(stage:Stage)=>missingFlow&&stage==='e-pause'?`${root}/p1c-completion-e-pause-attempt-5.json`:stage==='e-pause-repair'?`${root}/p1c-completion-e-pause-attempt-2.json`:`${root}/p1c-completion-${stage}-attempt-1.json`;
async function previous(stage:Stage):Promise<Report|null>{try{return JSON.parse(await readFile(path(stage),'utf8')) as Report;}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error;}}
const cases=[
 {stage:'a',productMark:'FP-1001',packagingMark:'PK-2001',sellerId:'30000000-0000-4000-8000-000000000004',minimum:3},
 {stage:'c',productMark:'FP-GAP-01',packagingMark:'PK-GAP-01',sellerId:'30000000-0000-4000-8000-000000000005',minimum:5},
 {stage:'e-pause',productMark:'FP-1002',packagingMark:null,sellerId:'30000000-0000-4000-8000-000000000005',minimum:7},
] as const;
let release:(()=>void)|undefined;let blocked:string|null=null;
async function run(stage:Stage){
 if(await previous(stage))throw new P1BudgetError('p1_completion_attempt_already_recorded');
 const physical=stage==='p-pause'||stage==='p-resume';
 const spec=physical?{...cases[2],packagingMark:'PK-2002'}:cases.find(c=>c.stage===stage)??cases[2];
 const pausedStage=(await previous('e-pause-repair'))?.status==='paused'?'e-pause-repair':'e-pause';
 const contextPath=`${directory}/${stage==='p-resume'?'p-pause':stage==='e-resume'?pausedStage:stage}-context.json`;
 let context:z.infer<typeof Context>;
 if(stage==='e-resume'||stage==='p-resume')context=Context.parse(JSON.parse(await readFile(contextPath,'utf8')));
 else{
  context={owner:{sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null},resumeKey:crypto.randomUUID(),investigationId:null,revision:null};
  // Refuse an interrupted initial attempt rather than repeat uncertain effects.
  await writeFile(contextPath,JSON.stringify(context),{flag:'wx',mode:0o600});
 }
 const start=Date.now(),first=events.length,preflightStart=preflights.count;
 const metrics={modelOperationMs:0,toolOperationMs:0,verificationMs:0};
 let app:Awaited<ReturnType<typeof runtime>>|undefined;let result:PublicInvestigation|null=null;let errorCode:string|null=null;
 try{
  app=await runtime(context.owner);
  const product=await app.options.services.lookupProduct({namespace:'packproof-demo',productMark:spec.productMark,packagingMark:spec.packagingMark??'PK-2002'});
  if(product.status!=='supported'||!product.data)throw new P1BudgetError('p1_signed_fixture_unavailable');
  const history=await app.options.services.getCustodyHistory({itemId:product.data.itemId});const asOf=history.data?.snapshot?.asOf;
  if(!asOf||Date.now()<Date.parse(asOf)||Date.now()-Date.parse(asOf)>86400000)throw new P1BudgetError('p1_fixture_stale');
  const options={...app.options,mode:'live' as const,metrics,modelReservationCents:3,planner:liveMuse(budget,{apiKey:process.env.MODEL_API_KEY!,evidence:events,preflights})};
  if(stage==='e-resume'||stage==='p-resume'){
   if(!context.investigationId||!context.revision)throw new P1BudgetError('p1_pause_context_missing');
   const restored=await publicView(app.store,context.owner,context.investigationId);
   if(restored.status!=='needs_input'||restored.revision!==context.revision)throw new P1BudgetError('p1_pause_not_restored');
   result=await resumeInvestigation(options,restored.id,{expectedRevision:restored.revision,idempotencyKey:context.resumeKey,productMark:null,packagingMark:'PK-2002',captureId:null});
  }else{
   const input:InvestigationInput={namespace:'packproof-demo',productMark:spec.productMark,packagingMark:spec.packagingMark,sellerId:spec.sellerId,listingText:'Controlled fictional evidence validation; no customer data.',context:physical?'physical':'listing',captureId:null};
   result=await startInvestigation(options,input);
   context.investigationId=result.id;context.revision=result.revision;
   await writeFile(contextPath,JSON.stringify(context),{mode:0o600});
  }
 }catch(error){errorCode=error instanceof P1BudgetError?error.code:'p1_completion_unavailable';}
 finally{
  if(app)await app.close();
  const requests=events.slice(first);const calls=requests.flatMap(e=>e.response?.calls.map(c=>c.name)??[]);
  const roundTrip=requests.some(e=>e.toolResults.length>0&&e.response!==null);
  const structuredAnswer=requests.some(e=>e.response?.answer!==null&&e.response?.answer!==undefined);
  const identifiersComplete=requests.length>0&&requests.every(e=>e.response!==null&&e.requestId!==null);
  const mandatoryChecks=new Set(result?.trace.filter(t=>t.source==='mandatory_finalizer').map(t=>t.tool)).size===4;
  const isPause=stage==='e-pause'||stage==='e-pause-repair'||stage==='p-pause';
  const outcome=stage==='a'?result?.finding?.status==='blocked'&&result.finding.seller?.data?.authorized===false&&calls.includes('lookup_seller'):stage==='c'?result?.finding?.status==='needs_evidence'&&Boolean(result.finding.history?.data?.gaps.length)&&result.finding.claims.some(c=>c.kind==='history')&&calls.includes('get_custody_history'):isPause?result?.status==='needs_input'&&Boolean(result.request?.instruction)&&calls.includes('request_additional_evidence'):result?.finding?.status===(physical?'needs_evidence':'supported')&&result.revision===context.revision!+1&&result.finding.missingChecks.length===0&&result.finding.physicalStatus===(physical?'unresolved':'not_inspected');
  const accepted=!errorCode&&Boolean(outcome)&&(roundTrip||missingFlow&&isPause&&requests.length===1&&calls[0]==='request_additional_evidence')&&identifiersComplete&&mandatoryChecks&&(isPause||structuredAnswer);
  const report:Report={attemptId:`${missingFlow?P1_REPAIR_ID:P1_COMPLETION_ID}:${stage}:${missingFlow?5:1}`,scenarioVersion:missingFlow?'missing-package-first-1':'completion-1',grantId:missingFlow?P1_REPAIR_ID:P1_COMPLETION_ID,originalAttempts:missingFlow?[`${root}/p1c-completion-e-pause-attempt-1.json`,`${root}/p1c-completion-e-pause-attempt-2.json`,`${root}/p1c-completion-e-pause-attempt-3.json`,`${root}/p1c-completion-e-pause-attempt-4.json`]:[],startedAt:new Date(start).toISOString(),completedAt:new Date().toISOString(),stage,status:accepted?(isPause?'paused':'passed'):'failed',error:errorCode,requests,tokenPreflights:preflights.count-preflightStart,totalMs:Date.now()-start,providerInferenceMs:requests.reduce((s,e)=>s+e.inferenceMs,0),tokenPreflightMs:requests.reduce((s,e)=>s+e.preflightMs,0),...metrics,result,roundTrip,structuredAnswer,identifiersComplete,mandatoryChecks,outcome:Boolean(outcome)};
  await writeFile(path(stage),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  if(!accepted)throw new P1BudgetError(errorCode??'p1_completion_scenario_failed');
 }
}
if(!missingFlow&&process.argv.length===2&&budget.status().reservedCents===budget.limits.totalCents){
 // The old grant's aggregate is historical. New-grant resume artifacts must
 // not be folded into it or make its costs/status appear to have changed.
 console.log(JSON.stringify({status:'historical_grant_exhausted',grantId:P1_COMPLETION_ID,newRequests:0,evidence:`${root}/p1c-completion.json`}));
}else if(missingFlow)await runMissingPackage();else try{
 budget.assertApproved();
 if(process.argv.length>3||process.argv[2]&&!['--resume-e','--repair-e','--physical-pause','--physical-resume'].includes(process.argv[2]))throw new P1BudgetError('p1_completion_invalid_arguments');
 if(Number(process.env.PACKPROOF_CONFIRMED_CREDITS_USD??0)<4)throw new P1BudgetError('p1_confirmed_credits_required');
 const pricingAge=Date.now()-Date.parse(MUSE_PRICING.verifiedAt+'T00:00:00Z');if(pricingAge<0||pricingAge>7*86400000)throw new P1BudgetError('p1_refresh_verified_pricing');
 release=budget.acquire();if(!process.env.MODEL_API_KEY)throw new P1BudgetError('p1_credentials_missing');
 if(process.argv[2]==='--physical-pause'){
  if((await previous('e-pause-repair'))?.status!=='failed')throw new P1BudgetError('p1_physical_followup_not_applicable');
  if((budget.limits.requests??Infinity)-budget.status().requests.length<6)throw new P1BudgetError('p1_insufficient_remaining_allowance');
  await run('p-pause');
 }else if(process.argv[2]==='--physical-resume'){
  if((await previous('p-pause'))?.status!=='paused')throw new P1BudgetError('p1_pause_evidence_missing');
  budget.assertCapacity(false);await run('p-resume');
 }else if(process.argv[2]==='--repair-e'){
  const failed=await previous('e-pause');
  const args=failed?.requests[0]?.response?.calls[0]?.args;
  if(failed?.status!=='failed'||failed.result?.errorCode!=='tool_scope_mismatch'||!args||!('packagingMark'in args)||args.packagingMark!=='null')throw new P1BudgetError('p1_repair_not_applicable');
  if((budget.limits.requests??Infinity)-budget.status().requests.length<7)throw new P1BudgetError('p1_insufficient_remaining_allowance');
  await run('e-pause-repair');
 }else if(process.argv[2]==='--resume-e'){
  if((await previous('e-pause'))?.status!=='paused'&&(await previous('e-pause-repair'))?.status!=='paused')throw new P1BudgetError('p1_pause_evidence_missing');
  if((budget.limits.requests??Infinity)-budget.status().requests.length<2)throw new P1BudgetError('p1_budget_exhausted');
  await run('e-resume');
 }else for(const spec of cases){
  if(spec.stage==='e-pause'){
   if((await previous('e-resume'))?.status==='passed'||(await previous('p-resume'))?.status==='passed')continue;
   if((await previous('p-pause'))?.status==='paused')break;
  }
  const old=await previous(spec.stage);if(old?.status==='passed')continue;if(old?.status==='paused')break;if(old)throw new P1BudgetError('p1_previous_failure_requires_review');
  if((budget.limits.requests??Infinity)-budget.status().requests.length<spec.minimum)throw new P1BudgetError('p1_insufficient_remaining_allowance');
  await run(spec.stage);
 }
}catch(error){blocked=error instanceof P1BudgetError?error.code:'p1_completion_unavailable';}
finally{
 if(release)release();const ledger=budget.status();const reports=(await Promise.all(names.map(previous))).filter((r):r is Report=>r!==null);
 const passed=['a','c'].every(stage=>reports.some(r=>r.stage===stage&&r.status==='passed'))&&reports.some(r=>['e-resume','p-resume'].includes(r.stage)&&r.status==='passed');
 const paused=reports.some(r=>['e-pause','e-pause-repair','p-pause'].includes(r.stage)&&r.status==='paused')&&!reports.some(r=>['e-resume','p-resume'].includes(r.stage));
 const report={phase:'P1C',scope:'Controlled live Shop A, custody gap and physical-context closer-view/resume; not full P1 verification',grantId:P1_COMPLETION_ID,status:blocked?'blocked':passed?'passed':paused?'awaiting_resume':'partial',blocked,approval:ledger.approval,limits:budget.limits,reservedCents:ledger.reservedCents,inferenceRequests:ledger.requests.length,inferenceRequestsThisRun:events.length,tokenPreflights:reports.reduce((s,r)=>s+r.tokenPreflights,0),usageEstimatedUsd:ledger.requests.reduce((s,r)=>s+(r.estimatedUsd??0),0),usageCoverage:ledger.requests.filter(r=>r.usage).length,actualBilledUsd:null,priorLiveB:'docs/packproof/evidence/p1c-live-b.json',missingCodeAfterScopedSchemaRepair:'not_run',stages:names.map(stage=>({stage,status:reports.find(r=>r.stage===stage)?.status??'not_run',evidence:reports.some(r=>r.stage===stage)?path(stage):null})),originalLedgersUnchanged:true,actualPhone:'not_run'};
 await writeFile(`${root}/p1c-completion.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,blocked,requests:report.inferenceRequests,newRequests:events.length,reservedCents:ledger.reservedCents,usageEstimatedUsd:report.usageEstimatedUsd,actualBilledUsd:null,stages:report.stages.map(({stage,status})=>({stage,status}))}));
 if(blocked)process.exitCode=1;
}

async function runMissingPackage(){
 const stage=process.argv[2]==='--missing-resume'?'e-resume':'e-pause';
 let release:(()=>void)|undefined;let errorCode:string|null=null;
 try{
  if(process.argv.length!==3)throw new P1BudgetError('p1_completion_invalid_arguments');
  if(await previous(stage)){console.log(JSON.stringify({status:'already_recorded',stage,newRequests:0,evidence:path(stage)}));return;}
  budget.assertApproved();
  if(Number(process.env.PACKPROOF_CONFIRMED_CREDITS_USD??0)<4)throw new P1BudgetError('p1_confirmed_credits_required');
  const age=Date.now()-Date.parse(MUSE_PRICING.verifiedAt+'T00:00:00Z');
  if(age<0||age>7*86400000)throw new P1BudgetError('p1_refresh_verified_pricing');
  if(!process.env.MODEL_API_KEY)throw new P1BudgetError('p1_credentials_missing');
  release=budget.acquire();budget.assertCapacity(false);
  if(budget.status().reservedCents+(stage==='e-pause'?6:5)*25>budget.limits.totalCents)throw new P1BudgetError('p1_insufficient_remaining_allowance');
  if(stage==='e-resume'&&(await previous('e-pause'))?.status!=='paused')throw new P1BudgetError('p1_pause_evidence_missing');
  await run(stage);
 }catch(e){errorCode=e instanceof P1BudgetError?e.code:'p1_completion_unavailable';process.exitCode=1;}
 finally{
  if(release)release();const ledger=budget.status();
  console.log(JSON.stringify({stage,error:errorCode,newRequests:events.length,reservedCents:ledger.reservedCents,usageEstimatedUsd:ledger.requests.reduce((s,r)=>s+(r.estimatedUsd??0),0),actualBilledUsd:null,evidence:path(stage)}));
 }
}
