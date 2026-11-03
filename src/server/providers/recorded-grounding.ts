import {readFile} from 'node:fs/promises';
import {decodeSam} from '../../../scripts/spikes/sam.js';
import {MUSE_MODEL} from '../../../scripts/spikes/meta-gateway.js';
import {LiteralReading} from '../../contracts/inspection.js';
import type {Capture} from '../../contracts/investigation.js';
import type {GroundingProvider} from '../inspector/inspector.js';
import {verifySource} from '../inspector/grounding.js';
async function saved(c:Capture,bytes:Uint8Array){await verifySource(c,bytes);const e=JSON.parse(await readFile('docs/packproof/evidence/provider.json','utf8'));if(e.sam?.status!=='passed'||e.sam.actualModel!=='sam-3.1'||e.sam.sourceSha256!==c.sha256||e.sam.sourceDimensions.width!==c.width||e.sam.sourceDimensions.height!==c.height)throw new Error('no_recorded_region');return e;}
// Replay only the exact original synthetic fixture, never an arbitrary upload.
export class RecordedGroundingProvider implements GroundingProvider{
 async segment(c:Capture,bytes:Uint8Array){const e=await saved(c,bytes),raw=await readFile('docs/packproof/evidence/sam/special-token-output.txt','utf8');async function* stream(){yield{type:'response.output_text.delta',item_id:'p3-recorded',output_index:0,content_index:0,delta:raw};yield{type:'response.output_text.done',item_id:'p3-recorded',output_index:0,content_index:0,text:raw};yield{type:'response.completed'};}const parsed=await decodeSam(stream(),c.width,c.height);return {parsed,provider:{model:'sam-3.1' as const,responseId:e.sam.responseId,requestId:e.sam.requestId??null,mode:'recorded-demo' as const}};}
 async read(...args:Parameters<GroundingProvider['read']>){const [c,bytes,region,,question]=args,e=await saved(c,bytes);if(question!=='product_mark'||e.visual?.actualModel!==MUSE_MODEL||region.sourceSha256!==c.sha256)throw new Error('no_recorded_reading');const literal=LiteralReading.parse({value:e.visual.reading.quality==='readable'?e.visual.reading.value:null,readability:e.visual.reading.quality==='readable'?'readable':'unreadable',qualityBlockers:['Recorded real P0 evidence for this exact synthetic fixture; no new inference or physical association.']});return {literal,reader:{model:'muse-spark-1.3' as const,responseId:e.visual.responseId,requestId:e.visual.requestId??null,mode:'recorded-demo' as const}};}
}
