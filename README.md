# PackProof

**[Open PackProof](https://packproof-p0.vercel.app/) · [Developer tools](https://packproof-p0.vercel.app/developers) · [TypeScript SDK on npm](https://www.npmjs.com/package/@packproof/sdk)**

PackProof helps people check product evidence, inspect visible markings, record a buyer–seller handover and verify saved evidence without internet. Everything starts at one homepage and uses the same accounts, backend and verification contracts.

Signed records, database authorization and cryptographic checks are real. Prepared products are synthetic and identified as sample evidence. Matching records or photographs do not establish physical authenticity, safety, legal title or uninterrupted custody.

## What you can do

| Feature | What it does |
| --- | --- |
| [Products](https://packproof-p0.vercel.app/products) | Manufacturers save private product drafts, literal model/batch/unit/container identifiers and original evidence. Trusted issuance requires separately verified issuer approval. |
| [Investigator](https://packproof-p0.vercel.app/investigate) | Checks signed product and packaging records, seller authority, notices and custody history. Muse selects typed tools and explains the verified findings; mandatory checks run independently. |
| [Inspector](https://packproof-p0.vercel.app/inspector) | Captures or imports a photo, or selects a frame from a short video. Supports movable, resizable and lockable regions, crop previews, consent, SAM grounding, literal Muse readings and requests for a clearer view. |
| [ChainProof](https://packproof-p0.vercel.app/chainproof) | Two authenticated people exchange rotating QR checks, review the exact item and sign their approvals. An atomic ownership update produces a verifiable receipt. |
| [DualProof](https://packproof-p0.vercel.app/dualproof) | Compares participant-bound dispatch and arrival evidence, identifier/expiry readings, visible condition and source integrity. Differences can be investigated in Inspector. |
| [OfflineProof](https://packproof-p0.vercel.app/offline/index.html) | Downloads or imports `.packproof.json` evidence packs. Verifies signatures and dependencies locally, rejects tampering and keeps accepted records available after reopening offline. |
| [Developer tools](https://packproof-p0.vercel.app/developers) | Provides scoped API keys, REST API v1, the published SDK, MCP and native browser WebMCP tools using the same authorization and evidence contracts. |
| [Device checks](https://packproof-p0.vercel.app/tools) | Retains the camera, manual-entry, QR-rate, browser cryptography and JSON-transport feasibility probes. |

## Try the app

Open **[PackProof](https://packproof-p0.vercel.app/)** and choose a task. Public record checks work without an account. Private evidence, product drafts and handovers require sign-in.

For a reviewer, the operator supplies one private invitation. Open it to sign in and return to the homepage. The operator's ignored `.local/review/access.html` brings together **12 seller–buyer pairs**, their assigned items, the separate manufacturer sign-in and the app/developer/npm links. Share each person's invitation individually.

- **Seller:** owns the pair's assigned items at the start and initiates the handover.
- **Buyer:** receives the item; use the buyer from the same pair on a second phone.
- **Manufacturer / Producer:** creates drafts and attaches original product evidence using the separate sign-in on the access sheet.

A useful review order is **check records → inspect a label → hand over → compare evidence → keep a signed pack offline**. For manufacturer testing, use Products → Use a sample product → Save product → Add photos or video. A saved sample includes a label you can display or print and photograph. Your own product details can be entered instead. After receiving an item, the buyer can sell onward with the same account and enrolled device.

The Investigator includes these prepared examples:

| Example | What to observe |
| --- | --- |
| Matching records · registered owner | Supported record evidence; the physical item remains uninspected. |
| Shop A · unauthorized seller | Seller authority blocks the claimed handover. |
| Incomplete custody history | The history gap remains unresolved and requires evidence. |
| Shop B · previously transferred item | Current ownership is checked; an earlier seller cannot automatically sell it again. |

For physical inspection, photograph a clearly printed label or open the sample label linked from the homepage. Choose the requested marking, select and lock its region, and consent before live processing. Poor or missing evidence stays unknown. The tool can request a closer or clearer view and resume the saved investigation.

For OfflineProof, first prepare each browser online. Download a signed pack, share it by Bluetooth or an identified local Wi-Fi route, then import it with internet off. The file contains signed evidence and public verification material; private signing keys are never transferred.

## Accounts and product issuance

There are only two primary account types:

- **Regular User:** buys, sells, distributes, inspects, receives and transfers according to actual ownership and authorization.
- **Manufacturer / Producer:** can also create private product drafts and attach original evidence.

Buyer, seller, distributor, wholesaler and retailer are transaction roles. Switching between buying and selling does not require registering again. Every handover still needs two distinct authenticated identities, independently controlled device keys and both explicit signed approvals.

Product creation has three steps: **save a draft → attach original evidence → verified issuer review and signing**. Draft creation and evidence capture are implemented. **New trusted issuance remains blocked until a separately authorized issuer-signing workflow is configured.** Choosing a manufacturer profile never grants that authority. Prepared, previously signed sample items can be used for the handover flow.

## AI, evidence and trust

Authorized reviewers can use live **Meta Muse `muse-spark-1.3`** and **SAM `sam-3.1`** through server-only credentials. Their shared allowance is **$10 total**, including prior reservations, with no separate request-count cap. Requests stop when the allowance or access period ends. Anonymous and other non-reviewer sessions use explicitly recorded AI responses with real database checks. Uploaded images and selected video frames require processing consent before live inference.

Muse uses typed, read-only evidence tools. Zod validates requests and findings. Deterministic signature, scope, freshness, seller-authority, ownership and consent gates remain mandatory. SAM output is parsed with `@meta-sam/parser`; saved masks, boxes and crops stay bound to their actual source hashes. A printed expiry reading is separate from regulatory registration and batch validity.

Short MP4/WebM clips are limited to **8 seconds / 3 MiB** and decoded into timestamped frames with **FFmpeg 9.0.2**. Only the selected frame enters image analysis; whole-video tracking or forensic editing detection is not claimed. DualProof keeps human condition notes separate from model observations.

Prepared examples have a finite 14-day review window through **18 November 2026**. Actual signed dates remain visible. Ordinary records and transfer checks retain their expiry rules; stale evidence requires a fresh check. A snapshot records ownership at a stated time—it does not make an item expire. The snapshot-only delegate cannot issue products, sign participant consent or change ownership.

OfflineProof pins trusted roots, verifies signed dependencies, prevents rollback and stores accepted packs atomically in IndexedDB. Unknown roots and tampered packs fail verification while previously accepted evidence remains available. Expired packs remain dated history. An absent notice never means clearance.

Root and original product-issuer private keys stay offline. Receipt, pack and ownership-snapshot signers have separate purposes. Raw media stays private; secrets and private model reasoning do not belong in logs, Git or browser bundles.

## API, SDK, MCP and WebMCP

Install the MIT-licensed SDK:

```bash
npm install @packproof/sdk
```

```ts
import {PackProofClient} from '@packproof/sdk';

const client = new PackProofClient({baseUrl: 'https://packproof-p0.vercel.app'});
const result = await client.call('products.lookup', {
  namespace: 'packproof-demo',
  productMark: 'FP-1001',
  packagingMark: 'PK-2001',
});
console.log(result.status);
```

The published package is **`@packproof/sdk@0.1.0`**, with typed inputs/results, runtime validation, cancellation, timeouts and structured errors. Its registry archive and clean-install checks are recorded in [sdk-release.json](docs/packproof/evidence/sdk-release.json).

- **REST:** POST JSON to `https://packproof-p0.vercel.app/api/v1/<operation>`. Public reads need no key. Private operations use the current session, a Supabase access token or a scoped developer key. Transfer proposals require an `Idempotency-Key` UUID.
- **Developer keys:** create, rotate and revoke them on the Developers page. Keys are hashed, scoped, expiring and rate-limited. Keep credentials out of source code and public bundles.
- **MCP:** connect a Streamable HTTP client to `https://packproof-p0.vercel.app/api/mcp`. Tool names use underscores, such as `products_lookup`. Private tools use the same scoped Bearer credential. Official MCP server/client packages are pinned at `2.4.0`.
- **WebMCP:** compatible browsers expose native `document.modelContext` tools. Writes require confirmation; unsupported browsers retain the normal interface.

Inputs and outputs are defined in [api-v1.ts](src/contracts/api-v1.ts). Integrations cannot bypass ownership checks, sign participant consent or autonomously commit a handover. Notice events retain verified scope, effective dates and stable idempotency; a history gap is never a danger alert.

## Architecture and local development

The app uses **Next.js 16.4.3 / React 19.3.1 / strict TypeScript 7.0.2**, Supabase PostgreSQL/Auth/private Storage, LangGraph/LangChain, Zod, jose ES256/SHA-256, ZXing, the SAM parser and a cached offline PWA. The `openai` and `@langchain/openai` dependencies provide compatible transport to Meta; the configured model provider is Meta.

Use the pinned **Node 24.22.2** and **pnpm 12.16.1** toolchain with the single `pnpm-lock.yaml`:

```bash
bash scripts/setup-toolchain.sh
export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"
pnpm install --frozen-lockfile
# Configure ignored .env.local from .env.example.
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @packproof/sdk build
```

The first video build needs network access, `cc`, `make` and `tar` to compile hash-pinned FFmpeg source. Later builds reuse a verified platform cache in ignored `vendor/ffmpeg/`. Binaries stay out of Git and browser bundles. `next-env.d.ts` is generated and ignored.

Migrations under `supabase/migrations/` are additive; applied hashes are immutable. `scripts/platform/migrate.ts` verifies/applies platform migrations 010–015 to the configured project. Preserve existing accounts, signed records, receipts and ownership versions when testing.

## Validation and current limits

[BUILD_STATE.json](project_handoff/BUILD_STATE.json) holds current acceptance/deployment status, [BUILD_LOG.md](project_handoff/BUILD_LOG.md) records material changes, and [evidence](docs/packproof/evidence) contains sanitized provider, budget, cryptographic and test receipts.

Recorded validation includes live Muse/SAM, schema and malformed-provider checks, signature/tamper rejection, database authorization, API/SDK/MCP/WebMCP execution, bounded video decoding and multi-leg ownership handovers. Physical vivo Y03 and Redmi 10A checks cover camera/QR feasibility, signed handover recovery and Bluetooth offline pack verification, reopening and tamper rejection. Newer interface checks use desktop Chrome at mobile widths; they do not replace a new Android walkthrough.

Public signup email delivery remains unverified after provider rate limits. Trusted issuance for new drafts awaits separately authorized signing. The public source repository and final film are not yet supplied. Radio/voice workflows, Glimmer distillation and native radio/mesh integration are future work. Conditional distillation may support offline guidance on compatible POS/Android devices; hosted Glimmer is not a model running directly on ordinary POS hardware.
