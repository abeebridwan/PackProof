import { CompactSign, compactVerify, decodeProtectedHeader, importJWK, type JWK } from 'jose';
import { PackManifest, SignedPackManifest } from '../../contracts/p0.js';

export const JWS_TYPE = 'packproof-p0+jws';
export type TrustedKey = { kid: string; jwk: JWK; role: 'root' | 'pack' | 'device'; namespace: string };
export const utf8 = (s: string) => new TextEncoder().encode(s);
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function assertHash(bytes: Uint8Array, expected: string) {
  if (await sha256(bytes) !== expected) throw new Error('SHA-256 mismatch');
}
export async function signBytes(bytes: Uint8Array, key: CryptoKey, kid: string) {
  return new CompactSign(bytes).setProtectedHeader({ alg: 'ES256', typ: JWS_TYPE, kid }).sign(key);
}
// Trust is supplied by the official bootstrap/caller, never by token headers or imported files.
export async function verifyBytes(jws: string, trust: readonly TrustedKey[], role: TrustedKey['role'], namespace: string) {
  SignedPackManifest.parse(jws);
  const h = decodeProtectedHeader(jws);
  if (h.alg !== 'ES256' || h.typ !== JWS_TYPE || typeof h.kid !== 'string' ||
      Object.keys(h).some(k => !['alg', 'typ', 'kid'].includes(k))) throw new Error('Untrusted JWS header');
  const trusted = trust.find(k => k.kid === h.kid && k.role === role && k.namespace === namespace);
  if (!trusted || trusted.jwk.d || trusted.jwk.kty !== 'EC' || trusted.jwk.crv !== 'P-256') throw new Error('Unknown or unauthorized key; trusted setup required');
  const key = await importJWK(trusted.jwk, 'ES256');
  const verified = await compactVerify(jws, key, { algorithms: ['ES256'] });
  return verified.payload;
}
export async function verifyManifest(jws: string, trust: readonly TrustedKey[], namespace: string) {
  const payload = await verifyBytes(jws, trust, 'pack', namespace);
  const manifest = PackManifest.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)));
  if (manifest.namespace !== namespace) throw new Error('Manifest namespace mismatch');
  return manifest;
}
