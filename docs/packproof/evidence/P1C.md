# P1C — Approved live Muse validation and targeted adapter repair

2 November 2026. **Shop B passed the complete live Investigator flow. Shop A's live flow failed before the adapter repair; the custody-gap live case was not_run. P1 remains partial and P2 is not ready.** All eight approved requests have been used. Public P0 deployment and the recorded web runtime are unchanged.

## Scope and approved budget

Reused baseline `52a349b`, Node24.22.2/pnpm12.16.1, existing pinned packages, Supabase project `hvbzxeuedookkwleyjmx`, all27 signed fictional records, six H2 tools, mandatory verifier and official PostgresSaver. The live-validation run added no dependency, migration, fixture refresh, ownership commit, deployment or push. Its changes were initially uncommitted; the later user-requested performance and commit follow-up is recorded below. Preserved pre-existing source work; Next regenerated its development/production route type imports during the build. No new phone-testing guide.

The P1C prompt required separate explicit approval. The initial expected refusal before approval is preserved in [p1c-live-before-approval.json](p1c-live-before-approval.json). The user subsequently supplied:

> I approve up to $2 USD for P1 live Meta validation, maximum 8 inference requests.

Recorded at **2026-11-02T01:33:24.882Z** by `pnpm p1c:budget approve '<exact statement above>'`. Approval and every reservation/usage receipt persist in ignored `.local/p1c/budget.json` (mode0600, directory0700). Approval authorizes only this bounded operator validation; no paid public route was enabled.

| Limit | Enforcement and result |
| --- | --- |
| Total | $2 / eight inference requests including retries; **8 used, none remain** |
| Reservation |25 cents durably reserved before every inference, never refunded; **$2 reserved** |
| Input/output | Native Meta token-count preflight, max16,000 input /2,048 output per request; all eight within limits |
| Timeout |45 seconds per request; SDK automatic retries0 |
| Controller retries | At most2 globally, counted against eight; both consumed by the initial adapter failure |
| Concurrency | One exclusive cross-process validation-run lock |
| Ambiguous effects | Persist reservation and stop; never automatically retry a timeout or clear stale locks |

**Eight inference requests, eight token-count preflights.** Token counting does not generate model output. Actual usage across inference receipts:22,493 input,2,505 output,4,322 cached input tokens. Usage-based estimated total **$0.0340083**; confirmed billed amount **unknown/null**. Reservation is not a billing claim. All eight requests returned actual `muse-spark-1.3` response IDs and usage; no ambiguous request remains. The original P0 seven-request/$3 ledger is byte-identical.

