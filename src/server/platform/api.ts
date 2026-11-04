import {z} from 'zod';
import {API_OPERATIONS,ApiError,type Operation,type Input,type Output,type ApiScope,NoticeEvents} from '../../contracts/api-v1.js';
import {Observation,publicObservation,CaptureDetails} from '../../contracts/inspection.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {authenticatedUser} from '../transfers/http.js';
import {TransferDatabase,TransferError} from '../transfers/database.js';
import {TransferService,configuredSigner} from '../transfers/service.js';
import {ensureAuthoritySnapshot,configuredAuthoritySigner} from '../transfers/snapshot.js';
import {rootPin,loadSources} from '../transfers/authority.js';
import {createEvidenceServices} from '../evidence/services.js';
import {verifyRecordSet} from '../../domain/trust/evidence.js';
import {finalize,factCatalog} from '../investigator/finalizer.js';
import {runtime as investigationRuntime} from '../investigator/runtime.js';
import {startInvestigation,resumeInvestigation,publicView} from '../investigator/graph.js';
import {saveCapture,SupabaseCaptureStorage} from '../investigator/captures.js';
import {session,sameOrigin} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {InvestigationError} from '../investigator/store.js';
import {createPack} from '../offline/service.js';
import {platformPool,platformIdentity,platformTransaction,platformLimit,type PlatformIdentity} from './database.js';
import {dualproof,linkEvidence,evidenceHistory,captureFromRow} from './dualproof.js';
import {createDraft} from './accounts.js';
export type ApiContext={identity:PlatformIdentity|null;scopes:ApiScope[];setCookie:string|null};
export async function apiContext(request:Request,operation:Operation):Promise<ApiContext>{
 const descriptor=API_OPERATIONS[operation],authorization=request.headers.get('authorization');
 if(authorization?.startsWith('Bearer ppk_')){
  await platformLimit('api-auth-global',2400);
  const key=authorization.slice(7);if(!/^ppk_[a-f0-9]{64}$/.test(key))throw new TransferError('invalid_api_key',401);
  const row=await platformTransaction(null,async c=>(await c.query('SELECT * FROM packproof.resolve_developer_key($1)',[await sha256(utf8(key))])).rows[0]);
  if(!row)throw new TransferError('invalid_api_key',401);if(!row.scopes.includes(descriptor.scope))throw new TransferError('insufficient_scope',403);
  await platformLimit(`api-key:${row.key_id}`,120);return {identity:{...await platformIdentity(row.user_id),sessionHash:await sha256(utf8(`developer:${row.key_id}`))},scopes:row.scopes,setCookie:null};
 }
 if(descriptor.publicRead&&!authorization){await platformLimit('api-public-global',1200);return {identity:null,scopes:['evidence:read'],setCookie:null};}
 const userId=await authenticatedUser(request);await platformLimit(`api-user:${userId}`,300);
 if(!authorization&&request.method!=='GET')sameOrigin(request);
 const identity=await platformIdentity(userId);
 if(authorization)return {identity:{...identity,sessionHash:await sha256(utf8(`bearer:${userId}`))},scopes:[...new Set(Object.values(API_OPERATIONS).map(o=>o.scope))],setCookie:null};
 const auth=await session(request,true);return {identity:{...identity,sessionHash:auth.owner.sessionHash},scopes:[...new Set(Object.values(API_OPERATIONS).map(o=>o.scope))],setCookie:auth.setCookie};
}
export async function executeOperation<K extends Operation>(operation:K,raw:Input<K>,auth:ApiContext,request?:Request):Promise<Output<K>>{
 const descriptor=API_OPERATIONS[operation],input=descriptor.input.parse(raw) as any;
 if(!descriptor.publicRead&&(!auth.identity||!auth.scopes.includes(descriptor.scope)))throw new TransferError('insufficient_scope',403);
 let result:unknown;
 const who=auth.identity;
 if(['products.lookup','products.relationships','sellers.authority','notices.list','history.get','notices.events','verification.summary','ownership.get'].includes(operation)){
  const dataset=await platformTransaction(who,c=>loadSources(c,'packproof')),services=createEvidenceServices({load:async()=>dataset},await rootPin());
  if(operation==='products.lookup'||operation==='products.relationships')result=await services.lookupProduct(input);
  if(operation==='sellers.authority')result=await services.lookupSeller(input);
  if(operation==='notices.list')result=await services.getProductNotices(input);
  if(operation==='history.get')result=await services.getCustodyHistory(input);
  if(operation==='verification.summary'){
   const product=await services.lookupProduct({namespace:input.namespace,productMark:input.productMark,packagingMark:input.packagingMark});const item=product.data?.itemId;
   const selected={lookup_product:product,...(item?{get_product_notices:await services.getProductNotices({itemId:item}),get_custody_history:await services.getCustodyHistory({itemId:item}),...(input.sellerId?{lookup_seller:await services.lookupSeller({itemId:item,sellerId:input.sellerId})}:{})}:{})};
   result=await finalize({input,services,selected,answer:{claimIds:factCatalog(selected).map(f=>f.id)},error:null});
  }
  if(operation==='ownership.get'){
   const p=dataset.products.find(p=>p.itemId===input.itemId);if(!p)throw new TransferError('not_found',404);
   // Participant/owner-only dated reference, after the same signed owner check.
   if(p.registeredOwnerId!==who!.actorId){const allowed=await platformTransaction(who,async c=>(await c.query('SELECT id FROM packproof.transfer_sessions WHERE item_id=$1 LIMIT 1',[p.itemId])).rowCount);if(!allowed)throw new TransferError('not_found',404);}
   const checked=await services.lookupSeller({itemId:p.itemId,sellerId:p.registeredOwnerId});if(checked.status!=='supported')throw new TransferError('owner_validation_failed');
   result={itemId:p.itemId,ownerActorId:p.registeredOwnerId,ownerVersion:p.ownerVersion,sourceRecordId:p.ownerRecordId,asOf:checked.asOf,physicalAssociation:'unresolved'};
  }
  if(operation==='notices.events'){
   const notices=await services.getProductNotices(input);if(notices.status!=='supported'||!notices.data)throw new TransferError('notice_validation_unavailable',503);
   const checked=await verifyRecordSet(dataset.records,await rootPin(),notices.asOf);
   result=NoticeEvents.parse({schemaVersion:1,asOf:notices.asOf,events:await Promise.all(notices.data.notices.map(async n=>{const source=checked.verified.get(n.recordId)?.record;if(source?.type!=='notice')throw new TransferError('notice_validation_unavailable',503);const hash=await sha256(utf8(`${n.recordId}:${input.itemId}:1`));return {schemaVersion:1,eventId:`${hash.slice(0,8)}-${hash.slice(8,12)}-8${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`,idempotencyKey:hash,sourceRecordId:n.recordId,itemId:input.itemId,scope:source.scope,type:n.kind,status:'effective',effectiveFrom:n.effectiveFrom,effectiveUntil:n.effectiveUntil,message:n.explanation,demo:true,asOf:notices.asOf,directoryVersion:notices.data!.directoryVersion,provenance:'verified_signed_record',broadcastEligible:true};}))});
  }
 }else if(operation==='products.draft')result=await createDraft(who!,input);
 else if(operation==='evidence.attach')result=await linkEvidence(who!,input);
 else if(operation==='evidence.history'){if(input.transferId&&!auth.scopes.includes('transfer:read'))throw new TransferError('insufficient_scope',403);const rows=await evidenceHistory(who!,input.transferId?{transferId:input.transferId}:{draftId:input.draftId});result=rows.map(({mediaUrl,...row})=>({...row,created_at:new Date(row.created_at).toISOString()}));}
 else if(operation==='dualproof.get')result=await dualproof(who!,input.transferId,false);
 else if(operation==='packs.create')result=(await createPack(input,who!.userId)).pack;
 else if(operation.startsWith('transfers.')){
  const service=new TransferService(new TransferDatabase(platformPool()),await rootPin(),await configuredSigner());
  if(operation==='transfers.eligibility')result=await service.eligibility(who!.actorId,input);
  if(operation==='transfers.get')result=await service.get(who!.actorId,input.id);
  if(operation==='transfers.receipt')result=await service.receiptProof(who!.actorId,input.id);
  if(operation==='transfers.propose'){if(process.env.P2_ENABLED!=='1')throw new TransferError('chainproof_not_enabled',503);if(!request)throw new TransferError('idempotency_required',400);const key=z.uuid().parse(request.headers.get('idempotency-key'));await ensureAuthoritySnapshot(service.db,service.pin,who!.actorId,input.itemId,input.sellerActorId,await configuredAuthoritySigner());result=await service.create(who!.actorId,key,input,await sha256(utf8(JSON.stringify(input))));}
 }else{
  const owner={userId:who!.userId,sessionHash:who!.sessionHash!},context=await investigationRuntime(owner);
  try{
   if(operation==='investigations.start'){if(input.captureId!==null)throw new TransferError('create_capture_after_request',400);result=await startInvestigation(context.options,input);}
   if(operation==='investigations.get')result=await publicView(context.store,owner,input.id);
   if(operation==='investigations.resume')result=await resumeInvestigation(context.options,input.id,input.resume);
   if(operation==='inspections.get'){await context.store.get(owner,input.id);const [rows,captures]=await Promise.all([context.pool.query('SELECT observation FROM packproof.inspection_observations WHERE investigation_id=$1 ORDER BY created_at LIMIT 128',[input.id]),context.pool.query('SELECT c.*,d.details FROM packproof.captures c LEFT JOIN packproof.capture_details d ON d.capture_id=c.id WHERE c.investigation_id=$1 ORDER BY c.uploaded_at,c.id LIMIT 32',[input.id])]);result={observations:rows.rows.map(v=>publicObservation(Observation.parse(v.observation))),captures:captures.rows.map(v=>{const {objectPath,...metadata}=captureFromRow(v);return {...metadata,processingConsent:v.details?CaptureDetails.parse(v.details).processingConsent:null};}),physicalAssociation:'unresolved'};}
   if(operation==='captures.submit'){
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))throw new TransferError('invalid_image',400);
    result=await saveCapture(context.store,owner,new SupabaseCaptureStorage(),{...input,bytes:new Uint8Array(Buffer.from(input.base64,'base64'))});
   }
  }finally{await context.close();}
 }
 return descriptor.output.parse(result) as Output<K>;
}
export function apiFailure(error:unknown){const known=error instanceof TransferError||error instanceof InvestigationError;const status=known?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503;const code=known?error.code:status===400?'invalid_request':'service_unavailable';return Response.json(ApiError.parse({apiVersion:'1',error:code,message:code.replaceAll('_',' ')}),{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...(status===429?{'retry-after':'3600'}:{})}});}
export async function apiHttp(request:Request,operation:string){try{
 if(request.method!=='POST')throw new TransferError('method_not_allowed',405);
 if(!Object.hasOwn(API_OPERATIONS,operation))throw new TransferError('not_found',404);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new TransferError('json_required',415);
 const op=operation as Operation,raw=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(request,3*1024*1024))),auth=await apiContext(request,op);
 const result=await executeOperation(op,raw,auth,request);return Response.json(result,{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff','x-packproof-api-version':'1',...(auth.setCookie?{'set-cookie':auth.setCookie}:{})}});
}catch(e){return apiFailure(e);}}
