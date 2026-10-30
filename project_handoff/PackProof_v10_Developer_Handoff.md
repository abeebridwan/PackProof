# PackProof v10 Developer Handoff

30 October 2026. Authoritative sprint contract; all implementation statuses start unbuilt. The product spec defines meaning; this file defines required behavior; the implementation plan defines sequence. Explicit later user instructions take precedence and must be logged. V9 remains background design, not an instruction to restore its larger sprint.

## H0 Boundary and architecture

One Next.js/TypeScript PWA → authenticated Node services → Supabase Postgres/Auth/private Storage. One provider gateway calls Muse Spark and SAM; shared pure verifier functions run on server and in the static offline viewer. Keep browser public keys separate from server signing keys. Do not add another database or agent framework.

Primary docs checked 30 October 2026, **no live account probes performed**:
- Meta models/tool calling: https://dev.meta.ai/docs/models and https://dev.meta.ai/docs/tool-calling
- SAM: https://dev.meta.ai/docs/sam/overview and https://dev.meta.ai/docs/sam/client-libraries
- Independent gates: https://github.com/meta-models/legal-agent-workshop — reviewed `agent/agent_kit/tools/submit_memo.py` and `set_checklist.py`. Adapt checks inside action handlers and structured refusal feedback. PackProof never adopts the workshop's verification-off mode or its checklist acceptance after a retry limit.
- Glimmer: https://dev.meta.ai/docs/muse-glimmer and https://dev.meta.ai/docs/muse-glimmer/deploy
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- PWA: https://nextjs.org/docs/app/guides/progressive-web-apps

Folders: `src/contracts`, `src/domain/{identity,trust,verification}`, `src/server/{auth,tools,providers,transfers}`, `src/offline`, `supabase/migrations`, `scripts`, `tests`, `docs/packproof/evidence`. Add a worker only for measured timeout needs. Suggested packages: zod, jose, idb, openai, @meta-sam/parser, @zxing/browser, qrcode, vitest, playwright, esbuild; sharp/FFmpeg only when required by actual media processing. Pin in P0.

Server secrets: MODEL_API_KEY, SUPABASE_SECRET_KEY, PACK_SIGNING_JWK, TRANSFER_SIGNING_JWK. Public configuration: APP_ORIGIN, Supabase URL/publishable key, pinned root public keys. Root/demo-issuer private keys stay in an offline signing CLI outside git and the serving app. GLIMMER_BASE_URL/KEY/MODEL are optional after a successful probe. Enforce budgets and API request caps server-side.

## H1 Contracts and data

Implement strict Zod objects; derive TS types and provider JSON schemas. Reject unknown fields, enforce bounded strings/arrays, UUID IDs and UTC timestamps; retain leading zeros in marks. Null means unknown. These are **application contracts**, not invented Meta response shapes.

```ts
type Scope = 'model' | 'batch' | 'unit' | 'container';
type Mark = {
  namespace: string; value: string; format: 'qr'|'datamatrix'|'text';
  scope: Scope; physicalLocation: string;
};
type GateResult<T> = {
  status: 'supported'|'blocked'|'needs_evidence'|'unavailable'|'stale';
  reason: string; evidence_refs: string[]; scope: Scope;
  asOf: string; policyVersion: string; next_actions: string[];
  data: T | null;
};
type RecordPayload = {
  schemaVersion: 1; id: string; type: string; namespace: string;
  subjectIds: string[]; scope: Scope; issuerId: string; keyId: string;
  issuedAt: string; receivedAt: string; revision: number;
  previousIds: string[]; evidenceHashes: string[];
  visibility: 'public'|'restricted'; demo: boolean; data: object;
};
```

Use concrete discriminated schemas for `type`/`data`, not arbitrary objects in production code. Allowed sprint records: issuer binding, directory change, issuance, mapping, notice, custody, custody snapshot, gap, delegation, correction, inspection and transfer receipt. Sign exact serialized payload bytes with compact JWS ES256, pinned `alg`/`typ`/`kid`; never fetch keys from token-supplied URLs. Verify signature **and** current scoped issuer role. Record hashes bind the exact UTF-8 JWS bytes; preserve them without parse/re-serialize.

