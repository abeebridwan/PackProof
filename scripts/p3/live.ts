import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {P3Budget,P3_APPROVAL} from './budget.js';
import {groundedMeta} from '../../src/server/providers/grounded-meta.js';
import {GroundedImageInspector} from '../../src/server/inspector/inspector.js';
import {PostgresInspectionRepository} from '../../src/server/inspector/repository.js';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation,resumeInvestigation} from '../../src/server/investigator/graph.js';
import {saveCapture,SupabaseCaptureStorage,validateImage} from '../../src/server/investigator/captures.js';
import {CaptureDetails} from '../../src/contracts/inspection.js';
import {createMetaClient} from '../spikes/meta-gateway.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
const args=process.argv.slice(2),flag=(k:string)=>args.find(a=>a.startsWith(k+'='))?.slice(k.length+1);
const budget=new P3Budget();
if(args.includes('--approve')){budget.approve(P3_APPROVAL);console.log(JSON.stringify({approved:true,totalUsd:5,requestLimit:null,guard:'25-cent nonrefundable per-request reservations; single run lock'}));process.exit(0);}
if(args.includes('--status')){try{const l=budget.status();console.log(JSON.stringify({approved:true,requests:l.requests.length,reservedUsd:l.requests.length/4,actualBilledUsd:null}));}catch{console.log(JSON.stringify({approved:false,requests:0,reservedUsd:0,actualBilledUsd:null}));}process.exit(0);}
const file=flag('--image'),kind=flag('--kind'),question=flag('--question')??'product_mark';
if(!file||!['physical','synthetic'].includes(kind??'')||!args.includes('--consent')){
 console.log(JSON.stringify({status:'blocked',reason:'Supply --image=PATH --kind=physical|synthetic --consent and --box=left,top,right,bottom. Use only a non-sensitive image with permission to send it to Meta.',providerRequests:0}));process.exit(1);
}
const bytes=new Uint8Array(await readFile(resolve(file))),mime=file.toLowerCase().endsWith('.png')?'image/png':'image/jpeg';
const image=await validateImage(bytes,mime);const coordinates=(flag('--box')??'').split(',').map(Number);
const details=CaptureDetails.parse({question,box:{left:coordinates[0],top:coordinates[1],right:coordinates[2],bottom:coordinates[3]},processingConsent:true,consentVersion:'p3-meta-media-1'});
if(details.box.right>image.width||details.box.bottom>image.height)throw new Error('region_out_of_bounds');
if(!process.env.MODEL_API_KEY)throw new Error('credentials_missing');
const unlock=budget.run();let context:Awaited<ReturnType<typeof runtime>>|null=null;
try{
 const client=createMetaClient(process.env.MODEL_API_KEY);const models=await client.models.list();for(const m of ['muse-spark-1.3','sam-3.1'])if(!models.data.some(v=>v.id===m))throw new Error('account_model_unavailable');
 const owner={sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null};context=await runtime(owner);
 const repo=new PostgresInspectionRepository(context.pool),storage=new SupabaseCaptureStorage();
 const options={...context.options,inspector:new GroundedImageInspector(repo,c=>storage.read(c.objectPath),groundedMeta(process.env.MODEL_API_KEY,budget))};
 // Existing LangGraph owns planning, limits, pause, resume and the mandatory finalizer.
 const paused=await startInvestigation(options,{namespace:'packproof-demo',productMark:flag('--product')??'FP-1002',packagingMark:flag('--package')??'PK-2002',sellerId:null,listingText:'',context:'physical',captureId:null});
 const saved=await saveCapture(context.store,owner,storage,{investigationId:paused.id,revision:paused.revision,mime,bytes,source:'imported',capturedAt:null,inspection:details});
 const result=await resumeInvestigation(options,paused.id,{expectedRevision:paused.revision,idempotencyKey:crypto.randomUUID(),captureId:saved.id,productMark:null,packagingMark:null});
 const observations=await repo.observations(paused.id),o=observations.find(v=>v.captureId===saved.id);
 const passed=!!o?.region&&o.reader?.mode==='live'&&o.literal.value!==null;
 const reference=flag('--expected-literal'),literalMatchesReference=reference!==undefined&&o?.literal.value!=null?o?.literal.value===reference:null;
 const ledger=budget.status();const evidence={status:!passed?'needs_evidence':literalMatchesReference===false?'mismatch':'passed',scope:kind==='physical'?'new physical image':'synthetic provider probe only',liveGroundingCompleted:passed,physicalAcceptance:kind==='physical'&&passed&&literalMatchesReference===true,physicalAcceptanceScope:'Single source-bound blinded literal sample only; not complete V1/P3 acceptance',reference:reference?{value:reference,provenance:'operator_supplied_reference_not_sent_to_provider',matches:literalMatchesReference}:null,investigationId:result.id,captureId:saved.id,sourceSha256:image.sha256,question,observation:o?{...o,region:o.region?{...o.region,maskBase64:undefined}:null}:null,finding:result.finding,providerBudget:{reservedUsd:ledger.requests.length/4,requests:ledger.requests,actualBilledUsd:null}};
 await mkdir('docs/packproof/evidence',{recursive:true});
 // Do not save source files or private paths in the repository. This receipt is
 // literal evidence and bounded provenance, never private provider reasoning.
 await writeFile(`docs/packproof/evidence/p3-live-${saved.id}.json`,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({status:evidence.status,liveGroundingCompleted:evidence.liveGroundingCompleted,physicalAcceptance:evidence.physicalAcceptance,literalMatchesReference,captureId:saved.id,reading:o?.literal??null,reservedUsd:ledger.requests.length/4,actualBilledUsd:null}));if(!passed||literalMatchesReference===false)process.exitCode=2;
}catch{console.log(JSON.stringify({status:'failed',reason:'Provider, access or evidence validation failed; no raw error logged',actualBilledUsd:null}));process.exitCode=1;}
finally{if(context)await context.close();unlock();}
