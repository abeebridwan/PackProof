# PackProof

PackProof connects signed product records, visible evidence, registered handovers and offline verification in one Next.js PWA. The demonstration uses sample products; signatures, database authorization and cryptographic checks are real. A matching code or photograph never establishes authenticity, safety, legal title or uninterrupted custody.

The permanent application is [packproof-p0.vercel.app](https://packproof-p0.vercel.app/review). The Terminal 1 checkpoint is deployed and runtime-validated on [protected Preview](https://packproof-p0-preview.vercel.app/review); they have **not been promoted to Production**. Current acceptance and deployment status live in [BUILD_STATE.json](project_handoff/BUILD_STATE.json).

## Accounts and the connected flow

There are exactly two account types:

- **Manufacturer / Producer** creates private product drafts and original evidence. Selecting it does not grant trusted issuer authority.
- **Regular User** buys, sells, distributes, inspects and transfers according to registered ownership and permitted delegation.

Buyer, seller, distributor, wholesaler and retailer are transaction roles. A receiver uses the same account and enrolled device when selling onward. A consumer does not need another seller registration. Every ChainProof handover still requires two distinct authenticated identities, independent device keys, fresh QR checks and both explicit signed approvals.

| Page | Purpose |
| --- | --- |
| `/review` | Start the guided sample journey or enter a private reviewer invitation. |
| `/account` | Register, sign in and choose one of the two account types. |
| `/products` | Save literal model/batch/unit/container identifiers and original producer evidence. |
| `/` | Investigate signed product, seller, notice and custody records through the six typed tools and mandatory Evidence Engine. |
| `/inspector` | Capture a photo, select a region, give processing consent, inspect a visible detail and resume with a clearer view. |
| `/chainproof` | Receive or send an exact registered item, exchange signed QR sequences and verify the receipt. |
| `/dualproof` | Compare participant-bound dispatch and arrival evidence; open Inspector for discrepancies. |
| `/offline/index.html` | Download or import signed evidence packs and verify them offline after trusted setup. |
| `/developers` | Scoped API keys, REST operations, local SDK, MCP and browser tools. |
| `/tools` | Retained P0 device feasibility checks. |

Private reviewer invitations remain in ignored `.local/review/access.html`. An invitation’s buyer/seller hint does not restrict the account’s transaction roles. Live Muse/SAM requires authorized reviewer access, consent for the submitted media and remaining capacity in the existing PostgreSQL-metered **$5 shared allowance**. Other sessions remain explicitly recorded; unknown readings stay unknown.

Public signup honors Supabase confirmation and mail limits. Automated reserved-address signup hit a provider rate limit; email delivery remains unverified. Synthetic acceptance accounts were explicitly provisioned for the remaining tests. Product drafts are private submissions: **trusted new issuance remains blocked until independently authorized signing is configured**. No manufacturer signature is silently created. A separately approved, snapshot-only demo delegate can attest verified registry ownership for an onward handover through 18 November; it cannot issue a product, approve a handover or change ownership. Ordinary transfer-authority snapshots retain their freshness requirements; the existing finite judge window is not an automatic renewal mechanism.

## Evidence and trust

Inspector preserves original image fingerprints, selected regions, actual SAM masks/crops and model provenance. It distinguishes printed expiry from regulatory registration and batch validity. Short MP4/WebM clips are bounded to **8 seconds / 3 MiB**, decoded server-side into timestamped frames, and retained privately. Only the selected frame can enter the existing SAM/Muse path with consent; video tracking and forensic editing detection are not claimed.

DualProof compares literal product/packaging readings, printed expiry, source-bound visible seal/surface observations, original/crop/frame integrity, source reuse and applicable signed packaging notices. Human condition notes remain labelled separately. Missing or unclear evidence stays unresolved. Comparison results do not authorize ownership changes; ChainProof independently checks signed authority, current ownership/version, participant devices, consent and an atomic commit.

OfflineProof preserves the existing `.packproof.json` format, pinned trust, signed dependencies, rollback protection, atomic IndexedDB storage and offline PWA. An expired pack remains dated history; an absent notice never means clearance.

Root/product-issuer private keys stay offline. Existing receipt-only and pack-only signers keep their separate purposes. No secrets, raw customer media or private model reasoning belong in logs, browser bundles or Git.

## Local development

Use **Node 24.22.2**, **pnpm 12.16.1** and the single `pnpm-lock.yaml`:

```bash
bash scripts/setup-toolchain.sh
export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Configure ignored `.env.local` from `.env.example`. The pinned toolchain is local to this repository; export its PATH in each terminal. `next-env.d.ts` is generated and ignored.

Video support builds a minimal **FFmpeg 9.0.2** decoder from hash-pinned official source using `cc`, `make` and `tar`. `pnpm video:prepare` prepares it; tests/build invoke it and reuse a verified matching-platform cache in ignored `vendor/ffmpeg/`. No binary enters Git or the browser bundle. The first build needs network access and a C toolchain.

`node --env-file-if-exists=.env.local --import tsx scripts/platform/migrate.ts` applies/verifies additive migrations **010–014** in the existing dedicated project. Applied migration hashes are immutable. Existing Supabase/Storage configuration and signed data are preserved.

## Developer integration

POST JSON to `/api/v1/<operation>`. Inputs and outputs are defined once in [api-v1.ts](src/contracts/api-v1.ts). Public demo reads need no key. Private calls use the current session, a Supabase access token or a hashed, scoped, expiring developer key. Keys can be rotated or revoked; per-key/user/global quotas apply. Transfer proposals require an `Idempotency-Key` UUID. No agent operation commits ownership or signs participant consent.

The local `@packproof/sdk` workspace builds with `pnpm --filter @packproof/sdk build`; it supports typed calls, validation, timeout, cancellation and structured errors. Run its read-only example with `PACKPROOF_BASE_URL=http://localhost:3000 pnpm exec tsx packages/packproof-sdk/example.ts`. It has not been published to npm. The official MCP v2 server/client packages are pinned at **2.4.0**; stateless Streamable HTTP is served at `/api/mcp`. Native browser enhancement uses `document.modelContext.registerTool()` with lifecycle cleanup and confirmation before writes; unsupported browsers retain the normal UI.

Notice events reference verified effective demo packaging notices, carry stable idempotency keys and retain scope/freshness provenance. A custody gap is never a danger alert. Private signing keys and privileged ownership operations are not integration tools.

P0–P3 and P4 functional phone checks remain recorded in [evidence](docs/packproof/evidence). The original FP-1002 transfer, its version-2 owner, signed receipt and original signed claims must never be reset for repeat testing. Final release still needs the public repository and demo film. This workstream does not implement communications, Ember training or Bitchat integration.
