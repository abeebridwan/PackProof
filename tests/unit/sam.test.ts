import { expect, it } from 'vitest';
import { decodeSam, requireRegion } from '../../scripts/spikes/sam.js';
import type { ResponsesEvent } from '@meta-sam/parser';
import { readFile } from 'node:fs/promises';

async function* stream(events: ResponsesEvent[]) { yield* events; }
const lane = { item_id: 'test', output_index: 0, content_index: 0 };
it('rejects JSON-shaped SAM substitutes through the actual parser', async () => {
  const text = '{"boxes":[[0,0,10,10]],"mask":"fabricated"}';
  await expect(decodeSam(stream([
    { type: 'response.output_text.delta', ...lane, delta: text },
    { type: 'response.output_text.done', ...lane, text }, { type: 'response.completed' },
  ]), 600, 480)).rejects.toThrow();
});
it('rejects incomplete and provider-failed streams', async () => {
  await expect(decodeSam(stream([]), 600, 480)).rejects.toThrow();
  await expect(decodeSam(stream([{ type: 'response.failed', response: { error: { message: 'Test provider failure' } } }]), 600, 480)).rejects.toThrow();
});
it('rejects malformed special-token output instead of inventing regions', async () => {
  const text = '<0f>0<|box;x1=oops;y1=0;x2=1;y2=1;w=600;h=480|>';
  await expect(decodeSam(stream([
    { type: 'response.output_text.delta', ...lane, delta: text },
    { type: 'response.output_text.done', ...lane, text }, { type: 'response.completed' },
  ]), 600, 480)).rejects.toThrow();
});
it('rejects completed empty segmentation and parser diagnostics', () => {
  const empty = { media: 'image' as const, revision: 0, records: [], rawOutput: '', diagnostics: [], outcome: { status: 'completed' as const } };
  expect(() => requireRegion(empty, 600, 480)).toThrow('empty');
  expect(() => requireRegion({ ...empty, diagnostics: [{ severity: 'warning', code: 'malformed_record', message: 'Test', line: 1, raw: '' }] }, 600, 480)).toThrow('malformed');
});
it('replays actual saved SAM bytes through the current parser across chunk boundaries', async () => {
  const actual = await readFile('docs/packproof/evidence/sam/special-token-output.txt', 'utf8');
  async function* chunks(): AsyncGenerator<ResponsesEvent> {
    for (let i = 0; i < actual.length; i += 7) yield { type: 'response.output_text.delta', ...lane, delta: actual.slice(i, i + 7) };
    yield { type: 'response.output_text.done', ...lane, text: actual };
    yield { type: 'response.completed' };
  }
  const decoded = await decodeSam(chunks(), 600, 480);
  expect(decoded.mask.mask.width).toBe(324);
  expect(decoded.mask.mask.height).toBe(247);
  expect(decoded.raster.reduce((sum, n) => sum + n, 0)).toBe(79533);
});
