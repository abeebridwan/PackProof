import {writeFile,readFile} from 'node:fs/promises';
import {MemorySaver} from '@langchain/langgraph';
import {databasePool} from '../../src/server/data/postgres.js';
import {PostgresEvidenceRepository} from '../../src/server/data/evidence-repository.js';
import {createEvidenceServices} from '../../src/server/evidence/services.js';
import {RootPin} from '../../src/contracts/evidence.js';
import {startInvestigation} from '../../src/server/investigator/graph.js';
import {recordedMuse} from '../../src/server/providers/muse.js';
import {RecordedImageInspector} from '../../src/server/providers/recorded-image.js';
import {safeTracing} from '../spikes/safe-tracing.js';
import {EVIDENCE_CASES} from '../../tests/fixtures/evidence-cases.js';
import {MemoryStore,input,OWNER} from '../../tests/fixtures/investigator-memory.js';
const pool=databasePool({...OWNER,sessionHash:'e'.repeat(64)});
try{
 const repository=new PostgresEvidenceRepository(async q=>JSON.stringify((await pool.query(q)).rows[0].json_build_object));
 const dataset=await repository.load();const root=RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
 const services=createEvidenceServices({load:async()=>structuredClone(dataset)},root);const sourceIds=new Set(dataset.records.map(r=>r.id));const rows=[];
 let falseSupported=0,unsupportedCitations=0;
 for(const c of EVIDENCE_CASES){const start=performance.now();const store=new MemoryStore();const r=await startInvestigation({store,owner:OWNER,services,planner:recordedMuse(),inspector:new RecordedImageInspector(),checkpointer:new MemorySaver(),trace:safeTracing({enabled:false})},input(c.changes));if(r.finding?.status==='supported'&&c.expected!=='supported')falseSupported++;for(const claim of r.finding?.claims??[])for(const ref of claim.evidence_refs)if(!sourceIds.has(ref))unsupportedCitations++;rows.push({id:c.id,group:c.group,expected:c.expected,actual:r.finding?.status,passed:r.finding?.status===c.expected,toolActions:r.actions,recaptures:r.recaptures,latencyMs:Math.round(performance.now()-start)});}
 const times=rows.map(r=>r.latencyMs).sort((a,b)=>a-b);
 const report={status:rows.every(r=>r.passed)&&falseSupported===0&&unsupportedCitations===0?'passed':'failed',mode:'deterministic P1 protocol fixtures; real Supabase signed-source snapshot; memory checkpoints (durability tested separately)',sourceRecordCount:dataset.records.length,cases:12,groups:{supported:4,conflicting:4,incomplete:4},falseSupported,unsupportedCitations,maxToolActions:Math.max(...rows.map(r=>r.toolActions)),latency:{p50Ms:times[Math.floor(times.length/2)],minMs:times[0],maxMs:times.at(-1)},providerRequests:0,newProviderSpendUsd:0,rows};
 await writeFile('docs/packproof/evidence/p1b-evaluation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
}finally{await pool.end();}
