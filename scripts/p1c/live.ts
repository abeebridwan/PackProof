import {readFile,writeFile} from 'node:fs/promises';
import {P1Budget,P1BudgetError,P1_LIMITS,MUSE_PRICING} from '../../src/server/providers/p1-budget.js';
import {liveMuse,type LiveEvidence} from '../../src/server/providers/p1-live.js';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation} from '../../src/server/investigator/graph.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
const budget=new P1Budget();const events:LiveEvidence[]=[];const preflights={count:0};
const results:Record<string,unknown>[]=[];
let release:(()=>void)|undefined;let blocked:string|null=null;let priorPreflights=0;
const cases=[
 {id:'A',productMark:'FP-1001',packagingMark:'PK-2001',sellerId:'30000000-0000-4000-8000-000000000004',minimumRequests:3},
 {id:'B',productMark:'FP-1002',packagingMark:'PK-2002',sellerId:'30000000-0000-4000-8000-000000000005',minimumRequests:5},
 {id:'C',productMark:'FP-GAP-01',packagingMark:'PK-GAP-01',sellerId:'30000000-0000-4000-8000-000000000005',minimumRequests:5},
] as const;
try{
 // Approval must precede credential access, tokenization or any database/API
 // connection. The public HTTP runtime always retains recorded responses.
 budget.assertApproved();
 const requested=process.argv.slice(2);
 const only=requested.length===1&&/^--scenario=[ABC]$/.test(requested[0]!)?requested[0]!.at(-1):null;
 if(requested.length&&!only)throw new P1BudgetError('p1_invalid_scenario');
 // Retain executed cases even after the allowance is exhausted or a process
 // restarts. A default rerun must not erase failed evidence or repeat a success.
 try{
  const previous=JSON.parse(await readFile('docs/packproof/evidence/p1c-live.json','utf8')) as {scenarios:Record<string,unknown>[];tokenPreflightsTotal?:number;tokenPreflightsThisRun?:number};
  priorPreflights=previous.tokenPreflightsTotal??previous.tokenPreflightsThisRun??0;
  results.push(...previous.scenarios.filter(s=>['passed','failed'].includes(String(s.status))));
 }catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
 if(Number(process.env.PACKPROOF_CONFIRMED_CREDITS_USD??0)<2)throw new P1BudgetError('p1_confirmed_credits_required');
 const pricingAge=Date.now()-Date.parse(MUSE_PRICING.verifiedAt+'T00:00:00Z');
 if(pricingAge<0||pricingAge>7*86400000)throw new P1BudgetError('p1_refresh_verified_pricing');
 release=budget.acquire();
 const apiKey=process.env.MODEL_API_KEY;if(!apiKey)throw new P1BudgetError('p1_credentials_missing');
 for(const c of cases){
  if(only&&c.id!==only)continue;
  if(results.some(r=>r.scenario===c.id))continue;
  if(8-budget.status().requests.length<c.minimumRequests){results.push({scenario:c.id,status:'not_run',reason:'insufficient remaining request allowance for expected complete round-trip'});continue;}
  const app=await runtime({sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null});
  const start=Date.now(),first=events.length;const metrics={modelOperationMs:0,toolOperationMs:0,verificationMs:0};
  try{
   // Do not spend on an already-stale immutable fixture. Refreshing signed
   // demo evidence needs its own authorized change, never an implicit reseed.
   const product=await app.options.services.lookupProduct({namespace:'packproof-demo',productMark:c.productMark,packagingMark:c.packagingMark});
   if(!product.data||product.status!=='supported')throw new P1BudgetError('p1_signed_fixture_unavailable');
   const history=await app.options.services.getCustodyHistory({itemId:product.data.itemId});
   const snapshot=history.data?.snapshot;
   if(!snapshot||Date.now()<Date.parse(snapshot.asOf)||Date.now()-Date.parse(snapshot.asOf)>86400000)throw new P1BudgetError('p1_fixture_stale');
   const result=await startInvestigation({...app.options,mode:'live',metrics,modelReservationCents:3,planner:liveMuse(budget,{apiKey,evidence:events,preflights})},{namespace:'packproof-demo',productMark:c.productMark,packagingMark:c.packagingMark,sellerId:c.sellerId,listingText:'Controlled fictional P1 validation; no customer data.',context:'listing',captureId:null});
   const exchange=events.slice(first);const names=exchange.flatMap(e=>e.response?.calls.map(t=>t.name)??[]);
   const roundTrip=exchange.some(e=>e.toolResults.length&&e.response!==null);
   const answer=exchange.some(e=>e.response?.answer!==null&&e.response?.answer!==undefined);
   const identifiersComplete=exchange.some(e=>e.response!==null)&&exchange.filter(e=>e.response!==null).every(e=>e.requestId!==null);
   const allFinalChecks=result.trace.filter(t=>t.source==='mandatory_finalizer').length===4;
   const outcome=c.id==='A'?result.finding?.status==='blocked'&&result.finding.seller?.data?.authorized===false&&names.includes('lookup_seller'):c.id==='B'?result.finding?.status==='supported'&&result.finding.seller?.data?.authorized===true&&Boolean(result.finding.notices?.data?.notices.length):result.finding?.status==='needs_evidence'&&Boolean(result.finding.history?.data?.gaps.length)&&names.includes('get_custody_history')&&result.finding.claims.some(claim=>claim.kind==='history');
   const report={scenario:c.id,status:roundTrip&&answer&&identifiersComplete&&allFinalChecks&&outcome?'passed':'failed',mode:'live',totalMs:Date.now()-start,providerInferenceMs:exchange.reduce((sum,e)=>sum+e.inferenceMs,0),tokenPreflightMs:exchange.reduce((sum,e)=>sum+e.preflightMs,0),...metrics,roundTrip,structuredFinalAnswer:answer,identifiersComplete,mandatoryChecks:allFinalChecks,requests:exchange,result};
   results.push(report);await writeFile(`docs/packproof/evidence/p1c-live-${c.id.toLowerCase()}.json`,JSON.stringify(report,null,2)+'\n');
   if(report.status==='failed'){blocked='p1_live_scenario_failed';break;}
  }finally{await app.close();}
 }
}catch(error){blocked=error instanceof P1BudgetError?error.code:'p1_validation_unavailable';}
finally{
 if(release)release();
 const ledger=budget.status();
 const report={phase:'P1C',status:blocked?'blocked':results.filter(r=>r.status==='passed').length===3?'passed':'partial',approval:ledger.approval?'explicitly_approved':'missing',blocked,limits:P1_LIMITS,reservedCents:ledger.reservedCents,inferenceReservations:ledger.requests.length,inferenceRequestsAttemptedThisRun:events.length,tokenPreflightsThisRun:preflights.count,tokenPreflightsTotal:priorPreflights+preflights.count,usageEstimatedUsd:ledger.requests.reduce((sum,r)=>sum+(r.estimatedUsd??0),0),usageCoverage:ledger.requests.filter(r=>r.usage).length,actualBilledUsd:null,pricing:MUSE_PRICING,scenarios:cases.map(c=>results.find(r=>r.scenario===c.id)??{scenario:c.id,status:'not_run',reason:blocked??'not reached'}),requestEvidence:'per-scenario p1c-live-a/b/c.json files only when executed',liveLatencyAvailable:results.some(r=>Array.isArray(r.requests)&&r.requests.length>0),p0LedgerChanged:false};
 await writeFile('docs/packproof/evidence/p1c-live.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,approval:report.approval,blocked,reservedCents:report.reservedCents,inferenceRequestsAttemptedThisRun:events.length,tokenPreflightsThisRun:preflights.count,actualBilledUsd:null}));
 if(blocked||results.some(r=>r.status==='failed'))process.exitCode=1;
}
