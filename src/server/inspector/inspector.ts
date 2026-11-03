import {Observation,type CaptureDetails,type Question} from '../../contracts/inspection.js';
import {ImageEvidenceResult} from '../evidence/services.js';
import type {Capture} from '../../contracts/investigation.js';
import type {ImageInspector} from '../providers/recorded-image.js';
import {RecordedImageInspector} from '../providers/recorded-image.js';
import type {InspectionRepository} from './repository.js';
import {verifySource,deriveRegion,type Segmentation} from './grounding.js';
export interface GroundingProvider{
 segment(c:Capture,bytes:Uint8Array,box:CaptureDetails['box']):Promise<{parsed:Segmentation;provider:NonNullable<Observation['region']>['provider']}>;
 read(c:Capture,bytes:Uint8Array,region:NonNullable<Observation['region']>,crop:Uint8Array,q:Question):Promise<{literal:Observation['literal'];reader:NonNullable<Observation['reader']>}>;
}
export class GroundedImageInspector implements ImageInspector{
 constructor(private readonly repository:InspectionRepository,private readonly load:(c:Capture)=>Promise<Uint8Array>,private readonly provider:GroundingProvider|null=null,private readonly legacy:ImageInspector=new RecordedImageInspector()){}
 async question(c:Capture){return (await this.repository.details(c))?.question??'product_mark';}
 async inspect(c:Capture,requested:Question){
  const details=await this.repository.details(c);
  // Retain exact P0 replay compatibility; it cannot read arbitrary new images.
  if(!details)return this.legacy.inspect(c,requested);
  if(requested!==details.question)throw new Error('inspection_question_mismatch');
  const bytes=await verifySource(c,await this.load(c));
  const existing=(await this.repository.observations(c.investigationId)).find(o=>o.captureId===c.id&&o.question===details.question);
  if(existing)return observationResult(existing);
  const base={id:crypto.randomUUID(),investigationId:c.investigationId,captureId:c.id,captureRevision:c.revision,sourceSha256:c.sha256,question:details.question,createdAt:new Date().toISOString(),provenance:'model_reading' as const,independentObservationId:c.id};
  let observation:Observation;
  if(!details.processingConsent||!this.provider){
   observation=Observation.parse({...base,literal:{value:null,readability:'unreadable',qualityBlockers:[!details.processingConsent?'No consent to send this image to Meta.':'Live analysis is disabled; no recorded provider result exists for this capture.']},region:null,reader:null});
  }else{
   let grounded:Observation['region']=null;
   try{const sam=await this.provider.segment(c,bytes,details.box);const {region,crop}=await deriveRegion(c,bytes,details.box,sam.parsed,sam.provider);
    grounded=region;
    const read=await this.provider.read(c,bytes,region,crop,details.question);
    observation=Observation.parse({...base,region,...read});
   }catch{
    // No provider error bodies, private URLs or arbitrary text are persisted.
    observation=Observation.parse({...base,literal:{value:null,readability:'unreadable',qualityBlockers:['No validated model reading is available. This does not establish whether your text is readable; check the analysis mode and provider status.']},region:grounded,reader:null});
   }
  }
  return observationResult(await this.repository.append(observation));
 }
}
export function observationResult(o:Observation){return ImageEvidenceResult.parse({status:o.literal.value===null?'needs_evidence':'supported',reason:o.literal.value===null?o.literal.qualityBlockers[0]??'Retake the requested marking.':'Source-bound literal reading only; physical association remains unresolved.',evidence_refs:[o.id,o.captureId,...(o.region?[o.region.id]:[])],scope:'unit',asOf:o.createdAt,policyVersion:'p3-grounded-reading-1',next_actions:o.literal.value===null?['Retake a sharp close view of the requested marking.']:['Compare with signed records; do not infer authenticity.'],data:{value:o.literal.value,cropRecordIds:o.region?[o.region.id]:[],maskRecordIds:o.region?[o.region.id]:[],frameRecordIds:[o.captureId],provenance:'model_reading',qualityBlockers:o.literal.qualityBlockers,question:o.question,observationId:o.id}});}
