# PackProof v10 Product Vision and Specification

30 October 2026 • Indie Developer Track • Proposal and build specification

PackProof helps buyers, sellers and mechanics inspect evidence about goods before they buy, pack or receive them. The three-day prototype follows one parent from a Muse-powered product investigation to an authorized buyer–seller handover and an offline evidence check. It uses fictional infant-formula packaging and records. Nothing is implemented or evaluated yet.

## The problem and the product

“I noticed that an energy-drink bottle looked different. I asked the retailer and accepted her explanation. Much later, she told us the manufacturer had raised an alarm. I had noticed something, but had no practical way to investigate.” This founder experience motivates PackProof. It is an example, not the general use case, and does not establish medical causation.

Evidence becomes separated from goods as they move between factories, importers, wholesalers, shops and buyers. PackProof connects permitted product records, observations, notices and signed handovers, making the source, scope and missing history visible. It can help a buyer question a packaging change or unsupported specification before paying. It cannot determine hidden chemical contents from a camera image.

The product is global. Nigeria supplies the first participating verification profile; infant formula is the demonstration category. Other profiles can support automotive parts, beverages, cosmetics and other goods. Public product checks can be anonymous. Recorded transfers require authenticated participants.

## Four capabilities within one product

| Capability | Retained product purpose | This sprint |
| --- | --- | --- |
| Inspector | Guided photo/video inspection, evidence quality, labels, variants, quantities and packing checks | Targeted marking inspection with Muse and SAM |
| DualProof | Compare sender and receiver evidence, supported contents and visible condition | Deferred entirely |
| ChainProof | Issuer records, linked markings, custody, current registered owner and accountable handovers | Core |
| OfflineProof | Download selected signed evidence and verify or exchange it without internet | Core; local radio transport device-tested |

All four share records and verification rules. The complete packing workflow remains planned, including confirmed order revisions, two independently qualifying final views, unknown-item blocking and scoped receipts. Those packing-specific rules do not turn a simple identifier lookup into a full inventory inspection.

## The essential experience

1. **Investigate before ordering.** A parent supplies a product code, seller code, text or photo. Muse selects real PackProof tools to retrieve issuer authority, linked identifiers, notices, available history and seller authorization. Missing evidence produces a specific next step. The UI distinguishes a listing check from inspection of the physical item.
2. **Inspect the relevant detail.** Muse requests a useful view. SAM isolates the selected package or marking region; Muse reports literal visible text. The verifier checks provenance, applicable records and contradictions. Unreadable evidence stays unresolved. A crop is not a second independent observation.
3. **Refuse an unauthorized handover.** At simulated Shop A, the signed current-owner record does not authorize that seller. Display: “Transfer blocked: seller is not authorized for this registered item.” The buyer walks away. This is an authorization finding, not a counterfeit verdict.
4. **Complete an authorized handover.** At Shop B, a separate registered item and its packaging match their records. Both phones display the item and counterpart. Buyer challenge → seller scan and approval → reverse challenge → buyer scan and confirmation → mandatory server checks → one accepted signed transfer. Changing QR frames target 5–10 updates per second, measured on the actual phones.
5. **Keep useful evidence offline.** Download a selected pack or receive it from another phone. With internet disabled, the bootstrapped viewer verifies signatures and shows the relevant packaging notice, relationship, ownership snapshot and last-update time. A modified pack is rejected. The consumer sees a finding they can act on, not merely a valid-signature badge.

The parent learns that the first seller cannot authorize the registered transfer. At the second shop, the issuer’s demo packaging revision explains the visible change, the targeted marking agrees with the applicable record, and both participants authorize the handover. This resolves the film’s opening doubt within a clearly stated evidence scope.

## Physical markings and producer recording

For participating manufacturers using the Nigeria multi-mark profile, start with two linked physical identifiers: one on the product or immediate vessel, another on its packaging. Allow more on caps, seals, inner cartons and outer cartons. Store physical locations and issuer-defined scope; scanning the same mark twice is not a two-mark check.

For example, distinct units BT-2048 and BT-2049 may both belong to CT-9381. A shared batch or mold code remains shared; it does not become a unique serial. The pair resolves to one public relationship link, not a password. If outer packaging is absent, product-only lookup remains available with “Two-mark relationship not checked.” Both marks may be copied; a matched mapping establishes record consistency. Current transfer authorization and observed physical association are separate checks.

Country/category profiles define permitted identifier types, issuer roles, evidence requirements and freshness. This is a proposed PackProof profile, not a Nigerian statutory standard. Keep regulatory-registration expiry, batch expiry and observed printed expiry as separate fields.

Manufacturers may record representative samples with one ordinary smartphone and at least the relevant carton evidence under the proposed carton-enrollment policy. Record exactly which units were observed. Sampling never becomes a claim that every unit was individually inspected. Protect originals; preserve hashes and transforms for compressed clips, crops and redactions.

## AI and mandatory verification

Muse Spark plans the investigation, calls typed tools and chooses the next evidence request. SAM supplies actual segmentation. The Evidence Engine checks claims and transfer permissions at mandatory boundaries, inspired by Meta’s Legal Agent Workshop [1]. The model cannot skip these checks or hold issuer signing keys. A readable action trace shows tool → cited result → gate → next action; it does not expose private reasoning.

Checks distinguish issuer authority, digital integrity, marking relationship, physical association, notice applicability, current transfer authority and evidence freshness. Deterministic checks cannot independently prove that a visual reading is true; literal readings retain their image references, uncertainty and model provenance.

