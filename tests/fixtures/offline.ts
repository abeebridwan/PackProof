import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,importJWK} from 'jose';
import {createDemo,newDemoKeys,DEMO,DEMO_AT} from '../../scripts/p1/demo.js';
import {EvidenceRecord,type StoredRecord} from '../../src/contracts/evidence.js';
import {OfflineDirectory,Manifest,PROFILE,DATASET,scopeKey,DAY,type EvidencePack} from '../../src/contracts/offline.js';
import {verifyRecordSet,signRecord} from '../../src/domain/trust/evidence.js';
import {bootstrapTrust,signedJson,payload,DIRECTORY_TYPE,MANIFEST_TYPE} from '../../src/offline/verify.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
export async function offlineFixture(){
 const keys=await newDemoKeys(),material=await createDemo(keys),base=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT),rootKey=await importJWK(keys.root,'ES256') as CryptoKey,packKey=(await generateKeyPair('ES256',{extractable:true})).privateKey,publicJwk=await exportJWK(packKey),kid=randomUUID(),issuerId=randomUUID();
 const document=OfflineDirectory.parse({schemaVersion:1,profileVersion:PROFILE,namespace:'packproof-demo',version:1,issuedAt:DEMO_AT,expiresAt:new Date(Date.parse(DEMO_AT)+DAY).toISOString(),records:base.directory.bindings.map(v=>v.stored),packSigners:[{keyId:kid,issuerId,publicKey:{kty:publicJwk.kty,crv:publicJwk.crv,x:publicJwk.x,y:publicJwk.y},role:'pack',purposes:['pack-manifest','public-custody-snapshot'],validFrom:DEMO_AT,validUntil:'2027-01-01T00:00:00.000Z',revokedAt:null}]});
 const directoryJws=await signedJson(document,rootKey,material.root.keyId,DIRECTORY_TYPE),state=await bootstrapTrust({directoryJws,serverTime:DEMO_AT,sequences:[]},material.root,null,Date.parse(DEMO_AT));
 const records=material.dataset.records.filter(s=>{const r=EvidenceRecord.parse(payload(s.jws));return ('itemId'in r.data&&r.data.itemId===DEMO.item2&&r.type!=='custody_snapshot')||r.type==='notice'||r.type==='correction';});
 const p=material.dataset.products.find(p=>p.itemId===DEMO.item2)!,refs=[p.issuanceRecordId,p.mappingRecordId];
 const snapshot=EvidenceRecord.parse({schemaVersion:1,id:randomUUID(),namespace:'packproof-demo',subjectIds:[p.itemId],scope:'unit',issuerId,keyId:kid,issuedAt:DEMO_AT,receivedAt:DEMO_AT,revision:1,previousIds:refs,evidenceHashes:refs.map(id=>base.verified.get(id)!.stored.sha256),visibility:'public',demo:true,type:'custody_snapshot',data:{itemId:p.itemId,holderReference:'Registered holder abcdef123456',sourceRecordIds:refs,gapRecordIds:[],asOf:DEMO_AT}});records.push(await signRecord(snapshot,packKey));
 async function make(sequence=1,changes:Partial<Manifest>={},list:StoredRecord[]=records,dirJws=directoryJws):Promise<EvidencePack>{const m=Manifest.parse({packId:randomUUID(),scopeKey:scopeKey([DEMO.item2]),namespace:'packproof-demo',itemIds:[DEMO.item2],profileVersion:PROFILE,coverage:'exact-selection',sourceDatasetVersion:DATASET,sequence,generatedAt:DEMO_AT,expiresAt:document.expiresAt,directoryVersion:document.version,directorySha256:await sha256(utf8(dirJws)),records:list.map(s=>{const r=EvidenceRecord.parse(payload(s.jws));return {id:s.id,type:r.type,sha256:s.sha256,requiredRefs:r.previousIds};}),media:[],...changes});return {schemaVersion:1,manifestJws:await signedJson(m,packKey,kid,MANIFEST_TYPE),directoryJws:dirJws,records:list.map(({id,jws})=>({id,jws})),media:[]};}
 return {keys,material,root:material.root,packKey,rootKey,kid,issuerId,document,directoryJws,state,records,snapshot,make};
}
