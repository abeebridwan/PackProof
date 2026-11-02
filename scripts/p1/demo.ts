import { generateKeyPair, exportJWK, importJWK, type JWK } from 'jose';
import { EvidenceRecord, Dataset, RootPin, type RecordKind } from '../../src/contracts/evidence.js';
import { signRecord } from '../../src/domain/trust/evidence.js';
import { validateDataset } from '../../src/server/evidence/services.js';

export const NS = 'packproof-demo';
export const id = (n: number) => `30000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const DEMO = { root: id(1), issuer: id(2), other: id(3), shopA: id(4), shopB: id(5), holderOne: id(6), rootKey: id(11), issuerKey: id(12), otherKey: id(13), revokedKey: id(14), item1: '10000000-0000-4000-8000-000000000001', item2: '10000000-0000-4000-8000-000000000002', gapItem: id(103) };
export type DemoKeys = Record<'root' | 'issuer' | 'other' | 'revoked', JWK>;
export async function newDemoKeys(): Promise<DemoKeys> {
  const pairs = await Promise.all(['root', 'issuer', 'other', 'revoked'].map(async name => [name, await exportJWK((await generateKeyPair('ES256', { extractable: true })).privateKey)]));
  return Object.fromEntries(pairs);
}
const publicPart = (key: JWK) => ({ kty: 'EC' as const, crv: 'P-256' as const, x: key.x!, y: key.y! });
export const DEMO_AT = '2026-11-01T12:00:00.000Z';
export async function createDemo(keys: DemoKeys) {
  const privateKeys = Object.fromEntries(await Promise.all(Object.entries(keys).map(async ([name,key]) => [name, await importJWK(key, 'ES256') as CryptoKey])));
  const root = RootPin.parse({ issuerId: DEMO.root, keyId: DEMO.rootKey, namespace: NS, publicKey: publicPart(keys.root), demo: true, label: 'Fictional PackProof offline demo root' });
  const records: Dataset['records'] = [];
  const payloads = new Map<string, EvidenceRecord>();
  const make = async (n: number, type: RecordKind, data: unknown, options: { signer?: keyof DemoKeys; subjectIds?: string[]; scope?: 'model'|'batch'|'unit'|'container'; previousIds?: string[]; revision?: number; append?: boolean } = {}) => {
    const signer = options.signer ?? 'issuer';
    const issuerId = signer === 'root' ? DEMO.root : signer === 'other' ? DEMO.other : DEMO.issuer;
    const keyId = signer === 'root' ? DEMO.rootKey : signer === 'other' ? DEMO.otherKey : signer === 'revoked' ? DEMO.revokedKey : DEMO.issuerKey;
    const previousIds = options.previousIds ?? [];
    const record = EvidenceRecord.parse({ schemaVersion: 1, id: id(n), type, namespace: NS, subjectIds: options.subjectIds ?? [issuerId], scope: options.scope ?? 'unit', issuerId, keyId, issuedAt: DEMO_AT, receivedAt: DEMO_AT, revision: options.revision ?? 1, previousIds, evidenceHashes: previousIds.map(prev => { const r = records.find(r => r.id === prev); if(!r) throw new Error('Missing demo dependency'); return r.sha256; }), visibility: 'public', demo: true, data });
    const stored = await signRecord(record, privateKeys[signer]!);
    if (options.append !== false) { records.push(stored); payloads.set(record.id, record); }
    return stored;
  };
  let directoryHash: string | null = null;
  let version = 0;
  const stateHashes = new Map<string,string>();
  const binding = async (n: number, signer: 'issuer'|'other'|'revoked', types: RecordKind[], revoke = false, correction = false) => {
    const keyId = signer === 'issuer' ? DEMO.issuerKey : signer === 'other' ? DEMO.otherKey : DEMO.revokedKey;
    const issuerId = signer === 'other' ? DEMO.other : DEMO.issuer;
    const stored = await make(n, 'issuer_binding', { issuerId, keyId, publicKey: publicPart(keys[signer]), role: 'issuer', namespaces: [NS], recordTypes: types, validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z', revokedAt: revoke ? DEMO_AT : null, label: signer === 'other' ? 'Fictional alternate issuer' : 'Fictional Formula Producer' }, { signer: 'root', scope: 'model' });
    const previousChange = records.filter(r => payloads.get(r.id)?.type === 'directory_change').at(-1);
    const change = await make(n+1, 'directory_change', { version: ++version, previousDirectoryHash: directoryHash, bindingRecordId: stored.id, bindingSha256: stored.sha256, administratorId: DEMO.root, reason: revoke ? 'Fictional demo key revocation' : correction ? 'Fictional signed directory correction' : 'Fictional scoped issuer grant', operation: revoke ? 'revoke' : correction ? 'correct' : 'grant', priorStateHash: stateHashes.get(keyId) ?? null, newStateHash: stored.sha256 }, { signer: 'root', scope: 'model', previousIds: [stored.id, ...(previousChange ? [previousChange.id] : [])] });
    directoryHash = change.sha256; stateHashes.set(keyId,stored.sha256);
  };
  const types: RecordKind[] = ['issuance','mapping','notice','custody','custody_snapshot','gap','correction','audit'];
  await binding(201,'issuer',types);
  await binding(203,'other',['correction','audit']);
  await binding(205,'revoked',types);
  await binding(207,'revoked',types,true);
  await binding(209,'issuer',types,false,true);
  const mark = (value: string, scope: 'unit'|'container', location: string) => ({ namespace: NS, value, format: 'text', scope, physicalLocation: location });
  const products: Dataset['products'] = [];
  for (const [n,itemId,unit,pack,holder,batch] of [
    [1,DEMO.item1,'FP-1001','PK-2001',DEMO.holderOne,'BATCH-01'],
    [2,DEMO.item2,'FP-1002','PK-2002',DEMO.shopB,'BATCH-02'],
    [3,DEMO.gapItem,'FP-GAP-01','PK-GAP-01',DEMO.shopB,'BATCH-GAP'],
  ] as const) {
    const issuance = await make(300+n*10,'issuance',{ itemId, modelCode:'DEMO-FORMULA', batchCode:batch, unitMark:mark(unit,'unit','immediate vessel'), registeredHolderId:holder, ownerVersion:1, lifecycle:'issued', label:'Fictional PackProof demonstration unit; no safety or legal-title claim' }, {subjectIds:[itemId]});
    const mapping = await make(301+n*10,'mapping',{itemId,issuanceRecordId:issuance.id,productMark:mark(unit,'unit','immediate vessel'),packagingMark:mark(pack,'unit','outer wrapper'),containerMark:mark(n===3?'CT-GAP-01':'CT-9001','container','shipping carton')},{subjectIds:[itemId],previousIds:[issuance.id]});
    const custody = await make(302+n*10,'custody',{itemId,fromActorId:DEMO.issuer,toActorId:holder,occurredAt:DEMO_AT,kind:'receipt'},{subjectIds:[itemId],previousIds:[issuance.id]});
    const gap = n===3 ? await make(303+n*10,'gap',{itemId,from:'2026-10-01T00:00:00.000Z',until:'2026-10-15T00:00:00.000Z',reason:'Fictional missing earlier custody interval; present observation cannot resolve it',resolved:false},{subjectIds:[itemId]}) : null;
    await make(304+n*10,'custody_snapshot',{itemId,holderReference:n===1?'demo-registered-holder-one':'demo-shop-b',sourceRecordIds:[custody.id],gapRecordIds:gap?[gap.id]:[],asOf:DEMO_AT},{subjectIds:[itemId],previousIds:[custody.id,...(gap?[gap.id]:[])]});
    products.push({itemId,namespace:NS,unitMark:unit,modelCode:'DEMO-FORMULA',batchCode:batch,issuanceRecordId:issuance.id,mappingRecordId:mapping.id,ownerRecordId:issuance.id,ownerVersion:1,registeredOwnerId:holder});
  }
  const noticeData = { kind:'packaging_revision',modelCode:'DEMO-FORMULA',batchCodes:['BATCH-02'],effectiveFrom:'2026-10-01T00:00:00.000Z',effectiveUntil:'2027-01-01T00:00:00.000Z',explanation:'Fictional packaging revision: wrapper artwork changed for BATCH-02.' };
  const originalNotice = await make(401,'notice',noticeData,{scope:'batch',subjectIds:[DEMO.item2]});
  const replacementNotice = await make(402,'notice',{...noticeData,explanation:'Fictional packaging revision: the visible wrapper artwork changed for BATCH-02; this explains the demo change, not product safety.'},{scope:'batch',subjectIds:[DEMO.item2],previousIds:[originalNotice.id],revision:2});
  await make(403,'correction',{targetRecordId:originalNotice.id,targetSha256:originalNotice.sha256,replacementRecordId:replacementNotice.id,reason:'Fictional issuer clarifies its own earlier notice'},{scope:'batch',subjectIds:[DEMO.item2],previousIds:[originalNotice.id,replacementNotice.id]});
  await make(404,'audit',{targetRecordId:id(403),action:'review',reason:'Fictional correction retained with original signed history'},{scope:'batch',subjectIds:[DEMO.item2],previousIds:[id(403)]});
  const unauthorizedCorrection = await make(901,'correction',{targetRecordId:originalNotice.id,targetSha256:originalNotice.sha256,replacementRecordId:replacementNotice.id,reason:'Fictional unauthorized correction attempt'},{signer:'other',scope:'batch',subjectIds:[DEMO.item2],previousIds:[originalNotice.id,replacementNotice.id],append:false});
  const revokedRecord = await make(902,'issuance',payloads.get(products[0]!.issuanceRecordId)!.data,{signer:'revoked',subjectIds:[DEMO.item1],append:false});
  const actors = [
    {id:DEMO.root,kind:'issuer',label:'Fictional offline root'}, {id:DEMO.issuer,kind:'issuer',label:'Fictional Formula Producer'}, {id:DEMO.other,kind:'issuer',label:'Fictional alternate issuer'},
    {id:DEMO.shopA,kind:'shop',label:'Fictional Shop A'}, {id:DEMO.shopB,kind:'shop',label:'Fictional Shop B'}, {id:DEMO.holderOne,kind:'shop',label:'Fictional registered holder one'},
  ].map(a=>({...a,demo:true}));
  const dataset = Dataset.parse({schemaVersion:1,demo:true,label:'Fictional PackProof demonstration data',actors,records,products});
  await validateDataset(dataset,root,DEMO_AT);
  return {root,dataset,negativeCases:{unauthorizedCorrection,revokedRecord}};
}