Minimum tables: actors, device_keys, issuer_bindings, signed_records, items/current_owner_version, marking_relations, captures, investigations/tool_events, transfer_sessions, consumed_challenges, accepted_transfers, receipt_outbox, pack_sequences. Signed records retain claims; mutable projections are transactionally derived from them. Seed scripts insert fictional records through the same validation logic.

Seed two distinct units in namespace `packproof-demo`: FP-1001/PK-2001 and FP-1002/PK-2002. Shop A lacks transfer authority for FP-1001; Shop B owns FP-1002. The authorized issuer issued both mappings. Give FP-1002 an applicable signed packaging-revision notice explaining its visible wrapper change. Both units can share CT-9001 without sharing unit identity. A separate fixture retains an earlier custody gap. Never mutate ownership silently to make the second scene pass.

Public lookup strips buyer identifiers, device keys, sensitive location and private media. It can say “registered seller” or “registered holder.” Authenticated parties see the minimum counterpart information needed for consent. Demo business identity is not real-world brand onboarding or KYC.

## H2 Six agent tools

Every tool input is a strict object with the listed required fields; nullable fields remain present. Output is the validated GateResult envelope with signed source references and the stated data. Tool IDs below are fixed allowlist names.

| Tool | Input | Data returned |
| --- | --- | --- |
| lookup_product | namespace:string, productMark:string, packagingMark:string\|null | itemId, actual scope, issuer binding, mappingStatus, physicalBinding, record IDs |
| lookup_seller | itemId:UUID, sellerId:UUID | current ownerVersion, authorized boolean, authority/grant refs, asOf |
| get_product_notices | itemId:UUID | applicable typed notices, source coverage/version and retrieval time |
| get_custody_history | itemId:UUID | permitted events, gaps, conflicts and current signed projection |
| inspect_product_image | investigationId:UUID, captureId:UUID, question:'product_mark'\|'package_mark'\|'printed_expiry' | literal reading or null, crop/mask/frame refs, provenance, quality blockers |
| request_additional_evidence | investigationId:UUID, reason:'unreadable'\|'missing_package'\|'association_unclear', view:'close_mark'\|'both_marks'\|'full_package' | persisted needs-input state and specific capture instruction |

No tool transfers ownership. Agent accesses tools only through server handlers enforcing permissions and capture ownership. Issuer validation and marking validation run inside lookup, not as optional model-selected checks. Common internal service functions can later be exposed via REST/MCP with the same authorization.

Application routes: `POST /api/investigations`, `POST /api/investigations/:id/resume`, `POST /api/captures`, `GET /api/products/lookup`, `GET /api/investigations/:id`, `POST /api/device-keys/enroll`, transfer routes below, `POST /api/packs/export`. Only allow owned IDs; no arbitrary URL-fetch tool. File upload uses short-lived authorized grants, MIME/dimension/size checks and private storage.

## H3 Agent controller and gates

Muse `muse-spark-1.3` uses Meta’s actual Chat Completions tool-calling format through the server SDK. SAM `sam-3.1` uses Responses and the official parser’s actual boxes/masks; its special-token output is not ordinary JSON. P0 locks exact returned schemas. Audio is optional later through dedicated Muse Voice Transcribe; typing is sufficient for core.

Allow at most 8 tool actions, 3 recapture requests and 2 bounded retries for transient provider failures. Pause on user input. Reserve estimated request cost before calls and settle actual usage where available; a proposed initial session cap is $0.50, adjustable only after measured probes. Malformed output, exhausted budget or provider failure yields review/unavailable, never success. Do not enable shell/browser tools or expose keys.

Required online assessment coverage: product/issuer, relationship status, seller authorization, applicable notices and history. The server finalizer runs even when Muse skips a tool; missing checks yield `needs_evidence`. Physical association may remain unresolved before arrival. A listing lookup cannot clear an at-shop physical check.

