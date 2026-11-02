import { execFileSync } from 'node:child_process';
import { databaseEnvironment, projectUrl } from '../spikes/infrastructure.js';

export const PROJECT_REF = 'hvbzxeuedookkwleyjmx';
// CLI-only adapter: credentials never appear in command arguments or error output.
export function sql(query: string, write = false): string {
  if (process.env.SUPABASE_PROJECT_REF !== PROJECT_REF) throw new Error('Dedicated PackProof development project required');
  projectUrl(process.env.SUPABASE_URL ?? '', PROJECT_REF);
  const pg = databaseEnvironment(process.env.SUPABASE_DB_URL ?? '', PROJECT_REF);
  try {
    return execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      input: query, encoding: 'utf8', timeout: 45_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, ...pg, PGOPTIONS: `-c default_transaction_read_only=${write ? 'off' : 'on'} -c statement_timeout=15000 -c lock_timeout=3000`,
        ...(process.env.SUPABASE_DB_SSLROOTCERT ? { PGSSLROOTCERT: process.env.SUPABASE_DB_SSLROOTCERT } : {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    // Emit only SQLSTATE. Raw psql stderr can contain credentials or row data.
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
    const code = stderr.match(/ERROR:\s+(?:([A-Z0-9]{5}):\s+)?([^\n]+)/)?.[1];
    throw new Error(`PackProof PostgreSQL operation failed${code ? ` (${code})` : ''}; raw diagnostics suppressed`);
  }
}
export const readAsService = (query: string) => sql(`BEGIN; SET LOCAL ROLE service_role; ${query} ROLLBACK;`);
export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function inspect() {
  return JSON.parse(sql(`SELECT json_build_object('database',current_database(),'version',current_setting('server_version'),'tables',coalesce((SELECT json_agg(table_schema||'.'||table_name ORDER BY table_schema,table_name) FROM information_schema.tables WHERE table_schema IN ('public','packproof') AND table_type='BASE TABLE'),'[]'::json),'auth',to_regnamespace('auth') IS NOT NULL,'storage',to_regnamespace('storage') IS NOT NULL);`));
}
if (process.argv[1]?.endsWith('/database.ts')) console.log(JSON.stringify({ projectRef: PROJECT_REF, ...inspect(), readOnly: true }));
