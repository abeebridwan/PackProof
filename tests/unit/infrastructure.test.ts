import { describe, expect, it } from 'vitest';
import { databaseEnvironment, projectUrl, publicKeyAllowed, secretKeyAllowed } from '../../scripts/spikes/infrastructure.js';

const ref = 'abcdefghijklmnopqrst';
describe('infrastructure credentials stay bound to the selected project', () => {
  it('refuses alternate origins, embedded credentials and URL suffixes before sending any key', () => {
    expect(projectUrl(`https://${ref}.supabase.co`, ref).origin).toBe(`https://${ref}.supabase.co`);
    for (const url of [`http://${ref}.supabase.co`, `https://${ref}.supabase.co.attacker.test`, `https://secret@${ref}.supabase.co`, `https://${ref}.supabase.co?token=secret`, `https://${ref}.supabase.co/path`]) expect(() => projectUrl(url, ref)).toThrow();
  });
  it('refuses secret/service-role keys in public configuration', () => {
    const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
    expect(publicKeyAllowed('sb_publishable_demo123')).toBe(true);
    expect(publicKeyAllowed(jwt('anon'))).toBe(true);
    for (const key of ['sb_secret_demo123', jwt('service_role'), '', 'malformed']) expect(publicKeyAllowed(key)).toBe(false);
    expect(secretKeyAllowed('sb_secret_demo123')).toBe(true);
    expect(secretKeyAllowed(jwt('service_role'))).toBe(true);
    for (const key of ['sb_publishable_demo123', jwt('anon'), '', 'malformed']) expect(secretKeyAllowed(key)).toBe(false);
  });
  it('binds database credentials to the selected project and requires TLS/read-only mode', () => {
    const env = databaseEnvironment(`postgresql://postgres:demo@db.${ref}.supabase.co:5432/postgres`, ref);
    expect(env).toMatchObject({ PGSSLMODE: 'verify-full', PGHOST: `db.${ref}.supabase.co` });
    expect(env.PGOPTIONS).toContain('default_transaction_read_only=on');
    for (const url of ['postgresql://postgres:demo@unrelated.test/postgres', 'postgresql://postgres.other:demo@aws-0-eu-west-1.pooler.supabase.com/postgres']) expect(() => databaseEnvironment(url, ref)).toThrow();
  });
});