Gate-derived badges and permitted next actions are deterministic. Muse’s explanation must cite tool-produced record IDs and stay within those facts; unsupported claims are removed/rejected. Display a short action summary, inputs without secrets, actual output, gate result and next action. Never render hidden reasoning. Prompt instructions inside photos/listings are data.

## H4 Two-way handover

All handover operations are online in this sprint. Require authenticated actors and device-key enrollment: server nonce → browser nonextractable P-256 key signs enrollment challenge → authenticated service binds public key to that account. Unknown/revoked device keys fail. Use one active enrolled device per demo actor; a device change invalidates pending sessions. Browser key protection does not provide hardware attestation.

```ts
type TransferAgreement = {
  schemaVersion: 1; transferId: string; itemId: string;
  sellerActorId: string; buyerActorId: string;
  sellerDeviceKeyId: string; buyerDeviceKeyId: string;
  expectedOwnerId: string; expectedOwnerVersion: number;
  mappingRecordId: string; inspectionRecordId: string | null;
  policyVersion: string; issuedAt: string; expiresAt: string;
};
// agreementHash = SHA256(exact server-issued agreement payload bytes).
// Each device signs its rotating frames and its separate consent challenge.
// Bind role, agreementHash, server nonce, sequence/reservation and expiry.
```

State sequence: `offered → seller_approved → buyer_confirmed → committed`; terminal alternatives `blocked`, `expired`, `cancelled`. Receipt delivery has its own pending/ready state, separate from ownership commit. The sprint transfers exactly one issued unit; shared model/batch marks cannot create unit ownership. Require an eligible item state, current confirmed identifiers, a supported mapping and no unresolved current allocation conflict. Physical-evidence status remains separately visible.

1. Buyer chooses exact item and seller; authenticated `POST /api/transfers` binds intended parties, expected ownership version and enrolled device keys. Buyer signs the offer after seeing item and counterpart. Server supplies nonce/sequence/time-window batches bound to that offer and agreement hash.
2. The displaying device signs each frame with its enrolled key. Upload a batch; the server verifies it and returns short opaque QR handles resolving to those signed frames. Render locally at a measured target of 5–10 frames/s, with smooth low-contrast motion and no flashing. Each frame binds a unique random nonce of at least 128 bits, direction, sequence and server-defined validity window. Start with a 120-second session and roughly 3-second scans. No 10-request-per-second animation loop.
3. `POST /api/transfers/:id/scan` accepts at least three distinct consecutive, currently valid frame tokens from the intended counterpart within the scan window. Verify every device signature and agreement binding; one screenshot cannot satisfy the sequence. Reserve/consume this sequence atomically for that actor, then issue a separate signed consent challenge, valid for 30 seconds within the session. This gives the person time to review without requiring consent before a rapidly changing frame expires.
4. Seller sees item and buyer, approves and signs that consent challenge. `POST /api/transfers/:id/seller-approve` verifies signature and current owner or active item-scoped delegation. Unauthorized Shop A receives the exact blocked message. For Shop B, issue reverse-direction frame batches; the seller signs/displays them, additionally binding the seller-approval hash. Buyer scans the required sequence, receives a fresh consent challenge, reviews unchanged item/parties and explicitly signs confirmation.
5. `POST /api/transfers/:id/confirm` verifies both consent signatures, valid scan reservations, current key/grant status, policy and session/consent expiry. Previously accepted frames are checked against their recorded scan time, not required to remain unexpired during human review. A privileged DB transaction locks the item, rechecks owner/version and session state, consumes consent challenges, appends one transfer and increments ownership version. Conflicting transactions cannot both commit. Bind idempotency keys to actor+operation+payload hash; changed payload with reused key is rejected.
6. The committed transfer includes immutable agreement and both signed approvals. The server signs its receipt using the outbox; receipt-signing failure can retry without changing ownership again. `GET /api/transfers/:id` recovers the same accepted transfer/receipt after timeout. Show “Transfer recorded; receipt preparing” if needed, never invite a second sale.

