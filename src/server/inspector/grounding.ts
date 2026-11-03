import sharp from 'sharp';
import {Region,LiteralReading,type Question} from '../../contracts/inspection.js';
import type {Capture} from '../../contracts/investigation.js';
import {sha256} from '../../domain/verification/p0-crypto.js';
import {validateImage} from '../investigator/captures.js';
import {InvestigationError} from '../investigator/store.js';
import {decodeSam} from '../../../scripts/spikes/sam.js';
export type Segmentation=Awaited<ReturnType<typeof decodeSam>>;
export async function verifySource(c:Capture,bytes:Uint8Array){const v=await validateImage(bytes,c.mime);if(v.sha256!==c.sha256||v.width!==c.width||v.height!==c.height||bytes.length!==c.bytes)throw new InvestigationError('capture_integrity_mismatch');return bytes;}
export async function deriveRegion(c:Capture,bytes:Uint8Array,selection:Region['promptBox'],parsed:Segmentation,provider:Region['provider']){
 await verifySource(c,bytes);
 const {mask,box,raster}=parsed,b=mask.bounds;
 if(selection.right>c.width||selection.bottom>c.height||b.right>c.width||b.bottom>c.height)throw new InvestigationError('region_out_of_bounds');
 const overlap=Math.max(0,Math.min(selection.right,b.right)-Math.max(selection.left,b.left))*Math.max(0,Math.min(selection.bottom,b.bottom)-Math.max(selection.top,b.top));
 if(overlap/((b.right-b.left)*(b.bottom-b.top))<0.5)throw new InvestigationError('unrelated_region');
 const maskPng=await sharp(Buffer.from(raster.map(x=>x?255:0)),{raw:{width:mask.mask.width,height:mask.mask.height,channels:1}}).png().toBuffer();
 const crop=await sharp(bytes).rotate().extract({left:b.left,top:b.top,width:b.right-b.left,height:b.bottom-b.top}).png().toBuffer();
 if(crop.length>2097152)throw new InvestigationError('crop_too_large');
 const region=Region.parse({id:crypto.randomUUID(),sourceCaptureId:c.id,sourceSha256:c.sha256,sourceWidth:c.width,sourceHeight:c.height,objectId:mask.objectId,maskEncoding:mask.mask.encoding,promptBox:selection,bounds:b,box:{left:Math.floor(box.left),top:Math.floor(box.top),right:Math.ceil(box.right),bottom:Math.ceil(box.bottom)},maskWidth:mask.mask.width,maskHeight:mask.mask.height,maskBase64:maskPng.toString('base64'),maskSha256:await sha256(maskPng),cropSha256:await sha256(crop),cropWidth:b.right-b.left,cropHeight:b.bottom-b.top,transform:'EXIF-upright original; half-open crop; nearest mask resize to bounds',frameTimestamp:null,provider});
 return {region,crop};
}
export async function renderRegion(c:Capture,bytes:Uint8Array,r:Region,kind:'crop'|'overlay'|'mask'){
 await verifySource(c,bytes);
 if(r.sourceCaptureId!==c.id||r.sourceSha256!==c.sha256||r.sourceWidth!==c.width||r.sourceHeight!==c.height)throw new InvestigationError('region_source_mismatch');
 const mask=Buffer.from(r.maskBase64,'base64');if(await sha256(mask)!==r.maskSha256)throw new InvestigationError('mask_integrity_mismatch');
 if(kind==='mask')return mask;
 const b=r.bounds;
 const crop=await sharp(bytes).rotate().extract({left:b.left,top:b.top,width:r.cropWidth,height:r.cropHeight}).png().toBuffer();
 if(await sha256(crop)!==r.cropSha256)throw new InvestigationError('crop_integrity_mismatch');if(kind==='crop')return crop;
 const alpha=await sharp(mask).resize(b.right-b.left,b.bottom-b.top,{kernel:'nearest'}).removeAlpha().greyscale().raw().toBuffer();
 const rgba=Buffer.alloc(alpha.length*4);for(let i=0;i<alpha.length;i++){rgba[i*4]=30;rgba[i*4+1]=180;rgba[i*4+2]=100;rgba[i*4+3]=Math.round(alpha[i]!*0.3);}
 return sharp(bytes).rotate().composite([{input:rgba,raw:{width:b.right-b.left,height:b.bottom-b.top,channels:4},left:b.left,top:b.top}]).png().toBuffer();
}
export function comparison(question:Question,raw:unknown,input:{productMark:string;packagingMark:string|null},readingAttempted=true){
 const reading=LiteralReading.parse(raw),expected=question==='product_mark'?input.productMark:question==='package_mark'?input.packagingMark:null;
 if(reading.value===null&&!readingAttempted)return {status:'needs_evidence' as const,reason:'No model reading is available for this photo. The text has not been assessed.'};
 if(reading.value===null)return {status:'needs_evidence' as const,reason:'The requested text is unreadable or ambiguous. Retake a sharp, glare-free close view.'};
 if(question==='printed_expiry')return {status:'needs_evidence' as const,reason:'Printed expiry observed literally; regulatory registration and batch expiry remain unknown. No safety or validity verdict.'};
 if(expected===null)return {status:'needs_evidence' as const,reason:'Literal marking observed; no human-supplied comparison code. Pair relationship remains unchecked.'};
 return reading.value===expected?{status:'supported' as const,reason:'Literal marking agrees with the supplied code; signed mapping and physical association are separate checks.'}:{status:'blocked' as const,reason:'Literal marking conflicts with the supplied code. Confirm the observed code; do not infer authenticity.'};
}
