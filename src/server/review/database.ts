import type {PoolClient} from 'pg';
import {databasePool} from '../data/postgres.js';
let pool:ReturnType<typeof databasePool>|null=null;
export async function reviewTransaction<T>(effect:(c:PoolClient)=>Promise<T>):Promise<T>{
 if(!pool){pool=databasePool();pool.on('error',()=>{});}
 const c=await pool.connect();
 try{await c.query('BEGIN; SET LOCAL ROLE packproof_review');const result=await effect(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
