import {randomBytes} from 'node:crypto';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {InvestigationError} from '../investigator/store.js';
import {projectUrl,publicKeyAllowed} from '../../../scripts/spikes/infrastructure.js';
import {z} from 'zod';
export const SESSION_COOKIE='packproof_session';
export async function session(request:Request,create=false){
 const raw=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
 let token=raw&&/^[a-f0-9]{64}$/.test(raw)?raw:null;
 if(!token&&!create)throw new InvestigationError('session_required',401);
 let setCookie:string|null=null;
 if(!token){token=randomBytes(32).toString('hex');const secure=new URL(request.url).protocol==='https:';setCookie=`${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure?'; Secure':''}`;}
 let userId:string|null=null;
 const bearer=request.headers.get('authorization');
 if(bearer){
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer)||bearer.length>8192)throw new InvestigationError('invalid_session',401);
  const origin=projectUrl(process.env.SUPABASE_URL??'',process.env.SUPABASE_PROJECT_REF??'');const key=process.env.SUPABASE_PUBLISHABLE_KEY??'';
  if(!publicKeyAllowed(key))throw new InvestigationError('auth_unavailable',503);
  const response=await fetch(new URL('/auth/v1/user',origin),{headers:{apikey:key,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(response.status!==200)throw new InvestigationError('invalid_session',401);
  userId=z.object({id:z.uuid()}).parse(await response.json()).id;
 }
 return {owner:{sessionHash:await sha256(utf8(token)),userId},setCookie};
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');const url=new URL(request.url);const expected=process.env.APP_ORIGIN?.trim()||new URL(`${url.protocol}//${request.headers.get('host')??url.host}`).origin;if(!origin||origin!==expected||request.headers.get('sec-fetch-site')==='cross-site')throw new InvestigationError('cross_origin_denied',403);}
