// Operator-only demonstration accounts; confirms synthetic users without sending email.
// Passwords are generated into an ignored owner-only file, never stdout or Git.
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {databasePool} from '../../src/server/data/postgres.js';
import {DEMO} from '../p1/demo.js';
if(process.argv[2]!=='--prepare')throw new Error('Use --prepare to provision the three fictional demonstration accounts');
const directory='.local/p2';await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const path=`${directory}/demo-accounts.json`;
let accounts:{role:string;email:string;password:string;userId?:string;actorId?:string}[];
try{accounts=JSON.parse(await readFile(path,'utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;const suffix=randomBytes(6).toString('hex');accounts=['seller-b','seller-a','buyer'].map(role=>({role,email:`packproof-${role}-${suffix}@example.invalid`,password:randomBytes(24).toString('base64url')}));await writeFile(path,JSON.stringify(accounts,null,2)+'\n',{flag:'wx',mode:0o600});}
const origin=process.env.SUPABASE_URL;if(origin!=='https://hvbzxeuedookkwleyjmx.supabase.co')throw new Error('Existing PackProof project required');
const key=process.env.SUPABASE_SECRET_KEY;if(!key)throw new Error('Operator credential required');
const headers={apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'};
const pool=databasePool();
try{
 for(const a of accounts){
  // Persist each successful Auth identity before any database projection write.
  // An uncertain HTTP outcome is never blindly repeated.
  if(!a.userId){const marker=`${directory}/account-create-${a.role}.json`;let intent=false;try{await readFile(marker);intent=true;}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}if(intent)throw new Error('Prior account creation outcome must be inspected before retrying');await writeFile(marker,JSON.stringify({email:a.email,createdAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});
   const r=await fetch(`${origin}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email:a.email,password:a.password,email_confirm:true,user_metadata:{demo:true,purpose:'PackProof ChainProof demonstration'}}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`auth_create_${r.status}`);a.userId=(await r.json()).id;await writeFile(path,JSON.stringify(accounts,null,2)+'\n',{mode:0o600});
  }
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140912)');
   const actor=a.role==='seller-b'?DEMO.shopB:a.role==='seller-a'?DEMO.shopA:null;
   if(actor){const old=(await c.query('SELECT user_id FROM packproof.actor_accounts WHERE actor_id=$1',[actor])).rows[0];if(old&&old.user_id!==a.userId)throw new Error('Existing actor/account binding preserved; operator review required');if(!old)await c.query('INSERT INTO packproof.actor_accounts VALUES($1,$2)',[actor,a.userId]);a.actorId=actor;}
   // Buyer identity is created through the same authenticated server provisioning function.
   else{await c.query('SET LOCAL ROLE packproof_transfer');await c.query("SELECT set_config('packproof.user_id',$1,true)",[a.userId]);a.actorId=(await c.query('SELECT packproof.ensure_transfer_actor($1) id',[a.userId])).rows[0].id;}
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  await writeFile(path,JSON.stringify(accounts,null,2)+'\n',{mode:0o600});
 }
 const result={status:'passed',accounts:accounts.map(a=>({role:a.role,actorId:a.actorId})),credentialFile:path,synthetic:true,emailSent:false,ownershipChanged:false};await writeFile('docs/packproof/evidence/p2-accounts.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch{console.error(JSON.stringify({status:'blocked',reason:'Account provisioning requires operator review; existing mappings and any successful create receipts retained'}));process.exitCode=1;}finally{await pool.end();}
