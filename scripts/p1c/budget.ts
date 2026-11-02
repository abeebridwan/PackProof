import {P1Budget,P1_APPROVAL} from '../../src/server/providers/p1-budget.js';
const budget=new P1Budget();
if(process.argv[2]==='approve'){
 if(process.argv[3]!==P1_APPROVAL)throw new Error('Exact separate user approval statement required; see P1C evidence.');
 budget.approve(process.argv[3]);
}else if(process.argv[2]&&process.argv[2]!=='status')throw new Error('Use status or approve with the exact approval statement');
const ledger=budget.status();
console.log(JSON.stringify({approved:ledger.approval!==null,requests:ledger.requests.length,reservedCents:ledger.reservedCents,estimatedUsd:ledger.requests.reduce((sum,r)=>sum+(r.estimatedUsd??0),0),estimatedUsageCoverage:ledger.requests.filter(r=>r.usage).length,actualBilledUsd:null,approvalRequired:ledger.approval?null:P1_APPROVAL}));
