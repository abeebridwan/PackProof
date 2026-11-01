# Phone and transport checks

**F3/F4 remain blocked.** User-submitted physical vivo Y03 report now confirms LAN HTTPS, 480×640 capture, leading-zero manual entry and browser crypto: `phones/vivo-y03-2026-11-01.json` and its assessment. Android/browser metadata is user-entered. Permission-denial fallback is not evidenced in that report. No second phone is available; bidirectional QR and JSON transport tests remain pending. Desktop HTTPS/animation checks in `phone-browser-local.json` remain separate evidence.

## 1. Open the existing probe

From the repository directory:

```bash
export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"
pnpm build
pnpm probe:serve
```

Desktop URL: **http://127.0.0.1:4173**. For local HTTPS, a test leaf certificate/key now exists in ignored `.local/tls/`:

```bash
PROBE_TLS_CERT=.local/tls/probe-cert.pem PROBE_TLS_KEY=.local/tls/probe-key.pem pnpm probe:serve
```

Desktop HTTPS URL: **https://127.0.0.1:4173**. That certificate covers localhost only; it does not establish a phone URL, LAN reachability or phone trust. No existing hosted Site or configured HTTPS domain was found, so no deployment occurred.

For phone testing use an existing trusted HTTPS reverse proxy, or provide a certificate covering the computer's reachable LAN hostname/IP and install only its public CA certificate on the test phones. Never transfer the CA private key, server key or `.env.local`. Set `PROBE_HOST=0.0.0.0` and both TLS paths for direct LAN TLS. Use the same exact HTTPS origin on both phones so the scanner can read the display batch catalog. If using a reverse proxy, its upstream must reach the Node probe, including `/frames`, `/frame-catalog` and `/crypto-challenge`.

| Required setup fact | Actual value |
| --- | --- |
| Phone-accessible HTTPS URL | https://192.168.1.70:4173/ — user phone report confirms secure context |
| A model / Android / browser version | vivo Y03 / Android 16; V2332 Build/BP2A.250605.031. / Chrome 156.0.8078.73 — user-entered |
| B model / Android / browser version | pending / pending / pending |
| HTTPS certificate trusted on both | primary phone reached secure page; second phone not_run |

## 2. Camera and QR (internet/LAN server available)

1. Open the phone HTTPS URL on A and B. Fill device, Android and browser fields. Confirm `secureContext: true` and the exact URL in the report.
2. On each phone, start camera, grant permission and capture the demo label. Save dimensions. Deny/revoke camera permission once, confirm useful error feedback, then enter `000123` manually and verify leading zeros and the human-input label.
3. Start scanning on B. On A choose **5 updates/s** and display for 12 seconds. Stop B's camera and download both reports. Repeat at **10 updates/s**, then reverse A/B and repeat both rates. Download each trial's report before starting another trial because the page retains the latest animation/scan.
4. Record distance and lighting. Supply actual FPS/frame count, attempts, successes, distinct handles, duplicates, unknown/expired/out-of-order observations and `longestConsecutiveDistinctFrames`. Compare the display report's batch/handles with scan evidence. Three consecutive distinct frames are a measurement, not transfer consent or physical proximity proof. If the rate is lower, report the lower result.

## 3. JSON file sharing (internet disabled)

1. Keep the test pages open on both phones; cold offline reload is not implemented. On A download `packproof-p0-transport.json`. Copy the separately shown fingerprint JSON (`bytes`, `sha256`, `nonce`) into B's **Expected export fingerprint** field before import. Do not compute the expected hash from the received file.
2. Disable internet on both phones. Share through **OS Bluetooth file sharing** or a named **local Wi-Fi route**. Quick Share may use Bluetooth discovery and Wi-Fi payload; record the observed combination or unknown radios. Time the transfer and record exact method/direction.
3. Import on B. Require `matched-export-fingerprint` and identical bytes/hash/nonce. Without a supplied fingerprint the result stays `imported-uncompared` and does not establish integrity.
4. Make a copy with one nonce character changed while retaining valid JSON. Import against A's original fingerprint and require rejection. Also try truncated JSON. Save the rejection report; earlier accepted-import information is retained separately.
5. Repeat B→A with a fresh fixture. Enter transport method/radios/direction/elapsed seconds and download reports. This is transport feasibility, not OfflineProof installation.

## Evidence to return

Save reviewed reports under `docs/packproof/evidence/phones/` with names identifying direction/rate/trial. Supply the completed setup facts and this table:

| Trial | Actual FPS | Attempts / successes / distinct / duplicates | Longest consecutive | Result / report file |
| --- | --- | --- | --- | --- |
| A→B, 5/s | unknown | not_run | unknown | pending |
| A→B, 10/s | unknown | not_run | unknown | pending |
| B→A, 5/s | unknown | not_run | unknown | pending |
| B→A, 10/s | unknown | not_run | unknown | pending |
| A→B JSON: method/radios, bytes/hash/nonce, seconds | unknown | not_run | n/a | pending |
| B→A JSON: method/radios, bytes/hash/nonce, seconds | unknown | not_run | n/a | pending |
| Valid-JSON alteration / truncated file | n/a | not_run | n/a | pending |

Supabase account listing is verified through the CLI, but no PackProof project was identified. Select an existing project and configure its URL/publishable key or connect the Supabase integration, then separately verify Postgres, Auth and private Storage. No project creation, migrations, plan upgrade or storage change is part of this check.
