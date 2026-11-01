import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import { signBytes } from '../../src/domain/verification/p0-crypto.js';
import { type FrameBatch } from './phone-measurements.js';

// Ephemeral server probe key stays in memory. Only its public half reaches the browser.
export async function startProbe(port = 4173, host = '127.0.0.1', tls?: { cert: Buffer; key: Buffer }) {
  const pair = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(pair.publicKey);
  const challenge = randomBytes(32).toString('hex');
  const token = await signBytes(new TextEncoder().encode(challenge), pair.privateKey, 'p0-node');
  const batches: FrameBatch[] = [];
  const handler: http.RequestListener = (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(self), microphone=()' };
    const send = (status: number, type: string, body: string | Buffer) => { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(body); };
    if (req.method !== 'GET') return send(405, 'text/plain', 'GET only');
    if (req.url === '/crypto-challenge') return send(200, 'application/json', JSON.stringify({ challenge, token, publicJwk }));
    const now = Date.now();
    while (batches[0] && Date.parse(batches[0].expiresAt) <= now) batches.shift();
    if (req.url === '/frames') {
      const batch: FrameBatch = { batchId: crypto.randomUUID(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
        frames: Array.from({ length: 128 }, () => `pp0_${randomBytes(16).toString('base64url')}`), demo: true };
      batches.push(batch); if (batches.length > 20) batches.shift();
      return send(200, 'application/json', JSON.stringify(batch));
    }
    if (req.url === '/frame-catalog') return send(200, 'application/json', JSON.stringify(batches));
    const path = req.url === '/' ? 'dist/index.html' : req.url === '/phone.js' ? 'dist/phone.js' : null;
    if (!path) return send(404, 'text/plain', 'Not found');
    void readFile(path).then(bytes => send(200, path.endsWith('.js') ? 'text/javascript' : 'text/html', bytes)).catch(() => send(503, 'text/plain', 'Run pnpm build first'));
  };
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
