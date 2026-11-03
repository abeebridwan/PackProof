import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {generateKeyPair,importJWK} from 'jose';
import type pg from 'pg';
import {databasePool} from '../../src/server/data/postgres.js';
import {TransferDatabase} from '../../src/server/transfers/database.js';
import {TransferService,type ReceiptSigner} from '../../src/server/transfers/service.js';
import {rootPin} from '../../src/server/transfers/authority.js';
import {migrateP2} from '../../scripts/p2/migrate.js';
import {DEMO} from '../../scripts/p1/demo.js';
import {signAction} from '../../src/domain/identity/transfer-crypto.js';
import {EvidenceRecord} from '../../src/contracts/evidence.js';
import {signRecord} from '../../src/domain/trust/evidence.js';
import {PublicJwk} from '../../src/contracts/p0.js';
export async function p2Fixture(users?:string[]){
 const pool=databasePool(),schema=`packproof_p2test_${randomBytes(6).toString('hex')}`;
 // Isolated source copies: no automated sale or reset ever touches the real demo items.
 await pool.query(`CREATE SCHEMA ${schema};`);
 const tables=['schema_migrations','actors','actor_accounts','signed_records','issuer_bindings','directory_changes','items','marking_relations','custody_history','notices'];
 await pool.query(tables.map(table=>`CREATE TABLE ${schema}.${table}(LIKE packproof.${table} INCLUDING ALL);INSERT INTO ${schema}.${table} SELECT * FROM packproof.${table} ${table==='schema_migrations'?"WHERE version<'202611020004'":table==='actor_accounts'?'WHERE false':''};ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY;`).join(''));
 const claimFunction=(await pool.query("SELECT pg_get_functiondef('packproof.reject_claim_mutation()'::regprocedure) AS definition")).rows[0].definition;await pool.query(claimFunction.replaceAll('packproof.',schema+'.'));
 await migrateP2(pool,schema);
 await pool.query(`INSERT INTO ${schema}.transfer_authority_snapshots SELECT * FROM packproof.transfer_authority_snapshots`);
 // Issue a separate fictional test unit. Its signed identity/marks never alias
 // FP-1002/PK-2002, even though tests use the same trusted verifier and schema.
 const itemId=randomUUID(),suffix=randomBytes(6).toString('hex'),unitMark=`TEST-FP-${suffix}`,packMark=`TEST-PK-${suffix}`,at=new Date().toISOString();
 const offline=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8')),issuerKey=await importJWK(offline.issuer,'ES256') as CryptoKey;
 const mark=(value:string)=>({namespace:'packproof-demo',value,format:'text' as const,scope:'unit' as const,physicalLocation:'Isolated software-test label; no physical item asserted'});
 const common={schemaVersion:1,namespace:'packproof-demo',subjectIds:[itemId],scope:'unit',issuerId:DEMO.issuer,keyId:DEMO.issuerKey,issuedAt:at,receivedAt:at,revision:1,previousIds:[],evidenceHashes:[],visibility:'public',demo:true};
 const issuance=EvidenceRecord.parse({...common,id:randomUUID(),type:'issuance',data:{itemId,modelCode:'P2-ISOLATED-TEST',batchCode:`TEST-${suffix}`,unitMark:mark(unitMark),registeredHolderId:DEMO.shopB,ownerVersion:1,lifecycle:'issued',label:'Isolated P2 software-test unit only'}}),issued=await signRecord(issuance,issuerKey);
 const mapping=EvidenceRecord.parse({...common,id:randomUUID(),type:'mapping',previousIds:[issued.id],evidenceHashes:[issued.sha256],data:{itemId,issuanceRecordId:issued.id,productMark:mark(unitMark),packagingMark:mark(packMark),containerMark:null}}),mapped=await signRecord(mapping,issuerKey);
 for(const [record,stored] of [[issuance,issued],[mapping,mapped]] as const)await pool.query(`INSERT INTO ${schema}.signed_records(id,namespace,record_type,issuer_id,key_id,scope,issued_at,received_at,revision,visibility,demo,jws,sha256,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)`,[record.id,record.namespace,record.type,record.issuerId,record.keyId,record.scope,record.issuedAt,record.receivedAt,record.revision,record.visibility,stored.jws,stored.sha256,record]);
 await pool.query(`INSERT INTO ${schema}.items VALUES($1,'packproof-demo',$2,'P2-ISOLATED-TEST',$3,$4,$5,$4,$6,1,'issued')`,[itemId,unitMark,`TEST-${suffix}`,issued.id,mapped.id,DEMO.shopB]);
 await pool.query(`INSERT INTO ${schema}.marking_relations(record_id,item_id,namespace,product_mark,packaging_mark,carton_mark) VALUES($1,$2,'packproof-demo',$3,$4,NULL)`,[mapped.id,itemId,unitMark,packMark]);
 const snapshot=EvidenceRecord.parse({...common,id:randomUUID(),type:'custody_snapshot',visibility:'restricted',previousIds:[issued.id,mapped.id],evidenceHashes:[issued.sha256,mapped.sha256],data:{itemId,holderReference:`registered-actor:${DEMO.shopB}`,sourceRecordIds:[issued.id,mapped.id],gapRecordIds:[],asOf:at}}),snap=await signRecord(snapshot,issuerKey);
 await pool.query(`INSERT INTO ${schema}.transfer_authority_snapshots(id,item_id,owner_version,jws,sha256,payload) VALUES($1,$2,1,$3,$4,$5)`,[snap.id,itemId,snap.jws,snap.sha256,snapshot]);
 const userIds=users??Array.from({length:4},()=>randomUUID()),actors=[DEMO.shopB,randomUUID(),randomUUID(),DEMO.shopA];
 if(!users)for(const user of userIds)await pool.query("INSERT INTO auth.users(id,aud,role) VALUES($1,'authenticated','authenticated')",[user]);
 for(let i=0;i<actors.length;i++){
  if(i===1||i===2)await pool.query(`INSERT INTO ${schema}.actors VALUES($1,'consumer',$2,true)`,[actors[i],`Isolated P2 test buyer ${i}`]);
  await pool.query(`INSERT INTO ${schema}.actor_accounts VALUES($1,$2)`,[actors[i],userIds[i]]);
 }
 const key=JSON.parse(await readFile('.local/p2/transfer-key.json','utf8'));
 const signer:ReceiptSigner={key:await importJWK(key,'ES256') as CryptoKey,keyId:key.kid,issuerId:key.issuerId};
 const db=new TransferDatabase(pool,schema),service=new TransferService(db,await rootPin(),signer);
 const keys=new Map<string,{id:string;privateKey:CryptoKey;publicKey:ReturnType<typeof PublicJwk.parse>}>();
 async function enroll(index:number){const actor=actors[index]!,user=userIds[index]!,challenge=(await service.enrollment(actor,user,randomUUID())).challenge,pair=await generateKeyPair('ES256'),raw=await crypto.subtle.exportKey('jwk',pair.publicKey),publicKey=PublicJwk.parse({kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y});await service.enroll(actor,user,randomUUID(),{challengeId:challenge.challengeId,publicKey,signature:await signAction(challenge,pair.privateKey)});keys.set(actor,{id:challenge.keyId,privateKey:pair.privateKey,publicKey});}
 async function create(buyer=1){const offer=await service.create(actors[buyer]!,randomUUID(),{itemId,sellerActorId:DEMO.shopB});const signature=await signAction(offer.offer,keys.get(actors[buyer]!)!.privateKey);await service.offer(actors[buyer]!,offer.id,randomUUID(),signature);return offer;}
 async function frames(id:string,direction:'buyer-to-seller'|'seller-to-buyer',buyer=1){const actor=actors[direction==='buyer-to-seller'?buyer:0]!,prepared=await service.prepareFrames(actor,id,randomUUID(),direction),signatures=await Promise.all(prepared.frames.map(f=>signAction(f,keys.get(actor)!.privateKey))),batch=await service.uploadFrames(actor,id,randomUUID(),{direction,signatures});return batch;}
 async function scan(id:string,direction:'buyer-to-seller'|'seller-to-buyer',buyer=1){const batch=await frames(id,direction,buyer);const target=Date.parse(batch.frames[2]!.issuedAt)+30;await new Promise(resolve=>setTimeout(resolve,Math.max(0,target-Date.now())));const index=Math.max(0,Math.min(batch.frames.length-3,Math.floor((Date.now()-Date.parse(batch.frames[0]!.issuedAt))/200)-2)),handles=batch.frames.slice(index,index+3).map(f=>f.handle);const actor=actors[direction==='buyer-to-seller'?0:buyer]!;const scan=await service.scan(actor,id,randomUUID(),handles);return {...scan,signature:await signAction(scan.consent,keys.get(actor)!.privateKey),handles};}

 async function ready(buyer=1,pauseForReview=false){const offer=await create(buyer),seller=await scan(offer.id,'buyer-to-seller',buyer);if(pauseForReview)await new Promise(resolve=>setTimeout(resolve,3100));await service.approve(actors[0]!,offer.id,randomUUID(),seller.signature);const confirmation=await scan(offer.id,'seller-to-buyer',buyer);return {offer,seller,confirmation,buyer:actors[buyer]!};}
 async function close(){await pool.query(`DROP SCHEMA ${schema} CASCADE`);if(!users)for(const u of userIds)await pool.query('DELETE FROM auth.users WHERE id=$1',[u]);await pool.end();}
 return {pool,schema,db,service,signer,itemId,unitMark,packMark,testSourceRecords:[issued,mapped,snap],actors,userIds,keys,enroll,create,frames,scan,ready,close};
}
export type P2Fixture=Awaited<ReturnType<typeof p2Fixture>>;
