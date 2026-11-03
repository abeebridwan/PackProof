# PackProof

PackProof is a product-evidence project for buyers, sellers and mechanics who want to understand goods before buying, handing them over or receiving them. It aims to connect visible markings, issuer records, product notices and signed handovers, with clear explanations of what the evidence supports and what is still unknown.

The planned experience combines guided camera inspection, seller authorization checks and signed evidence that can be consulted offline. The first demonstration uses fictional product records and packaging. Product direction and requirements will evolve as the system is built and tested.

## What works today

The repository maintains one evolving Next.js/React application, with feasibility probes retained as development tools:

- Strict schemas for markings, verification results, transfer agreements and signed pack manifests.
- A read-only fictional registry that Muse can query through a typed tool, with independently validated responses.
- Real SAM segmentation through Meta's Responses API and the official parser, with saved masks, boxes and source-image references.
- A demonstrated Muse reading of a visible marking from a grounded synthetic image.
- ES256 signing and verification between Node and a browser, SHA-256 integrity checks, and rejection of tampered data and untrusted keys.
- A browser test page for camera capture, manual identifiers, rotating QR handles and small JSON file export/import.
- A Supabase data foundation with immutable signed claims, versioned issuer-directory audit history, scoped key permissions and restricted writes.
- Signed fictional units, packaging mappings, seller authorization, packaging notices and explicit custody gaps, with typed server read services.
- A mobile-first Next.js Evidence Investigator with six typed tools, mandatory server finalization, private session-scoped API routes, private image capture storage and durable LangGraph pause/resume.
- LangChain runs the web tool loop against recorded protocol responses; the read tools use real signed Supabase records. Guarded CLI validation has passed real Muse seller, notice, custody-gap and evidence-request workflows. Optional LangSmith traces contain only allowed metadata. New live image analysis remains disabled.
- ChainProof account-bound device enrollment, two-way signed QR exchange, atomic registered ownership changes, signed receipts and recovery are implemented and tested locally with isolated Supabase fixtures. P2 is verified and published in the same public app, following user-confirmed two-phone handover and independent database/signature checks.

