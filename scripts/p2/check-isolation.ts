import {readFile,readdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const build=process.env.PACKPROOF_P2_BUILD_DIR??'.local/p2/production';
const env=parseEnv(await readFile('.env.local','utf8'));
const secrets=Object.entries(env).flatMap(([k,v])=>/KEY|TOKEN|PASSWORD|SECRET|DB_URL/.test(k)&&!k.includes('PUBLISHABLE')&&v&&v.length>8?[v]:[]);
if(env.SUPABASE_DB_URL){const u=new URL(env.SUPABASE_DB_URL);if(u.password)secrets.push(decodeURIComponent(u.password));}
for(const path of ['.local/p1/offline-keys.json','.local/p2/transfer-key.json',...(await readdir('.local/p2')).filter(p=>p.startsWith('retired-receipt-')&&p.endsWith('.json')).map(p=>`.local/p2/${p}`)]){const keys=JSON.parse(await readFile(path,'utf8'));for(const value of Object.values(keys))if(value&&typeof value==='object'&&'d'in value&&typeof value.d==='string')secrets.push(value.d);if(typeof keys.d==='string')secrets.push(keys.d);}
try{const accounts=JSON.parse(await readFile('.local/p2/demo-accounts.json','utf8'));for(const a of accounts)if(typeof a.password==='string')secrets.push(a.password);}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
const files=(await readdir(`${build}/.next/static`,{recursive:true})).filter(p=>/\.(js|css|map)$/.test(p));
function check(text:string,client=false){if(secrets.some(s=>text.includes(s))||/-----BEGIN (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----[A-Za-z0-9+/=\r\n]+-----END (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)||client&&/MODEL_API_KEY|PACK_SIGNING_JWK|TRANSFER_SIGNING_JWK|SUPABASE_SECRET_KEY|SUPABASE_DB_URL|offline-keys\.json/.test(text))throw new Error('Private signing/configuration bytes or secret marker detected');}
for(const f of files)check(await readFile(`${build}/.next/static/${f}`,'utf8'),true);
const traces=(await readdir(`${build}/.next/server`,{recursive:true})).filter(p=>p.endsWith('.nft.json'));let traced=0;
for(const f of traces){const trace=`${build}/.next/server/${f}`,json=JSON.parse(await readFile(trace,'utf8'));for(const p of json.files){const path=resolve(dirname(trace),p);if(/\/scripts\/(?:p2|p3)\/|\/\.env[^/]*$|\/\.local\/p2\/(?:transfer-key|demo-accounts|account-create)|offline-keys\.json/.test(path)||(path.startsWith(resolve('.local/p3')+'/')&&!path.startsWith(resolve(build)+'/')))throw new Error('Operator/private file in server deployment trace');traced++;}}
const changed=execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean),added=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const path of [...new Set([...tracked,...changed,...added])]){if(/\.(png|jpg|jpeg)$/.test(path))continue;check(await readFile(path,'utf8'));}
const result={status:'passed',clientAssetsChecked:files.length,serverTracesChecked:traces.length,tracedReferencesChecked:traced,changedFilesChecked:new Set([...changed,...added]).size,gitTrackedFilesChecked:tracked.length,secretValuesChecked:secrets.length,privateKeyBytesFound:0,operatorFilesTraced:0,providerRequests:0};await writeFile(process.env.PACKPROOF_ISOLATION_EVIDENCE??'docs/packproof/evidence/p2-isolation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
