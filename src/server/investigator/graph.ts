import {Annotation,StateGraph,START,END,interrupt,Command,type BaseCheckpointSaver} from '@langchain/langgraph';
import {traceable} from 'langsmith/traceable';
import {ModelAnswer,ResumeInput,PublicInvestigation,type ResumeInput as Resume,type ToolName} from '../../contracts/investigation.js';
import {InvestigationInput} from '../../contracts/investigation.js';
import {TOOL_OUTPUTS,langChainTools,type ToolContext} from './tools.js';
import {finalize,factCatalog} from './finalizer.js';
import {ProviderFailure,type MusePlanner} from '../providers/muse.js';
import {InvestigationError} from './store.js';
import {P1BudgetError} from '../providers/p1-budget.js';
import {historicalFinding} from '../../domain/verification/freshness.js';
import type {RunState,InvestigationStore,Owner,ToolResult,Row} from './types.js';
import type {EvidenceServices} from '../evidence/services.js';
import type {ImageInspector} from '../providers/recorded-image.js';
import type {safeTracing} from '../../../scripts/spikes/safe-tracing.js';
const GraphState=Annotation.Root({value:Annotation<RunState>});
export type GraphOptions={store:InvestigationStore;owner:Owner;services:EvidenceServices;planner:MusePlanner;inspector:ImageInspector;checkpointer:BaseCheckpointSaver;trace:ReturnType<typeof safeTracing>;timeoutMs?:number;capCents?:number;modelReservationCents?:number;now?:()=>number;mode?:'live'|'recorded-demo';metrics?:{modelOperationMs:number;toolOperationMs:number;verificationMs:number}};
export function investigatorGraph(o:GraphOptions){
 const now=o.now??Date.now;const mode=o.mode??'recorded-demo';
 const context=(s:RunState):ToolContext=>({state:s,owner:o.owner,store:o.store,services:o.services,inspector:o.inspector});
 const planStep=async({value:s}:{value:RunState}):Promise<{value:RunState}>=>{
  let retries=s.retries;let failure:string|null=null;
  for(let attempt=0;attempt<=2;attempt++){
   try{
    // Bound each active execution. A durable user-input pause starts a new
    // execution window on resume; it never renews signed evidence or counters.
    if(!Number.isFinite(s.startedAt)||now()-s.startedAt>(o.timeoutMs??600000))throw new InvestigationError('session_expired');
    const start=now();
    const step=await o.store.operation(o.owner,s.id,`model:${s.revision}:${s.turn}:${attempt}`,{messages:s.messages,input:s.input,revision:s.revision},'model',()=>o.planner.invoke(s,langChainTools(context(s)),{retry:attempt>0,attempt}),{reservationCents:o.modelReservationCents??0,sessionCapCents:o.capCents??50});
    o.trace.emit({investigationId:s.id,mode,kind:'model',status:'completed',model:'muse-spark-1.3',refs:[],latencyMs:Math.min(60000,Math.max(0,Math.round(now()-start))),...(step.inputTokens!==null?{inputTokens:step.inputTokens}:{}),...(step.outputTokens!==null?{outputTokens:step.outputTokens}:{}),...(step.estimatedCostUsd!==undefined?{estimatedCostUsd:step.estimatedCostUsd,pricingVerifiedAt:step.pricingVerifiedAt}:{})});
    if(o.metrics)o.metrics.modelOperationMs+=now()-start;
    // A model operation changes no action/recapture/retry counters. Actual
    // retry reservations refresh retries below; final views read the DB row.
    return {value:{...s,pending:step.call,answer:step.answer,turn:s.turn+1,retries,error:null,messages:[...s.messages,{role:'ai' as const,content:step.answer?JSON.stringify(step.answer):'',...(step.call?{calls:[step.call]}:{})}]}};
   }catch(e){
    failure=e instanceof InvestigationError||e instanceof P1BudgetError?e.code:e instanceof ProviderFailure?'provider_unavailable':'invalid_output';
    if(!(e instanceof ProviderFailure&&e.transient)||attempt===2)break;
    try{await o.store.operation(o.owner,s.id,`retry:${s.revision}:${s.turn}:${attempt}`,{},'retry',async()=>({retried:true}));retries=(await o.store.get(o.owner,s.id)).retries;o.trace.emit({investigationId:s.id,mode,kind:'retry',status:'unavailable',refs:[],latencyMs:0,errorCode:'provider_unavailable'});}catch{failure='retry_limit';break;}
   }
  }
  return {value:{...s,error:failure??'provider_unavailable',pending:null,retries}};
 };
 const toolStep=async({value:s}:{value:RunState}):Promise<{value:RunState}>=>{
  const call=s.pending!;const start=now();
  try{
   const bound=langChainTools(context(s)).find(t=>t.name===call.name);if(!bound)throw new Error('unknown_tool');
   const result=await o.store.operation(o.owner,s.id,`tool:${s.revision}:${s.turn}:${call.name}`,{name:call.name,args:call.args},'tool',async()=>TOOL_OUTPUTS[call.name].parse(JSON.parse(String(await bound.invoke(call.args)))),{recapture:call.name==='request_additional_evidence'});
   if(o.metrics)o.metrics.toolOperationMs+=now()-start;
   const row=await o.store.get(o.owner,s.id);
   o.trace.emit({investigationId:s.id,mode,kind:'tool',tool:call.name,status:result.status==='supported'?'completed':result.status==='blocked'?'rejected':result.status==='unavailable'?'unavailable':'needs_evidence',refs:result.evidence_refs.slice(0,8),latencyMs:Math.min(60000,Math.max(0,Math.round(now()-start)))});
   return {value:{...s,pending:null,actions:row.actions,recaptures:row.recaptures,request:row.request,results:{...s.results,[call.name]:result},messages:[...s.messages,{role:'tool' as const,content:JSON.stringify(result),callId:call.id,name:call.name}]}};
  }catch(e){return {value:{...s,pending:null,error:e instanceof InvestigationError?e.code:'invalid_tool_result'}};}
 };
 const builder=new StateGraph(GraphState)
 .addNode('plan',async state=>{
  // A model/tool cycle shares a graph checkpoint. Each operation still has
  // its own durable reservation and result, so replay reuses completed work
  // if the process stops between the two operations or before this checkpoint.
  const planned=await planStep(state);
  return planned.value.pending&&!planned.value.error?toolStep(planned):planned;
 })
 // Retain this node name so checkpoints from the previous graph can resume
 // an already-scheduled tool without invoking the planner again.
 .addNode('tool',toolStep)
 .addNode('pause_assessment',async({value:s})=>{
  const checkStart=now();
  const finding=await finalize({mode,input:s.input,services:o.services,selected:s.results,answer:{claimIds:factCatalog(s.results).map(f=>f.id)},error:null,pendingEvidence:true,clock:()=>new Date(now()).toISOString(),audit:(name,result)=>o.store.audit(o.owner,s.id,name,result,`pause:${s.revision}:${name}`)});
  if(o.metrics)o.metrics.verificationMs+=now()-checkStart;
  await o.store.save(o.owner,s.id,{finding,status:'needs_input'});
  return {value:{...s,finding}};
 })
 .addNode('wait_for_evidence',async({value:s})=>{
  // No durable effects before interrupt: this node is replayed on resume.
  const resumed=interrupt(s.request) as {input:unknown;revision:number};
  const input=InvestigationInput.parse(resumed.input);
  const captureQuestion=input.captureId&&o.inspector.question?await o.inspector.question(await o.store.capture(o.owner,s.id,input.captureId)):'product_mark';
  const results={...s.results};delete results.request_additional_evidence;delete results.inspect_product_image;
  if(input.productMark!==s.input.productMark){delete results.lookup_product;delete results.lookup_seller;delete results.get_product_notices;delete results.get_custody_history;}
  else if(input.packagingMark!==s.input.packagingMark)delete results.lookup_product;
  return {value:{...s,input,captureQuestion,startedAt:now(),revision:resumed.revision,request:null,answer:null,error:null,results,messages:[...s.messages,{role:'human' as const,content:JSON.stringify({humanObservation:true,input,revision:resumed.revision})}]}};
 })
 .addNode('finalize',async({value:s})=>{
  const checkStart=now();
  const finding=await finalize({mode,input:s.input,services:o.services,selected:s.results,answer:s.answer,error:s.error,clock:()=>new Date(now()).toISOString(),audit:(name,result)=>o.store.audit(o.owner,s.id,name,result,`finalizer:${s.revision}:${name}`)});
  if(o.metrics)o.metrics.verificationMs+=now()-checkStart;
  await o.store.save(o.owner,s.id,{status:finding.status==='unavailable'?'unavailable':'complete',finding,request:null,error:s.error});
  o.trace.emit({investigationId:s.id,mode,kind:'gate',status:finding.status==='supported'?'completed':finding.status==='blocked'?'rejected':finding.status==='unavailable'?'unavailable':'needs_evidence',refs:finding.claims.flatMap(c=>c.evidence_refs).slice(0,8),latencyMs:Math.min(60000,Math.max(0,Math.round(now()-checkStart)))});
  return {value:{...s,finding}};
 })
 .addEdge(START,'plan')
 .addConditionalEdges('plan',({value:s})=>s.error?'finalize':s.pending?'tool':s.request?'pause_assessment':s.answer?'finalize':'plan',['finalize','tool','pause_assessment','plan'])
 .addConditionalEdges('tool',({value:s})=>s.error?'finalize':s.request?'pause_assessment':'plan',['finalize','pause_assessment','plan'])
 .addEdge('pause_assessment','wait_for_evidence').addEdge('wait_for_evidence','plan').addEdge('finalize',END);
 return builder.compile({checkpointer:o.checkpointer});
}
export function initialState(row:Row):RunState{return {id:row.id,revision:row.revision,input:row.input,messages:[],turn:0,actions:row.actions,recaptures:row.recaptures,retries:row.retries,results:{},pending:null,request:null,answer:null,finding:null,error:null,claims:[],startedAt:Date.parse(row.createdAt)};}
export async function publicView(store:InvestigationStore,owner:Owner,id:string){
 const {row,events}=store.readView?await store.readView(owner,id):await Promise.all([store.get(owner,id),store.events(owner,id)]).then(([row,events])=>({row,events}));
 const finding=row.finding?historicalFinding(row.finding,new Date().toISOString()):null;
 return PublicInvestigation.parse({id,revision:row.revision,status:row.status,mode:finding?.mode??'recorded-demo',input:row.input,actions:row.actions,recaptures:row.recaptures,retries:row.retries,finding,request:row.request,trace:events.map(e=>({tool:e.tool,status:e.result.status,source:e.source??'model_tool',evidence_refs:e.result.evidence_refs,reason:e.result.reason})),errorCode:row.error});
}
export async function startInvestigation(o:GraphOptions,input:InvestigationInput){
 const row=await o.store.create(o.owner,InvestigationInput.parse(input),true);
 if(row.status!=='running')await o.store.save(o.owner,row.id,{status:'running'});
 o.trace.emit({investigationId:row.id,mode:o.mode??'recorded-demo',kind:'lifecycle',status:'started',refs:[],latencyMs:0});
 const graph=investigatorGraph(o);
 await traceable(()=>graph.invoke({value:initialState(row)},{configurable:{thread_id:row.id},callbacks:[],recursionLimit:64}),{name:'packproof-investigator',tracingEnabled:false})();
 return publicView(o.store,o.owner,row.id);
}
export async function resumeInvestigation(o:GraphOptions,id:string,raw:unknown){
 const args=ResumeInput.parse(raw);
 return o.store.operation(o.owner,id,`resume:${args.idempotencyKey}`,args,'resume',async()=>{
  const row=await o.store.get(o.owner,id);
  if(row.status!=='needs_input'||row.revision!==args.expectedRevision)throw new InvestigationError('revision_conflict');
  if(args.captureId){const c=await o.store.capture(o.owner,id,args.captureId);if(c.revision!==row.revision)throw new InvestigationError('capture_revision_mismatch');}
  const input=InvestigationInput.parse({...row.input,productMark:args.productMark??row.input.productMark,packagingMark:args.packagingMark??row.input.packagingMark,captureId:args.captureId});
  const revised=await o.store.revise(o.owner,id,row.revision,input);
  const graph=investigatorGraph(o);
  await traceable(()=>graph.invoke(new Command({resume:{input,revision:revised.revision}}),{configurable:{thread_id:id},callbacks:[],recursionLimit:64}),{name:'packproof-investigator-resume',tracingEnabled:false})();
  return publicView(o.store,o.owner,id);
 });
}