Open **[PackProof](https://packproof-p0.vercel.app)** for product investigations. The **[device checks](https://packproof-p0.vercel.app/tools)** are part of the same website and linked from its footer. Both use the existing `packproof-p0` Vercel project; product evidence uses the existing Supabase project. The public application does not require a Vercel login. Use [ChainProof handover](https://packproof-p0.vercel.app/chainproof) on both phones. The protected [Preview](https://packproof-p0-preview.vercel.app/chainproof) remains available for operator checks.

The same Investigator is available locally through `pnpm dev` at `http://localhost:3000`. Model steps are recorded demos; evidence reads use the signed database. Its deployed browser, session-isolation, database, private-capture and rate-limit checks are recorded in the delivery evidence. The user confirmed all requested vivo Y03 Investigator checks passed; no new device measurement report was supplied. P0 feasibility is verified: provider, crypto, phone camera/manual fallback, two-phone QR and JSON transport checks passed. Both-direction file matching and the final nonce-tamper/truncated-JSON rejections include user-confirmed manual results; exact per-speed QR attribution remains a documented limitation. Authenticated handovers passed real two-phone Preview acceptance and public Production sign-in/receipt recovery checks. The same demo accounts work on Production; browser signing keys are bound to their original domain, while existing receipts can be verified without re-enrollment. Self-service account/shop onboarding and automatic issuer snapshot renewal are not implemented; the demo uses operator-provisioned accounts. The offline viewer remains planned. Synthetic visual results establish feasibility, not accuracy on real products.

Signed demo custody snapshots expire after **2 November 2026, 12:00 UTC**. Expired investigations show stale/historical evidence, including on reload; retrieving them does not renew authority. Those original public snapshots were not renewed or reseeded. P2 appends a separate restricted current-state authorization snapshot and a receipt-only key grant, after independently checking the existing source state. The user approved encrypted Supabase credentials for Production as well as Preview. Root and product-issuer private keys stay offline. The dedicated receipt-only key is encrypted in Preview and explicitly approved Production; no Meta key is deployed. See [deployment evidence](docs/packproof/evidence/p1d.json).

## Local setup

Required tools: **Node 24.22.2** and **pnpm 12.16.1**. From the repository directory:

```bash
bash scripts/setup-toolchain.sh
export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"
node --version
pnpm --version
pnpm install --frozen-lockfile
```

The version commands should print `v24.22.2` and `12.16.1`. The setup script installs the pinned tools under the ignored `.local/toolchain/` directory and preserves system installations. Run the PATH export again from the repository directory in each new terminal. Project dependencies use pnpm and `pnpm-lock.yaml`.

Local checks and the browser test page can run without model credentials. For provider or deployment configuration, use `.env.example` as a reference and configure an ignored `.env.local` file. Keep credentials and private keys out of source control and browser code.

## Development commands

See [TESTING.md](TESTING.md) for feature-by-feature commands, expected results and manual browser steps.

```bash
pnpm dev  # Investigator at http://localhost:3000
pnpm typecheck
pnpm test
pnpm build
pnpm probe:bundle
pnpm probe:crypto
pnpm probe:access
```

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | Check strict TypeScript types. |
| `pnpm test` | Run schema, provider-output, parser, budget, trust and tamper tests. |
| `pnpm build` | Build the Next.js Investigator and preserve the standalone P0 page in `dist/`. |
| `pnpm dev` / `pnpm start` | Run the Investigator in development / after a production build. |
| `pnpm db:migrate:p1b` | Apply/verify the additive P1B runtime migration and restricted official Postgres checkpointer. |
| `pnpm db:migrate:performance` | Apply/verify the additive operation-reservation performance function after P1B migration. |
| `pnpm evaluate:p1b` | Run the shared 12-case evaluation against a signed database snapshot using recorded responses. |
| `pnpm p1c:budget status` | Inspect the independent P1 approval/reservation ledger; does not approve spending. |
| `pnpm p1c:live` | Run guarded operator-only live validation after separate approval; refuses all Meta requests while unapproved. |
| `pnpm p1c:budget --completion status` | Inspect the fixed follow-up grant; its16-request allowance is exhausted. |
| `pnpm p1c:budget --repair status` | Inspect the new $4 dollar-only grant without making a provider call. |
| `pnpm p1c:complete` | Report/run the separately authorized completion attempts; preserves prior evidence and skips completed cases. |
| `pnpm probe:bundle` | Check browser inputs and output for server modules and configured secrets. |
| `pnpm probe:crypto` | Exercise Node/browser signing, verification and local browser checks. |
| `pnpm probe:access` | Report which access settings are configured, without printing credentials. |
| `pnpm probe:serve` | Serve the browser test page locally. |
| `pnpm probe:langchain` | Check LangChain tools and LangSmith serialization with intercepted offline transports; no live model calls. |
| `pnpm db:inspect` | Inspect only the dedicated PackProof development schema. |
| `pnpm db:migrate` | Apply or verify the additive versioned P1A migration; rejects an unexpected project/schema. |
| `pnpm demo:seed` | Validate and idempotently seed the published signed fictional records; refuses ownership changes. |
| `pnpm demo:read` | Read actual seeded product/seller/notice/history findings under the serving role, with mandatory signature checks. |
| `pnpm record:sign` | Offline CLI signing using ignored owner-only operator key storage; never a web endpoint. |
| `PACKPROOF_P1A_INTEGRATION=1 pnpm test:integration` | Explicitly run the dedicated Supabase integration checks; temporary RLS fixtures roll back. |
| `pnpm probe:phone` | Run desktop browser checks for the phone surface, including permission errors and altered-file rejection; does not qualify real phones. |

The browser crypto check requires Chrome at `/usr/bin/google-chrome`, or a `CHROME_PATH` override, and permission to start a local loopback server. Desktop results are recorded separately from phone results.

`next-env.d.ts` is generated and ignored. `pnpm typecheck` runs `next typegen` before TypeScript, so a clean checkout can regenerate it. Deployment tooling is in `scripts/deploy/app.ts`; it targets the existing project only and requires a verified IPv4 session-pooler credential file through `PACKPROOF_PREVIEW_DB_URL_FILE`. It defaults to Preview; an explicit `--production` action uses Production variables and publishes to the existing project.

## Open the Investigator

`pnpm dev` opens the local app on port 3000. Choose a fictional scenario, investigate its records, then review the cited product, seller, notice and custody findings. If asked for another view, supply the literal code or a small private image and resume the same investigation. New images remain unknown without authorized live analysis; physical association never follows from a matched code alone.

Use the existing ignored Supabase configuration. For an HTTPS reverse proxy, set `APP_ORIGIN` to its exact public origin. P1B evidence and current limitations are recorded in [P1B.md](docs/packproof/evidence/P1B.md). The app has a PWA manifest and responsive layout; offline installation/verification belongs to P4.

Guarded operator validation has passed real Muse investigations for Shop A's authorization refusal, Shop B's signed notice, the custody gap, and controlled closer-view pause/resume across separate processes. Missing packaging now triggers a specific evidence request before lookup; the supplied code can resume the investigation. Muse's direct nullable-argument generation remains an observed limitation and is never coerced into success. The web UI remains recorded AI, and physical association is never inferred from matching records. See [P1C evidence](docs/packproof/evidence/P1C.md) for receipts, budgets and validation. P1 functional acceptance checks pass, including user-confirmed vivo Y03 use. The same app is published at the permanent URL, with device checks under `/tools`; ChainProof is published under `/chainproof` on the same permanent website, with authenticated transfer endpoints enabled. Its receipt-only key is encrypted for Production under explicit user approval; root/product-issuer private keys remain offline. See [P2 evidence](docs/packproof/evidence/P2.md).

The recorded-AI controller comparison remains **10.05→9.07 seconds** and **123→109 database requests**, with mandatory checks retained. It is one local before/after sample, separate from live-model timings.

## Try the P0 browser test page

```bash
pnpm build
pnpm probe:serve
```

Open `http://127.0.0.1:4173` on the development computer. The page provides local camera capture, manual entry that preserves leading zeros, selectable QR animation rates and a demo JSON transport fixture. Captured phone images stay on the device.

For phone access, configure `PROBE_TLS_CERT` and `PROBE_TLS_KEY` with a certificate/key trusted by the phones, set `PROBE_HOST=0.0.0.0`, and restart the server. Open the computer's reachable HTTPS address on each phone. Camera access requires browser permission and a secure context; the desktop localhost exception does not provide trusted HTTPS to another device.

Follow the [phone test instructions](docs/packproof/evidence/PHONE_CHECKS.md) to record devices, capture dimensions, achieved QR rates, duplicate scans, consecutive distinct frames and the exact Bluetooth or local Wi-Fi file-sharing route. Supply the exporter's separate bytes/hash/nonce fingerprint before importing a received file; otherwise it stays uncompared. The QR page is a feasibility tool; it does not approve ownership transfers. JSON file sharing is a transport check, not a completed offline verification flow.

## Provider access

Provider probes run on the server using `MODEL_API_KEY`, `https://api.meta.ai/v1`, and the account's confirmed access to `muse-spark-1.3` and `sam-3.1`. The registry is explicitly labeled demo data. Provider output is validated before it becomes a finding, and an unreadable marking remains unknown.

Live inference consumes credits. `scripts/spikes/provider.ts` enforces persistent request and cost reservations in `.local/provider-budget.json`. The current probe allowance is exhausted; retain the ledger and review [recorded usage and results](docs/packproof/evidence/P0.md) before authorizing additional calls. Routine development commands above make no model inference requests.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/contracts/` | Shared schemas and application types. |
| `src/domain/verification/` | Signing, integrity and trust-verification functions. |
| `scripts/spikes/` | Provider, browser, camera, QR, transport and access probes. |
| `scripts/setup-toolchain.sh` | Reproducible local Node/pnpm setup. |
| `tests/unit/` | Automated contract, provider and cryptographic checks. |
| `docs/packproof/evidence/` | Validation reports, actual provider artifacts and manual test instructions. |
| `project_handoff/` | Product specification, implementation plan, developer contracts and build records. |

See the [product specification](project_handoff/PackProof_v10_Product_Vision_and_Specification.md), [architecture amendments](project_handoff/Architecture_Amendments.md), [current implementation status](project_handoff/BUILD_STATE.json), [build history](project_handoff/BUILD_LOG.md) and [product direction notes](project_handoff/Product_Direction_Notes.md) for detailed requirements, orchestration/persistence design and conditional Glimmer POS/Android and radio/voice work.
