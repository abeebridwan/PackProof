# Build log

No implementation has started. Append phase evidence; do not replace failed attempts with inferred success.

## 30 October 2026 — P0 feasibility, partial checkpoint

The initial line above records the starting state; P0 local implementation now exists. P1–P4 remain not_started.

User instructions: rename `info_files` to a clearer name, preserve evolving product direction, and report completed tasks in chat after each bounded prompt. Renamed to `project_handoff`; existing BUILD_STATE and BUILD_LOG remain inside that renamed folder. Added Product_Direction_Notes.md covering both Glimmer POS/Android evidence guidance and radio/voice workflows, shared backend/contracts/signed caches, mandatory deterministic crypto/ownership checks, conditional post-core distillation and no Glimmer-30B-on-ordinary-POS claim. Preserved all original handoff files, DOCX and protected metadata.

Repository preflight: no application/package/lockfile existed; supplied `.git` is empty/read-only. `git status --short` failed with exit 128 and still does; no claim of clean Git or secret-free history. No on-disk applicable AGENTS.md found; supplied instructions and RTK.md followed. Context7 used for current jose/Zod/ZXing docs; official Meta docs and installed SAM types used for provider/parsing shapes. Inspected actual workshop submit_memo/set_checklist handlers; mandatory PackProof execution boundaries documented in docs/packproof/evidence/P0.md without importing verification-off/retry-acceptance behavior.

Added Node 24.22.2, pnpm 12.16.1, strict TypeScript 7.0.2, exact dependency pins and one pnpm-lock.yaml. System defaults were Node 22.23.3 and pnpm 9.1.1; installed isolated pinned toolchain under /tmp/packproof-toolchain. `.gitignore` covers `.env*` including copied examples except `.env.example`, `.local`, generated assets and private/TLS keys. No test/issuer private key was saved; generated keys remain in Node memory or nonextractable browser CryptoKeys.

Files added: src/contracts/p0.ts; src/domain/verification/p0-crypto.ts; scripts/spikes/{fixture-registry,provider-contract,provider,sam,budget,access,evidence,build,serve,phone,crypto-browser,check-bundle}.ts; scripts/spikes/phone.html; tests/unit/{p0,sam}.test.ts; root tooling/config/README; docs/packproof/evidence/P0.md and PHONE_CHECKS.md. Generated sanitized provider/crypto/access/bundle/test evidence, actual SAM token/mask/original/grounded/crop artifacts and desktop screenshot under docs/packproof/evidence. Registry is read-only fictional demo data; no ownership/issuer verification is inferred from it.

Actual provider attempts, retained rather than erased:

- `pnpm probe:provider`: exit 2. Account authentication/model list worked; Muse selected typed tool and the real fixture tool ran. Final answer did not meet completion checks; exact finish reason not retained in first script. SAM did not produce an accepted region. Saved provider-attempt-1.json.
- `pnpm probe:provider --resume-tool`: exit 2. Reconstructed the minimal tool envelope from the already observed real call ID and validated result, explicitly labeled it, and raised completion cap from 512 to 2048. Muse final passed schema/fact validation. SAM completed with empty output, so it remained failed; saved provider-attempt-2.json.
- `pnpm probe:provider --sam-only`: exit 0. Official prompted box/point SAM call returned a real 324×247 mask, 79,533 nonzero pixels, within 600×480 synthetic source. Official parser decoded actual special tokens. Muse read `0071842` from the actual grounded image/crop without expected text in the request. Saved provider.json and provider-attempt-3.json; full IDs/shapes in P0.md. No fabricated JSON or mask substitutions.

Budget: user confirmed approximately $140 Meta credit and locally configured MODEL_API_KEY. This is not independent balance evidence. Seven inference calls total. First five reserved $0.50 each; observed usage/pricing justified $0.25 for the final two, raising the internal call limit from six to seven while retaining the hard $3 total and no refunds. Persistent ledger now reserves all $3; no further calls under this run. Actual billed spend unknown; partial known-usage estimate $0.014813 excludes earlier missing envelopes. No Contributor model or purchases.

Validation used `PATH=/tmp/packproof-toolchain/node_modules/.bin:$PATH`:

