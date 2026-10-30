import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import QRCode from 'qrcode';
import { exportJWK } from 'jose';
import { TransportFixture, PublicJwk } from '../../src/contracts/p0.js';
import { assertHash, sha256, signBytes, utf8, verifyBytes, type TrustedKey } from '../../src/domain/verification/p0-crypto.js';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const report: Record<string, unknown> = { kind: 'P0-manual-probe', userAgent: navigator.userAgent, secureContext: isSecureContext, camera: 'not_run', transport: 'not_run', startedAt: new Date().toISOString() };
const show = () => { el('output').textContent = JSON.stringify(report, null, 2); };
function action(id: string, fn: () => unknown) { el(id).onclick = () => { void Promise.resolve().then(fn).catch(e => { report.error = e instanceof Error ? e.name : 'UnknownError'; show(); }); }; }
function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function browserCrypto() {
  const { token, challenge, publicJwk } = await fetch('/crypto-challenge').then(r => r.json()) as { token: string; challenge: string; publicJwk: JsonWebKey };
  const trust: TrustedKey[] = [{ kid: 'p0-node', jwk: PublicJwk.parse(publicJwk), role: 'pack', namespace: 'packproof-demo' }];
  const payload = await verifyBytes(token, trust, 'pack', 'packproof-demo');
  if (new TextDecoder().decode(payload) !== challenge) throw new Error('Wrong challenge');
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const browserToken = await signBytes(utf8(challenge), pair.privateKey, 'p0-browser');
  let unknownRejected = false, tamperRejected = false, rootRejected = false, signatureTamperRejected = false;
  try { await verifyBytes(token, [], 'pack', 'packproof-demo'); } catch { unknownRejected = true; }
  try { await verifyBytes(token, trust, 'root', 'packproof-demo'); } catch { rootRejected = true; }
  const parts = token.split('.');
  parts[1] = btoa('altered payload').replace(/=/g, '');
  try { await verifyBytes(parts.join('.'), trust, 'pack', 'packproof-demo'); } catch { signatureTamperRejected = true; }
  const hash = await sha256(payload);
  try { await assertHash(utf8(challenge + '!'), hash); } catch { tamperRejected = true; }
  if (!unknownRejected || !tamperRejected || !rootRejected || !signatureTamperRejected || pair.privateKey.extractable) throw new Error('Crypto negative probe failed');
  return { nodeToBrowser: true, browserToken, challenge, browserPublicJwk: await exportJWK(pair.publicKey), unknownRejected, rootRejected, tamperRejected, signatureTamperRejected, privateKeyExtractable: pair.privateKey.extractable };
}
Object.assign(window, { p0Crypto: browserCrypto });
let controls: IScannerControls | undefined;
let attempts = 0;
let scans: { handle: string; atMs: number }[] = [];
let scanStart = 0;
const video = el<HTMLVideoElement>('video');
action('camera', async () => {
  controls?.stop(); attempts = 0; scans = []; scanStart = performance.now();
  const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanSuccess: 30, delayBetweenScanAttempts: 30 });
  controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, result => {
    attempts++;
    if (result && /^pp0_[A-Za-z0-9_-]{22}$/.test(result.getText())) scans.push({ handle: result.getText(), atMs: Math.round(performance.now() - scanStart) });
    report.scan = { attempts, decoded: scans.length, distinct: new Set(scans.map(s => s.handle)).size, elapsedMs: Math.round(performance.now() - scanStart), scans }; show();
  });
  report.camera = { status: 'capturing', width: video.videoWidth, height: video.videoHeight }; show();
});
action('capture', () => {
  if (!video.videoWidth) throw new Error('CameraNotRunning');
  const canvas = el<HTMLCanvasElement>('captureCanvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0); canvas.hidden = false;
  report.capture = { width: canvas.width, height: canvas.height, source: 'live-camera', at: new Date().toISOString() }; show();
});
action('stop', () => { controls?.stop(); report.cameraStopped = true; show(); });
action('useManual', () => {
  const value = el<HTMLInputElement>('manual').value;
  if (!value || value.length > 256) throw new Error('InvalidManualMark');
  el('manualResult').textContent = `Human supplied mark: ${value}`;
  report.manual = { value, source: 'human-input', modelConfirmed: false }; show();
});
let animating = false;
action('animate', async () => {
  if (animating) return; animating = true;
  try {
    const { frames } = await fetch('/frames').then(r => r.json()) as { frames: string[] };
    const hz = Number(el<HTMLSelectElement>('rate').value);
    const canvases = await Promise.all(frames.map(async handle => { const c = document.createElement('canvas'); await QRCode.toCanvas(c, handle, { width: 280, margin: 4, errorCorrectionLevel: 'M' }); return c; }));
    const target = el<HTMLCanvasElement>('qr'), times: number[] = [], displayed: string[] = [];
    const start = performance.now();
    await new Promise<void>(resolve => {
      let next = start;
      const tick = (now: number) => {
        if (now - start >= 12_000) { resolve(); return; }
        if (now >= next) { const i = times.length % canvases.length; target.getContext('2d')!.drawImage(canvases[i]!, 0, 0); times.push(now - start); displayed.push(frames[i]!); next = now + 1000 / hz; }
        requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    });
    report.animation = { targetFps: hz, actualFps: (times.length - 1) * 1000 / ((times.at(-1) ?? 0) - (times[0] ?? 0)), frameCount: times.length, frameTimesMs: times, handles: displayed, durationMs: performance.now() - start }; show();
  } finally { animating = false; }
});
action('download', async () => {
  const fixture = TransportFixture.parse({ schemaVersion: 1, demo: true, kind: 'transport-feasibility-only', nonce: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''), note: 'Not an OfflineProof pack' });
  const bytes = utf8(JSON.stringify(fixture, null, 2));
  report.export = { bytes: bytes.length, sha256: await sha256(bytes), nonce: fixture.nonce };
  download(fixture, 'packproof-p0-transport.json'); show();
});
el<HTMLInputElement>('import').onchange = () => { void (async () => {
  const file = el<HTMLInputElement>('import').files?.[0]; if (!file) return;
  if (file.size > 4096) throw new Error('TransportFixtureTooLarge');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fixture = TransportFixture.parse(JSON.parse(new TextDecoder().decode(bytes)));
  report.transport = { status: 'imported-file-only', bytes: bytes.length, sha256: await sha256(bytes), nonce: fixture.nonce, internetOnlineSignal: navigator.onLine }; show();
})().catch(e => { report.error = e instanceof Error ? e.name : 'UnknownError'; show(); }); };
action('crypto', async () => { report.crypto = await browserCrypto(); show(); });
action('report', () => { report.deviceModel = el<HTMLInputElement>('device').value || 'unknown'; report.transportDescription = el<HTMLInputElement>('transport').value || 'not recorded'; report.finishedAt = new Date().toISOString(); download(report, 'packproof-p0-device-report.json'); });
