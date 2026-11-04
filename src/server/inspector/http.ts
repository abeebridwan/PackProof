import {z} from 'zod';
import {session} from '../auth/session.js';
import {runtime} from '../investigator/runtime.js';
import {InvestigationError} from '../investigator/store.js';
import {SupabaseCaptureStorage} from '../investigator/captures.js';
import {PostgresInspectionRepository} from './repository.js';
import {Capture} from '../../contracts/investigation.js';
import {CaptureDetails} from '../../contracts/inspection.js';
import {publicObservation} from '../../contracts/inspection.js';
import {comparison,renderRegion,verifySource} from './grounding.js';
const headers={'cache-control':'private, no-store, max-age=0','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; sandbox"};
export async function inspectionHttp(request:Request,id:string,media?:{captureId:string;kind:string}){
 let context:Awaited<ReturnType<typeof runtime>>|null=null;
 try{
  z.uuid().parse(id);const auth=await session(request);context=await runtime(auth.owner);
  await context.store.limit(`inspection-read:${auth.owner.sessionHash}`,300,3600000);
  const row=await context.store.get(auth.owner,id);const repo=new PostgresInspectionRepository(context.pool);
  const observations=await repo.observations(id);
  if(!media){const captures=await context.pool.query('SELECT c.*,d.details FROM packproof.captures c LEFT JOIN packproof.capture_details d ON d.capture_id=c.id AND d.investigation_id=c.investigation_id WHERE c.investigation_id=$1 ORDER BY c.uploaded_at,c.id',[id]);return Response.json({mode:observations.some(o=>o.reader?.mode==='live')?'live':context.options.mode,observations:await Promise.all(observations.map(async o=>({...publicObservation(o),comparison:comparison(o.question,o.literal,row.input,o.reader!==null),signedComparison:o.literal.value!==null&&(o.question==='product_mark'||o.question==='package_mark')?await context!.options.services.lookupProduct({namespace:row.input.namespace,productMark:o.question==='product_mark'?o.literal.value:row.input.productMark,packagingMark:o.question==='package_mark'?o.literal.value:row.input.packagingMark}):null,current:o.captureRevision===row.revision-1&&o.captureId===row.input.captureId}))),captures:await Promise.all(captures.rows.map(async v=>{const c=Capture.parse({id:v.id,investigationId:v.investigation_id,revision:v.revision,sha256:v.sha256,mime:v.mime,width:v.width,height:v.height,bytes:v.bytes,source:v.source,capturedAt:v.captured_at?new Date(v.captured_at).toISOString():null,uploadedAt:new Date(v.uploaded_at).toISOString(),objectPath:v.object_path});const details=v.details?CaptureDetails.parse(v.details):null;return {id:c.id,revision:c.revision,sha256:c.sha256,width:c.width,height:c.height,source:c.source,uploadedAt:c.uploadedAt,capturedAtUntrusted:c.capturedAt,processingConsent:details?.processingConsent??null};})),physicalAssociation:'unresolved',expiry:{regulatoryRegistration:null,batch:null,printed:observations.filter(o=>o.question==='printed_expiry').map(o=>({value:o.literal.value,observationId:o.id}))}},{headers});}
  const captureId=z.uuid().parse(media.captureId),kind=z.enum(['original','crop','overlay','mask']).parse(media.kind);
  const c=await context.store.capture(auth.owner,id,captureId);const source=await verifySource(c,await new SupabaseCaptureStorage().read(c.objectPath));
  const observation=observations.find(o=>o.captureId===captureId&&o.region);
  if(kind!=='original'&&!observation?.region)throw new InvestigationError('region_unavailable',404);
  const bytes=kind==='original'?source:await renderRegion(c,source,observation!.region!,kind);
  return new Response(new Uint8Array(bytes),{headers:{...headers,'content-type':kind==='original'?c.mime:'image/png','content-length':String(bytes.length),'content-disposition':'inline'}});
 }catch(e){const known=e instanceof InvestigationError;return Response.json({error:known?e.code:e instanceof z.ZodError?'invalid_request':'inspection_unavailable'},{status:known?e.status:e instanceof z.ZodError?400:503,headers});}
 finally{if(context)await context.close();}
}
