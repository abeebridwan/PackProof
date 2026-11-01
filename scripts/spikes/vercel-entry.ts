import type { IncomingMessage, ServerResponse } from 'node:http';
import { createProbeHandler } from './serve.js';

// No provider or Supabase keys are needed. The demo frame catalog is per warm
// instance, so serverless restarts/scaling can lose batches; use LAN for F3 trials.
const handler = createProbeHandler();
export default async function probe(req: IncomingMessage & { query?: Record<string, unknown> }, res: ServerResponse) {
  const route = req.query?.__p0_path ?? new URL(req.url ?? '/', 'http://probe.local').searchParams.get('__p0_path');
  if (typeof route === 'string') req.url = route;
  (await handler)(req, res);
}
