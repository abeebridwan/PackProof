// Existing project only. Preview configures its server keys; --production
// adds only the verified snapshot delegate needed for the authorized release.
// Root/product-issuer private keys are never read or uploaded.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {parseEnv} from 'node:util';
import {z} from 'zod';
import {rootPin} from '../../src/server/transfers/authority.js';
import {packBootstrap,packPool} from '../../src/server/offline/service.js';
import {verifyDirectory} from '../../src/offline/verify.js';
import {loadSources} from '../../src/server/transfers/authority.js';
import {verifyRecordSet} from '../../src/domain/trust/evidence.js';
const project='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',team='team_JGBEC35F2KTZM2qjdNzdMLZv';
if(!['--prepare','--apply'].includes(process.argv[2]??''))throw new Error('Use --prepare or the explicitly authorized --apply');
if(process.argv.slice(3).some(a=>a!=='--production'))throw new Error('Only --production is supported after the action');
const production=process.argv.includes('--production'),target=production?'production':'preview';
const auth=JSON.parse(await readFile(homedir()+'/.local/share/com.vercel.cli/auth.json','utf8')),env=parseEnv(await readFile('.env.local','utf8'));
if(process.env.PACKPROOF_PREVIEW_DB_URL_FILE)process.env.SUPABASE_DB_URL=(await readFile(process.env.PACKPROOF_PREVIEW_DB_URL_FILE,'utf8')).trim();
if(!env.MODEL_API_KEY)throw new Error('Existing Meta key required');
const key=z.object({kty:z.literal('EC'),crv:z.literal('P-256'),kid:z.uuid(),issuerId:z.uuid(),x:z.string(),y:z.string(),d:z.string()}).passthrough().parse(JSON.parse(await readFile('.local/p4/pack-key.json','utf8')));
const authority=z.strictObject({kty:z.literal('EC'),crv:z.literal('P-256'),kid:z.uuid(),issuerId:z.uuid(),x:z.string(),y:z.string(),d:z.string()}).parse(JSON.parse(await readFile('.local/platform/custody-key.json','utf8')));
let bootstrap;try{bootstrap=await packBootstrap();const checked=await verifyRecordSet((await loadSources(packPool(),'packproof')).records,await rootPin(),new Date().toISOString()),binding=checked.directory.grants.get(authority.kid)?.data;if(!binding||binding.issuerId!==authority.issuerId||binding.publicKey.x!==authority.x||binding.publicKey.y!==authority.y||binding.revokedAt||Date.parse(binding.validUntil)<=Date.now()||JSON.stringify(binding.recordTypes)!==JSON.stringify(['custody_snapshot'])||JSON.stringify(binding.namespaces)!==JSON.stringify(['packproof-demo']))throw new Error('Snapshot-only root grant required');}finally{await packPool().end();}const directory=await verifyDirectory(bootstrap.directoryJws,await rootPin());
const grant=directory.document.packSigners.find(g=>g.keyId===key.kid);if(!grant||grant.issuerId!==key.issuerId||grant.publicKey.x!==key.x||grant.publicKey.y!==key.y||grant.revokedAt!==null||JSON.stringify(grant.purposes)!==JSON.stringify(['pack-manifest','public-custody-snapshot']))throw new Error('Current root-verified pack-only signer required');
async function api(path:string,method='GET',body?:unknown){const response=await fetch('https://api.vercel.com'+path,{method,headers:{authorization:'Bearer '+auth.token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('vercel_'+response.status);return response.json();}
const p=await api(`/v9/projects/${project}?teamId=${team}`);if(p.id!==project||p.accountId!==team)throw new Error('Project mismatch');
const names=production?['TRANSFER_AUTHORITY_SIGNING_JWK']:['MODEL_API_KEY','REVIEW_LIVE_ENABLED','PACK_SIGNING_JWK','TRANSFER_AUTHORITY_SIGNING_JWK'];
let present=false;
if(production){const existing=await api(`/v9/projects/${project}/env?teamId=${team}&decrypt=false`);present=existing.envs.some((v:{key:string;target?:string[]})=>v.key===names[0]&&v.target?.includes('production'));}
if(process.argv[2]==='--apply'&&(!production||!present))await api(`/v10/projects/${project}/env?teamId=${team}${production?'':'&upsert=true'}`,'POST',production?[{key:names[0],value:JSON.stringify(authority),type:'encrypted',target:[target]}]:[{key:names[0],value:env.MODEL_API_KEY,type:'encrypted',target:[target]},{key:names[1],value:'1',type:'encrypted',target:[target]},{key:names[2],value:JSON.stringify(key),type:'encrypted',target:[target]},{key:names[3],value:JSON.stringify(authority),type:'encrypted',target:[target]}]);
const receipt={status:process.argv[2]==='--apply'?'configured':'prepared',projectId:project,target,encryptedServerVariables:names,grantId:'review-live-2026-11-04',totalExistingBudgetUsd:10,additionalBudgetUsd:0,requestCountCap:null,packKeyId:key.kid,snapshotKeyId:authority.kid,rootOrProductIssuerKeysRead:false,productionChanged:production&&process.argv[2]==='--apply'&&!present,existingVariablePreserved:present,checkedAt:new Date().toISOString()};
await writeFile(`.local/platform/${target}-key-configuration.json`,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
