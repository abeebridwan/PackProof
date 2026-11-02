# P1C — current evidence and checkpoint

P1 remains partial. A1–A3/I1 pass in the scopes below; A4's controlled workflow passes, while the intended Android P1 journey remains not_run. P0's deferred two-phone checks remain unchanged. No P2, deployment, commit or push was performed. The public P0 deployment and recorded-provider web runtime are preserved.

## Live results

| Scenario | Result | Actual evidence |
| --- | --- | --- |
| Shop A | Passed: unauthorized seller blocked; no counterfeit verdict | [3 real requests](p1c-completion-a-attempt-1.json). [Original failed attempt](p1c-live-a.json) retained. |
| Shop B | Passed: signed records, registered seller, applicable batch notice, cited answer | [5 real requests](p1c-live-b.json); not repeated as a standalone scenario. |
| Custody gap | Passed: gap visible, needs_evidence, no invented handover | [5 real requests](p1c-completion-c-attempt-1.json). |
| Physical-context closer view | Passed controlled pause/separate-process resume; physical association unresolved | [Pause](p1c-completion-p-pause-attempt-1.json), [resume](p1c-completion-p-resume-attempt-1.json); 6 real requests, known fictional codes, no new phone/image observation. |
| Missing packaging | Passed request-first pause/separate-process resume; supplied fictional code, cited record-supported result, physical item not inspected | [Pause](p1c-completion-e-pause-attempt-5.json), [resume](p1c-completion-e-resume-attempt-1.json); 6 real requests. |

Muse chose typed tools; real signed Supabase results returned under the originating call IDs. Final answers contain validated claim IDs, with explanations derived from server-verified records. The Evidence Engine independently rereads issuer/signatures, marking relationship, seller authority, notices, history and freshness. Neither a matching record nor a manual code proves physical authenticity.

## Repairs and observed provider limitation

The initial SDK failure occurred when actual Meta tool-call envelopes included non-JSON commentary alongside valid calls. The existing guarded native receipt bridge retains only actual validated IDs/arguments/answers and usage; it never manufactures output, saves hidden reasoning or repeats a paid call to repair SDK parsing. Malformed, truncated, over-limit and ambiguous responses still fail safely.

Muse repeatedly encoded absent packaging as the string `"null"`. All four rejected lookup attempts remain preserved: [1](p1c-completion-e-pause-attempt-1.json), [2](p1c-completion-e-pause-attempt-2.json), [3](p1c-completion-e-pause-attempt-3.json), [4](p1c-completion-e-pause-attempt-4.json). Exact-value schema serialization passed locally, but schema narrowing and an explicit JSON example did not establish successful native JSON-null generation. No string was coerced and no backend scope check was relaxed.

[Meta's strict-tool documentation](https://dev.meta.ai/docs/tool-calling) says `strict` validates the supplied schema; it does not guarantee generated arguments. The installed LangChain adapter already sets it for these requests. [LangChain's OpenAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/openai) was checked through Context7; Meta's own behavior takes precedence for this gateway.

The repaired workflow asks for the missing code first, then performs lookups after a valid resume. Server product-only reads still accept genuine JSON null. Direct Muse generation of that nullable lookup remains an observed provider limitation, not a proven capability.

An early request also exposed a pause-assessment edge case: no selected record facts produced an empty citation list, which the final-answer schema rejected. The server's pending-request assessment now permits an empty list only at that boundary and cannot issue success. All mandatory checks still run; empty final model answers, invented citations and provider errors remain unavailable. The original live pause receipt retains its pre-repair unavailable finding; the corrected assessment was verified separately with its persisted real request and actual Supabase reads, without another Meta call. See [current assessment](p1c-completion-assessment.json).

## Budget and receipts

| Grant | Allowance | Requests | Reserved | Usage estimate |
| --- | --- | ---: | ---: | ---: |
| Initial P1 | $2 / 8 requests, exhausted | 8 | $2.00 | $0.0340083 |
| `p1c-completion-2026-11-02` | $4 / 16 requests, exhausted | 16 | $4.00 | $0.09826915 |
| `p1c-repair-2026-11-02` | New explicit $4, no separate request-count ceiling | 8 | $2.00 | $0.04602175 |
| P1 total | Three distinct approvals | 32 | $8.00 | $0.1782992 |

