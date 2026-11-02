import {it,expect,vi} from 'vitest';
import {coalesceEvidenceReads} from '../../src/server/data/evidence-reads.js';
import {PostgresEvidenceRepository} from '../../src/server/data/evidence-repository.js';
import {createEvidenceServices} from '../../src/server/evidence/services.js';
import {startInvestigation,resumeInvestigation} from '../../src/server/investigator/graph.js';
import {fixture,input} from '../fixtures/investigator-memory.js';

it('shares only simultaneous identical reads and reloads after successful settlement',async()=>{
 let release!:(value:string)=>void;
 const reader=vi.fn(()=>new Promise<string>(resolve=>{release=resolve;}));
 const read=coalesceEvidenceReads(reader);
 const first=read('snapshot'),second=read('snapshot'),third=read('snapshot');
 await vi.waitFor(()=>expect(reader).toHaveBeenCalledTimes(1));release('version-one');
 expect(await Promise.all([first,second,third])).toEqual(['version-one','version-one','version-one']);
 const later=read('snapshot');await vi.waitFor(()=>expect(reader).toHaveBeenCalledTimes(2));release('version-two');
 expect(await later).toBe('version-two');
});

it('does not share different queries or different owner-bound runtime readers',async()=>{
 const reader=vi.fn(async(query:string)=>query);
 const ownerA=coalesceEvidenceReads(reader),ownerB=coalesceEvidenceReads(reader);
 expect(await Promise.all([ownerA('one'),ownerA('two'),ownerB('one')])).toEqual(['one','two','one']);
 expect(reader).toHaveBeenCalledTimes(3);
});

it('clears rejected in-flight reads so a subsequent call can recover',async()=>{
 const failure=new Error('controlled read failure');
 const reader=vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('fresh');
 const read=coalesceEvidenceReads(reader);
 const results=await Promise.allSettled([read('snapshot'),read('snapshot')]);
 expect(results).toEqual([{status:'rejected',reason:failure},{status:'rejected',reason:failure}]);
 expect(reader).toHaveBeenCalledTimes(1);expect(await read('snapshot')).toBe('fresh');expect(reader).toHaveBeenCalledTimes(2);
});

it('keeps independently parsed evidence objects isolated after sharing a database read',async()=>{
 const f=await fixture();const reader=vi.fn(async()=>JSON.stringify(f.dataset));
 const repository=new PostgresEvidenceRepository(coalesceEvidenceReads(reader));
 const [first,second]=await Promise.all([repository.load(),repository.load()]);
 first.records[0]!.sha256='0'.repeat(64);
 expect(second.records[0]!.sha256).toBe(f.dataset.records[0]!.sha256);expect(reader).toHaveBeenCalledTimes(1);
});

it('rechecks changed signed-source and ownership projections on later service calls',async()=>{
 const f=await fixture();const reader=vi.fn(async()=>JSON.stringify(f.dataset));
 const services=createEvidenceServices(new PostgresEvidenceRepository(coalesceEvidenceReads(reader)),f.pin);
 const args={itemId:'10000000-0000-4000-8000-000000000002',sellerId:input().sellerId};
 expect((await services.lookupSeller(args)).status).toBe('supported');
 f.dataset.products.find(p=>p.itemId===args.itemId)!.ownerVersion++;
 expect((await services.lookupSeller(args)).status).toBe('blocked');expect(reader).toHaveBeenCalledTimes(2);
});

it('retains the original session expiry across pause/resume without invoking the planner again',async()=>{
 const f=await fixture();const first=await startInvestigation(f.options,input({packagingMark:null}));
 expect(first.status).toBe('needs_input');
 const invoke=vi.fn(f.options.planner.invoke);
 const resumed=await resumeInvestigation({...f.options,planner:{invoke},timeoutMs:10000,now:()=>Date.now()+20000},first.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:'PK-2002',captureId:null});
 expect(resumed.errorCode).toBe('session_expired');expect(resumed.finding?.status).toBe('unavailable');expect(invoke).not.toHaveBeenCalled();
});
