import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {databasePool} from '../../src/server/data/postgres.js';
import {loadSources,checkAuthority} from '../../src/server/transfers/authority.js';
import {validateDataset} from '../../src/server/evidence/services.js';
import {TransferDatabase} from '../../src/server/transfers/database.js';
import {DEMO} from '../p1/demo.js';
const saved=JSON.parse(await readFile('docs/packproof/demo/signed-demo.json','utf8'));
const pool=databasePool();
try{
 const data=await loadSources(pool,'packproof');await validateDataset(data,saved.root,new Date().toISOString());
 for(const original of saved.dataset.records){const current=data.records.find(r=>r.id===original.id);if(!current||current.jws!==original.jws||current.sha256!==original.sha256)throw new Error('Original signed evidence changed');}
 for(const original of saved.dataset.products){const current=data.products.find(p=>p.itemId===original.itemId);if(JSON.stringify(current)!==JSON.stringify(original))throw new Error('Original demo projection changed');}
 const authorization=await new TransferDatabase(pool).transaction(DEMO.shopB,c=>checkAuthority(c,'packproof',saved.root,DEMO.item2,DEMO.shopB,new Date().toISOString()));
 const accepted=(await pool.query('SELECT count(*)::int n FROM packproof.accepted_transfers')).rows[0].n;if(accepted!==0)throw new Error('Automated checks consumed a real demo unit');
 const hashes:Record<string,string>={};for(const path of ['.local/provider-budget.json','.local/p1c/budget.json','.local/p1c-completion-2026-11-02/budget.json','.local/p1c-repair-2026-11-02/budget.json','pnpm-lock.yaml','docs/packproof/demo/signed-demo.json','docs/packproof/demo/root-public.json'])hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 const previous=JSON.parse(await readFile('.local/p2/baseline-state.json','utf8')),current=JSON.parse(await readFile('project_handoff/BUILD_STATE.json','utf8'));
 // The user now explicitly requests the previously deferred physical checks.
 // Allow only that availability/deferral metadata; preserve every measured result.
 const p0=(state:any)=>{const phase=structuredClone(state.phases.find((p:any)=>p.id==='P0'));delete phase.manualChecks.secondPhoneAvailableUserReported;delete phase.manualChecks.twoPhoneTestingDeferredByUser;delete phase.subchecks.F3.secondPhone;for(const gate of ['F3','F4']){delete phase.acceptance[gate].reason;for(const value of Object.values(phase.subchecks[gate]) as any[])delete value.deferredByUser;}return phase;};
 if(JSON.stringify(p0(previous))!==JSON.stringify(p0(current))||JSON.stringify(previous.phases.find((p:any)=>p.id==='P1'))!==JSON.stringify(current.phases.find((p:any)=>p.id==='P1')))throw new Error('P0/P1 acceptance changed');
 const result={status:'passed',mainShopBReadOnlyAuthorization:{status:'passed',mode:'operator database source verification; not a completed transfer or phone test',ownerVersion:authorization.item.owner_version,snapshotId:authorization.snapshot.id,evidenceRefs:authorization.refs},originalSignedRecordsUnchanged:saved.dataset.records.length,originalUnitProjectionsUnchanged:saved.dataset.products.length,appendedSignedRecords:data.records.length-saved.dataset.records.length,realAcceptedTransfers:accepted,shopBOwnerVersion:data.products.find(p=>p.itemId===DEMO.item2)?.ownerVersion,protectedHashes:hashes,p0AndP1AcceptancePreserved:true,p0AvailabilityMetadataUpdatedByUser:current.phases.find((p:any)=>p.id==='P0').manualChecks.secondPhoneAvailableUserReported===true,providerRequests:0};await writeFile('docs/packproof/evidence/p2-preservation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,protectedHashes:'recorded; no values/secrets logged'}));
}finally{await pool.end();}
