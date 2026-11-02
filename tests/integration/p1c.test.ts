import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation} from '../../src/server/investigator/graph.js';
import {P1Budget,P1_APPROVAL} from '../../src/server/providers/p1-budget.js';
import {liveMuse,type LiveEvidence} from '../../src/server/providers/p1-live.js';
import {normalDecision} from '../../src/server/providers/muse.js';
import {factCatalog} from '../../src/server/investigator/finalizer.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
import {input} from '../fixtures/investigator-memory.js';

it.skipIf(process.env.PACKPROOF_P1C_INTEGRATION!=='1')('P1C simulated provider boundary returns actual Supabase signed results for both sellers without real Meta calls',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'packproof-p1c-integration-'));const budget=new P1Budget(directory);
 // Approval exists only in this temporary test ledger, never the real P1 ledger.
 budget.approve(P1_APPROVAL);const release=budget.acquire();let calls=0;
 const findings:Record<string,unknown>[]=[];
 try{
  for(const seller of ['A','B'] as const){
   const app=await runtime({sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null});
   let state:Parameters<typeof normalDecision>[0];const events:LiveEvidence[]=[];
   const transport:typeof fetch=async(url,init)=>{
    if(String(url).endsWith('/input_tokens'))return Response.json({input_tokens:1000});
    calls++;const body=JSON.parse(String(init?.body));expect(body.model).toBe('muse-spark-1.3');
    const decision=state.results.lookup_seller?.status==='blocked'?{call:null,answer:{claimIds:factCatalog(state.results).map(f=>f.id)}}:normalDecision(state);
    return Response.json({id:`chatcmpl-injected-${calls}`,object:'chat.completion',model:'muse-spark-1.3',choices:[{index:0,finish_reason:decision.call?'tool_calls':'stop',message:decision.call?{role:'assistant',content:'Checking the fictional signed evidence.',tool_calls:[{id:`provider-id-${calls}`,type:'function',function:{name:decision.call.name,arguments:JSON.stringify(decision.call.args)}}]}:{role:'assistant',content:JSON.stringify(decision.answer)}}],usage:{prompt_tokens:1000,completion_tokens:60}},{headers:{'x-request-id':`request-injected-${calls}`}});
   };
   const adapter=liveMuse(budget,{apiKey:'fake-key-test-only',transport,evidence:events});
   const planner={invoke:async(...args:Parameters<typeof adapter.invoke>)=>{state=args[0];return adapter.invoke(...args);}};
   try{
    const finding=await startInvestigation({...app.options,planner,modelReservationCents:3},input(seller==='A'?{productMark:'FP-1001',packagingMark:'PK-2001',sellerId:'30000000-0000-4000-8000-000000000004'}:{}));
    expect(finding.finding?.status).toBe(seller==='A'?'blocked':'supported');expect(finding.trace.filter(t=>t.source==='mandatory_finalizer')).toHaveLength(4);
    const productResult=events.find(e=>e.toolResults.some(t=>t.name==='lookup_product'))?.toolResults.find(t=>t.name==='lookup_product');
    expect((productResult?.result as {evidence_refs:string[]}).evidence_refs.length).toBeGreaterThan(0);
    expect(events.filter(e=>e.response?.calls.length).every(e=>e.adapter==='native_validated_fallback'&&e.adapterFailure==='SyntaxError')).toBe(true);
    expect(finding.retries).toBe(0);expect(finding.finding?.physicalStatus).toBe('not_inspected');
    const stored=await app.pool.query('SELECT reserved_cents,model_requests FROM packproof.investigations WHERE id=$1',[finding.id]);expect(stored.rows[0].model_requests).toBe(seller==='A'?3:5);expect(stored.rows[0].reserved_cents).toBe(seller==='A'?9:15);
    findings.push({seller,status:finding.finding?.status,toolResultCorrelation:true,signedSourceRefsPresent:true,mandatoryFinalizerChecks:4,nativeToolTurnCommentaryBridge:true,retries:0,physicalStatus:finding.finding?.physicalStatus});
   }finally{await app.close();}
  }
  expect(calls).toBe(8);expect(budget.status().reservedCents).toBe(200);
  await writeFile('docs/packproof/evidence/p1c-adapter-supabase.json',JSON.stringify({status:'passed',mode:'simulated provider transport + actual Supabase; NOT live acceptance',providerRequests:0,simulatedRequests:calls,findings},null,2)+'\n');
 }finally{release();rmSync(directory,{recursive:true,force:true});}
},120000);
