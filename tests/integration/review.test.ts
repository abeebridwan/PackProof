import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {databasePool} from '../../src/server/data/postgres.js';
import {HostedBudget,REVIEW_GRANT,reviewPolicy} from '../../src/server/review/budget.js';
import {checkAuthority,rootPin} from '../../src/server/transfers/authority.js';
import {input} from '../fixtures/investigator-memory.js';
import {REVIEW_EVIDENCE_POLICY,REVIEW_EVIDENCE_MAX_AGE_MS} from '../../src/domain/verification/freshness.js';
it('limits the dated sample review policy to approved examples and active pair invitations in both analysis modes',async()=>{
 process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();
 const pool=databasePool(),c=await pool.connect(),transaction:ConstructorParameters<typeof HostedBudget>[1]=async effect=>effect(c);
 try{
  await c.query('BEGIN');
  const sample=(await c.query('SELECT a.user_id,u.product_mark,u.packaging_mark FROM packproof.review_units u JOIN packproof.review_access a ON a.pair_id=u.pair_id ORDER BY a.user_id LIMIT 1')).rows[0];
  const policy={maxAgeMs:REVIEW_EVIDENCE_MAX_AGE_MS,policyVersion:REVIEW_EVIDENCE_POLICY};
  await c.query('SET LOCAL ROLE packproof_review');
  await expect(reviewPolicy(null,input({productMark:'FP-1001',packagingMark:'PK-2001'}),transaction)).resolves.toEqual(policy);
  await expect(reviewPolicy(null,input({productMark:'UNREGISTERED'}),transaction)).resolves.toEqual({});
  await expect(reviewPolicy(null,input({namespace:'another-namespace',productMark:'FP-1001'}),transaction)).resolves.toEqual({});
  const own=input({productMark:sample.product_mark,packagingMark:sample.packaging_mark});
  await expect(reviewPolicy(sample.user_id,own,transaction)).resolves.toEqual(policy);
  await expect(reviewPolicy(null,own,transaction)).resolves.toEqual({});
  await c.query('RESET ROLE');await c.query("UPDATE packproof.review_units SET authority_until=now()-interval '1 second'");await c.query('SET LOCAL ROLE packproof_review');
  await expect(reviewPolicy(null,input({productMark:'FP-1001'}),transaction)).resolves.toEqual({});
  await expect(reviewPolicy(sample.user_id,own,transaction)).resolves.toEqual({});
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
},30000);
it('actual database budget refuses overspend, blocks ambiguous outcomes and protects evidence tables; all test writes roll back',async()=>{
 process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();
 const pool=databasePool(),c=await pool.connect();
 try{
  await c.query('BEGIN');
  const sample=(await c.query("SELECT u.*,i.registered_owner_id FROM packproof.review_units u JOIN packproof.items i ON i.id=u.item_id WHERE i.owner_version=1 ORDER BY u.product_mark LIMIT 1")).rows[0];
  const pin=await rootPin(),week=new Date(Date.now()+7*86400000).toISOString();
  await c.query("SELECT set_config('packproof.actor_id',$1,true)",[sample.seller_id]);
  await expect(checkAuthority(c,'packproof',pin,sample.item_id,sample.seller_id,week)).resolves.toBeTruthy();
  await expect(checkAuthority(c,'packproof',pin,sample.item_id,sample.seller_id,new Date(Date.parse(sample.authority_until)+1000).toISOString())).rejects.toThrow('stale_authority');
  const user=(await c.query('SELECT user_id FROM packproof.review_access ORDER BY user_id LIMIT 1')).rows[0].user_id;
  await c.query('SELECT id FROM packproof.review_budget WHERE id=$1 FOR UPDATE',[REVIEW_GRANT]);
  await c.query('SET LOCAL ROLE packproof_review');
  const security=(await c.query("SELECT has_table_privilege(current_user,'packproof.signed_records','UPDATE') claims,has_table_privilege(current_user,'packproof.items','UPDATE') owners,has_table_privilege(current_user,'packproof.review_access','UPDATE') invitations,has_column_privilege(current_user,'packproof.review_budget','enabled','UPDATE') enable,has_column_privilege(current_user,'packproof.review_budget','limit_cents','UPDATE') raise_limit")).rows[0];
  expect(security).toEqual({claims:false,owners:false,invitations:false,enable:false,raise_limit:false});
  expect((await c.query("SELECT has_table_privilege(current_user,'packproof.review_units','UPDATE') write,has_table_privilege(current_user,'packproof.review_units','INSERT') promote")).rows[0]).toEqual({write:false,promote:false});
  class TestBudget extends HostedBudget{override async assertRun(){/* Auth tested through real invitation HTTP. */}}
  const budget=new TestBudget(user,async effect=>effect(c));
  for(const cap of [500,1000]){
   await c.query('RESET ROLE');await c.query('UPDATE packproof.review_budget SET limit_cents=$2,reserved_cents=$2-5 WHERE id=$1',[REVIEW_GRANT,cap]);await c.query('SET LOCAL ROLE packproof_review');
   const id=await budget.reserve(crypto.randomUUID(),16000,false);
   await budget.settle(id,{state:'responded',responseId:'review-test',requestId:null,usage:{inputTokens:16000,outputTokens:2048,cachedTokens:0}});
   await expect(budget.reserve(crypto.randomUUID(),1,false)).rejects.toThrow('p1_budget_exhausted');
   expect((await c.query('SELECT reserved_cents FROM packproof.review_budget WHERE id=$1',[REVIEW_GRANT])).rows[0].reserved_cents).toBe(cap);
  }
  await c.query('RESET ROLE');await c.query('UPDATE packproof.review_budget SET reserved_cents=990 WHERE id=$1',[REVIEW_GRANT]);await c.query('SET LOCAL ROLE packproof_review');
  const doubtful=await budget.reserve(crypto.randomUUID(),0,false);
  await budget.settle(doubtful,{state:'ambiguous',responseId:null,requestId:null,usage:null});
  await expect(budget.reserve(crypto.randomUUID(),0,false)).rejects.toThrow('p1_operation_in_doubt');
  await expect(budget.reserve(crypto.randomUUID(),16001,false)).rejects.toThrow('p1_input_limit');
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
},30000);
