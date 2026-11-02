import {describe,it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation,resumeInvestigation,publicView,investigatorGraph,initialState} from '../../src/server/investigator/graph.js';
import {failFirstCycle} from '../fixtures/checkpoint-failure.js';
import {recordedMuse} from '../../src/server/providers/muse.js';
import {databasePool} from '../../src/server/data/postgres.js';
import {saveCapture,SupabaseCaptureStorage} from '../../src/server/investigator/captures.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
import {input} from '../fixtures/investigator-memory.js';
const live=process.env.PACKPROOF_P1B_INTEGRATION==='1';
const owner=async()=>({sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null});
const checks:Record<string,unknown>={phase:'P1B',projectRef:'hvbzxeuedookkwleyjmx',mode:'actual Supabase + deterministic recorded model transport',providerRequests:0};
const record=async(key:string)=>{checks[key]='passed';await writeFile('docs/packproof/evidence/p1b-integration-checks.json',JSON.stringify(checks,null,2)+'\n');};
describe.skipIf(!live)('P1B actual Supabase and durable graph integration',()=>{
 it('keeps all action, recapture, retry and model limits in the one-call database reservation',async()=>{
  const who=await owner();const r=await runtime(who);
  try{
   const result=await r.options.services.lookupProduct({namespace:input().namespace,productMark:input().productMark,packagingMark:input().packagingMark});
   for(const spec of [{kind:'tool',limit:8,error:'action_limit',recapture:false},{kind:'tool',limit:3,error:'recapture_limit',recapture:true},{kind:'retry',limit:2,error:'retry_limit',recapture:false},{kind:'model',limit:12,error:'model_limit',recapture:false}] as const){
    const row=await r.store.create(who,input());let calls=0;const effect=async()=>{calls++;return result;};
    for(let n=0;n<spec.limit;n++)await r.store.operation(who,row.id,`limit:${n}`,{name:'lookup_product'},spec.kind,effect,{recapture:spec.recapture});
    await expect(r.store.operation(who,row.id,'limit:overflow',{name:'lookup_product'},spec.kind,effect,{recapture:spec.recapture})).rejects.toThrow(spec.error);
    expect(calls).toBe(spec.limit);
    const count=await r.pool.query('SELECT count(*)::int AS n FROM packproof.investigation_operations WHERE investigation_id=$1',[row.id]);expect(count.rows[0].n).toBe(spec.limit);
   }
   await record('databaseActionRecaptureRetryModelLimits');
  }finally{await r.close();}
 },60000);
 it('sees a preceding reservation after concurrent callers wait for the same row lock',async()=>{
  const who=await owner();const r=await runtime(who);
  try{
   const row=await r.store.create(who,input());const clients=await Promise.all([r.pool.connect(),r.pool.connect(),r.pool.connect()]);const [lock,a,b]=clients;
   try{
    await lock!.query('BEGIN');await lock!.query('SELECT id FROM packproof.investigations WHERE id=$1 FOR UPDATE',[row.id]);
    const query='SELECT packproof.reserve_investigation_operation($1,$2,$3,$4,$5,$6,$7) AS reservation';const values=[row.id,'locked-operation','a'.repeat(64),'model',false,5,10];
    const results=Promise.allSettled([a!.query(query,values),b!.query(query,values)]);
    await lock!.query('COMMIT');const settled=await results;
    const success=settled.filter(v=>v.status==='fulfilled');const failed=settled.filter(v=>v.status==='rejected');
    expect(success).toHaveLength(1);expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatchObject({code:'P0001',message:'operation_in_doubt'});
   }finally{await lock!.query('ROLLBACK');clients.forEach(c=>c.release());}
   const counts=await r.pool.query('SELECT reserved_cents,model_requests FROM packproof.investigations WHERE id=$1',[row.id]);expect(counts.rows[0]).toEqual({reserved_cents:5,model_requests:1});
   const other=await runtime(await owner());try{await expect(other.store.operation(other.options.owner,row.id,'foreign',{},'model',async()=>({ok:true}))).rejects.toThrow('not_found');}finally{await other.close();}
   await record('concurrentRowLockFreshSnapshotAndForeignReservationDenied');
  }finally{await r.close();}
 },30000);
 it('recovers a lost cycle checkpoint from Postgres without repeating completed model or tool effects',async()=>{
  const who=await owner();let r=await runtime(who);let id:string;let calls=0;
  const delegate=recordedMuse();const planner={invoke:async(...args:Parameters<typeof delegate.invoke>)=>{calls++;return delegate.invoke(...args);}};
  try{
   const row=await r.store.create(who,input());id=row.id;
   const config={configurable:{thread_id:id},durability:'sync' as const,recursionLimit:64};
   await expect(investigatorGraph({...r.options,planner,checkpointer:failFirstCycle(r.options.checkpointer)}).invoke({value:initialState(row)},config)).rejects.toThrow('injected_checkpoint_loss');
   expect(calls).toBe(1);expect((await r.store.get(who,id)).actions).toBe(1);
  }finally{await r.close();}
  r=await runtime(who);
  try{
   await investigatorGraph({...r.options,planner}).invoke(null,{configurable:{thread_id:id!},durability:'sync',recursionLimit:64});
   const result=await publicView(r.store,who,id!);
   expect(result.finding?.status).toBe('supported');expect(calls).toBe(5);expect(result.actions).toBe(4);
   expect(result.trace.filter(t=>t.source==='model_tool')).toHaveLength(4);expect(result.trace.filter(t=>t.source==='mandatory_finalizer')).toHaveLength(4);
   await record('lostCycleCheckpointRestoredWithoutRepeatedEffects');
  }finally{await r.close();}
 },90000);
 it('rolls back tool completion if its event cannot be saved and denies foreign audit writes',async()=>{
  const who=await owner(),foreign=await owner();const r=await runtime(who),other=await runtime(foreign);
  try{
   const row=await r.store.create(who,input());const result=await r.options.services.lookupProduct({namespace:input().namespace,productMark:input().productMark,packagingMark:input().packagingMark});
   await expect(r.store.operation(who,row.id,'invalid-event',{name:'lookup_product'},'tool',async()=>({...result,evidence_refs:['invalid-uuid']}))).rejects.toThrow();
   const op=await r.pool.query('SELECT status,result FROM packproof.investigation_operations WHERE investigation_id=$1 AND operation_key=$2',[row.id,'invalid-event']);
   expect(op.rows[0]).toEqual({status:'failed',result:null});expect(await r.store.events(who,row.id)).toHaveLength(0);
   await expect(other.store.audit(foreign,row.id,'lookup_product',result,'foreign-audit')).rejects.toThrow('not_found');
   await r.store.audit(who,row.id,'lookup_product',result,'own-audit');await r.store.audit(who,row.id,'lookup_product',result,'own-audit');
   expect(await r.store.events(who,row.id)).toHaveLength(1);
   await record('atomicToolResultEventRollbackAndPrivateAudit');
  }finally{await r.close();await other.close();}
 },60000);
 it('keeps atomic reservations, budgets and private updates correct under concurrent operation replay',async()=>{
  const who=await owner(),foreign=await owner();const r=await runtime(who),other=await runtime(foreign);
  let release!:()=>void;let entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});
  try{
   const row=await r.store.create(who,input());let calls=0;
   const effect=async()=>{calls++;entered();await gate;return {ok:true};};
   const pending=r.store.operation(who,row.id,'concurrent-model',{},'model',effect,{reservationCents:20,sessionCapCents:20});
   // Observe settlement immediately so an unexpected database failure cannot
   // become an unhandled rejection while the synchronization gate is pending.
   const settled=pending.then(value=>({value}),error=>({error}));
   await Promise.race([started,settled.then(result=>{if('error'in result)throw result.error;})]);
   try{
    await expect(r.store.operation(who,row.id,'concurrent-model',{},'model',effect,{reservationCents:20,sessionCapCents:20})).rejects.toThrow('operation_in_doubt');
   }finally{release();}
   expect(await pending).toEqual({ok:true});
   expect(await r.store.operation(who,row.id,'concurrent-model',{},'model',effect,{reservationCents:20,sessionCapCents:20})).toEqual({ok:true});
   await expect(r.store.operation(who,row.id,'concurrent-model',{changed:true},'model',effect)).rejects.toThrow('idempotency_conflict');
   await expect(r.store.operation(who,row.id,'over-budget',{},'model',effect,{reservationCents:1,sessionCapCents:20})).rejects.toThrow('budget_exhausted');
   expect(calls).toBe(1);
   const counters=await r.pool.query('SELECT reserved_cents,model_requests FROM packproof.investigations WHERE id=$1',[row.id]);
   expect(counters.rows[0]).toEqual({reserved_cents:20,model_requests:1});
   await expect(other.store.save(foreign,row.id,{status:'complete'})).rejects.toThrow('not_found');
   await expect(r.store.save(who,crypto.randomUUID(),{status:'complete'})).rejects.toThrow('not_found');
   await r.store.save(who,row.id,{status:'running'});expect((await r.store.get(who,row.id)).status).toBe('running');
   await record('atomicReservationsConcurrentReplayBudgetAndPrivateUpdates');
  }finally{release();await r.close();await other.close();}
 },60000);
 it('runs six-tool controller against signed database records and restores a pause after all pools are closed',async()=>{
  const who=await owner();let r=await runtime(who);let id:string;
  try{const initial=await startInvestigation(r.options,input({packagingMark:null}));id=initial.id;expect(initial.status).toBe('needs_input');expect(initial.finding?.status).toBe('needs_evidence');expect(initial.actions).toBe(5);}finally{await r.close();}
  // New runtime, new connection pool, new graph and checkpointer: only Postgres retains state.
  r=await runtime(who);
  const args={expectedRevision:1,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:'PK-2002',captureId:null};
  try{const restored=await publicView(r.store,who,id!);expect(restored.status).toBe('needs_input');const final=await resumeInvestigation(r.options,id!,args);expect(final.revision).toBe(2);expect(final.actions).toBe(6);expect(final.finding?.status).toBe('supported');const repeat=await resumeInvestigation(r.options,id!,args);expect(repeat.actions).toBe(final.actions);await expect(resumeInvestigation(r.options,id!,{...args,packagingMark:'PK-2001'})).rejects.toThrow('idempotency_conflict');await record('postgresCheckpointRestartAndResumeIdempotency');}finally{await r.close();}
 },180000);
 it('enforces private-session RLS on investigations, checkpoints, operations and captures',async()=>{
  const a=await owner(),b=await owner();const first=await runtime(a),second=await runtime(b);
  try{const created=await startInvestigation(first.options,input({packagingMark:null}));await expect(second.store.get(b,created.id)).rejects.toThrow('not_found');const saver=new PostgresSaver(second.pool,undefined,{schema:'packproof_graph'});expect(await saver.getTuple({configurable:{thread_id:created.id}})).toBeUndefined();const records=await second.pool.query('SELECT * FROM packproof.investigation_operations WHERE investigation_id=$1',[created.id]);expect(records.rows).toHaveLength(0);await expect(second.pool.query('INSERT INTO packproof.captures(id,investigation_id,revision,sha256,mime,width,height,bytes,source,object_path) VALUES($1,$2,1,$3,$4,1,1,20,$5,$6)',[crypto.randomUUID(),created.id,'0'.repeat(64),'image/png','imported','forbidden'])).rejects.toThrow();await expect(first.pool.query("UPDATE packproof.items SET owner_version=owner_version+1")).rejects.toThrow();await expect(first.pool.query('DELETE FROM packproof.signed_records')).rejects.toThrow();await record('sessionRlsCheckpointIsolationAndNoOwnershipWrites');}finally{await first.close();await second.close();}
 },180000);
 it('uploads a bounded controlled image to actual private Storage and rejects a foreign capture',async()=>{
  const who=await owner();const r=await runtime(who);const storage=new SupabaseCaptureStorage();let path:string|null=null;
  try{const paused=await startInvestigation(r.options,input({context:'physical'}));expect(paused.status).toBe('needs_input');const bytes=new Uint8Array(await readFile('docs/packproof/evidence/sam/original-demo.png'));const cap=await saveCapture(r.store,who,storage,{investigationId:paused.id,revision:paused.revision,mime:'image/png',bytes,source:'imported',capturedAt:null});const stored=await r.store.capture(who,paused.id,cap.id);path=stored.objectPath;expect(stored.sha256).toBe(await sha256(bytes));const anon=await fetch(new URL('/storage/v1/object/authenticated/packproof-p0-private/'+path,process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY!},redirect:'error',signal:AbortSignal.timeout(10000)});expect(anon.status).not.toBe(200);const other=await runtime(await owner());try{await expect(other.store.capture(other.options.owner,paused.id,cap.id)).rejects.toThrow('not_found');}finally{await other.close();}const resumed=await resumeInvestigation(r.options,paused.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:null,captureId:cap.id});expect(resumed.finding?.physicalStatus).toBe('unresolved');expect(resumed.finding?.status).toBe('blocked');expect(resumed.trace.some(t=>t.tool==='inspect_product_image')).toBe(true);await record('actualPrivateStorageCaptureAndParserReplay');}finally{if(path)await storage.remove(path);await r.close();}
 },180000);
});
