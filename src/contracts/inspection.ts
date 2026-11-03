import {z} from 'zod';
import {Id,Hash,Utc,Text} from './p0.js';
export const Question=z.enum(['product_mark','package_mark','printed_expiry']);
export type Question=z.infer<typeof Question>;
export const PixelBox=z.strictObject({left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),right:z.number().int().positive().max(4096),bottom:z.number().int().positive().max(4096)}).refine(b=>b.right>b.left&&b.bottom>b.top,'Empty region');
export const CaptureDetails=z.strictObject({question:Question,box:PixelBox,processingConsent:z.boolean(),consentVersion:z.literal('p3-meta-media-1')});
export type CaptureDetails=z.infer<typeof CaptureDetails>;
export const LiteralReading=z.strictObject({value:Text.nullable(),readability:z.enum(['readable','unreadable','ambiguous']),qualityBlockers:z.array(Text).max(8)}).superRefine((v,c)=>{
 if(v.readability!=='readable'&&v.value!==null||v.readability==='readable'&&v.value===null)c.addIssue({code:'custom',message:'Readability/value conflict'});
});
export const ProviderProvenance=z.strictObject({model:z.enum(['sam-3.1','muse-spark-1.3']),responseId:Text,requestId:Text.nullable(),mode:z.enum(['live','recorded-demo'])});
export const Region=z.strictObject({id:Id,sourceCaptureId:Id,sourceSha256:Hash,sourceWidth:z.number().int().positive().max(4096),sourceHeight:z.number().int().positive().max(4096),objectId:Text.optional(),maskEncoding:z.enum(['lossless','one_bit']).optional(),promptBox:PixelBox,bounds:PixelBox,box:PixelBox,maskWidth:z.number().int().positive(),maskHeight:z.number().int().positive(),maskBase64:z.string().max(1400000),maskSha256:Hash,cropSha256:Hash,cropWidth:z.number().int().positive(),cropHeight:z.number().int().positive(),transform:z.enum(['half-open source crop; nearest mask resize to bounds','EXIF-upright original; half-open crop; nearest mask resize to bounds']),frameTimestamp:z.null(),provider:ProviderProvenance});
export type Region=z.infer<typeof Region>;
export const Observation=z.strictObject({id:Id,investigationId:Id,captureId:Id,captureRevision:z.number().int().positive(),sourceSha256:Hash,question:Question,literal:LiteralReading,region:Region.nullable(),reader:ProviderProvenance.nullable(),createdAt:Utc,provenance:z.literal('model_reading'),independentObservationId:Id});
export type Observation=z.infer<typeof Observation>;
// Public metadata never contains object paths, storage grants, raster bytes or access tokens.
export const PublicObservation=Observation.omit({region:true}).extend({region:Region.omit({maskBase64:true}).nullable()});

export function publicObservation(o:Observation){if(!o.region)return PublicObservation.parse(o);const {maskBase64,...region}=o.region;return PublicObservation.parse({...o,region});}
