# PackProof

PackProof is a product-evidence project for buyers, sellers and mechanics who want to understand goods before buying, handing them over or receiving them. It aims to connect visible markings, issuer records, product notices and signed handovers, with clear explanations of what the evidence supports and what is still unknown.

The planned experience combines guided camera inspection, seller authorization checks and signed evidence that can be consulted offline. The first demonstration uses fictional product records and packaging. Product direction and requirements will evolve as the system is built and tested.

## What works today

The repository currently provides a working development foundation and standalone feasibility tools:

- Strict schemas for markings, verification results, transfer agreements and signed pack manifests.
- A read-only fictional registry that Muse can query through a typed tool, with independently validated responses.
- Real SAM segmentation through Meta's Responses API and the official parser, with saved masks, boxes and source-image references.
- A demonstrated Muse reading of a visible marking from a grounded synthetic image.
- ES256 signing and verification between Node and a browser, SHA-256 integrity checks, and rejection of tampered data and untrusted keys.
- A browser test page for camera capture, manual identifiers, rotating QR handles and small JSON file export/import.
- An offline LangChain compatibility spike with strict tool execution and optional privacy-filtered LangSmith events. LangGraph persistence is documented for the full Investigator.

Open the [live feasibility probe](https://packproof-p0.vercel.app) on a phone or browser. It provides local camera/manual/crypto/QR/file controls; product investigations and customer records are not connected to this page.

The full installable PWA, authenticated seller handovers, Supabase-backed records and offline evidence viewer are planned. The vivo Y03 has passed camera capture, manual leading zeros and crypto checks. The user also confirmed the scanner rerun and camera-permission/manual fallback. Two-phone QR and file-sharing trials remain pending. Supabase Auth, Storage API, direct TLS-verified PostgreSQL access and read-only migration-permission checks are verified; the expected private bucket is verified, while production object/RLS policies remain untested. Current visual results establish feasibility on a synthetic fixture; they do not establish accuracy on real products.

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
| `pnpm build` | Build the standalone browser test page into `dist/`. |
| `pnpm probe:bundle` | Check browser inputs and output for server modules and configured secrets. |
| `pnpm probe:crypto` | Exercise Node/browser signing, verification and local browser checks. |
| `pnpm probe:access` | Report which access settings are configured, without printing credentials. |
| `pnpm probe:serve` | Serve the browser test page locally. |
| `pnpm probe:langchain` | Check LangChain tools and LangSmith serialization with intercepted offline transports; no live model calls. |
| `pnpm probe:phone` | Run desktop browser checks for the phone surface, including permission errors and altered-file rejection; does not qualify real phones. |

The browser crypto check requires Chrome at `/usr/bin/google-chrome`, or a `CHROME_PATH` override, and permission to start a local loopback server. Desktop results are recorded separately from phone results.

## Try the browser test page

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
