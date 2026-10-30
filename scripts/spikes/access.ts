import { evidence } from './evidence.js';
const required = ['MODEL_API_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'PACKPROOF_HTTPS_TARGET', 'PROBE_TLS_CERT', 'PROBE_TLS_KEY'];
const access = Object.fromEntries(required.map(k => [k, Boolean(process.env[k])]));
const data = { credentialsConfigured: access, userConfirmedMetaCreditsUsd: 140, creditBalanceIndependentlyChecked: false,
  userReportsOtherResourcesAvailable: true, deviceModels: { primary: 'vivo Y03 (user-reported)', secondary: null }, testedPhones: 0, adbAvailable: false,
  httpsTarget: process.env.PACKPROOF_HTTPS_TARGET || null, supabaseAccessVerified: false,
  note: 'Presence only; never prints credential values. User availability is not a completed account, host, or phone test.' };
await evidence('access', data); console.log(JSON.stringify(data));
