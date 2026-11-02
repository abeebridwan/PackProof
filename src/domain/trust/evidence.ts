import { CompactSign, compactVerify, decodeProtectedHeader, importJWK } from 'jose';
import { BindingData, EvidenceRecord, StoredRecord, RootPin, type RecordKind } from '../../contracts/evidence.js';
import { sha256, utf8 } from '../verification/p0-crypto.js';

export const EVIDENCE_JWS_TYPE = 'packproof-evidence+jws';
const REVIEWER_TYPES = new Set<RecordKind>(['correction', 'audit']);
const DIRECTORY_TYPES = new Set<RecordKind>(['issuer_binding', 'directory_change']);
export type VerifiedRecord = { record: EvidenceRecord; stored: StoredRecord; payloadBytes: Uint8Array };
export type IssuerGrant = { bindingId: string; bindingHash: string; data: ReturnType<typeof BindingData.parse> };
export type Directory = { version: number; hash: string; grants: ReadonlyMap<string, IssuerGrant>; auditIds: string[]; bindings: VerifiedRecord[] };
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));

export async function signRecord(input: unknown, key: CryptoKey): Promise<StoredRecord> {
  const record = EvidenceRecord.parse(input);
  // Serialize once. Verification and hashes always use these exact original bytes.
  const jws = await new CompactSign(utf8(JSON.stringify(record))).setProtectedHeader({ alg: 'ES256', typ: EVIDENCE_JWS_TYPE, kid: record.keyId }).sign(key);
  return StoredRecord.parse({ id: record.id, jws, sha256: await sha256(utf8(jws)) });
}
function header(stored: StoredRecord) {
  const h = decodeProtectedHeader(stored.jws);
  if (h.alg !== 'ES256' || h.typ !== EVIDENCE_JWS_TYPE || typeof h.kid !== 'string' || Object.keys(h).some(k => !['alg', 'typ', 'kid'].includes(k))) throw new Error('Untrusted evidence header');
  return h;
}
async function open(input: unknown, publicKey: RootPin['publicKey'], keyId: string): Promise<VerifiedRecord> {
  const stored = StoredRecord.parse(input);
  if (await sha256(utf8(stored.jws)) !== stored.sha256) throw new Error('Broken JWS hash');
  if (header(stored).kid !== keyId) throw new Error('Unknown signing key');
  // Strict public JWK schema rejects private key material and token-supplied keys.
  const jwk = RootPin.shape.publicKey.parse(publicKey);
  const { payload } = await compactVerify(stored.jws, await importJWK(jwk, 'ES256'), { algorithms: ['ES256'] });
  const record = EvidenceRecord.parse(decode(payload));
  if (record.id !== stored.id || record.keyId !== keyId) throw new Error('Record identity mismatch');
  return { record, stored, payloadBytes: payload };
}
export async function loadDirectory(inputs: readonly StoredRecord[], pinInput: RootPin, at: string): Promise<Directory> {
  const pin = RootPin.parse(pinInput);
  if (!Number.isFinite(Date.parse(at))) throw new Error('Trusted clock required');
  const roots: VerifiedRecord[] = [];
  for (const input of inputs) {
    const value = await open(input, pin.publicKey, pin.keyId);
    if (!DIRECTORY_TYPES.has(value.record.type) || value.record.namespace !== pin.namespace || value.record.issuerId !== pin.issuerId || Date.parse(value.record.issuedAt) > Date.parse(at)) throw new Error('Unauthorized root record');
    roots.push(value);
  }
  if (new Set(roots.map(r => r.record.id)).size !== roots.length) throw new Error('Duplicate directory record');
  const changes = roots.filter(r => r.record.type === 'directory_change').sort((a, b) => a.record.type === 'directory_change' && b.record.type === 'directory_change' ? a.record.data.version - b.record.data.version : 0);
  const bindings = new Map(roots.filter(r => r.record.type === 'issuer_binding').map(r => [r.record.id, r]));
  const grants = new Map<string, IssuerGrant>();
  const used = new Set<string>();
  let version = 0;
  let previous: string | null = null;
  for (const entry of changes) {
    if (entry.record.type !== 'directory_change') throw new Error('Invalid directory change');
    const d = entry.record.data;
    const binding = bindings.get(d.bindingRecordId);
    if (d.version !== version + 1 || d.previousDirectoryHash !== previous || !binding || binding.record.type !== 'issuer_binding' || used.has(d.bindingRecordId) || d.bindingSha256 !== binding.stored.sha256 || d.newStateHash !== binding.stored.sha256 || d.administratorId !== pin.issuerId) throw new Error('Broken signed directory audit chain');
    const grant = binding.record.data;
    const prior = grants.get(grant.keyId);
    if ((prior?.bindingHash ?? null) !== d.priorStateHash || (d.operation === 'grant') !== !prior || (d.operation === 'revoke') !== (grant.revokedAt !== null) || grant.recordTypes.some(t => DIRECTORY_TYPES.has(t) || (grant.role === 'reviewer' && !REVIEWER_TYPES.has(t))) || !grant.namespaces.includes(pin.namespace)) throw new Error('Invalid directory authority change');
    if (prior && (prior.data.revokedAt !== null || prior.data.issuerId !== grant.issuerId || JSON.stringify(prior.data.publicKey) !== JSON.stringify(grant.publicKey))) throw new Error('Revoked key cannot be reused or reassigned');
    grants.set(grant.keyId, { bindingId: binding.record.id, bindingHash: binding.stored.sha256, data: grant });
    used.add(binding.record.id); version = d.version; previous = entry.stored.sha256;
  }
  if (!version || used.size !== bindings.size || previous === null) throw new Error('Incomplete signed directory');
  return { version, hash: previous, grants, auditIds: changes.map(r => r.record.id), bindings: roots };
}
export async function verifyEvidence(input: unknown, directory: Directory, namespace: string, expected: RecordKind, at: string): Promise<VerifiedRecord> {
  if (DIRECTORY_TYPES.has(expected)) throw new Error('Root-only record type');
  const stored = StoredRecord.parse(input);
  const h = header(stored);
  const grant = directory.grants.get(h.kid!);
  if (!grant || grant.data.revokedAt !== null || !grant.data.namespaces.includes(namespace) || !grant.data.recordTypes.includes(expected) || (grant.data.role === 'reviewer' && !REVIEWER_TYPES.has(expected))) throw new Error('Unknown, revoked or unauthorized issuer');
  const value = await open(stored, grant.data.publicKey, grant.data.keyId);
  const r = value.record;
  const time = Date.parse(at);
  if (!Number.isFinite(time) || r.namespace !== namespace || r.type !== expected || r.issuerId !== grant.data.issuerId || Date.parse(r.issuedAt) > time || Date.parse(r.issuedAt) < Date.parse(grant.data.validFrom) || Date.parse(r.issuedAt) >= Date.parse(grant.data.validUntil) || time < Date.parse(grant.data.validFrom) || time >= Date.parse(grant.data.validUntil)) throw new Error('Record namespace/type/issuer/validity mismatch');
  return value;
}
export function untrustedRecordType(input: StoredRecord): RecordKind {
  // Used only for dispatch. No value is accepted until signature/authority validation.
  const part = input.jws.split('.')[1]!;
  return EvidenceRecord.parse(decode(Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)))).type;
}
export async function verifyRecordSet(records: readonly StoredRecord[], pin: RootPin, at: string) {
  const list = records.map(r => StoredRecord.parse(r));
  if (new Set(list.map(r => r.id)).size !== list.length) throw new Error('Duplicate record ID');
  const directoryRecords = list.filter(r => DIRECTORY_TYPES.has(untrustedRecordType(r)));
  const directory = await loadDirectory(directoryRecords, pin, at);
  const verified = new Map<string, VerifiedRecord>(directory.bindings.map(r => [r.record.id, r]));
  for (const stored of list.filter(r => !DIRECTORY_TYPES.has(untrustedRecordType(r)))) {
    const value = await verifyEvidence(stored, directory, pin.namespace, untrustedRecordType(stored), at);
    verified.set(value.record.id, value);
  }
  for (const value of verified.values()) {
    const r = value.record;
    if (r.previousIds.length !== r.evidenceHashes.length) throw new Error('Dependency hash count mismatch');
    r.previousIds.forEach((id, i) => { if (verified.get(id)?.stored.sha256 !== r.evidenceHashes[i]) throw new Error('Missing or altered signed dependency'); });
    if (r.type === 'audit' && (!verified.has(r.data.targetRecordId) || !r.previousIds.includes(r.data.targetRecordId))) throw new Error('Missing audit source');
    if (r.type === 'correction') {
      const target = verified.get(r.data.targetRecordId);
      const replacement = verified.get(r.data.replacementRecordId);
      const grant = directory.grants.get(r.keyId);
      if (!target || !replacement || target.stored.sha256 !== r.data.targetSha256 || replacement.record.type !== target.record.type || replacement.record.namespace !== target.record.namespace || replacement.record.scope !== target.record.scope || replacement.record.issuerId !== target.record.issuerId || JSON.stringify([...replacement.record.subjectIds].sort()) !== JSON.stringify([...target.record.subjectIds].sort()) || replacement.record.revision <= target.record.revision || !replacement.record.previousIds.includes(target.record.id) || !r.previousIds.includes(target.record.id) || !r.previousIds.includes(replacement.record.id) || (r.issuerId !== target.record.issuerId && grant?.data.role !== 'reviewer')) throw new Error('Unauthorized correction');
    }
  }
  return { directory, verified };
}
