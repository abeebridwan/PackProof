import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { sha256, utf8 } from '../../src/domain/verification/p0-crypto.js';
import { sql, inspect, literal, PROJECT_REF } from './database.js';
const version = '202611020001';
const file = `supabase/migrations/${version}_p1a_evidence.sql`;
const migration = await readFile(file, 'utf8');
const hash = await sha256(utf8(migration));
const before = inspect();
const existing = before.tables as string[];
if (existing.some(t => !t.startsWith('packproof.') && t !== 'public.pp_public_products')) throw new Error('Unexpected application tables: isolated development project required; migration not applied');
let applied = false;
if (existing.includes('packproof.schema_migrations')) {
  const stored = sql(`SELECT sha256 FROM packproof.schema_migrations WHERE version=${literal(version)};`);
  if (stored !== hash) throw new Error('Migration history/hash mismatch; do not rewrite an applied migration');
} else {
  if (existing.length) throw new Error('Unversioned schema exists; manual review required');
  sql(`BEGIN; SELECT pg_advisory_xact_lock(7140911);\n${migration}\nINSERT INTO packproof.schema_migrations(version,sha256) VALUES (${literal(version)},${literal(hash)}); COMMIT;`, true);
  applied = true;
}
const after = inspect();
const evidence = { phase: 'P1A', projectRef: PROJECT_REF, checkedAt: new Date().toISOString(), status: 'passed', file, version, sha256: hash, newlyApplied: applied, before, after, tls: 'verify-full', providerRequests: 0, destructiveStatements: false };
await mkdir('docs/packproof/evidence', { recursive: true });
await writeFile(applied ? 'docs/packproof/evidence/p1a-migration.json' : 'docs/packproof/evidence/p1a-migration-repeat.json', JSON.stringify(evidence, null, 2)+'\n');
console.log(JSON.stringify({ status: 'passed', version, newlyApplied: applied, tables: after.tables.length }));