- `pnpm install`: exit 0; exact pins/one lockfile.
- `pnpm typecheck`: final exit 0. Earlier failures were `APIError.request_id` versus installed SDK's `requestID`, and Node parseEnv's possibly undefined dictionary values; repaired without reducing strictness.
- `pnpm test --reporter=json --outputFile=docs/packproof/evidence/vitest.json`: exit 0, 19 tests / 2 files. Strict schemas, malformed tools/SAM, unknown/unreadable, injected labels, budget limits, exact-byte crypto/trust/tamper, and actual SAM token replay with chunk boundaries.
- `pnpm build`: exit 0; isolated browser probe.
- `pnpm probe:bundle`: exit 0; server/provider modules and configured secret bytes absent.
- `pnpm probe:crypto`: final exit 0; real desktop Chrome 156.0.8078.47, both ES256 directions, nonextractable browser private key, wrong key/role and tamper rejection. Manual-input leading zeros, small JSON import and malformed JSON refusal checked only on desktop. Screenshot saved and visually inspected.
- `pnpm probe:access`: exit 0 for inventory; missing host/Supabase/phone facts remain blocked.
- `pnpm audit --json`: exit 0, no known advisories at check time.
- Initial browser probe inside the sandbox failed with EPERM on loopback bind. First escalation review could not complete due to an account usage limit; after the user's continuation, approval succeeded and actual loopback/browser checks completed. No failed execution was reported as a pass.

Acceptance: F1 passed on controlled synthetic feasibility; F2 passed on Node/desktop browser. F3 blocked: intended primary phone vivo Y04 (user-reported), OS/browser unrecorded, second phone unknown, actual camera/5–10 fps scans not_run. F4 blocked: host/TLS/domain absent, Supabase access unverified, phone-to-phone Bluetooth/local Wi-Fi transport not_run. The user reports Chrome login and permits new Supabase project creation; a Supabase integration was discovered/suggested but is not confirmed connected, so no project or resources were created. See access.json and PHONE_CHECKS.md.

P0 is partial, not verified. P1 not ready; stop here. Next bounded work is to verify existing HTTPS/Supabase access and collect actual vivo Y04/second-phone camera, manual fallback, QR rate/reliability and exact transport evidence. These are manual gates, not desktop-equivalent success. No full PWA, transfers, OfflineProof, Glimmer/student or radio work started.

## 30 October 2026 — intended device correction

User corrected the intended primary phone from vivo Y04 to **vivo Y03**. Updated the current access inventory, access script, build state, P0 report and manual-check instructions. Earlier log entries retain the original report as history. No phone tests were performed; F3/F4 remain blocked and P0 remains partial.

## 30 October 2026 — local terminal toolchain repair

User's terminal ran system pnpm 9.1.1, causing a missing/empty workspace packages error and a pinned package-manager version refusal. Added explicit `packages: ['.']` to pnpm-workspace.yaml while retaining approved build scripts. Added `scripts/setup-toolchain.sh` to install exact Node 24.22.2/pnpm 12.16.1 under ignored `.local/toolchain` using npm only for tool bootstrap; the project continues to use pnpm and its existing single lockfile. Updated README with setup and per-terminal PATH activation. System Node/pnpm and version/engine guards are preserved.

Verified `bash -n scripts/setup-toolchain.sh`, initial bootstrap, no-download repeat bootstrap, and `pnpm install --frozen-lockfile` using the local toolchain (exit 0). Typecheck, 19 tests, build, bundle checks and access inventory pass. The initial sandbox-only install check could not acquire the external pnpm store lock; the approved store-access retry succeeded. No provider calls or budget resets occurred. Git is now initialized (a change since the initial snapshot); current project files are untracked and no commits were made. Removed the obsolete not-initialized-Git claim from current bundle-check metadata. P0 remains partial with F3/F4 blocked.

## 30 October 2026 — project README

Rewrote the root README as a PackProof introduction and developer guide in response to the user correction. It describes product intent, current working capabilities, setup, commands, browser/phone testing and repository layout. Phase tracking, rename history and execution details remain in the linked handoff/evidence records. Current limitations and the exhausted live-probe allowance remain explicit. Documentation-only change; application behavior and acceptance status unchanged.
