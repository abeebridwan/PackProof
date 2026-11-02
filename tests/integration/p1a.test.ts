import { beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { Dataset, RootPin } from '../../src/contracts/evidence.js';
import { PostgresEvidenceRepository } from '../../src/server/data/evidence-repository.js';
import { createEvidenceServices, validateDataset } from '../../src/server/evidence/services.js';
import { verifyRecordSet } from '../../src/domain/trust/evidence.js';
import { sql, literal, PROJECT_REF, readAsService } from '../../scripts/p1/database.js';
import { seedSql, prepareDemo } from '../../scripts/p1/seed.js';
import { DEMO, NS } from '../../scripts/p1/demo.js';

// Explicit opt-in prevents ordinary/offline tests from touching the remote database.
const live = process.env.PACKPROOF_P1A_INTEGRATION === '1';
const evidence: Record<string,unknown> = {phase:'P1A',projectRef:PROJECT_REF,startedAt:new Date().toISOString(),providerRequests:0,authTestMode:'Actual PostgreSQL anon/authenticated/service_role roles, request.jwt.claims simulated inside rolled-back transactions; not browser sign-in'};
const record = async (name: string) => { evidence[name]='passed'; await writeFile('docs/packproof/evidence/p1a-integration-checks.json',JSON.stringify(evidence,null,2)+'\n'); };

describe.skipIf(!live)('P1A dedicated Supabase integration',()=>{
 let dataset: Dataset;
 let pin: RootPin;
 const repository = new PostgresEvidenceRepository(async q=>readAsService(q));
 beforeAll(async()=>{
  pin=RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
  dataset=await repository.load();
  await validateDataset(dataset,pin,new Date().toISOString());
 },45000);
 it('loads and cryptographically validates all seeded records through actual TLS PostgreSQL',async()=>{
  expect(dataset.records).toHaveLength(27);expect(dataset.products).toHaveLength(3);
  await verifyRecordSet(dataset.records,pin,new Date().toISOString());await record('signedReadRepository');
 },45000);
 it('returns deterministic product, seller, notice and history findings from database sources',async()=>{
  const services=createEvidenceServices(repository,pin);
  expect((await services.lookupProduct({namespace:NS,productMark:'FP-1002',packagingMark:'PK-2002'})).data?.mappingStatus).toBe('matched');
  expect((await services.lookupSeller({itemId:DEMO.item1,sellerId:DEMO.shopA})).data?.authorized).toBe(false);
  expect((await services.lookupSeller({itemId:DEMO.item2,sellerId:DEMO.shopB})).data?.authorized).toBe(true);
  expect((await services.getProductNotices({itemId:DEMO.item2})).data?.notices).toHaveLength(1);
  expect((await services.getProductNotices({itemId:DEMO.item1})).data?.notices).toHaveLength(0);
  expect((await services.getCustodyHistory({itemId:DEMO.gapItem})).data?.gaps[0]?.resolved).toBe(false);
  await record('databaseBackedServices');
 },90000);
 it('repeats the validated seed without duplicate records or ownership changes',async()=>{
  const material=await prepareDemo();
  const before=sql(`SELECT json_build_object('records',(SELECT count(*) FROM packproof.signed_records),'owners',(SELECT json_agg(json_build_array(id,registered_owner_id,owner_version) ORDER BY id) FROM packproof.items));`);
  sql(seedSql(material.dataset),true);sql(seedSql(material.dataset),true);
  const after=sql(`SELECT json_build_object('records',(SELECT count(*) FROM packproof.signed_records),'owners',(SELECT json_agg(json_build_array(id,registered_owner_id,owner_version) ORDER BY id) FROM packproof.items));`);
  expect(after).toBe(before);await record('duplicateSeedSafety');
 },90000);
 it('refuses to reseed over an existing owner change and rolls the test back',async()=>{
  const material=await prepareDemo();
  const body=seedSql(material.dataset).replace('BEGIN; SELECT pg_advisory_xact_lock(7140912);','PERFORM pg_advisory_xact_lock(7140912);').replace(/COMMIT;$/, '');
  expect(body).not.toContain('COMMIT;');
  const result=sql(`BEGIN;
UPDATE packproof.items SET registered_owner_id=${literal(DEMO.shopA)},owner_version=2 WHERE id=${literal(DEMO.item2)};
DO $case$ BEGIN BEGIN
${body}
RAISE EXCEPTION 'Unexpected seed acceptance';
EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Seed refuses existing ownership%' THEN RAISE; END IF; END; END $case$;
ROLLBACK; SELECT 'owner-change-refused';`,true);
  expect(result).toContain('owner-change-refused');
  expect(sql(`SELECT registered_owner_id FROM packproof.items WHERE id=${literal(DEMO.item2)};`)).toBe(DEMO.shopB);
  await record('existingOwnerChangeRefused');
 },90000);
 it('enforces actual anon, authenticated, cross-account RLS, service permissions and immutable claim denial',async()=>{
  const userA=crypto.randomUUID(),userB=crypto.randomUUID(),investigation=crypto.randomUUID(),eventId=crypto.randomUUID();
  const claimsA=literal(JSON.stringify({sub:userA,role:'authenticated'}));const claimsB=literal(JSON.stringify({sub:userB,role:'authenticated'}));
  const result=sql(`BEGIN;
INSERT INTO auth.users(id,aud,role) VALUES (${literal(userA)},'authenticated','authenticated'),(${literal(userB)},'authenticated','authenticated');
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.pp_public_products)<>3 THEN RAISE EXCEPTION 'Anonymous public read failed'; END IF;
 BEGIN INSERT INTO public.pp_public_products(item_id) VALUES (gen_random_uuid()); RAISE EXCEPTION 'Anonymous write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM packproof.signed_records; RAISE EXCEPTION 'Private records exposed to anon'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',${claimsA},true);
SET LOCAL ROLE authenticated;
INSERT INTO packproof.investigations(id,owner_user_id,namespace) VALUES (${literal(investigation)},${literal(userA)},'packproof-demo');
DO $$ BEGIN
 IF (SELECT count(*) FROM packproof.investigations WHERE id=${literal(investigation)})<>1 THEN RAISE EXCEPTION 'Own investigation invisible'; END IF;
 BEGIN INSERT INTO packproof.investigations(id,owner_user_id,namespace) VALUES (gen_random_uuid(),${literal(userB)},'packproof-demo'); RAISE EXCEPTION 'Cross-account insert accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.pp_public_products SET unit_mark='STOLEN'; RAISE EXCEPTION 'Private projection write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO packproof.tool_events(id) VALUES (gen_random_uuid()); RAISE EXCEPTION 'Tool-event spoof accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO packproof.tool_events(id,investigation_id,tool_name,operation_key,argument_sha256,record_ids,status) VALUES (${literal(eventId)},${literal(investigation)},'lookup_product','test-only',repeat('0',64),'{}','needs_evidence');
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM packproof.tool_events WHERE id=${literal(eventId)})<>1 THEN RAISE EXCEPTION 'Own event invisible'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',${claimsB},true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM packproof.investigations WHERE id=${literal(investigation)}) THEN RAISE EXCEPTION 'Cross-account investigation leaked'; END IF;
 IF EXISTS(SELECT 1 FROM packproof.tool_events WHERE id=${literal(eventId)}) THEN RAISE EXCEPTION 'Cross-account event leaked'; END IF;
 BEGIN UPDATE packproof.investigations SET status='complete' WHERE id=${literal(investigation)}; RAISE EXCEPTION 'Cross-account update accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 BEGIN UPDATE packproof.signed_records SET revision=revision+1; RAISE EXCEPTION 'Signed record mutation accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM packproof.directory_changes; RAISE EXCEPTION 'Directory deletion accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF has_table_privilege('service_role','packproof.signed_records','INSERT') OR has_table_privilege('service_role','packproof.items','UPDATE') THEN RAISE EXCEPTION 'Serving role can mutate signed claims/ownership'; END IF;
END $$;
ROLLBACK;
SELECT 'rls-and-immutability-passed';`,true);
  expect(result).toContain('rls-and-immutability-passed');await record('actualRoleRlsAndImmutability');
 },90000);
 it('allows anonymous HTTPS Data API projection reads and rejects anonymous writes',async()=>{
  const origin=process.env.SUPABASE_URL!;const key=process.env.SUPABASE_PUBLISHABLE_KEY!;
  const headers={apikey:key,'content-type':'application/json',...(key.split('.').length===3?{Authorization:`Bearer ${key}`}:{})};
  const response=await fetch(new URL('/rest/v1/pp_public_products?select=*',origin),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  expect(response.status).toBe(200);
  const rows=await response.json();expect(rows).toHaveLength(3);
  expect(JSON.stringify(rows)).not.toMatch(/registered_owner|user_id|buyer|device|private|jws|public_jwk/);
  const write=await fetch(new URL('/rest/v1/pp_public_products',origin),{method:'POST',headers,body:JSON.stringify({item_id:crypto.randomUUID()}),redirect:'error',signal:AbortSignal.timeout(15000)});
  expect([401,403]).toContain(write.status);
  await record('anonymousHttpsReadAndWriteDenial');
 },45000);
});