Every transfer write goes through this service. Revoke direct client writes and public execution of privileged commit RPCs. The DB still enforces current owner/version, session uniqueness and key/grant status; it never accepts a client-supplied `verified=true`. Validate the same rules on retries and recovery. Animation is visible freshness feedback, not guaranteed physical proximity or relay immunity. Measure actual QR reliability; record any lower achieved rate as a delivery deviation, do not silently change the target.

## H5 Targeted visual evidence

Capture retains original bytes/hash, dimensions, source kind, upload time, investigation revision and device capture time (untrusted metadata). A crop/frame adds source hash, transform, coordinates and timestamp. Imported footage is labeled imported. User corrections are human observations, not model-confirmed readings.

Muse requests an informative view; SAM segments a real package/label region using a supported concept or prompted point/box. Show the original context plus mask. Muse reads only the requested visible marking, without desired record text. Compare literal values against issuer records afterward. Empty mask, glare, occlusion, ambiguous text or unrelated captures cause `needs_evidence`. Do not guess the expected value.

Two markings require a joint view or supported continuous association; disconnected close-ups may find a mapping but leave physical binding unresolved. Single-mark lookup still works. Registration validity and batch/printed expiry never share one “expiry” field. A packaging notice applies only to its stated model/batch/date range. No chemical, pathogen or health verdict.

## H6 History and authority

Root-authenticated issuer directory grants key, namespace, record types and validity. Verify these before accepting each signed claim. Seed signed directory-change/audit entries and show them read-only. Future edits append corrections, not silent history deletion. Demo fixtures exercise unauthorized corrections and revoked key rejection; a broad admin/dispute UI is deferred.

Current inspection does not close a gap. Contradictory allocations remain unresolved; neither a recent timestamp nor first sync wins. A signed present authorization can support transfer while older history remains visibly incomplete, provided no current conflict is unresolved. Issuers correct their own claims, original parties jointly amend handovers, and a separately granted reviewer resolves cross-party cases. Physical custody, registered owner and legal title are distinct.

## H7 Offline package and verifier

Use `.packproof.json`, not an executable archive. Initial pack is public/demo records only; no private video encryption scheme in the sprint. Target below 250 KB; enforce a 2 MiB import ceiling, bounded nesting/record count, no remote resource execution. Optional thumbnails count toward the limit. Export a separately server-signed public custody snapshot with a limited holder reference; do not include private agreement/device/account IDs or mutate an original signature to redact them. Any restricted-source hash is labeled a reference, not an included verified source. Public verification attests to the server's dated projection; the full jointly signed receipt remains restricted.

```ts
type EvidencePack = {
  schemaVersion: 1;
  manifestJws: string;
  directoryJws: string;
  records: { id: string; jws: string }[];
  media: { sha256: string; mime: 'image/jpeg'; base64: string }[];
};
// Signed manifest payload:
// packId, scopeKey, namespace, itemIds, profileVersion,
// coverage:'exact-selection'|'partial-index', sourceDatasetVersion,
// sequence, generatedAt, expiresAt, directoryVersion, directorySha256,
// records:[{id,type,sha256,requiredRefs}], media:[{sha256,bytes}].
```

Bootstrap from official HTTPS app: cache the viewer, pinned root public key, verified directory and last trusted server time/version. Do not accept a new root from a QR/peer. Clear or uninitialized storage means “Trusted setup required.” Unknown root rotation is blocked pending official rebootstrap; do not implement permissive key replacement.

Import order: size/schema → known root and directory signature/hash → pack signer role and signature → all bytes/hashes and required dependencies → record-specific issuer roles/signatures → consistent scope/version/notice projection → freshness. Stage import; install atomically only when integrity/dependencies are valid. Reject rollback for the same scope and preserve the prior accepted pack. A signed but expired snapshot can be inspected as historical, never current clearance. Retain known adverse records so another partial pack cannot erase them.

