import {importJWK} from 'jose';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {Manifest,EvidencePack,Bootstrap,PROFILE,DATASET,DAY,scopeKey,MAX_PACK_BYTES} from '../../contracts/offline.js';
import {PublicJwk} from '../../contracts/p0.js';
import {EvidenceRecord,type StoredRecord} from '../../contracts/evidence.js';
import {databasePool} from '../data/postgres.js';
import {loadSources,rootPin} from '../transfers/authority.js';
import {validateDataset} from '../evidence/services.js';
import {verifyReceiptApprovals} from '../../domain/identity/transfer-crypto.js';
import {signRecord} from '../../domain/trust/evidence.js';
import {signedJson,verifyDirectory,MANIFEST_TYPE,bootstrapTrust,verifyPack,payload} from '../../offline/verify.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
export const Selection=z.strictObject({itemIds:z.array(z.uuid()).min(1).max(3)}).refine(v=>new Set(v.itemIds).size===v.itemIds.length);
let pool:ReturnType<typeof databasePool>|null=null;
export function packPool(){if(!pool){pool=databasePool();pool.on('error',()=>{});}return pool;}
export async function packBootstrap(){
 const c=await packPool().connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE packproof_pack');const directory=(await c.query('SELECT jws FROM packproof.offline_directories ORDER BY version DESC LIMIT 1')).rows[0];if(!directory)throw new Error('pack_authority_unavailable');const sequences=(await c.query('SELECT scope_key AS "scopeKey",sequence::float8 AS sequence FROM packproof.pack_sequences ORDER BY scope_key LIMIT 32')).rows;const serverTime=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();await verifyDirectory(directory.jws,await rootPin());await c.query('COMMIT');return Bootstrap.parse({directoryJws:directory.jws,serverTime,sequences});}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function createPack(input:unknown,userId:string,signerOverride?:string){
 const selection=Selection.parse(input),started=performance.now(),pin=await rootPin();
 const secret=signerOverride??process.env.PACK_SIGNING_JWK;if(!secret)throw new Error('pack_signer_unavailable');
 const jwk=z.object({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string(),y:z.string(),d:z.string(),kid:z.uuid(),issuerId:z.uuid()}).parse(JSON.parse(secret));
 const key=await importJWK(jwk,'ES256') as CryptoKey;
 const c=await packPool().connect();try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await c.query('SET LOCAL ROLE packproof_pack');
 const limit=(await c.query("INSERT INTO packproof.pack_export_limits(user_id,bucket,requests) VALUES($1,date_trunc('hour',now()),1) ON CONFLICT(user_id,bucket) DO UPDATE SET requests=packproof.pack_export_limits.requests+1 RETURNING requests",[z.uuid().parse(userId)])).rows[0];if(limit.requests>20)throw new Error('pack_export_rate_limit');
 const at=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();
 const directoryRow=(await c.query('SELECT jws FROM packproof.offline_directories ORDER BY version DESC LIMIT 1')).rows[0];if(!directoryRow)throw new Error('pack_authority_unavailable');
 const directory=await verifyDirectory(directoryRow.jws,pin),grant=directory.document.packSigners.find(g=>g.keyId===jwk.kid);
 if(!grant||grant.issuerId!==jwk.issuerId||grant.revokedAt!==null||JSON.stringify(grant.publicKey)!==JSON.stringify(PublicJwk.parse({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y})))throw new Error('pack_signer_unauthorized');
 const checked=await validateDataset(await loadSources(c,'packproof'),pin,at);
 // Do not export arbitrary namespaces or server-private receipt data. Verify full owner chain internally first.
 const products=selection.itemIds.map(id=>{const p=checked.data.products.find(p=>p.itemId===id);if(!p)throw new Error('unknown_pack_item');return p;});
 for(const p of products){
  const issuance=checked.verified.get(p.issuanceRecordId)!.record;if(issuance.type!=='issuance')throw new Error('issuance_required');let owner=issuance.data.registeredHolderId,version=1,ownerRecord=issuance.id;
  const receipts=checked.records.filter(r=>r.type==='transfer_receipt'&&r.data.itemId===p.itemId).sort((a,b)=>a.type==='transfer_receipt'&&b.type==='transfer_receipt'?a.data.toVersion-b.data.toVersion:0);
  for(const r of receipts){if(r.type!=='transfer_receipt'||r.data.fromVersion!==version||r.data.toVersion!==version+1)throw new Error('owner_chain_invalid');const a=await verifyReceiptApprovals(r.data);if(a.expectedOwnerId!==owner)throw new Error('owner_chain_invalid');owner=a.buyerActorId;version++;ownerRecord=r.id;}
  if(owner!==p.registeredOwnerId||version!==p.ownerVersion||ownerRecord!==p.ownerRecordId)throw new Error('owner_projection_conflict');
 }
 const chosen=new Map<string,StoredRecord>();
 const eligible=checked.records.filter(r=>r.visibility==='public'&&!['issuer_binding','directory_change','custody_snapshot','delegation','transfer_receipt'].includes(r.type));
 for(const r of eligible){if(('itemId'in r.data&&selection.itemIds.includes(r.data.itemId))||(r.type==='notice'&&products.some(p=>{const issued=checked.verified.get(p.issuanceRecordId)!.record;return issued.issuerId===r.issuerId&&p.modelCode===r.data.modelCode&&r.data.batchCodes.includes(p.batchCode);})))chosen.set(r.id,checked.verified.get(r.id)!.stored);}
 // Signed corrections/audits and their complete public dependency closure.
 let added=true;while(added){added=false;for(const r of eligible)if((r.type==='correction'&&chosen.has(r.data.targetRecordId))||(r.type==='audit'&&chosen.has(r.data.targetRecordId)))if(!chosen.has(r.id)){chosen.set(r.id,checked.verified.get(r.id)!.stored);added=true;}for(const s of [...chosen.values()]){const r=checked.verified.get(s.id)!.record;for(const id of r.previousIds)if(!chosen.has(id)&&!directory.document.records.some(d=>d.id===id)){const source=eligible.find(e=>e.id===id);if(!source)throw new Error('unexportable_dependency');chosen.set(id,checked.verified.get(id)!.stored);added=true;}}}
 for(const p of products){const gaps=[...chosen.values()].filter(s=>{const r=checked.verified.get(s.id)!.record;return r.type==='gap'&&r.data.itemId===p.itemId;}).map(s=>s.id),refs=[p.issuanceRecordId,p.mappingRecordId,...gaps];
  const snapshot=EvidenceRecord.parse({schemaVersion:1,id:randomUUID(),namespace:pin.namespace,subjectIds:[p.itemId],scope:'unit',issuerId:jwk.issuerId,keyId:jwk.kid,issuedAt:at,receivedAt:at,revision:p.ownerVersion,previousIds:refs,evidenceHashes:refs.map(id=>chosen.get(id)!.sha256),visibility:'public',demo:true,type:'custody_snapshot',data:{itemId:p.itemId,holderReference:'Registered holder '+(await sha256(utf8(p.itemId+':'+p.registeredOwnerId))).slice(0,12),sourceRecordIds:[p.issuanceRecordId,p.mappingRecordId],gapRecordIds:gaps,asOf:at}});
  const signed=await signRecord(snapshot,key);chosen.set(signed.id,signed);
  await c.query('INSERT INTO packproof.public_offline_snapshots(id,item_id,owner_version,jws,sha256) VALUES($1,$2,$3,$4,$5)',[signed.id,p.itemId,p.ownerVersion,signed.jws,signed.sha256]);
 }
 const scope=scopeKey(selection.itemIds),sequence=Number((await c.query('INSERT INTO packproof.pack_sequences(scope_key,sequence) VALUES($1,1) ON CONFLICT(scope_key) DO UPDATE SET sequence=packproof.pack_sequences.sequence+1 RETURNING sequence',[scope])).rows[0].sequence);
 const records=[...chosen.values()],manifest=Manifest.parse({packId:randomUUID(),scopeKey:scope,namespace:pin.namespace,itemIds:[...selection.itemIds].sort(),profileVersion:PROFILE,coverage:'exact-selection',sourceDatasetVersion:DATASET,sequence,generatedAt:at,expiresAt:new Date(Math.min(Date.parse(at)+DAY,Date.parse(directory.document.expiresAt))).toISOString(),directoryVersion:directory.document.version,directorySha256:directory.hash,records:records.map(s=>{const r=EvidenceRecord.parse(payload(s.jws));return {id:s.id,type:r.type,sha256:s.sha256,requiredRefs:r.previousIds};}),media:[]});
 const pack=EvidencePack.parse({schemaVersion:1,manifestJws:await signedJson(manifest,key,jwk.kid,MANIFEST_TYPE),directoryJws:directoryRow.jws,records:records.map(({id,jws})=>({id,jws})),media:[]}),bytes=utf8(JSON.stringify(pack));if(bytes.length>MAX_PACK_BYTES)throw new Error('pack_too_large');
 const bootstrap=await bootstrapTrust({directoryJws:directoryRow.jws,serverTime:at,sequences:[]},pin,null,Date.parse(at));await verifyPack(bytes,pin,bootstrap.trust);
 await c.query('INSERT INTO packproof.offline_exports(id,scope_key,sequence,manifest_jws,sha256,bytes) VALUES($1,$2,$3,$4,$5,$6)',[manifest.packId,scope,sequence,pack.manifestJws,await sha256(utf8(pack.manifestJws)),bytes.length]);await c.query('COMMIT');
 return {pack,bytes:bytes.length,creationMs:Math.round(performance.now()-started),filename:`packproof-${manifest.packId}.packproof.json`};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
