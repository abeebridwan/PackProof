# P1A — database, signed evidence and trust foundation

2 November 2026 (Africa/Lagos). Baseline commit `b48585b`. **P1A foundation completed; P1 partial, not verified. P0 remains partial; its deferred F3/F4 two-phone gates are unchanged.** No P1B, P2, phone rerun, new model call, purchase or deployment occurred.

## Actual database and seeded records

Selected dedicated development project: **PackProof / `hvbzxeuedookkwleyjmx`**, existing Supabase Auth and private Storage, PostgreSQL **17.11**. Read-only inspection found **no public/PackProof application tables**. The additive migration [202611020001_p1a_evidence.sql](../../../supabase/migrations/202611020001_p1a_evidence.sql) was applied transactionally over CA/hostname-verified TLS, creating **13 tables**. A second run verified the stored migration SHA-256 without reapplying it. See [initial migration](p1a-migration.json) and [repeat](p1a-migration-repeat.json). No other project, existing production data, billing, bucket or media was modified.

`packproof` contains actors/account links, immutable signed records, versioned bindings/directory history, private items/owner versions, marking relations, notices, custody history and minimal investigation/tool-event tables. `public.pp_public_products` is a deliberately small fictional read projection. Claim history and mutable ownership projections are distinct. Existing constraints, foreign keys, indexes, forced RLS, explicit grants and mutation triggers protect these boundaries. No transfer/enrollment/commit protocol exists. Investigation counters retain H3 limits (8 actions / 3 recaptures / 2 retries); no LangGraph checkpointer or running graph is claimed.

**27 signed records** are seeded: five binding versions, five directory changes, three issuances, three mappings, three custody records, three snapshots, one gap, two notice versions, one authorized correction and one audit record. [Seed evidence](p1a-seed.json). Public, reproducible material is [signed-demo.json](../demo/signed-demo.json), with the operator-pinned [public root](../demo/root-public.json). It also contains two explicitly negative signed fixtures; neither is inserted as an accepted record.

- `FP-1001` / `PK-2001`: Shop A is not the registered holder and is blocked with the specified message.
- `FP-1002` / `PK-2002`: Shop B is the initial registered holder. Its latest applicable, signed fictional packaging-revision notice explains the wrapper change.
- Both units share container `CT-9001`; their unit IDs remain distinct. Model, batch and container lookups cannot create unique-unit transfer authority.
- Separate `FP-GAP-01` / `PK-GAP-01` retains an explicit unresolved historical gap despite a present snapshot.
- Original/corrected notices and signed directory correction/revocation history remain inspectable. Unauthorized correction and revoked-key records fail validation.

All identities and claims are fictional. These are registered-holder/evidence findings, not real manufacturer onboarding, NAFDAC registration, legal-title, chemical-safety or authenticity claims.

## Signing, trust and read boundaries

Strict discriminated Zod contracts extend existing H1 primitives. Signing uses the exact once-serialized UTF-8 payload, compact ES256 JWS and pinned `alg`/`typ`/`kid`. SHA-256 binds the exact JWS string; verification retains original bytes. Root-authenticated, contiguous versioned directory changes bind prior/new state hashes. Current key role, record-type permission, namespace and validity are checked; revoked/unknown keys, unknown roots, JWK/URL-bearing token headers, altered payloads/hashes and missing dependencies are rejected. Corrections require authorized scope, signed source/replacement dependencies and increasing revision. P1A applies issuer notice corrections only; changes to other projections require a dedicated later handler.

Root/issuer private keys are only in owner-only ignored `.local/p1/offline-keys.json`. `record:sign` is an offline CLI, never an HTTP route. Its output was independently verified against public pinned trust: [CLI evidence](p1a-signing-cli.json). Public seed material makes repeat seeding possible without possessing or regenerating private keys. Missing operator keys cannot silently replace the pinned root. Production key provisioning/rotation and trusted offline bootstrap remain later work.

The SQL repository loads original signed sources and private projections through an injected read-only executor. Four typed services revalidate signatures, current issuer authority, dependencies and item/owner/marking consistency inside each handler: product/issuer, seller, notices and history. Tests and the `demo:read` CLI actually execute reads as PostgreSQL `service_role`, whose claim/projection write grants are revoked. [Actual read findings](p1a-read-services.json). The privileged database login is used only by explicit local migration/seed/test commands; no web write service or client-controlled SQL is exposed.

Matched markings establish record consistency; `physicalBinding` remains `unresolved`. Unknown units and shared scopes remain incomplete. Notices are filtered by issuer/model/batch/time and correction history, with coverage limited to this fictional dataset. Histories keep gaps visible. Public responses use strict allowlists and exclude private buyer identity, device keys, sensitive location, private media, credentials and raw private projections. The anonymous Data API exposes only the minimal public product table; raw signed claims remain in the restricted schema.

