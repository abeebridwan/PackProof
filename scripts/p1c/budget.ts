import {P1Budget,P1_COMPLETION_ID,P1_COMPLETION_DIRECTORY,P1_REPAIR_ID,P1_REPAIR_DIRECTORY} from '../../src/server/providers/p1-budget.js';
const args=process.argv.slice(2);const completion=args.includes('--completion');const repair=args.includes('--repair');
if(completion&&repair)throw new Error('Choose one grant');
const values=args.filter(a=>a!=='--completion'&&a!=='--repair');
const budget=repair?new P1Budget(P1_REPAIR_DIRECTORY,{grantId:P1_REPAIR_ID,predecessorPath:`${P1_COMPLETION_DIRECTORY}/budget.json`}):completion?new P1Budget(P1_COMPLETION_DIRECTORY,{grantId:P1_COMPLETION_ID,predecessorPath:'.local/p1c/budget.json'}):new P1Budget();
if(values[0]==='approve'){
 if(values[1]!==budget.approvalStatement)throw new Error('Exact separate user approval statement required; see P1C evidence.');
 budget.approve(values[1]);
}else if(values[0]&&values[0]!=='status')throw new Error('Use status or approve with the exact approval statement');
const ledger=budget.status();
console.log(JSON.stringify({approved:ledger.approval!==null,limits:budget.limits,requests:ledger.requests.length,reservedCents:ledger.reservedCents,estimatedUsd:ledger.requests.reduce((sum,r)=>sum+(r.estimatedUsd??0),0),estimatedUsageCoverage:ledger.requests.filter(r=>r.usage).length,actualBilledUsd:null,approvalRequired:ledger.approval?null:budget.approvalStatement}));
