import type {PoolClient} from 'pg';
import {databasePool} from '../data/postgres.js';
import {TransferDatabase,TransferError} from '../transfers/database.js';
let pool:ReturnType<typeof databasePool>|null=null;
export const platformPool=()=>{if(!pool){pool=databasePool();pool.on('error',()=>{});}return pool;};
export type PlatformIdentity={userId:string;actorId:string;sessionHash?:string};
export async function platformIdentity(userId:string):Promise<PlatformIdentity>{return {userId,actorId:await new TransferDatabase(platformPool()).actor(userId)};}
export async function platformTransaction<T>(identity:PlatformIdentity|null,effect:(c:PoolClient)=>Promise<T>){
 const c=await platformPool().connect();try{await c.query('BEGIN; SET LOCAL ROLE packproof_platform');await c.query("SELECT set_config('packproof.user_id',$1,true),set_config('packproof.actor_id',$2,true),set_config('packproof.session_hash',$3,true)",[identity?.userId??'',identity?.actorId??'',identity?.sessionHash??'']);const v=await effect(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function platformLimit(subject:string,max=60){
 const count=await platformTransaction(null,async c=>(await c.query("INSERT INTO packproof.platform_limits VALUES(date_trunc('hour',now()),$1,1) ON CONFLICT(bucket,subject) DO UPDATE SET count=packproof.platform_limits.count+1 RETURNING count",[subject])).rows[0].count);
 if(count>max)throw new TransferError('rate_limit',429);
}
