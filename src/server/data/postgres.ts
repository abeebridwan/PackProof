import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { Owner } from '../investigator/types.js';
import { databaseEnvironment, projectUrl } from '../../../scripts/spikes/infrastructure.js';
export function databasePool(owner?:Owner) {
  const ref=process.env.SUPABASE_PROJECT_REF ?? '';
  if(ref!=='hvbzxeuedookkwleyjmx') throw new Error('Dedicated PackProof project required');
  projectUrl(process.env.SUPABASE_URL ?? '',ref);
  const env=databaseEnvironment(process.env.SUPABASE_DB_URL ?? '',ref);
  if(owner && (!/^[a-f0-9]{64}$/.test(owner.sessionHash)|| (owner.userId!==null && !/^[a-f0-9-]{36}$/.test(owner.userId)))) throw new Error('Invalid server owner context');
  const options=owner?`-c role=packproof_investigator -c packproof.session_hash=${owner.sessionHash} -c packproof.user_id=${owner.userId??''} -c statement_timeout=15000`:'-c statement_timeout=15000';
  // The pool is owner-bound and closed at the end of each HTTP request. Keep
  // its clients through graph steps instead of reconnecting after one second.
  return new pg.Pool({host:env.PGHOST,port:Number(env.PGPORT),user:env.PGUSER,password:env.PGPASSWORD,database:'postgres',max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,ssl:{rejectUnauthorized:true,...(process.env.SUPABASE_DB_SSLROOTCERT?{ca:readFileSync(process.env.SUPABASE_DB_SSLROOTCERT,'utf8')}:{})},options,application_name:'packproof-p1b',
    // Session poolers may discard startup `options`. pg awaits onConnect
    // before checkout and destroys the client if initialization fails.
    // Each pool remains bound to one immutable owner for its whole lifetime.
    onConnect:async client=>{
      if(owner){
        await client.query("SELECT set_config('role','packproof_investigator',false),set_config('packproof.session_hash',$1,false),set_config('packproof.user_id',$2,false),set_config('statement_timeout','15000',false)",[owner.sessionHash,owner.userId??'']);
        const checked=await client.query("SELECT current_user AS role,current_setting('packproof.session_hash') AS session,current_setting('packproof.user_id') AS user_id");
        if(checked.rows[0]?.role!=='packproof_investigator'||checked.rows[0]?.session!==owner.sessionHash||checked.rows[0]?.user_id!==(owner.userId??''))throw new Error('Database owner context unavailable');
      }else await client.query("SET statement_timeout='15000'");
    },
  });
}
