import { z } from 'zod';
import { LookupArgs, VisualReading } from '../../src/contracts/p0.js';
import { lookupFixture } from './fixture-registry.js';

const Call = z.strictObject({ id: z.string().min(1).max(256), type: z.literal('function'),
  function: z.strictObject({ name: z.literal('lookup_demo_product'), arguments: z.string().max(2048) }) });
export function executeToolCalls(raw: unknown) {
  const calls = z.array(Call).length(1).parse(raw);
  const call = calls[0]!;
  const args = LookupArgs.parse(JSON.parse(call.function.arguments));
  // Bind this probe to its requested product; model-supplied identifiers cannot change it.
  if (args.productMark !== 'FP-1001') throw new Error('Wrong probe subject');
  return { callId: call.id, result: lookupFixture(args) };
}
export function parseReading(raw: unknown) {
  const reading = VisualReading.parse(raw);
  if (reading.quality === 'unreadable' && reading.value !== null) throw new Error('Unreadable must be unknown');
  if (reading.quality === 'readable' && reading.value === null) throw new Error('Readable requires a literal value');
  return reading;
}
