import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation} from '../../src/server/investigator/graph.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';

// Real database/controller timing, recorded model transport only. Never log SQL,
// arguments, credentials, cookies, media or private investigation identifiers.
// Counts describe client requests, not statements executed inside SQL functions.
const label=process.argv[2];
if(!['before','after','cycle-before','cycle-after'].includes(label??''))throw new Error('Use before, after, cycle-before or cycle-after');
const app=await runtime({sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null});
let queries=0,queryMs=0,connections=0;
const byVerb:Record<string,number>={};
const byGroup:Record<string,number>={};
app.pool.on('connect',client=>{
 connections++;
 client.query=new Proxy(client.query,{apply(target,self,args){
  queries++;
  const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
  const verb=typeof sql==='string'?sql.trim().split(/\s+/)[0]!.toUpperCase():'OTHER';
  byVerb[verb]=(byVerb[verb]??0)+1;
  const group=typeof sql!=='string'?'other':sql.includes('packproof_graph')?'checkpoints':sql.includes('investigation_operations')?'operations':sql.includes('tool_events')?'events':sql.includes('json_build_object')?'signedEvidence':sql.includes('investigations')?'investigations':'transactionOrOther';
  byGroup[group]=(byGroup[group]??0)+1;
  const start=performance.now();
  const result=Reflect.apply(target,self,args);
  if(result instanceof Promise)return result.finally(()=>{queryMs+=performance.now()-start;});
  return result;
 }});
});
try{
 const start=performance.now();
 const result=await startInvestigation(app.options,{namespace:'packproof-demo',productMark:'FP-1002',packagingMark:'PK-2002',sellerId:'30000000-0000-4000-8000-000000000005',listingText:'Fictional latency measurement',context:'listing',captureId:null});
 const report={label,at:new Date().toISOString(),mode:'actual Supabase + recorded model transport',providerRequests:0,elapsedMs:Math.round(performance.now()-start),queryCount:queries,cumulativeQueryMs:Math.round(queryMs),connections,byVerb,byGroup,actions:result.actions,finding:result.finding?.status,mandatoryFinalizerEvents:result.trace.filter(t=>t.source==='mandatory_finalizer').length,note:'One cold runtime request from this laptop; cumulative query time includes overlapping work. Not a live model or deployed latency benchmark.'};
 if(result.status!=='complete'||report.actions!==4||report.mandatoryFinalizerEvents!==4)throw new Error('Incomplete benchmark');
 await writeFile(`docs/packproof/evidence/p1b-latency-${label}.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch{
 process.exitCode=1;console.error('Latency measurement failed; no database details logged.');
}finally{await app.close();}
