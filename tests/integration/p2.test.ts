import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {p2Fixture,type P2Fixture} from '../fixtures/transfers.js';
import {TransferService} from '../../src/server/transfers/service.js';
import {signAction} from '../../src/domain/identity/transfer-crypto.js';
import {Cancel,Consent} from '../../src/contracts/transfer.js';
import {DEMO} from '../../scripts/p1/demo.js';
import {verifyReceiptApprovals} from '../../src/domain/identity/transfer-crypto.js';
import {verifyRecordSet} from '../../src/domain/trust/evidence.js';
import {loadSources} from '../../src/server/transfers/authority.js';
import {createEvidenceServices} from '../../src/server/evidence/services.js';
const live=process.env.PACKPROOF_P2_INTEGRATION==='1';
async function fixture(fn:(f:P2Fixture)=>Promise<void>){const f=await p2Fixture();try{await f.enroll(0);await f.enroll(1);await f.enroll(2);await fn(f);}finally{await f.close();}}
describe.skipIf(!live)('P2 isolated actual Supabase transactions and protocol',()=>{
 it('T1/T4: Shop A blocked; Shop B commits once, recovers a receipt-signing failure and lost response, and preserves P1 reads',()=>fixture(async f=>{
  await expect(f.service.create(f.actors[1]!,randomUUID(),{itemId:DEMO.item1,sellerActorId:DEMO.shopA})).rejects.toThrow('seller_not_authorized');
  const flow=await f.ready(1,true),key=randomUUID(),result=await f.service.confirm(flow.buyer,flow.offer.id,key,flow.confirmation.signature);
  expect(result.state).toBe('committed');
  const owner=async()=>(await f.pool.query(`SELECT registered_owner_id,owner_version FROM ${f.schema}.items WHERE id=$1`,[f.itemId])).rows[0];
  expect(await owner()).toEqual({registered_owner_id:flow.buyer,owner_version:2});
  // Deliberate signing-boundary failure, AFTER the ownership transaction.
  const broken=new TransferService(f.db,f.service.pin,{...f.signer,keyId:randomUUID()});expect(await broken.receipt(flow.buyer,flow.offer.id)).toBe(false);
  const preparing=await new TransferService(f.db,f.service.pin,null).get(flow.buyer,flow.offer.id);expect(preparing.state).toBe('committed');expect(preparing.receiptStatus).toBe('failed');expect(preparing.receipt).toBe(null);
  expect(await f.service.confirm(flow.buyer,flow.offer.id,key,flow.confirmation.signature)).toEqual(result);
  await expect(f.service.confirm(flow.buyer,flow.offer.id,key,flow.confirmation.signature+'a')).rejects.toThrow('idempotency_payload_mismatch');
  await expect(f.service.confirm(flow.buyer,flow.offer.id,randomUUID(),flow.confirmation.signature)).rejects.toThrow('already_committed');
  await f.pool.query(`UPDATE ${f.schema}.receipt_outbox SET next_attempt_at=clock_timestamp() WHERE transfer_id=$1`,[flow.offer.id]);
  const recovered=await f.service.get(flow.buyer,flow.offer.id);expect(recovered.receiptStatus).toBe('ready');expect(recovered.receipt).toBeTruthy();
  const [sellerAccount,buyerAccount,otherAccount]=await Promise.all([f.service.account(f.actors[0]!),f.service.account(flow.buyer),f.service.account(f.actors[2]!)]);
  expect(sellerAccount.kind).toBe('shop');expect(buyerAccount.kind).toBe('consumer');
  expect(sellerAccount.recentTransferId).toBe(flow.offer.id);expect(buyerAccount.recentTransferId).toBe(flow.offer.id);expect(otherAccount.recentTransferId).toBe(null);
  expect(sellerAccount.device?.id).toBe(f.keys.get(f.actors[0]!)!.id);expect(buyerAccount.device?.id).toBe(f.keys.get(flow.buyer)!.id);

  const proof=await f.service.receiptProof(flow.buyer,flow.offer.id),data=await f.db.transaction(flow.buyer,c=>loadSources(c,f.schema)),verified=await verifyRecordSet(data.records,f.service.pin,new Date().toISOString());const receipt=verified.verified.get(proof.record.id)!.record;
  expect(receipt.type).toBe('transfer_receipt');if(receipt.type!=='transfer_receipt')throw new Error('receipt');await verifyReceiptApprovals(receipt.data);
  const services=createEvidenceServices({load:async()=>data},f.service.pin);expect((await services.lookupProduct({namespace:'packproof-demo',productMark:f.unitMark,packagingMark:f.packMark})).data?.mappingStatus).toBe('matched');
  expect((await services.lookupSeller({itemId:f.itemId,sellerId:DEMO.shopB})).data?.authorized).toBe(false);
  expect((await f.pool.query(`SELECT count(*)::int n FROM ${f.schema}.accepted_transfers WHERE item_id=$1`,[f.itemId])).rows[0].n).toBe(1);expect((await owner()).owner_version).toBe(2);
 }),240000);
 it('T2/S1: wrong-direction, duplicate/nonconsecutive, replayed frames, foreign actions, wrong device signatures and revoked keys fail',()=>fixture(async f=>{
  const offer=await f.create(),batch=await f.frames(offer.id,'buyer-to-seller'),handles=batch.frames.slice(0,3).map(f=>f.handle);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(batch.frames[3]!.issuedAt)+30-Date.now())));
  await expect(f.service.scan(f.actors[1]!,offer.id,randomUUID(),handles)).rejects.toThrow('wrong_direction');
  await expect(f.service.scan(f.actors[0]!,offer.id,randomUUID(),[handles[0]!,handles[0]!,handles[1]!])).rejects.toThrow('three_distinct');
  await expect(f.service.scan(f.actors[0]!,offer.id,randomUUID(),[batch.frames[0]!.handle,batch.frames[2]!.handle,batch.frames[3]!.handle])).rejects.toThrow('invalid_scan_sequence');
  const index=Math.max(0,Math.min(batch.frames.length-3,Math.floor((Date.now()-Date.parse(batch.frames[0]!.issuedAt))/200)-2));const validHandles=batch.frames.slice(index,index+3).map(r=>r.handle);
  const scanKey=randomUUID(),scan=await f.service.scan(f.actors[0]!,offer.id,scanKey,validHandles);expect((await f.service.scan(f.actors[0]!,offer.id,scanKey,validHandles)).consent).toEqual(scan.consent);
  await expect(f.service.scan(f.actors[0]!,offer.id,randomUUID(),validHandles)).rejects.toThrow();
  await expect(f.service.get(f.actors[2]!,offer.id)).rejects.toThrow('transfer_not_found');
  await expect(f.service.approve(f.actors[1]!,offer.id,randomUUID(),await signAction(scan.consent,f.keys.get(f.actors[1]!)!.privateKey))).rejects.toThrow('seller_only');
  await expect(f.service.approve(f.actors[0]!,offer.id,randomUUID(),await signAction(scan.consent,f.keys.get(f.actors[1]!)!.privateKey))).rejects.toThrow();
  await expect(f.pool.query(`UPDATE ${f.schema}.transfer_sessions SET agreement_payload=replace(agreement_payload,$2,$3) WHERE id=$1`,[offer.id,f.itemId,DEMO.item1])).rejects.toThrow('immutable_agreement');
  await f.service.revoke(f.actors[0]!,randomUUID());expect((await f.service.get(f.actors[1]!,offer.id)).state).toBe('blocked');
  await expect(f.service.approve(f.actors[0]!,offer.id,randomUUID(),await signAction(scan.consent,f.keys.get(f.actors[0]!)!.privateKey))).rejects.toThrow();
 }),240000);
 it('T3: two concurrent buyers cannot both acquire the same registered unit',()=>fixture(async f=>{
  // Prepare both agreements before either ownership transaction; sign all real frames and consents.
  const prepared=await Promise.allSettled([f.ready(1),f.ready(2)]);const failure=prepared.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;const [a,b]=prepared.map(r=>{if(r.status==='rejected')throw r.reason;return r.value;}) as [Awaited<ReturnType<typeof f.ready>>,Awaited<ReturnType<typeof f.ready>>];
  expect(Date.parse(a.confirmation.consent.expiresAt)).toBeGreaterThan(Date.now());expect(Date.parse(b.confirmation.consent.expiresAt)).toBeGreaterThan(Date.now());
  const results=await Promise.allSettled([f.service.confirm(a.buyer,a.offer.id,randomUUID(),a.confirmation.signature),f.service.confirm(b.buyer,b.offer.id,randomUUID(),b.confirmation.signature)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);const rejected=results.find(r=>r.status==='rejected');if(rejected?.status==='rejected')expect(rejected.reason.message).toBe('ownership_conflict');
  const row=(await f.pool.query(`SELECT owner_version FROM ${f.schema}.items WHERE id=$1`,[f.itemId])).rows[0];expect(row.owner_version).toBe(2);
  expect((await f.pool.query(`SELECT count(*)::int n FROM ${f.schema}.accepted_transfers WHERE item_id=$1`,[f.itemId])).rows[0].n).toBe(1);
 }),240000);
 it('T2: expiry, mismatched enrollment account and stale evidence fail; browser/database clients cannot execute privileged commits',()=>fixture(async f=>{
  const challenge=(await f.service.enrollment(f.actors[1]!,f.userIds[1]!,randomUUID())).challenge;
  const d=f.keys.get(f.actors[1]!)!;
  await expect(f.service.enroll(f.actors[1]!,f.userIds[2]!,randomUUID(),{challengeId:challenge.challengeId,publicKey:d.publicKey,signature:await signAction(challenge,d.privateKey)})).rejects.toThrow('invalid_enrollment_challenge');
  const offer=await f.create(),batch=await f.frames(offer.id,'buyer-to-seller');
  await f.pool.query(`UPDATE ${f.schema}.transfer_frames SET expires_at=not_before+interval '1 millisecond' WHERE transfer_id=$1`,[offer.id]);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(batch.frames[2]!.issuedAt)+20-Date.now())));
  await expect(f.service.scan(f.actors[0]!,offer.id,randomUUID(),batch.frames.slice(0,3).map(r=>r.handle))).rejects.toThrow('invalid_scan_sequence');
  for(const role of ['anon','authenticated','service_role']){
   const c=await f.pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);await expect(c.query(`SELECT ${f.schema}.commit_transfer($1,$2,$3)`,[offer.id,randomUUID(),{}])).rejects.toThrow();await c.query('ROLLBACK');}finally{c.release();}
  }
  // There is no usable current snapshot for item1; even its actual holder cannot use stale public evidence.
  await expect(f.service.create(f.actors[1]!,randomUUID(),{itemId:DEMO.item1,sellerActorId:DEMO.holderOne})).rejects.toThrow('current_authority_snapshot_required');
 }),240000);
 it('requires a configured receipt signer, rejects expired consent and authenticates signed cancellation',async()=>{
  const f=await p2Fixture();try{
   await f.enroll(0);await f.enroll(1);const offer=await f.create();
   const noSigner=new TransferService(f.db,f.service.pin,null);
   await expect(noSigner.confirm(f.actors[1]!,offer.id,randomUUID(),'not-a-signature')).rejects.toThrow('receipt_signer_unavailable');
   const scan=await f.scan(offer.id,'buyer-to-seller');
   const expired=Consent.parse({...scan.consent,issuedAt:new Date(Date.now()-40000).toISOString(),expiresAt:new Date(Date.now()-10000).toISOString()});
   // Controlled expired challenge in the disposable schema only; no signed source record is altered.
   await f.pool.query(`UPDATE ${f.schema}.transfer_challenges SET payload=$2,expires_at=$3 WHERE id=$1`,[expired.challengeId,JSON.stringify(expired),expired.expiresAt]);
   await expect(f.service.approve(f.actors[0]!,offer.id,randomUUID(),await signAction(expired,f.keys.get(f.actors[0]!)!.privateKey))).rejects.toThrow('consent_expired_or_mismatched');
   const cancellation=Cancel.parse({kind:'transfer-cancel',transferId:offer.id,agreementHash:offer.agreementHash,actorId:f.actors[1],keyId:offer.agreement.buyerDeviceKeyId,reason:'cancelled',policyVersion:offer.agreement.policyVersion,expiresAt:offer.agreement.expiresAt});
   await expect(f.service.cancel(f.actors[1]!,offer.id,randomUUID(),'cancelled',await signAction(cancellation,f.keys.get(f.actors[0]!)!.privateKey))).rejects.toThrow();
   const key=randomUUID(),signature=await signAction(cancellation,f.keys.get(f.actors[1]!)!.privateKey);
   expect((await f.service.cancel(f.actors[1]!,offer.id,key,'cancelled',signature)).state).toBe('cancelled');
   expect((await f.service.cancel(f.actors[1]!,offer.id,key,'cancelled',signature)).state).toBe('cancelled');
   expect((await f.service.get(f.actors[1]!,offer.id)).state).toBe('cancelled');
   expect((await f.pool.query(`SELECT owner_version FROM ${f.schema}.items WHERE id=$1`,[f.itemId])).rows[0].owner_version).toBe(1);
   expect((await f.pool.query(`SELECT count(*)::int n FROM ${f.schema}.accepted_transfers`)).rows[0].n).toBe(0);
  }finally{await f.close();}
 },180000);

});
