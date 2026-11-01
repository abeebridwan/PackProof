# Testing the current PackProof features

These checks exercise the existing feasibility tools. None of the commands below makes paid Meta inference calls. Actual phone checks still need the vivo Y03 and a second phone.

## Setup

From the repository directory:

```bash
export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Expect Node `v24.22.2` and pnpm `12.16.1`. If the local tools are missing, first run `bash scripts/setup-toolchain.sh`. Chrome is required for browser automation; its default location is `/usr/bin/google-chrome`, override with `CHROME_PATH` if needed.

## 1. LangChain tool execution and validated findings

```bash
pnpm probe:langchain
```

Expect `status: "passed"`, `toolActions: 1`, two intercepted model requests, `liveMetaRequests: 0` and `remoteLangSmithRequests: 0`. The returned demo finding should identify packaging mark `PK-2001`. The result is saved in `docs/packproof/evidence/langchain-compatibility.json`.

This uses known fields reconstructed from saved provider evidence, a real local LangChain tool invocation and the actual fictional registry handler. It does not establish new live Muse/LangChain compatibility.

## 2. Malformed calls, prompt injection, false references and action limits

```bash
pnpm exec vitest run tests/unit/langchain.test.ts
```

Expect 11 passing tests. They include unauthorized tools, malformed/extra arguments, injected label text, fabricated references, omitted tools, provider failure and the eight-action ceiling. Invalid paths must produce `unavailable` with no finding, never a supported product result.

## 3. Optional tracing: disabled operation, privacy and outage isolation

```bash
pnpm exec vitest run tests/unit/langchain.test.ts -t "disabled automatic tracing|disabled tracing sends nothing|outage and hanging telemetry|actual LangSmith SDK"
```

Expect four passing tests, with the remaining tests skipped by the filter. These verify that disabled tracing sends nothing even under ambient tracing flags, raw/private fields are refused, hanging or failed senders do not change a validated finding, and the actual LangSmith SDK can serialize allowed events through an intercepted offline sender.

`pnpm probe:langchain` also reports six locally intercepted SDK events. No LangSmith account/key is needed for these tests. Remote trace delivery and full Investigator tracing remain untested.

## 4. QR sequence and duplicate measurements

```bash
pnpm exec vitest run tests/unit/phone-measurements.test.ts
```

Expect seven passing tests covering QR metrics and transport comparison. For QR: repeated scans of the same frame increase duplicates, a single screenshot cannot become three consecutive distinct frames, and unknown/expired/reversed/skipped frames do not inflate sequence reliability.

For actual QR display/scanning, follow the browser and two-phone procedure below. Unit tests do not measure phone scanning performance.

## 5. Browser permission feedback, manual fallback, animation and file integrity

```bash
pnpm build
pnpm probe:phone
```

Expect a passed desktop-only summary with measured rates for the 5/10 updates-per-second targets. It starts a temporary local server and checks simulated camera-permission denial, `000123` manual entry, opaque frame/catalog consistency, a valid file matching its export fingerprint and rejection of an altered but schema-valid file. It records actual timing, not a guaranteed phone rate. Evidence goes to `phone-browser-local.json`.

To exercise local HTTPS instead, use the existing ignored test certificate/key:

```bash
PROBE_TEST_TLS_CERT=.local/tls/probe-cert.pem PROBE_TEST_TLS_KEY=.local/tls/probe-key.pem pnpm probe:phone
```

Those files are local and uncommitted. The test bypasses verification of that local certificate only inside the automated browser. Passing does not establish phone trust, a public deployment or a phone-reachable URL.

## 6. Try each control yourself

```bash
pnpm build
pnpm probe:serve
```

Keep the server terminal open. On the **development computer**, open **http://127.0.0.1:4173**:

1. **Permission feedback:** click **Start rear camera + scan** and deny camera access. Expect an explanation and a manual-entry option. Reset the permission and allow it to try actual local capture; click **Capture locally** and check the image/dimensions. Only real device evidence can qualify the Android gate.
2. **Manual fallback:** enter `000123`, click **Use manual mark**, and confirm all leading zeros remain. The result must say it is human supplied.
3. **Animation:** select **5 frames/s target**, click **Display for 12 seconds**, then inspect `animation.actualFps`, frame count and timings in the report. Repeat at **10**. These are measurements of this device only.
4. **Export:** click **Download demo JSON**. Copy the fingerprint JSON displayed below the button; it contains bytes, SHA-256 and nonce.
5. **Matching import:** paste that fingerprint into **Expected export fingerprint**, then import the downloaded file. Expect `matched-export-fingerprint`. This can be tried on one computer before the real two-phone transport test.
6. **Altered-file rejection:** copy the JSON file, change one nonce character without breaking JSON, and import the copy against the original fingerprint. Expect a rejection explaining that the file differs. A truncated JSON file must also fail.
7. **Uncompared import:** clear the expected-fingerprint field and import the original file again. Expect `imported-uncompared`; valid structure alone must not imply integrity.
8. **Evidence:** fill device/OS/browser fields and the actual transport description, then click **Download measured report**. Do not label local file-picker tests as Bluetooth or two-phone results.

## 7. Actual vivo Y03 / second-phone checks

Use [PHONE_CHECKS.md](docs/packproof/evidence/PHONE_CHECKS.md). Both phones must open the **same phone-reachable trusted HTTPS origin**, not their own localhost address.

Test camera capture/manual fallback on both. Display on A and scan on B at 5 and 10 updates/s, then reverse. Save reports per trial, including attempts, successes, duplicates and longest consecutive distinct sequence. Keep pages open for internet-off file-sharing tests; this is not a cold offline viewer. Transfer via genuine OS Bluetooth or a named local Wi-Fi route, compare the exporter's separately supplied fingerprint, time the transfer and test an altered file. Record Quick Share's actual radios when identifiable.

No phone-reachable HTTPS target is currently configured, so those physical tests remain pending until that setup is available.

## 8. Crypto, browser secrets and infrastructure inventory

```bash
pnpm probe:crypto
pnpm probe:bundle
pnpm probe:access
```

- Crypto should pass both Node/browser signature directions and tamper/unknown-key rejection; new evidence is saved separately in `crypto-browser-amendment.json`.
- Bundle checks require `pnpm build` first and must report no server-only modules or configured secret bytes in browser code.
- Access output distinguishes configured settings from previously recorded service checks. A missing setting is not an infrastructure success. Supabase account listing succeeded previously; a selected PackProof project's Postgres/Auth/private Storage still need verification.

## 9. Full local regression and documented architecture

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm probe:bundle
```

Expect typecheck/build/bundle success and **37 passing tests**. The original shared schemas, crypto and saved SAM parsing tests are included.

[Architecture_Amendments.md](project_handoff/Architecture_Amendments.md) documents the six planned H2 tools, LangGraph/Postgres pause/resume and idempotency, mandatory verification boundaries and both conditional Glimmer workflows. These are design decisions, not running features with live tests yet.

Retain `.local/provider-budget.json`. Do not run the exhausted paid provider probes or reset the ledger. The existing $3 reservation is exhausted; billed expenditure remains unknown. Full acceptance and original provider evidence are in [P0.md](docs/packproof/evidence/P0.md).
