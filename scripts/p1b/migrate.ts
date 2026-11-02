import {readFile,writeFile} from 'node:fs/promises';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {sql,literal,PROJECT_REF} from '../p1/database.js';
import {databasePool} from '../../src/server/data/postgres.js';
import {sha256,utf8} from '../../src/domain/verification/p0-crypto.js';
const version='202611020002';const file=`supabase/migrations/${version}_p1b_investigator.sql`;
const migration=await readFile(file,'utf8');const hash=await sha256(utf8(migration));
const base=sql("SELECT count(*) FROM packproof.schema_migrations WHERE version='202611020001';");
if(base!=='1')throw new Error('Verified P1A migration required');
const existing=sql(`SELECT sha256 FROM packproof.schema_migrations WHERE version=${literal(version)};`);
if(existing && existing!==hash)throw new Error('Applied migration hash changed');
if(!existing)sql(`BEGIN;SELECT pg_advisory_xact_lock(7140913);${migration}\nINSERT INTO packproof.schema_migrations(version,sha256) VALUES(${literal(version)},${literal(hash)});COMMIT;`,true);
const pool=databasePool();const saver=new PostgresSaver(pool,undefined,{schema:'packproof_graph'});
try{
 await saver.setup();
 // Never expose official checkpoint tables with default grants.
 await pool.query(`DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='packproof_graph' LOOP
 EXECUTE format('REVOKE ALL ON packproof_graph.%I FROM PUBLIC,anon,authenticated,service_role',t.tablename);
 IF t.tablename<>'checkpoint_migrations' THEN
 EXECUTE format('ALTER TABLE packproof_graph.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 EXECUTE format('ALTER TABLE packproof_graph.%I FORCE ROW LEVEL SECURITY',t.tablename);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON packproof_graph.%I TO packproof_investigator',t.tablename);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='packproof_graph' AND tablename=t.tablename AND policyname='owned_checkpoint') THEN
 EXECUTE format('CREATE POLICY owned_checkpoint ON packproof_graph.%I FOR ALL TO packproof_investigator USING(thread_id IN (SELECT id::text FROM packproof.investigations)) WITH CHECK(thread_id IN (SELECT id::text FROM packproof.investigations))',t.tablename);
 END IF; END IF; END LOOP; END $$;`);
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='packproof_graph' ORDER BY tablename")).rows;
 await writeFile('docs/packproof/evidence/p1b-migration.json',JSON.stringify({status:'passed',projectRef:PROJECT_REF,version,file,sha256:hash,newlyApplied:!existing,checkpointPackage:'@langchain/langgraph-checkpoint-postgres@1.1.2',checkpointTables:tables,rls:'forced; thread owner constrained through investigations',providerRequests:0},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',version,newlyApplied:!existing,checkpointTables:tables.length}));
}finally{await pool.end();}