Pricing verified2 November from [Meta Standard pricing](https://dev.meta.ai/docs/pricing-rate-limits): per million tokens, input$1.25 /cached input$0.15 /output$4.25. Existing per-investigation DB accounting reserves3 cents per model operation inside its unchanged50-cent limit; the separate global25-cent reservation still controls every real inference. No account invoice or automatic balance deduction was independently inspected.

## What failed and what was repaired

The initial Shop A run made three valid native Muse responses selecting `lookup_product`. Each then failed in SDK response parsing before a backend tool result reached Muse. The old adapter treated a status-less SDK exception as transient and consumed its two permitted retries. [Original failed run](p1c-live-attempt-1.json), [unaltered Shop A receipts](p1c-live-a.json). Shop A is **failed**, not passed after the repair. Its independent finalizer still retrieved and verified actual records, found `seller.authorized:false`, and issued an overall `unavailable` finding because the model loop failed. It never approved a transfer or declared counterfeit.

The subsequent live Shop B responses establish the incompatibility: four tool-turn responses have JSON HTTP media type, assistant role, valid native tool calls **and non-JSON accompanying content**. The SDK's non-streaming `json_schema` parser attempts to parse that content and throws `SyntaxError`. The final stop response contains valid schema-conforming JSON and parses through LangChain normally. Only the content classification and allowlisted error class are retained; the unrestricted text and hidden reasoning are not saved.

Targeted repairs:

- `src/server/providers/muse.ts`: status-less parsing exceptions are no longer automatically retryable. Only definite429/5xx responses permit controller retries. Exposes an allowlisted exception class, never raw provider errors.
- `src/server/providers/p1-live.ts`: retains LangChain request construction, schema/tool binding and the official Meta gateway. If SDK response parsing fails **after this exact operation's native envelope passed strict validation**, bridge its actual response ID, tool ID/name/validated arguments or validated final answer into the existing planner result. No fabricated response, previous receipt, unrestricted prose or extra inference is used. Malformed/unknown/truncated/over-limit responses and ambiguous transport errors cannot use this bridge. Backend LangChain tools and mandatory finalizer still execute normally.
- `scripts/p1c/live.ts`: can select a remaining scenario with `--scenario=B`; preserves prior executed/failed scenarios and aggregate preflight counts across restarts. A default rerun skips executed cases and respects the remaining allowance.
- Regression tests exercise the observed non-JSON tool-turn shape with synthetic text, SDK media-type failure, strict malformed responses, call/result correlation, accounting, idempotency and no paid retry on a successful native receipt. Test transport/key/ledger are injected, never live acceptance.

[Current LangChain documentation](https://docs.langchain.com/oss/javascript/concepts/providers-and-models) warns that `ChatOpenAI` targets OpenAI specifications and third-party response fields may differ. Context7 documentation and installed SDK/parser source were inspected. Meta's [tool-calling](https://dev.meta.ai/docs/tool-calling) and [token-counting](https://dev.meta.ai/docs/token-counting) shapes were used; the Responses-shaped count preflight is now account-proven for all eight Chat Completions calls. [Cross-endpoint counting example](https://dev.meta.ai/docs/cookbook/vision-input).

## Actual live scenarios

| Case | Live result | Evidence and limits |
| --- | --- | --- |
| A — FP-1001/PK-2001, Shop A | **failed**,3 requests before repair | Native product-tool selections were valid; no complete model/tool-result round-trip. Independent seller authorization was false. Overall unavailable, not counterfeit or transfer approval. |
| B — FP-1002/PK-2002, Shop B | **passed**,5 requests after repair | Actual Muse chose product, seller, notices and custody tools; backend validated arguments and queried signed Supabase records; real results returned under exact call IDs; Muse selected4 schema-validated fact IDs. Independent finalizer reran all4 mandatory reads. Authorized seller, matched relationship, applicable BATCH-02 wrapper-revision notice; physical item not inspected. No transfer occurred. |
| C — custody gap | **not_run**, budget exhausted | Existing actual DB/recorded-browser and deterministic negative checks retain the gap and needs_evidence. They are not live Muse acceptance. |

[Complete Shop B evidence](p1c-live-b.json), [aggregate current evidence](p1c-live.json). Every executed request has a native request ID, response ID, model, usage and counted input. No SAM, new image analysis or Contributor/OpenAI inference was invoked.

| Request | Provider request ID | Response ID | Native choice |
| --- | --- | --- | --- |
| A1 | `bdea5abb-e04f-4568-a1bf-a9e8ca7b66e5` | `chatcmpl-01a199e5-7c80-7687-a9cc-b896c2683a63` | lookup_product |
| A2 | `84d8d522-d11d-49c7-983a-1949a5213d7e` | `chatcmpl-01a199e5-8a94-773b-b04e-49519f273dd8` | lookup_product |
| A3 | `5dc807dd-7ad1-402f-97ed-1b8758cba825` | `chatcmpl-01a199e5-9699-7561-a4ec-78f0ba6a18dc` | lookup_product |
| B1 | `338daa15-d888-4cb3-b29d-cfdf70b263b6` | `chatcmpl-01a199e7-fe07-70ac-bb8d-c28a874c1f61` | lookup_product |
| B2 | `693a4066-ec9c-464a-94ad-e317b5323396` | `chatcmpl-01a199e8-0fae-76b7-b589-b8f5f0feeb7b` | lookup_seller |
| B3 | `7e494381-4a16-4966-bad9-c71f1275e0e5` | `chatcmpl-01a199e8-202e-734c-a43a-14d815b6676d` | get_product_notices |
| B4 | `8eb74d3f-2976-4768-a3c4-50505ded1bb8` | `chatcmpl-01a199e8-2dbe-7697-82c8-19fefea0cde7` | get_custody_history |
| B5 | `31b90188-45f9-4c7b-bd8b-04180f66b042` | `chatcmpl-01a199e8-494d-7021-88a5-31d47c4cb9c6` | structured final answer |

The final Shop B claim IDs are `product.records`, `seller.authorization`, `notice.30000000-0000-4000-8000-000000000402` and `history.coverage`; their explanations and references are derived from independently verified server facts. Fictional labels and all tool strings remain untrusted data.

## Performance and acceptance

| Scenario | Total | Provider inference | Token preflight | Model operation | Tool operation | Final verification |
| --- | --- | --- | --- | --- | --- | --- |
| A, failed |15,926ms |4,621ms |4,175ms | unavailable for failed operations |0ms |1,142ms |
| B, passed |28,166ms |11,024ms |5,363ms |17,998ms |3,309ms |1,134ms |

Model operation includes provider and token-preflight time plus its surrounding database work. Columns overlap and must not be added. Remaining total includes graph/checkpoint/read/save overhead. These are one actual run per scenario from this laptop, not a deployed SLA. Prior10,349ms recorded-provider benchmark remains labeled recorded, not live. No speed guarantee is claimed.

| Gate | Status | Evidence |
| --- | --- | --- |
| A1 | passed | Live B: all four signed read services and final cited claim IDs, actual round-trip and mandatory checks. |
| A2 | passed, controlled regressions | Omitted seller/history, unknown markings/issuer and invented authority cannot produce supported findings. Live A failure still independently checks seller. |
| A3 | passed, controlled + actual failure/cap checks | Malformed/truncated/unknown tool, injection, unsupported extra conclusions and failure/timeout paths reject success. Actual A remained unavailable; exhausted-ledger rerun made zero new inference/preflight calls. |
| A4 | partial | Actual Supabase durable pause/resume and existing recorded production UI passed; live Muse closer-view journey and intended Android P1 interaction not_run. |
| I1 | partial | Existing match/mismatch, product-only, shared carton, batch/unit controlled checks passed; live B matches unit/notice evidence. Failed A and unrun C are retained; full live scenario coverage incomplete. |

**P1 remains partial /P1 verified:false /P2 ready:false.** Required Shop A live round-trip is unresolved after repair and C was not_run. Successful B does not replace either. No remaining inference requests are authorized in this ledger. A future bounded continuation must reuse receipts, preserve this ledger and establish any additional explicit allowance before new calls. Check freshness first: unchanged demo custody snapshots dated1 November12:00Z become stale after2 November12:00Z; never waive freshness or silently re-sign/reseed fixtures.

## Regression, persistence, tracing and UI evidence

- `pnpm typecheck`: passed strict root/app.
- `pnpm test --reporter=json --outputFile=docs/packproof/evidence/vitest-p1c-unit.json`: **126 passed /9 files**, original101 retained. [Report](vitest-p1c-unit.json).
- `PACKPROOF_P1A_INTEGRATION=1 PACKPROOF_P1B_INTEGRATION=1 PACKPROOF_P1C_INTEGRATION=1 pnpm test:integration --reporter=json --outputFile=docs/packproof/evidence/vitest-p1c-integration.json`: **15 actual Supabase tests passed**, original14 retained. Provider transport/key/approval are injected in the extra adapter test; zero Meta requests from this suite. [Report](vitest-p1c-integration.json).
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`, `pnpm probe:bundle`: production build and browser secret checks passed. No ignored key/env/local file in output traces. No dependency/lockfile change.
- Before approval: `pnpm p1c:live` exited1, `p1_approval_required`,0 preflights/inference. After explicit approval: same command exited1 after failed A,3 requests; `pnpm p1c:live --scenario=B` passed B using remaining5 (aggregate exit1 retains failed A). Final exhausted-ledger `pnpm p1c:live` exited1 with preserved A/B/C statuses,0 new preflights/inference. No ninth request was attempted.

Meaningful controlled negatives include claimed authority without seller coverage, fabricated citations, contradictions/extra fields, unknown mark/issuer, omitted history, unsupported authenticity, tool-output injection, malformed/incomplete native envelopes, unknown model/tool, call-ID mismatch, input/output caps, persistent eight-request/two-retry limits and ambiguous timeout lockout. Failed/unsupported responses remain unavailable/blocked/needs_evidence; none becomes acceptance by repetition.

LangGraph actual Supabase regressions cover persistence, paused additional evidence, resumed revisions, idempotent action/retry limits, owner/RLS/checkpoint isolation and deliberately lost-cycle recovery without repeating completed effects. Official saver unchanged. Signed source bytes, scoped signing authority, current seller authority, notices, relationship, freshness and history gaps are independently verified before a finding is issued.

LangSmith safe metadata includes tool/gate results, latency/tokens and usage-based estimates. Disabled tracing and simulated outage regressions passed. Credentials/private content/hidden reasoning/unverified billed amounts are excluded. Remote delivery **not_run — not configured**, and remains optional.

Existing P1C production Chromium390px checks against actual Supabase/recorded AI passed input/submission/progress, linked findings, both sellers/notice, gap, additional evidence, resume/reload, leading zeros000042/000043, unresolved physical association and controlled503; [browser evidence](p1c-browser.json), [screenshot](p1c-ui.png). No UI changes were needed in this approval continuation; this remains recorded browser evidence, not actual Android or paid UI operation. The public web runtime still uses recorded responses. Do not flip `P1_PROVIDER_MODE` to make paid calls. All new live work ran only through the guarded operator CLI.

P0 F3/F4 two-phone QR/JSON/transported-file alteration checks remain explicitly deferred/not_run; original single-phone evidence preserved. Existing public `https://packproof-p0.vercel.app` remains P0. Both conditional Glimmer directions remain unchanged. At that checkpoint no P2/P3/P4 work, deployment, commit or push had occurred. **Stop at P1C.**


## 2 November follow-up — safer P1 performance and generator handoff

The user requested further speed improvements, preservation of working behavior, testing ownership, commit and handoff. Completed the independent work with **zero new Meta calls or spend**; both real reservation ledgers and original live A/B/aggregate receipts remain byte-identical.

A fresh cold comparison against the same actual Supabase project and recorded AI measured **10,045→9,069ms (9.72% shorter)**, **123→109 client database requests (11.38% fewer)**, signed-snapshot reads8→6 and connections3→3. All4 tool actions and4 mandatory finalizer events remained. Official checkpoint client requests stayed39. These are one before/after sample from this laptop with network variability, not optimized live Muse latency or a guarantee. The prior successful live B28,166ms evidence remains unchanged. [Before](p1c-latency-before.json), [after](p1c-latency-after.json), [performance report](p1c-performance.json).

Changes and preserved boundaries:

- `src/server/data/evidence-reads.ts` and runtime: simultaneous identical SQL reads share only a pending snapshot inside one owner-bound runtime. Every repository caller parses its own JSON and every service independently validates signatures/authority/projections. Settled and failed promises are discarded; later calls always reload. No cross-owner sharing or cached verification result.
- `store.ts`/`types.ts`/`graph.ts`: optional `readView` reads the private investigation and ordered trace in one SQL snapshot under the existing forced RLS. Missing/foreign rows still fail. Custom stores retain the existing methods as a parallel fallback. Actual PostgreSQL tests compare exact row/event output with the former read path and deny foreign/missing views.
- Graph: use the immutable, server-originated database creation time already persisted in checkpoints for expiry. Remove model-step reads of unchanged counters; actual retry reservations still reread their persisted count, tool steps read current progress, final view reads authoritative counters and every operation still uses the atomic owner-bound DB reservation. No saver, persistence durability, checkpoint name, transaction/idempotency/limit, mandatory signature/freshness check or migration was relaxed.
- Shop A repair coverage now injects the observed non-JSON native tool-turn shape against actual Supabase signed data. A correctly returns blocked with0 retries; B supported with0 retries. Both use real correlated backend results and4 mandatory checks. These are **controlled adapter regressions, not a new live Muse pass**. [Evidence](p1c-adapter-supabase.json).

Final checks after source changes:

- `pnpm typecheck`: passed.
- `pnpm test --reporter=json --outputFile=docs/packproof/evidence/vitest-p1c-optimization-unit.json`: **132 tests/10 files passed**, original126 and101 retained. Added pending-read concurrency/recovery/isolation, changed-projection reload and original expiry across pause/resume checks.
- `PACKPROOF_P1A_INTEGRATION=1 PACKPROOF_P1B_INTEGRATION=1 PACKPROOF_P1C_INTEGRATION=1 pnpm test:integration --reporter=json --outputFile=docs/packproof/evidence/vitest-p1c-optimization-integration.json`: **15 actual Supabase tests passed**. Actual RLS/view equivalence, every limit, checkpoint loss/restart/resume, atomic writes and controlled native-adapter cases retained.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build` and `pnpm probe:bundle`: passed;26 client assets checked.
- `PORT=4181 NEXT_TELEMETRY_DISABLED=1 pnpm start`, then `node --import tsx scripts/p1c/browser.ts`: passed after optimization against actual Supabase with recorded AI. Both sellers, notice, gap, additional evidence, resume/reload, leading zeros, unresolved physical state, controlled503 and390px no-overflow verified. Screenshot reviewed; temporary server stopped. No physical Android equivalence claimed.

**Testing responsibility:** Codex can perform the automated/controlled Shop A checks (done) and a future real Meta rerun after a new explicit bounded request allowance. The previous approval's8 requests are fully used, even though its usage estimate is only$0.0340083. Never reset/increase that ledger or relabel its failed A as passed. The current operator CLI skips executed cases, including failed A; a future authorized continuation must preserve prior receipts and add an explicit versioned rerun/authorization path before making new calls. C remains live not_run.

**Phone deferrals:** these are missing physical evidence, not a software defect. The user must provide two physical phones and perform the bidirectional rotating-QR, JSON transport and transported-file alteration trials with guidance. One-phone/desktop results cannot prove them. They remain deferred by the user's settled decision; continue only independent work and keep dependent release/handover gates unverified. No new testing guide was created.

Updated README, BUILD_STATE, BUILD_LOG and PROMPT_GENERATOR. User explicitly authorized committing the current P1C and performance changes. No push/deployment or P2 work. **Next generator prompt: bounded P1C live completion with separately authorized remaining scope; preserve all prior receipts, freshness, physical deferrals and P1 partial/P2 false.**

Final preservation/secret review passed:45 pending files scanned with zero configured-secret/private-key matches and zero private paths in production output traces. Both real ledgers, original live receipts, signed fixtures/root, lockfile, migrations, protected P0/P1A files and exact P0 phase/budget are unchanged.
