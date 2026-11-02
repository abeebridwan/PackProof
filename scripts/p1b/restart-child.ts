import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {runtime} from '../../src/server/investigator/runtime.js';
import {startInvestigation,resumeInvestigation,publicView} from '../../src/server/investigator/graph.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
const stateFile='.local/p1b/restart-state.json',evidenceFile='docs/packproof/evidence/p1b-process-restart.json';
const begin=process.argv[2]==='begin';
await mkdir('.local/p1b',{recursive:true,mode:0o700});
const stored=begin?null:JSON.parse(await readFile(stateFile,'utf8'));
const owner=stored?.owner??{sessionHash:await sha256(utf8(crypto.randomUUID())),userId:null};
const app=await runtime(owner);
try{
 if(begin){
  const result=await startInvestigation(app.options,{namespace:'packproof-demo',productMark:'FP-1002',packagingMark:null,sellerId:'30000000-0000-4000-8000-000000000005',listingText:'Fictional process-restart validation',context:'listing',captureId:null});
  if(result.status!=='needs_input')throw new Error('Expected durable pause');
  await writeFile(stateFile,JSON.stringify({owner,id:result.id,revision:result.revision,beginPid:process.pid}),{mode:0o600});
  await writeFile(evidenceFile,JSON.stringify({status:'paused',beginPid:process.pid,providerRequests:0},null,2)+'\n');
  console.log(JSON.stringify({status:'paused',processId:process.pid,actions:result.actions}));
 }else{
  if(stored.beginPid===process.pid)throw new Error('Separate OS process required');
  const prior=await publicView(app.store,owner,stored.id);if(prior.status!=='needs_input')throw new Error('Pause not restored from database');
  const result=await resumeInvestigation(app.options,stored.id,{expectedRevision:stored.revision,idempotencyKey:crypto.randomUUID(),productMark:null,packagingMark:'PK-2002',captureId:null});
  if(result.finding?.status!=='supported'||result.actions!==6)throw new Error('Restored result/counter mismatch');
  const proof={status:'passed',projectRef:'hvbzxeuedookkwleyjmx',beginPid:stored.beginPid,resumePid:process.pid,separateNodeProcesses:true,restoredFrom:'official PostgresSaver in restricted Supabase schema',actions:result.actions,revision:result.revision,finding:result.finding.status,providerRequests:0};
  await writeFile(evidenceFile,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
 }
}finally{await app.close();}
