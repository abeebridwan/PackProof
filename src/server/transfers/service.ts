import {randomBytes,randomUUID} from 'node:crypto';
import {importJWK,type JWK} from 'jose';
import {z} from 'zod';
import {PublicJwk,TransferAgreement} from '../../contracts/p0.js';
import {EnrollmentChallenge,Offer,Frame,Consent,Cancel,ScanProof,ReceiptData,TRANSFER_POLICY,TransferView} from '../../contracts/transfer.js';
import {EvidenceRecord,type RootPin} from '../../contracts/evidence.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {verifyAction,verifyReceiptApprovals} from '../../domain/identity/transfer-crypto.js';
import {signRecord,verifyRecordSet,verifyEvidence} from '../../domain/trust/evidence.js';
import {TransferDatabase,TransferError,type Sql} from './database.js';
import {checkAuthority,loadSources} from './authority.js';
type Direction='buyer-to-seller'|'seller-to-buyer';
type Row=Record<string,any>; // Database row values are checked at each protocol boundary.
export type ReceiptSigner={key:CryptoKey;keyId:string;issuerId:string};
const now=()=>new Date().toISOString(),nonce=()=>randomBytes(16).toString('hex');
const hash=(v:string)=>sha256(utf8(v));
export class TransferService{
 readonly s:string;
 constructor(readonly db:TransferDatabase,readonly pin:RootPin,readonly signer:ReceiptSigner|null){this.s=db.schema;}
 async operation<T>(actor:string,op:string,key:string,payload:unknown,effect:(c:Sql)=>Promise<T>,rawHash?:string){
  z.uuid().parse(key);const payloadHash=rawHash??await hash(JSON.stringify(payload));
  // Count attempted requests in a short transaction. Holding the actor/hour
  // counter through signature checks would serialize unrelated handovers and
  // let failed requests roll back their rate-limit accounting.
  const requests=await this.db.transaction(actor,async c=>(await c.query(`INSERT INTO ${this.s}.transfer_limits VALUES($1,date_trunc('hour',clock_timestamp()),1) ON CONFLICT(actor_id,bucket) DO UPDATE SET requests=${this.s}.transfer_limits.requests+1 RETURNING requests`,[actor])).rows[0].requests as number);
  if(requests>120)throw new TransferError('rate_limit',429);
  return this.db.transaction(actor,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,702))',[`${actor}:${op}:${key}`]);
   const previous=(await c.query(`SELECT * FROM ${this.s}.transfer_operations WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3`,[actor,op,key])).rows[0];
   if(previous){if(previous.payload_hash!==payloadHash)throw new TransferError('idempotency_payload_mismatch');return previous.result as T;}
   const result=await effect(c);
   await c.query(`INSERT INTO ${this.s}.transfer_operations(actor_id,operation,idempotency_key,payload_hash,result) VALUES($1,$2,$3,$4,$5)`,[actor,op,key,payloadHash,JSON.stringify(result)]);return result;
  });
 }
 async device(c:Sql,actor:string,id?:string){
  const row=(await c.query(`SELECT k.* FROM ${this.s}.device_keys k JOIN ${this.s}.actor_accounts a ON a.actor_id=k.actor_id AND a.user_id=k.user_id WHERE k.actor_id=$1 AND k.status='active' AND k.expires_at>clock_timestamp() ${id?'AND k.id=$2':''}`,id?[actor,id]:[actor])).rows[0];
  if(!row)throw new TransferError('active_enrolled_device_required',403);PublicJwk.parse(row.public_jwk);return row as Row;
 }
 async session(c:Sql,actor:string,id:string,lock=true){
  const row=(await c.query(`SELECT * FROM ${this.s}.transfer_sessions WHERE id=$1 AND $2 IN(buyer_actor_id,seller_actor_id) ${lock?'FOR UPDATE':''}`,[id,actor])).rows[0];
  if(!row)throw new TransferError('transfer_not_found',404);
  row.agreement=TransferAgreement.parse(JSON.parse(row.agreement_payload));
  if(await hash(row.agreement_payload)!==row.agreement_hash)throw new TransferError('agreement_integrity');
  return row as Row;
 }
 active(row:Row,states:string[]){if(Date.parse(row.expires_at)<=Date.now())throw new TransferError('transfer_expired');if(!states.includes(row.state))throw new TransferError('invalid_transfer_state');}
 async enrollment(actor:string,userId:string,key:string,rawHash?:string){return this.operation(actor,'enrollment-challenge',key,{},async c=>{
  const at=now(),expiresAt=new Date(Date.parse(at)+120000).toISOString(),id=randomUUID();
  const challenge=EnrollmentChallenge.parse({kind:'device-enrollment',schemaVersion:1,challengeId:id,actorId:actor,userId,keyId:randomUUID(),nonce:nonce(),issuedAt:at,expiresAt});
  await c.query(`INSERT INTO ${this.s}.enrollment_challenges(id,actor_id,user_id,key_id,payload,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,[id,actor,userId,challenge.keyId,JSON.stringify(challenge),expiresAt]);return {challenge};
 },rawHash);}
 async enroll(actor:string,userId:string,key:string,input:{challengeId:string;publicKey:z.infer<typeof PublicJwk>;signature:string},rawHash?:string){return this.operation(actor,'enroll',key,input,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,703))',[actor]);
  const row=(await c.query(`SELECT * FROM ${this.s}.enrollment_challenges WHERE id=$1 AND actor_id=$2 AND user_id=$3 FOR UPDATE`,[input.challengeId,actor,userId])).rows[0];
  if(!row||row.consumed_at||Date.parse(row.expires_at)<=Date.now())throw new TransferError('invalid_enrollment_challenge');
  const challenge=EnrollmentChallenge.parse(JSON.parse(row.payload));await verifyAction(input.signature,input.publicKey,row.key_id,challenge);
  const publicKey=PublicJwk.parse(input.publicKey);
  await c.query(`UPDATE ${this.s}.device_keys SET status='revoked',revoked_at=clock_timestamp() WHERE actor_id=$1 AND status='active'`,[actor]);
  await c.query(`UPDATE ${this.s}.transfer_sessions SET state='blocked',reason='device_replaced' WHERE $1 IN(seller_actor_id,buyer_actor_id) AND state IN('offered','seller_approved','buyer_confirmed')`,[actor]);
  await c.query(`INSERT INTO ${this.s}.device_keys(id,actor_id,user_id,public_jwk,jwk_sha256,status,role,expires_at) VALUES($1,$2,$3,$4,$5,'active','participant',clock_timestamp()+interval '90 days')`,[row.key_id,actor,userId,publicKey,await hash(JSON.stringify(publicKey))]);
  await c.query(`UPDATE ${this.s}.enrollment_challenges SET consumed_at=clock_timestamp(),proof_jws=$2 WHERE id=$1`,[row.id,input.signature]);return {id:row.key_id,actorId:actor,publicKey,status:'active'};
 },rawHash);}
 async revoke(actor:string,key:string,rawHash?:string){return this.operation(actor,'revoke',key,{},async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,703))',[actor]);
  await c.query(`UPDATE ${this.s}.device_keys SET status='revoked',revoked_at=clock_timestamp() WHERE actor_id=$1 AND status='active'`,[actor]);
  await c.query(`UPDATE ${this.s}.transfer_sessions SET state='blocked',reason='device_revoked' WHERE $1 IN(seller_actor_id,buyer_actor_id) AND state IN('offered','seller_approved','buyer_confirmed')`,[actor]);return {status:'revoked'};
 },rawHash);}
 async account(actor:string){return this.db.transaction(actor,async c=>{
  const a=(await c.query(`SELECT id,public_label,kind,(SELECT id FROM ${this.s}.transfer_sessions WHERE $1 IN(seller_actor_id,buyer_actor_id) ORDER BY created_at DESC LIMIT 1) AS recent_transfer_id FROM ${this.s}.actors WHERE id=$1`,[actor])).rows[0];
  let device=null;try{const d=await this.device(c,actor);device={id:d.id,status:d.status,publicKey:d.public_jwk};}catch(e){if(!(e instanceof TransferError))throw e;}
  return {actorId:actor,label:a.public_label,kind:a.kind,recentTransferId:a.recent_transfer_id??null,device};
 });}
 async create(actor:string,key:string,input:{itemId:string;sellerActorId:string},rawHash?:string){return this.operation(actor,'create',key,input,async c=>{
  if(actor===input.sellerActorId)throw new TransferError('distinct_parties_required');
  const authority=await checkAuthority(c,this.s,this.pin,input.itemId,input.sellerActorId,now());
  const buyer=await this.device(c,actor),seller=await this.device(c,input.sellerActorId);
  const policy=(await c.query(`SELECT active FROM ${this.s}.transfer_policies WHERE version=$1`,[TRANSFER_POLICY])).rows[0];if(!policy?.active)throw new TransferError('policy_unavailable');
  const at=now(),agreement=TransferAgreement.parse({schemaVersion:1,transferId:randomUUID(),itemId:input.itemId,sellerActorId:input.sellerActorId,buyerActorId:actor,sellerDeviceKeyId:seller.id,buyerDeviceKeyId:buyer.id,expectedOwnerId:authority.item.registered_owner_id,expectedOwnerVersion:authority.item.owner_version,mappingRecordId:authority.item.mapping_record_id,inspectionRecordId:null,policyVersion:TRANSFER_POLICY,issuedAt:at,expiresAt:new Date(Date.parse(at)+120000).toISOString()});
  const payload=JSON.stringify(agreement),agreementHash=await hash(payload);
  await c.query(`INSERT INTO ${this.s}.transfer_sessions(id,item_id,seller_actor_id,buyer_actor_id,seller_device_key_id,buyer_device_key_id,agreement_payload,agreement_hash,state,authority_snapshot_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'offered',$9,$10)`,[agreement.transferId,input.itemId,input.sellerActorId,actor,seller.id,buyer.id,payload,agreementHash,authority.snapshot.id,agreement.expiresAt]);
  await c.query(`INSERT INTO ${this.s}.transfer_events(transfer_id,actor_id,event) VALUES($1,$2,'offered')`,[agreement.transferId,actor]);
  return {id:agreement.transferId,agreement,agreementPayload:payload,agreementHash,offer:Offer.parse({kind:'transfer-offer',transferId:agreement.transferId,agreementHash,actorId:actor,keyId:buyer.id,expiresAt:agreement.expiresAt})};
 },rawHash);}
 async eligibility(actor:string,input:{itemId:string;sellerActorId:string}){
  const at=now(),base={scope:'unit' as const,asOf:at,policyVersion:TRANSFER_POLICY,next_actions:['Both participants must explicitly sign the exact agreement and complete fresh QR checks.']};
  if(!this.signer)return {...base,status:'unavailable' as const,reason:'Receipt signing is not configured. No signed handover can be completed.',evidence_refs:[],data:null};
  try{return await this.db.transaction(actor,async c=>{if(actor===input.sellerActorId)throw new TransferError('distinct_parties_required');const policy=(await c.query(`SELECT active FROM ${this.s}.transfer_policies WHERE version=$1`,[TRANSFER_POLICY])).rows[0];if(!policy?.active)throw new TransferError('policy_unavailable');const authority=await checkAuthority(c,this.s,this.pin,input.itemId,input.sellerActorId,at);await this.device(c,actor);await this.device(c,input.sellerActorId);return {...base,status:'supported' as const,reason:'Current registered authority and enrolled devices support preparing an agreement. Commit checks and both signed approvals remain mandatory.',evidence_refs:authority.refs,data:{eligible:true,itemId:input.itemId,sellerActorId:input.sellerActorId,buyerActorId:actor,ownerVersion:authority.item.owner_version,physicalAssociation:'unresolved' as const}};});}
  catch(e){if(!(e instanceof TransferError))throw e;return {...base,status:e.code==='stale_authority'?'stale' as const:'blocked' as const,reason:e.code.replaceAll('_',' '),evidence_refs:[],data:null};}
 }
 async offer(actor:string,id:string,key:string,signature:string,rawHash?:string){return this.operation(actor,`offer:${id}`,key,{signature},async c=>{
  const s=await this.session(c,actor,id);this.active(s,['offered']);if(s.buyer_actor_id!==actor||s.buyer_offer)throw new TransferError('offer_not_available');
  const d=await this.device(c,actor,s.buyer_device_key_id);await this.device(c,s.seller_actor_id,s.seller_device_key_id);
  await verifyAction(signature,d.public_jwk,d.id,{kind:'transfer-offer',transferId:id,agreementHash:s.agreement_hash,actorId:actor,keyId:d.id,expiresAt:s.agreement.expiresAt});
  await c.query(`UPDATE ${this.s}.transfer_sessions SET buyer_offer=$2 WHERE id=$1`,[id,signature]);return {status:'offer_signed'};
 },rawHash);}
 async prepareFrames(actor:string,id:string,key:string,direction:Direction,rawHash?:string){return this.operation(actor,`frames-prepare:${id}:${direction}`,key,{direction},async c=>{
  const s=await this.session(c,actor,id),forward=direction==='buyer-to-seller';this.active(s,[forward?'offered':'seller_approved']);
  if(actor!==(forward?s.buyer_actor_id:s.seller_actor_id)||!s.buyer_offer||(!forward&&!s.seller_consent))throw new TransferError('wrong_direction',403);
  const d=await this.device(c,actor,forward?s.buyer_device_key_id:s.seller_device_key_id);
  const existing=(await c.query(`SELECT * FROM ${this.s}.transfer_frames WHERE transfer_id=$1 AND direction=$2 ORDER BY sequence`,[id,direction])).rows;
  if(existing.length)return {frames:existing.map(r=>Frame.parse(JSON.parse(r.payload))),displayFrames:existing.every(r=>r.signature)?existing.map(r=>({handle:r.handle,sequence:r.sequence,issuedAt:new Date(r.not_before).toISOString(),expiresAt:new Date(r.expires_at).toISOString()})):null,serverTime:now()};
  const start=Date.now()+10000,count=Math.min(150,Math.floor((Date.parse(s.agreement.expiresAt)-start-3000)/200));
  if(count<15)throw new TransferError('insufficient_session_time');
  const frames=Array.from({length:count},(_,sequence)=>Frame.parse({kind:'transfer-frame',transferId:id,agreementHash:s.agreement_hash,direction,keyId:d.id,nonce:nonce(),sequence,issuedAt:new Date(start+sequence*200).toISOString(),expiresAt:new Date(Math.min(start+sequence*200+3000,Date.parse(s.agreement.expiresAt))).toISOString(),sellerApprovalHash:forward?null:s.seller_approval_hash}));
  if(Date.parse(frames.at(-1)!.issuedAt)>=Date.parse(s.agreement.expiresAt))throw new TransferError('insufficient_session_time');
  const rows=frames.map(f=>({handle:`cp2_${nonce()}`,direction,sequence:f.sequence,payload:JSON.stringify(f),not_before:f.issuedAt,expires_at:f.expiresAt}));
  await c.query(`INSERT INTO ${this.s}.transfer_frames(handle,transfer_id,direction,sequence,payload,not_before,expires_at) SELECT handle,$1,direction,sequence,payload,not_before::timestamptz,expires_at::timestamptz FROM jsonb_to_recordset($2::jsonb) AS f(handle text,direction text,sequence int,payload text,not_before text,expires_at text)`,[id,JSON.stringify(rows)]);
  return {frames,serverTime:now()};
 },rawHash);}
 async uploadFrames(actor:string,id:string,key:string,input:{direction:Direction;signatures:string[]},rawHash?:string){return this.operation(actor,`frames-upload:${id}:${input.direction}`,key,input,async c=>{
  const s=await this.session(c,actor,id),forward=input.direction==='buyer-to-seller';this.active(s,[forward?'offered':'seller_approved']);
  if(actor!==(forward?s.buyer_actor_id:s.seller_actor_id))throw new TransferError('wrong_direction',403);
  const d=await this.device(c,actor,forward?s.buyer_device_key_id:s.seller_device_key_id);
  const rows=(await c.query(`SELECT * FROM ${this.s}.transfer_frames WHERE transfer_id=$1 AND direction=$2 ORDER BY sequence FOR UPDATE`,[id,input.direction])).rows;
  if(rows.length<15||rows.length>150||input.signatures.length!==rows.length||rows.some(r=>r.signature))throw new TransferError('invalid_frame_batch');
  for(let i=0;i<rows.length;i++)await verifyAction(input.signatures[i]!,d.public_jwk,d.id,Frame.parse(JSON.parse(rows[i].payload)));
  const values=await Promise.all(rows.map(async(r,i)=>({handle:r.handle,signature:input.signatures[i],frame_hash:await hash(input.signatures[i]!)})));
  await c.query(`UPDATE ${this.s}.transfer_frames f SET signature=v.signature,frame_hash=v.frame_hash FROM jsonb_to_recordset($2::jsonb) AS v(handle text,signature text,frame_hash text) WHERE f.transfer_id=$1 AND f.handle=v.handle`,[id,JSON.stringify(values)]);
  return {frames:rows.map(r=>({handle:r.handle,sequence:r.sequence,issuedAt:new Date(r.not_before).toISOString(),expiresAt:new Date(r.expires_at).toISOString()})),serverTime:now(),targetFps:5};
 },rawHash);}
 async scan(actor:string,id:string,key:string,handles:string[],rawHash?:string,receivedAt=now()){return this.operation(actor,`scan:${id}`,key,{handles},async c=>{
  const s=await this.session(c,actor,id);this.active(s,['offered','seller_approved']);
  const forward=actor===s.seller_actor_id,direction:Direction=forward?'buyer-to-seller':'seller-to-buyer';
  if(s.state!==(forward?'offered':'seller_approved')||!s.buyer_offer)throw new TransferError('wrong_direction');
  await this.device(c,actor,forward?s.seller_device_key_id:s.buyer_device_key_id);
  const peer=await this.device(c,forward?s.buyer_actor_id:s.seller_actor_id,forward?s.buyer_device_key_id:s.seller_device_key_id);
  if(handles.length!==3||new Set(handles).size!==3)throw new TransferError('three_distinct_frames_required');
  const rows=(await c.query(`SELECT * FROM ${this.s}.transfer_frames WHERE handle=ANY($1::text[]) AND transfer_id=$2 FOR UPDATE`,[handles,id])).rows;
  const ordered=handles.map(h=>rows.find(r=>r.handle===h));const at=receivedAt,stamp=Date.parse(at);
  if(!Number.isFinite(stamp)||stamp>Date.now()||Date.now()-stamp>15000)throw new TransferError('invalid_scan_receipt_time');
  for(let i=0;i<3;i++){
   const r=ordered[i];if(!r||r.direction!==direction||!r.signature||r.consumed_by||stamp<Date.parse(r.not_before)||stamp>=Date.parse(r.expires_at)||(i>0&&r.sequence!==ordered[i-1]!.sequence+1))throw new TransferError('invalid_scan_sequence');
   const frame=Frame.parse(JSON.parse(r.payload));if(frame.sellerApprovalHash!==(forward?null:s.seller_approval_hash)||frame.agreementHash!==s.agreement_hash||frame.direction!==direction||frame.sequence!==r.sequence)throw new TransferError('frame_binding_mismatch');
   await verifyAction(r.signature,peer.public_jwk,peer.id,frame);
  }
  if((await c.query(`SELECT 1 FROM ${this.s}.scan_reservations WHERE transfer_id=$1 AND direction=$2`,[id,direction])).rowCount)throw new TransferError('scan_already_consumed');
  const proof=ScanProof.parse({reservationId:randomUUID(),actorId:actor,direction,scannedAt:at,frameHashes:ordered.map(r=>r!.frame_hash),sequences:ordered.map(r=>r!.sequence)}),serialized=JSON.stringify(proof),proofHash=await hash(serialized);
  await c.query(`INSERT INTO ${this.s}.scan_reservations(id,transfer_id,actor_id,direction,proof,proof_hash,scanned_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[proof.reservationId,id,actor,direction,{serialized},proofHash,at]);
  await c.query(`UPDATE ${this.s}.transfer_frames SET consumed_by=$3 WHERE transfer_id=$1 AND direction=$2`,[id,direction,actor]);
  const consentAt=now(),consentStamp=Date.parse(consentAt);
  const consent=Consent.parse({kind:'transfer-consent',transferId:id,agreementHash:s.agreement_hash,direction,challengeId:randomUUID(),actorId:actor,keyId:forward?s.seller_device_key_id:s.buyer_device_key_id,reservationId:proof.reservationId,reservationHash:proofHash,nonce:nonce(),issuedAt:consentAt,expiresAt:new Date(Math.min(consentStamp+30000,Date.parse(s.agreement.expiresAt))).toISOString(),sellerApprovalHash:forward?null:s.seller_approval_hash});
  await c.query(`INSERT INTO ${this.s}.transfer_challenges(id,transfer_id,actor_id,direction,reservation_id,payload,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[consent.challengeId,id,actor,direction,proof.reservationId,JSON.stringify(consent),consent.expiresAt]);
  return {consent,scan:proof,serverTime:at};
 },rawHash);}
 async verifyConsent(c:Sql,s:Row,actor:string,signature:string,direction:Direction,consume:boolean){
  const forward=direction==='buyer-to-seller',device=await this.device(c,actor,forward?s.seller_device_key_id:s.buyer_device_key_id);
  const challenge=(await c.query(`SELECT * FROM ${this.s}.transfer_challenges WHERE transfer_id=$1 AND actor_id=$2 AND direction=$3 FOR UPDATE`,[s.id,actor,direction])).rows[0];
  if(!challenge||challenge.consumed_at&&consume)throw new TransferError('consent_not_available');
  const consent=Consent.parse(JSON.parse(challenge.payload));
  // Seller consent was consumed earlier. Validate its actual recorded approval time,
  // never a later human confirmation time or a frame's now-expired display window.
  const signedAt=consume?Date.now():Date.parse(challenge.consumed_at);
  if(new Date(challenge.expires_at).toISOString()!==consent.expiresAt||!Number.isFinite(signedAt)||signedAt<Date.parse(consent.issuedAt)||signedAt>=Date.parse(consent.expiresAt)||consent.agreementHash!==s.agreement_hash||consent.sellerApprovalHash!==(forward?null:s.seller_approval_hash))throw new TransferError('consent_expired_or_mismatched');
  const reservation=(await c.query(`SELECT * FROM ${this.s}.scan_reservations WHERE id=$1 AND transfer_id=$2 AND actor_id=$3 FOR UPDATE`,[consent.reservationId,s.id,actor])).rows[0];
  if(!reservation||reservation.proof_hash!==consent.reservationHash||consume&&reservation.consumed_at)throw new TransferError('invalid_scan_reservation');
  const proof=ScanProof.parse(JSON.parse(reservation.proof.serialized));
  if(await hash(JSON.stringify(proof))!==consent.reservationHash||proof.actorId!==actor||proof.direction!==direction||Date.parse(proof.scannedAt)>signedAt)throw new TransferError('invalid_scan_reservation');
  const frames=(await c.query(`SELECT * FROM ${this.s}.transfer_frames WHERE transfer_id=$1 AND direction=$2 AND frame_hash=ANY($3::text[]) ORDER BY sequence`,[s.id,direction,proof.frameHashes])).rows;
  if(frames.length!==3)throw new TransferError('invalid_reserved_frames');
  const peer=await this.device(c,forward?s.buyer_actor_id:s.seller_actor_id,forward?s.buyer_device_key_id:s.seller_device_key_id);
  for(let i=0;i<frames.length;i++){
   const f=frames[i],captured=Date.parse(proof.scannedAt);
   if(f.sequence!==proof.sequences[i]||f.frame_hash!==proof.frameHashes[i]||f.consumed_by!==actor||captured<Date.parse(f.not_before)||captured>=Date.parse(f.expires_at))throw new TransferError('invalid_recorded_scan_time');
   await verifyAction(f.signature,peer.public_jwk,peer.id,Frame.parse(JSON.parse(f.payload)));
  }
  await verifyAction(signature,device.public_jwk,device.id,consent);
  if(consume){
   const consumed=await c.query(`UPDATE ${this.s}.transfer_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,[challenge.id]);if(consumed.rowCount!==1)throw new TransferError('consent_expired_or_mismatched');
   await c.query(`UPDATE ${this.s}.scan_reservations SET consumed_at=clock_timestamp() WHERE id=$1`,[reservation.id]);
  }
  return proof;
 }
 async approve(actor:string,id:string,key:string,signature:string,rawHash?:string){return this.operation(actor,`seller-approve:${id}`,key,{signature},async c=>{
  const s=await this.session(c,actor,id);this.active(s,['offered']);if(actor!==s.seller_actor_id||!s.buyer_offer)throw new TransferError('seller_only',403);
  const auth=await checkAuthority(c,this.s,this.pin,s.item_id,actor,now(),s.authority_snapshot_id,{ownerId:s.agreement.expectedOwnerId,version:s.agreement.expectedOwnerVersion});if(auth.item.owner_version!==s.agreement.expectedOwnerVersion||auth.item.registered_owner_id!==s.agreement.expectedOwnerId)throw new TransferError('ownership_conflict');
  await this.verifyConsent(c,s,actor,signature,'buyer-to-seller',true);
  await c.query(`UPDATE ${this.s}.transfer_sessions SET state='seller_approved',seller_consent=$2,seller_approval_hash=$3 WHERE id=$1`,[id,signature,await hash(signature)]);
  await c.query(`INSERT INTO ${this.s}.transfer_events(transfer_id,actor_id,event) VALUES($1,$2,'seller_approved')`,[id,actor]);return {id,state:'seller_approved'};
 },rawHash);}
 async confirm(actor:string,id:string,key:string,signature:string,rawHash?:string){return this.operation(actor,`confirm:${id}`,key,{signature},async c=>{
  if(!this.signer)throw new TransferError('receipt_signer_unavailable',503);
  const s=await this.session(c,actor,id);
  if(s.state==='committed')throw new TransferError('already_committed_recover_with_get');
  this.active(s,['seller_approved']);if(actor!==s.buyer_actor_id)throw new TransferError('buyer_only',403);
  const authority=await checkAuthority(c,this.s,this.pin,s.item_id,s.seller_actor_id,now(),s.authority_snapshot_id,{ownerId:s.agreement.expectedOwnerId,version:s.agreement.expectedOwnerVersion});
  if(authority.item.owner_version!==s.agreement.expectedOwnerVersion||authority.item.registered_owner_id!==s.agreement.expectedOwnerId)throw new TransferError('ownership_conflict');
  const buyer=await this.device(c,actor,s.buyer_device_key_id),seller=await this.device(c,s.seller_actor_id,s.seller_device_key_id);
  await verifyAction(s.buyer_offer,buyer.public_jwk,buyer.id,Offer.parse({kind:'transfer-offer',transferId:id,agreementHash:s.agreement_hash,actorId:actor,keyId:buyer.id,expiresAt:s.agreement.expiresAt}));
  const sellerScan=await this.verifyConsent(c,s,s.seller_actor_id,s.seller_consent,'buyer-to-seller',false);
  const buyerScan=await this.verifyConsent(c,s,actor,signature,'seller-to-buyer',true);
  const receiptData=ReceiptData.parse({transferId:id,itemId:s.item_id,agreementPayload:s.agreement_payload,agreementHash:s.agreement_hash,buyerOffer:s.buyer_offer,sellerConsent:s.seller_consent,buyerConsent:signature,sellerPublicKey:seller.public_jwk,buyerPublicKey:buyer.public_jwk,scans:[sellerScan,buyerScan],fromVersion:s.agreement.expectedOwnerVersion,toVersion:s.agreement.expectedOwnerVersion+1,committedAt:now(),policyVersion:TRANSFER_POLICY,physicalAssociation:'unresolved',scope:'registered-transfer-only',evidenceRefs:[...new Set(authority.refs)]});
  await verifyReceiptApprovals(receiptData);
  await c.query(`UPDATE ${this.s}.transfer_sessions SET state='buyer_confirmed',buyer_consent=$2 WHERE id=$1`,[id,signature]);
  await c.query(`INSERT INTO ${this.s}.transfer_events(transfer_id,actor_id,event) VALUES($1,$2,'buyer_confirmed')`,[id,actor]);
  await c.query(`SELECT ${this.s}.commit_transfer($1,$2,$3)`,[id,randomUUID(),receiptData]);
  return {id,state:'committed',receiptStatus:'pending',message:'Transfer recorded; receipt preparing.'};
 },rawHash);}
 async receipt(actor:string,id:string){
  // Separate transaction: a failure never rolls back or repeats a committed transfer.
  if(!this.signer)return false;
  try{return await this.db.transaction(actor,async c=>{
   const box=(await c.query(`SELECT * FROM ${this.s}.receipt_outbox WHERE transfer_id=$1 FOR UPDATE SKIP LOCKED`,[id])).rows[0];
   if(!box||box.status==='ready'||Date.parse(box.next_attempt_at)>Date.now())return box?.status==='ready';
   const accepted=(await c.query(`SELECT * FROM ${this.s}.accepted_transfers WHERE id=$1`,[id])).rows[0];if(!accepted)throw new TransferError('transfer_not_found',404);
   const data=await loadSources(c,this.s),at=now(),verified=await verifyRecordSet(data.records,this.pin,at);
   const receiptData=ReceiptData.parse(accepted.receipt_data);await verifyReceiptApprovals(receiptData);
   // Original source references are exact byte hashes; no new custody or physical claim.
   const previousIds=[...new Set(receiptData.evidenceRefs.filter(r=>verified.verified.has(r)))];
   const record=EvidenceRecord.parse({schemaVersion:1,id:accepted.receipt_id,type:'transfer_receipt',namespace:this.pin.namespace,subjectIds:[accepted.item_id],scope:'unit',issuerId:this.signer!.issuerId,keyId:this.signer!.keyId,issuedAt:at,receivedAt:at,revision:1,previousIds,evidenceHashes:previousIds.map(r=>verified.verified.get(r)!.stored.sha256),visibility:'restricted',demo:true,data:receiptData});
   const stored=await signRecord(record,this.signer!.key);await verifyEvidence(stored,verified.directory,this.pin.namespace,'transfer_receipt',at);
   await c.query(`SELECT ${this.s}.store_transfer_receipt($1,$2,$3,$4)`,[id,record,stored.jws,stored.sha256]);return true;
  });}catch{
   await this.db.transaction(actor,async c=>{await c.query(`UPDATE ${this.s}.receipt_outbox SET status='failed',attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '2 seconds' WHERE transfer_id=$1 AND status<>'ready'`,[id]);});return false;
  }
 }
 async get(actor:string,id:string,recover=true):Promise<z.infer<typeof TransferView>>{
  const view=await this.db.transaction(actor,async c=>{
   let s=await this.session(c,actor,id,false);
   if(['offered','seller_approved','buyer_confirmed'].includes(s.state)&&Date.parse(s.expires_at)<=Date.now()){const expired=await c.query(`UPDATE ${this.s}.transfer_sessions SET state='expired',reason='transfer_expired' WHERE id=$1 AND state=$2 RETURNING id`,[id,s.state]);if(expired.rowCount){s.state='expired';s.reason='transfer_expired';}else s=await this.session(c,actor,id,false);}
   const labels=(await c.query(`SELECT id,public_label FROM ${this.s}.actors WHERE id=ANY($1::uuid[])`,[[s.seller_actor_id,s.buyer_actor_id]])).rows;
   const box=(await c.query(`SELECT status,receipt_jws FROM ${this.s}.receipt_outbox WHERE transfer_id=$1`,[id])).rows[0];
   const challenge=(await c.query(`SELECT payload FROM ${this.s}.transfer_challenges WHERE transfer_id=$1 AND actor_id=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()`,[id,actor])).rows[0];
   return TransferView.parse({offerSigned:!!s.buyer_offer,consent:challenge?JSON.parse(challenge.payload):null,id,state:s.state,agreementPayload:s.agreement_payload,agreement:s.agreement,agreementHash:s.agreement_hash,role:actor===s.buyer_actor_id?'buyer':'seller',sellerLabel:labels.find(a=>a.id===s.seller_actor_id)!.public_label,buyerLabel:labels.find(a=>a.id===s.buyer_actor_id)!.public_label,receiptStatus:box?.status??'pending',receipt:box?.receipt_jws??null,reason:s.reason??null,physicalAssociation:'unresolved',serverTime:now()});
  });
  if(recover&&view.state==='committed'&&view.receiptStatus!=='ready'&&this.signer){await this.receipt(actor,id);return this.get(actor,id,false);}
  return view;
 }
 async receiptProof(actor:string,id:string){return this.db.transaction(actor,async c=>{
  await this.session(c,actor,id,false);
  const box=(await c.query(`SELECT * FROM ${this.s}.receipt_outbox WHERE transfer_id=$1 AND status='ready'`,[id])).rows[0];
  if(!box)throw new TransferError('receipt_preparing');
  const accepted=(await c.query(`SELECT receipt_id FROM ${this.s}.accepted_transfers WHERE id=$1`,[id])).rows[0];
  const data=await loadSources(c,this.s),verified=await verifyRecordSet(data.records,this.pin,now());
  return {record:{id:accepted.receipt_id,jws:box.receipt_jws,sha256:box.receipt_sha256},directory:verified.directory.bindings.map(v=>v.stored),serverTime:now()};
 });}
 async resolve(actor:string,handle:string){return this.db.transaction(actor,async c=>{const row=(await c.query(`SELECT f.transfer_id FROM ${this.s}.transfer_frames f JOIN ${this.s}.transfer_sessions s ON s.id=f.transfer_id WHERE f.handle=$1 AND f.signature IS NOT NULL AND $2 IN(s.seller_actor_id,s.buyer_actor_id)`,[handle,actor])).rows[0];if(!row)throw new TransferError('transfer_not_found',404);return {id:row.transfer_id};});}
 async display(actor:string,id:string,direction:Direction){return this.db.transaction(actor,async c=>{
  const s=await this.session(c,actor,id,false),forward=direction==='buyer-to-seller';this.active(s,[forward?'offered':'seller_approved']);
  if(actor!==(forward?s.buyer_actor_id:s.seller_actor_id))throw new TransferError('wrong_direction',403);
  await this.device(c,actor,forward?s.buyer_device_key_id:s.seller_device_key_id);
  const frames=(await c.query(`SELECT handle,sequence,not_before,expires_at FROM ${this.s}.transfer_frames WHERE transfer_id=$1 AND direction=$2 AND signature IS NOT NULL ORDER BY sequence`,[id,direction])).rows;
  return {frames:frames.map(r=>({handle:r.handle,sequence:r.sequence,issuedAt:new Date(r.not_before).toISOString(),expiresAt:new Date(r.expires_at).toISOString()})),serverTime:now(),targetFps:5};
 });}
 async cancel(actor:string,id:string,key:string,reason:'declined'|'cancelled',signature:string,rawHash?:string){return this.operation(actor,`cancel:${id}`,key,{reason,signature},async c=>{
  const s=await this.session(c,actor,id);this.active(s,['offered','seller_approved']);const d=await this.device(c,actor,actor===s.buyer_actor_id?s.buyer_device_key_id:s.seller_device_key_id);
  if(!(await c.query(`SELECT active FROM ${this.s}.transfer_policies WHERE version=$1`,[s.agreement.policyVersion])).rows[0]?.active)throw new TransferError('policy_unavailable');
  await verifyAction(signature,d.public_jwk,d.id,Cancel.parse({kind:'transfer-cancel',transferId:id,agreementHash:s.agreement_hash,actorId:actor,keyId:d.id,reason,policyVersion:TRANSFER_POLICY,expiresAt:s.agreement.expiresAt}));
  await c.query(`UPDATE ${this.s}.transfer_sessions SET state='cancelled',reason=$2 WHERE id=$1`,[id,reason]);await c.query(`INSERT INTO ${this.s}.transfer_events(transfer_id,actor_id,event) VALUES($1,$2,$3)`,[id,actor,reason]);return {id,state:'cancelled'};
 },rawHash);}

}
export async function configuredSigner():Promise<ReceiptSigner|null>{
 const raw=process.env.TRANSFER_SIGNING_JWK;if(!raw)return null;
 const key=z.strictObject({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string(),y:z.string(),d:z.string(),kid:z.uuid(),issuerId:z.uuid()}).parse(JSON.parse(raw));
 return {key:await importJWK({kty:key.kty,crv:key.crv,x:key.x,y:key.y,d:key.d},'ES256') as CryptoKey,keyId:key.kid,issuerId:key.issuerId};
}
