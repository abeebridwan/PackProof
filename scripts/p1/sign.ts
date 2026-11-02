import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { importJWK } from 'jose';
import { signRecord } from '../../src/domain/trust/evidence.js';
// Offline CLI only. It is never imported by the server or browser.
const [input, keyFile, keyName, output] = process.argv.slice(2);
if (!input || !keyFile || !keyName || !output) throw new Error('Usage: record:sign <payload.json> <.local/p1/offline-keys.json> <root|issuer|other|revoked> <output.json>');
if (!resolve(keyFile).startsWith(resolve('.local/p1')+sep) || ((await stat(keyFile)).mode & 0o077)) throw new Error('Use owner-only ignored offline key storage');
const keys = JSON.parse(await readFile(keyFile,'utf8'));
if (!keys[keyName]?.d) throw new Error('Offline signing key unavailable');
const stored = await signRecord(JSON.parse(await readFile(input,'utf8')),await importJWK(keys[keyName],'ES256') as CryptoKey);
await writeFile(output,JSON.stringify(stored,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({id:stored.id,sha256:stored.sha256}));
