# P0 phone and transport checks — manual gate pending

Primary intended device: **vivo Y03**, user-reported; Android/browser versions and second device are unrecorded. No Android phone is accessible from this execution environment. No phone capture, frame rate, scan reliability, or phone-to-phone transport result has been recorded. Desktop crypto and UI checks are separate evidence.

Before testing, record actual phone A/B manufacturer/model, Android version, browser/version and the trusted HTTPS URL. Use the intended low-end POS/Android device if that is the target; a desktop result does not qualify it. One phone can establish capture/manual fallback; the two-phone QR requirement remains pending until a second is tested.

1. Build the surface with `pnpm build`. Run `pnpm probe:serve` with trusted HTTPS configuration from `.env.local`, or run that server behind your existing trusted HTTPS reverse proxy. Open it on both phones. Confirm `secureContext: true`; enter each actual device model.
2. On each phone, allow the rear camera, capture the demo label and record dimensions. Deny camera permission or stop camera and enter `000123` manually. Confirm its leading zeros and human-input label. Capture stays local; the probe does not upload phone images.
3. On A display QR at **5 updates/s**, start scanning on B for the full 12 seconds, then stop camera. Save both reports. Repeat at **10 updates/s**, and repeat both directions. Record lighting, distance, failed attempts, target/actual display rate, decoded/attempt counts, distinct handles and the longest consecutive display-frame sequence observed by the scanner. Compare handles between display and scan reports. Do not call decoded counts a reliable sequence without comparison. H4 later requires three consecutive fresh frames; this prototype accepts no transfer.
4. Download `packproof-p0-transport.json` on A. Disable internet on both phones. Use genuine OS Bluetooth file sharing, or explicitly identify a local Wi-Fi route. Quick Share may use Bluetooth discovery and Wi-Fi payload; record that combination instead of claiming Bluetooth-only. Import on B and compare exact bytes/SHA-256/nonce in the reports. Repeat B→A. Record byte count, duration, radios and failures. Repeat with a broken/malformed file and confirm refusal. File transport does not establish OfflineProof trust, caching or pack verification.
5. Enter the actual transport/direction/elapsed seconds and download each measured device report. Save originals under `docs/packproof/evidence/phones/` after checking for personal details; add observations below. Do not declare a pass from a filled template.

| Check | Device(s) | Result | Measurement/evidence |
| --- | --- | --- | --- |
| Camera permission/capture | unknown | not_run | no hardware access |
| Denied-camera manual fallback | unknown | not_run | desktop-only automation is separate |
| A→B QR, 5 updates/s | unknown | not_run | target; achieved rate unknown |
| A→B QR, 10 updates/s | unknown | not_run | target; achieved rate unknown |
| B→A QR, 5/10 updates/s | unknown | not_run | target; achieved rate unknown |
| A→B JSON export/import without internet | unknown | not_run | transport unknown |
| B→A JSON export/import without internet | unknown | not_run | transport unknown |
| Partial/malformed received JSON | unknown | not_run | no phone test |

These checks are pending, not equivalent desktop successes. F3/F4 and P1 readiness remain blocked until the mandatory evidence exists.
