// Local release verification only. Secrets stay in the Node process and are never printed.
import {readFile} from 'node:fs/promises';
process.env.PACK_SIGNING_JWK=await readFile('.local/p4/pack-key.json','utf8');
process.env.TRANSFER_SIGNING_JWK=await readFile('.local/p2/transfer-key.json','utf8');
process.env.P2_ENABLED='1';process.env.P1_PROVIDER_MODE='recorded-demo';process.env.P1_TRACING='false';process.env.APP_ORIGIN='http://127.0.0.1:4184';
const {spawn}=await import('node:child_process');const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4184'],{stdio:'inherit',env:process.env});for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
