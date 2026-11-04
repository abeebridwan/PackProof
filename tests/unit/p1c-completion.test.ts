import '../fixtures/clock.js';
import {afterEach,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {P1Budget,P1_APPROVAL,P1_COMPLETION_APPROVAL,P1_COMPLETION_ID,P1_REPAIR_APPROVAL,P1_REPAIR_ID} from '../../src/server/providers/p1-budget.js';
import {fixture,input} from '../fixtures/investigator-memory.js';
import {recordedMuse,normalDecision} from '../../src/server/providers/muse.js';
import {startInvestigation,resumeInvestigation,initialState} from '../../src/server/investigator/graph.js';
import {factCatalog,finalize} from '../../src/server/investigator/finalizer.js';
import {langChainTools,executeTool} from '../../src/server/investigator/tools.js';
import {LangChainMuse} from '../../src/server/providers/muse.js';
const directories:string[]=[];
afterEach(()=>{for(const d of directories.splice(0))rmSync(d,{recursive:true,force:true});});
const settle=(b:P1Budget,id:string)=>b.settle(id,{state:'responded',requestId:'request-controlled',responseId:'response-controlled',model:'muse-spark-1.3',usage:{inputTokens:10,outputTokens:10,cachedTokens:0}});
function setup(){
 const root=mkdtempSync(join(tmpdir(),'packproof-completion-'));directories.push(root);
 const old=new P1Budget(join(root,'initial'));old.approve(P1_APPROVAL);const release=old.acquire();
 for(let n=0;n<8;n++)settle(old,old.reserve(`old-${n}`,10,false));release();
 const predecessorPath=join(old.directory,'budget.json');const bytes=readFileSync(predecessorPath,'utf8');
 const directory=join(root,'completion');const grant={grantId:P1_COMPLETION_ID,predecessorPath} as const;
 return {old,bytes,predecessorPath,directory,grant,budget:new P1Budget(directory,grant)};
}
it('requires the new exact approval and binds a fixed grant to unchanged exhausted prior history',()=>{
 const f=setup();expect(f.budget.status().approval).toBeNull();expect(()=>f.budget.acquire()).toThrow('p1_approval_required');
 expect(()=>f.budget.approve(P1_APPROVAL)).toThrow('p1_explicit_approval_required');
 f.budget.approve(P1_COMPLETION_APPROVAL);const ledger=f.budget.status();expect(ledger.schemaVersion).toBe(2);expect('grantId'in ledger&&ledger.grantId).toBe(P1_COMPLETION_ID);
 expect(readFileSync(f.predecessorPath,'utf8')).toBe(f.bytes);expect(f.old.status().requests).toHaveLength(8);
});
it('persists the separate sixteen-request/$4 ceiling across restarts and refuses request seventeen',()=>{
 const f=setup();f.budget.approve(P1_COMPLETION_APPROVAL);let release=f.budget.acquire();
 for(let n=0;n<8;n++)settle(f.budget,f.budget.reserve(`new-${n}`,10,false));release();
 const restored=new P1Budget(f.directory,f.grant);release=restored.acquire();
 for(let n=8;n<16;n++)settle(restored,restored.reserve(`new-${n}`,10,false));
 expect(()=>restored.reserve('seventeen',10,false)).toThrow('p1_budget_exhausted');expect(restored.status().reservedCents).toBe(400);release();
 expect(readFileSync(f.predecessorPath,'utf8')).toBe(f.bytes);const oldRelease=f.old.acquire();expect(()=>f.old.reserve('old-ninth',10,false)).toThrow('p1_budget_exhausted');oldRelease();
});
it('retains run exclusion, two counted retries and ambiguous-outcome lockout under the new grant',()=>{
 const f=setup();f.budget.approve(P1_COMPLETION_APPROVAL);const release=f.budget.acquire();
 const other=new P1Budget(f.directory,f.grant);expect(()=>other.acquire()).toThrow('p1_run_locked');
 for(let n=0;n<2;n++)settle(f.budget,f.budget.reserve(`retry-${n}`,10,true));expect(()=>f.budget.reserve('retry-3',10,true)).toThrow('p1_retry_limit');
 f.budget.reserve('unknown',10,false);release();expect(()=>other.acquire()).toThrow('p1_operation_in_doubt');
});
it('rejects changed predecessor history instead of silently rebinding or resetting the follow-up grant',()=>{
 const f=setup();f.budget.approve(P1_COMPLETION_APPROVAL);
 const old=JSON.parse(f.bytes);old.requests[0].requestId='changed';writeFileSync(f.predecessorPath,JSON.stringify(old,null,2)+'\n');
 expect(()=>f.budget.status()).toThrow('p1_predecessor_changed');expect(()=>new P1Budget(f.directory,f.grant)).toThrow('p1_ledger_invalid');
});
function repairSetup(){
 const f=setup();f.budget.approve(P1_COMPLETION_APPROVAL);const release=f.budget.acquire();
 for(let n=0;n<16;n++)settle(f.budget,f.budget.reserve(`completion-${n}`,10,false));release();
 const predecessorPath=join(f.directory,'budget.json'),bytes=readFileSync(predecessorPath,'utf8');
 const directory=join(f.directory,'..',P1_REPAIR_ID),grant={grantId:P1_REPAIR_ID,predecessorPath} as const;
 return {...f,directory,grant,bytes,predecessorPath,budget:new P1Budget(directory,grant)};
}
it('binds the additional dollar-only grant to its exact policy, one directory and settled completion history',()=>{
 const f=repairSetup();expect(f.budget.limits.requests).toBeNull();
 expect(()=>f.budget.approve(P1_COMPLETION_APPROVAL)).toThrow('p1_explicit_approval_required');
 expect(()=>new P1Budget(join(f.directory,'copy'),f.grant)).toThrow('p1_grant_directory_mismatch');
 f.budget.approve(P1_REPAIR_APPROVAL);expect(f.budget.status().schemaVersion).toBe(3);
 const changed=JSON.parse(readFileSync(join(f.directory,'budget.json'),'utf8'));changed.limits.requests=1000;
 writeFileSync(join(f.directory,'budget.json'),JSON.stringify(changed));expect(()=>f.budget.status()).toThrow('p1_ledger_invalid');
 expect(readFileSync(f.predecessorPath,'utf8')).toBe(f.bytes);
});
it('enforces the dollar ceiling without resetting it across restarts or adding a separate request cap',()=>{
 const f=repairSetup();f.budget.approve(P1_REPAIR_APPROVAL);let release=f.budget.acquire();
 for(let n=0;n<8;n++)settle(f.budget,f.budget.reserve(`repair-${n}`,10,false));release();
 const restored=new P1Budget(f.directory,f.grant);release=restored.acquire();
 for(let n=8;n<16;n++)settle(restored,restored.reserve(`repair-${n}`,10,false));
 expect(()=>restored.reserve('over-dollar-ceiling',10,false)).toThrow('p1_budget_exhausted');
 expect(restored.status().reservedCents).toBe(400);expect(restored.limits.requests).toBeNull();release();
 expect(readFileSync(f.predecessorPath,'utf8')).toBe(f.bytes);
});
it('retains concurrent-run, duplicate-operation, retry and ambiguous-outcome controls for the dollar-only grant',()=>{
 const f=repairSetup();f.budget.approve(P1_REPAIR_APPROVAL);const release=f.budget.acquire();
 const other=new P1Budget(f.directory,f.grant);expect(()=>other.acquire()).toThrow('p1_run_locked');
 for(let n=0;n<2;n++)settle(f.budget,f.budget.reserve(`retry-${n}`,10,true));
 expect(()=>f.budget.reserve('retry-3',10,true)).toThrow('p1_retry_limit');
 expect(()=>f.budget.reserve('retry-0',10,false)).toThrow('p1_operation_in_doubt');
 f.budget.reserve('uncertain',10,false);release();expect(()=>other.acquire()).toThrow('p1_operation_in_doubt');
 const prior=JSON.parse(f.bytes);prior.requests[0].requestId='changed';writeFileSync(f.predecessorPath,JSON.stringify(prior));
 expect(()=>f.budget.status()).toThrow('p1_predecessor_changed');
});
it('refuses to recreate a registered allowance after its ledger or whole directory is lost',()=>{
 const f=repairSetup();f.budget.approve(P1_REPAIR_APPROVAL);
 rmSync(f.directory,{recursive:true,force:true});
 expect(()=>new P1Budget(f.directory,f.grant)).toThrow('p1_grant_history_missing');
 expect(readFileSync(f.predecessorPath,'utf8')).toBe(f.bytes);
});
it('does not coerce literal string null into an absent packaging code or relax the tool scope check',async()=>{
 const f=await fixture();const planner=recordedMuse(s=>({call:{name:'lookup_product',args:{namespace:s.input.namespace,productMark:s.input.productMark,packagingMark:'null'}},answer:null}));
 const result=await startInvestigation({...f.options,planner},input({packagingMark:null}));
 expect(result.errorCode).toBe('invalid_tool_result');expect(result.finding?.status).toBe('unavailable');expect(result.finding?.product.data?.mappingStatus).toBe('not_checked');
 const row=await f.store.create(f.options.owner,input({packagingMark:null}));const state=initialState(row);
 await expect(executeTool('lookup_product',{namespace:state.input.namespace,productMark:state.input.productMark,packagingMark:'null'},{...f.options,state})).rejects.toThrow('tool_scope_mismatch');
});
it('sends an exactly scoped native schema for missing, literal null and leading-zero packaging values',async()=>{
 const f=await fixture();
 for(const value of [null,'null','000043']){
  const row=await f.store.create(f.options.owner,input({packagingMark:value}));const state=initialState(row);let parameters:Record<string,unknown>|null=null;
  const transport:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));parameters=body.tools.find((t:{function:{name:string}})=>t.function.name==='lookup_product').function.parameters;
   return Response.json({id:'controlled-scoped-schema',model:'muse-spark-1.3',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"claimIds":["product.records"]}'}}]});
  };
  await new LangChainMuse(transport,{apiKey:'fake-no-network',live:true}).invoke(state,langChainTools({...f.options,state}));
  expect((parameters!['properties'] as Record<string,unknown>).packagingMark).toEqual(value===null?{type:'null'}:{type:'string',enum:[value]});
 }
});
it('resumes a physical closer-view request using unchanged code checks while keeping association unresolved',async()=>{
 const f=await fixture();let calls=0;
 const delegate=recordedMuse(s=>s.revision>1?{call:null,answer:{claimIds:factCatalog(s.results).map(f=>f.id)}}:normalDecision(s));
 const planner={invoke:(...args:Parameters<typeof delegate.invoke>)=>{calls++;return delegate.invoke(...args);}};
 const first=await startInvestigation({...f.options,planner},input({context:'physical'}));expect(first.status).toBe('needs_input');
 const result=await resumeInvestigation({...f.options,planner},first.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:'PK-2002',captureId:null});
 expect(result.revision).toBe(2);expect(result.finding?.status).toBe('needs_evidence');expect(result.finding?.physicalStatus).toBe('unresolved');expect(result.finding?.missingChecks).toEqual([]);expect(calls).toBe(6);
});
it('assesses an early closer-view pause with no selected facts, reruns all gates and resumes normally',async()=>{
 const f=await fixture();const planner=recordedMuse(s=>s.revision===1?{call:{name:'request_additional_evidence',args:{investigationId:s.id,reason:'missing_package',view:'both_marks'}},answer:null}:normalDecision(s));
 const first=await startInvestigation({...f.options,planner},input({packagingMark:null}));
 expect(first.status).toBe('needs_input');expect(first.finding?.status).toBe('needs_evidence');expect(first.finding?.claims).toEqual([]);expect(first.finding?.missingChecks).toHaveLength(4);
 expect(new Set(first.trace.filter(t=>t.source==='mandatory_finalizer').map(t=>t.tool)).size).toBe(4);
 const resumed=await resumeInvestigation({...f.options,planner},first.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:'PK-2002',captureId:null});
 expect(resumed.finding?.status).toBe('supported');expect(resumed.finding?.physicalStatus).toBe('not_inspected');
});
it('keeps empty final answers, fabricated pause citations and provider failure unavailable',async()=>{
 const f=await fixture();const base={input:input(),services:f.options.services,selected:{},answer:{claimIds:[]},error:null};
 expect((await finalize(base)).status).toBe('unavailable');
 expect((await finalize({...base,pendingEvidence:true})).status).toBe('unavailable');
 const request={status:'needs_evidence' as const,reason:'Pending',evidence_refs:[],scope:'unit' as const,asOf:new Date().toISOString(),policyVersion:'test',next_actions:[],data:null};
 expect((await finalize({...base,pendingEvidence:true,selected:{request_additional_evidence:request},answer:{claimIds:['invented']}})).status).toBe('unavailable');
 expect((await finalize({...base,pendingEvidence:true,selected:{request_additional_evidence:request},error:'provider_unavailable'})).status).toBe('unavailable');
});
