import {z} from 'zod';
import {CreateTransfer,SignedRequest,ScanRequest,FrameUpload,EnrollRequest,Login,CancelRequest,Direction} from '../../contracts/transfer.js';
import {sameOrigin} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {InvestigationError} from '../investigator/store.js';
import {databasePool} from '../data/postgres.js';
import {TransferDatabase,TransferError} from './database.js';
import {TransferService,configuredSigner,type ReceiptSigner} from './service.js';
import {rootPin,SELLER_REFUSAL} from './authority.js';
import {projectUrl,publicKeyAllowed} from '../../../scripts/spikes/infrastructure.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {Signup} from '../../contracts/platform.js';
import {saveProfile,profile} from '../platform/accounts.js';
import {platformIdentity,platformLimit} from '../platform/database.js';
import {ensureAuthoritySnapshot,configuredAuthoritySigner} from './snapshot.js';
const COOKIE='packproof_auth';
const response=(v:unknown,status=200,cookie?:string)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...(cookie?{'set-cookie':cookie}:{})}});
const enabled=()=>process.env.P2_ENABLED==='1';
// Reuse transport connections only. Identity is authenticated on every request;
// TransferDatabase sets role/actor/user with SET LOCAL on a checked-out client.
// No actor, authority result or signed record is cached across requests.
let sharedPool:ReturnType<typeof databasePool>|null=null;
function transferDatabase(){
 if(!sharedPool){sharedPool=databasePool();sharedPool.on('error',()=>{/* pg removes failed idle clients; the next request reconnects. */});}
 return new TransferDatabase(sharedPool);
}
function token(request:Request){const authorization=request.headers.get('authorization');const value=authorization?.startsWith('Bearer ')?authorization.slice(7):request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!value||value.length>8192||!/^[-A-Za-z0-9_.]+$/.test(value))throw new TransferError('sign_in_required',401);return value;}
function authHeaders(bearer?:string){const key=process.env.SUPABASE_PUBLISHABLE_KEY??'';if(!publicKeyAllowed(key))throw new TransferError('auth_unavailable',503);return {apikey:key,'content-type':'application/json',...(bearer?{authorization:`Bearer ${bearer}`}:{})};}
function authUrl(path:string){return new URL(`/auth/v1/${path}`,projectUrl(process.env.SUPABASE_URL??'',process.env.SUPABASE_PROJECT_REF??''));}
export async function authenticatedUser(request:Request){const value=token(request);const r=await fetch(authUrl('user'),{headers:authHeaders(value),redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new TransferError('sign_in_required',401);return z.object({id:z.uuid()}).parse(await r.json()).id;}
async function body(r:Request){if(!r.headers.get('content-type')?.startsWith('application/json'))throw new TransferError('json_required',415);const raw=new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(r,256000));return {value:JSON.parse(raw),hash:await sha256(utf8(raw))};}
const key=(r:Request)=>z.uuid().parse(r.headers.get('idempotency-key'));
export async function transferHttp(request:Request,kind:'auth'|'device'|'transfer',parts:string[]=[],testDependencies?:{db:TransferDatabase;signer:ReceiptSigner|null}){
 const receivedAt=new Date().toISOString();
 try{
  if(kind==='auth'&&parts.join('/')==='status'&&request.method==='GET')return response({enabled:enabled()});
  if(!enabled())return response({enabled:false,error:'chainproof_not_enabled'},503);
  const method=request.method,path=parts.join('/');if(method!=='GET')sameOrigin(request);
  if(kind==='auth'&&path==='signup'&&method==='POST'){
   const input=Signup.parse((await body(request)).value);await platformLimit('signup-global',30);
   // Public signup never uses the admin API or auto-confirms an email address.
   const r=await fetch(authUrl('signup'),{method:'POST',headers:authHeaders(),body:JSON.stringify({email:input.email,password:input.password,data:{account_type:input.accountType,display_name:input.displayName}}),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok){const error=await r.json().catch(()=>null);const allowed=['email_address_invalid','email_address_not_authorized','signup_disabled','over_email_send_rate_limit','weak_password','user_already_exists'];const providerCode=error?.error_code??error?.code;const code=allowed.includes(providerCode)?providerCode:r.status===429?'rate_limit':'signup_failed';throw new TransferError(code,r.status===429?429:400);}
   const v=z.object({access_token:z.string().max(8192).optional(),expires_in:z.number().positive().optional()}).passthrough().parse(await r.json());
   if(!v.access_token)return response({authenticated:false,confirmationRequired:true,message:'Check your email to confirm your account, then sign in.'},202);
   const cookie=`${COOKIE}=${v.access_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.min(3600,Math.floor(v.expires_in??3600))}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
   const userId=await authenticatedUser(new Request(request.url,{headers:{authorization:`Bearer ${v.access_token}`}}));await saveProfile(await platformIdentity(userId),{accountType:input.accountType,displayName:input.displayName});
   return response({authenticated:true,confirmationRequired:false},201,cookie);
  }
  if(kind==='auth'&&path==='login'&&method==='POST'){
   const input=Login.parse((await body(request)).value);
   const r=await fetch(authUrl('token?grant_type=password'),{method:'POST',headers:authHeaders(),body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new TransferError(r.status===429?'rate_limit':'invalid_login',r.status===429?429:401);
   const v=z.object({access_token:z.string().max(8192),expires_in:z.number().positive(),user:z.object({id:z.uuid(),user_metadata:z.record(z.string(),z.unknown()).optional()}).optional()}).parse(await r.json());
   if(v.user?.user_metadata){const metadata=v.user.user_metadata;const identity=await platformIdentity(v.user.id);if(!(await profile(identity)).profileConfigured){const selected=Signup.omit({email:true,password:true}).safeParse({accountType:metadata.account_type,displayName:metadata.display_name});if(selected.success)await saveProfile(identity,selected.data);}}
   const secure=new URL(request.url).protocol==='https:';
   return response({authenticated:true},200,`${COOKIE}=${v.access_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.min(3600,Math.floor(v.expires_in))}${secure?'; Secure':''}`);
  }
  if(kind==='auth'&&path==='logout'&&method==='POST'){
   const value=token(request);await fetch(authUrl('logout?scope=local'),{method:'POST',headers:authHeaders(value),redirect:'error',signal:AbortSignal.timeout(8000)});
   return response({authenticated:false},200,`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${new URL(request.url).protocol==='https:'?'; Secure':''}`);
  }
  const userId=await authenticatedUser(request);const db=testDependencies?.db??transferDatabase(),actor=await db.actor(userId),service=new TransferService(db,await rootPin(),testDependencies?testDependencies.signer:await configuredSigner());
  if(kind==='auth'&&path==='session'&&method==='GET')return response({enabled:true,authenticated:true,...await service.account(actor),...await profile({userId,actorId:actor})});
  if(kind==='device'){
   if(method!=='POST')throw new TransferError('method_not_allowed',405);
   if(path==='challenge'){const b=await body(request);z.strictObject({}).parse(b.value);return response(await service.enrollment(actor,userId,key(request),b.hash),201);}
   if(path==='enroll'){const b=await body(request);return response(await service.enroll(actor,userId,key(request),EnrollRequest.parse(b.value),b.hash),201);}
   if(path==='revoke'){const b=await body(request);z.strictObject({}).parse(b.value);return response(await service.revoke(actor,key(request),b.hash));}
  }
  if(kind==='transfer'){
   if(parts.length===0&&method==='POST'){const b=await body(request),input=CreateTransfer.parse(b.value);await ensureAuthoritySnapshot(db,service.pin,actor,input.itemId,input.sellerActorId,await configuredAuthoritySigner());return response(await service.create(actor,key(request),input,b.hash),201);}
   if(parts[0]==='resolve'&&parts.length===1&&method==='POST'){const b=z.strictObject({handle:z.string().regex(/^cp2_[a-f0-9]{32}$/)}).parse((await body(request)).value);return response(await service.resolve(actor,b.handle));}
   const id=z.uuid().parse(parts[0]);
   if(parts.length===2&&parts[1]==='receipt-proof'&&method==='GET')return response(await service.receiptProof(actor,id));
   if(parts.length===1&&method==='GET')return response(await service.get(actor,id));
   if(parts.length===2&&parts[1]==='frames'&&method==='GET')return response(await service.display(actor,id,Direction.parse(new URL(request.url).searchParams.get('direction'))));
   if(method!=='POST')throw new TransferError('method_not_allowed',405);
   const b=await body(request),operation=parts.slice(1).join('/');
   if(operation==='offer')return response(await service.offer(actor,id,key(request),SignedRequest.parse(b.value).signature,b.hash));
   if(operation==='frames/prepare')return response(await service.prepareFrames(actor,id,key(request),z.strictObject({direction:Direction}).parse(b.value).direction,b.hash));
   if(operation==='frames')return response(await service.uploadFrames(actor,id,key(request),FrameUpload.parse(b.value),b.hash));
   if(operation==='scan')return response(await service.scan(actor,id,key(request),ScanRequest.parse(b.value).handles,b.hash,receivedAt));
   if(operation==='seller-approve')return response(await service.approve(actor,id,key(request),SignedRequest.parse(b.value).signature,b.hash));
   if(operation==='confirm'){const result=await service.confirm(actor,id,key(request),SignedRequest.parse(b.value).signature,b.hash);await service.receipt(actor,id);return response(result);}
   if(operation==='cancel'){const input=CancelRequest.parse(b.value);return response(await service.cancel(actor,id,key(request),input.reason,input.signature,b.hash));}
  }
  throw new TransferError('not_found',404);
 }catch(e){
  const known=e instanceof TransferError||e instanceof InvestigationError;
  const signature=e instanceof Error&&(/^(invalid_device_|signed_action_)/.test(e.message)||e.name.startsWith('JWS')||e.name.startsWith('JOSE'));
  const status=known?e.status:e instanceof z.ZodError||e instanceof SyntaxError||signature?400:503;
  const code=known?e.code:signature?'invalid_signature':status===400?'invalid_request':'transfer_unavailable';
  const messages:Record<string,string>={invalid_scan_sequence:'Keep the QR in view. Three fresh consecutive frames are required.',three_distinct_frames_required:'Keep scanning until three different consecutive frames are seen.',wrong_direction:'Scan the other participant’s QR for the current step.',scan_already_consumed:'This QR direction was already checked. Reload the handover to recover its approval.',consent_expired_or_mismatched:'The approval window expired or did not match this agreement. Reload the handover before continuing.',insufficient_session_time:'There is not enough time left for another QR exchange. Cancel this handover and prepare a new agreement.',receipt_signer_unavailable:'Receipt signing is not configured. No new transfer can be recorded; reload to recover an existing handover.',seller_not_authorized:SELLER_REFUSAL,current_authority_snapshot_required:'A current issuer-signed ownership snapshot is required. No transfer was made.',stale_authority:'The signed ownership snapshot is stale. Ask the issuer for a current record.',ownership_conflict:'Registered ownership changed. This agreement cannot transfer the item.',sign_in_required:'Sign in to your account to use ChainProof.',active_enrolled_device_required:'An active enrolled device is required for each participant.',invalid_login:'Sign-in failed. Check your account details.',transfer_expired:'This handover has expired. No new transfer can be committed with it.',invalid_signature:'The device signature could not be verified.',already_committed_recover_with_get:'This handover is already recorded. Reload its status to recover the receipt.'};
  return response({error:code,message:messages[code]??(status===503?'ChainProof is unavailable. Reload the same handover to check its state before trying again.':code.replaceAll('_',' '))},status);
 }
}