Exactly six H2 names/input schemas and typed future image/additional-evidence interfaces are prepared. Only the four deterministic read services are implemented. The official Meta gateway, offline LangChain compatibility implementation, optional privacy-filtered LangSmith boundary and both conditional Glimmer directions remain preserved. There is no model loop, new SAM processing, persistent pause/resume or serving-application access to offline signing keys.

## Actual checks

After activating the existing Node **24.22.2** / pnpm **12.16.1** toolchain:

| Command | Actual result |
| --- | --- |
| `pnpm db:inspect` (equivalent direct `node --env-file=.env.local --import tsx scripts/p1/database.ts`) | Passed; exact dedicated project, initially empty application schema, PostgreSQL 17.11 |
| `pnpm db:migrate` twice | Passed; applied once, second run hash-verified/no DDL |
| `pnpm demo:prepare` | Passed; 27 signed records, public fixtures reproducible without private keys |
| `pnpm demo:seed` | Passed; 27 records, three units, no negative record inserted |
| `pnpm typecheck` | Passed |
| `pnpm test --reporter=json --outputFile=docs/packproof/evidence/vitest-p1a-unit.json` | Passed; **68 unit tests / six files** |
| `PACKPROOF_P1A_INTEGRATION=1 pnpm test:integration --reporter=json --outputFile=docs/packproof/evidence/vitest-p1a-integration.json` | Passed; **six actual Supabase integration tests**, not offline substitutes |
| `pnpm demo:read` | Passed; database-backed findings under the serving role |
| `pnpm record:sign .local/p1/signing-cli-input.json .local/p1/offline-keys.json issuer .local/p1/signing-cli-output.json` plus independent public verification | Passed; only ignored operator key file accessed |
| `pnpm build` / `pnpm probe:bundle` | Passed; server/P1 CLI modules and configured secret bytes excluded |

Unit coverage includes valid issuance/mapping, issuer role/type/namespace enforcement, revoked/unknown/self-supplied trust, exact bytes/hash/payload tampering, strict schemas, Shop A/B, scope separation, match/mismatch/product-only, notice applicability/corrections, retained gaps, missing audit/dependencies and public field allowlists. The original 43 unit tests are retained. Three isolated negative bundle checks also reject server modules, the offline signing CLI and offline-key markers; [results](p1a-bundle-negative.json). No real secrets or served assets were used/changed.

Integration tests verify signed source loading, all four read services, repeated seeds with unchanged counts/owners, refusal to reseed over an owner change, real PostgreSQL grants/RLS/immutable triggers, anonymous HTTPS reads and rejected anonymous writes. Cross-account tests use actual PostgreSQL roles and simulated `request.jwt.claims` inside transactions with temporary synthetic Auth rows; **all those fixtures roll back**. They are not browser sign-in/session validation. The API tests use the configured publishable key, not a service key. [Per-check evidence](p1a-integration-checks.json), [Vitest integration report](vitest-p1a-integration.json).

Initial sandbox networking was blocked; approved exact-project execution succeeded. Seed preparation initially rejected a future-dated UTC fixture while local WAT had already reached 2 November; its timestamp was corrected to a prior UTC instant before seeding. No future-time check was disabled. Earlier raw rejected material stays ignored; only valid records were seeded.

## Acceptance and next checkpoint

| Gate | P1A contribution | Still required |
| --- | --- | --- |
| A1 | Four deterministic read services return real signed seeded sources and references | Six-tool LangChain/Muse execution and a cited final finding |
| A2 | Unknown/unauthorized issuer and invalid evidence fail closed; missing units/history stay unresolved | Mandatory finalizer/omitted-check coverage across the complete agent |
| A3 | Strict tool inputs and integrity/authority failures cannot create supported records | Full-loop malformed calls, prompt injection, provider failure and exhausted-budget behavior |
| A4 | Strict image/request interfaces only | Useful closer-view request, durable pause/resume and product UI |
| I1 | Match/mismatch, product-only, shared carton, distinct scopes and applicable notices verified | Tool/UI end-to-end behavior in full P1 |

No complete A1–A4/I1 gate is marked passed. P1B can build on this foundation after its next bounded prompt; live provider validation additionally requires an explicitly authorized separate budget. The exhausted P0 ledger is unchanged: **seven calls / $3 reserved**, actual historical billed spend unknown, **zero new Meta requests and zero new provider reservations/spend in P1A**. Never reset/bypass it. P0 F3/F4 physical QR/JSON/tamper tests remain deferred/not_run, not waived. No schema/access blocker remains for this development foundation; browser Auth, production object policies, full Investigator, future transfer authorization and offline trust/freshness remain unfinished.

Current documentation consulted through Context7: [Supabase RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security) and [jose CompactSign/verification](https://github.com/panva/jose/tree/main/docs/jws/compact). No packages or lockfiles changed; installed Zod 4.6.7 / jose 6.2.14 remain in use.
