import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProbe } from './serve.js';

// Standalone package entry. HTTPS terminates at the existing host's reverse proxy.
process.chdir(dirname(fileURLToPath(import.meta.url)));
const host = process.env.PROBE_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && process.env.PROBE_BEHIND_HTTPS_PROXY !== '1') throw new Error('Non-loopback deployment requires an HTTPS reverse proxy');
const port = Number(process.env.PORT ?? process.env.PROBE_PORT ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid probe port');
const server = await startProbe(port, host);
console.log(JSON.stringify({ probe: 'P0 only', host, port: (server.address() as import('node:net').AddressInfo).port, https: 'provided by host reverse proxy' }));
