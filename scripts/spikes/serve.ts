import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import { signBytes } from '../../src/domain/verification/p0-crypto.js';
import { type FrameBatch } from './phone-measurements.js';

// Ephemeral server probe key stays in memory. Only its public half reaches the browser.
export async function createProbeResponder() {
  const pair = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(pair.publicKey);
  const challenge = randomBytes(32).toString('hex');
  const token = await signBytes(new TextEncoder().encode(challenge), pair.privateKey, 'p0-node');
  const batches: FrameBatch[] = [];
  return async (path: string, basePath = '/') => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(self), microphone=()' };
    const send = (status: number, type: string, body: string | Buffer) => new Response(typeof body === 'string' ? body : new Uint8Array(body), { status, headers: { ...headers, 'Content-Type': type } });
    if (path === '/crypto-challenge') return send(200, 'application/json', JSON.stringify({ challenge, token, publicJwk }));
    const now = Date.now();
    while (batches[0] && Date.parse(batches[0].expiresAt) <= now) batches.shift();
    if (path === '/frames') {
      const batch: FrameBatch = { batchId: crypto.randomUUID(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
        frames: Array.from({ length: 128 }, () => `pp0_${randomBytes(16).toString('base64url')}`), demo: true };
      batches.push(batch); if (batches.length > 20) batches.shift();
      return send(200, 'application/json', JSON.stringify(batch));
    }
    if (path === '/frame-catalog') return send(200, 'application/json', JSON.stringify(batches));
    const file = path === '/' ? 'dist/index.html' : path === '/phone.js' ? 'dist/phone.js' : null;
    if (!file) return send(404, 'text/plain', 'Not found');
    try {
      const bytes = await readFile(file);
      return send(200, file.endsWith('.js') ? 'text/javascript' : 'text/html', file.endsWith('.html') ? bytes.toString().replace('<head>', `<head><base href="${basePath}">`) : bytes);
    } catch { return send(503, 'text/plain', 'Run pnpm build first'); }
  };
}
export async function createProbeHandler(): Promise<http.RequestListener> {
  const respond = await createProbeResponder();
  return (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end('GET only'); return; }
    void respond(req.url ?? '/').then(async response => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }).catch(() => { res.writeHead(503); res.end('Probe unavailable'); });
  };
}
export async function startProbe(port = 4173, host = '127.0.0.1', tls?: { cert: Buffer; key: Buffer }) {
  const handler = await createProbeHandler();
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}
if (process.argv[1]?.endsWith('/serve.ts')) {
  const certPath = process.env.PROBE_TLS_CERT, keyPath = process.env.PROBE_TLS_KEY;
  if (!!certPath !== !!keyPath) throw new Error('Both TLS certificate and key are required');
  const tls = certPath && keyPath ? { cert: await readFile(certPath), key: await readFile(keyPath) } : undefined;
  const host = process.env.PROBE_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && !tls) throw new Error('Phone/LAN access requires trusted HTTPS');
  const server = await startProbe(Number(process.env.PROBE_PORT ?? 4173), host, tls);
  console.log(`P0 probe: ${tls ? 'https' : 'http'}://${host}:${(server.address() as import('node:net').AddressInfo).port}`);
}
