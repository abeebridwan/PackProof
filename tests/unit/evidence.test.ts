import { beforeAll, describe, expect, it } from 'vitest';
import { CompactSign, importJWK } from 'jose';
import { createDemo, newDemoKeys, DEMO, DEMO_AT, NS, id, type DemoKeys } from '../../scripts/p1/demo.js';
import { signRecord, verifyRecordSet, verifyEvidence, EVIDENCE_JWS_TYPE } from '../../src/domain/trust/evidence.js';
import { sha256, utf8 } from '../../src/domain/verification/p0-crypto.js';
import { Dataset, EvidenceRecord, ProductInput } from '../../src/contracts/evidence.js';
import { createEvidenceServices, validateDataset, H2_INPUTS } from '../../src/server/evidence/services.js';
let keys: DemoKeys;
let material: Awaited<ReturnType<typeof createDemo>>;
let services: ReturnType<typeof createEvidenceServices>;
beforeAll(async()=>{
 keys=await newDemoKeys(); material=await createDemo(keys);
 services=createEvidenceServices({load:async()=>structuredClone(material.dataset)},material.root,()=>DEMO_AT);
});
const parsed = (stored: {jws:string}) => JSON.parse(Buffer.from(stored.jws.split('.')[1]!, 'base64url').toString());
const issued = () => material.dataset.records.find(r=>r.id===material.dataset.products[0]!.issuanceRecordId)!;
async function resign(record: unknown, signer: 'issuer'|'other'='issuer') { return signRecord(record,await importJWK(keys[signer],'ES256') as CryptoKey); }

describe('P1A signed evidence and scoped trust',()=>{
 it('verifies actual signed issuance, mapping and versioned root audit chain',async()=>{
  const s=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  expect(s.directory.version).toBe(5); expect(s.directory.auditIds).toHaveLength(5);
  expect(s.verified.get(issued().id)?.payloadBytes).toEqual(utf8(JSON.stringify(parsed(issued()))));
 });
 it('rejects an unknown root instead of adopting token keys',async()=>{
  const other=await createDemo(await newDemoKeys());
  await expect(verifyRecordSet(material.dataset.records,other.root,DEMO_AT)).rejects.toThrow();
 });
 it('rejects token-supplied JWK headers even on an otherwise valid signature',async()=>{
  const jws=await new CompactSign(utf8(JSON.stringify(parsed(issued())))).setProtectedHeader({alg:'ES256',typ:EVIDENCE_JWS_TYPE,kid:DEMO.issuerKey,jwk:material.root.publicKey}).sign(await importJWK(keys.issuer,'ES256'));
  const token={id:issued().id,jws,sha256:await sha256(utf8(jws))};
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence(token,directory,NS,'issuance',DEMO_AT)).rejects.toThrow('header');
 });
 it('rejects payload tampering even if the transport hash is recomputed',async()=>{
  const token=structuredClone(issued()); const parts=token.jws.split('.');
  const p=parsed(token); p.data.registeredHolderId=DEMO.shopA;
  parts[1]=Buffer.from(JSON.stringify(p)).toString('base64url'); token.jws=parts.join('.');token.sha256=await sha256(utf8(token.jws));
  await expect(verifyRecordSet(material.dataset.records.map(r=>r.id===token.id?token:r),material.root,DEMO_AT)).rejects.toThrow();
 });
 it('rejects a broken exact-JWS hash',async()=>{
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence({...issued(),sha256:'0'.repeat(64)},directory,NS,'issuance',DEMO_AT)).rejects.toThrow('hash');
 });
 it('rejects a revoked issuer key',async()=>{
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence(material.negativeCases.revokedRecord,directory,NS,'issuance',DEMO_AT)).rejects.toThrow('revoked');
 });
 it('rejects issuance from a reviewer role even if a type list is overbroad',async()=>{
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  const grants=new Map(directory.grants);const grant=structuredClone(grants.get(DEMO.issuerKey)!);grant.data.role='reviewer';grants.set(DEMO.issuerKey,grant);
  await expect(verifyEvidence(issued(),{...directory,grants},NS,'issuance',DEMO_AT)).rejects.toThrow('unauthorized');
 });
 it('rejects a scoped issuer attempting an unauthorized record type',async()=>{
  const p=parsed(issued());p.keyId=DEMO.otherKey;p.issuerId=DEMO.other;
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence(await resign(p,'other'),directory,NS,'issuance',DEMO_AT)).rejects.toThrow('unauthorized');
 });
 it('rejects an unauthorized correction even if that issuer can sign corrections',async()=>{
  await expect(verifyRecordSet([...material.dataset.records,material.negativeCases.unauthorizedCorrection],material.root,DEMO_AT)).rejects.toThrow('correction');
 });
 it('rejects a legitimately signed wrong namespace',async()=>{
  const p=parsed(issued());p.namespace='other-demo';p.data.unitMark.namespace='other-demo';
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence(await resign(p),directory,NS,'issuance',DEMO_AT)).rejects.toThrow('mismatch');
 });
 it('rejects the wrong expected type',async()=>{
  const {directory}=await verifyRecordSet(material.dataset.records,material.root,DEMO_AT);
  await expect(verifyEvidence(issued(),directory,NS,'notice',DEMO_AT)).rejects.toThrow('mismatch');
 });
 it('rejects expired authority and missing directory audit/dependencies',async()=>{
  await expect(verifyRecordSet(material.dataset.records,material.root,'2028-01-01T00:00:00.000Z')).rejects.toThrow();
  await expect(verifyRecordSet(material.dataset.records.filter(r=>r.id!==id(204)),material.root,DEMO_AT)).rejects.toThrow();
 });
 it('uses strict concrete schemas and preserves leading zeros without manufacturing a unit scope',()=>{
  expect(ProductInput.parse({namespace:NS,productMark:'000123',packagingMark:null}).productMark).toBe('000123');
  expect(()=>ProductInput.parse({namespace:NS,productMark:'000123',packagingMark:null,verified:true})).toThrow();
  const p=parsed(issued());p.data.unitMark.scope='batch';expect(()=>EvidenceRecord.parse(p)).toThrow();
  p.data.unitMark.scope='unit';p.data.safety='approved';expect(()=>EvidenceRecord.parse(p)).toThrow();
 });
});

