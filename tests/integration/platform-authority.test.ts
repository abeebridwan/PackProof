import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateKeyPair,exportJWK,importJWK} from 'jose';
import {p2Fixture} from '../fixtures/transfers.js';
import {loadSources,checkAuthority} from '../../src/server/transfers/authority.js';
import {ensureAuthoritySnapshot} from '../../src/server/transfers/snapshot.js';
import {verifyRecordSet,signRecord} from '../../src/domain/trust/evidence.js';
import {EvidenceRecord} from '../../src/contracts/evidence.js';
import {PublicJwk} from '../../src/contracts/p0.js';
import {DEMO} from '../../scripts/p1/demo.js';
it.skipIf(process.env.PACKPROOF_PLATFORM_INTEGRATION!=='1')('snapshot-only root delegate lets a receiving regular identity prepare onward transfer without re-enrollment; rejects receipt/unknown keys and preserves 24-hour expiry',async()=>{
 process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();const f=await p2Fixture();
 try{
  await f.pool.query((await readFile('supabase/migrations/202611040014_current_authority.sql','utf8')).replaceAll('packproof.',f.schema+'.'));
  await expect(f.db.transaction(f.actors[0]!,c=>c.query(`SELECT ${f.schema}.store_current_authority_snapshot($1,NULL,NULL,NULL)`,[f.actors[0]]))).rejects.toThrow('current_authority_binding_rejected');
  for(let n=0;n<3;n++)await f.enroll(n);const first=await f.ready(1,true);await f.service.confirm(first.buyer,first.offer.id,crypto.randomUUID(),first.confirmation.signature);await f.service.get(first.buyer,first.offer.id);
  await expect(f.create(2,1)).rejects.toThrow('current_authority_snapshot_required');
  const raw=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8')),root=await importJWK(raw.root,'ES256') as CryptoKey,at=new Date().toISOString(),sources=await loadSources(f.pool,f.schema),verified=await verifyRecordSet(sources.records,f.service.pin,at),pair=await generateKeyPair('ES256'),keyId=crypto.randomUUID(),pub=await exportJWK(pair.publicKey);
  const common={schemaVersion:1,namespace:'packproof-demo',subjectIds:[f.service.pin.issuerId],scope:'model',issuerId:f.service.pin.issuerId,keyId:f.service.pin.keyId,issuedAt:at,receivedAt:at,revision:1,previousIds:[],evidenceHashes:[],visibility:'public',demo:true};
  const binding=EvidenceRecord.parse({...common,id:crypto.randomUUID(),type:'issuer_binding',data:{issuerId:DEMO.issuer,keyId,publicKey:PublicJwk.parse({kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}),role:'issuer',namespaces:['packproof-demo'],recordTypes:['custody_snapshot'],validFrom:at,validUntil:new Date(Date.now()+14*86400000).toISOString(),revokedAt:null,label:'Isolated snapshot-only delegate test'}}),bound=await signRecord(binding,root),last=verified.directory.auditIds.at(-1)!;
  const change=EvidenceRecord.parse({...common,id:crypto.randomUUID(),type:'directory_change',previousIds:[bound.id,last],evidenceHashes:[bound.sha256,verified.verified.get(last)!.stored.sha256],data:{version:verified.directory.version+1,previousDirectoryHash:verified.directory.hash,bindingRecordId:bound.id,bindingSha256:bound.sha256,administratorId:f.service.pin.issuerId,reason:'Isolated test; snapshot purpose only, no issuer-key deployment or product issuance',operation:'grant',priorStateHash:null,newStateHash:bound.sha256}}),changed=await signRecord(change,root);
  for(const [record,stored]of [[binding,bound],[change,changed]] as const)await f.pool.query(`INSERT INTO ${f.schema}.signed_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)`,[record.id,record.namespace,record.type,record.issuerId,record.keyId,record.scope,record.issuedAt,record.receivedAt,record.revision,record.visibility,stored.jws,stored.sha256,record]);
  await f.pool.query(`INSERT INTO ${f.schema}.issuer_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL)`,[bound.id,DEMO.issuer,keyId,PublicJwk.parse({kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}),['packproof-demo'],['custody_snapshot'],at,new Date(Date.now()+14*86400000).toISOString()]);
  await f.pool.query(`INSERT INTO ${f.schema}.directory_changes VALUES($1,'packproof-demo',$2,$3,$4)`,[changed.id,verified.directory.version+1,bound.id,verified.directory.hash]);
  await expect(ensureAuthoritySnapshot(f.db,f.service.pin,f.actors[2]!,f.itemId,f.actors[1]!,f.signer)).rejects.toThrow('snapshot_delegate_not_authorized');
  await expect(ensureAuthoritySnapshot(f.db,f.service.pin,f.actors[2]!,f.itemId,f.actors[1]!,{key:pair.privateKey,keyId:crypto.randomUUID(),issuerId:DEMO.issuer})).rejects.toThrow('snapshot_delegate_not_authorized');
  const device=f.keys.get(f.actors[1]!)!.id,signer={key:pair.privateKey,keyId,issuerId:DEMO.issuer};const result=await ensureAuthoritySnapshot(f.db,f.service.pin,f.actors[2]!,f.itemId,f.actors[1]!,signer);expect(result.status).toBe('refreshed');
  const next=await f.create(2,1);expect(next.agreement.sellerActorId).toBe(f.actors[1]);expect(next.agreement.sellerDeviceKeyId).toBe(device);expect(next.agreement.expectedOwnerVersion).toBe(2);
  expect((await ensureAuthoritySnapshot(f.db,f.service.pin,f.actors[2]!,f.itemId,f.actors[1]!,signer)).status).toBe('current');
  await expect(f.db.transaction(f.actors[1]!,c=>checkAuthority(c,f.schema,f.service.pin,f.itemId,f.actors[1]!,new Date(Date.now()+25*3600000).toISOString()))).rejects.toThrow('stale_authority');
  expect((await f.pool.query(`SELECT owner_version FROM ${f.schema}.items WHERE id=$1`,[f.itemId])).rows[0].owner_version).toBe(2);expect(Number((await f.pool.query(`SELECT count(*) FROM ${f.schema}.accepted_transfers WHERE item_id=$1`,[f.itemId])).rows[0].count)).toBe(1);
 }finally{await f.close();}
},180000);