An optional Glimmer cloud adapter reuses the same tools for a small comparison. Meta documents Glimmer as a 30B model under Apache 2.0 [2]. A tiny student trained on 20 Glimmer examples is a separate experiment, with held-out tests and actual Android execution required before claiming success. Open-weight bonus eligibility depends on actual qualifying use and organizer rules, not including an adapter in the plan.

## Trust and incomplete histories

Issuer keys need scoped authority, not a self-declared manufacturer name. The prototype uses explicitly labeled demo identities. Preserve missing handoffs and conflicting statements. A fresh inspection adds present evidence; it cannot fill an unobserved custody interval or grant ownership. A missing interval alone does not make goods counterfeit. Unsupported present transfer authority still blocks the registered handover.

Every directory addition, removal, revocation or correction appends a signed versioned audit event with administrator, reason, prior/new state and authorization. Issuers correct their own claims; both parties amend a joint handover; separately granted reviewers handle cross-party disputes within their namespace and case. Nobody appoints themselves to resolve their own dispute. Earlier claims remain inspectable. Audit history helps detect mistakes but does not eliminate trust in the operator.

The live protocol binds both authenticated device keys, item, parties, expected ownership version, policy, fresh nonces and expiry. Commit is atomic and retries are idempotent. Animation does not prove proximity or prevent every relay attack. Registered ownership is PackProof’s accountable record, not a legal-title or chemical-safety certificate. Sold, consumed, opened, returned, refilled, retired and stolen remain different lifecycle states.

## Offline access and privacy

A new device first loads the official HTTPS app, obtains pinned root public keys and verifies the signed issuer directory. A peer file cannot establish its own trust root. Offline imports check signatures, key roles, dependencies, scope, versions and freshness before installation; invalid updates preserve the last accepted pack. Unknown roots require trusted rebootstrap. Root rotation must follow authorized continuity; full rotation tooling is deferred.

Consumers select the products, batches or areas they need. Area filtering must retain relevant origin records and warnings outside the area. Direct online access remains available; POS devices are optional relays. A signed snapshot cannot reveal a later warning or ownership change that never reached it. Stale, partial and out-of-scope results remain explicit. Offline transfers are not committed by “first to sync”; future provisional events require reconciliation.

Public packs contain only permitted product facts and pseudonymous ownership references. Customer identity, NIN, detailed location and private videos stay restricted. Private-media encryption and grants are future transport work; visible codes are never private-video credentials. Relay storage is opt-in and capped. Cloud analysis requires disclosed access to the submitted media; previously shared plaintext cannot be remotely recalled.

## Retained roadmap

| Future area | Preserved direction |
| --- | --- |
| Packing and delivery | Full Inspector workflow, DualProof, evidence bundles and receipts sometimes called Proof Lens |
| Live interaction | PointCast cross-camera association, LivePick buyer-directed seller camera, optional LiveKit sessions |
| Supply chain | Carton splits/aggregation with quantity conservation; richer lifecycle, issuer onboarding and dispute workflows |
| Transport | Encrypted resumable video chunks, opt-in Bitchat-inspired mesh, possible Nostr relays, native POS caches and telecom partnerships |
| Access channels | REST, MCP, TypeScript/Python SDKs, WhatsApp, voice, SMS/USSD, supported Meta AI connectors and glasses |
| Public information | Approved radio bulletins, later IVR/call-in/SIP/AzuraCast, n8n for nonsecurity workflows |
| Physical and governance extensions | Optional tags, temperature/ambient sensors, NFC/UWB or location signals and independent tests; active/temporary business locations, industry/regulator partnerships, identity bonds or penalties only under separately defined governance |

All channels use the same backend and authority rules. No existing partnership, connector approval, SIM video store, cellular-mast Bluetooth network or production radio service is assumed. None is required for the three-day prototype.

## What the prototype must demonstrate

Real Muse/SAM calls; a supported pre-order finding; targeted recapture; first-shop refusal; second-shop signed transfer on two phones; a useful offline notice after cold reload; tamper rejection; public repository and deployed HTTPS app. Report observed completion time, invalid-transfer acceptance, visual errors, bytes and inference cost. A small test set establishes prototype behavior, not field effectiveness or an audited security guarantee.

Impact does not require a complete chain: current visual checks and available notices can help before every trader participates. Manufacturer-origin claims need an authorized issuer; full provenance needs the relevant records. Future packing economics can compare check cost with expected avoided error loss: break-even error rate = check cost / (detection probability × loss per error). Measure inputs rather than inventing a pilot result.

The original v9 documents remain preserved. V10 changes the demo and sprint scope while retaining the product’s evidence, authority and privacy principles. It is an unimplemented proposal, not a claim of achieved judging scores or guaranteed prizes.

## References

[1] Meta, Legal Agent Workshop: https://github.com/meta-models/legal-agent-workshop — verification at action boundaries; reviewed 30 October 2026.

[2] Meta, Muse Glimmer: https://dev.meta.ai/docs/muse-glimmer and https://dev.meta.ai/docs/muse-glimmer/deploy — model/license/deployment documentation; account access untested.

[3] Meta, models and SAM: https://dev.meta.ai/docs/models and https://dev.meta.ai/docs/sam/client-libraries — reviewed 30 October 2026; integration remains to be built.

[4] NAFDAC Public Alerts 06/2026 and 018/2026; OECD/EUIPO Mapping Global Trade in Fakes 2025. Exact links, dates and permitted film claims are in the demo script. Real alerts are context, not records about the fictional product.
