import {readFile} from 'node:fs/promises';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {z} from 'zod';
import {RootPin} from '../../contracts/evidence.js';
import {databasePool} from '../data/postgres.js';
import {PostgresEvidenceRepository} from '../data/evidence-repository.js';
import {coalesceEvidenceReads} from '../data/evidence-reads.js';
import {createEvidenceServices} from '../evidence/services.js';
import {PostgresInvestigationStore} from './store.js';
import {recordedMuse} from '../providers/muse.js';
import {liveMuse} from '../providers/p1-live.js';
import {groundedMeta} from '../providers/grounded-meta.js';
import {HostedBudget,reviewer,reviewPolicy} from '../review/budget.js';
import type {InvestigationInput} from '../../contracts/investigation.js';
import {RecordedGroundingProvider} from '../providers/recorded-grounding.js';
import {GroundedImageInspector} from '../inspector/inspector.js';
import {PostgresInspectionRepository} from '../inspector/repository.js';
import {SupabaseCaptureStorage} from './captures.js';
import {safeTracing,langSmithSender} from '../../../scripts/spikes/safe-tracing.js';
import {localValidation} from '../inspector/local-validation.js';
import type {Owner} from './types.js';
export async function runtime(owner:Owner){
 const live=process.env.REVIEW_LIVE_ENABLED==='1'&&Boolean(process.env.MODEL_API_KEY)&&Boolean(await reviewer(owner.userId));
 const budget=live?new HostedBudget(owner.userId!):null;
 const settings=z.strictObject({timeout:z.coerce.number().int().min(1000).max(3600000),cap:z.coerce.number().int().min(0).max(50)}).parse({timeout:process.env.P1_SESSION_TIMEOUT_MS??600000,cap:process.env.P1_SESSION_CAP_CENTS??50});
 const pool=databasePool(owner);const store=new PostgresInvestigationStore(pool,owner);
 // Simultaneous independent final checks share a current in-flight SQL read.
 // Later calls always reload; each service retains its own signature checks.
 const repository=new PostgresEvidenceRepository(coalesceEvidenceReads(async q=>JSON.stringify((await pool.query(q)).rows[0].json_build_object)));
 const pin=RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
 const enabled=process.env.P1_TRACING==='true'&&Boolean(process.env.LANGSMITH_API_KEY);
 const trace=safeTracing({enabled,...(enabled?{send:langSmithSender(process.env.LANGSMITH_API_KEY!,fetch,'packproof-p1b')}:{})});
 const options={owner,store,services:createEvidenceServices(repository,pin),planner:budget?liveMuse(budget,{apiKey:process.env.MODEL_API_KEY!,evidence:[]}):recordedMuse(),mode:live?'live' as const:'recorded-demo' as const,modelReservationCents:live?5:0,inspector:localValidation()?.inspector(pool)??new GroundedImageInspector(new PostgresInspectionRepository(pool),c=>new SupabaseCaptureStorage().read(c.objectPath),budget?groundedMeta(process.env.MODEL_API_KEY!,budget.image()):new RecordedGroundingProvider()),checkpointer:new PostgresSaver(pool,undefined,{schema:'packproof_graph'}),trace,timeoutMs:settings.timeout,capCents:settings.cap};
 return {pool,store,options:{...options,...(live?{freshnessPolicy:(input:InvestigationInput)=>reviewPolicy(owner.userId!,input)}:{})},close:()=>pool.end()};
}
