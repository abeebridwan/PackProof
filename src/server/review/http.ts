import {z} from 'zod';
import {sameOrigin} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {authenticatedUser} from '../transfers/http.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {projectUrl} from '../../../scripts/spikes/infrastructure.js';
import {reviewTransaction} from './database.js';
import {reviewer,REVIEW_GRANT} from './budget.js';
const json=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...(cookie?{'set-cookie':cookie}:{})}});
export async function reviewHttp(request:Request,operation:string){
 try{
  if(operation==='status'&&request.method==='GET'){
   let user:string|null=null;try{user=await authenticatedUser(request);}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='sign_in_required'))throw e;}
   const access=await reviewer(user);
   if(!access)return json({authenticated:!!user,reviewer:false,live:false});
   const details=await reviewTransaction(async c=>({
    budget:(await c.query('SELECT enabled,reserved_cents,limit_cents FROM packproof.review_budget WHERE id=$1',[REVIEW_GRANT])).rows[0],
    units:(await c.query('SELECT u.item_id AS id,u.product_mark AS product,u.packaging_mark AS packaging,u.seller_id AS seller,i.owner_version AS version,(i.registered_owner_id=u.seller_id) AS available FROM packproof.review_units u JOIN packproof.items i ON i.id=u.item_id WHERE u.pair_id=$1 ORDER BY u.product_mark',[access.pair_id])).rows,
   }));
   const budget=details.budget;const live=process.env.REVIEW_LIVE_ENABLED==='1'&&!!process.env.MODEL_API_KEY&&budget?.enabled===true&&budget.reserved_cents<budget.limit_cents;
   return json({authenticated:true,reviewer:true,role:access.role,live,remainingCents:budget?budget.limit_cents-budget.reserved_cents:0,expiresAt:access.expires_at,units:details.units});
  }
  if(operation!=='enter'||request.method!=='POST')return json({error:'not_found'},404);
  sameOrigin(request);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'json_required'},415);
  const {code}=z.strictObject({code:z.string().regex(/^[A-Za-z0-9_-]{32}$/)}).parse(JSON.parse(new TextDecoder().decode(await bodyBytes(request,512))));
  // High entropy invitations plus a durable global limit; never log an invitation.
  const access=await reviewTransaction(async c=>{
   const rate=(await c.query("INSERT INTO packproof.review_login_limits VALUES(date_trunc('minute',now()),1) ON CONFLICT(bucket) DO UPDATE SET attempts=packproof.review_login_limits.attempts+1 RETURNING attempts")).rows[0];
   if(rate.attempts>20)return null;
   return (await c.query('SELECT email,user_id FROM packproof.review_access WHERE invite_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[await sha256(utf8(code))])).rows[0]??null;
  });
  if(!access)return json({error:'invalid_invitation',message:'This reviewer code is invalid, expired or temporarily limited. Ask the project operator for your own code.'},401);
  const origin=projectUrl(process.env.SUPABASE_URL??'',process.env.SUPABASE_PROJECT_REF??''),secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)throw new Error('auth_unavailable');
  const headers={apikey:secret,authorization:`Bearer ${secret}`,'content-type':'application/json'};
  const generated=await fetch(new URL('/auth/v1/admin/generate_link',origin),{method:'POST',headers,body:JSON.stringify({type:'magiclink',email:access.email}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!generated.ok)throw new Error('auth_unavailable');
  const link=z.object({hashed_token:z.string().min(1).max(256)}).parse(await generated.json());
  const verified=await fetch(new URL('/auth/v1/verify',origin),{method:'POST',headers,body:JSON.stringify({type:'magiclink',token_hash:link.hashed_token}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!verified.ok)throw new Error('auth_unavailable');
  const auth=z.object({access_token:z.string().max(8192),expires_in:z.number().positive(),user:z.object({id:z.literal(access.user_id)})}).parse(await verified.json());
  return json({authenticated:true},200,`packproof_auth=${auth.access_token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.min(3600,Math.floor(auth.expires_in))}${new URL(request.url).protocol==='https:'?'; Secure':''}`);
 }catch(e){return json({error:e instanceof z.ZodError||e instanceof SyntaxError?'invalid_request':'review_unavailable',message:'Reviewer access is unavailable. Your existing records are unchanged.'},e instanceof z.ZodError||e instanceof SyntaxError?400:503);}
}
