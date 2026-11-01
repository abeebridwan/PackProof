import { execFileSync } from 'node:child_process';
import { evidence } from './evidence.js';

type Check = { status: 'passed' | 'failed' | 'blocked' | 'not_run'; detail: string; http?: number };
export function projectUrl(raw: string, ref: string): URL {
  const url = new URL(raw);
  if (!/^[a-z]{20}$/.test(ref) || url.protocol !== 'https:' || url.hostname !== `${ref}.supabase.co` || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Expected exact hosted Supabase project HTTPS origin and matching project reference');
  return url;
}
export function publicKeyAllowed(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString()).role === 'anon'; } catch { return false; }
}
export function secretKeyAllowed(key: string): boolean {
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString()).role === 'service_role'; } catch { return false; }
}
export function databaseEnvironment(raw: string, ref: string): Record<string, string> {
  const url = new URL(raw);
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${ref}.supabase.co` && user === 'postgres';
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && user === `postgres.${ref}`;
  if (!/^[a-z]{20}$/.test(ref) || !['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooler) || !url.password || url.pathname !== '/postgres' || url.hash) throw new Error('Expected a database connection for the selected Supabase project');
  return { PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: user, PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'postgres', PGSSLMODE: 'verify-full', PGCONNECT_TIMEOUT: '8', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000' };
}
async function jsonGet(url: URL, key: string): Promise<{ http: number; data: unknown }> {
  const headers: Record<string, string> = { apikey: key };
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  return { http: response.status, data: await response.json() };
}

export async function inspectInfrastructure() {
  const checks: Record<string, Check> = {};
  const ref = process.env.SUPABASE_PROJECT_REF ?? '';
  let origin: URL | undefined;
  try {
    if (process.env.SUPABASE_URL && ref) origin = projectUrl(process.env.SUPABASE_URL, ref);
    checks.project = origin ? { status: 'passed', detail: 'Configured project URL and reference agree; remote ownership checked separately.' } : { status: 'blocked', detail: 'Select dedicated PackProof project and configure SUPABASE_PROJECT_REF/SUPABASE_URL.' };
  } catch { checks.project = { status: 'failed', detail: 'Project URL/reference mismatch or unsupported origin; no keys sent.' }; }
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY ?? '';
  checks.publishableKey = !publicKey ? { status: 'blocked', detail: 'SUPABASE_PUBLISHABLE_KEY missing.' } : publicKeyAllowed(publicKey) ? { status: 'passed', detail: 'Publishable or legacy anon key type; acceptance checked with Auth below.' } : { status: 'failed', detail: 'Secret/service-role key rejected from public configuration.' };
  checks.serverSecret = !secret ? { status: 'blocked', detail: 'SUPABASE_SECRET_KEY missing; privileged Storage check not run.' } : secretKeyAllowed(secret) ? { status: 'passed', detail: 'Server-only secret/service-role key type; no value recorded or bundled.' } : { status: 'failed', detail: 'Expected server secret/service-role key, not a public key.' };
  checks.auth = { status: 'blocked', detail: 'Matching project origin and publishable key required.' };
  if (origin && publicKeyAllowed(publicKey)) {
    try {
      const response = await jsonGet(new URL('/auth/v1/settings', origin), publicKey);
      const valid = response.http === 200 && response.data !== null && typeof response.data === 'object' && 'external' in response.data;
      checks.auth = { status: valid ? 'passed' : 'failed', http: response.http, detail: valid ? 'Read-only Auth settings accepted publishable key; no users/sessions created.' : 'Auth settings unavailable or unexpected response; no raw body recorded.' };
    } catch { checks.auth = { status: 'failed', detail: 'Auth read failed or timed out; no request headers/body logged.' }; }
  }
  checks.storage = { status: 'blocked', detail: 'Matching project origin and server secret required.' };
  checks.privateStorage = { status: 'not_run', detail: 'No private bucket inspected; no buckets/objects created.' };
  if (origin && secretKeyAllowed(secret)) {
    try {
      const response = await jsonGet(new URL('/storage/v1/bucket', origin), secret);
      const valid = response.http === 200 && Array.isArray(response.data) && response.data.every(b => b && typeof b === 'object' && typeof b.public === 'boolean');
      checks.storage = { status: valid ? 'passed' : 'failed', http: response.http, detail: valid ? 'Privileged read-only bucket listing succeeded; bucket names/contents omitted.' : 'Bucket listing unavailable or unexpected response.' };
      if (valid) checks.privateStorage = (response.data as { public: boolean }[]).some(b => !b.public) ? { status: 'passed', detail: 'Existing bucket marked private; object/RLS access policies not exercised.' } : { status: 'not_run', detail: 'Storage API available, but no existing private bucket. No bucket created.' };
    } catch { checks.storage = { status: 'failed', detail: 'Storage read failed or timed out; no credentials/body logged.' }; }
  }
  checks.postgres = { status: 'blocked', detail: 'SUPABASE_DB_URL required; psql uses environment credentials and TLS verification.' };
  checks.migrationPermission = { status: 'not_run', detail: 'No database connection; no DDL/migrations attempted.' };
  if (process.env.SUPABASE_DB_URL && origin) {
    try {
      const pg = databaseEnvironment(process.env.SUPABASE_DB_URL, ref);
      const result = execFileSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT json_build_object('connected', true, 'databaseCreate', has_database_privilege(current_user, current_database(), 'CREATE'), 'publicCreate', has_schema_privilege(current_user, 'public', 'CREATE'), 'authUsage', has_schema_privilege(current_user, 'auth', 'USAGE'), 'storageUsage', has_schema_privilege(current_user, 'storage', 'USAGE'))"], { env: { ...process.env, ...pg, ...(process.env.SUPABASE_DB_SSLROOTCERT ? { PGSSLROOTCERT: process.env.SUPABASE_DB_SSLROOTCERT } : {}) }, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
      const row = JSON.parse(result.trim()) as Record<string, boolean>;
      checks.postgres = { status: row.connected ? 'passed' : 'failed', detail: 'Actual SELECT through TLS-verified PostgreSQL connection in read-only mode.' };
      checks.migrationPermission = { status: row.databaseCreate && row.publicCreate ? 'passed' : 'blocked', detail: 'Read-only CREATE privilege introspection only; no migration or DDL executed.' };
    } catch { checks.postgres = { status: 'failed', detail: 'PostgreSQL configuration/connectivity/query failed; connection string and raw stderr suppressed.' }; }
  }
  await evidence('infrastructure-services', { checkedAt: new Date().toISOString(), projectRef: origin ? ref : null, projectUrl: origin?.origin ?? null, checks, writes: 0, providerRequests: 0, note: 'Explicit read-only checks only; missing credentials stay blocked. No project creation, production schema, seeds, user creation, bucket/object writes, or billing changes.' });
  console.log(JSON.stringify({ checks, writes: 0, providerRequests: 0 }));
}
if (process.argv[1]?.endsWith('/infrastructure.ts')) await inspectInfrastructure();
