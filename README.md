# PackProof

**[Open PackProof](https://packproof-p0.vercel.app/) · [GitHub](https://github.com/abeebridwan/PackProof) · [Developer tools](https://packproof-p0.vercel.app/developers) · [TypeScript SDK on npm](https://www.npmjs.com/package/@packproof/sdk)**

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

## Test the application from beginning to end

Use the **[Production homepage](https://packproof-p0.vercel.app/)** throughout. There is no separate app for each feature and no Preview login is needed. Public record checks work without an account. Live AI, private product evidence and handovers require the appropriate sign-in. Start with steps 1–3; use two phones for the complete handover/offline journey.

### 1. Get access and prepare

- Use Chrome on Android or a current desktop browser. Camera capture needs HTTPS and camera permission. Two phones are needed for the actual QR exchange and Bluetooth transport; one browser can still test investigation, inspection, product creation and developer tools.
- **Reviewers:** obtain your individual invitation/code from the project owner through the submission’s private reviewer instructions. Open the invitation, or go to [Home → Have a reviewer invitation?](https://packproof-p0.vercel.app/#reviewer), enter the code and select **Enter reviewer session**. The header changes to **Your account**. Check that the homepage says live Muse/SAM are enabled before testing live image reading.
- **Project owner’s complete access sheet:** open `.local/review/access.html` on the development computer. It contains 12 numbered pairs, Seller/Buyer invitation links and QR codes, each pair’s assigned items, and an expandable **Manufacturer / Producer account** section with its existing email/password. This is a private local file, not a deployed URL or a file included in a public clone. Share only each reviewer’s intended invitation and the needed manufacturer details privately; passwords, codes and the full sheet are deliberately absent from this public README/GitHub.
- Each pair has two **Regular User** identities. **Seller** owns its assigned items initially; **Buyer** receives them. Use the same pair number on the two phones and one identity per phone. Do not use the same account on both phones. Manufacturer access is separate and does not automatically grant live reviewer AI access.
- To regenerate the owner’s sheet from the existing ignored local account/invitation files, run `node --import tsx scripts/review/access.ts` with the pinned local toolchain. This does not recreate accounts or reset ownership. A fresh clone needs the owner to supply private access; this command cannot recover missing secrets.
- Normal accounts use [Account](https://packproof-p0.vercel.app/account). Public sign-up supports Regular User or Manufacturer / Producer, but email delivery remains unverified after provider limits. Use prepared invitations for the submission walkthrough rather than depending on new email delivery.

**Access limits:** reviewer access and prepared examples have a finite review window through **18 November 2026**. Live calls share the existing **$10 total** allowance, including previous usage. An expired invitation, exhausted allowance or disabled live gateway does not become a successful live test. Anonymous/non-reviewer sessions use recorded AI with real database checks. No reviewer needs your Meta API key, database password or signing keys.

### 2. Investigate signed records

1. Open [Investigator](https://packproof-p0.vercel.app/investigate).
2. Select **Matching records · registered owner** and run **Investigate evidence** if the example has only filled the form. The selected/checking state identifies the active example.
3. Expect supported record evidence with references. The physical item remains uninspected; this is not an authenticity or safety certificate.
4. Run **Shop A · unauthorized seller**: expect a seller-authority refusal. Run **Incomplete custody history**: expect an unresolved history gap, not a danger alert. **Shop B · previously transferred item** checks current ownership; an old owner cannot automatically transfer it again.
5. **A listing** checks a seller’s description/records. **An item in front of me** adds a request for physical evidence. Leave packaging code absent to exercise the missing-information request, then supply its literal value or follow **Open guided photo Inspector**.
6. For your reviewer items, use the exact product/packaging codes from your pair’s sheet and **Your reviewer seller**. Do not substitute another pair’s items.
7. Use **Reload results** to recover saved progress. It reloads an assessment; it does not renew signed evidence. If an old Inspector assessment is stale, explicitly use **Check records again** or start a new inspection.

### 3. Inspect a real photo and request a better view

1. Remain signed in with a live reviewer invitation. Open [Inspector](https://packproof-p0.vercel.app/inspector), preferably using the Investigator/homepage link so the item context is carried across.
2. Confirm product/packaging codes and tap **Start a new inspection**. Wait for its requested view before supplying media.
3. Use your own non-sensitive package with a clearly printed product code, batch or expiry. A label with NAFDAC registration, batch, manufacturing and expiry dates is suitable; choose one marking to read. Alternatively display/print the [synthetic label](https://packproof-p0.vercel.app/review-label.png) on another screen and photograph it. Synthetic evidence remains identified as synthetic.
4. Choose **Photo → Open rear camera**, allow access, then **Take photo** and **Stop camera**, or choose a JPEG/PNG. If permission is denied, use the saved-file/manual-code route; camera denial is not successful capture.
5. Drag/resize the green region around the **complete** marking, lock the selection and inspect the selected-area preview. The whole-image option is available when useful, but include enough label context and legible text.
6. Under **What should be read?**, select **Printed expiry**, **Product code**, **Packaging code** or **Visible packaging condition**. For a live reading, explicitly check consent to send the selected image/crop to Meta, then submit/continue the inspection using its form button.
7. Expect source-bound original/grounded images and a literal reading or **Unknown**. Compare the reading with the physical label yourself. A printed expiry observation does not verify regulatory registration, batch validity or safety. Confirm the result’s mode is **live**; “No model reading”/recorded mode does not establish that the text was unreadable.
8. To exercise recapture, submit a genuinely blurred/obscured view. When a closer/clearer view is requested, provide a sharp replacement in the same investigation and continue. Unreadable text must stay unknown. Refresh to recover the saved result and images.

### 4. Inspect a short video

1. Start an inspection as above and select **Short video**.
2. Choose an MP4/WebM clip of at most **8 seconds / 3 MiB**. Pick the marking and set consent before **Save clip and extract frames**.
3. Inspect the timestamped frame thumbnails, select **Inspect this frame**, and continue the inspection. **View private original clip** retrieves the original for your authorized account.
4. Expect a reading or unknown tied to that selected frame. The complete clip is retained privately; only the selected frame enters image analysis. Whole-video tracking and forensic editing detection are not implemented.

### 5. Add a manufacturer’s product and original evidence

1. Obtain the manufacturer email/password from the private access sheet’s **Manufacturer / Producer account** section. Sign in at [Account → Products](https://packproof-p0.vercel.app/account?next=/products), using a separate browser/profile if keeping a reviewer session active.
2. Open [Products](https://packproof-p0.vercel.app/products). Enter your own details or tap **Use a sample product** to fill complete editable identifiers. Tap **Save product**.
3. Find the product under **Your products**. For a sample, expand **Show sample label to photograph**; it contains that saved product’s actual generated codes and printed expiry.
4. Tap **Add photos or video**. The linked Inspector retains the draft context. Save a photo or short clip; return to Products and use **View saved evidence**. Refresh and confirm the product/evidence remain.
5. The prepared manufacturer account can save private evidence. Live AI requires reviewer authorization separately. A regular reviewer can select Manufacturer / Producer in its existing Account profile to exercise draft creation while retaining its own reviewer authorization; choosing that profile never grants trusted issuer authority.
6. **Expected boundary:** a saved product is a private draft. New trusted issuance/review signing is unfinished. Use your pair’s existing signed items for ChainProof; a newly saved draft cannot be passed off as an issued, transferable product.

### 6. Complete a two-phone ChainProof handover

1. Sign in **Seller** on phone A and **Buyer** on phone B from the **same pair**. Keep internet on. Open [ChainProof](https://packproof-p0.vercel.app/chainproof) on each.
2. Tap **Set up this browser** on each phone if requested. This creates/enrolls a nonextractable signing key in that browser. Keep the same accounts/browsers; replacing a device can cancel pending handovers.
3. Seller selects **I’m selling**. Buyer selects **I’m buying**, chooses an available assigned example unit and checks the seller reference, then taps **Prepare agreement**. If the owner has already changed, use another available unit or its actual current owner—do not reset a completed transfer.
4. Buyer checks the item/participants and taps **Agree & show my QR**.
5. Seller taps **Scan buyer QR**, permits camera access and points at the buyer’s screen until three distinct consecutive QR frames are checked. No still photograph or video recording of the animation is required.
6. Seller checks the agreement and taps **Approve sale & show return QR**. Buyer then taps **Scan seller QR** and scans the seller’s return animation.
7. Buyer reviews the consent and taps **Confirm registered transfer**. Approve promptly within the displayed consent timer; agreements and QR frames are deliberately short-lived. If expired, cancel/start a fresh agreement rather than bypassing the checks.
8. Both phones use **Reload handover status** when necessary, then **Verify & download receipt**. Expect the same committed handover and verification of its receipt/both approvals. Refresh and recover the same receipt; refreshing must not create a second transfer.
9. Save the handover ID from **Handover ID, records & signed agreement**. **Open or recover with a handover ID** opens existing status if needed. The former buyer can subsequently sell onward using the same account/device; the other participant must still be distinct.

QR exchange proves the checked signed sequence, not GPS proximity or physical authenticity. Do not repeat a completed transfer just to reproduce a receipt.

### 7. Compare dispatch and arrival with DualProof

1. From the handover, follow **Compare dispatch and arrival evidence**, or open [DualProof](https://packproof-p0.vercel.app/dualproof) and choose that handover.
2. Tap **Compare saved evidence**. The signed agreement determines your side: seller = dispatch, buyer = arrival.
3. Seller follows **Add dispatch photos in Inspector**; buyer follows **Add arrival photos in Inspector** on their own phone. Supply readable product/packaging codes, expiry or a full-package condition view, with consent for live processing. Each source stays attached to its participant and handover.
4. Return to DualProof and compare again. Missing evidence stays unknown. Matching supported observations show consistency; a genuine difference produces a discrepancy and a next-view request. **Inspect discrepancy** carries context back to Inspector.
5. For a controlled synthetic difference, photograph two clearly marked practice labels with different expiry values; do not misrepresent altered practice evidence as a real product change. For real before/after evidence, capture dispatch before shipment and arrival after receipt. Adding both after a receipt only tests the interface and does not establish capture timing or uninterrupted custody.
6. Inspect **Shared handover evidence**, its original images, frame timestamps/clip links and source references. DualProof does not approve or change ownership.

### 8. Verify signed packs completely offline

1. While online, open [OfflineProof](https://packproof-p0.vercel.app/offline/index.html) on both phones. Expand **Prepare or download a pack → Set up this browser** and tap **Prepare for offline use**. Both must report trusted setup complete before disconnecting.
2. On the sending phone, keep your PackProof sign-in. Use the receipt’s offline-pack link for the transferred item, or choose **FP-1002 / PK-2002** in OfflineProof. Tap **Download signed pack** and locate the `.packproof.json` file in Android Files/Downloads.
3. Turn off Wi-Fi and mobile data on both phones, leaving Bluetooth enabled. Share the **actual downloaded file**, not its name or a screenshot, to the other phone. Accept the Bluetooth transfer; locate it in Files/Bluetooth or Downloads.
4. On the receiving phone, use **Open an evidence pack** to select that received file. Expect **Pack accepted. Signatures and dependencies verified locally.** No separate fingerprint entry is required for P4 signed packs; the P0 JSON probe is a different feasibility test.
5. Keep internet off, force-stop Chrome through Android App info, reopen the same OfflineProof URL and pull to refresh. Accepted product/notice/dated-owner evidence should return from local storage.
6. Reconnect only the sender, download **FP-GAP-01 / PK-GAP-01**, disconnect again and send/import it by Bluetooth. Expect the signed pack to be accepted with an **Unresolved history gap**.
7. Optional rejection check: on a laptop, copy a downloaded pack and change one valid character in the middle of the signature portion (third dot-separated portion) of `manifestJws`, preserving JSON. Send/import the copy offline. Expect rejection with earlier accepted evidence retained. A copy missing its final `}` must also be rejected. Keep the original unchanged.
8. Optionally expand **Compare the codes you can read** for a literal match/mismatch against accepted local records, and **Optional device test report** to record devices, sharing method and observed timings.

Only signed records/public verification material are transferred. Offline import does not transfer ownership or establish current ownership after the dated snapshot. Trusted setup cannot first be established from an arbitrary peer file. The rest of the app’s online pages are not promised to work offline.

### 9. Test the API, published SDK, MCP and WebMCP

1. Open [Developers](https://packproof-p0.vercel.app/developers). Public reads require no account/key. For private operations, sign in, name a developer key, choose only needed scopes and **Create scoped key**. Copy it once privately. Test **Rotate key**/**Revoke key** only on your own disposable key.
2. Public REST lookup (no paid model call):

   ```bash
   curl -sS https://packproof-p0.vercel.app/api/v1/products.lookup \
     -H 'Content-Type: application/json' \
     --data '{"namespace":"packproof-demo","productMark":"FP-1001","packagingMark":"PK-2001"}'
   ```

3. Install [@packproof/sdk](https://www.npmjs.com/package/@packproof/sdk) and run the production lookup example in [API, SDK, MCP and WebMCP](#api-sdk-mcp-and-webmcp) below. Expect the same structured evidence status/references as REST.
4. Add remote MCP server **`https://packproof-p0.vercel.app/api/mcp`** to a client supporting **Streamable HTTP**. Public `products_lookup` uses `{namespace:"packproof-demo", productMark:"FP-1001", packagingMark:"PK-2001"}`. Private tools use `Authorization: Bearer <your-scoped-key>`. The official client example is below. Opening this endpoint as a normal browser page is not an MCP test; there is no automatic OAuth login.
5. WebMCP uses native `document.modelContext` on supporting browsers. Use a compatible browser agent to discover/run the registered product lookup, then confirm writes require explicit approval. On unsupported browsers, use REST/MCP/the normal UI; absence of this experimental browser API is not a failed signature or evidence check.

### 10. Optional device feasibility tools

[Device checks](https://packproof-p0.vercel.app/tools) preserves the earlier P0 probes: camera/local capture, manual mark entry, browser/Node signing and tamper checks, rotating QR measurements and small JSON transport. Device model/OS/browser fields are optional test-report metadata, not a normal production registration requirement. For QR-rate measurement one phone displays and the other continuously scans, then swap roles at the displayed 5/10 frames-per-second targets. Download the reports; a target rate is not a measured scan-success rate. These probes do not replace ChainProof or the signed-pack test above.

### Troubleshooting and saved evidence

- **Your account** means signed in. **Account / Sign in** means sign-in is needed. Use the same Production origin on all pages; Vercel/Google dashboard login is separate from PackProof login.
- No live reading: verify reviewer sign-in, homepage live status, consent and remaining allowance. **Unknown** is a valid uncertainty outcome, not proof that live processing succeeded.
- Camera blocked: allow permission in browser settings or use a saved image/manual code. Production HTTPS needs no laptop certificate, local IP, firewall setup or `mkcert` installation.
- Lost handover: recover with its ID/recent handover; do not recreate a committed sale. Stale/expired authority remains a gate, never disable it for testing.
- A public clone cannot contain the private access sheet, passwords or customer media. Request the assigned invitation privately from the project owner; there is no public master login.
- Current acceptance/deployment state is in [BUILD_STATE.json](project_handoff/BUILD_STATE.json), material changes in [BUILD_LOG.md](project_handoff/BUILD_LOG.md), and sanitized provider/device/security receipts in [evidence](docs/packproof/evidence). Private session details and signing keys are not published logs.

## Not yet completed

This is a working hackathon platform with explicit unfinished areas:

- **Radio broadcasting, radio/voice workflows, telephone calling and live voice agents are not implemented.** No claim is made that those features are available from the current UI/API.
- **Glimmer hosting/distillation and a Glimmer-distilled student for offline POS/Android guidance remain future work**, conditional on the core build. The intended scope includes both POS/Android verification guidance and radio/voice content preparation. Glimmer 30B is not claimed to run on ordinary POS hardware.
- Native apps, radio/mesh integration and GPS-based proximity are not delivered. Current browser QR exchange does not provide GPS proximity proof.
- New manufacturer drafts still need a separately authorized trusted-issuance/signing workflow. Creating a manufacturer profile is not issuer authorization.
- General public signup email delivery, a fresh physical Android walkthrough of the newest platform pages, later Terminal 2/3 integration/final acceptance and the final three-minute film remain incomplete or unverified. Earlier recorded P0–P4 device checks remain valid within their documented scope.
- Whole-video tracking/forensic manipulation detection, unrestricted anonymous live AI and automatic external regulatory/safety clearance are not provided.

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


Connect from an MCP client that supports Streamable HTTP using the server URL **`https://packproof-p0.vercel.app/api/mcp`**. Public product lookups need no credential. For private tools, create a scoped key on [Developers](https://packproof-p0.vercel.app/developers) and configure the client’s HTTP `Authorization: Bearer <key>` header. This endpoint uses PackProof credentials, not automatic OAuth sign-in.

For the official TypeScript client, install `@modelcontextprotocol/client@2.4.0` and run:

```ts
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';

const client = new Client({name: 'packproof-reader', version: '1.0.0'});
await client.connect(new StreamableHTTPClientTransport(
  new URL('https://packproof-p0.vercel.app/api/mcp'),
));
try {
  const result = await client.callTool({
    name: 'products_lookup',
    arguments: {namespace: 'packproof-demo', productMark: 'FP-1001', packagingMark: 'PK-2001'},
  });
  console.log(result.structuredContent);
} finally {
  await client.close();
}
```

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

Public signup email delivery remains unverified after provider rate limits. Trusted issuance for new drafts awaits separately authorized signing. Source is public at [abeebridwan/PackProof](https://github.com/abeebridwan/PackProof). The final three-minute video has not been supplied. Radio/voice workflows, Glimmer distillation and native radio/mesh integration are future work. Conditional distillation may support offline guidance on compatible POS/Android devices; hosted Glimmer is not a model running directly on ordinary POS hardware.
