import { describe, it, expect } from 'vitest';
import { checkTransport, FrameBatch, scanMetrics, type ScanObservation } from '../../scripts/spikes/phone-measurements.js';
import { utf8 } from '../../src/domain/verification/p0-crypto.js';

const createdAt = '2026-11-01T12:00:00.000Z';
const batch: FrameBatch = { batchId: '10000000-0000-4000-8000-000000000001', createdAt, expiresAt: '2026-11-01T12:02:00.000Z', demo: true,
  frames: Array.from({ length: 128 }, (_, i) => `pp0_${i.toString().padStart(22, '0')}`) };
const observations = (sequence: number[]) => sequence.map((i, n): ScanObservation => ({ handle: batch.frames[i]!, atMs: n * 50, observedAt: '2026-11-01T12:00:01.000Z' }));
describe('QR measurements are distinct from authorization', () => {
  it('counts duplicate observations without crediting them as extra sequence frames', () => {
    const m = scanMetrics(observations([0, 0, 1, 1, 2]), [batch], 10, 1000);
    expect(m).toMatchObject({ successes: 5, distinct: 3, duplicates: 2, matched: 3, longestConsecutiveDistinctFrames: 3, threeConsecutiveObserved: true, attemptsPerSecond: 10 });
  });
  it('one screenshot never creates three consecutive frames', () => {
    expect(scanMetrics(observations([2, 2, 2, 2]), [batch], 4, 1000)).toMatchObject({ longestConsecutiveDistinctFrames: 1, threeConsecutiveObserved: false, duplicates: 3 });
  });
  it('gaps, reversed, unknown and expired frames cannot inflate sequence reliability', () => {
    expect(scanMetrics(observations([0, 2, 1]), [batch], 3, 0)).toMatchObject({ longestConsecutiveDistinctFrames: 1, outOfOrder: 1, attemptsPerSecond: 0 });
    const expired = observations([0, 1, 2]).map(s => ({ ...s, observedAt: batch.expiresAt }));
    expect(scanMetrics(expired, [batch], 3, 1000)).toMatchObject({ expired: 3, matched: 0, threeConsecutiveObserved: false });
    expect(scanMetrics(observations([0, 1]), [], 2, 1000).unknown).toBe(2);
  });
  it('rejects duplicate or malformed display batches', () => {
    expect(FrameBatch.safeParse(batch).success).toBe(true);
    expect(FrameBatch.safeParse({ ...batch, frames: Array(128).fill(batch.frames[0]) }).success).toBe(false);
    expect(FrameBatch.safeParse({ ...batch, frames: ['secret-key'] }).success).toBe(false);
  });
});
describe('transport comparison', () => {
  const fixture = { schemaVersion: 1, demo: true, kind: 'transport-feasibility-only', nonce: 'a'.repeat(32), note: 'Not an OfflineProof pack' };
  it('without external fingerprint, valid schema is explicitly uncompared', async () => {
    const result = await checkTransport(utf8(JSON.stringify(fixture)));
    expect(result.status).toBe('imported-uncompared');
    expect(await checkTransport(utf8(JSON.stringify(fixture)), result.fingerprint)).toMatchObject({ status: 'matched-export-fingerprint' });
  });
  it('rejects altered but schema-valid JSON and byte-only changes against exported bytes', async () => {
    const bytes = utf8(JSON.stringify(fixture)), expected = (await checkTransport(bytes)).fingerprint;
    await expect(checkTransport(utf8(JSON.stringify({ ...fixture, nonce: 'b'.repeat(32) })), expected)).rejects.toThrow('TransportFingerprintMismatch');
    await expect(checkTransport(utf8(JSON.stringify(fixture) + '\n'), expected)).rejects.toThrow('TransportFingerprintMismatch');
  });
  it('rejects malformed, oversized and wrong-kind imports', async () => {
    await expect(checkTransport(utf8('{broken'))).rejects.toThrow();
    await expect(checkTransport(new Uint8Array(4097))).rejects.toThrow('TransportFixtureTooLarge');
    await expect(checkTransport(utf8(JSON.stringify({ ...fixture, kind: 'offline-proof' })))).rejects.toThrow();
  });
});
