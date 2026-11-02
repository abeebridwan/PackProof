import type {Finding} from '../../contracts/investigation.js';

export const EVIDENCE_MAX_AGE_MS=24*60*60*1000;

// Saved findings are historical assessments. Reopening one never renews its
// signed snapshot or the time at which its source checks were performed.
export function historicalFinding(finding:Finding,at:string):Finding{
 const now=Date.parse(at);
 const timestamps=[finding.asOf,finding.product.asOf,...[finding.seller,finding.notices,finding.history].flatMap(r=>r?[r.asOf]:[]),...(finding.history?.data?.snapshot?[finding.history.data.snapshot.asOf]:[])];
 const stale=!Number.isFinite(now)||timestamps.some(t=>!Number.isFinite(Date.parse(t))||Date.parse(t)>now||now-Date.parse(t)>EVIDENCE_MAX_AGE_MS);
 if(!stale||finding.status==='unavailable')return finding;
 return {...finding,status:finding.status==='blocked'?'blocked':'stale',summary:finding.status==='blocked'?finding.summary:'Signed evidence is stale or its retrieval time is unreliable. Refresh before relying on current authority.',sellerStatus:finding.seller?'stale':finding.sellerStatus,seller:finding.seller?{...finding.seller,status:'stale',reason:'Historical registered-seller evidence only; current authorization requires fresh independent checks.'}:null};
}
