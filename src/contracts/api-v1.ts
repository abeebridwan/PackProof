import {z} from 'zod';
import {ProductInput,ItemInput,SellerInput,ProductResult,SellerResult,NoticeResult,HistoryResult} from './evidence.js';
import {Hash,Id,Scope,Utc,gateResult} from './p0.js';
import {InvestigationInput,ResumeInput,PublicInvestigation,Finding,Capture} from './investigation.js';
import {PublicObservation,CaptureDetails} from './inspection.js';
import {EvidencePack} from './offline.js';
import {CreateTransfer,TransferView} from './transfer.js';
import {DualComparison,EvidenceLinkInput,ProductDraftInput} from './platform.js';

export const API_VERSION='1' as const;
export const ApiScope=z.enum(['evidence:read','investigation:read','investigation:write','transfer:read','transfer:propose','pack:read']);
export type ApiScope=z.infer<typeof ApiScope>;
export const NoticeEvent=z.strictObject({schemaVersion:z.literal(1),eventId:Id,idempotencyKey:Hash,sourceRecordId:Id,itemId:Id,scope:Scope,type:z.literal('packaging_revision'),status:z.literal('effective'),effectiveFrom:Utc,effectiveUntil:Utc,message:z.string().max(1000),demo:z.literal(true),asOf:Utc,directoryVersion:z.number().int().positive(),provenance:z.literal('verified_signed_record'),broadcastEligible:z.literal(true)});
export const NoticeEvents=z.strictObject({schemaVersion:z.literal(1),events:z.array(NoticeEvent).max(32),asOf:Utc});
export const ApiError=z.strictObject({apiVersion:z.literal('1'),error:z.string().max(100),message:z.string().max(500)});
const id=z.strictObject({id:Id});
const descriptor=<I extends z.ZodType,O extends z.ZodType>(input:I,output:O,scope:ApiScope,publicRead=false)=>({input,output,scope,publicRead});
// POST /api/v1/<operation>. Read-only operations use POST to preserve literal
// identifiers without URL logs. All results retain their Evidence Engine gates.
export const API_OPERATIONS={
 'products.lookup':descriptor(ProductInput,ProductResult,'evidence:read',true),
 'products.draft':descriptor(ProductDraftInput,z.strictObject({id:Id,data:ProductDraftInput,status:z.literal('draft'),trustedIssuance:z.literal(false),issuanceBlocker:z.string().max(500)}),'investigation:write'),
 'products.relationships':descriptor(ProductInput,ProductResult,'evidence:read',true),
 'sellers.authority':descriptor(SellerInput,SellerResult,'evidence:read',true),
 'notices.list':descriptor(ItemInput,NoticeResult,'evidence:read',true),
 'history.get':descriptor(ItemInput,HistoryResult,'evidence:read',true),
 'verification.summary':descriptor(InvestigationInput,Finding,'evidence:read',true),
 'ownership.get':descriptor(ItemInput,z.strictObject({itemId:Id,ownerActorId:Id,ownerVersion:z.number().int().positive(),sourceRecordId:Id,asOf:Utc,physicalAssociation:z.literal('unresolved')}),'transfer:read'),
 'notices.events':descriptor(ItemInput,NoticeEvents,'evidence:read',true),
 'investigations.start':descriptor(InvestigationInput,PublicInvestigation,'investigation:write'),
 'investigations.get':descriptor(id,PublicInvestigation,'investigation:read'),
 'investigations.resume':descriptor(z.strictObject({id:Id,resume:ResumeInput}),PublicInvestigation,'investigation:write'),
 'inspections.get':descriptor(id,z.strictObject({observations:z.array(PublicObservation).max(128),captures:z.array(Capture.omit({objectPath:true}).extend({processingConsent:z.boolean().nullable()})).max(32),physicalAssociation:z.literal('unresolved')}),'investigation:read'),
 'captures.submit':descriptor(z.strictObject({investigationId:Id,revision:z.number().int().positive(),source:z.enum(['live-camera','imported']),capturedAt:Utc.nullable(),mime:z.enum(['image/jpeg','image/png']),base64:z.string().max(2796204),inspection:CaptureDetails}),z.strictObject({id:Id,sha256:Hash,width:z.number().int().positive(),height:z.number().int().positive(),revision:z.number().int().positive(),source:z.enum(['live-camera','imported'])}),'investigation:write'),
 'evidence.attach':descriptor(EvidenceLinkInput,z.strictObject({linked:z.literal(true)}),'investigation:write'),
 'evidence.history':descriptor(z.strictObject({draftId:Id.nullable(),transferId:Id.nullable()}).refine(v=>(v.draftId!==null)!==(v.transferId!==null),'Choose one evidence subject'),z.array(z.strictObject({id:Id,capture_id:Id,investigation_id:Id,revision:z.number().int().positive(),source_sha256:Hash,side:z.enum(['origin','dispatch','arrival']),condition_note:z.string().max(1000),created_at:Utc,observations:z.array(PublicObservation).max(4),frame:z.strictObject({video_id:Id,timestamp_ms:z.number().int().nonnegative().max(8000),source_video_sha256:Hash}).nullable()})).max(32),'investigation:read'),
 'transfers.eligibility':descriptor(CreateTransfer,gateResult(z.strictObject({eligible:z.boolean(),itemId:Id,sellerActorId:Id,buyerActorId:Id,ownerVersion:z.number().int().positive(),physicalAssociation:z.literal('unresolved')})),'transfer:read'),
 'transfers.propose':descriptor(CreateTransfer,z.object({id:Id}).passthrough(),'transfer:propose'),
 'transfers.get':descriptor(id,TransferView,'transfer:read'),
 'transfers.receipt':descriptor(id,z.object({record:z.object({id:Id,jws:z.string(),sha256:Hash}).passthrough()}).passthrough(),'transfer:read'),
 'packs.create':descriptor(z.strictObject({itemIds:z.array(Id).min(1).max(3)}),EvidencePack,'pack:read'),
 'dualproof.get':descriptor(z.strictObject({transferId:Id}),DualComparison,'transfer:read'),
} as const;
export type Operation=keyof typeof API_OPERATIONS;
export type Input<K extends Operation>=z.input<(typeof API_OPERATIONS)[K]['input']>;
export type Output<K extends Operation>=z.output<(typeof API_OPERATIONS)[K]['output']>;