describe('P1A authoritative read services',()=>{
 it('returns a signed mark match without claiming physical association or authenticity',async()=>{
  const r=await services.lookupProduct({namespace:NS,productMark:'FP-1002',packagingMark:'PK-2002'});
  expect(r.status).toBe('supported');expect(r.data).toMatchObject({demo:true,itemId:DEMO.item2,mappingStatus:'matched',physicalBinding:'unresolved'});
  expect(r.evidence_refs).toContain(material.dataset.products[1]!.mappingRecordId);
  expect(JSON.stringify(r)).not.toContain('authenticity');
 });
 it('blocks mismatched packaging and keeps product-only checks incomplete',async()=>{
  expect((await services.lookupProduct({namespace:NS,productMark:'FP-1001',packagingMark:'PK-2002'})).status).toBe('blocked');
  expect((await services.lookupProduct({namespace:NS,productMark:'FP-1001',packagingMark:null})).data?.mappingStatus).toBe('not_checked');
 });
 it('does not turn a carton, model or batch mark into a unique unit',async()=>{
  for(const [productMark,scope] of [['CT-9001','container'],['DEMO-FORMULA','model'],['BATCH-02','batch']]) { const r=await services.lookupProduct({namespace:NS,productMark,packagingMark:null}); expect(r.status).toBe('needs_evidence');expect(r.scope).toBe(scope);expect(r.data).toBeNull(); }
  const mappings=material.dataset.records.map(parsed).filter(r=>r.type==='mapping' && r.data.containerMark.value==='CT-9001');
  expect(mappings).toHaveLength(2);expect(new Set(mappings.map(r=>r.data.itemId)).size).toBe(2);
 });
 it('blocks Shop A for FP-1001 and supports Shop B for FP-1002',async()=>{
  const a=await services.lookupSeller({itemId:DEMO.item1,sellerId:DEMO.shopA});
  expect(a.status).toBe('blocked');expect(a.reason).toBe('Transfer blocked: seller is not authorized for this registered item.');
  expect((await services.lookupSeller({itemId:DEMO.item2,sellerId:DEMO.shopB})).data?.authorized).toBe(true);
 });
 it('rejects a changed owner projection and conflicting item identity',async()=>{
  const data=structuredClone(material.dataset);data.products[1]!.registeredOwnerId=DEMO.shopA;
  await expect(validateDataset(data,material.root,DEMO_AT)).rejects.toThrow('projection');
  data.products[1]!.registeredOwnerId=DEMO.shopB;data.products[1]!.unitMark='FP-1001';
  await expect(validateDataset(data,material.root,DEMO_AT)).rejects.toThrow('Duplicate');
 });
 it('returns only applicable latest corrected packaging notices with source IDs',async()=>{
  const b=await services.getProductNotices({itemId:DEMO.item2});
  expect(b.data?.notices).toHaveLength(1);expect(b.data?.notices[0]?.recordId).toBe(id(402));
  expect(b.data?.notices[0]?.explanation).toContain('wrapper');
  expect((await services.getProductNotices({itemId:DEMO.item1})).data?.notices).toHaveLength(0);
  const s=createEvidenceServices({load:async()=>material.dataset},material.root,()=> '2026-11-03T00:00:00.000Z');
  expect((await s.getProductNotices({itemId:DEMO.gapItem})).data?.notices).toHaveLength(0);
 });
 it('does not apply future-dated or expired signed notices',async()=>{
  const extra=[];
  for(const [n,effectiveFrom,effectiveUntil] of [[980,'2026-12-01T00:00:00.000Z','2027-01-01T00:00:00.000Z'],[981,'2026-10-01T00:00:00.000Z','2026-10-31T00:00:00.000Z']] as const){
   const payload=parsed(material.dataset.records.find(r=>r.id===id(402))!);
   Object.assign(payload,{id:id(n),previousIds:[],evidenceHashes:[],revision:1});
   Object.assign(payload.data,{effectiveFrom,effectiveUntil});extra.push(await resign(payload));
  }
  const data=structuredClone(material.dataset);data.records.push(...extra);
  const s=createEvidenceServices({load:async()=>data},material.root,()=>DEMO_AT);
  expect((await s.getProductNotices({itemId:DEMO.item2})).data?.notices.map(n=>n.recordId)).toEqual([id(402)]);
 });
 it('rejects an issuer-signed snapshot that hides an existing custody gap',async()=>{
  const data=structuredClone(material.dataset);
  const index=data.records.findIndex(r=>{const p=parsed(r);return p.type==='custody_snapshot' && p.data.itemId===DEMO.gapItem;});
  const payload=parsed(data.records[index]!);const gapId=payload.data.gapRecordIds[0];
  const remove=payload.previousIds.indexOf(gapId);payload.previousIds.splice(remove,1);payload.evidenceHashes.splice(remove,1);payload.data.gapRecordIds=[];
  data.records[index]=await resign(payload);
  await expect(validateDataset(data,material.root,DEMO_AT)).rejects.toThrow('hides history');
 });
 it('retains a separate custody gap despite a present snapshot',async()=>{
  const h=await services.getCustodyHistory({itemId:DEMO.gapItem});
  expect(h.status).toBe('needs_evidence');expect(h.data?.gaps[0]?.resolved).toBe(false);expect(h.data?.snapshot).not.toBeNull();
 });
 it('fails closed inside handlers if stored signatures are altered',async()=>{
  const data=structuredClone(material.dataset);data.records[0]!.sha256='0'.repeat(64);
  const s=createEvidenceServices({load:async()=>data},material.root,()=>DEMO_AT);
  expect((await s.lookupProduct({namespace:NS,productMark:'FP-1001',packagingMark:'PK-2001'})).status).toBe('blocked');
  expect((await s.lookupSeller({itemId:DEMO.item2,sellerId:DEMO.shopB})).status).toBe('blocked');
  expect((await s.getProductNotices({itemId:DEMO.item2})).status).toBe('blocked');
  expect((await s.getCustodyHistory({itemId:DEMO.item2})).status).toBe('blocked');
 });
 it('omits private fields from every public result',async()=>{
  const results=[await services.lookupProduct({namespace:NS,productMark:'FP-1002',packagingMark:'PK-2002'}),await services.lookupSeller({itemId:DEMO.item2,sellerId:DEMO.shopB}),await services.getProductNotices({itemId:DEMO.item2}),await services.getCustodyHistory({itemId:DEMO.gapItem})];
  for(const r of results)expect(JSON.stringify(r)).not.toMatch(/registeredOwnerId|owner_user_id|buyer|deviceKey|privateMedia|sensitiveLocation|SUPABASE|PRIVATE KEY/);
 });
 it('keeps exactly the six H2 names as strict interfaces without a model loop',()=>{
  expect(Object.keys(H2_INPUTS)).toEqual(['lookup_product','lookup_seller','get_product_notices','get_custody_history','inspect_product_image','request_additional_evidence']);
  expect(()=>H2_INPUTS.inspect_product_image.parse({investigationId:DEMO.item1,captureId:DEMO.item2,question:'product_mark',url:'https://evil.example'})).toThrow();
 });
});
