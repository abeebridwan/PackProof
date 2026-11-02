import { readFile, writeFile } from 'node:fs/promises';
import { RootPin } from '../../src/contracts/evidence.js';
import { PostgresEvidenceRepository } from '../../src/server/data/evidence-repository.js';
import { createEvidenceServices } from '../../src/server/evidence/services.js';
import { readAsService, PROJECT_REF } from './database.js';
import { DEMO, NS } from './demo.js';
const pin=RootPin.parse(JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8')));
const services=createEvidenceServices(new PostgresEvidenceRepository(async query=>readAsService(query)),pin);
const findings={
 productOne:await services.lookupProduct({namespace:NS,productMark:'FP-1001',packagingMark:'PK-2001'}),
 shopA:await services.lookupSeller({itemId:DEMO.item1,sellerId:DEMO.shopA}),
 productTwo:await services.lookupProduct({namespace:NS,productMark:'FP-1002',packagingMark:'PK-2002'}),
 shopB:await services.lookupSeller({itemId:DEMO.item2,sellerId:DEMO.shopB}),
 notices:await services.getProductNotices({itemId:DEMO.item2}),
 gap:await services.getCustodyHistory({itemId:DEMO.gapItem}),
};
const evidence={phase:'P1A',projectRef:PROJECT_REF,checkedAt:new Date().toISOString(),databaseRole:'service_role (read grants only; writes revoked)',findings,providerRequests:0};
await writeFile('docs/packproof/evidence/p1a-read-services.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
if(findings.shopA.data?.authorized!==false || findings.shopB.data?.authorized!==true || findings.notices.data?.notices.length!==1 || findings.gap.data?.gaps[0]?.resolved!==false) process.exitCode=1;
