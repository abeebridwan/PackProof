import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evidence } from './evidence.js';

const out = '.local/p0-deploy';
await mkdir(`${out}/dist`, { recursive: true });
await mkdir(`${out}/api`, { recursive: true });
for (const file of ['index.html', 'phone.js']) await copyFile(`dist/${file}`, `${out}/dist/${file}`);
for (const [entry, outfile] of [['deploy-entry.ts', 'server.mjs'], ['vercel-entry.ts', 'api/probe.mjs']]) {
  await build({ entryPoints: [`scripts/spikes/${entry}`], outfile: `${out}/${outfile}`, bundle: true, platform: 'node', format: 'esm', target: 'node24', metafile: true }).then(result => {
    if (Object.keys(result.metafile.inputs).some(p => /scripts\/spikes\/(provider|meta-gateway|budget|langchain|safe-tracing)|\.env/.test(p))) throw new Error('Forbidden module in deployment artifact');
  });
}
await writeFile(`${out}/package.json`, JSON.stringify({ name: 'packproof-p0-probe', private: true, type: 'module', engines: { node: '24.x' }, scripts: { start: 'node server.mjs' } }, null, 2) + '\n');
await writeFile(`${out}/vercel.json`, JSON.stringify({ version: 2, framework: null, functions: { 'api/probe.mjs': { includeFiles: 'dist/**', maxDuration: 10 } }, rewrites: ['/', '/phone.js', '/crypto-challenge', '/frames', '/frame-catalog'].map(path => ({ source: path, destination: `/api/probe?__p0_path=${encodeURIComponent(path)}` })) }, null, 2) + '\n');
await writeFile(`${out}/Caddyfile`, '{$PROBE_DOMAIN} {\n  reverse_proxy 127.0.0.1:4173\n}\n');
const files = ['server.mjs', 'api/probe.mjs', 'dist/index.html', 'dist/phone.js', 'package.json', 'vercel.json', 'Caddyfile'];
const manifest = await Promise.all(files.map(async path => { const bytes = await readFile(`${out}/${path}`); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }));
const archive = '.local/packproof-p0-probe.tgz';
// Explicit file allowlist: no env, keys, account credentials, logs, or user images.
execFileSync('tar', ['-czf', archive, '-C', out, ...files]);
await evidence('deployment-artifact', { status: 'prepared', node: process.version, directory: out, archive, files: manifest, providerRequests: 0, credentialsIncluded: false, publicDeployment: 'not_run', serverlessLimitation: 'Vercel frame catalog is per warm instance, not durable. Physical QR trials should use the existing single-process LAN server.' });
console.log(JSON.stringify({ status: 'prepared', archive, files: files.length, credentialsIncluded: false, publicDeployment: 'not_run' }));