Use a declared demo freshness policy, initially 24 hours for directory/status snapshots; it is not a medical safety standard. Show “Recorded owner as of …”; current ownership requires online recheck. Warn on clock earlier than stored trusted time; unreliable time cannot establish freshness. Revocations or notices never received are unknowable offline.

The offline viewer must open after the app is closed/reopened with no network, with all assets/fonts/crypto code local and no required auth refresh. A downloaded web link alone is insufficient. The user can predownload their own selected data or import from any relay. Pair lookup, applicable demo notice and exact snapshot age must be visible.

OS Bluetooth file sharing is the preferred tested payload route; Quick Share may use Bluetooth discovery and Wi-Fi data. Document devices, radios, bytes and time. No browser BLE mesh claim. Partial/broken transfer never installs. Future offline handovers stay provisional until reconciliation; this sprint exposes no offline commit button.

## H8 Acceptance gates and evaluation

| ID | Required evidence |
| --- | --- |
| F1 | Actual Muse typed-tool round-trip; actual SAM decoded region; model/request IDs and sanitized artifacts. |
| F2 | Node/browser ES256 both directions; modified payload and unknown key rejected. |
| F3 | Real Android capture and two-phone animated QR probe; achieved frame rate and scan reliability recorded. |
| F4 | Actual host/credit/account availability and local file-import/transport feasibility; unavailable optional transport explicitly recorded. |
| A1 | Product/seller/notices/history tools return real seeded records; final answer cites them. |
| A2 | Missing/omitted checks and unknown issuer yield unresolved/blocked; no fabricated notice or authority. |
| A3 | Malformed tools, prompt injection, provider failure and exhausted budget cannot create success. |
| A4 | Useful closer-view request pauses/resumes; public UI separates record finding from physical association. |
| I1 | Pair match/mismatch, product-only, shared carton, batch vs unit and applicable notice produce distinct correct states. |
| T1 | Shop A blocked; Shop B completes on two real phones; exact item/parties and signed receipt agree. |
| T2 | Replayed/expired/wrong-direction nonce, changed item/party and revoked/unbound device key rejected. |
| T3 | Two concurrent buyers: exactly one commit; owner/version changes once. |
| T4 | Duplicate confirm, dropped response and receipt-signing retry recover the same transfer; changed idempotent payload rejected. |
| S1 | Unauthenticated/cross-account writes, direct commit-RPC use and foreign media denied; no private keys in client/git/logs. |
| V1 | Actual SAM mask + literal Muse read references the original; wrong/unreadable mark yields discrepancy/recapture. |
| V2 | Disconnected photos, changed capture revision and wrong date semantics cannot become a supported physical finding. |
| O1 | Bootstrap, download, disconnect, close/reopen: pair, applicable notice and dated ownership snapshot work locally. |
| O2 | Tamper/unknown root/unauthorized signer/missing dependency rejected; prior accepted data remains intact. |
| O3 | Rollback rejected; expired/partial/out-of-scope and unreliable time clearly limited; newer known warning survives older import. |
| O4 | Two actual phones transfer/import the pack with internet off, or hardware transport explicitly marked incomplete; exact transport label. |
| R1 | HTTPS deployed flow, model calls, blocked/accepted transfer, offline finding and accessible ≤180-second film/repo checked. |

Fixtures also cover a history gap, an unauthorized resolution and a directory correction; retain the gap and audit trail. Use roughly 12 fixed product/evidence scenarios (4 supported, 4 conflicting, 4 incomplete), separate from calibration, plus the protocol/security cases above. Report counts and denominators, false supported findings, invalid-transfer accepts, recapture behavior, p50/range latency, measured bytes and cost/unknown. This replaces the old 40-case packing benchmark; do not reuse its denominators.

Optional Glimmer comparison uses five matched cases and identical tool data, not a required second backend. Optional student evaluation compares base/tuned outputs on unseen examples; 20 teacher examples do not justify general reliability claims.

Suggested meaningful commands once implemented: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, `pnpm eval:packproof`. Record actual commands and exits; never create a script that only prints a fake pass. Test required invariants, not cosmetic implementation details.
