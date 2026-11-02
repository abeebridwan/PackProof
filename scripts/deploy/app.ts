import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';

// One existing application/project. Production requires an explicit --production action.
// The user approved Production credentials and publication after phone validation.
const projectId='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',teamId='team_JGBEC35F2KTZM2qjdNzdMLZv';
const args=process.argv.slice(2),attempt=Number(args.find(a=>a.startsWith('--attempt='))?.split('=')[1]??1);
const prepare=args.includes('--prepare'),production=args.includes('--production'),target=production?'production':'preview';
if(!Number.isSafeInteger(attempt)||attempt<1||attempt>10||args.some(a=>a!=='--status'&&a!=='--prepare'&&a!=='--production'&&!/^--attempt=\d+$/.test(a)))throw new Error('Use --prepare, --status, --production or an explicit --attempt=N');
const directory='.local/deploy';await mkdir(directory,{recursive:true,mode:0o700});
const receiptPath=`${directory}/${target}-attempt-${attempt}.json`;
type Receipt={projectId:string;teamId:string;attempt:number;sourceSha256:string;files:{path:string;sha256:string;bytes:number}[];createdAt:string;id?:string;url?:string;readyState?:string};
let prior:Receipt|null=null;
try{prior=JSON.parse(await readFile(receiptPath,'utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
const auth=prepare?null:JSON.parse(await readFile(join(homedir(),'.local/share/com.vercel.cli/auth.json'),'utf8'));
if(!prepare&&(typeof auth.token!=='string'||auth.expiresAt*1000<=Date.now()))throw new Error('Refresh the existing Vercel CLI login with vercel whoami first');
async function api(path:string,method='GET',body?:unknown){
 const response=await fetch(`https://api.vercel.com${path}`,{method,headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`vercel_${method}_${response.status}`);
 return await response.json();
}
const query=`teamId=${teamId}`;
if(prior){
 if(!prior.id)throw new Error('Previous create outcome is uncertain; inspect Vercel before any explicit new attempt');
 const d=await api(`/v13/deployments/${prior.id}?${query}`);
 if(d.projectId!==projectId)throw new Error('Existing project mismatch');
 console.log(JSON.stringify({id:d.id,url:`https://${d.url}`,readyState:d.readyState,projectId,created:false}));
}else{
 if(args.includes('--status'))throw new Error('No registered preview attempt');
 let project:{name:string}|null=null;
 if(!prepare){
  const current=await api(`/v9/projects/${projectId}?${query}`),team=await api(`/v2/teams/${teamId}`);
  if(current.id!==projectId||current.accountId!==teamId||team.billing?.plan!=='hobby')throw new Error('Existing PackProof Hobby project required');
  project=current;
 }
 const files:{file:string;data:string;encoding:'base64'}[]=[],manifest:Receipt['files']=[];
 const env=parseEnv(await readFile('.env.local','utf8'));
 const secretValues=Object.entries(env).filter((entry):entry is [string,string]=>{const [k,v]=entry;return /KEY|TOKEN|PASSWORD|SECRET|DB_URL/.test(k)&&!k.includes('PUBLISHABLE')&&typeof v==='string'&&v.length>8;}).map(([,v])=>v);
 async function add(path:string){
  const data=await readFile(path),text=data.toString('utf8');
  if(/-----BEGIN (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)||secretValues.some(v=>text.includes(v)))throw new Error('Secret bytes in source upload');
  files.push({file:path,data:data.toString('base64'),encoding:'base64'});manifest.push({path,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
 }
 async function tree(path:string){for(const e of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())throw new Error('Upload symlink refused');if(e.isDirectory())await tree(`${path}/${e.name}`);else if(e.isFile())await add(`${path}/${e.name}`);}}
 for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','next.config.ts','tsconfig.json','tsconfig.app.json','vercel.json','certs/supabase-roots.crt','docs/packproof/demo/root-public.json','docs/packproof/evidence/provider.json','docs/packproof/evidence/sam/special-token-output.txt'])await add(file);
 for(const folder of ['src','public','scripts/spikes'])await tree(folder);
 const sourceSha256=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 const receipt:Receipt={projectId,teamId,attempt,sourceSha256,files:manifest,createdAt:new Date().toISOString()};
 const settings:Record<string,string>={P1_PROVIDER_MODE:'recorded-demo',P1_TRACING:'false',P1_SESSION_CAP_CENTS:'50',P1_SESSION_TIMEOUT_MS:'600000',SUPABASE_DB_SSLROOTCERT:'certs/supabase-roots.crt',ENABLE_EXPERIMENTAL_COREPACK:'1'};
 for(const key of ['SUPABASE_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_DB_URL']){if(!env[key])throw new Error(`Missing ${key}`);settings[key]=env[key];}
 if(production)settings.APP_ORIGIN='https://packproof-p0.vercel.app';
 if(settings.SUPABASE_PROJECT_REF!=='hvbzxeuedookkwleyjmx')throw new Error('Existing Supabase project required');
 // Vercel cannot use this project's IPv6-only direct endpoint. The override
 // is an ignored credential file, obtained and checked against the official
 // project pooler; never change the working local database configuration.
 if(process.env.PACKPROOF_PREVIEW_DB_URL_FILE)settings.SUPABASE_DB_URL=(await readFile(process.env.PACKPROOF_PREVIEW_DB_URL_FILE,'utf8')).trim();
 const database=new URL(settings.SUPABASE_DB_URL!);
 if(!['postgres:','postgresql:'].includes(database.protocol)||!database.hostname.endsWith('.pooler.supabase.com')||decodeURIComponent(database.username)!==`postgres.${settings.SUPABASE_PROJECT_REF}`||database.port!=='5432'||database.pathname!=='/postgres'||!database.password||database.hash)throw new Error('Verified project IPv4 session-pooler URL on port 5432 required for Vercel preview');
 if(prepare){
  await writeFile(`${directory}/${target}-upload-manifest.json`,JSON.stringify({...receipt,environmentNames:Object.keys(settings),credentialDestination:`existing Vercel project, encrypted ${target} environment`,productionChanged:false,target},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:'prepared',projectId,sourceSha256,uploadedFiles:0,preparedFiles:files.length,environmentNames:Object.keys(settings),modelCredentialsIncluded:false,networkRequests:0}));
 }else{
 // Persist intent before any mutation; an uncertain outcome is never replayed.
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 await api(`/v10/projects/${projectId}/env?${query}&upsert=true`,'POST',Object.entries(settings).map(([key,value])=>({key,value,type:'encrypted',target:[target]})));
 const d=await api(`/v13/deployments?${query}`,'POST',{name:project!.name,project:projectId,files,...(production?{target:'production'}:{}),projectSettings:{framework:'nextjs',nodeVersion:'24.x',buildCommand:'pnpm build',installCommand:'pnpm install --frozen-lockfile',outputDirectory:null,rootDirectory:null,serverlessFunctionRegion:'fra1'},meta:{packproofPhase:'P1D',sourceSha256,providerMode:'recorded-demo',environment:target}});
 if(!d.id||!d.url)throw new Error('Deployment registration incomplete; inspect existing attempt');
 Object.assign(receipt,{id:d.id,url:`https://${d.url}`,readyState:d.readyState});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({id:d.id,url:`https://${d.url}`,readyState:d.readyState,projectId,sourceSha256,uploadedFiles:files.length,created:true,target,productionDeploymentRequested:production,modelCredentialsUploaded:false}));
 }
}
