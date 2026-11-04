import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {p2Fixture} from '../fixtures/transfers.js';
import {verifyReceiptApprovals} from '../../src/domain/identity/transfer-crypto.js';
import {verifyRecordSet} from '../../src/domain/trust/evidence.js';
import {loadSources} from '../../src/server/transfers/authority.js';
it.skipIf(process.env.PACKPROOF_PLATFORM_INTEGRATION!=='1')('manufacturer → distributor → retailer → consumer: same receiving account and key sell onward, three exact-once signed receipts',async()=>{
 process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();
 const started=Date.now();console.info('chain: creating isolated fixture');const f=await p2Fixture();console.info('chain: fixture ready',Date.now()-started);try{
  for(let i=0;i<4;i++)await f.enroll(i);
  const identities=[...f.actors],keyIds=identities.map(a=>f.keys.get(a)!.id),receipts:string[]=[];
  for(let seller=0;seller<3;seller++){console.info('chain: leg',seller+1,'start',Date.now()-started);
   if(seller>0){await expect(f.service.create(f.actors[seller+1]!,crypto.randomUUID(),{itemId:f.itemId,sellerActorId:f.actors[seller]!})).rejects.toThrow('current_authority_snapshot_required');await f.refreshSnapshot(seller);}
   const flow=await f.ready(seller+1,true,seller),idempotency=crypto.randomUUID();
   const committed=await f.service.confirm(flow.buyer,flow.offer.id,idempotency,flow.confirmation.signature);expect(committed.state).toBe('committed');
   expect(await f.service.confirm(flow.buyer,flow.offer.id,idempotency,flow.confirmation.signature)).toEqual(committed);
   const state=await f.service.get(flow.buyer,flow.offer.id);expect(state.receiptStatus).toBe('ready');
   const proof=await f.service.receiptProof(flow.buyer,flow.offer.id),sources=await loadSources(f.pool,f.schema),verified=await verifyRecordSet(sources.records,f.service.pin,proof.serverTime),receipt=verified.verified.get(proof.record.id)!.record;
   if(receipt.type!=='transfer_receipt')throw new Error('receipt_type');
   const agreement=await verifyReceiptApprovals(receipt.data);expect(agreement.sellerActorId).toBe(f.actors[seller]);expect(agreement.buyerActorId).toBe(f.actors[seller+1]);expect(agreement.sellerDeviceKeyId).toBe(keyIds[seller]);expect(agreement.buyerDeviceKeyId).toBe(keyIds[seller+1]);receipts.push(receipt.id);
   const owner=(await f.pool.query(`SELECT registered_owner_id,owner_version FROM ${f.schema}.items WHERE id=$1`,[f.itemId])).rows[0];expect(owner).toEqual({registered_owner_id:flow.buyer,owner_version:seller+2});
   expect(Number((await f.pool.query(`SELECT count(*) FROM ${f.schema}.accepted_transfers WHERE item_id=$1`,[f.itemId])).rows[0].count)).toBe(seller+1);
  }
  console.info('chain: three legs complete',Date.now()-started);expect(new Set(receipts).size).toBe(3);expect(f.actors).toEqual(identities);expect(identities.map(a=>f.keys.get(a)!.id)).toEqual(keyIds);
  for(const id of receipts)expect((await f.pool.query(`SELECT id FROM ${f.schema}.signed_records WHERE id=$1`,[id])).rowCount).toBe(1);
 }finally{await f.close();}
},360000);
