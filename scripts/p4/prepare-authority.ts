// Offline operator only. Root stays on this machine; only the dedicated narrow pack key may serve exports.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,importJWK} from 'jose';
import {PublicJwk} from '../../src/contracts/p0.js';
import {OfflineDirectory,PROFILE,DAY} from '../../src/contracts/offline.js';
import {databasePool} from '../../src/server/data/postgres.js';
import {loadSources,rootPin} from '../../src/server/transfers/authority.js';
import {validateDataset} from '../../src/server/evidence/services.js';
import {signedJson,verifyDirectory,DIRECTORY_TYPE} from '../../src/offline/verify.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
await mkdir('.local/p4',{recursive:true,mode:0o700});
if((await stat('.local/p1/offline-keys.json')).mode&0o077)throw new Error('root_file_permissions');
const offline=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8')),pin=await rootPin();let signer:any;
try{if((await stat('.local/p4/pack-key.json')).mode&0o077)throw new Error('pack_file_permissions');signer=JSON.parse(await readFile('.local/p4/pack-key.json','utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;signer={...await exportJWK((await generateKeyPair('ES256',{extractable:true})).privateKey),kid:randomUUID(),issuerId:randomUUID()};await writeFile('.local/p4/pack-key.json',JSON.stringify(signer)+'\n',{flag:'wx',mode:0o600});}
const pool=databasePool(),c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140914)');const at=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString(),checked=await validateDataset(await loadSources(c,'packproof'),pin,at),prior=(await c.query('SELECT version,jws FROM packproof.offline_directories ORDER BY version DESC LIMIT 1')).rows[0];
let document:OfflineDirectory;
if(prior&&!process.argv.includes('--renew')){const existing=await verifyDirectory(prior.jws,pin);if(!existing.document.packSigners.some(g=>g.keyId===signer.kid))throw new Error('pack_authority_key_conflict');document=existing.document;}else{
 const old=prior?(await verifyDirectory(prior.jws,pin)).document:null;
 document=OfflineDirectory.parse({schemaVersion:1,profileVersion:PROFILE,namespace:pin.namespace,version:Number(prior?.version??0)+1,issuedAt:at,expiresAt:new Date(Date.parse(at)+DAY).toISOString(),records:checked.directory.bindings.map(v=>v.stored),packSigners:old?.packSigners??[{keyId:signer.kid,issuerId:signer.issuerId,publicKey:PublicJwk.parse({kty:signer.kty,crv:signer.crv,x:signer.x,y:signer.y}),role:'pack',purposes:['pack-manifest','public-custody-snapshot'],validFrom:at,validUntil:'2027-01-01T00:00:00.000Z',revokedAt:null}]});
 const root=await importJWK(offline.root,'ES256') as CryptoKey,jws=await signedJson(document,root,pin.keyId,DIRECTORY_TYPE);await verifyDirectory(jws,pin);await c.query('INSERT INTO packproof.offline_directories(version,jws,sha256) VALUES($1,$2,$3)',[document.version,jws,await sha256(utf8(jws))]);}
await c.query('COMMIT');const evidence={status:'passed',purpose:'Dedicated pack-manifest and public-custody-snapshot only; never transfer authority',rootKeyId:pin.keyId,packKeyId:signer.kid,packIssuerId:signer.issuerId,directoryVersion:document.version,issuedAt:document.issuedAt,expiresAt:document.expiresAt,rootAndProductIssuerKeysDeployed:false,receiptKeyReused:false,appendOnly:true};await writeFile('docs/packproof/evidence/p4-authority.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
