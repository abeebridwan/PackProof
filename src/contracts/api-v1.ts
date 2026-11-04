import {z} from 'zod';
import {ProductInput,ItemInput,SellerInput,ProductResult,SellerResult,NoticeResult,HistoryResult} from './evidence.js';
import {Hash,Id,Scope,Utc} from './p0.js';
import {InvestigationInput,ResumeInput,PublicInvestigation} from './investigation.js';
import {CreateTransfer,TransferView} from './transfer.js';
import {DualComparison} from './platform.js';

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
 'products.relationships':descriptor(ProductInput,ProductResult,'evidence:read',true),
 'sellers.authority':descriptor(SellerInput,SellerResult,'evidence:read',true),
 'notices.list':descriptor(ItemInput,NoticeResult,'evidence:read',true),
 'history.get':descriptor(ItemInput,HistoryResult,'evidence:read',true),
 'notices.events':descriptor(ItemInput,NoticeEvents,'evidence:read',true),
 'investigations.start':descriptor(InvestigationInput,PublicInvestigation,'investigation:write'),
 'investigations.get':descriptor(id,PublicInvestigation,'investigation:read'),
 'investigations.resume':descriptor(z.strictObject({id:Id,resume:ResumeInput}),PublicInvestigation,'investigation:write'),
 'transfers.propose':descriptor(CreateTransfer,z.object({id:Id}).passthrough(),'transfer:propose'),
 'transfers.get':descriptor(id,TransferView,'transfer:read'),
 'dualproof.get':descriptor(z.strictObject({transferId:Id}),DualComparison,'transfer:read'),
} as const;
export type Operation=keyof typeof API_OPERATIONS;
export type Input<K extends Operation>=z.input<(typeof API_OPERATIONS)[K]['input']>;
export type Output<K extends Operation>=z.output<(typeof API_OPERATIONS)[K]['output']>;
