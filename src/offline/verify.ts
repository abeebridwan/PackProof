import {CompactSign,compactVerify,decodeProtectedHeader,importJWK} from 'jose';
import type {RootPin,StoredRecord} from '../contracts/evidence.js';
import {EvidenceRecord} from '../contracts/evidence.js';
import {EvidencePack,OfflineDirectory,Manifest,MAX_PACK_BYTES,DAY,DIRECTORY_MAX_AGE,SETUP_REQUIRED,scopeKey,type Bootstrap} from '../contracts/offline.js';
import {loadDirectory,verifyRecordSet,EVIDENCE_JWS_TYPE,type VerifiedRecord} from '../domain/trust/evidence.js';
import {sha256,utf8} from '../domain/verification/p0-crypto.js';
export const DIRECTORY_TYPE='packproof-offline-directory+jws',MANIFEST_TYPE='packproof-pack+jws';
// Bound both the container and each signed JSON payload before schema/crypto work.
export function boundedJson(bytes:Uint8Array,limit=MAX_PACK_BYTES):unknown{
 if(bytes.byteLength>limit)throw new Error('pack_too_large');
 const text=new TextDecoder('utf8',{fatal:true}).decode(bytes);let depth=0,quoted=false,escaped=false;
 for(const c of text){if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{'||c==='['){if(++depth>16)throw new Error('json_nesting_limit');}else if(c==='}'||c===']')depth--;}
 const value:unknown=JSON.parse(text);let nodes=0;
 function visit(v:unknown){if(++nodes>24000)throw new Error('json_node_limit');if(typeof v==='string'&&v.length>1500000)throw new Error('json_string_limit');if(v&&typeof v==='object'){const entries=Object.entries(v);if(entries.length>256)throw new Error('json_collection_limit');for(const [k,x]of entries){if(k==='__proto__'||k==='constructor'||k==='prototype')throw new Error('unsafe_json_key');visit(x);}}}visit(value);return value;
}
export function payload(jws:string){const part=jws.split('.')[1]!;return boundedJson(Uint8Array.from(atob(part.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)),192000);}
export async function signedJson(value:unknown,key:CryptoKey,kid:string,typ:string){return new CompactSign(utf8(JSON.stringify(value))).setProtectedHeader({alg:'ES256',kid,typ}).sign(key);}
export async function openJson(jws:string,key:RootPin['publicKey'],kid:string,typ:string){
 const h=decodeProtectedHeader(jws);if(h.alg!=='ES256'||h.kid!==kid||h.typ!==typ||Object.keys(h).some(k=>!['alg','kid','typ'].includes(k)))throw new Error('unauthorized_signing_header');
 const v=await compactVerify(jws,await importJWK(key,'ES256'),{algorithms:['ES256']});return boundedJson(v.payload,192000);
}
export async function verifyDirectory(jws:string,pin:RootPin){
 const d=OfflineDirectory.parse(await openJson(jws,pin.publicKey,pin.keyId,DIRECTORY_TYPE));
 if(d.namespace!==pin.namespace||Date.parse(d.expiresAt)<=Date.parse(d.issuedAt)||Date.parse(d.expiresAt)-Date.parse(d.issuedAt)>DIRECTORY_MAX_AGE)throw new Error('invalid_directory_policy');
 if(new Set(d.packSigners.map(s=>s.keyId)).size!==d.packSigners.length)throw new Error('duplicate_pack_signer');
 for(const s of d.packSigners)if(s.keyId===pin.keyId||Date.parse(s.validUntil)<=Date.parse(s.validFrom))throw new Error('invalid_pack_grant');
 const directory=await loadDirectory(d.records,pin,d.issuedAt);
 if(d.packSigners.some(s=>directory.grants.has(s.keyId)))throw new Error('pack_key_role_collision');
 return {document:d,directory,hash:await sha256(utf8(jws))};
}
export type Trust={directoryVersion:number;directoryHash:string;directoryJws:string;lastServerTime:string;wallAtSetup:number;maxWall:number;clockReliable:boolean;sequences:Record<string,number>;revoked:string[]};
export type OfflineState={epoch:number;trust:Trust;packs:EvidencePack[]};
export type VerifiedPack={pack:EvidencePack;manifest:Manifest;records:VerifiedRecord[];directory:OfflineDirectory;revoked:string[];hash:string};
export async function bootstrapTrust(input:Bootstrap,pin:RootPin,prior:OfflineState|null,wall:number):Promise<OfflineState>{
 const d=await verifyDirectory(input.directoryJws,pin),server=Date.parse(input.serverTime);
 if(server<Date.parse(d.document.issuedAt)||server>=Date.parse(d.document.expiresAt)||!Number.isFinite(wall))throw new Error('bootstrap_time_invalid');
 const old=prior?.trust;
 if(old&&(server<Date.parse(old.lastServerTime)||d.document.version<old.directoryVersion||(d.document.version===old.directoryVersion&&d.hash!==old.directoryHash)))throw new Error('directory_rollback');
 const revoked=[...d.directory.grants.values()].filter(g=>g.data.revokedAt!==null).map(g=>g.data.keyId).concat(d.document.packSigners.filter(s=>s.revokedAt!==null).map(s=>s.keyId));
 const sequences={...old?.sequences};for(const s of input.sequences)sequences[s.scopeKey]=Math.max(sequences[s.scopeKey]??0,s.sequence);
 return {epoch:(prior?.epoch??0)+1,packs:prior?.packs??[],trust:{directoryVersion:d.document.version,directoryHash:d.hash,directoryJws:input.directoryJws,lastServerTime:input.serverTime,wallAtSetup:wall,maxWall:Math.max(wall,old?.maxWall??0),clockReliable:Math.abs(wall-server)<=300000,sequences,revoked:[...new Set([...(old?.revoked??[]),...revoked])]}};
}
const equalIds=(a:readonly string[],b:readonly string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export async function verifyPack(bytes:Uint8Array,pin:RootPin,trust:Trust|null):Promise<VerifiedPack>{
 const pack=EvidencePack.parse(boundedJson(bytes));
 if(!trust)throw new Error(SETUP_REQUIRED);
 // Reject decoded-schema failures before any cryptography.
 const untrustedManifest=Manifest.parse(payload(pack.manifestJws));OfflineDirectory.parse(payload(pack.directoryJws));
 const decoded=pack.records.map(r=>EvidenceRecord.parse(payload(r.jws)));
 const d=await verifyDirectory(pack.directoryJws,pin),m=untrustedManifest;
 if(m.directorySha256!==d.hash||m.directoryVersion!==d.document.version)throw new Error('directory_hash_mismatch');
 if(d.document.version<trust.directoryVersion||(d.document.version===trust.directoryVersion&&d.hash!==trust.directoryHash))throw new Error('directory_rollback');
 const h=decodeProtectedHeader(pack.manifestJws),grant=d.document.packSigners.find(s=>s.keyId===h.kid);
 const at=Date.parse(m.generatedAt);
 if(!grant||grant.revokedAt!==null||trust.revoked.includes(grant.keyId)||at<Date.parse(grant.validFrom)||at>=Date.parse(grant.validUntil))throw new Error('unauthorized_pack_signer');
 await openJson(pack.manifestJws,grant.publicKey,grant.keyId,MANIFEST_TYPE);
 if(m.scopeKey!==scopeKey(m.itemIds)||at<Date.parse(d.document.issuedAt)||at>=Date.parse(d.document.expiresAt)||Date.parse(m.expiresAt)>Date.parse(d.document.expiresAt)||Date.parse(m.expiresAt)-at>DAY)throw new Error('invalid_pack_scope_or_time');
 if(pack.records.length!==m.records.length||new Set(pack.records.map(r=>r.id)).size!==pack.records.length||pack.media.length!==m.media.length||new Set(pack.media.map(r=>r.sha256)).size!==pack.media.length)throw new Error('manifest_collection_mismatch');
 const stored:StoredRecord[]=[],projections:VerifiedRecord[]=[];
 for(let i=0;i<pack.records.length;i++){
  const r=pack.records[i]!,record=decoded[i]!,entry=m.records.find(e=>e.id===r.id),hash=await sha256(utf8(r.jws));
  if(!entry||entry.sha256!==hash||record.id!==r.id||entry.type!==record.type||!equalIds(entry.requiredRefs,record.previousIds))throw new Error('record_hash_or_manifest_mismatch');
  if(record.visibility!=='public'||record.namespace!==pin.namespace||['delegation','transfer_receipt','issuer_binding','directory_change'].includes(record.type))throw new Error('private_or_unpermitted_record');
  if(trust.revoked.includes(record.keyId))throw new Error('known_revoked_issuer');
  const s={...r,sha256:hash};
  if(record.keyId===grant.keyId){
   if(record.type!=='custody_snapshot'||record.issuerId!==grant.issuerId||record.issuedAt!==m.generatedAt||record.receivedAt!==record.issuedAt||record.data.asOf!==m.generatedAt||!/^Registered holder [a-f0-9]{12}$/.test(record.data.holderReference))throw new Error('invalid_public_ownership_projection');
   await openJson(r.jws,grant.publicKey,grant.keyId,EVIDENCE_JWS_TYPE);projections.push({record,stored:s,payloadBytes:utf8(JSON.stringify(record))});
  }else {if(record.type==='custody_snapshot')throw new Error('public_projection_requires_pack_role');stored.push(s);}
 }
 for(const media of pack.media){const e=m.media.find(x=>x.sha256===media.sha256),raw=Uint8Array.from(atob(media.base64),c=>c.charCodeAt(0));if(!e||raw.length!==e.bytes||await sha256(raw)!==e.sha256||raw[0]!==255||raw[1]!==216||raw.at(-2)!==255||raw.at(-1)!==217)throw new Error('media_hash_or_type_mismatch');}
 const checked=await verifyRecordSet([...d.document.records,...stored],pin,m.generatedAt);
 const records=[...checked.verified.values(),...projections],byId=new Map(records.map(r=>[r.record.id,r]));
 if(byId.size!==records.length)throw new Error('duplicate_directory_record');
 for(const v of records){const r=v.record;if(r.previousIds.length!==r.evidenceHashes.length||r.previousIds.some((id,i)=>byId.get(id)?.stored.sha256!==r.evidenceHashes[i]))throw new Error('missing_dependency');}
 const publicRecords=records.filter(v=>!['issuer_binding','directory_change'].includes(v.record.type));
 for(const item of m.itemIds){
  const issuance=publicRecords.filter(v=>v.record.type==='issuance'&&v.record.data.itemId===item),maps=publicRecords.filter(v=>v.record.type==='mapping'&&v.record.data.itemId===item),snaps=projections.filter(v=>v.record.type==='custody_snapshot'&&v.record.data.itemId===item);
  if(issuance.length!==1||maps.length!==1||snaps.length!==1)throw new Error('incomplete_or_conflicting_item');
  const issued=issuance[0]!.record,map=maps[0]!.record,snap=snaps[0]!.record;
  if(issued.type!=='issuance'||map.type!=='mapping'||snap.type!=='custody_snapshot')throw new Error('invalid_projection');
  if(map.issuerId!==issued.issuerId||map.data.issuanceRecordId!==issued.id||map.data.productMark.value!==issued.data.unitMark.value||!map.previousIds.includes(issued.id)||!snap.data.sourceRecordIds.includes(issued.id)||!snap.data.sourceRecordIds.includes(map.id)||snap.data.sourceRecordIds.some(id=>!snap.previousIds.includes(id)))throw new Error('invalid_mapping_or_snapshot');
  const gaps=publicRecords.filter(v=>v.record.type==='gap'&&v.record.data.itemId===item);if(gaps.some(g=>!snap.data.gapRecordIds.includes(g.record.id))||snap.data.gapRecordIds.some(id=>byId.get(id)?.record.type!=='gap'||!snap.previousIds.includes(id)))throw new Error('hidden_history_gap');
 }
 const issued=publicRecords.map(v=>v.record).filter(r=>r.type==='issuance');
 for(const v of publicRecords){const r=v.record;
  if('itemId'in r.data&&(!m.itemIds.includes(r.data.itemId)||!r.subjectIds.includes(r.data.itemId)||!equalIds(r.subjectIds,[r.data.itemId])))throw new Error('out_of_scope_record');
  if(r.type==='notice'&&!issued.some(s=>s.type==='issuance'&&s.issuerId===r.issuerId&&s.data.modelCode===r.data.modelCode&&r.data.batchCodes.includes(s.data.batchCode)))throw new Error('out_of_scope_notice');
  if(r.type==='correction'&&!r.previousIds.every(id=>byId.has(id)))throw new Error('missing_correction_source');
 }
 const revoked=[...d.directory.grants.values()].filter(g=>g.data.revokedAt!==null).map(g=>g.data.keyId).concat(d.document.packSigners.filter(s=>s.revokedAt!==null).map(s=>s.keyId));
 return {pack,manifest:m,records:publicRecords,directory:d.document,revoked,hash:await sha256(bytes)};
}
export async function stagePack(bytes:Uint8Array,pin:RootPin,prior:OfflineState|null,wall=Date.now()):Promise<{state:OfflineState;verified:VerifiedPack}>{
 const v=await verifyPack(bytes,pin,prior?.trust??null);if(!prior)throw new Error(SETUP_REQUIRED);
 const t=prior.trust,m=v.manifest,highest=t.sequences[m.scopeKey]??0;
 const same=prior.packs.find(p=>p.manifestJws===v.pack.manifestJws);
 if(m.sequence<highest||prior.packs.some(p=>{const old=Manifest.parse(payload(p.manifestJws));return old.scopeKey===m.scopeKey&&old.sequence===m.sequence&&p.manifestJws!==v.pack.manifestJws;}))throw new Error('pack_sequence_rollback');
 // Keep every previously verified public/adverse claim, never erase it with a partial import.
 for(const oldPack of prior.packs){const oldM=Manifest.parse(payload(oldPack.manifestJws));for(const r of oldPack.records){const newer=v.pack.records.find(n=>n.id===r.id);if(newer&&newer.jws!==r.jws)throw new Error('signed_record_identity_conflict');const old=EvidenceRecord.parse(payload(r.jws));if(old.type==='issuance'||old.type==='mapping'){for(const n of v.records){const next=n.record;if((next.type==='issuance'||next.type==='mapping')&&next.type===old.type&&next.data.itemId===old.data.itemId&&next.id!==old.id)throw new Error('known_allocation_or_mapping_conflict');}}if(old.type==='custody_snapshot'&&/^Registered holder /.test(old.data.holderReference)){for(const n of v.records){const next=n.record;if(next.type==='custody_snapshot'&&next.keyId===decodeProtectedHeader(v.pack.manifestJws).kid&&next.data.itemId===old.data.itemId&&(next.revision<old.revision||(next.revision===old.revision&&next.data.holderReference!==old.data.holderReference)||Date.parse(next.data.asOf)<Date.parse(old.data.asOf)))throw new Error('ownership_projection_conflict');}}}if(oldM.sourceDatasetVersion!==m.sourceDatasetVersion)throw new Error('dataset_version_conflict');}
 const packs=same?prior.packs:[...prior.packs,v.pack];if(packs.length>12||utf8(JSON.stringify(packs)).length>8*MAX_PACK_BYTES)throw new Error('offline_storage_full');
 const state:OfflineState={epoch:prior.epoch+1,packs,trust:{...t,directoryVersion:v.directory.version,directoryHash:m.directorySha256,directoryJws:v.pack.directoryJws,sequences:{...t.sequences,[m.scopeKey]:Math.max(highest,m.sequence)},maxWall:Math.max(t.maxWall,wall),clockReliable:t.clockReliable&&wall>=t.maxWall&&wall>=Date.parse(t.lastServerTime),revoked:[...new Set([...t.revoked,...v.revoked])]}};
 return {state,verified:v};
}
export function freshness(m:Manifest,t:Trust,wall:number){if(!t.clockReliable||wall<t.maxWall||wall<Date.parse(t.lastServerTime)||wall<Date.parse(m.generatedAt))return 'Time unreliable — current freshness cannot be established';return wall>=Date.parse(m.expiresAt)?'Historical — snapshot expired':'Within the 24-hour snapshot policy; current status has not been rechecked';}
