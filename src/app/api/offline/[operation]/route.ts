import {packBootstrap,createPack} from '../../../../server/offline/service';
import {authenticatedUser} from '../../../../server/transfers/http';
import {sameOrigin} from '../../../../server/auth/session';
import {bodyBytes} from '../../../../server/auth/body';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
async function handle(r:Request,c:{params:Promise<{operation:string}>}){try{const {operation}=await c.params;
 if(operation==='bootstrap'&&r.method==='GET')return Response.json(await packBootstrap(),{headers});
 if(operation==='packs'&&r.method==='POST'){sameOrigin(r);const user=await authenticatedUser(r);if(!r.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'json_required'},{status:415,headers});const result=await createPack(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(r,2048))),user);return new Response(JSON.stringify(result.pack),{headers:{...headers,'content-type':'application/json','content-disposition':`attachment; filename="${result.filename}"`,'x-pack-bytes':String(result.bytes),'server-timing':`pack;dur=${result.creationMs}`}});}
 return Response.json({error:'not_found'},{status:404,headers});
 }catch(e){const code=e instanceof Error?e.message:'';const signIn=code.includes('sign_in_required')||(e&&typeof e==='object'&&'code'in e&&e.code==='sign_in_required');return Response.json({error:signIn?'sign_in_required':/^(pack_|unknown_pack_item|owner_|unexportable_)/.test(code)?code:'offline_service_unavailable'},{status:signIn?401:503,headers});}}
export const GET=handle,POST=handle;
