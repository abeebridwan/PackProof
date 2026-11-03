// Reuse the verified pooler for all operator-only P2 checks; never print its URI.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const kind=process.argv[2];
if(!['integration','browser','preservation','migrate','accounts','media'].includes(kind??''))throw new Error('Use integration, browser, preservation, migrate, accounts or media');
process.env.SUPABASE_DB_URL=(await readFile(process.env.PACKPROOF_PREVIEW_DB_URL_FILE??'.local/deploy/preview-db-url','utf8')).trim();
if(kind==='media'){
 process.env.PACKPROOF_P1B_INTEGRATION='1';process.env.PACKPROOF_INTEGRATION_EVIDENCE='docs/packproof/evidence/p2-media-isolation.json';
 try{execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/integration/p1b.test.ts','-t','uploads a bounded controlled image','--reporter=json','--outputFile=docs/packproof/evidence/vitest-p2-media.json'],{stdio:'inherit',env:process.env,timeout:200000});}catch{process.exitCode=1;}
}else if(kind==='integration'){
 process.env.PACKPROOF_P2_INTEGRATION='1';
 try{execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/integration/p2.test.ts',...(process.argv[3]?['-t',process.argv[3]]:[]),'--reporter=verbose','--reporter=json',`--outputFile=docs/packproof/evidence/${process.argv[3]?'vitest-p2-targeted-repair.json':'vitest-p2-integration-final.json'}`],{stdio:'inherit',env:process.env,timeout:450000});}catch{process.exitCode=1;}
}else if(kind==='browser')await import('./browser.js');
else if(kind==='preservation')await import('./check-existing.js');
else if(kind==='migrate'){
 const {databasePool}=await import('../../src/server/data/postgres.js'),{migrateP2}=await import('./migrate.js');const pool=databasePool();try{console.log(JSON.stringify(await migrateP2(pool)));}finally{await pool.end();}
}else {process.argv[2]='--prepare';await import('./accounts.js');}
