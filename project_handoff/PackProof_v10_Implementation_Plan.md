# PackProof v10 Implementation Plan

Start from zero. Build one demonstrable journey in roughly **27 focused hours across three intensive working days**, with integration risk and additional recovery time explicitly allowed. Dates do not imply completed work. If coding starts on the evening of 30 October, use that evening for P0 and count the actual remaining hours; do not compress missed time by dropping gates.

## Stack

| Layer | Use |
| --- | --- |
| App | TypeScript strict, Node 24 LTS, pinned pnpm, supported stable Next.js/React, Tailwind |
| Backend | Next.js Node route handlers; a small Node worker only for jobs exceeding host request limits |
| Data | Supabase Postgres, Auth, private Storage; SQL migrations, generated types, RLS; no extra ORM |
| Models | Server-side OpenAI JS SDK → Meta Model API; Muse Spark 1.3 and SAM 3.1; official SAM parser |
| Contracts and crypto | Zod, jose ES256/P-256, Web Crypto SHA-256; device keys in IndexedDB |
| Phone UI | getUserMedia, Canvas, @zxing/browser for tested QR formats; manual code input; short-clip frames when needed |
| Offline | Small same-origin static /offline/ viewer built with esbuild, shared verifier, idb and scoped service worker |
| Testing and delivery | Vitest, Playwright, Supabase integration tests, two real Android phones; Docker + Caddy on an available host |

This fits your TypeScript/React/Node/Supabase experience. Keep one repository and database. Pin actual compatible package versions in P0. No new agent framework, Redis, native mesh stack or inference server is required. Reuse an existing suitable HTTPS host; do not presume hosting credits exist.

## Build sequence

| Phase | Budget | Deliverable and exit gate |
| --- | --- | --- |
| P0 Feasibility | 3 h | Real Muse tool round-trip and SAM mask; Node/browser crypto; actual camera/animated QR probe; host/access facts recorded. Tests F1–F4. |
| P1 Pre-order agent | 6 h | Seed issuer, two items and shops; signed records; six tools; mandatory finalizer; Muse gives a cited, useful seller/notice finding. Tests A1–A4 and I1. |
| P2 Live handover | 7 h | Device enrollment, animated two-way exchange, rejected seller and accepted seller, atomic ownership commit and receipt. Tests T1–T4 and S1. |
| P3 Targeted Inspector | 4 h | Real SAM region and Muse literal reading; closer-view request; provenance and notice/marking association. Tests V1–V2. |
| P4 Offline and release | 7 h | Signed pack, bootstrap, cold reload, tamper/rollback checks; actual phone transfer test; integrated HTTPS release. Tests O1–O4 and R1. |

Day 1: P0 + P1. Day 2: P2 + start P3. Day 3: finish P3 + P4. P0 tests local transport feasibility early so Day 3 is not the first hardware check. The agent and handover can use scanned/manual identifiers while targeted visual integration is underway; release still requires real SAM/Muse evidence.

Use **2–4 November** for unfinished essentials, evaluation and filming where available. Freeze new features by 3 November. Internal submission target: **4 November, 20:00 WAT**. The supplied organizer deadline is **4 November, 21:00 New York / 5 November, 03:00 WAT**; check the event page for changes before submission.

## Phase instructions

**P0:** Read AGENTS and git state. Initialize only missing tooling. Probe the exact documented provider shapes and real phone behavior. Produce evidence; no full app. Missing keys or devices are blocked checks, not passes. Keep probes within confirmed credits and a $3 ceiling; never purchase credits automatically.

**P1:** Implement H1–H3 and H6 of the developer handoff. Public read projection, restricted writes, demo seed CLI, signed directory/audit history and fixed role grants. Use pasted listing text/codes/photos; automatic website fetching is deferred. Six real tools, bounded agent loop, mandatory typed final status. Public viewing needs no login; rate-limit AI requests. Deploy an early HTTPS shell for phone tests.

**P2:** Implement H4. Enroll device keys under authenticated accounts, then build the transfer service and UI. Test ownership failure before styling the animation. Exercise two browser identities, then the two real phones. Recheck authority and expected version at commit. Signed receipt recovery must survive a dropped connection without a second transfer.

**P3:** Implement H5. Start with still photos; a short clip may supply timestamped frames, not a claim of continuous tracking. Use SAM to isolate the actual selected region and Muse to read it without being shown the desired answer. Confirm uncertain observed identifiers with the user while preserving human-correction provenance. Link a packaging-revision notice to the demo item and show its practical consequence.

**P4:** Implement H7 and H8. Cache the offline viewer and trusted metadata, export/import a record-only pack, then test cold restart without internet. Try genuine OS Bluetooth file sharing; identify the actual radios used. Rehearse all scenes, run release gates and deploy. Keep camera permission, HTTPS, RLS, secrets, record integrity and replay tests mandatory.

## Conditional experiments

Only begin these after P0–P4 pass. Stop by the feature freeze. Each has a separate result; none is silently required for core completion.

- **Glimmer cloud, 1–2 h:** Use a confirmed hosted Glimmer endpoint; no self-hosted GPU project. Run the same five evidence cases through the same tools, logging next-action correctness, latency and actual usage/cost. Exact provider/model comes from the successful probe. A class named “adapter” is not a completed integration.
- **Tiny student, maximum 3 h feasibility attempt:** Exactly 20 Glimmer teacher examples across valid evidence, mismatched markings, missing proof, ownership conflict and closer-view requests; 5–10 separate held-out cases. Choose a licensed 300–400M text student supported by the tested runtime, train structured action/reason with Transformers/TRL/PEFT as appropriate, quantize, then run through a minimal Android runtime or Termux/llama.cpp. Verify compatibility first. Target 200–300 MB is aspirational; report actual artifact size, RSS and latency. Compare base versus tuned model on held-out cases. No unrelated Llama 3.2 1B showcase. If only data generation succeeds, report only that.
- **Radio bulletin, 30 min:** Generate a short explanation of a verified demo notice, approve the exact text, then use a separately identified TTS or recorded human voice. Full radio infrastructure stays deferred.

## Stop and fallback rules

Provider failure → keep the relevant integration blocked, finish independent contracts, repair the real cause. Handshake failure → stop stretch work and repair it; no scripted success screen. Unsupported Bluetooth → retain working signed download/import and accurately label any local Wi-Fi alternative. Student/radio failure → use the core-only film script. A failed essential remains a disclosed incomplete feature, never an implied pass.

## Codex workflow

Copy this pack into the intended repository. Paste `PackProof_v10_First_Codex_Prompt.md`; it implements P0 only. After each phase, give a smaller model this plan, the handoff’s relevant sections, `BUILD_STATE.json`, the latest evidence report and `PROMPT_GENERATOR.md`. It emits one next-phase or repair prompt. Codex checks the actual repository before changing it.

Every phase records changed files, exact commands/results, real/manual checks, acceptance IDs, evidence paths, spend if known, blockers and next readiness. States are `not_started`, `in_progress`, `partial`, `blocked`, `verified` or `deferred`. A skipped manual test is not verified. Preserve unrelated edits and existing AGENTS; do not rewrite requirements to match a bug.

Release means the live HTTPS URL opens on both phones, the allowed journey and refusal work, offline reload is genuine, demo data is labeled, the public repository contains no secrets, and the video is accessible and at most 180 seconds. Capture actual measurements and disclose small sample sizes; no invented benchmark chart.
