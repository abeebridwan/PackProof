import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {databasePool} from '../../src/server/data/postgres.js';
export const MIGRATIONS=['supabase/migrations/202611020004_p2_chainproof.sql','supabase/migrations/202611020005_p2_binding_guards.sql'];
export async function migrateP2(pool:pg.Pool,schema='packproof'){
 if(schema!=='packproof'&&!/^packproof_p2test_[a-f0-9]+$/.test(schema))throw new Error('Invalid schema');
 const c=await pool.connect(),applied:{version:string;sha256:string;newlyApplied:boolean}[]=[];
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140912)');
  for(const file of MIGRATIONS){
   const version=file.split('/').at(-1)!.split('_')[0]!,source=await readFile(file,'utf8'),hash=createHash('sha256').update(source).digest('hex');
   const old=(await c.query(`SELECT sha256 FROM ${schema}.schema_migrations WHERE version=$1`,[version])).rows[0];
   if(old&&old.sha256!==hash)throw new Error('Migration checksum mismatch');
   if(!old){const sql=source.replaceAll('packproof.',`${schema}.`).replaceAll('ON SCHEMA packproof ','ON SCHEMA '+schema+' ').replaceAll(`current_setting('${schema}.actor_id'`,"current_setting('packproof.actor_id'").replaceAll(`current_setting('${schema}.user_id'`,"current_setting('packproof.user_id'");await c.query(sql);await c.query(`INSERT INTO ${schema}.schema_migrations(version,sha256) VALUES($1,$2)`,[version,hash]);}
   applied.push({version,sha256:hash,newlyApplied:!old});
  }
  await c.query('COMMIT');return {schema,applied};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
if(process.argv[1]?.endsWith('/p2/migrate.ts')){
 const pool=databasePool();try{const result=await migrateP2(pool);await writeFile('docs/packproof/evidence/p2-migration.json',JSON.stringify({status:'passed',...result,providerRequests:0},null,2)+'\n');console.log(JSON.stringify(result));}catch(e){console.error(JSON.stringify({status:'failed',code:e&&typeof e==='object'&&'code'in e?e.code:'migration_failed'}));process.exitCode=1;}finally{await pool.end();}
}
