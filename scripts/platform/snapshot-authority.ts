// --prepare never reads the root. --apply is an explicitly approved, local
// append-only root operation. The root and original issuer are never deployed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,importJWK} from 'jose';
import {databasePool} from '../../src/server/data/postgres.js';
import {loadSources,rootPin} from '../../src/server/transfers/authority.js';
import {verifyRecordSet,signRecord} from '../../src/domain/trust/evidence.js';
import {EvidenceRecord} from '../../src/contracts/evidence.js';
import {PublicJwk} from '../../src/contracts/p0.js';
import {DEMO} from '../p1/demo.js';
const apply=process.argv[2]==='--apply';
if(!apply&&process.argv[2]!=='--prepare')throw new Error('Use --prepare or the explicitly approved --apply');
if(process.env.PACKPROOF_PREVIEW_DB_URL_FILE)process.env.SUPABASE_DB_URL=(await readFile(process.env.PACKPROOF_PREVIEW_DB_URL_FILE,'utf8')).trim();
await mkdir('.local/platform',{recursive:true,mode:0o700});
const file='.local/platform/custody-key.json';
let key:Record<string,unknown>;
try{key=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const pair=await generateKeyPair('ES256',{extractable:true});key={...await exportJWK(pair.privateKey),kid:randomUUID(),issuerId:DEMO.issuer};await writeFile(file,JSON.stringify(key)+'\n',{mode:0o600,flag:'wx'});}
const pool=databasePool();
try{
 if(apply){
  const proposal=JSON.parse(await readFile('docs/packproof/evidence/platform-authority-proposal.json','utf8'));
  if(proposal.keyId!==key.kid||proposal.issuerId!==DEMO.issuer||proposal.publicKey.x!==key.x||proposal.publicKey.y!==key.y||proposal.validUntil!=='2026-11-18T09:04:44.441Z'||JSON.stringify(proposal.recordTypes)!==JSON.stringify(['custody_snapshot'])||JSON.stringify(proposal.namespaces)!==JSON.stringify(['packproof-demo']))throw new Error('Approved proposal mismatch');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140912)');await c.query('LOCK TABLE packproof.signed_records IN SHARE ROW EXCLUSIVE MODE');
   const pin=await rootPin(),at=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString(),sources=await loadSources(c,'packproof'),checked=await verifyRecordSet(sources.records,pin,at);
   const existing=checked.directory.grants.get(String(key.kid));
   if(existing){if(existing.data.publicKey.x!==key.x||existing.data.publicKey.y!==key.y||JSON.stringify(existing.data.recordTypes)!==JSON.stringify(['custody_snapshot'])||existing.data.validUntil!==proposal.validUntil)throw new Error('Existing grant differs');await c.query('ROLLBACK');console.log(JSON.stringify({status:'already_applied',keyId:key.kid,directoryVersion:checked.directory.version}));}
   else{
    if(checked.directory.hash!==proposal.currentDirectoryHash||checked.directory.version!==proposal.currentDirectoryVersion||Date.parse(at)>=Date.parse(proposal.validUntil))throw new Error('Trust state changed; prepare and review again');
    const raw=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8')),root=await importJWK(raw.root,'ES256') as CryptoKey,rootPublic=raw.root;
    if(rootPublic.x!==pin.publicKey.x||rootPublic.y!==pin.publicKey.y)throw new Error('Pinned offline root required');
    const common={schemaVersion:1,namespace:pin.namespace,subjectIds:[pin.issuerId],scope:'model',issuerId:pin.issuerId,keyId:pin.keyId,issuedAt:at,receivedAt:at,revision:1,previousIds:[],evidenceHashes:[],visibility:'public',demo:true};
    const binding=EvidenceRecord.parse({...common,id:randomUUID(),type:'issuer_binding',data:{issuerId:DEMO.issuer,keyId:key.kid,publicKey:PublicJwk.parse({kty:key.kty,crv:key.crv,x:key.x,y:key.y}),role:'issuer',namespaces:['packproof-demo'],recordTypes:['custody_snapshot'],validFrom:at,validUntil:proposal.validUntil,revokedAt:null,label:'Demo current-ownership snapshot delegate'}});
    if(binding.type!=='issuer_binding')throw new Error('Binding required');
    const bound=await signRecord(binding,root),last=checked.directory.auditIds.at(-1)!;
    const change=EvidenceRecord.parse({...common,id:randomUUID(),type:'directory_change',previousIds:[bound.id,last],evidenceHashes:[bound.sha256,checked.verified.get(last)!.stored.sha256],data:{version:checked.directory.version+1,previousDirectoryHash:checked.directory.hash,bindingRecordId:bound.id,bindingSha256:bound.sha256,administratorId:pin.issuerId,reason:'Explicitly approved Preview snapshot-only delegate through 18 November; no issuance, receipt or ownership-commit authority',operation:'grant',priorStateHash:null,newStateHash:bound.sha256}}),changed=await signRecord(change,root);
    await verifyRecordSet([...sources.records,bound,changed],pin,at);
    for(const [record,stored]of [[binding,bound],[change,changed]] as const)await c.query('INSERT INTO packproof.signed_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)',[record.id,record.namespace,record.type,record.issuerId,record.keyId,record.scope,record.issuedAt,record.receivedAt,record.revision,record.visibility,stored.jws,stored.sha256,record]);
    await c.query('INSERT INTO packproof.issuer_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL)',[bound.id,DEMO.issuer,key.kid,binding.data.publicKey,['packproof-demo'],['custody_snapshot'],at,proposal.validUntil]);
    await c.query('INSERT INTO packproof.directory_changes VALUES($1,$2,$3,$4,$5)',[changed.id,pin.namespace,checked.directory.version+1,bound.id,checked.directory.hash]);
    await c.query('COMMIT');
    const receipt={status:'passed',approval:'Explicit chat approval for Preview configuration and snapshot-only delegation',keyId:key.kid,binding:bound,directoryChange:changed,directoryVersion:checked.directory.version+1,validUntil:proposal.validUntil,scope:'packproof-demo custody_snapshot only',productionKeyUploaded:false,rootRemainedOffline:true,oldClaimsAndOwnershipChanged:false,appliedAt:at};
    await writeFile('docs/packproof/evidence/platform-authority-grant.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,keyId:key.kid,directoryVersion:receipt.directoryVersion,validUntil:receipt.validUntil}));
   }
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }else{
 const pin=await rootPin(),verified=await verifyRecordSet((await loadSources(pool,'packproof')).records,pin,new Date().toISOString());
 if(!key.d||key.crv!=='P-256'||key.issuerId!==DEMO.issuer)throw new Error('Dedicated candidate key required');
 const proposal={status:'approval_required',keyId:key.kid,issuerId:key.issuerId,publicKey:{kty:key.kty,crv:key.crv,x:key.x,y:key.y},recordTypes:['custody_snapshot'],namespaces:['packproof-demo'],validUntil:'2026-11-18T09:04:44.441Z',currentDirectoryVersion:verified.directory.version,currentDirectoryHash:verified.directory.hash,target:'existing Vercel packproof-p0 Preview only',encryptedVariable:'TRANSFER_AUTHORITY_SIGNING_JWK',purpose:'Attest current verified registry ownership after a handover; no participant approval or ownership transition',forbidden:['product issuance','mapping issuance','notices','receipt signing','trust administration','ownership commit'],rootRead:false,trustRecordsWritten:false,productionChanged:false,preparedAt:new Date().toISOString()};
 await writeFile('docs/packproof/evidence/platform-authority-proposal.json',JSON.stringify(proposal,null,2)+'\n');console.log(JSON.stringify(proposal));
 }
}finally{await pool.end();}
