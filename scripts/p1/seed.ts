import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { Dataset, RootPin } from '../../src/contracts/evidence.js';
import { validateDataset } from '../../src/server/evidence/services.js';
import { createDemo, newDemoKeys, type DemoKeys } from './demo.js';
import { sql, literal, PROJECT_REF } from './database.js';
const dir = '.local/p1';
export async function prepareDemo() {
  const publicFile = 'docs/packproof/demo/signed-demo.json';
  try {
    const published = JSON.parse(await readFile(publicFile,'utf8')) as Awaited<ReturnType<typeof createDemo>>;
    const pinned = RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
    if (JSON.stringify(RootPin.parse(published.root)) !== JSON.stringify(pinned)) throw new Error('Public demo root mismatch');
    await validateDataset(published.dataset,pinned,new Date().toISOString());
    return published;
  } catch(error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await mkdir(dir, { recursive:true, mode:0o700 });
  const keyFile = `${dir}/offline-keys.json`;
  let keys: DemoKeys;
  try {
    if ((await stat(keyFile)).mode & 0o077) throw new Error('Demo key file must be owner-only');
    keys = JSON.parse(await readFile(keyFile,'utf8'));
  } catch(error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    keys = await newDemoKeys();
    await writeFile(keyFile,JSON.stringify(keys),{mode:0o600,flag:'wx'});
  }
  let material: Awaited<ReturnType<typeof createDemo>>;
  try { material = JSON.parse(await readFile(`${dir}/signed-demo.json`,'utf8')); }
  catch(error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    material = await createDemo(keys);
    await writeFile(`${dir}/signed-demo.json`,JSON.stringify(material,null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  const pin = RootPin.parse(material.root);
  const rootFile = 'docs/packproof/demo/root-public.json';
  await mkdir('docs/packproof/demo',{recursive:true});
  try { if(JSON.stringify(RootPin.parse(JSON.parse(await readFile(rootFile,'utf8')))) !== JSON.stringify(pin)) throw new Error('Pinned demo root changed; never replace trust automatically'); }
  catch(error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    await writeFile(rootFile,JSON.stringify(pin,null,2)+'\n',{flag:'wx'});
  }
  await validateDataset(material.dataset,pin,new Date().toISOString());
  await writeFile(publicFile,JSON.stringify(material,null,2)+'\n',{flag:'wx'});
  return material;
}
export function seedSql(dataset: Dataset) {
  // Same Zod/signature/authority checks run before this transaction is constructed.
  return `BEGIN; SELECT pg_advisory_xact_lock(7140912);
CREATE TEMP TABLE pp_seed_input(doc jsonb) ON COMMIT DROP;
INSERT INTO pp_seed_input VALUES (${literal(JSON.stringify(dataset))}::jsonb);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pp_seed_input s, jsonb_array_elements(s.doc->'records') r JOIN packproof.signed_records e ON e.id=(r->>'id')::uuid WHERE e.sha256<>r->>'sha256' OR e.jws<>r->>'jws') THEN RAISE EXCEPTION 'Seed signed-record conflict'; END IF;
 IF EXISTS(SELECT 1 FROM pp_seed_input s, jsonb_array_elements(s.doc->'actors') a JOIN packproof.actors e ON e.id=(a->>'id')::uuid WHERE e.kind<>a->>'kind' OR e.public_label<>a->>'label' OR NOT e.demo) THEN RAISE EXCEPTION 'Seed actor conflict'; END IF;
 IF EXISTS(SELECT 1 FROM pp_seed_input s, jsonb_array_elements(s.doc->'products') p JOIN packproof.items e ON e.id=(p->>'itemId')::uuid WHERE e.registered_owner_id<>(p->>'registeredOwnerId')::uuid OR e.owner_version<>(p->>'ownerVersion')::integer OR e.owner_record_id<>(p->>'ownerRecordId')::uuid OR e.issuance_record_id<>(p->>'issuanceRecordId')::uuid OR e.mapping_record_id<>(p->>'mappingRecordId')::uuid OR e.unit_mark<>p->>'unitMark' OR e.namespace<>p->>'namespace' OR e.model_code<>p->>'modelCode' OR e.batch_code<>p->>'batchCode' OR e.lifecycle<>'issued') THEN RAISE EXCEPTION 'Seed refuses existing ownership/projection change'; END IF;
END $$;
INSERT INTO packproof.actors SELECT (a->>'id')::uuid,a->>'kind',a->>'label',true FROM pp_seed_input s,jsonb_array_elements(s.doc->'actors') a ON CONFLICT DO NOTHING;
CREATE TEMP TABLE pp_seed_records ON COMMIT DROP AS SELECT r,convert_from(decode(translate(split_part(r->>'jws','.',2),'-_','+/')||repeat('=',(4-length(split_part(r->>'jws','.',2))%4)%4),'base64'),'UTF8')::jsonb p FROM pp_seed_input s,jsonb_array_elements(s.doc->'records') r;
INSERT INTO packproof.signed_records SELECT (r->>'id')::uuid,p->>'namespace',p->>'type',(p->>'issuerId')::uuid,(p->>'keyId')::uuid,p->>'scope',(p->>'issuedAt')::timestamptz,(p->>'receivedAt')::timestamptz,(p->>'revision')::integer,p->>'visibility',true,r->>'jws',r->>'sha256',p FROM pp_seed_records ON CONFLICT DO NOTHING;
INSERT INTO packproof.issuer_bindings SELECT (p->>'id')::uuid,(p->'data'->>'issuerId')::uuid,(p->'data'->>'keyId')::uuid,p->'data'->'publicKey',ARRAY(SELECT jsonb_array_elements_text(p->'data'->'namespaces')),ARRAY(SELECT jsonb_array_elements_text(p->'data'->'recordTypes')),(p->'data'->>'validFrom')::timestamptz,(p->'data'->>'validUntil')::timestamptz,(p->'data'->>'revokedAt')::timestamptz FROM pp_seed_records WHERE p->>'type'='issuer_binding' ON CONFLICT DO NOTHING;
INSERT INTO packproof.directory_changes SELECT (p->>'id')::uuid,p->>'namespace',(p->'data'->>'version')::integer,(p->'data'->>'bindingRecordId')::uuid,p->'data'->>'previousDirectoryHash' FROM pp_seed_records WHERE p->>'type'='directory_change' ON CONFLICT DO NOTHING;
INSERT INTO packproof.items SELECT (p->>'itemId')::uuid,p->>'namespace',p->>'unitMark',p->>'modelCode',p->>'batchCode',(p->>'issuanceRecordId')::uuid,(p->>'mappingRecordId')::uuid,(p->>'ownerRecordId')::uuid,(p->>'registeredOwnerId')::uuid,(p->>'ownerVersion')::integer,'issued' FROM pp_seed_input s,jsonb_array_elements(s.doc->'products') p ON CONFLICT DO NOTHING;
INSERT INTO packproof.marking_relations SELECT (p->>'id')::uuid,(p->'data'->>'itemId')::uuid,p->>'namespace',p->'data'->'productMark'->>'value',p->'data'->'packagingMark'->>'value',p->'data'->'containerMark'->>'value','unit','unit','container' FROM pp_seed_records WHERE p->>'type'='mapping' ON CONFLICT DO NOTHING;
INSERT INTO packproof.notices SELECT (p->>'id')::uuid,p->>'namespace',p->'data'->>'modelCode',ARRAY(SELECT jsonb_array_elements_text(p->'data'->'batchCodes')),(p->'data'->>'effectiveFrom')::timestamptz,(p->'data'->>'effectiveUntil')::timestamptz FROM pp_seed_records WHERE p->>'type'='notice' ON CONFLICT DO NOTHING;
INSERT INTO packproof.custody_history SELECT (p->>'id')::uuid,(p->'data'->>'itemId')::uuid,p->>'type' FROM pp_seed_records WHERE p->>'type' IN ('custody','custody_snapshot','gap') ON CONFLICT DO NOTHING;
INSERT INTO public.pp_public_products SELECT i.id,i.namespace,i.unit_mark,m.packaging_mark,i.model_code,i.batch_code,m.carton_mark,i.issuance_record_id,i.mapping_record_id,true,'Fictional PackProof demonstration data' FROM packproof.items i JOIN packproof.marking_relations m ON m.item_id=i.id WHERE i.id IN (SELECT (p->>'itemId')::uuid FROM pp_seed_input s,jsonb_array_elements(s.doc->'products') p) ON CONFLICT DO NOTHING;
COMMIT;`;
}
if (process.argv[1]?.endsWith('/seed.ts')) {
 const material = await prepareDemo();
 if(process.argv.includes('--prepare')) console.log(JSON.stringify({status:'prepared',signedRecords:material.dataset.records.length,providerRequests:0}));
 else {
  const before = sql('SELECT count(*) FROM packproof.signed_records;');
  sql(seedSql(material.dataset),true);
  const after = sql('SELECT count(*) FROM packproof.signed_records;');
  const evidence={phase:'P1A',status:'passed',projectRef:PROJECT_REF,checkedAt:new Date().toISOString(),beforeCount:Number(before),afterCount:Number(after),signedRecords:material.dataset.records.length,productUnits:material.dataset.products.length,negativeCasesSeeded:false,privateKeyStorage:'.local/p1/offline-keys.json (ignored, owner-only, CLI only)',providerRequests:0};
  await writeFile('docs/packproof/evidence/p1a-seed.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
 }
}
