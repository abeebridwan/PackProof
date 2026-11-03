import type pg from 'pg';
export type Sql=Pick<pg.PoolClient,'query'>;
export class TransferError extends Error{constructor(public code:string,public status=409){super(code);}}
export class TransferDatabase{
 readonly schema:string;
 constructor(readonly pool:pg.Pool,schema='packproof'){
  if(schema!=='packproof'&&!/^packproof_p2test_[a-f0-9]+$/.test(schema))throw new Error('Invalid transfer schema');this.schema=schema;
 }
 async transaction<T>(actorId:string|null,effect:(client:Sql)=>Promise<T>,userId:string|null=null):Promise<T>{
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN; SET LOCAL ROLE packproof_transfer');
   await c.query("SELECT set_config('packproof.actor_id',$1,true),set_config('packproof.user_id',$2,true),set_config('lock_timeout','8000',true)",[actorId??'',userId??'']);
   const value=await effect(c);await c.query('COMMIT');return value;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async actor(userId:string){return this.transaction(null,async c=>{const r=await c.query(`SELECT ${this.schema}.ensure_transfer_actor($1) AS id`,[userId]);return r.rows[0].id as string;},userId);}
}
