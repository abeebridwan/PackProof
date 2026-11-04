import {z} from 'zod';
import {authenticatedUser} from '../transfers/http.js';
import {sameOrigin,session} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {TransferError} from '../transfers/database.js';
import {InvestigationError} from '../investigator/store.js';
import {platformIdentity,platformLimit,platformTransaction} from './database.js';
import {profile,saveProfile,createDraft,listDrafts,ownedItems,createDeveloperKey,developerKeys,revokeDeveloperKey,rotateDeveloperKey} from './accounts.js';
import {linkEvidence,evidenceHistory,dualproof,sharedMedia} from './dualproof.js';
import {saveVideo,readVideo} from './video.js';
export const privateJson=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
export function platformError(e:unknown){const known=e instanceof TransferError||e instanceof InvestigationError;const code=known?e.code:e instanceof z.ZodError||e instanceof SyntaxError?'invalid_request':'platform_unavailable';return privateJson({error:code,message:known?code.replaceAll('_',' '):code==='invalid_request'?'Check the supplied fields.':'This operation is unavailable. Existing signed records are unchanged.'},known?e.status:code==='invalid_request'?400:503);}
export async function platformBody(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new TransferError('json_required',415);return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(request,16000)));}
export async function platformHttp(request:Request,parts:string[]){try{
 const userId=await authenticatedUser(request),who=await platformIdentity(userId);await platformLimit(`platform:${userId}`,300);
 if(request.method!=='GET')sameOrigin(request);
 const operation=parts.join('/'),method=request.method;
 if(method==='GET'){
  if(operation==='profile')return privateJson(await profile(who));
  if(operation==='drafts')return privateJson(await listDrafts(who));
  if(operation==='items')return privateJson(await ownedItems(who));
  if(operation==='transfer-context'){const id=z.uuid().parse(new URL(request.url).searchParams.get('transferId'));const context=await platformTransaction(who,async c=>{const row=(await c.query('SELECT t.id,t.item_id,t.seller_actor_id,r.product_mark,r.packaging_mark FROM packproof.transfer_sessions t JOIN packproof.marking_relations r ON r.item_id=t.item_id WHERE t.id=$1',[id])).rows[0];if(!row)throw new TransferError('not_found',404);return {transferId:row.id,itemId:row.item_id,product:row.product_mark,pack:row.packaging_mark,side:row.seller_actor_id===who.actorId?'dispatch':'arrival',};});return privateJson({...context,relatedEvidence:await evidenceHistory(who,{transferId:id})});}
  if(operation==='developer-keys')return privateJson(await developerKeys(who));
  if(parts[0]==='video'&&parts.length===2){const result=await readVideo(who,z.uuid().parse(parts[1]));return new Response(new Uint8Array(result.bytes),{headers:{'content-type':result.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});}
  if(parts[0]==='media'&&parts.length===2){const result=await sharedMedia(who,z.uuid().parse(parts[1]),new URL(request.url).searchParams.get('kind')??'original');return new Response(new Uint8Array(result.bytes),{headers:{'content-type':result.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; sandbox"}});}
  if(operation==='history'){const u=new URL(request.url);return privateJson(await evidenceHistory(who,u.searchParams.has('transferId')?{transferId:u.searchParams.get('transferId')!}:{draftId:u.searchParams.get('draftId')!}));}
  if(operation==='handovers')return privateJson(await platformTransaction(who,async c=>(await c.query('SELECT id,item_id,seller_actor_id,buyer_actor_id,state,created_at FROM packproof.transfer_sessions ORDER BY created_at DESC LIMIT 50')).rows));
 }
 if(method==='POST'){
  if(operation==='video')return privateJson(await saveVideo(request,who),201);
  const input=await platformBody(request);
  if(operation==='profile')return privateJson(await saveProfile(who,input));
  if(operation==='drafts')return privateJson(await createDraft(who,input),201);
  if(operation==='developer-keys')return privateJson(await createDeveloperKey(who,input),201);
  if(operation==='developer-keys/revoke')return privateJson(await revokeDeveloperKey(who,z.strictObject({id:z.uuid()}).parse(input).id));
  if(operation==='developer-keys/rotate')return privateJson(await rotateDeveloperKey(who,z.strictObject({id:z.uuid()}).parse(input).id));
  if(operation==='evidence'){const auth=await session(request);return privateJson(await linkEvidence({...who,sessionHash:auth.owner.sessionHash},input),201);}
  if(operation==='compare')return privateJson(await dualproof(who,z.strictObject({transferId:z.uuid()}).parse(input).transferId));
 }
 throw new TransferError('not_found',404);
}catch(e){return platformError(e);}}
