# Product direction notes

30 October 2026 — user clarification, retained alongside the v10 handoff.

This is a starting point. Product choices may change as evidence and feedback arrive. Record deliberate changes in BUILD_LOG.md; a change in direction does not retroactively pass an unmet verification gate.

Muse Glimmer supports both POS/Android verification and radio/voice workflows in PackProof's proposed direction. Hosted Glimmer can investigate product and seller evidence and prepare verified radio content. A Glimmer-distilled student targets offline evidence explanations and next-step guidance on compatible POS/Android devices.

Both paths use the same PackProof backend and contracts, with signed cached records offline. Cryptographic and ownership checks remain deterministic and mandatory. Distillation is conditional on completing the core build. Glimmer is not radio-only, and this proposal does not claim that Glimmer 30B itself runs on ordinary POS devices. Hosted endpoint availability, student compatibility, and radio/voice delivery require their own measured evidence.

P0 remains the feasibility checkpoint only. No Glimmer hosting, student training, radio delivery, or full app is authorized by this clarification.

Progress communication: report each completed task and its evidence in chat after every bounded prompt. Preserve blockers and report what is ready next.

## 1 November 2026 amendments

The Evidence Investigator will use LangChain for Muse tool orchestration, LangGraph for necessary durable user-input pause/resume and LangSmith for optional tracing/evaluation. This supplements the original v10 stack decision; deterministic backend gates and the independent offline verifier remain authoritative. Only an isolated offline compatibility spike is implemented now. See [Architecture_Amendments.md](Architecture_Amendments.md) for exact package findings, the six unchanged H2 tool schemas, H3 limits and persistence/tracing design.

Hosted Glimmer's connected workflows include product/seller investigation and preparation of grounded verified radio/voice bulletins, with deterministic evidence checks before publication. The distinct Glimmer-distilled student targets POS/Android offline explanations and next-step guidance from cached signed records, explicitly disclosing stale, missing or incomplete evidence. Neither workflow can override signature, issuer, ownership or transfer rules. Actual training, held-out evaluation and hardware testing are required after P0–P4 pass; no Glimmer hosting, distillation, radio infrastructure or POS-native app starts in this task.
