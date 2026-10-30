import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { verifyBytes, utf8 } from '../../src/domain/verification/p0-crypto.js';
import { PublicJwk } from '../../src/contracts/p0.js';
import { startProbe } from './serve.js';

const server = await startProbe(0);
const port = (server.address() as import('node:net').AddressInfo).port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => typeof (window as unknown as { p0Crypto?: unknown }).p0Crypto === 'function');
  const result = await page.evaluate(async () => (window as unknown as { p0Crypto: () => Promise<{ browserToken: string; challenge: string; browserPublicJwk: unknown; nodeToBrowser: boolean; privateKeyExtractable: boolean }> }).p0Crypto());
  const payload = await verifyBytes(result.browserToken, [{ kid: 'p0-browser', jwk: PublicJwk.parse(result.browserPublicJwk), role: 'device', namespace: 'packproof-demo' }], 'device', 'packproof-demo');
  if (new TextDecoder().decode(payload) !== result.challenge) throw new Error('Browser signature payload mismatch');
  const parts = result.browserToken.split('.'); parts[1] = Buffer.from('altered').toString('base64url');
  let tamperedBrowserSignatureRejected = false;
  try { await verifyBytes(parts.join('.'), [{ kid: 'p0-browser', jwk: PublicJwk.parse(result.browserPublicJwk), role: 'device', namespace: 'packproof-demo' }], 'device', 'packproof-demo'); }
  catch { tamperedBrowserSignatureRejected = true; }
  if (!tamperedBrowserSignatureRejected) throw new Error('Node accepted tampered browser signature');
  await page.fill('#manual', '000123'); await page.click('#useManual');
  if (await page.textContent('#manualResult') !== 'Human supplied mark: 000123') throw new Error('Manual fallback lost leading zeros');
  const transport = { schemaVersion: 1, demo: true, kind: 'transport-feasibility-only', nonce: 'a'.repeat(32), note: 'Not an OfflineProof pack' };
  await page.setInputFiles('#import', { name: 'transport.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(transport)) });
  await page.waitForFunction(() => document.querySelector('#output')?.textContent?.includes('imported-file-only'));
  await page.setInputFiles('#import', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.waitForFunction(() => document.querySelector('#output')?.textContent?.includes('SyntaxError'));
  await page.screenshot({ path: 'docs/packproof/evidence/phone-probe-desktop.png', fullPage: true });
  // Controlled synthetic image only; no customer media. Expected mark is never in the visual prompt.
  await page.setContent('<html><body style="margin:0;background:#d8dfd5"><div style="width:600px;height:480px;display:grid;place-items:center"><div style="background:white;border:8px solid #225044;padding:35px;font:28px monospace;text-align:center">PACKPROOF<br>DEMO PACKAGE<br><br>0071842<br><small>SYNTHETIC FIXTURE</small></div></div></body></html>');
  await mkdir('.local', { recursive: true });
  await page.screenshot({ path: '.local/p0-demo.png', clip: { x: 0, y: 0, width: 600, height: 480 } });
  await mkdir('docs/packproof/evidence', { recursive: true });
  const evidence = { status: 'passed', environment: 'desktop Chromium, not Android', browserVersion: browser.version(), nodeVersion: process.version,
    nodeToBrowser: result.nodeToBrowser, browserToNode: true, nonextractableDeviceKey: !result.privateKeyExtractable,
    exactBytesSha256: await (await import('../../src/domain/verification/p0-crypto.js')).sha256(utf8(result.challenge)),
    negativeChecks: ['browser unknown key', 'browser wrong root role', 'browser SHA-256 tamper', 'browser signature tamper', 'Node rejects tampered browser signature'],
    desktopSurfaceChecks: ['manual input preserves leading zeros', 'small valid JSON import', 'malformed JSON rejected'],
    phoneTestsPassed: false, syntheticImage: '.local/p0-demo.png' };
  await writeFile('docs/packproof/evidence/crypto-browser.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
