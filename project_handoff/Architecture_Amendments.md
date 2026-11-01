# PackProof architecture amendments

1 November 2026. Explicit later user decision, supplementing v10 H0–H8 rather than rewriting the product specification. Only the original first implementation prompt was previously executed. This amendment prepares the next architecture; the full Investigator and persistent investigations remain unbuilt.

## Orchestration decision and verified compatibility

The Evidence Investigator will use **LangChain** for Muse tool orchestration, **LangGraph** for necessary durable user-input pause/resume, and **LangSmith** for optional tracing/evaluation. These are one coordinated stack, not separate competing agent controllers. Existing server authorization, contracts and deterministic Evidence Engine remain authoritative. The browser/offline verifier imports none of them.

Installed exact versions, compatible with Node 24.22.2 and Zod 4.6.7:

| Package | Version | P0 evidence |
| --- | --- | --- |
| `@langchain/core` | 1.3.2 | Real structured tool invocation, Zod schema and message exchange tested offline |
| `@langchain/openai` | 1.8.0 | `ChatOpenAI` request serialization and recorded Muse response mapping tested through intercepted transport |
| `langsmith` | 0.11.6 | Actual SDK serialization tested against an offline sender; disabled tracing and outage isolation tested |

`@langchain/langgraph` 1.6.0 was checked as a compatible npm candidate (`@langchain/core ^1.1.48`, Zod `^3.25.32 || ^4.2.0`), but is not installed or runtime-verified here because no graph persistence is built in P0. Pin and integration-test it and the Postgres checkpointer before P1 persistence is claimed complete.

The existing official OpenAI JS SDK/Meta transport is retained. `meta-gateway.ts` centralizes endpoint, credentials transport settings, zero SDK retries and timeout. The P0 LangChain adapter uses this configuration with a mandatory intercepted transport and a dummy key; it cannot consume the configured real key. SAM stays on its actual Responses/parser integration and will execute inside `inspect_product_image` later.

The standard adapter supports the **tested subset**: Chat Completions function-tool serialization, parsed tool calls, returning the real fixture result with `tool_call_id`, and schema-shaped final JSON validated independently with Zod and exact result references. It needs `useResponsesApi: false` and a thin `modelKwargs.max_completion_tokens` override: unknown-model defaults otherwise emit `max_tokens`, whereas the existing proven gateway uses `max_completion_tokens`. Nonstandard Meta fields may be lost by a generic OpenAI adapter; keep authoritative provider IDs/shapes and usage at the gateway.

The original evidence omitted a complete raw first response envelope. Compatibility fixtures explicitly reconstruct known fields from the saved successful tool/result/final evidence; they are not claimed to be untouched raw responses or a new live Meta/LangChain call. Full live compatibility, streaming, image orchestration and provider retries remain unverified and cannot be probed under the exhausted budget. No custom model implementation or replacement gateway is needed for this offline subset; future adapter changes stay thin and gateway-backed.

## Fixed P1 tool registry

Inputs remain strict bounded Zod objects; UUIDs and nulls retain H1/H2 semantics. These are **planned handlers**, not implemented P0 tools. The compatibility spike keeps the single existing `lookup_demo_product` function.

| Exact H2 name | Required input fields |
| --- | --- |
| `lookup_product` | `namespace: string`, `productMark: string`, `packagingMark: string | null` |
| `lookup_seller` | `itemId: UUID`, `sellerId: UUID` |
| `get_product_notices` | `itemId: UUID` |
| `get_custody_history` | `itemId: UUID` |
| `inspect_product_image` | `investigationId: UUID`, `captureId: UUID`, `question: 'product_mark' | 'package_mark' | 'printed_expiry'` |
| `request_additional_evidence` | `investigationId: UUID`, `reason: 'unreadable' | 'missing_package' | 'association_unclear'`, `view: 'close_mark' | 'both_marks' | 'full_package'` |

Outputs remain H2's strict `GateResult` envelopes and signed source references. H3 limits remain **8 total tool actions, 3 recapture requests, 2 bounded transient provider retries** per investigation, counted durably across resume. The P0 spike enforces the eight-action bound, has no recapture action and uses zero provider retries. It does not claim to implement full investigation limits or mandatory online assessment coverage.

## LangGraph persistence design for P1

