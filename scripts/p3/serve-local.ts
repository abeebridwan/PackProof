import {createServer} from 'node:https';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import next from 'next';
import type {NextServerOptions,NextBundlerOptions,NextServer} from 'next/dist/server/next.js';
import {P3Budget} from './budget.js';
import {LOCAL_VALIDATION,type LocalValidation} from '../../src/server/inspector/local-validation.js';
import {GroundedImageInspector} from '../../src/server/inspector/inspector.js';
import {PostgresInspectionRepository} from '../../src/server/inspector/repository.js';
import {SupabaseCaptureStorage,validateImage} from '../../src/server/investigator/captures.js';
import {groundedMeta} from '../../src/server/providers/grounded-meta.js';
import {InvestigationError} from '../../src/server/investigator/store.js';
const host=process.env.P3_LOCAL_HOST??'192.168.1.70',port=Number(process.env.P3_LOCAL_PORT??4174);
if(!/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)||!Number.isInteger(port)||port<1024||port>65535||process.env.VERCEL)throw new Error('private_local_server_only');
if(!process.env.MODEL_API_KEY)throw new Error('credentials_missing');
const photo=await readFile('.local/p3/physical-label.jpg'),approved=await validateImage(photo,'image/jpeg'),budget=new P3Budget();budget.status();
const origin=`https://${host}:${port}`;
// Keep an unexpired private link valid when restarting to repair the test UI.
const prior=await readFile('.local/p3/app-access.json','utf8').then(v=>JSON.parse(v) as {url:string;origin:string;expiresAt:string;unlockCode?:string}).catch(()=>null);
const reuse=prior?.origin===origin&&Date.parse(prior.expiresAt)>Date.now()&&/\/p3-access\/[a-f0-9]{64}$/.test(prior.url);
const access=reuse?prior!.url.split('/').at(-1)!:randomBytes(32).toString('hex'),expires=reuse?Date.parse(prior!.expiresAt):Date.now()+2*60*60*1000;
const unlockCode=reuse&&/^\d{8}$/.test(prior?.unlockCode??'')?prior!.unlockCode!:String(randomInt(10000000,100000000));
let unlockWindow=Date.now(),unlockAttempts=0;

