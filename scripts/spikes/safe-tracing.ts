import { Client } from 'langsmith';
import { z } from 'zod';

// Explicit allowlist; raw prompts, model outputs, identities, errors, media and keys cannot enter.
export const TraceEvent = z.strictObject({
  investigationId: z.uuid(), kind: z.enum(['lifecycle', 'model', 'tool', 'gate']),
  status: z.enum(['started', 'completed', 'needs_evidence', 'unavailable', 'rejected']),
  tool: z.literal('lookup_demo_product').optional(), model: z.literal('muse-spark-1.3').optional(),
  refs: z.array(z.uuid()).max(8), latencyMs: z.number().int().min(0).max(60_000),
  inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(),
  errorCode: z.enum(['provider_unavailable', 'invalid_output', 'action_limit']).optional(),
});
export type TraceEvent = z.infer<typeof TraceEvent>;
export type TraceSender = (event: TraceEvent) => Promise<void>;
export function safeTracing(options: { enabled: boolean; send?: TraceSender; timeoutMs?: number }) {
  const pending: Promise<void>[] = [];
  const counts = { delivered: 0, failed: 0, dropped: 0, invalid: 0 };
  return {
    // Intentionally returns void: verification does not await the tracing service.
    emit(raw: unknown) {
      if (!options.enabled) return;
      const event = TraceEvent.safeParse(raw);
      if (!event.success) { counts.invalid++; return; }
      if (!options.send || pending.length >= 32) { counts.dropped++; return; }
      const timeoutMs = Math.min(250, Math.max(1, options.timeoutMs ?? 100));
      pending.push(new Promise<void>(resolve => {
        let settled = false;
        const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(timer); counts[ok ? 'delivered' : 'failed']++; resolve(); };
        const timer = setTimeout(() => finish(false), timeoutMs);
        void Promise.resolve().then(() => options.send!(event.data)).then(() => finish(true), () => finish(false));
      }));
    },
    async flush() { await Promise.all(pending); return { ...counts }; },
  };
}

// P0 calls this only against an injected offline fetch in tests. No remote account is assumed.
export function langSmithSender(apiKey: string, transport: typeof fetch): TraceSender {
  const client = new Client({ apiKey, apiUrl: 'https://api.smith.langchain.com',
    autoBatchTracing: false, hideInputs: true, hideOutputs: true, omitTracedRuntimeInfo: true,
    timeout_ms: 200, callerOptions: { maxRetries: 0 }, fetchImplementation: transport });
  return async event => {
    const safe = TraceEvent.parse(event);
    await client.createRun({ id: crypto.randomUUID(), name: `packproof.${safe.kind}`, run_type: safe.kind === 'model' ? 'llm' : safe.kind === 'tool' ? 'tool' : 'chain',
      project_name: 'packproof-p0-compatibility', start_time: Date.now() - safe.latencyMs, end_time: Date.now(),
      inputs: {}, outputs: {}, extra: { metadata: safe } });
  };
}
