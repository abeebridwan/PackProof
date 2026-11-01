import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startProbe } from './serve.js';
import { evidence } from './evidence.js';
import { checkTransport, FrameBatch } from './phone-measurements.js';
import type { AddressInfo } from 'node:net';

const tls = process.env.PROBE_TEST_TLS_CERT && process.env.PROBE_TEST_TLS_KEY ? {
  cert: await readFile(process.env.PROBE_TEST_TLS_CERT), key: await readFile(process.env.PROBE_TEST_TLS_KEY),
} : undefined;
const server = await startProbe(0, '127.0.0.1', tls);
const url = `${tls ? 'https' : 'http'}://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  // Ignoring a local test certificate tests HTTPS serving, never Android trust or deployment.
  const page = await browser.newPage({ ignoreHTTPSErrors: Boolean(tls) });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Desktop test denied permission', 'NotAllowedError'); }; });
  await page.goto(url);
  await page.click('#camera');
  await page.waitForFunction(() => document.querySelector('#feedback')?.textContent?.includes('Camera permission denied'));
  await page.fill('#manual', '000123'); await page.click('#useManual');
  if (await page.textContent('#manualResult') !== 'Human supplied mark: 000123') throw new Error('Leading zero regression');
  const catalogResponse = await page.request.get(`${url}/frames`);
  const batch = FrameBatch.parse(await catalogResponse.json());
  const catalog = FrameBatch.array().parse(await (await page.request.get(`${url}/frame-catalog`)).json());
  if (!catalog.some(b => b.batchId === batch.batchId)) throw new Error('Catalog missing active display batch');
  const fixture = { schemaVersion: 1, demo: true, kind: 'transport-feasibility-only', nonce: 'a'.repeat(32), note: 'Not an OfflineProof pack' };
  const bytes = Buffer.from(JSON.stringify(fixture));
  const expected = (await checkTransport(bytes)).fingerprint;
  await page.fill('#expected', JSON.stringify(expected));
  await page.setInputFiles('#import', { name: 'received.json', mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => document.querySelector('#output')?.textContent?.includes('matched-export-fingerprint'));
  await page.setInputFiles('#import', { name: 'altered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...fixture, nonce: 'b'.repeat(32) })) });
  await page.waitForFunction(() => document.querySelector('#feedback')?.textContent?.includes('File differs'));
  const animation: unknown[] = [];
  for (const hz of ['5', '10']) {
    await page.selectOption('#rate', hz); await page.click('#animate');
    await page.waitForFunction(rate => {
      const text = document.querySelector('#output')?.textContent;
      return text && JSON.parse(text).animation?.targetFps === Number(rate);
    }, hz, { timeout: 20_000 });
    const result = JSON.parse((await page.textContent('#output'))!);
    if (!(result.animation.frameCount > 0) || !Number.isFinite(result.animation.actualFps)) throw new Error('Animation not measured');
    animation.push(result.animation);
  }
  await page.screenshot({ path: 'docs/packproof/evidence/phone-probe-amendment-desktop.png', fullPage: true });
  const synthetic = await browser.newPage({ ignoreHTTPSErrors: Boolean(tls) });
  await synthetic.goto(url); await synthetic.click('#camera');
  await synthetic.waitForFunction(() => {
    const text = document.querySelector('#output')?.textContent;
    return text?.startsWith('{') && JSON.parse(text).scan?.attempts >= 15;
  });
  await synthetic.click('#capture'); await synthetic.click('#stop');
  const scanner = JSON.parse((await synthetic.textContent('#output'))!);
  if (scanner.error || scanner.lastError || await synthetic.textContent('#feedback')) throw new Error('Normal ZXing miss became a UI error');
  if (scanner.scan.successes !== 0 || scanner.scan.successfulReadsPerSecond !== 0 || scanner.scan.distinctFramesPerSecond !== 0 || !(scanner.capture.width > 0)) throw new Error('Synthetic QR throughput misreported');
  await evidence('phone-browser-local', { status: 'passed', checkedAt: new Date().toISOString(), environment: 'desktop Chromium only', browserVersion: browser.version(),
    tls: tls ? 'HTTPS served with local test certificate; verification bypass limited to this automated test' : 'desktop localhost HTTP secure context',
    url, actualPhonesTested: 0, camera: 'permission denial and synthetic video simulated; no hardware capture', checks: ['permission feedback', 'manual leading zeros', 'opaque handle batch/catalog', 'matching file fingerprint', 'schema-valid altered-file rejection', '5/10 target animation measurements', 'bundled ZXing continues after ordinary misses without UI errors', 'successful QR throughput stays zero on empty frames'],
    syntheticScanner: { attempts: scanner.scan.attempts, successes: scanner.scan.successes, successfulReadsPerSecond: scanner.scan.successfulReadsPerSecond, distinctFramesPerSecond: scanner.scan.distinctFramesPerSecond },
    animation, f3: 'blocked', f4Transport: 'not_run' });
  console.log(JSON.stringify({ status: 'passed', environment: 'desktop only', tls: Boolean(tls), measuredFps: animation.map(a => (a as { actualFps: number }).actualFps), actualPhonesTested: 0 }));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
