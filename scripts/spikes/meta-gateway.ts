import OpenAI from 'openai';

// Shared server-only transport settings. Live inference remains owned by provider.ts's budget gate.
export const META_BASE_URL = 'https://api.meta.ai/v1';
export const MUSE_MODEL = 'muse-spark-1.3';
export function metaClientOptions(apiKey: string, transport?: typeof fetch) {
  return { baseURL: META_BASE_URL, apiKey, maxRetries: 0, timeout: 45_000, ...(transport ? { fetch: transport } : {}) };
}
export function createMetaClient(apiKey: string) { return new OpenAI(metaClientOptions(apiKey)); }
