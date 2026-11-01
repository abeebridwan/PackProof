import { evidence } from './evidence.js';
import { readFile, access as fileAccess } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
const required = ['MODEL_API_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'PACKPROOF_HTTPS_TARGET', 'PROBE_TLS_CERT', 'PROBE_TLS_KEY', 'LANGSMITH_API_KEY'];
const access = Object.fromEntries(required.map(k => [k, Boolean(process.env[k])]));
async function executable(name: string) {
  for (const dir of (process.env.PATH ?? '').split(':')) { try { await fileAccess(join(dir, name), constants.X_OK); return true; } catch {} }
  return false;
}
let lastRecordedInfrastructureCheck: unknown = null;
try { lastRecordedInfrastructureCheck = JSON.parse(await readFile('docs/packproof/evidence/infrastructure-check.json', 'utf8')); } catch {}
let httpsOrigin: string | null = null;
try { const url = new URL(process.env.PACKPROOF_HTTPS_TARGET ?? ''); if (url.protocol === 'https:' && !url.username && !url.password) httpsOrigin = url.origin; } catch {}
const data = { credentialsConfigured: access, userConfirmedMetaCreditsUsd: 140, creditBalanceIndependentlyChecked: false,
  userReportsOtherResourcesAvailable: true, deviceModels: { primary: 'vivo Y03 (user-reported)', secondary: null }, testedPhones: 0, adbAvailable: await executable('adb'),
  installedTools: Object.fromEntries(await Promise.all(['supabase', 'docker', 'mkcert', 'openssl'].map(async name => [name, await executable(name)]))),
  httpsTarget: httpsOrigin, supabaseProjectServicesVerified: false, lastRecordedInfrastructureCheck,
  note: 'Configuration/executable inventory only. Historical read-only service checks are separately timestamped; this inventory performs no service/model requests. No secret values or URL credentials/query strings are printed.' };
await evidence('access', data); console.log(JSON.stringify(data));
