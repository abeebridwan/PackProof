import {randomUUID} from 'node:crypto';
import {importJWK} from 'jose';
import {z} from 'zod';
import {EvidenceRecord,type RootPin} from '../../contracts/evidence.js';
import {signRecord,verifyRecordSet} from '../../domain/trust/evidence.js';
import {currentOwnership,checkAuthority} from './authority.js';
import {TransferError,type TransferDatabase} from './database.js';
export type AuthoritySigner={key:CryptoKey;keyId:string;issuerId:string};
export async function configuredAuthoritySigner():Promise<AuthoritySigner|null>{
 if(!process.env.TRANSFER_AUTHORITY_SIGNING_JWK)return null;
 const v=z.strictObject({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string(),y:z.string(),d:z.string(),kid:z.uuid(),issuerId:z.uuid()}).parse(JSON.parse(process.env.TRANSFER_AUTHORITY_SIGNING_JWK));return {key:await importJWK(v,'ES256') as CryptoKey,keyId:v.kid,issuerId:v.issuerId};
}
// This creates a dated statement about the verified registry, never an approval
// or an ownership transition. The dedicated root grant permits snapshots only.
export async function ensureAuthoritySnapshot(db:TransferDatabase,pin:RootPin,actor:string,itemId:string,sellerId:string,signer:AuthoritySigner|null){
 if(!signer)return {status:'not_configured' as const};
 return db.transaction(actor,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,714))',[`${db.schema}:${itemId}`]);
  const at=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();
  try{await checkAuthority(c,db.schema,pin,itemId,sellerId,at);return {status:'current' as const};}catch(e){if(!(e instanceof TransferError)||!['stale_authority','current_authority_snapshot_required'].includes(e.code))throw e;}
  const state=await currentOwnership(c,db.schema,pin,itemId,sellerId,at);
  const grant=state.directory.grants.get(signer.keyId)?.data;
  if(!grant||grant.issuerId!==signer.issuerId||grant.issuerId!==state.issuance.issuerId||grant.revokedAt!==null||grant.role!=='issuer'||grant.recordTypes.length!==1||grant.recordTypes[0]!=='custody_snapshot'||grant.namespaces.length!==1||grant.namespaces[0]!==pin.namespace||Date.parse(at)<Date.parse(grant.validFrom)||Date.parse(at)>=Date.parse(grant.validUntil))throw new TransferError('snapshot_delegate_not_authorized',503);
  const gaps=[...state.verified.values()].flatMap(v=>v.record.type==='gap'&&v.record.data.itemId===itemId?[v.record.id]:[]);
  const refs=[...new Set([state.ownerRecordId,state.mapping.id,...gaps])];
  const payload=EvidenceRecord.parse({schemaVersion:1,id:randomUUID(),namespace:pin.namespace,subjectIds:[itemId],scope:'unit',issuerId:signer.issuerId,keyId:signer.keyId,issuedAt:at,receivedAt:at,revision:state.version,previousIds:refs,evidenceHashes:refs.map(id=>state.verified.get(id)!.stored.sha256),visibility:'restricted',demo:true,type:'custody_snapshot',data:{itemId,holderReference:`registered-actor:${state.ownerId}`,sourceRecordIds:refs,gapRecordIds:gaps,asOf:at}});
  const stored=await signRecord(payload,signer.key);await verifyRecordSet([...state.data.records,stored],pin,at);
  await c.query(`SELECT ${db.schema}.store_current_authority_snapshot($1,$2,$3,$4)`,[actor,payload,stored.jws,stored.sha256]);
  await checkAuthority(c,db.schema,pin,itemId,sellerId,at,stored.id,{ownerId:state.ownerId,version:state.version});
  return {status:'refreshed' as const,snapshotId:stored.id};
 });
}
