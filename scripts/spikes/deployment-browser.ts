import { chromium } from '@playwright/test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FrameBatch } from './phone-measurements.js';
import { PublicJwk } from '../../src/contracts/p0.js';
import { verifyBytes } from '../../src/domain/verification/p0-crypto.js';
import { evidence } from './evidence.js';

const artifact = resolve('.local/p0-deploy');
const child = spawn(process.execPath, [resolve(artifact, 'server.mjs')], { env: { ...process.env, PORT: '0', PROBE_HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let adapter: ReturnType<typeof createServer> | undefined;
try {
  const address = await new Promise<{ port: number }>((resolveAddress, reject) => {
    const timer = setTimeout(() => reject(new Error('Standalone artifact startup timed out')), 8000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Standalone artifact could not start')); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Standalone artifact exited')); });
    const lines = createInterface({ input: child.stdout });
    lines.once('line', line => { clearTimeout(timer); try { resolveAddress(JSON.parse(line)); } catch { reject(new Error('Unexpected standalone startup response')); } });
  });
  const results: unknown[] = [];
  const check = async (url: string, kind: string) => {
    const page = await browser.newPage();
    const response = await page.goto(url);
    if (response?.status() !== 200) throw new Error('Deployment page unavailable');
    await page.waitForFunction(() => typeof (window as unknown as { p0Crypto?: unknown }).p0Crypto === 'function');
    const secure = await page.evaluate(() => isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia));
    if (!secure) throw new Error('Camera secure-context eligibility missing');
    const crypto = await page.evaluate(async () => (window as unknown as { p0Crypto: () => Promise<{ browserToken: string; browserPublicJwk: unknown; challenge: string; privateKeyExtractable: boolean; nodeToBrowser: boolean }> }).p0Crypto());
    const payload = await verifyBytes(crypto.browserToken, [{ kid: 'p0-browser', jwk: PublicJwk.parse(crypto.browserPublicJwk), role: 'device', namespace: 'packproof-demo' }], 'device', 'packproof-demo');
    if (new TextDecoder().decode(payload) !== crypto.challenge || !crypto.nodeToBrowser || crypto.privateKeyExtractable) throw new Error('Deployed crypto failed');
    const assets: Record<string, number> = {};
    for (const path of ['/phone.js', '/crypto-challenge', '/frames', '/frame-catalog']) {
      const asset = await page.request.get(new URL(path, url).href); assets[path] = asset.status();
      if (asset.status() !== 200) throw new Error('Deployment asset unavailable');
      if (path === '/frames') FrameBatch.parse(await asset.json());
      if (path === '/frame-catalog') FrameBatch.array().parse(await asset.json());
    }
    results.push({ kind, url, http: 200, cameraSecureContextEligible: true, cameraCapture: 'not_run', nodeToBrowser: true, browserToNode: true, assets });
    await page.close();
  };
  await check(`http://127.0.0.1:${address.port}/`, 'standalone artifact, desktop localhost only');
  const previous = process.cwd(); process.chdir(artifact);
  try {
    const module = await import(pathToFileURL(resolve(artifact, 'api/probe.mjs')).href) as { default: (req: IncomingMessage & { query?: Record<string, unknown> }, res: ServerResponse) => Promise<void> };
    adapter = createServer((req, res) => {
      const wrapped = req as IncomingMessage & { query?: Record<string, unknown> };
      wrapped.query = { __p0_path: new URL(req.url ?? '/', 'http://probe.local').pathname };
      void module.default(wrapped, res).catch(() => { res.writeHead(500); res.end(); });
    });
    await new Promise<void>((resolveListen, reject) => { adapter!.once('error', reject); adapter!.listen(0, '127.0.0.1', resolveListen); });
    await check(`http://127.0.0.1:${(adapter.address() as import('node:net').AddressInfo).port}/`, 'Vercel adapter emulation, not Vercel deployment');
  } finally { process.chdir(previous); }
  const publicTarget = process.env.PACKPROOF_HTTPS_TARGET;
  if (publicTarget) {
    const url = new URL(publicTarget);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new Error('Expected public HTTPS target, not LAN/localhost');
    await check(url.origin + '/', 'public HTTPS; browser certificate verification enabled');
  }
  await evidence('deployment-browser', { status: 'passed_local_artifact', browserVersion: browser.version(), results, publicDeployment: publicTarget ? 'passed_browser_checks' : 'not_run', physicalPhoneTests: 'not_run', serverlessCatalog: 'per warm instance; scaling/cold-start persistence unverified' });
  console.log(JSON.stringify({ status: 'passed_local_artifact', targets: results.length, publicDeployment: publicTarget ? 'passed_browser_checks' : 'not_run' }));
} finally {
  child.kill('SIGTERM');
  if (adapter) await new Promise<void>(done => adapter!.close(() => done()));
  await browser.close();
}
