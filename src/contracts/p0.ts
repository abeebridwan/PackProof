import { z } from 'zod';

export const Text = z.string().min(1).max(256);
export const Id = z.uuid();
export const Utc = z.iso.datetime().max(40);
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const Scope = z.enum(['model', 'batch', 'unit', 'container']);
export const Mark = z.strictObject({
  namespace: Text, value: Text, format: z.enum(['qr', 'datamatrix', 'text']),
  scope: Scope, physicalLocation: Text,
});
export const gateResult = <T extends z.ZodType>(data: T) => z.strictObject({
  status: z.enum(['supported', 'blocked', 'needs_evidence', 'unavailable', 'stale']),
  reason: z.string().min(1).max(1000), evidence_refs: z.array(Text).max(32), scope: Scope,
  asOf: Utc, policyVersion: Text, next_actions: z.array(Text).max(8), data: data.nullable(),
});
export type GateResult<T> = {
  status: 'supported' | 'blocked' | 'needs_evidence' | 'unavailable' | 'stale';
  reason: string; evidence_refs: string[]; scope: z.infer<typeof Scope>;
  asOf: string; policyVersion: string; next_actions: string[]; data: T | null;
};
export const TransferAgreement = z.strictObject({
  schemaVersion: z.literal(1), transferId: Id, itemId: Id, sellerActorId: Id, buyerActorId: Id,
  sellerDeviceKeyId: Id, buyerDeviceKeyId: Id, expectedOwnerId: Id,
  expectedOwnerVersion: z.number().int().nonnegative(), mappingRecordId: Id,
  inspectionRecordId: Id.nullable(), policyVersion: Text, issuedAt: Utc, expiresAt: Utc,
}).superRefine((a, ctx) => {
  if (a.sellerActorId === a.buyerActorId) ctx.addIssue({ code: 'custom', message: 'Distinct parties required' });
  if (a.sellerDeviceKeyId === a.buyerDeviceKeyId) ctx.addIssue({ code: 'custom', message: 'Distinct device keys required' });
  if (Date.parse(a.expiresAt) <= Date.parse(a.issuedAt)) ctx.addIssue({ code: 'custom', message: 'Expiry must follow issue time' });
});
export const PackManifest = z.strictObject({
  packId: Id, scopeKey: Text, namespace: Text, itemIds: z.array(Id).min(1).max(128),
  profileVersion: Text, coverage: z.enum(['exact-selection', 'partial-index']),
  sourceDatasetVersion: Text, sequence: z.number().int().nonnegative(),
  generatedAt: Utc, expiresAt: Utc, directoryVersion: z.number().int().nonnegative(), directorySha256: Hash,
  records: z.array(z.strictObject({ id: Id, type: Text, sha256: Hash, requiredRefs: z.array(Id).max(32) })).max(256),
  media: z.array(z.strictObject({ sha256: Hash, bytes: z.number().int().positive().max(2 * 1024 * 1024) })).max(16),
}).superRefine((m, ctx) => {
  if (Date.parse(m.expiresAt) <= Date.parse(m.generatedAt)) ctx.addIssue({ code: 'custom', message: 'Invalid manifest expiry' });
  for (const ids of [m.itemIds, m.records.map(r => r.id), m.media.map(r => r.sha256)]) {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate manifest entry' });
  }
});
export const SignedPackManifest = z.string().min(16).max(256_000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
export const PublicJwk = z.strictObject({ kty: z.literal('EC'), crv: z.literal('P-256'), x: Text, y: Text });
export const LookupArgs = z.strictObject({ namespace: z.literal('packproof-demo'), productMark: Text });
export const RegistryResult = z.strictObject({
  demo: z.literal(true), datasetVersion: z.literal('p0-fixtures-1'),
  itemId: Id.nullable(), recordIds: z.array(Id).max(4), productMark: Text,
  packagingMark: Text.nullable(), status: z.enum(['found', 'unknown']),
});
export const ProbeAnswer = z.strictObject({
  demo: z.literal(true), status: z.enum(['found', 'unknown']), itemId: Id.nullable(),
  packagingMark: Text.nullable(), recordIds: z.array(Id).max(4),
});
export const VisualReading = z.strictObject({
  value: Text.nullable(), quality: z.enum(['readable', 'unreadable']),
});
export const TransportFixture = z.strictObject({
  schemaVersion: z.literal(1), demo: z.literal(true), kind: z.literal('transport-feasibility-only'),
  nonce: z.string().regex(/^[a-f0-9]{32}$/), note: z.literal('Not an OfflineProof pack'),
});
