import { LookupArgs, RegistryResult, ProbeAnswer } from '../../src/contracts/p0.js';

// Fictional read-only demo registry. No claim of issuer signatures, ownership, or P1 seeding.
const fixtures = [
  { productMark: 'FP-1001', packagingMark: 'PK-2001', itemId: '10000000-0000-4000-8000-000000000001', recordIds: ['20000000-0000-4000-8000-000000000001'] },
  { productMark: 'FP-1002', packagingMark: 'PK-2002', itemId: '10000000-0000-4000-8000-000000000002', recordIds: ['20000000-0000-4000-8000-000000000002'] },
];
export function lookupFixture(input: unknown) {
  const args = LookupArgs.parse(input);
  const item = fixtures.find(x => x.productMark === args.productMark);
  return RegistryResult.parse({ demo: true, datasetVersion: 'p0-fixtures-1', productMark: args.productMark,
    itemId: item?.itemId ?? null, packagingMark: item?.packagingMark ?? null,
    recordIds: item?.recordIds ?? [], status: item ? 'found' : 'unknown' });
}
export function validateAnswer(raw: unknown, result: ReturnType<typeof lookupFixture>) {
  const answer = ProbeAnswer.parse(raw);
  if (answer.status !== result.status || answer.itemId !== result.itemId || answer.packagingMark !== result.packagingMark ||
      JSON.stringify(answer.recordIds) !== JSON.stringify(result.recordIds)) throw new Error('Unsupported provider claim');
  return answer;
}
