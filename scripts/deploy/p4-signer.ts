// Explicit user approval: encrypted server-only Production PACK_SIGNING_JWK,
// existing PackProof project only. No root, issuer, Meta or receipt private key is read.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
const projectId='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',teamId='team_JGBEC35F2KTZM2qjdNzdMLZv',auth=JSON.parse(await readFile(join(homedir(),'.local/share/com.vercel.cli/auth.json'),'utf8'));
const key=z.object({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string(),y:z.string(),d:z.string(),kid:z.uuid(),issuerId:z.uuid()}).parse(JSON.parse(await readFile('.local/p4/pack-key.json','utf8')));
const authority=JSON.parse(await readFile('docs/packproof/evidence/p4-authority.json','utf8'));if(authority.status!=='passed'||authority.packKeyId!==key.kid||authority.receiptKeyReused!==false)throw new Error('verified_pack_only_authority_required');
async function api(path:string,method='GET',body?:unknown){const r=await fetch('https://api.vercel.com'+path,{method,headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('vercel_'+r.status);return r.json();}
const project=await api(`/v9/projects/${projectId}?teamId=${teamId}`);if(project.id!==projectId||project.accountId!==teamId)throw new Error('project_mismatch');
const value=JSON.stringify(key),fingerprint=createHash('sha256').update(value).digest('hex'),existing=await api(`/v9/projects/${projectId}/env?teamId=${teamId}&decrypt=false`),present=existing.envs.some((e:any)=>e.key==='PACK_SIGNING_JWK'&&e.target?.includes('production'));
if(present){const prior=JSON.parse(await readFile('.local/p4/production-signer-receipt.json','utf8'));if(prior.keyFingerprint!==fingerprint)throw new Error('existing_pack_signer_requires_explicit_rotation');}else await api(`/v10/projects/${projectId}/env?teamId=${teamId}`,'POST',{key:'PACK_SIGNING_JWK',value,type:'encrypted',target:['production']});
const receipt={status:'passed',projectId,teamId,key:'PACK_SIGNING_JWK',keyId:key.kid,keyFingerprint:fingerprint,target:['production'],type:'encrypted',serverOnly:true,rootOrIssuerPrivateKeysRead:false,providerKeyUploaded:false,approval:'User: Approve encrypted Production pack signer',at:new Date().toISOString(),newlyConfigured:!present};await writeFile('.local/p4/production-signer-receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:receipt.status,keyId:key.kid,target:receipt.target,type:receipt.type,serverOnly:true,newlyConfigured:!present}));
