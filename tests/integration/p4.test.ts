import {describe,it,expect,afterAll} from 'vitest';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPack,packBootstrap,packPool} from '../../src/server/offline/service.js';
import {rootPin} from '../../src/server/transfers/authority.js';
import {bootstrapTrust,verifyPack,stagePack,payload} from '../../src/offline/verify.js';
import {utf8} from '../../src/domain/verification/p0-crypto.js';
import {DEMO} from '../../scripts/p1/demo.js';
describe.skipIf(process.env.PACKPROOF_P4_INTEGRATION!=='1')('P4 actual Supabase signed public export',()=>{
 afterAll(async()=>{await packPool().end();});
 it('exports only public selected evidence, verifies current buyer projection without private IDs, and increments scoped sequences',async()=>{
  const accounts=JSON.parse(await readFile('.local/p2/demo-accounts.json','utf8')),buyer=accounts.find((a:any)=>a.role==='buyer'),secret=await readFile('.local/p4/pack-key.json','utf8'),pin=await rootPin(),before=(await packPool().query('SELECT owner_version,owner_record_id,registered_owner_id,(SELECT count(*) FROM packproof.accepted_transfers) AS accepted FROM packproof.items WHERE id=$1',[DEMO.item2])).rows[0];
  const bootstrap=await packBootstrap(),state=await bootstrapTrust(bootstrap,pin,null,Date.now()),a=await createPack({itemIds:[DEMO.item2]},buyer.userId,secret),b=await createPack({itemIds:[DEMO.item2]},buyer.userId,secret),gap=await createPack({itemIds:[DEMO.gapItem]},buyer.userId,secret);
  const timing=performance.now(),v=await verifyPack(utf8(JSON.stringify(a.pack)),pin,state.trust),verifyMs=performance.now()-timing;
  expect((payload(b.pack.manifestJws) as any).sequence).toBe((payload(a.pack.manifestJws) as any).sequence+1);
  const signed=v.records.map(v=>v.record),snapshot=signed.find(r=>r.type==='custody_snapshot');expect(snapshot?.revision).toBe(2);expect(signed.some(r=>r.type==='notice')).toBe(true);expect(signed.some(r=>r.type==='transfer_receipt'||r.visibility!=='public')).toBe(false);
  const decoded=JSON.stringify([payload(a.pack.manifestJws),...a.pack.records.map(r=>payload(r.jws))]);for(const value of [buyer.userId,buyer.actorId,before.owner_record_id,buyer.email,buyer.password])expect(decoded).not.toContain(value);
  expect(decoded).not.toMatch(/agreementPayload|signatureJws|deviceKeyId|objectPath|access_token|"d":/);expect(a.pack.media).toHaveLength(0);expect(a.bytes).toBeLessThan(250000);
  const vg=await verifyPack(utf8(JSON.stringify(gap.pack)),pin,state.trust);expect(vg.records.some(v=>v.record.type==='gap')).toBe(true);
  const accepted=(await stagePack(utf8(JSON.stringify(b.pack)),pin,state)).state;await expect(stagePack(utf8(JSON.stringify(a.pack)),pin,accepted)).rejects.toThrow('rollback');
  const after=(await packPool().query('SELECT owner_version,owner_record_id,registered_owner_id,(SELECT count(*) FROM packproof.accepted_transfers) AS accepted FROM packproof.items WHERE id=$1',[DEMO.item2])).rows[0];expect(after).toEqual(before);
  for(const role of ['anon','authenticated','packproof_pack']){const c=await packPool().connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);if(role!=='packproof_pack')await expect(c.query('SELECT * FROM packproof.offline_exports')).rejects.toThrow();else await expect(c.query('UPDATE packproof.items SET owner_version=owner_version+1 WHERE id=$1',[DEMO.item2])).rejects.toThrow();await c.query('ROLLBACK');}finally{c.release();}}
  await mkdir('.local/p4',{recursive:true,mode:0o700});for(const [name,value] of Object.entries({bootstrap,a:a.pack,b:b.pack,gap:gap.pack}))await writeFile(`.local/p4/${name}.json`,JSON.stringify(value)+'\n',{mode:0o600});
  const evidence={status:'passed',conditions:'Actual Supabase TLS; public export role; full restricted owner chain verified internally; no ownership writes',packs:[{kind:'FP-1002 first',bytes:a.bytes,creationMs:a.creationMs},{kind:'FP-1002 next',bytes:b.bytes,creationMs:b.creationMs},{kind:'history gap',bytes:gap.bytes,creationMs:gap.creationMs}],verifyMs,registeredOwnerVersion:snapshot?.revision,privateReceiptOrCurrentAccountIdentifiersExported:false,anonymousReadDenied:true,sourceOwnershipWritesDenied:true,sourceOwnerAndReceiptUnchanged:true,providerRequests:0};await writeFile('docs/packproof/evidence/p4-integration.json',JSON.stringify(evidence,null,2)+'\n');
 },120000);
});
