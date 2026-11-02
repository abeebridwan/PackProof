import {z} from 'zod';
import {InvestigationInput,ResumeInput,PublicInvestigation} from '../../contracts/investigation.js';
import {ProductInput,ProductResult} from '../../contracts/evidence.js';
import {session,sameOrigin} from '../auth/session.js';
import {runtime} from './runtime.js';
import {startInvestigation,resumeInvestigation,publicView} from './graph.js';
import {InvestigationError} from './store.js';
import {saveCapture,SupabaseCaptureStorage,CAPTURE_LIMIT} from './captures.js';
export async function bodyBytes(request:Request,limit:number){const reader=request.body?.getReader();if(!reader)throw new InvestigationError('body_required',400);let length=0;const chunks:Uint8Array[]=[];while(true){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new InvestigationError('body_too_large',413);}chunks.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;}
const json=(value:unknown,status=200,cookie:string|null=null)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...(cookie?{'set-cookie':cookie}:{})}});
async function jsonBody(r:Request){if(!r.headers.get('content-type')?.startsWith('application/json'))throw new InvestigationError('json_required',415);return JSON.parse(new TextDecoder().decode(await bodyBytes(r,8192)));}
export async function handle(request:Request,action:'create'|'get'|'resume'|'lookup'|'capture',id?:string){
 let context:Awaited<ReturnType<typeof runtime>>|null=null;
 try{
  if(action!=='get'&&action!=='lookup')sameOrigin(request);
  const auth=action==='lookup'?{owner:{sessionHash:'0'.repeat(64),userId:null},setCookie:null}:await session(request,action==='create');
  if(id)z.uuid().parse(id);
  context=await runtime(auth.owner);
  await context.store.limit(`global:${action}`,action==='get'||action==='lookup'?600:60,3600000);
  if(action!=='lookup')await context.store.limit(`session:${auth.owner.sessionHash}:${action}`,action==='get'?240:20,3600000);
  if(action==='create'){
   const args=InvestigationInput.parse(await jsonBody(request));if(args.captureId!==null)throw new InvestigationError('create_capture_after_request',400);
   const result=await startInvestigation(context.options,args);return json(PublicInvestigation.parse(result),201,auth.setCookie);
  }
  if(action==='get')return json(await publicView(context.store,auth.owner,id!));
  if(action==='resume')return json(await resumeInvestigation(context.options,id!,ResumeInput.parse(await jsonBody(request))));
  if(action==='lookup'){
   const query=Object.fromEntries(new URL(request.url).searchParams.entries());
   const args=ProductInput.parse({...query,packagingMark:query.packagingMark??null});
   return json(ProductResult.parse(await context.options.services.lookupProduct(args)));
  }
  const bytes=await bodyBytes(request,CAPTURE_LIMIT+8192);
  const form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
  if([...form.keys()].some(k=>!['file','investigationId','revision','source','capturedAt'].includes(k)))throw new InvestigationError('invalid_upload_fields',400);
  const file=form.get('file');if(!(file instanceof File))throw new InvestigationError('image_required',400);
  const meta=z.strictObject({investigationId:z.uuid(),revision:z.coerce.number().int().positive(),source:z.enum(['live-camera','imported']),capturedAt:z.iso.datetime().nullable()}).parse({investigationId:form.get('investigationId'),revision:form.get('revision'),source:form.get('source'),capturedAt:form.get('capturedAt')||null});
  const capture=await saveCapture(context.store,auth.owner,new SupabaseCaptureStorage(),{...meta,mime:file.type,bytes:new Uint8Array(await file.arrayBuffer())});
  return json(capture,201);
 }catch(error){
  const known=error instanceof InvestigationError;
  const status=known?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503;
  return json({error:known?error.code:status===400?'invalid_request':'temporarily_unavailable',message:status===503?'The investigation service is unavailable. Retry safely; no ownership operation occurred.':'Request could not be accepted.'},status);
 }finally{if(context)await context.close();}
}
