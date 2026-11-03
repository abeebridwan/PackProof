import {readFile} from 'node:fs/promises';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {z} from 'zod';
import {RootPin} from '../../contracts/evidence.js';
import {databasePool} from '../data/postgres.js';
import {PostgresEvidenceRepository} from '../data/evidence-repository.js';
import {coalesceEvidenceReads} from '../data/evidence-reads.js';
import {createEvidenceServices} from '../evidence/services.js';
import {PostgresInvestigationStore} from './store.js';
import {recordedMuse,liveMuseDisabled} from '../providers/muse.js';
import {RecordedGroundingProvider} from '../providers/recorded-grounding.js';
import {GroundedImageInspector} from '../inspector/inspector.js';
import {PostgresInspectionRepository} from '../inspector/repository.js';
import {SupabaseCaptureStorage} from './captures.js';
import {safeTracing,langSmithSender} from '../../../scripts/spikes/safe-tracing.js';
import {localValidation} from '../inspector/local-validation.js';
import type {Owner} from './types.js';
export async function runtime(owner:Owner){
 if(process.env.P1_PROVIDER_MODE && process.env.P1_PROVIDER_MODE!=='recorded-demo')liveMuseDisabled();
 const settings=z.strictObject({timeout:z.coerce.number().int().min(1000).max(3600000),cap:z.coerce.number().int().min(0).max(50)}).parse({timeout:process.env.P1_SESSION_TIMEOUT_MS??600000,cap:process.env.P1_SESSION_CAP_CENTS??50});
 const pool=databasePool(owner);const store=new PostgresInvestigationStore(pool,owner);
 // Simultaneous independent final checks share a current in-flight SQL read.
 // Later calls always reload; each service retains its own signature checks.
 const repository=new PostgresEvidenceRepository(coalesceEvidenceReads(async q=>JSON.stringify((await pool.query(q)).rows[0].json_build_object)));
 const pin=RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
 const enabled=process.env.P1_TRACING==='true'&&Boolean(process.env.LANGSMITH_API_KEY);
 const trace=safeTracing({enabled,...(enabled?{send:langSmithSender(process.env.LANGSMITH_API_KEY!,fetch,'packproof-p1b')}:{})});
 const options={owner,store,services:createEvidenceServices(repository,pin),planner:recordedMuse(),inspector:localValidation()?.inspector(pool)??new GroundedImageInspector(new PostgresInspectionRepository(pool),c=>new SupabaseCaptureStorage().read(c.objectPath),new RecordedGroundingProvider()),checkpointer:new PostgresSaver(pool,undefined,{schema:'packproof_graph'}),trace,timeoutMs:settings.timeout,capCents:settings.cap};
 return {pool,store,options,close:()=>pool.end()};
}
