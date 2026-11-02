import { z } from 'zod';
import { gateResult, Id, Text } from '../../contracts/p0.js';
import { Dataset, RootPin, ProductInput, SellerInput, ItemInput, ProductResult, SellerResult, NoticeResult, HistoryResult, type EvidenceRecord } from '../../contracts/evidence.js';
import { verifyRecordSet } from '../../domain/trust/evidence.js';

export interface EvidenceRepository { load(): Promise<Dataset> }
export const POLICY_VERSION = 'p1a-demo-evidence-1';
const base = (asOf: string, reason: string, refs: string[] = [], status: 'supported' | 'blocked' | 'needs_evidence' = 'supported') => ({ status, reason, evidence_refs: [...new Set(refs)], scope: 'unit' as const, asOf, policyVersion: POLICY_VERSION, next_actions: status === 'blocked' ? ['Review signed source records'] : ['Inspect the physical item separately'] });
export async function validateDataset(input: unknown, pin: RootPin, at: string) {
  const data = Dataset.parse(input);
  const { directory, verified } = await verifyRecordSet(data.records, pin, at);
  const actors = new Map(data.actors.map(a => [a.id, a]));
  if (actors.size !== data.actors.length || new Set(data.products.map(p => p.itemId)).size !== data.products.length || new Set(data.products.map(p => p.namespace + ':' + p.unitMark)).size !== data.products.length) throw new Error('Duplicate actor/unit projection');
  const records = [...verified.values()].map(v => v.record);
  const packaging = records.flatMap(r => r.type === 'mapping' ? [r.namespace + ':' + r.data.packagingMark.value] : []);
  if (new Set(packaging).size !== packaging.length) throw new Error('Ambiguous unit packaging mark');
  if (records.some(r => r.type === 'correction' && verified.get(r.data.targetRecordId)?.record.type !== 'notice')) throw new Error('P1A supports notice corrections only; other projection corrections require a dedicated handler');
  const get = <K extends EvidenceRecord['type']>(id: string, type: K) => {
    const r = verified.get(id)?.record;
    if (!r || r.type !== type) throw new Error('Missing signed projection source');
    return r as Extract<EvidenceRecord, { type: K }>;
  };
  for (const p of data.products) {
    const issued = get(p.issuanceRecordId, 'issuance');
    const mapping = get(p.mappingRecordId, 'mapping');
    // P1A supports initial registered ownership only. P2 must add a separately verified commit source.
    if (issued.visibility !== 'public' || mapping.visibility !== 'public' || p.namespace !== pin.namespace || issued.namespace !== p.namespace || mapping.namespace !== p.namespace || issued.data.itemId !== p.itemId || issued.data.unitMark.value !== p.unitMark || issued.data.modelCode !== p.modelCode || issued.data.batchCode !== p.batchCode || mapping.data.itemId !== p.itemId || mapping.data.issuanceRecordId !== issued.id || !mapping.previousIds.includes(issued.id) || mapping.data.productMark.value !== p.unitMark || mapping.issuerId !== issued.issuerId || p.ownerRecordId !== issued.id || p.registeredOwnerId !== issued.data.registeredHolderId || p.ownerVersion !== issued.data.ownerVersion || !actors.has(p.registeredOwnerId) || actors.get(issued.issuerId)?.kind !== 'issuer') throw new Error('Untrusted product/owner projection');
    if (records.filter(r => r.type === 'issuance' && r.data.itemId === p.itemId).length !== 1 || records.filter(r => r.type === 'mapping' && r.data.itemId === p.itemId).length !== 1) throw new Error('Conflicting allocation or mapping');
    for (const snapshot of records.filter(r => r.type === 'custody_snapshot' && r.data.itemId === p.itemId)) {
      if (snapshot.type !== 'custody_snapshot') continue;
      const gaps = records.filter(r => r.type === 'gap' && r.data.itemId === p.itemId);
      if (gaps.some(g => !snapshot.data.gapRecordIds.includes(g.id)) || snapshot.data.sourceRecordIds.some(id => !snapshot.previousIds.includes(id)) || snapshot.data.gapRecordIds.some(id => get(id, 'gap').data.itemId !== p.itemId)) throw new Error('Snapshot hides history or source dependency');
    }
  }
  // All data references must resolve to the declared subject, not another item's signed claim.
  for (const r of records) {
    if ('itemId' in r.data && !r.subjectIds.includes(r.data.itemId)) throw new Error('Wrong signed subject');
    if (r.type === 'custody' && (!actors.has(r.data.fromActorId) || !actors.has(r.data.toActorId))) throw new Error('Unknown custody party');
  }
  return { data, directory, verified, actors, records };
}
export function createEvidenceServices(repository: EvidenceRepository, pin: RootPin, clock: () => string = () => new Date().toISOString()) {
  const loadSnapshot = async () => { const at = clock(); return { ...await validateDataset(await repository.load(), pin, at), at }; };
  return {
    async lookupProduct(input: unknown) {
      const args = ProductInput.parse(input); const at = clock();
      try {
        const s = await loadSnapshot();
        const p = s.data.products.find(p => p.namespace === args.namespace && p.unitMark === args.productMark);
        if (!p) {
          const containers=s.records.filter(r => r.type === 'mapping' && r.data.containerMark?.value === args.productMark);
          const scope=s.data.products.some(p => p.modelCode === args.productMark) ? 'model' : s.data.products.some(p => p.batchCode === args.productMark) ? 'batch' : containers.length ? 'container' : 'unit';
          return ProductResult.parse({ ...base(s.at, scope === 'unit' ? 'Unknown registered unit' : `Shared ${scope} mark does not establish a unique unit or transfer authority`, containers.map(r => r.id), 'needs_evidence'), scope, data: null });
        }
        const issuance = s.verified.get(p.issuanceRecordId)!.record;
        const mapping = s.verified.get(p.mappingRecordId)!.record;
        if (mapping.type !== 'mapping') throw new Error('Invalid mapping');
        const grant = s.directory.grants.get(issuance.keyId)!;
        const mappingStatus = args.packagingMark === null ? 'not_checked' : args.packagingMark === mapping.data.packagingMark.value ? 'matched' : 'mismatched';
        const refs = [issuance.id, mapping.id, grant.bindingId];
        return ProductResult.parse({ ...base(s.at, mappingStatus === 'matched' ? 'Signed marks are consistent; physical association remains unresolved' : mappingStatus === 'not_checked' ? 'Two-mark relationship not checked' : 'Product/packaging relationship mismatch', refs, mappingStatus === 'matched' ? 'supported' : mappingStatus === 'mismatched' ? 'blocked' : 'needs_evidence'), data: { demo: true, label: s.data.label, itemId: p.itemId, scope: issuance.scope, modelCode: p.modelCode, batchCode: p.batchCode, issuer: { ...s.actors.get(issuance.issuerId)!, label: grant.data.label }, issuerBindingId: grant.bindingId, mappingStatus, physicalBinding: 'unresolved', recordIds: refs } });
      } catch { return ProductResult.parse({ ...base(at, 'Signed evidence or issuer authority failed validation', [], 'blocked'), data: null }); }
    },
    async lookupSeller(input: unknown) {
      const args = SellerInput.parse(input); const at = clock();
      try {
        const s = await loadSnapshot(); const p = s.data.products.find(p => p.itemId === args.itemId);
        if (!p) return SellerResult.parse({ ...base(s.at, 'Unknown registered unit', [], 'needs_evidence'), data: null });
        const registeredSeller = s.actors.get(args.sellerId)?.kind === 'shop';
        const authorized = registeredSeller && p.registeredOwnerId === args.sellerId;
        const source = s.verified.get(p.ownerRecordId)!.record;
        const refs = [source.id, s.directory.grants.get(source.keyId)!.bindingId];
        return SellerResult.parse({ ...base(s.at, authorized ? 'Fictional registered seller authorized as of this record; transfer requires fresh commit checks' : 'Transfer blocked: seller is not authorized for this registered item.', refs, authorized ? 'supported' : 'blocked'), data: { demo: true, itemId: p.itemId, sellerId: args.sellerId, registeredSeller, authorized, ownerVersion: p.ownerVersion, authorityRecordIds: refs, asOf: s.at } });
      } catch { return SellerResult.parse({ ...base(at, 'Signed owner/issuer validation failed', [], 'blocked'), data: null }); }
    },
    async getProductNotices(input: unknown) {
      const args = ItemInput.parse(input); const at = clock();
      try {
        const s = await loadSnapshot(); const p = s.data.products.find(p => p.itemId === args.itemId);
        if (!p) return NoticeResult.parse({ ...base(s.at, 'Unknown registered unit', [], 'needs_evidence'), data: null });
        const issuerId = s.verified.get(p.issuanceRecordId)!.record.issuerId;
        const superseded = new Set(s.records.flatMap(r => r.type === 'correction' ? [r.data.targetRecordId] : []));
        const notices = s.records.flatMap(r => r.type === 'notice' && r.visibility === 'public' && !superseded.has(r.id) && r.issuerId === issuerId && r.data.modelCode === p.modelCode && r.data.batchCodes.includes(p.batchCode) && Date.parse(r.data.effectiveFrom) <= Date.parse(s.at) && Date.parse(s.at) < Date.parse(r.data.effectiveUntil) ? [{ recordId: r.id, kind: r.data.kind, explanation: r.data.explanation, effectiveFrom: r.data.effectiveFrom, effectiveUntil: r.data.effectiveUntil }] : []);
        return NoticeResult.parse({ ...base(s.at, 'Applicable fictional notices in this dataset; external source coverage is unknown', notices.map(n => n.recordId)), data: { demo: true, notices, coverage: 'demo_dataset_only', directoryVersion: s.directory.version, retrievedAt: s.at } });
      } catch { return NoticeResult.parse({ ...base(at, 'Signed notice/issuer validation failed', [], 'blocked'), data: null }); }
    },
    async getCustodyHistory(input: unknown) {
      const args = ItemInput.parse(input); const at = clock();
      try {
        const s = await loadSnapshot();
        if (!s.data.products.some(p => p.itemId === args.itemId)) return HistoryResult.parse({ ...base(s.at, 'Unknown registered unit', [], 'needs_evidence'), data: null });
        const records = s.records.filter(r => r.visibility === 'public' && r.subjectIds.includes(args.itemId));
        const events = records.flatMap(r => r.type === 'custody' ? [{ recordId: r.id, kind: r.data.kind, occurredAt: r.data.occurredAt }] : []);
        const gaps = records.flatMap(r => r.type === 'gap' ? [{ recordId: r.id, from: r.data.from, until: r.data.until, reason: r.data.reason, resolved: r.data.resolved }] : []);
        const snapshots = records.filter(r => r.type === 'custody_snapshot');
        if (snapshots.length > 1) throw new Error('Unresolved snapshot conflict');
        const snap = snapshots[0];
        const snapshot = snap?.type === 'custody_snapshot' ? { recordId: snap.id, holderReference: snap.data.holderReference, asOf: snap.data.asOf } : null;
        return HistoryResult.parse({ ...base(s.at, gaps.length ? 'Explicit custody history gap remains unresolved; present evidence cannot close it' : 'Permitted dated demo history; completeness outside this dataset is unknown', [...events.map(e => e.recordId), ...gaps.map(g => g.recordId), ...(snapshot ? [snapshot.recordId] : [])], gaps.length || !snapshot ? 'needs_evidence' : 'supported'), data: { demo: true, events, gaps, conflicts: [], snapshot } });
      } catch { return HistoryResult.parse({ ...base(at, 'Signed custody history validation failed', [], 'blocked'), data: null }); }
    },
  };
}
export type EvidenceServices = ReturnType<typeof createEvidenceServices>;
// Interfaces only: P1B owns capture authorization, provider execution and durable pause/resume.
export const H2_INPUTS = {
  lookup_product: ProductInput, lookup_seller: SellerInput, get_product_notices: ItemInput, get_custody_history: ItemInput,
  inspect_product_image: z.strictObject({ investigationId: z.uuid(), captureId: z.uuid(), question: z.enum(['product_mark', 'package_mark', 'printed_expiry']) }),
  request_additional_evidence: z.strictObject({ investigationId: z.uuid(), reason: z.enum(['unreadable', 'missing_package', 'association_unclear']), view: z.enum(['close_mark', 'both_marks', 'full_package']) }),
};
export const ImageEvidenceResult = gateResult(z.strictObject({ value: Text.nullable(), cropRecordIds: z.array(Id).max(16), maskRecordIds: z.array(Id).max(16), frameRecordIds: z.array(Id).max(16), provenance: z.enum(['model_reading','human_observation']), qualityBlockers: z.array(Text).max(8) }));
export const AdditionalEvidenceResult = gateResult(z.strictObject({ state: z.literal('needs_input'), investigationId: Id, evidenceRevision: z.number().int().positive(), instruction: Text }));
export interface InvestigatorFoundation {
  lookup_product: EvidenceServices['lookupProduct']; lookup_seller: EvidenceServices['lookupSeller'];
  get_product_notices: EvidenceServices['getProductNotices']; get_custody_history: EvidenceServices['getCustodyHistory'];
  inspect_product_image(input: z.infer<typeof H2_INPUTS.inspect_product_image>): Promise<z.infer<typeof ImageEvidenceResult>>;
  request_additional_evidence(input: z.infer<typeof H2_INPUTS.request_additional_evidence>): Promise<z.infer<typeof AdditionalEvidenceResult>>;
}
