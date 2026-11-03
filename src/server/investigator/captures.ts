import sharp from 'sharp';
import {Capture} from '../../contracts/investigation.js';
import {sha256} from '../../domain/verification/p0-crypto.js';
import {projectUrl,secretKeyAllowed} from '../../../scripts/spikes/infrastructure.js';
import {InvestigationError} from './store.js';
import {CaptureDetails} from '../../contracts/inspection.js';
import type {InvestigationStore,Owner} from './types.js';
export const CAPTURE_LIMIT=2*1024*1024;
export async function validateImage(bytes:Uint8Array,mime:string){
 if(bytes.length<16||bytes.length>CAPTURE_LIMIT||!['image/jpeg','image/png'].includes(mime))throw new InvestigationError('invalid_image',400);
 try{const info=await sharp(bytes,{limitInputPixels:4096*4096,failOn:'warning',animated:false}).metadata();
  if(!info.width||!info.height||info.width>4096||info.height>4096||(info.pages??1)>1||!['jpeg','png'].includes(info.format??'')||mime!==(info.format==='jpeg'?'image/jpeg':'image/png'))throw new Error('bad dimensions');
  // Force actual bounded decoding, not just trusting metadata headers.
  await sharp(bytes,{limitInputPixels:4096*4096,failOn:'warning'}).stats();
  const rotated=[5,6,7,8].includes(info.orientation??1);return {width:rotated?info.height:info.width,height:rotated?info.width:info.height,sha256:await sha256(bytes)};
 }catch{throw new InvestigationError('invalid_image',400);}
}
export interface CaptureStorage{upload(path:string,bytes:Uint8Array,mime:string):Promise<void>;remove(path:string):Promise<void>;}
export class SupabaseCaptureStorage implements CaptureStorage{
 private request(path:string,method:string,bytes?:Uint8Array,mime?:string){
  const origin=projectUrl(process.env.SUPABASE_URL??'',process.env.SUPABASE_PROJECT_REF??'');const key=process.env.SUPABASE_SECRET_KEY??'';
  if(!secretKeyAllowed(key)||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(original\.png|original\.jpg)$/.test(path))throw new InvestigationError('storage_configuration',503);
  return fetch(new URL(`/storage/v1/object/${method==='GET'?'authenticated/':''}packproof-p0-private/${path}`,origin),{method,headers:{apikey:key,...(key.split('.').length===3?{Authorization:`Bearer ${key}`}:{ }),...(mime?{'content-type':mime}:{})},...(bytes?{body:new Uint8Array(bytes)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 }
 async read(path:string){const r=await this.request(path,'GET');if(!r.ok)throw new InvestigationError('storage_unavailable',503);const reader=r.body?.getReader();if(!reader)throw new InvestigationError('storage_unavailable',503);const chunks:Uint8Array[]=[];let size=0;while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>CAPTURE_LIMIT){await reader.cancel();throw new InvestigationError('stored_image_too_large');}chunks.push(v.value);}return new Uint8Array(Buffer.concat(chunks));}
 async upload(path:string,bytes:Uint8Array,mime:string){const r=await this.request(path,'POST',bytes,mime);if(!r.ok)throw new InvestigationError('storage_unavailable',503);}
 async remove(path:string){await this.request(path,'DELETE');}
}
export async function saveCapture(store:InvestigationStore,owner:Owner,storage:CaptureStorage,input:{investigationId:string;revision:number;mime:string;bytes:Uint8Array;source:'live-camera'|'imported';capturedAt:string|null;inspection?:CaptureDetails}){
 const row=await store.get(owner,input.investigationId);
 if(row.revision!==input.revision||row.status!=='needs_input')throw new InvestigationError('capture_revision_mismatch');
 const image=await validateImage(input.bytes,input.mime);const details=input.inspection?CaptureDetails.parse(input.inspection):undefined;if(details&&(details.box.right>image.width||details.box.bottom>image.height))throw new InvestigationError('region_out_of_bounds',400);const id=crypto.randomUUID();
 const objectPath=`${row.id}/${id}/original.${input.mime==='image/png'?'png':'jpg'}`;
 const capture=Capture.parse({id,investigationId:row.id,revision:row.revision,...image,mime:input.mime,bytes:input.bytes.length,source:input.source,capturedAt:input.capturedAt,uploadedAt:new Date().toISOString(),objectPath});
 await storage.upload(objectPath,input.bytes,input.mime);
 try{await store.addCapture(owner,capture,details);}catch(e){try{await storage.remove(objectPath);}catch{}throw e;}
 return {id,sha256:capture.sha256,width:capture.width,height:capture.height,revision:capture.revision,source:capture.source};
}
