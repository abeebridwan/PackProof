import type {CaptureDetails} from '../../contracts/inspection.js';
import type {Pool,PoolClient} from 'pg';
import {Capture,InvestigationInput,EvidenceRequest,Finding,ToolName} from '../../contracts/investigation.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import type {Owner,Row,InvestigationStore,ToolResult,StoredEvent} from './types.js';
export class InvestigationError extends Error {constructor(readonly code:string,readonly status=409){super(code);}}
export const canonical=(v:unknown):string=>JSON.stringify(v,(_key,value)=>value && typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const fromRow=(r:Record<string,unknown>):Row=>({id:String(r.id),revision:Number(r.revision),status:String(r.status),input:InvestigationInput.parse(r.input),actions:Number(r.actions),recaptures:Number(r.recaptures),retries:Number(r.retries),request:r.evidence_request?EvidenceRequest.parse(r.evidence_request):null,finding:r.finding?Finding.parse(r.finding):null,error:r.error_code?String(r.error_code):null,createdAt:new Date(String(r.created_at)).toISOString()});
export class PostgresInvestigationStore implements InvestigationStore{
 constructor(readonly pool:Pool,readonly owner:Owner){}
 private authorize(owner:Owner){if(owner.sessionHash!==this.owner.sessionHash||owner.userId!==this.owner.userId)throw new InvestigationError('not_found',404);}
 private async transaction<T>(fn:(client:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async create(owner:Owner,input:InvestigationInput,startRunning=false){this.authorize(owner);const r=await this.pool.query('INSERT INTO packproof.investigations(id,owner_user_id,session_hash,namespace,input,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[crypto.randomUUID(),owner.userId,owner.sessionHash,input.namespace,input,startRunning?'running':'created']);return fromRow(r.rows[0]);}
 async get(owner:Owner,id:string){this.authorize(owner);const r=await this.pool.query('SELECT * FROM packproof.investigations WHERE id=$1',[id]);if(!r.rows[0])throw new InvestigationError('not_found',404);return fromRow(r.rows[0]);}
 async readView(owner:Owner,id:string){
  this.authorize(owner);
  // Read the owner-visible row and ordered trace in one SQL snapshot. Both
  // tables retain forced RLS; a missing/foreign row still raises not_found.
  const r=await this.pool.query(`SELECT i.*,coalesce((
   SELECT jsonb_agg(jsonb_build_object('tool',e.tool_name,'result',e.result_json,'source',e.event_source) ORDER BY e.created_at,e.id)
   FROM packproof.tool_events e WHERE e.investigation_id=i.id
  ),'[]'::jsonb) AS trace_events FROM packproof.investigations i WHERE i.id=$1`,[id]);
  const value=r.rows[0];if(!value)throw new InvestigationError('not_found',404);
  const events=(value.trace_events as StoredEvent[]).map(e=>({...e,tool:ToolName.parse(e.tool)}));
  return {row:fromRow(value),events};
 }
 async save(owner:Owner,id:string,patch:Partial<Pick<Row,'status'|'request'|'finding'|'error'>>){this.authorize(owner);const fields:Record<string,string>={status:'status',request:'evidence_request',finding:'finding',error:'error_code'};const entries=Object.entries(patch);if(!entries.length){await this.get(owner,id);return;}const r=await this.pool.query(`UPDATE packproof.investigations SET ${entries.map(([k],i)=>`${fields[k]}=$${i+2}`).join(',')} WHERE id=$1 RETURNING id`,[id,...entries.map(([,v])=>v)]);if(!r.rowCount)throw new InvestigationError('not_found',404);}
 async operation<T>(owner:Owner,id:string,key:string,args:unknown,kind:'model'|'tool'|'retry'|'resume',effect:()=>Promise<T>,options:{recapture?:boolean;reservationCents?:number;sessionCapCents?:number}={}){
  this.authorize(owner);const hash=await sha256(utf8(canonical(args)));
  let reservation:{cached:boolean;value:T};
  try{
   const r=await this.pool.query('SELECT packproof.reserve_investigation_operation($1::uuid,$2::text,$3::text,$4::text,$5::boolean,$6::integer,$7::integer) AS reservation',[id,key,hash,kind,options.recapture??false,options.reservationCents??0,options.sessionCapCents??50]);
   reservation=r.rows[0].reservation;
  }catch(error){
   // Expose only the function's fixed, allowlisted business errors. Never
   // propagate PostgreSQL messages/details containing arguments or row data.
   const allowed=['not_found','idempotency_conflict','operation_in_doubt','budget_exhausted','invalid_operation','action_limit','recapture_limit','retry_limit','model_limit'];
   if(error&&typeof error==='object'&&'code'in error&&error.code==='P0001'&&'message'in error&&typeof error.message==='string'&&allowed.includes(error.message))throw new InvestigationError(error.message,error.message==='not_found'?404:409);
   throw new InvestigationError('operation_unavailable',503);
  }
  if(reservation.cached)return reservation.value as T;
  try{
   const result=await effect();
   const complete=(c:Pool|PoolClient)=>c.query("UPDATE packproof.investigation_operations SET status='complete',result=$3 WHERE investigation_id=$1 AND operation_key=$2",[id,key,JSON.stringify(result)]);
   if(kind==='tool'&&args&&typeof args==='object'&&'name'in args){
    // The result and its event commit in one SQL statement/transaction.
    await this.insertEvent(this.pool,id,String(args.name),result as ToolResult,key,'model_tool',result);
   }else{
    // A single UPDATE is already atomic. Tool completion and its event use
    // one atomic statement above; durable reservations remain unchanged.
    await complete(this.pool);
   }
   return result;
  }catch(e){await this.pool.query("UPDATE packproof.investigation_operations SET status='failed' WHERE investigation_id=$1 AND operation_key=$2",[id,key]);throw e;}
 }
 private async insertEvent(c:Pool|PoolClient,id:string,name:string,result:ToolResult,key:string,source:string,completion?:unknown){
  ToolName.parse(name);
  const values:unknown[]=[crypto.randomUUID(),id,name,key,await sha256(utf8(key)),result.evidence_refs,result.status,JSON.stringify(result),source];
  // Both sources are subject to the request owner's forced RLS policies.
  const authorized=completion===undefined?'SELECT id FROM packproof.investigations WHERE id=$2':"UPDATE packproof.investigation_operations SET status='complete',result=$10::jsonb WHERE investigation_id=$2 AND operation_key=$4 RETURNING investigation_id AS id";
  if(completion!==undefined)values.push(JSON.stringify(completion));
  const r=await c.query(`WITH authorized AS (${authorized}), inserted AS (
   INSERT INTO packproof.tool_events(id,investigation_id,tool_name,operation_key,argument_sha256,record_ids,status,result_json,event_source)
   SELECT $1,id,$3,$4,$5,$6,$7,$8,$9 FROM authorized
   ON CONFLICT(investigation_id,operation_key) DO NOTHING RETURNING id
  ) SELECT EXISTS(SELECT 1 FROM authorized) AS authorized`,values);
  if(!r.rows[0]?.authorized)throw new InvestigationError('not_found',404);
 }
 async audit(owner:Owner,id:string,name:ToolName,result:ToolResult,key:string){this.authorize(owner);await this.insertEvent(this.pool,id,name,result,key,'mandatory_finalizer');}
 async revise(owner:Owner,id:string,expected:number,input:InvestigationInput){this.authorize(owner);const r=await this.pool.query("UPDATE packproof.investigations SET revision=revision+1,input=$3,status='running',evidence_request=NULL,error_code=NULL WHERE id=$1 AND revision=$2 AND status='needs_input' RETURNING *",[id,expected,input]);if(!r.rows[0])throw new InvestigationError('revision_conflict');return fromRow(r.rows[0]);}
 async capture(owner:Owner,id:string,captureId:string){this.authorize(owner);const r=await this.pool.query('SELECT c.*,i.id AS authorized_investigation_id FROM packproof.investigations i LEFT JOIN packproof.captures c ON c.investigation_id=i.id AND c.id=$1 WHERE i.id=$2',[captureId,id]);const v=r.rows[0];if(!v)throw new InvestigationError('not_found',404);if(!v.id)throw new InvestigationError('capture_not_found',404);return Capture.parse({id:v.id,investigationId:v.investigation_id,revision:v.revision,sha256:v.sha256,mime:v.mime,width:v.width,height:v.height,bytes:v.bytes,source:v.source,capturedAt:v.captured_at?new Date(v.captured_at).toISOString():null,uploadedAt:new Date(v.uploaded_at).toISOString(),objectPath:v.object_path});}
 async addCapture(owner:Owner,capture:Capture,details?:CaptureDetails){this.authorize(owner);await this.transaction(async c=>{const inv=await c.query('SELECT revision,status FROM packproof.investigations WHERE id=$1 FOR UPDATE',[capture.investigationId]);if(!inv.rows[0]||inv.rows[0].revision!==capture.revision||inv.rows[0].status!=='needs_input')throw new InvestigationError('revision_conflict');const count=await c.query('SELECT count(*)::int n FROM packproof.captures WHERE investigation_id=$1',[capture.investigationId]);if(count.rows[0].n>=6)throw new InvestigationError('capture_limit',429);await c.query('INSERT INTO packproof.captures(id,investigation_id,revision,sha256,mime,width,height,bytes,source,captured_at,uploaded_at,object_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[capture.id,capture.investigationId,capture.revision,capture.sha256,capture.mime,capture.width,capture.height,capture.bytes,capture.source,capture.capturedAt,capture.uploadedAt,capture.objectPath]);if(details)await c.query('INSERT INTO packproof.capture_details(capture_id,investigation_id,uploader_session_hash,details) VALUES($1,$2,$3,$4)',[capture.id,capture.investigationId,owner.sessionHash,details]);});}
 async events(owner:Owner,id:string){this.authorize(owner);await this.get(owner,id);const r=await this.pool.query('SELECT tool_name,result_json,event_source FROM packproof.tool_events WHERE investigation_id=$1 ORDER BY created_at,id',[id]);return r.rows.map(v=>({tool:ToolName.parse(v.tool_name),result:v.result_json as ToolResult,source:v.event_source as 'model_tool'|'mandatory_finalizer'}));}
 async limit(key:string,maximum:number,windowMs:number){const now=Math.floor(Date.now()/windowMs);const r=await this.pool.query('INSERT INTO packproof.request_limits(key_hash,window_start,count) VALUES($1,$2,1) ON CONFLICT(key_hash,window_start) DO UPDATE SET count=request_limits.count+1 RETURNING count',[await sha256(utf8(key)),now]);if(r.rows[0].count>maximum)throw new InvestigationError('rate_limit',429);}
}
