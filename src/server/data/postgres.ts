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
  return new pg.Pool({host:env.PGHOST,port:Number(env.PGPORT),user:env.PGUSER,password:env.PGPASSWORD,database:'postgres',max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,ssl:{rejectUnauthorized:true,...(process.env.SUPABASE_DB_SSLROOTCERT?{ca:readFileSync(process.env.SUPABASE_DB_SSLROOTCERT,'utf8')}:{})},options,application_name:'packproof-p1b'});
}