Actual billing is unknown throughout. Reservations are conservative ceilings, not charges. The new grant has $2 unreserved; execution stops because evidence is sufficient. A 25¢ reservation before each request still financially bounds execution despite no separate count cap. Limits remain 16,000 input / 2,048 output tokens, 45 seconds, two bounded provider retries, one concurrent run, and fail-closed ambiguous outcomes. No automatic retry was used in these 8 requests.

The new ledger binds the exact user approval and policy to its stable ID and unchanged predecessor hash. External registration prevents recreating it after ledger/directory loss. Original P0/P1/completion ledgers and failed/successful receipts are preserved. Inspect without spending using `pnpm p1c:budget --repair status`. [Current assessment](p1c-completion-assessment.json) indexes request IDs, usage and all new attempts. [Standard Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits) was rechecked on 2 November; only `muse-spark-1.3` Standard was used.

## Validation and acceptance

- `pnpm typecheck`: passed.
- `pnpm exec vitest run tests/unit/p1c.test.ts tests/unit/p1c-completion.test.ts tests/unit/investigator.test.ts --reporter=json --outputFile=docs/packproof/evidence/vitest-p1c-completion-targeted.json`: **59 passed**, zero failures. Covers budget restart/concurrency/history loss, nullable scope, normal investigations, early pause/resume, invented/empty citations, malformed providers, limits and finalizer negatives. [Report](vitest-p1c-completion-targeted.json).
- Actual Muse/Supabase integration: 8 additional requests, including 2 rejected nullable calls and 6 successful request-first workflow calls. Separate-process resume retained the same owner/thread and incremented revision 1→2.
- Corrected early pause: actual Supabase mandatory reads passed, no new inference. `pnpm probe:bundle` and the isolated production scan passed26 client assets with no configured secrets or private trace paths. Initial development-browser checks were blocked by an HMR handshake/hydration problem; isolated production hydration and UI checks passed. See the current assessment.
- Full-suite baseline remains **132 unit / 15 actual integration** at `7b72f85`; these totals are historical, not new full-suite results. Full suites were not repeated. An isolated current production build passed using `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build .local/p1c-production --webpack`; the existing development server was preserved. `node --import tsx scripts/p1c/browser.ts` passed all existing production UI checks against that build: both sellers, notice, gap, pause/resume/reload, leading zeros, unresolved physical scope, controlled error and mobile layout. [Browser evidence](p1c-browser.json).
- LangSmith disabled/outage behavior and safe metadata remain verified; remote delivery is not_run/unconfigured and optional.

| Gate | Checkpoint | Scope / limitation |
| --- | --- | --- |
| A1 | passed | Actual signed product/seller/notices/history tools and cited live answers. |
| A2 | passed | Omitted coverage remains unresolved; actual unauthorized seller blocked, gap visible, physical scope unresolved. |
| A3 | passed | Controlled injection/malformed/provider/limit negatives plus actual rejected nullable calls; no success from failure. |
| A4 | blocked at device checkpoint | Controlled live closer-view/persistence/resume and recorded browser separation pass; intended vivo Y03 P1 interaction not_run. |
| I1 | passed | Controlled pair/mismatch/product-only/carton/batch/unit tests plus actual seller, notice and custody outcomes. |

[Current structured state](p1c.json), [build state](../../../project_handoff/BUILD_STATE.json). No second-phone test is requested again. One-phone P1 interaction remains manual; this report does not claim an Android observation.

## Performance and next boundary

Recorded-provider optimization remains 10,045→9,069 ms and 123→109 client queries, one cold sample per version; no cached verification or durability reduction. [Measurements](p1c-performance.json).

New missing-code live pause took 11,315 ms and resumed investigation 34,649 ms. Resume included 14,071 ms provider inference, 3,549 ms token preflight, 20,287 ms model operations, 5,417 ms tool operations and 2,341 ms final verification. Categories overlap. Actual client SQL count was not instrumented for this run; do not infer it from earlier measurements. These are laptop/network samples, not a deployed SLA.

Stop at P1C. Remaining: intended Android P1 UI observation; direct native nullable generation remains unsupported in observed attempts and is safely avoided by request-first routing. Signed demo custody snapshots expire after **2 November 2026, 12:00 UTC**. Do not silently refresh/re-sign/reseed, waive freshness or use remaining funds for unrelated work. P1 stays partial / P1 verified:false / P2 ready:false. No P1 deployment is authorized by this prompt.
