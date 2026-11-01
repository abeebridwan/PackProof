import { readFile } from 'node:fs/promises';
import { evidence } from './evidence.js';
import { recordedEnvelopes, offlineMetaTransport, runLangChainCompatibility, H3_LIMITS } from './langchain-compatibility.js';
import { safeTracing, langSmithSender } from './safe-tracing.js';

const saved = JSON.parse(await readFile('docs/packproof/evidence/provider.json', 'utf8'));
const offline = offlineMetaTransport(recordedEnvelopes(saved));
let localTraceRequests = 0;
const traceTransport: typeof fetch = async () => { localTraceRequests++; return new Response('{}', { status: 200 }); };
const trace = safeTracing({ enabled: true, send: langSmithSender('offline-fixture-key', traceTransport) });
const result = await runLangChainCompatibility({ transport: offline.transport, trace });
const tracing = await trace.flush();
const report = { status: result.status, checkedAt: new Date().toISOString(), mode: result.mode, liveMetaRequests: 0, remoteLangSmithRequests: 0,
  packages: { '@langchain/core': '1.3.2', '@langchain/openai': '1.8.0', langsmith: '0.11.6' },
  adapter: 'ChatOpenAI with shared Meta gateway configuration; useResponsesApi=false; max_completion_tokens override',
  fixture: { source: 'docs/packproof/evidence/provider.json', kind: 'reconstructed from sanitized observed envelopes; not full raw response replay', responseIds: [saved.muse.first.responseId, saved.muse.final.responseId] },
  offlineInterceptedModelRequests: offline.requests.length, toolActions: result.actions, limits: H3_LIMITS, answer: result.answer,
  tracing: { mode: 'actual SDK with intercepted offline transport', localTraceRequests, ...tracing, remoteAccountVerified: false },
  limitations: ['No new live Meta/LangChain call; budget remains exhausted', 'LangGraph durable pause/resume is design only', 'No persistent investigations or remote tracing'] };
await evidence('langchain-compatibility', report); console.log(JSON.stringify(report, null, 2));
if (result.status !== 'passed' || tracing.failed || !tracing.delivered) process.exitCode = 1;
