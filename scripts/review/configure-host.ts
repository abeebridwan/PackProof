// Explicit user approval: encrypt only the Meta key and live switch in the
// existing Production project. Never copy signing/root or unrelated credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {parseEnv} from 'node:util';
const project='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',team='team_JGBEC35F2KTZM2qjdNzdMLZv';
const auth=JSON.parse(await readFile(`${homedir()}/.local/share/com.vercel.cli/auth.json`,'utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));if(!env.MODEL_API_KEY)throw new Error('Meta key missing');
async function api(path:string,method='GET',body?:unknown){const r=await fetch('https://api.vercel.com'+path,{method,headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`vercel_${r.status}`);return r.json();}
const p=await api(`/v9/projects/${project}?teamId=${team}`),t=await api(`/v2/teams/${team}`);
if(p.id!==project||p.accountId!==team||t.billing?.plan!=='hobby')throw new Error('Existing Hobby project required');
if(process.argv[2]!=='--apply')throw new Error('Use --apply for the explicitly approved encrypted Production Meta key');
await api(`/v10/projects/${project}/env?teamId=${team}&upsert=true`,'POST',[{key:'MODEL_API_KEY',value:env.MODEL_API_KEY,type:'encrypted',target:['production']},{key:'REVIEW_LIVE_ENABLED',value:'1',type:'encrypted',target:['production']}]);
const verified=await api(`/v9/projects/${project}/env?teamId=${team}&decrypt=false`);
const names=['MODEL_API_KEY','REVIEW_LIVE_ENABLED'];for(const key of names)if(!verified.envs.some((e:{key:string;type:string;target:string[]})=>e.key===key&&e.type==='encrypted'&&e.target.includes('production')))throw new Error('Encrypted Production configuration missing');
const receipt={status:'passed',projectId:project,target:'production',encryptedServerVariables:names,grantId:'review-live-2026-11-04',budgetUsd:5,requestCountCap:null,rootOrIssuerKeysUploaded:false,checkedAt:new Date().toISOString()};
await writeFile('.local/review/host-configuration.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
