import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';

// One existing application/project. Production requires an explicit --production action.
// The user approved P2 Production publication after physical-phone acceptance.
// The same receipt-only signing key may now be encrypted for Production; root/issuer keys stay offline.
const projectId='prj_vU1jMdmznW0w84xGDOTgdGW3vZ2t',teamId='team_JGBEC35F2KTZM2qjdNzdMLZv';
const args=process.argv.slice(2),attempt=Number(args.find(a=>a.startsWith('--attempt='))?.split('=')[1]??1);
const p2Preview=args.includes('--p2-preview');
const p2Production=args.includes('--p2-production'),p2Enabled=p2Preview||p2Production;
const prepare=args.includes('--prepare'),production=args.includes('--production'),target=production?'production':'preview',reuseProduction=args.includes('--reuse-production-env');
if(reuseProduction&&(!production||!p2Production))throw new Error('Existing Production configuration reuse requires --production --p2-production');
if(!Number.isSafeInteger(attempt)||attempt<1||attempt>99||args.some(a=>a!=='--status'&&a!=='--prepare'&&a!=='--production'&&a!=='--p2-preview'&&a!=='--p2-production'&&a!=='--reuse-production-env'&&!/^--attempt=\d+$/.test(a)))throw new Error('Use --prepare, --status, --production or an explicit --attempt=N');
if(p2Preview&&production)throw new Error('P2 cannot be promoted by the preview validation command');
if(p2Production&&!production)throw new Error('--p2-production requires the explicit --production action');
const directory='.local/deploy';await mkdir(directory,{recursive:true,mode:0o700});
const receiptPath=`${directory}/${target}-attempt-${attempt}.json`;
type Receipt={projectId:string;teamId:string;attempt:number;sourceSha256:string;files:{path:string;sha256:string;bytes:number}[];createdAt:string;id?:string;url?:string;readyState?:string};
let prior:Receipt|null=null;
try{prior=JSON.parse(await readFile(receiptPath,'utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
const auth=prepare&&!reuseProduction?null:JSON.parse(await readFile(join(homedir(),'.local/share/com.vercel.cli/auth.json'),'utf8'));
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
 // Reuse mode reads no local service credentials or private signing files.
 const env=reuseProduction?{}:parseEnv(await readFile('.env.local','utf8'));
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
 let existingProductionNames:string[]=[];
 const settings:Record<string,string>={P1_PROVIDER_MODE:'recorded-demo',P1_TRACING:'false',P1_SESSION_CAP_CENTS:'50',P1_SESSION_TIMEOUT_MS:'600000',SUPABASE_DB_SSLROOTCERT:'certs/supabase-roots.crt',ENABLE_EXPERIMENTAL_COREPACK:'1',P2_ENABLED:'0'};
 if(!reuseProduction){
 for(const key of ['SUPABASE_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_DB_URL']){if(!env[key])throw new Error(`Missing ${key}`);settings[key]=env[key];}
 if(production)settings.APP_ORIGIN='https://packproof-p0.vercel.app';
 if(settings.SUPABASE_PROJECT_REF!=='hvbzxeuedookkwleyjmx')throw new Error('Existing Supabase project required');
 // Vercel cannot use this project's IPv6-only direct endpoint. The override
 // is an ignored credential file, obtained and checked against the official
 // project pooler; never change the working local database configuration.
 if(process.env.PACKPROOF_PREVIEW_DB_URL_FILE)settings.SUPABASE_DB_URL=(await readFile(process.env.PACKPROOF_PREVIEW_DB_URL_FILE,'utf8')).trim();
 if(p2Enabled){
  const key=JSON.parse(await readFile('.local/p2/transfer-key.json','utf8'));
  const {rootPin}=await import('../../src/server/transfers/authority.js');const {databasePool}=await import('../../src/server/data/postgres.js');const {loadSources}=await import('../../src/server/transfers/authority.js');const {verifyRecordSet}=await import('../../src/domain/trust/evidence.js');
  const original=process.env.SUPABASE_DB_URL;process.env.SUPABASE_DB_URL=settings.SUPABASE_DB_URL;const pool=databasePool();try{const sources=await loadSources(pool,'packproof'),verified=await verifyRecordSet(sources.records,await rootPin(),new Date().toISOString());const grant=verified.directory.grants.get(key.kid);if(files.some(f=>Buffer.from(f.data,'base64').toString('utf8').includes(key.d)))throw new Error('Private receipt key bytes in upload');if(!grant||grant.data.publicKey.x!==key.x||grant.data.publicKey.y!==key.y||grant.data.revokedAt||grant.data.issuerId!==key.issuerId||JSON.stringify(grant.data.recordTypes)!==JSON.stringify(['transfer_receipt']))throw new Error('Separate receipt-only signer grant required');}finally{await pool.end();if(original===undefined)delete process.env.SUPABASE_DB_URL;else process.env.SUPABASE_DB_URL=original;}
  settings.P2_ENABLED='1';settings.TRANSFER_SIGNING_JWK=JSON.stringify(key);
 }
 const database=new URL(settings.SUPABASE_DB_URL!);
 if(!['postgres:','postgresql:'].includes(database.protocol)||!database.hostname.endsWith('.pooler.supabase.com')||decodeURIComponent(database.username)!==`postgres.${settings.SUPABASE_PROJECT_REF}`||database.port!=='5432'||database.pathname!=='/postgres'||!database.password||database.hash)throw new Error('Verified project IPv4 session-pooler URL on port 5432 required for Vercel preview');
 }else{
  const existing=await api(`/v9/projects/${projectId}/env?${query}&decrypt=false`);
  existingProductionNames=existing.envs.filter((v:{target?:string[]})=>v.target?.includes('production')).map((v:{key:string})=>v.key);
  for(const key of ['P1_PROVIDER_MODE','P2_ENABLED','SUPABASE_PROJECT_REF','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_DB_URL','SUPABASE_DB_SSLROOTCERT','TRANSFER_SIGNING_JWK','APP_ORIGIN'])if(!existingProductionNames.includes(key))throw new Error('Required existing Production configuration missing');
 }
 if(prepare){
  await writeFile(`${directory}/${target}-upload-manifest.json`,JSON.stringify({...receipt,environmentNames:reuseProduction?existingProductionNames:Object.keys(settings),credentialDestination:reuseProduction?'Existing Production variables inherited without writes':`existing Vercel project, encrypted ${target} environment`,productionChanged:false,target},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:'prepared',projectId,sourceSha256,uploadedFiles:0,preparedFiles:files.length,environmentNames:reuseProduction?existingProductionNames:Object.keys(settings),modelCredentialsIncluded:false,environmentWrites:0,networkRequests:reuseProduction?'Read-only existing Production variable names':p2Enabled?'database grant validation only':0}));
 }else{
 // Persist intent before any mutation; an uncertain outcome is never replayed.
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 if(!reuseProduction)await api(`/v10/projects/${projectId}/env?${query}&upsert=true`,'POST',Object.entries(settings).map(([key,value])=>({key,value,type:'encrypted',target:[target]})));
 const d=await api(`/v13/deployments?${query}`,'POST',{name:project!.name,project:projectId,files,...(production?{target:'production'}:{}),projectSettings:{framework:'nextjs',nodeVersion:'24.x',buildCommand:'pnpm build',installCommand:'pnpm install --frozen-lockfile',outputDirectory:null,rootDirectory:null,serverlessFunctionRegion:'fra1'},meta:{packproofPhase:manifest.some(f=>f.path==='src/app/inspector/page.tsx')?'P3':p2Enabled?'P2':'P1D',sourceSha256,providerMode:'recorded-demo',environment:target}});
 if(!d.id||!d.url)throw new Error('Deployment registration incomplete; inspect existing attempt');
 Object.assign(receipt,{id:d.id,url:`https://${d.url}`,readyState:d.readyState});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({id:d.id,url:`https://${d.url}`,readyState:d.readyState,projectId,sourceSha256,uploadedFiles:files.length,created:true,target,productionDeploymentRequested:production,modelCredentialsUploaded:false,receiptOnlySigningKeyUploaded:p2Enabled&&!reuseProduction,reusedExistingProductionEnvironment:reuseProduction}));
 }
}
