import type {Pool} from 'pg';
import {CaptureDetails,Observation} from '../../contracts/inspection.js';
import type {Capture} from '../../contracts/investigation.js';
import {InvestigationError} from '../investigator/store.js';
export interface InspectionRepository{
 frameTimestamp?(capture:Capture):Promise<number|null>;
 details(capture:Capture):Promise<CaptureDetails|null>;
 append(observation:Observation):Promise<Observation>;
 observations(investigationId:string):Promise<Observation[]>;
}
export class PostgresInspectionRepository implements InspectionRepository{
 constructor(private readonly pool:Pool){}
 async frameTimestamp(c:Capture){const row=(await this.pool.query('SELECT timestamp_ms FROM packproof.video_frames WHERE capture_id=$1 AND frame_sha256=$2',[c.id,c.sha256])).rows[0];return row?.timestamp_ms??null;}
 async details(c:Capture){const r=await this.pool.query('SELECT details FROM packproof.capture_details WHERE capture_id=$1 AND investigation_id=$2',[c.id,c.investigationId]);return r.rows[0]?CaptureDetails.parse(r.rows[0].details):null;}
 async append(raw:Observation){const o=Observation.parse(raw);const r=await this.pool.query(`INSERT INTO packproof.inspection_observations(id,investigation_id,capture_id,question,observation) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(capture_id,question) DO NOTHING RETURNING observation`,[o.id,o.investigationId,o.captureId,o.question,o]);if(r.rows[0])return Observation.parse(r.rows[0].observation);
 const existing=await this.pool.query('SELECT observation FROM packproof.inspection_observations WHERE capture_id=$1 AND question=$2',[o.captureId,o.question]);if(!existing.rows[0])throw new InvestigationError('observation_unavailable',503);return Observation.parse(existing.rows[0].observation);}
 async observations(id:string){const r=await this.pool.query('SELECT observation FROM packproof.inspection_observations WHERE investigation_id=$1 ORDER BY created_at,id',[id]);return r.rows.map(v=>Observation.parse(v.observation));}
}