- Authenticate and authorize investigation/capture ownership before creating or resuming a graph. Use a pseudonymous investigation UUID as `thread_id`; knowing that UUID never grants access. Persist checkpoints in the existing Supabase Postgres instance, under a restricted backend schema/role, using a compatible Postgres checkpointer. No second database, queue or orchestration engine.
- Planned nodes: bounded model/tool step → authoritative evidence handler → deterministic assessment finalizer. Additional evidence requests persist a precise request and enter an `interrupt` node. Resume with validated `Command({ resume: ... })` on the same authorized thread; bind the supplied capture to the requested evidence revision. No graph or schema migration is created now.
- Interrupts re-enter their node from the beginning. Keep durable effects in separate nodes or guard them with an idempotency key bound to investigation, operation, capture/evidence revision and canonical argument hash. Store the validated result/reference IDs transactionally; identical retries reuse that result, changed payload with a reused key is rejected.
- Persist remaining action/recapture/retry counters and request-cost reservations before execution. A checkpoint replay must not reset limits or repeat a paid model call after an ambiguous timeout. Gateway retry logic owns the two-retry policy; disable independent SDK retries to avoid multiplication.
- Require the finalizer after any model path. Product/issuer, relationship, seller, applicable notice and history coverage are mandatory. Omitted checks and missing evidence remain unresolved. A successfully serialized LangChain response is not product clearance.

## Optional LangSmith boundary

P0 uses only explicit, allowlisted trace events: pseudonymous investigation UUID, lifecycle/model/tool/gate kind, safe status/error code, validated record UUIDs, latency and available token counts. Raw prompts, unrestricted outputs, customer identities, media, API keys and private reasoning are rejected before the sender. The actual SDK has hidden inputs/outputs, omitted runtime metadata, bounded timeout, no retries and no automatic batching. Automatic LangChain tracing is disabled inside the spike even when ambient tracing flags are enabled.

Tracing emits without awaiting the remote service on the verification path. Queue size/timeouts are bounded; failures/drop counts are telemetry only and never modify findings. The optional local flush is used after the spike result for testing. No LangSmith credentials are configured and **no remote traces were delivered**. Remote account access is unavailable/unverified; the SDK success is offline only.

In P1 extend the allowlist to the six registered tool names and trace investigation lifecycle, actual gateway calls/IDs, validated references, gate outcomes, latency and safe errors. Add cost only with an explicitly configured verified pricing version; otherwise report unknown. Reuse H8's existing evaluation scenarios and saved evidence, optionally publishing sanitized runs to LangSmith. Do not create a second evaluation dataset/controller or delegate verdicts to tracing.

## Mandatory verification boundaries

The Legal Agent Workshop-inspired rule remains enforcement **inside authoritative backend action handlers**, with structured refusal feedback and no verification-off or retry-until-accepted escape. Independent checks include scoped issuer role/namespace; record signatures and exact-byte hashes; marking relationships; product/seller authority; notice applicability/freshness; current owner/version; and future atomic P2 transfer authorization. Model calls only request read operations/evidence and explain validated results. No model, graph state, callback, trace or student can supply `verified=true` to bypass these checks.

Offline cryptographic verification remains a shared deterministic module independent of LangChain, LangGraph, LangSmith and network availability. Trust roots never come from a peer's self-supplied key. Signed cached records are dated evidence, not knowledge of notices or ownership changes never received.

## Two conditional Glimmer workflows

**Hosted Glimmer — connected:** investigate product and seller evidence through the same typed tools/backend; prepare grounded radio/voice bulletin content. Publication requires deterministic evidence checks and approval of the exact content. Glimmer is not radio-only; no hosting or radio delivery is implemented by this amendment.

**Glimmer-distilled student — POS/Android:** a separate small local model, not Glimmer 30B running on ordinary POS hardware. Explain cached, signed and cryptographically verified PackProof evidence and suggest next steps on compatible devices. Disclose stale, missing, partial and incomplete evidence; never override issuer authority, ownership, signatures or transfer rules. Distillation remains conditional after P0–P4 pass and requires actual training, held-out evaluation and hardware tests. No model training, native POS app or radio infrastructure begins here.

## Documentation precedence and next step

Read this amendment alongside v10 for subsequent prompts; original specification and H1–H8 remain the product/security contract. Record deliberate changes in BUILD_LOG. P0 F1/F2 evidence is preserved. F3/F4 stay blocked until real phone, transport and target-service evidence exists. The next prompt must address those blockers before a full P1 build is authorized.

References: [LangChain OpenAI adapter](https://docs.langchain.com/oss/javascript/integrations/chat/openai), [provider compatibility limits](https://docs.langchain.com/oss/javascript/concepts/providers-and-models), [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts), [LangSmith SDK](https://github.com/langchain-ai/langsmith-sdk). Current docs were fetched via Context7 and checked against installed package types/source; package versions were verified against npm metadata and the offline checks.