Object.assign(process.env,{NODE_ENV:'development'});process.env.P3_LOCAL_LIVE='1';process.env.APP_ORIGIN=origin;process.env.P1_PROVIDER_MODE='recorded-demo';
const registration:LocalValidation={origin,inspector(pool){
 const repo=new PostgresInspectionRepository(pool),load=(c:Parameters<SupabaseCaptureStorage['read']>[0])=>new SupabaseCaptureStorage().read(c);
 const offline=new GroundedImageInspector(repo,c=>load(c.objectPath));
 const live=new GroundedImageInspector(repo,c=>load(c.objectPath),groundedMeta(process.env.MODEL_API_KEY!,budget));
 return {question:c=>offline.question(c),async inspect(c,q){
  const details=await repo.details(c);
  if(!details?.processingConsent)return offline.inspect(c,q);
  if(Date.now()>=expires||c.sha256!==approved.sha256)throw new InvestigationError('approved_photo_required',403);
  // Existing immutable results are read without spending or taking another lock.
  if((await repo.observations(c.investigationId)).some(o=>o.captureId===c.id&&o.question===q))return live.inspect(c,q);
  const unlock=budget.run();try{return await live.inspect(c,q);}finally{unlock();}
 }};
}};
(globalThis as typeof globalThis&{[LOCAL_VALIDATION]?:LocalValidation})[LOCAL_VALIDATION]=registration;
const app=(next as unknown as (options:NextServerOptions&NextBundlerOptions)=>NextServer)({dev:true,hostname:host,port,webpack:true}),handle=app.getRequestHandler();await app.prepare();
const equal=(v:string)=>v.length===access.length&&timingSafeEqual(Buffer.from(v),Buffer.from(access));
function accessPage(message='Enter the temporary code shown on your laptop.'){
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PackProof · local live test</title><style>body{font:17px system-ui;background:#f3f7ef;color:#163b32;margin:0;padding:28px}main{max-width:420px;margin:10vh auto;background:white;padding:24px;border-radius:16px}label,input,button{display:block;box-sizing:border-box;width:100%}input{font:22px system-ui;padding:12px;margin:12px 0 20px;border:1px solid #8ead88;border-radius:8px}button,a{padding:14px;background:#12663c;color:white;border:0;border-radius:8px;font:inherit}p{line-height:1.6}</style><main><h1>Local live test</h1><p>${message}</p><form method="post" action="/p3-unlock"><label for="code">Temporary access code</label><input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off" required><button>Open live Inspector</button></form><p>This unlocks only the approved photo test. Your Meta key stays on the laptop.</p></main></html>`;
}
const cookieHeader=()=>`packproof_p3_access=${access}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(0,Math.floor((expires-Date.now())/1000))}`;
const unlockedPage='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PackProof access granted</title><body style="font:20px system-ui;padding:32px"><h1>Access granted</h1><p><a href="/inspector">Open live Inspector</a></p><p>If you see the access form again, Chrome did not retain the local test cookie.</p></body></html>';
const server=createServer({cert:await readFile('.local/tls/phone-cert.pem'),key:await readFile('.local/tls/phone-key.pem')},(req,res)=>{
 const url=new URL(req.url??'/',origin);res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','same-origin');
 if(req.headers.host!==`${host}:${port}`||Date.now()>=expires){res.writeHead(403);res.end('Local test expired or invalid host.');return;}
 if(url.pathname.startsWith('/p3-access/')&&equal(url.pathname.slice('/p3-access/'.length))&&req.method==='GET'){
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Set-Cookie',cookieHeader());res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(unlockedPage);return;
 }
 if(url.pathname==='/p3-unlock'&&req.method==='POST'){
  if(req.headers.origin!==origin){res.writeHead(403);res.end('Open this form in Chrome on the local test address.');return;}
  if(Date.now()-unlockWindow>=60000){unlockWindow=Date.now();unlockAttempts=0;}
  if(++unlockAttempts>10){res.writeHead(429);res.end('Too many attempts. Wait one minute.');return;}
  let body='';req.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>256)req.destroy();});
  req.on('end',()=>{const code=new URLSearchParams(body).get('code')??'';if(code.length===8&&/^\d{8}$/.test(code)&&timingSafeEqual(Buffer.from(code),Buffer.from(unlockCode))){res.setHeader('Set-Cookie',cookieHeader());res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(unlockedPage);}else{res.writeHead(403,{'Content-Type':'text/html; charset=utf-8'});res.end(accessPage('That code did not match. Check the eight digits on the laptop.'));}});return;
 }
 const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('packproof_p3_access='))?.slice('packproof_p3_access='.length)??'';
 if(!equal(cookie)){res.writeHead(req.method==='GET'&&!url.pathname.startsWith('/api/')?200:403,{'Content-Type':'text/html; charset=utf-8'});res.end(accessPage());return;}
 if(url.pathname==='/api/p3-local-status'&&req.method==='GET'){const l=budget.status();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({live:true,approvedSourceSha256:approved.sha256,reservedUsd:l.requests.length/4,totalUsd:5,expiresAt:new Date(expires).toISOString()}));return;}
 if(url.pathname==='/p3-approved-photo'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="packproof-p3-test-label.jpg"','X-Content-Type-Options':'nosniff'});res.end(photo);return;}
 void handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503);res.end('Local inspection unavailable.');});
});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
await writeFile('.local/p3/app-access.json',JSON.stringify({url:`${origin}/p3-access/${access}`,origin,unlockCode,expiresAt:new Date(expires).toISOString(),approvedSourceSha256:approved.sha256},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'ready',origin,accessFile:'.local/p3/app-access.json',expiresAt:new Date(expires).toISOString(),approvedPhotoOnly:true,sharedBudgetUsd:5,modelKeyOnLaptopOnly:true}));
async function stop(){server.close();await app.close();process.exit(0);}process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
