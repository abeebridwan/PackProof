import {z} from 'zod';
import {Hash,Id,Scope,Utc} from './p0.js';

// Account presentation is independent of issuer grants, ownership and delegation.
export const AccountType=z.enum(['manufacturer','regular']);
export const ProfileInput=z.strictObject({accountType:AccountType,displayName:z.string().trim().min(2).max(100)});
export const Signup=ProfileInput.extend({email:z.email().max(254),password:z.string().min(12).max(128)});
const identifier=z.string().trim().min(1).max(128);
export const ProductDraftInput=z.strictObject({name:z.string().trim().min(1).max(160),description:z.string().max(2000),producer:z.string().trim().min(1).max(160),scope:Scope,modelCode:identifier,batchCode:identifier.nullable(),productMark:identifier.nullable(),packagingMark:identifier.nullable(),containerMark:identifier.nullable(),printedExpiry:z.string().max(100).nullable()}).superRefine((v,c)=>{if(v.scope==='unit'&&(!v.batchCode||!v.productMark||!v.packagingMark||v.productMark===v.packagingMark))c.addIssue({code:'custom',message:'A unit requires a batch and distinct product and packaging identifiers'});if(v.scope==='container'&&!v.containerMark)c.addIssue({code:'custom',message:'A container identifier is required'});});
export const EvidenceLinkInput=z.strictObject({captureId:Id,investigationId:Id,revision:z.number().int().positive(),sourceSha256:Hash,draftId:Id.nullable(),transferId:Id.nullable(),side:z.enum(['origin','dispatch','arrival']),conditionNote:z.string().max(1000)}).refine(v=>v.side==='origin'?v.draftId!==null&&v.transferId===null:v.transferId!==null&&v.draftId===null,'Choose a draft origin or a handover side');
export const ComparisonStatus=z.enum(['observed_consistency','mismatch','insufficient_evidence','unresolved_physical_association','not_inspected']);
export const DualFinding=z.strictObject({field:z.string().max(80),status:ComparisonStatus,dispatch:z.string().max(2000).nullable(),arrival:z.string().max(2000).nullable(),evidenceRefs:z.array(Id).max(32),nextView:z.string().max(500).nullable()});
export const DualComparison=z.strictObject({schemaVersion:z.literal(1),transferId:Id,asOf:Utc,findings:z.array(DualFinding).max(32),physicalAssociation:z.literal('unresolved'),ownershipEffect:z.literal('none'),evidenceRefs:z.array(Id).max(64)});
export type DualComparison=z.infer<typeof DualComparison>;
