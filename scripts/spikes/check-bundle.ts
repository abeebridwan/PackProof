import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { evidence } from './evidence.js';
const inputs = JSON.parse(await readFile('dist/bundle-inputs.json', 'utf8')) as string[];
const bundle = await readFile('dist/phone.js', 'utf8');
const forbiddenInputs = inputs.filter(p => /scripts\/spikes\/(provider|budget|access|serve|fixture-registry|meta-gateway|langchain|safe-tracing|infrastructure|deploy-entry|vercel-entry|package-probe|deployment-browser)|node_modules\/.*(openai|sharp|meta-sam|langchain|langsmith)|\.env/.test(p));
if (forbiddenInputs.length) throw new Error('Server-only module in browser bundle');
if (/MODEL_API_KEY|PACK_SIGNING_JWK|TRANSFER_SIGNING_JWK|SUPABASE_SECRET_KEY|SUPABASE_DB_URL|BEGIN PRIVATE KEY/.test(bundle)) throw new Error('Secret marker in browser bundle');
let env: Record<string, string | undefined> = {};
try { env = parseEnv(await readFile('.env.local', 'utf8')); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
const secrets = Object.entries(env).filter((entry): entry is [string, string] => {
  const [k, v] = entry;
  return /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|DB_URL/.test(k) && !/PUBLISHABLE|TLS/.test(k) && typeof v === 'string' && v.length > 8;
});
if (secrets.some(([, v]) => bundle.includes(v))) throw new Error('Configured secret bytes in browser bundle');
const result = { status: 'passed', serverOnlyInputs: 0, checkedConfiguredSecrets: secrets.length, storedPrivateKeys: false,
  note: 'Generated test private keys stay in process memory. Browser device key is nonextractable. This check inspects the browser bundle, not Git history.' };
await evidence('bundle-check', result); console.log(JSON.stringify(result));
