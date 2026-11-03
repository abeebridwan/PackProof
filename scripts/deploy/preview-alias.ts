// Keep one protected Preview address across source deployments. Never change production aliases.
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
const attempt=process.argv[2];
if(!/^[1-9][0-9]?$/.test(attempt??''))throw new Error('Pass the registered Preview attempt number');
const project='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',team='team_JGBEC35F2KTZM2qjdNzdMLZv',alias='packproof-p0-preview.vercel.app';
const receipt=JSON.parse(await readFile(`.local/deploy/preview-attempt-${attempt}.json`,'utf8'));
if(receipt.projectId!==project||receipt.teamId!==team||!receipt.id)throw new Error('Registered existing-project Preview required');
const auth=JSON.parse(await readFile(`${homedir()}/.local/share/com.vercel.cli/auth.json`,'utf8'));
async function api(path:string,method='GET',body?:unknown){const r=await fetch(`https://api.vercel.com${path}`,{method,headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`vercel_${r.status}`);return r.status===204?null:r.json();}
const deployment=await api(`/v13/deployments/${receipt.id}?teamId=${team}`);
if(deployment.projectId!==project||deployment.target==='production'||deployment.readyState!=='READY')throw new Error('Ready Preview in the existing project required');
const existing=await fetch(`https://api.vercel.com/v4/aliases/${alias}?teamId=${team}`,{headers:{authorization:`Bearer ${auth.token}`},signal:AbortSignal.timeout(15000)});
if(existing.ok){const a=await existing.json();if(a.projectId!==project)throw new Error('Existing alias assignment needs operator review');}else if(existing.status!==404)throw new Error(`alias_lookup_${existing.status}`);
const intent=`.local/deploy/preview-alias-attempt-${attempt}.json`;
await writeFile(intent,JSON.stringify({project,team,alias,deploymentId:receipt.id,status:'requested'})+'\n',{flag:'wx',mode:0o600});
const assigned=await api(`/v2/deployments/${receipt.id}/aliases?teamId=${team}`,'POST',{alias});
const aliasId=assigned.uid??assigned.id;
if(!aliasId)throw new Error('Alias registration outcome requires operator review');
const anonymous=await fetch(`https://${alias}/chainproof`,{redirect:'manual',signal:AbortSignal.timeout(20000)});
if(![401,403,302,307,308].includes(anonymous.status)){
 await api(`/v2/aliases/${aliasId}?teamId=${team}`,'DELETE');
 await writeFile(intent,JSON.stringify({project,team,alias,deploymentId:receipt.id,status:'rolled_back',reason:'Preview protection not confirmed'})+'\n',{mode:0o600});
 throw new Error('Alias rolled back: protected Preview access required');
}
const result={status:'passed',projectId:project,deploymentId:receipt.id,url:`https://${alias}`,aliasId,anonymousHttp:anonymous.status,productionAliasesChanged:false};
await writeFile(intent,JSON.stringify(result,null,2)+'\n',{mode:0o600});
await writeFile(process.env.PACKPROOF_ALIAS_EVIDENCE??'docs/packproof/evidence/p2-preview-alias.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
