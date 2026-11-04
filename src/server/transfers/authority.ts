import {readFile} from 'node:fs/promises';
import {RootPin,type Dataset,type EvidenceRecord} from '../../contracts/evidence.js';
import {verifyRecordSet} from '../../domain/trust/evidence.js';
import {DATASET_QUERY} from '../data/evidence-repository.js';
import {Dataset as DatasetSchema} from '../../contracts/evidence.js';
import {verifyReceiptApprovals} from '../../domain/identity/transfer-crypto.js';
import {TransferError,type Sql} from './database.js';
export const SELLER_REFUSAL='Transfer blocked: seller is not authorized for this registered item.';
export async function rootPin(){return RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));}
export async function loadSources(c:Sql,schema:string){
 const row=await c.query(DATASET_QUERY.replaceAll('packproof.',schema+'.'));
 return DatasetSchema.parse(Object.values(row.rows[0])[0]);
}
export async function currentOwnership(c:Sql,schema:string,pin:RootPin,itemId:string,sellerId:string,at:string,expected?:{ownerId:string;version:number}){
 const now=Date.parse(at);await c.query(`SELECT ${schema}.lock_transfer_sources($1)`,[itemId]);
 const item=(await c.query(`SELECT * FROM ${schema}.items WHERE id=$1`,[itemId])).rows[0];
 if(!item)throw new TransferError('unknown_unit',404);
 if(expected&&(item.owner_version!==expected.version||item.registered_owner_id!==expected.ownerId))throw new TransferError('ownership_conflict');
 const data=await loadSources(c,schema),base=await verifyRecordSet(data.records,pin,at);
 const issuance=base.verified.get(item.issuance_record_id)?.record,mapping=base.verified.get(item.mapping_record_id)?.record;
 if(issuance?.type!=='issuance'||mapping?.type!=='mapping'||issuance.data.itemId!==itemId||mapping.data.itemId!==itemId||mapping.data.issuanceRecordId!==issuance.id||mapping.issuerId!==issuance.issuerId||mapping.data.productMark.value!==item.unit_mark||mapping.data.productMark.scope!=='unit'||mapping.data.packagingMark.scope!=='unit'||!mapping.previousIds.includes(issuance.id))throw new TransferError('invalid_unit_mapping');
 if(!['issued','transferred'].includes(item.lifecycle))throw new TransferError('ineligible_lifecycle');
 const relations=(await c.query(`SELECT * FROM ${schema}.marking_relations WHERE item_id=$1`,[itemId])).rows;
 if(relations.length!==1||relations[0].record_id!==mapping.id||relations[0].product_mark!==mapping.data.productMark.value||relations[0].packaging_mark!==mapping.data.packagingMark.value)throw new TransferError('mapping_conflict');
 if([...base.verified.values()].filter(v=>v.record.type==='issuance'&&v.record.data.itemId===itemId).length!==1||[...base.verified.values()].filter(v=>v.record.type==='mapping'&&v.record.data.itemId===itemId).length!==1)throw new TransferError('allocation_conflict');
 let ownerId=issuance.data.registeredHolderId,version=1,ownerRecordId=issuance.id;
 const transfers=[...base.verified.values()].map(v=>v.record).filter((r):r is Extract<EvidenceRecord,{type:'transfer_receipt'}>=>r.type==='transfer_receipt'&&r.data.itemId===itemId).sort((a,b)=>a.data.toVersion-b.data.toVersion);
 for(const receipt of transfers){
  if(receipt.data.fromVersion!==version||receipt.data.toVersion!==version+1)throw new TransferError('ownership_chain_invalid');
  const a=await verifyReceiptApprovals(receipt.data);if(a.expectedOwnerId!==ownerId)throw new TransferError('ownership_chain_invalid');
  ownerId=a.buyerActorId;version++;ownerRecordId=receipt.id;
 }
 if(item.owner_version!==version||item.registered_owner_id!==ownerId||item.owner_record_id!==ownerRecordId)throw new TransferError('owner_projection_conflict');
 const delegations=[...base.verified.values()].filter(v=>v.record.type==='delegation'&&v.record.issuerId===issuance.issuerId&&v.record.data.itemId===itemId&&v.record.data.ownerActorId===ownerId&&v.record.data.delegateActorId===sellerId&&v.record.data.ownerVersion===version&&v.record.data.revokedAt===null&&Date.parse(v.record.data.expiresAt)>now);
 if(sellerId!==ownerId&&delegations.length!==1)throw new TransferError('seller_not_authorized');
 return {item,data,directory:base.directory,verified:base.verified,issuance,mapping,ownerId,version,ownerRecordId,delegations};
}
export async function checkAuthority(c:Sql,schema:string,pin:RootPin,itemId:string,sellerId:string,at:string,snapshotId?:string,expected?:{ownerId:string;version:number}){
 const {item,data,directory,verified,issuance,mapping,ownerId,version,ownerRecordId,delegations}=await currentOwnership(c,schema,pin,itemId,sellerId,at,expected);
 const base={directory,verified},now=Date.parse(at);
 const snapshots=(await c.query(`SELECT * FROM ${schema}.transfer_authority_snapshots WHERE item_id=$1 AND owner_version=$2 ${snapshotId?'AND id=$3':''} ORDER BY created_at DESC LIMIT 1`,snapshotId?[itemId,version,snapshotId]:[itemId,version])).rows;
 const stored=snapshots[0];if(!stored)throw new TransferError('current_authority_snapshot_required');
 const extended=await verifyRecordSet([...data.records,{id:stored.id,jws:stored.jws,sha256:stored.sha256}],pin,at);
 const snapshot=extended.verified.get(stored.id)?.record;
 const gaps=[...base.verified.values()].flatMap(v=>v.record.type==='gap'&&v.record.data.itemId===itemId?[v.record.id]:[]);
 if(snapshot?.type!=='custody_snapshot'||snapshot.visibility!=='restricted'||snapshot.data.itemId!==itemId||snapshot.data.holderReference!==`registered-actor:${ownerId}`||snapshot.issuerId!==issuance.issuerId||!snapshot.data.sourceRecordIds.includes(ownerRecordId)||!snapshot.data.sourceRecordIds.includes(mapping.id)||gaps.some(g=>!snapshot.data.gapRecordIds.includes(g))||snapshot.data.sourceRecordIds.some(id=>!snapshot.previousIds.includes(id)))throw new TransferError('current_authority_invalid');
 let maxAge=86400000;
 if(schema==='packproof'&&item.model_code==='JUDGE-SAMPLE'&&item.unit_mark.startsWith('JR-')){
  const demo=(await c.query('SELECT authority_until FROM packproof.review_units WHERE item_id=$1 AND seller_id=$2',[itemId,sellerId])).rows[0];
  if(demo?.authority_until&&Date.parse(demo.authority_until)>now)maxAge=14*86400000;
 }
 const age=now-Date.parse(snapshot.data.asOf);if(age<0||age>=maxAge||Date.parse(snapshot.issuedAt)>now)throw new TransferError('stale_authority');
 return {item,data,directory:extended.directory,verified:extended.verified,snapshot,refs:[issuance.id,mapping.id,ownerRecordId,snapshot.id,...delegations.map(d=>d.record.id)]};
}
