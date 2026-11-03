import {it,expect,describe} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation,resumeInvestigation} from '../../src/server/investigator/graph.js';
import {SupabaseCaptureStorage,saveCapture} from '../../src/server/investigator/captures.js';
import {PostgresInspectionRepository} from '../../src/server/inspector/repository.js';
import {GroundedImageInspector} from '../../src/server/inspector/inspector.js';
import {deriveRegion} from '../../src/server/inspector/grounding.js';
import {inspectionHttp} from '../../src/server/inspector/http.js';
import {Observation} from '../../src/contracts/inspection.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
import {decodeSam} from '../../scripts/spikes/sam.js';
import {input} from '../fixtures/investigator-memory.js';
const owner=async()=>({sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null});
describe.skipIf(process.env.PACKPROOF_P3_INTEGRATION!=='1')('P3 real private Storage, RLS and graph',()=>{
 it('stores source and consent metadata, proxies verified bytes, resumes a recapture and denies foreign/changed/overwritten evidence',async()=>{
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),who={sessionHash:await sha256(utf8(token)),userId:null},r=await runtime(who),other=await runtime(await owner()),storage=new SupabaseCaptureStorage();let path:string|null=null;
  try{
   const paused=await startInvestigation(r.options,input({context:'physical',sellerId:null}));expect(paused.status).toBe('needs_input');
   const bytes=new Uint8Array(await readFile('docs/packproof/evidence/sam/original-demo.png')),details={question:'product_mark' as const,box:{left:130,top:110,right:470,bottom:370},processingConsent:false,consentVersion:'p3-meta-media-1' as const};
   const saved=await saveCapture(r.store,who,storage,{investigationId:paused.id,revision:1,mime:'image/png',bytes,source:'imported',capturedAt:'2020-01-01T00:00:00Z',inspection:details});const capture=await r.store.capture(who,paused.id,saved.id);path=capture.objectPath;
   expect(await storage.read(path)).toEqual(bytes);const repo=new PostgresInspectionRepository(r.pool);expect(await repo.details(capture)).toEqual(details);
   await expect(r.store.capture(who,paused.id,crypto.randomUUID())).rejects.toThrow('capture_not_found');
   const view=await inspectionHttp(new Request('https://localhost/api/investigations/'+paused.id+'/inspection',{headers:{cookie:'packproof_session='+token}}),paused.id);expect(view.status).toBe(200);const metadata=await view.json();expect(metadata.captures).toHaveLength(1);expect(metadata.captures[0]).toMatchObject({id:saved.id,width:600,height:480,processingConsent:false,sha256:saved.sha256});expect(JSON.stringify(metadata)).not.toContain(capture.objectPath);
   const foreign=await inspectionHttp(new Request('https://localhost/api/investigations/'+paused.id+'/inspection',{headers:{cookie:'packproof_session='+'0'.repeat(64)}}),paused.id);expect(foreign.status).toBe(404);
   expect((await other.pool.query('SELECT * FROM packproof.capture_details WHERE capture_id=$1',[capture.id])).rowCount).toBe(0);
   await expect(other.store.capture(other.options.owner,paused.id,capture.id)).rejects.toThrow('not_found');
   const resumed=await resumeInvestigation(r.options,paused.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),captureId:saved.id,productMark:null,packagingMark:null});expect(resumed.status).toBe('needs_input');expect(resumed.request?.view).toBe('close_mark');
   const observations=await repo.observations(paused.id);expect(observations).toHaveLength(1);expect(observations[0]?.literal.value).toBeNull();
   await expect(r.pool.query('UPDATE packproof.inspection_observations SET question=$1 WHERE capture_id=$2',['package_mark',capture.id])).rejects.toThrow();
   const old={...capture,id:crypto.randomUUID(),objectPath:`${paused.id}/${crypto.randomUUID()}/original.png`};await expect(r.store.addCapture(who,old,details)).rejects.toThrow('revision_conflict');
   await expect(repo.append({...observations[0]!,id:crypto.randomUUID(),question:'package_mark',sourceSha256:'0'.repeat(64)})).rejects.toThrow('capture_binding_mismatch');
   await expect(r.pool.query('UPDATE packproof.items SET owner_version=owner_version+1')).rejects.toThrow();
   const anon=await fetch(new URL('/storage/v1/object/authenticated/packproof-p0-private/'+path,process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY!},redirect:'error',signal:AbortSignal.timeout(10000)});expect(anon.ok).toBe(false);
  }finally{if(path)await storage.remove(path);await r.close();await other.close();}
 },120000);
 it('persists genuine recorded SAM region provenance and renders it through the same Inspector service without inference',async()=>{
  const who=await owner(),r=await runtime(who),storage=new SupabaseCaptureStorage();let path:string|null=null;
  try{
   const paused=await startInvestigation(r.options,input({context:'physical',sellerId:null})),bytes=new Uint8Array(await readFile('docs/packproof/evidence/sam/original-demo.png'));
   const details={question:'product_mark' as const,box:{left:130,top:110,right:470,bottom:370},processingConsent:true,consentVersion:'p3-meta-media-1' as const};
   const saved=await saveCapture(r.store,who,storage,{investigationId:paused.id,revision:1,mime:'image/png',bytes,source:'imported',capturedAt:null,inspection:details}),capture=await r.store.capture(who,paused.id,saved.id);path=capture.objectPath;
   const repo=new PostgresInspectionRepository(r.pool);
   const result=await resumeInvestigation(r.options,paused.id,{expectedRevision:1,idempotencyKey:crypto.randomUUID(),captureId:saved.id,productMark:null,packagingMark:null});expect(result.finding?.status).toBe('blocked');expect(result.finding?.physicalStatus).toBe('unresolved');const obs=await repo.observations(paused.id);expect(obs).toHaveLength(1);expect(obs[0]?.region?.sourceSha256).toBe(saved.sha256);
  }finally{if(path)await storage.remove(path);await r.close();}
 },120000);
});
