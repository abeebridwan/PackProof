import { z } from 'zod';
import { Id, Utc, Hash, Scope, Mark, PublicJwk, Text, SignedPackManifest, gateResult } from './p0.js';

export const RECORD_TYPES = ['issuer_binding', 'directory_change', 'issuance', 'mapping', 'notice', 'custody', 'custody_snapshot', 'gap', 'correction', 'audit'] as const;
export const RecordType = z.enum(RECORD_TYPES);
export const Namespace = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const common = {
  schemaVersion: z.literal(1), id: Id, namespace: Namespace, subjectIds: z.array(Id).min(1).max(32), scope: Scope,
  issuerId: Id, keyId: Id, issuedAt: Utc, receivedAt: Utc, revision: z.number().int().positive(),
  previousIds: z.array(Id).max(32), evidenceHashes: z.array(Hash).max(32), visibility: z.enum(['public', 'restricted']),
  demo: z.literal(true),
};
export const BindingData = z.strictObject({
  issuerId: Id, keyId: Id, publicKey: PublicJwk, role: z.enum(['issuer', 'reviewer']),
  namespaces: z.array(Namespace).min(1).max(16), recordTypes: z.array(RecordType).min(1).max(10),
  validFrom: Utc, validUntil: Utc, revokedAt: Utc.nullable(), label: Text,
});
const record = <K extends typeof RECORD_TYPES[number], D extends z.ZodType>(type: K, data: D) => z.strictObject({ ...common, type: z.literal(type), data });
export const EvidenceRecord = z.discriminatedUnion('type', [
  record('issuer_binding', BindingData),
  record('directory_change', z.strictObject({ version: z.number().int().positive(), previousDirectoryHash: Hash.nullable(), bindingRecordId: Id, bindingSha256: Hash, administratorId: Id, reason: Text, operation: z.enum(['grant', 'revoke', 'correct']), priorStateHash: Hash.nullable(), newStateHash: Hash })),
  record('issuance', z.strictObject({ itemId: Id, modelCode: Text, batchCode: Text, unitMark: Mark, registeredHolderId: Id, ownerVersion: z.literal(1), lifecycle: z.literal('issued'), label: Text })),
  record('mapping', z.strictObject({ itemId: Id, issuanceRecordId: Id, productMark: Mark, packagingMark: Mark, containerMark: Mark.nullable() })),
  record('notice', z.strictObject({ kind: z.literal('packaging_revision'), modelCode: Text, batchCodes: z.array(Text).min(1).max(32), effectiveFrom: Utc, effectiveUntil: Utc, explanation: Text })),
  record('custody', z.strictObject({ itemId: Id, fromActorId: Id, toActorId: Id, occurredAt: Utc, kind: z.enum(['dispatch', 'receipt', 'observation']) })),
  record('custody_snapshot', z.strictObject({ itemId: Id, holderReference: Text, sourceRecordIds: z.array(Id).min(1).max(32), gapRecordIds: z.array(Id).max(32), asOf: Utc })),
  record('gap', z.strictObject({ itemId: Id, from: Utc, until: Utc, reason: Text, resolved: z.literal(false) })),
  record('correction', z.strictObject({ targetRecordId: Id, targetSha256: Hash, replacementRecordId: Id, reason: Text })),
  record('audit', z.strictObject({ targetRecordId: Id, action: z.enum(['review', 'correction_proposed']), reason: Text })),
]).superRefine((r, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(r.subjectIds).size !== r.subjectIds.length || new Set(r.previousIds).size !== r.previousIds.length) invalid('Duplicate record reference');
  if (r.previousIds.includes(r.id)) invalid('Self reference');
  if (Date.parse(r.receivedAt) < Date.parse(r.issuedAt)) invalid('Receipt precedes issue');
  if (r.type === 'issuer_binding' && Date.parse(r.data.validUntil) <= Date.parse(r.data.validFrom)) invalid('Invalid binding interval');
  if (r.type === 'notice' && Date.parse(r.data.effectiveUntil) <= Date.parse(r.data.effectiveFrom)) invalid('Invalid notice interval');
  if (r.type === 'gap' && Date.parse(r.data.until) <= Date.parse(r.data.from)) invalid('Invalid gap interval');
  if (['issuance', 'mapping', 'custody', 'custody_snapshot', 'gap'].includes(r.type) && r.scope !== 'unit') invalid('Unit evidence requires unit scope');
  if (r.type === 'issuance' && (r.data.unitMark.scope !== 'unit' || r.data.unitMark.namespace !== r.namespace || !r.subjectIds.includes(r.data.itemId))) invalid('Inconsistent unit issuance');
  if (r.type === 'mapping' && (r.data.productMark.scope !== 'unit' || r.data.packagingMark.scope !== 'unit' || r.data.productMark.namespace !== r.namespace || r.data.packagingMark.namespace !== r.namespace || r.data.productMark.value === r.data.packagingMark.value || !r.subjectIds.includes(r.data.itemId) || (r.data.containerMark !== null && (r.data.containerMark.scope !== 'container' || r.data.containerMark.namespace !== r.namespace)))) invalid('Inconsistent marking relationship');
});
export type EvidenceRecord = z.infer<typeof EvidenceRecord>;
export type RecordKind = EvidenceRecord['type'];
export const StoredRecord = z.strictObject({ id: Id, jws: SignedPackManifest, sha256: Hash });
export type StoredRecord = z.infer<typeof StoredRecord>;
export const RootPin = z.strictObject({ issuerId: Id, keyId: Id, namespace: Namespace, publicKey: PublicJwk, demo: z.literal(true), label: Text });
export type RootPin = z.infer<typeof RootPin>;
export const Actor = z.strictObject({ id: Id, kind: z.enum(['issuer', 'shop', 'reviewer']), label: Text, demo: z.literal(true) });
export const ProductProjection = z.strictObject({ itemId: Id, namespace: Namespace, unitMark: Text, modelCode: Text, batchCode: Text, issuanceRecordId: Id, mappingRecordId: Id, ownerRecordId: Id, ownerVersion: z.number().int().positive(), registeredOwnerId: Id });
export const Dataset = z.strictObject({ schemaVersion: z.literal(1), demo: z.literal(true), label: z.literal('Fictional PackProof demonstration data'), actors: z.array(Actor).max(32), records: z.array(StoredRecord).max(256), products: z.array(ProductProjection).max(32) });
export type Dataset = z.infer<typeof Dataset>;
export const ProductInput = z.strictObject({ namespace: Namespace, productMark: Text, packagingMark: Text.nullable() });
export const SellerInput = z.strictObject({ itemId: Id, sellerId: Id });
export const ItemInput = z.strictObject({ itemId: Id });
export const ProductData = z.strictObject({ demo: z.literal(true), label: Text, itemId: Id, scope: Scope, modelCode: Text, batchCode: Text, issuer: Actor, issuerBindingId: Id, mappingStatus: z.enum(['matched', 'mismatched', 'not_checked']), physicalBinding: z.literal('unresolved'), recordIds: z.array(Id).max(32) });
export const SellerData = z.strictObject({ demo: z.literal(true), itemId: Id, sellerId: Id, registeredSeller: z.boolean(), authorized: z.boolean(), ownerVersion: z.number().int().positive(), authorityRecordIds: z.array(Id).max(32), asOf: Utc });
export const NoticeData = z.strictObject({ demo: z.literal(true), notices: z.array(z.strictObject({ recordId: Id, kind: z.literal('packaging_revision'), explanation: Text, effectiveFrom: Utc, effectiveUntil: Utc })).max(32), coverage: z.literal('demo_dataset_only'), directoryVersion: z.number().int().positive(), retrievedAt: Utc });
export const HistoryData = z.strictObject({ demo: z.literal(true), events: z.array(z.strictObject({ recordId: Id, kind: z.enum(['dispatch', 'receipt', 'observation']), occurredAt: Utc })).max(32), gaps: z.array(z.strictObject({ recordId: Id, from: Utc, until: Utc, reason: Text, resolved: z.literal(false) })).max(32), conflicts: z.array(Id).max(32), snapshot: z.strictObject({ recordId: Id, holderReference: Text, asOf: Utc }).nullable() });
export const ProductResult = gateResult(ProductData);
export const SellerResult = gateResult(SellerData);
export const NoticeResult = gateResult(NoticeData);
export const HistoryResult = gateResult(HistoryData);
