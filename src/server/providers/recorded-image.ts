import {readFile} from 'node:fs/promises';
import {decodeSam} from '../../../scripts/spikes/sam.js';
import {MUSE_MODEL} from '../../../scripts/spikes/meta-gateway.js';
import {ImageEvidenceResult} from '../evidence/services.js';
import type {Capture} from '../../contracts/investigation.js';
export interface ImageInspector{question?(capture:Capture):Promise<'product_mark'|'package_mark'|'printed_expiry'|'packaging_condition'>;inspect(capture:Capture,question:'product_mark'|'package_mark'|'printed_expiry'|'packaging_condition'):Promise<ReturnType<typeof ImageEvidenceResult.parse>>;}
const empty=(reason:string)=>ImageEvidenceResult.parse({status:'needs_evidence',reason,evidence_refs:[],scope:'unit',asOf:new Date().toISOString(),policyVersion:'p1b-image-interface-1',next_actions:['Capture a closer view; live visual validation remains disabled'],data:{value:null,cropRecordIds:[],maskRecordIds:[],frameRecordIds:[],provenance:'model_reading',qualityBlockers:[reason]}});
export class RecordedImageInspector implements ImageInspector{
 async inspect(capture:Capture,question:'product_mark'|'package_mark'|'printed_expiry'|'packaging_condition'){
  const saved=JSON.parse(await readFile('docs/packproof/evidence/provider.json','utf8'));
  if(capture.sha256!==saved.sam?.sourceSha256||capture.width!==600||capture.height!==480)return empty('This capture has no authorized live model analysis; its marking is unknown');
  if(question!=='product_mark')return empty('Saved authentic fixture does not establish this requested marking');
  if(saved.sam.actualModel!=='sam-3.1'||saved.visual?.actualModel!==MUSE_MODEL) return empty('Saved provider provenance is incomplete');
  const raw=await readFile('docs/packproof/evidence/sam/special-token-output.txt','utf8');
  async function* events(){yield {type:'response.output_text.delta',item_id:'p1b-replay',output_index:0,content_index:0,delta:raw};yield {type:'response.output_text.done',item_id:'p1b-replay',output_index:0,content_index:0,text:raw};yield {type:'response.completed'};}
  await decodeSam(events(),capture.width,capture.height);
  const reading=saved.visual?.reading;
  const value=typeof reading?.value==='string'&&reading.quality==='readable'?reading.value:null;
  const result=empty('Authentic saved P0 SAM/Muse evidence replay for this exact synthetic fixture; not a new inference');
  result.data!.value=value;
  result.evidence_refs=[capture.id];
  result.data!.frameRecordIds=[capture.id];
  result.data!.qualityBlockers=value===null?['Unreadable saved marking']:['Replay only; no physical association established'];
  return result;
 }
}
