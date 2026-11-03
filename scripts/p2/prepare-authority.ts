// Offline operator only: append a scoped receipt signer and the minimum current demo snapshot.
// Never imported by the app, and no root/issuer private key enters serving configuration.
import {readFile,writeFile,mkdir,stat,chmod} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,importJWK} from 'jose';
import {databasePool} from '../../src/server/data/postgres.js';
import {loadSources,rootPin} from '../../src/server/transfers/authority.js';
import {verifyRecordSet,signRecord} from '../../src/domain/trust/evidence.js';
import {EvidenceRecord} from '../../src/contracts/evidence.js';
import {PublicJwk} from '../../src/contracts/p0.js';
import {DEMO} from '../p1/demo.js';
import {validateDataset} from '../../src/server/evidence/services.js';
const pool=databasePool(),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140912)');
 await c.query('LOCK TABLE packproof.items,packproof.signed_records,packproof.transfer_authority_snapshots IN SHARE ROW EXCLUSIVE MODE');
 const at=new Date().toISOString(),pin=await rootPin(),data=await loadSources(c,'packproof');
 const checked=await validateDataset(data,pin,at);let verified=await verifyRecordSet(data.records,pin,at);
 const item=(await c.query('SELECT * FROM packproof.items WHERE id=$1 FOR UPDATE',[DEMO.item2])).rows[0];
 if(!item||item.owner_version!==1||item.registered_owner_id!==DEMO.shopB||item.lifecycle!=='issued'||(await c.query('SELECT 1 FROM packproof.accepted_transfers WHERE item_id=$1',[item.id])).rowCount)throw new Error('Current source ownership cannot be established for this minimal initial-state append');
 if(checked.data.products.find(p=>p.itemId===item.id)?.registeredOwnerId!==DEMO.shopB)throw new Error('Source/projection mismatch');
 if((await stat('.local/p1/offline-keys.json')).mode&0o077)throw new Error('Offline keys must be owner only');
 const offline=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8'));
 await mkdir('.local/p2',{recursive:true,mode:0o700});await chmod('.local/p2',0o700);let signer:any;
 try{signer=JSON.parse(await readFile('.local/p2/transfer-key.json','utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;signer={...await exportJWK((await generateKeyPair('ES256',{extractable:true})).privateKey),kid:randomUUID(),issuerId:randomUUID()};await writeFile('.local/p2/transfer-key.json',JSON.stringify(signer)+'\n',{flag:'wx',mode:0o600});}
 const root=await importJWK(offline.root,'ES256') as CryptoKey,issuer=await importJWK(offline.issuer,'ES256') as CryptoKey;
 async function store(payload:any,key:CryptoKey){const r=EvidenceRecord.parse(payload),stored=await signRecord(r,key);await c.query(`INSERT INTO packproof.signed_records(id,namespace,record_type,issuer_id,key_id,scope,issued_at,received_at,revision,visibility,demo,jws,sha256,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)`,[r.id,r.namespace,r.type,r.issuerId,r.keyId,r.scope,r.issuedAt,r.receivedAt,r.revision,r.visibility,stored.jws,stored.sha256,r]);return {r,stored};}
 const base={schemaVersion:1,namespace:pin.namespace,subjectIds:[pin.issuerId],scope:'model',issuerId:pin.issuerId,keyId:pin.keyId,issuedAt:at,receivedAt:at,revision:1,previousIds:[],evidenceHashes:[],visibility:'public',demo:true};
 let directoryAppend=false,retiredTestReceiptKeyId:string|null=null;
 if(process.argv.includes('--retire-test-signer')){
  const prior=verified.directory.grants.get(signer.kid);if(!prior||prior.data.revokedAt||JSON.stringify(prior.data.recordTypes)!==JSON.stringify(['transfer_receipt']))throw new Error('Current receipt-only grant required for explicit retirement');
  const binding=await store({...base,id:randomUUID(),type:'issuer_binding',previousIds:[prior.bindingId],evidenceHashes:[prior.bindingHash],revision:2,data:{...prior.data,revokedAt:at}},root);
  const last=verified.directory.auditIds.at(-1)!;
  const change=await store({...base,id:randomUUID(),type:'directory_change',previousIds:[binding.r.id,last],evidenceHashes:[binding.stored.sha256,verified.verified.get(last)!.stored.sha256],data:{version:verified.directory.version+1,previousDirectoryHash:verified.directory.hash,bindingRecordId:binding.r.id,bindingSha256:binding.stored.sha256,administratorId:pin.issuerId,reason:'Retire pre-release test receipt signer before external enablement; isolate new test unit identities',operation:'revoke',priorStateHash:prior.bindingHash,newStateHash:binding.stored.sha256}},root);
  await c.query('INSERT INTO packproof.issuer_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[binding.r.id,prior.data.issuerId,prior.data.keyId,prior.data.publicKey,prior.data.namespaces,prior.data.recordTypes,prior.data.validFrom,prior.data.validUntil,at]);
  await c.query('INSERT INTO packproof.directory_changes VALUES($1,$2,$3,$4,$5)',[change.r.id,pin.namespace,verified.directory.version+1,binding.r.id,verified.directory.hash]);
  retiredTestReceiptKeyId=signer.kid;await writeFile(`.local/p2/retired-receipt-${signer.kid}.json`,JSON.stringify(signer)+'\n',{flag:'wx',mode:0o600});
  signer={...await exportJWK((await generateKeyPair('ES256',{extractable:true})).privateKey),kid:randomUUID(),issuerId:signer.issuerId};
  await writeFile('.local/p2/receipt-replacement-pending.json',JSON.stringify(signer)+'\n',{flag:'wx',mode:0o600});
  verified=await verifyRecordSet((await loadSources(c,'packproof')).records,pin,at);
 }

 if(!verified.directory.grants.has(signer.kid)){
  await c.query("INSERT INTO packproof.actors VALUES($1,'issuer','Fictional PackProof transfer receipt service',true) ON CONFLICT(id) DO NOTHING",[signer.issuerId]);
  const binding=await store({...base,id:randomUUID(),type:'issuer_binding',data:{issuerId:signer.issuerId,keyId:signer.kid,publicKey:PublicJwk.parse({kty:signer.kty,crv:signer.crv,x:signer.x,y:signer.y}),role:'issuer',namespaces:[pin.namespace],recordTypes:['transfer_receipt'],validFrom:at,validUntil:'2027-01-01T00:00:00.000Z',revokedAt:null,label:'Fictional registered-transfer receipts only'}},root);
  const last=verified.directory.auditIds.at(-1)!;
  const change=await store({...base,id:randomUUID(),type:'directory_change',previousIds:[binding.r.id,last],evidenceHashes:[binding.stored.sha256,verified.verified.get(last)!.stored.sha256],data:{version:verified.directory.version+1,previousDirectoryHash:verified.directory.hash,bindingRecordId:binding.r.id,bindingSha256:binding.stored.sha256,administratorId:pin.issuerId,reason:'Authorize a separate P2 demo receipt signer; no issuance, mapping or directory authority',operation:'grant',priorStateHash:null,newStateHash:binding.stored.sha256}},root);
  await c.query('INSERT INTO packproof.issuer_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL)',[binding.r.id,signer.issuerId,signer.kid,PublicJwk.parse({kty:signer.kty,crv:signer.crv,x:signer.x,y:signer.y}),[pin.namespace],['transfer_receipt'],at,'2027-01-01T00:00:00.000Z']);
  await c.query('INSERT INTO packproof.directory_changes VALUES($1,$2,$3,$4,$5)',[change.r.id,pin.namespace,verified.directory.version+1,binding.r.id,verified.directory.hash]);directoryAppend=true;
 }
 const old=(await c.query('SELECT id FROM packproof.transfer_authority_snapshots WHERE item_id=$1 AND owner_version=1 AND (payload->\'data\'->>\'asOf\')::timestamptz>clock_timestamp()-interval \'23 hours\' LIMIT 1',[item.id])).rows[0];
 let snapshotId=old?.id;
 if(!old){
  const history=[...verified.verified.values()].map(v=>v.record).filter(r=>'itemId'in r.data&&r.data.itemId===item.id&&['custody','custody_snapshot','gap'].includes(r.type));
  const previousIds=[item.issuance_record_id,item.mapping_record_id,...history.map(r=>r.id)],gaps=history.filter(r=>r.type==='gap').map(r=>r.id);
  const snapshot=EvidenceRecord.parse({...base,id:randomUUID(),type:'custody_snapshot',scope:'unit',subjectIds:[item.id],issuerId:DEMO.issuer,keyId:DEMO.issuerKey,revision:2,visibility:'restricted',previousIds,evidenceHashes:previousIds.map(id=>verified.verified.get(id)!.stored.sha256),data:{itemId:item.id,holderReference:`registered-actor:${item.registered_owner_id}`,sourceRecordIds:previousIds,gapRecordIds:gaps,asOf:at}});
  const stored=await signRecord(snapshot,issuer);await verifyRecordSet([...data.records,stored],pin,at);
  await c.query('INSERT INTO packproof.transfer_authority_snapshots(id,item_id,owner_version,jws,sha256,payload) VALUES($1,$2,1,$3,$4,$5)',[snapshot.id,item.id,stored.jws,stored.sha256,snapshot]);snapshotId=snapshot.id;
 }
 await verifyRecordSet((await loadSources(c,'packproof')).records,pin,at);
 await c.query('COMMIT');
 if(retiredTestReceiptKeyId)await writeFile('.local/p2/transfer-key.json',JSON.stringify(signer)+'\n',{mode:0o600});
 const result={status:'passed',namespace:pin.namespace,itemId:item.id,ownerVersion:1,sourceState:'Signed issuance/mapping, registered owner/version, lifecycle, history, revocations and absence of accepted transfers independently checked under locks',directoryAppend,retiredTestReceiptKeyId,snapshotId,originalClaimsChanged:false,receiptKeyId:signer.kid,privateKeyDestination:'.local/p2/transfer-key.json; never root/issuer keys in serving app',providerRequests:0};
 await writeFile('docs/packproof/evidence/p2-authority.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(e){await c.query('ROLLBACK');console.error(JSON.stringify({status:'blocked',code:e&&typeof e==='object'&&'code'in e?e.code:e instanceof Error&&e.message.startsWith('Current source')?'source_authority_unavailable':'authority_preparation_failed'}));process.exitCode=1;}finally{c.release();await pool.end();}
