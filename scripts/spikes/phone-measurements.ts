import { z } from 'zod';
import { TransportFixture } from '../../src/contracts/p0.js';
import { sha256 } from '../../src/domain/verification/p0-crypto.js';

export const FrameHandle = z.string().regex(/^pp0_[A-Za-z0-9_-]{22}$/);
export const FrameBatch = z.strictObject({
  batchId: z.uuid(), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  frames: z.array(FrameHandle).length(128), demo: z.literal(true),
}).refine(b => new Set(b.frames).size === b.frames.length, 'Duplicate display handles');
export type FrameBatch = z.infer<typeof FrameBatch>;
export type ScanObservation = { handle: string; atMs: number; observedAt: string };

// Measures sequence identity and duplicate observations only, not transfer authorization/proximity.
export function scanMetrics(scans: readonly ScanObservation[], batches: readonly FrameBatch[], attempts: number, elapsedMs: number) {
  const index = new Map(batches.flatMap(b => b.frames.map((handle, sequence) => [handle, { batch: b, sequence }] as const)));
  const seen = new Set<string>();
  let duplicates = 0, matched = 0, unknown = 0, expired = 0, outOfOrder = 0, run = 0, longest = 0;
  let last: { batchId: string; sequence: number } | undefined;
  for (const scan of scans) {
    if (seen.has(scan.handle)) { duplicates++; continue; }
    seen.add(scan.handle);
    const frame = index.get(scan.handle);
    if (!frame) { unknown++; run = 0; last = undefined; continue; }
    const observed = Date.parse(scan.observedAt);
    if (!Number.isFinite(observed) || observed < Date.parse(frame.batch.createdAt) || observed >= Date.parse(frame.batch.expiresAt)) { expired++; run = 0; last = undefined; continue; }
    matched++;
    if (last?.batchId === frame.batch.batchId && frame.sequence <= last.sequence) outOfOrder++;
    run = last?.batchId === frame.batch.batchId && frame.sequence === last.sequence + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    last = { batchId: frame.batch.batchId, sequence: frame.sequence };
  }
  return { attempts, successes: scans.length, distinct: seen.size, duplicates, matched, unknown, expired, outOfOrder,
    longestConsecutiveDistinctFrames: longest, threeConsecutiveObserved: longest >= 3,
    elapsedMs, attemptsPerSecond: elapsedMs > 0 ? attempts * 1000 / elapsedMs : 0,
    note: 'Device clock and local probe catalog only; not authenticated P2 validation' };
}

export const Fingerprint = z.strictObject({
  bytes: z.number().int().positive().max(4096), sha256: z.string().regex(/^[a-f0-9]{64}$/), nonce: z.string().regex(/^[a-f0-9]{32}$/),
});
export async function checkTransport(bytes: Uint8Array, expected?: z.infer<typeof Fingerprint>) {
  if (bytes.length > 4096) throw new Error('TransportFixtureTooLarge');
  const fixture = TransportFixture.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const fingerprint = Fingerprint.parse({ bytes: bytes.length, sha256: await sha256(bytes), nonce: fixture.nonce });
  if (expected) {
    Fingerprint.parse(expected);
    if (expected.bytes !== fingerprint.bytes || expected.sha256 !== fingerprint.sha256 || expected.nonce !== fingerprint.nonce) throw new Error('TransportFingerprintMismatch');
  }
  return { status: expected ? 'matched-export-fingerprint' as const : 'imported-uncompared' as const, fingerprint,
    note: 'Transport integrity comparison only; not an OfflineProof pack or trusted issuer record' };
}
