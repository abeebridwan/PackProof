import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {EvidenceLinkInput} from '../../contracts/platform.js';
import {Capture} from '../../contracts/investigation.js';
import {Observation,publicObservation} from '../../contracts/inspection.js';
import {compareEvidence,type ComparedEvidence} from '../../domain/dualproof/compare.js';
import {platformTransaction,type PlatformIdentity} from './database.js';
import {TransferError} from '../transfers/database.js';
import {InvestigationError} from '../investigator/store.js';
import {SupabaseCaptureStorage} from '../investigator/captures.js';
import {verifySource,renderRegion} from '../inspector/grounding.js';
import {createEvidenceServices,validateDataset} from '../evidence/services.js';
import {loadSources,rootPin} from '../transfers/authority.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {TransferAgreement} from '../../contracts/p0.js';
export async function linkEvidence(who:PlatformIdentity,input:unknown){const v=EvidenceLinkInput.parse(input);const id=randomUUID();await platformTransaction(who,async c=>{
 const subject=v.transferId??v.draftId!;await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,712))',[subject]);
 const existing=(await c.query('SELECT * FROM packproof.handover_evidence WHERE capture_id=$1 AND (transfer_id=$2 OR draft_id=$3)',[v.captureId,v.transferId,v.draftId])).rows[0];
 if(existing){if(existing.source_sha256!==v.sourceSha256||existing.side!==v.side||existing.condition_note!==v.conditionNote||existing.investigation_id!==v.investigationId||existing.revision!==v.revision)throw new TransferError('evidence_replay_mismatch');return;}
 const count=Number((await c.query('SELECT count(*) FROM packproof.handover_evidence WHERE transfer_id=$1 OR draft_id=$2',[v.transferId,v.draftId])).rows[0].count);if(count>=32)throw new TransferError('evidence_limit_reached');
 await c.query('INSERT INTO packproof.handover_evidence(id,user_id,actor_id,capture_id,investigation_id,revision,source_sha256,draft_id,transfer_id,side,condition_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,who.userId,who.actorId,v.captureId,v.investigationId,v.revision,v.sourceSha256,v.draftId,v.transferId,v.side,v.conditionNote]);
});return {linked:true};}
export function captureFromRow(v:Record<string,any>){return Capture.parse({id:v.id,investigationId:v.investigation_id,revision:v.revision,sha256:v.sha256,mime:v.mime,width:v.width,height:v.height,bytes:v.bytes,source:v.source,capturedAt:v.captured_at?new Date(v.captured_at).toISOString():null,uploadedAt:new Date(v.uploaded_at).toISOString(),objectPath:v.object_path});}
export async function evidenceHistory(who:PlatformIdentity,subject:{transferId?:string;draftId?:string}){
 const value=z.uuid().parse(subject.transferId??subject.draftId);return platformTransaction(who,async c=>{
  const rows=(await c.query(`SELECT e.id,e.capture_id,e.investigation_id,e.revision,e.source_sha256,e.side,e.condition_note,e.created_at,CASE WHEN f.video_id IS NULL THEN NULL ELSE json_build_object('video_id',f.video_id,'timestamp_ms',f.timestamp_ms,'source_video_sha256',f.source_video_sha256) END AS frame,coalesce((SELECT json_agg(o.observation ORDER BY o.created_at,o.id) FROM packproof.inspection_observations o WHERE o.capture_id=e.capture_id),'[]'::json) AS observations FROM packproof.handover_evidence e LEFT JOIN packproof.video_frames f ON f.capture_id=e.capture_id WHERE e.${subject.transferId?'transfer_id':'draft_id'}=$1 ORDER BY e.created_at,e.id`,[value])).rows;
  return rows.map(r=>({...r,observations:r.observations.map((value:unknown)=>publicObservation(Observation.parse(value))),mediaUrl:`/api/platform/media/${r.id}`}));
 });
}
export async function sharedMedia(who:PlatformIdentity,id:string,kind='original'){
 const v=await platformTransaction(who,async c=>{const e=(await c.query('SELECT * FROM packproof.handover_evidence WHERE id=$1',[z.uuid().parse(id)])).rows[0];if(!e)throw new TransferError('not_found',404);const source=(await c.query('SELECT * FROM packproof.captures WHERE id=$1',[e.capture_id])).rows[0];if(!source)throw new TransferError('not_found',404);const observations=(await c.query('SELECT observation FROM packproof.inspection_observations WHERE capture_id=$1 ORDER BY created_at',[e.capture_id])).rows.map(v=>Observation.parse(v.observation));return {capture:captureFromRow(source),observations};});
 const bytes=await verifySource(v.capture,await new SupabaseCaptureStorage().read(v.capture.objectPath));
 if(kind==='original')return {bytes,mime:v.capture.mime};const selected=z.enum(['crop','overlay','mask']).parse(kind),region=v.observations.find(o=>o.region)?.region;if(!region)throw new TransferError('region_unavailable',404);return {bytes:await renderRegion(v.capture,bytes,region,selected),mime:'image/png'};
}
export async function dualproof(who:PlatformIdentity,transferId:string,persist=true){
 z.uuid().parse(transferId);
 const data=await platformTransaction(who,async c=>{
  const t=(await c.query('SELECT * FROM packproof.transfer_sessions WHERE id=$1',[transferId])).rows[0];if(!t)throw new TransferError('not_found',404);
  const agreement=TransferAgreement.parse(JSON.parse(t.agreement_payload));if(await sha256(utf8(t.agreement_payload))!==t.agreement_hash||agreement.itemId!==t.item_id||agreement.sellerActorId!==t.seller_actor_id||agreement.buyerActorId!==t.buyer_actor_id)throw new TransferError('agreement_integrity');const relation=(await c.query('SELECT * FROM packproof.marking_relations WHERE item_id=$1',[t.item_id])).rows[0];if(!relation)throw new TransferError('mapping_unavailable');
  const links=(await c.query(`SELECT e.*,c.id AS source_id,c.investigation_id AS source_investigation_id,c.revision AS source_revision,c.sha256,c.mime,c.width,c.height,c.bytes,c.source,c.captured_at,c.uploaded_at,c.object_path,f.video_id,f.timestamp_ms,f.source_video_sha256,f.frame_sha256,v.object_path AS video_object_path,v.bytes AS video_bytes,v.duration_ms,coalesce((SELECT json_agg(o.observation ORDER BY o.created_at,o.id) FROM packproof.inspection_observations o WHERE o.capture_id=e.capture_id),'[]'::json) AS observations FROM packproof.handover_evidence e JOIN packproof.captures c ON c.id=e.capture_id LEFT JOIN packproof.video_frames f ON f.capture_id=c.id LEFT JOIN packproof.evidence_videos v ON v.id=f.video_id WHERE e.transfer_id=$1 ORDER BY e.created_at,e.id LIMIT 33`,[transferId])).rows;
  if(links.length>32)throw new TransferError('evidence_limit_reached');
  const evidence=links.map(e=>({link:e,capture:captureFromRow({...e,id:e.source_id,investigation_id:e.source_investigation_id,revision:e.source_revision}),frame:e.video_id?{object_path:e.video_object_path,bytes:e.video_bytes,duration_ms:e.duration_ms,source_video_sha256:e.source_video_sha256,frame_sha256:e.frame_sha256,timestamp_ms:e.timestamp_ms}:null,observations:e.observations.map((value:unknown)=>Observation.parse(value))}));
  const dataset=await loadSources(c,'packproof');return {t,agreement,relation,evidence,dataset};
 });
 const compared:ComparedEvidence[]=[],videoCache=new Map<string,Promise<{length:number;hash:string}>>();
 for(let offset=0;offset<data.evidence.length;offset+=4){compared.push(...await Promise.all(data.evidence.slice(offset,offset+4).map(async e=>{
  let integrity=e.capture.sha256===e.link.source_sha256&&e.capture.revision===e.link.revision&&e.capture.investigationId===e.link.investigation_id;const readings:ComparedEvidence['readings']=[];
  try{const storage=new SupabaseCaptureStorage(),bytes=await verifySource(e.capture,await storage.read(e.capture.objectPath));if(e.frame){if(!videoCache.has(e.frame.object_path))videoCache.set(e.frame.object_path,storage.read(e.frame.object_path).then(async bytes=>({length:bytes.length,hash:await sha256(bytes)})));const video=await videoCache.get(e.frame.object_path)!;if(video.length!==e.frame.bytes||video.hash!==e.frame.source_video_sha256||e.frame.frame_sha256!==e.capture.sha256||e.frame.timestamp_ms>e.frame.duration_ms)throw new Error('frame_binding_mismatch');}for(const o of e.observations){const bound=o.captureId===e.capture.id&&o.captureRevision===e.capture.revision&&o.sourceSha256===e.capture.sha256&&o.investigationId===e.capture.investigationId&&(!e.frame||o.region?.frameTimestamp===e.frame.timestamp_ms);if(o.region)await renderRegion(e.capture,bytes,o.region,'crop');readings.push({question:o.question,value:o.literal.value,bound:bound&&o.reader!==null&&o.region!==null,observationId:o.id,condition:o.condition??null});}}
  catch(error){const corrupt=error instanceof InvestigationError&&['invalid_image','stored_media_too_large','capture_integrity_mismatch','region_source_mismatch','mask_integrity_mismatch','crop_integrity_mismatch'].includes(error.code)||error instanceof Error&&error.message==='frame_binding_mismatch';if(!corrupt)throw new TransferError('comparison_media_unavailable',503);integrity=false;}
  return {id:e.link.id,side:e.link.side,captureId:e.capture.id,sourceSha256:e.capture.sha256,sourceVideoSha256:e.frame?.source_video_sha256??null,integrity,conditionNote:e.link.condition_note,readings};
 })));}
 const pin=await rootPin(),verified=await validateDataset(data.dataset,pin,new Date().toISOString()),mapping=verified.verified.get(data.agreement.mappingRecordId)?.record;
 if(mapping?.type!=='mapping'||mapping.data.itemId!==data.t.item_id||data.relation.record_id!==mapping.id||data.relation.product_mark!==mapping.data.productMark.value||data.relation.packaging_mark!==mapping.data.packagingMark.value)throw new TransferError('signed_mapping_integrity_failed');
 const services=createEvidenceServices({load:async()=>data.dataset},pin);const notices=await services.getProductNotices({itemId:data.t.item_id});
 const result=compareEvidence(transferId,compared,{product:data.relation.product_mark,packaging:data.relation.packaging_mark},notices.status==='supported'?(notices.data?.notices??[]).map(n=>({id:n.recordId,message:n.explanation})):[]);
 result.findings.push({field:'packaging_notice_coverage',status:notices.status==='supported'?'unresolved_physical_association':'not_inspected',dispatch:notices.reason,arrival:null,evidenceRefs:notices.evidence_refs,nextView:'This covers the signed sample registry only. External manufacturer notices and the observed package revision remain unknown.'});
 if(persist)await platformTransaction(who,c=>c.query('INSERT INTO packproof.dual_comparisons(id,transfer_id,seller_actor_id,buyer_actor_id,result) VALUES($1,$2,$3,$4,$5)',[randomUUID(),transferId,data.t.seller_actor_id,data.t.buyer_actor_id,result]));return result;
}
