import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {CaptureDetails} from '../../contracts/inspection.js';
import {EvidenceSubjectInput} from '../../contracts/platform.js';
import {sha256} from '../../domain/verification/p0-crypto.js';
import {session} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {runtime} from '../investigator/runtime.js';
import {saveCapture,SupabaseCaptureStorage} from '../investigator/captures.js';
import {TransferError} from '../transfers/database.js';
import {platformTransaction,type PlatformIdentity} from './database.js';
import {linkEvidence} from './dualproof.js';
import {decodeVideo,VIDEO_LIMIT} from './video-decode.js';
export async function saveVideo(request:Request,identity:PlatformIdentity){
 const auth=await session(request),who={...identity,sessionHash:auth.owner.sessionHash};
 const raw=await bodyBytes(request,VIDEO_LIMIT+16384),form=await new Response(raw,{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
 if([...form.keys()].some(k=>!['file','investigationId','revision','question','processingConsent','link'].includes(k)))throw new TransferError('invalid_video_fields',400);
 const file=form.get('file');if(!(file instanceof File))throw new TransferError('video_required',400);
 const meta=z.strictObject({investigationId:z.uuid(),revision:z.coerce.number().int().positive(),question:CaptureDetails.shape.question,processingConsent:z.enum(['true','false'])}).parse(Object.fromEntries(['investigationId','revision','question','processingConsent'].map(k=>[k,form.get(k)])));
 const source=new Uint8Array(await file.arrayBuffer()),sourceHash=await sha256(source),context=await runtime(auth.owner);
 try{
  await context.store.limit('global:video',24,86400000);await context.store.limit(`video-user:${who.userId}`,4,3600000);
  const link=form.has('link')?EvidenceSubjectInput.parse(JSON.parse(String(form.get('link')))):null;
  if(link)await platformTransaction(who,async c=>{if(link.side==='origin'){if(!(await c.query('SELECT id FROM packproof.product_drafts WHERE id=$1',[link.draftId])).rowCount)throw new TransferError('not_found',404);}else{const t=(await c.query('SELECT seller_actor_id,buyer_actor_id FROM packproof.transfer_sessions WHERE id=$1',[link.transferId])).rows[0];if(!t||who.actorId!==(link.side==='dispatch'?t.seller_actor_id:t.buyer_actor_id))throw new TransferError('wrong_handover_participant',403);}});
  const investigation=await context.store.get(auth.owner,meta.investigationId);if(investigation.status!=='needs_input'||investigation.revision!==meta.revision)throw new TransferError('capture_revision_mismatch');
  const decoded=await decodeVideo(source,file.type),id=randomUUID(),objectPath=`${meta.investigationId}/${id}/original.${file.type==='video/mp4'?'mp4':'webm'}`,storage=new SupabaseCaptureStorage();
  await storage.upload(objectPath,source,file.type);
  try{await platformTransaction(who,c=>c.query('INSERT INTO packproof.evidence_videos(id,user_id,actor_id,investigation_id,source_sha256,mime,bytes,duration_ms,object_path,decoder_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,who.userId,who.actorId,meta.investigationId,sourceHash,file.type,source.length,decoded.durationMs,objectPath,decoded.decoderVersion]));}catch(e){await storage.remove(objectPath).catch(()=>{});throw e;}
  const frames=[];
  for(const frame of decoded.frames){
   const capture=await saveCapture(context.store,auth.owner,storage,{investigationId:meta.investigationId,revision:meta.revision,mime:'image/jpeg',bytes:frame.bytes,source:'imported',capturedAt:null,inspection:{question:meta.question,box:{left:0,top:0,right:frame.width,bottom:frame.height},processingConsent:meta.processingConsent==='true',consentVersion:'p3-meta-media-1'}});
   await platformTransaction(who,c=>c.query('INSERT INTO packproof.video_frames(capture_id,video_id,source_video_sha256,timestamp_ms,frame_sha256) VALUES($1,$2,$3,$4,$5)',[capture.id,id,sourceHash,frame.timestampMs,capture.sha256]));
   if(link)await linkEvidence(who,{...link,captureId:capture.id,investigationId:meta.investigationId,revision:meta.revision,sourceSha256:capture.sha256});
   frames.push({...capture,timestampMs:frame.timestampMs,videoId:id});
  }
  return {id,sourceSha256:sourceHash,durationMs:decoded.durationMs,decoderVersion:decoded.decoderVersion,frames,metaProcessing:'Only a selected frame is processed after resume and explicit consent; the original video is retained privately.'};
 }finally{await context.close();}
}
export async function readVideo(who:PlatformIdentity,id:string){const row=await platformTransaction(who,async c=>(await c.query('SELECT * FROM packproof.evidence_videos WHERE id=$1',[z.uuid().parse(id)])).rows[0]);if(!row)throw new TransferError('not_found',404);const bytes=await new SupabaseCaptureStorage().read(row.object_path);if(bytes.length!==row.bytes||await sha256(bytes)!==row.source_sha256)throw new TransferError('video_integrity_mismatch');return {bytes,mime:row.mime};}
