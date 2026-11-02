import {Finding,ModelAnswer,type Claim,type InvestigationInput,type ToolName} from '../../contracts/investigation.js';
import {z} from 'zod';
import type {EvidenceServices} from '../evidence/services.js';
import type {ToolResult} from './types.js';
const REQUIRED=['lookup_product','lookup_seller','get_product_notices','get_custody_history'] as const;
export function factCatalog(results:Partial<Record<ToolName,ToolResult>>):Claim[]{
 const facts:Claim[]=[];
 for(const name of REQUIRED){const r=results[name];if(!r)continue;
  if(name==='lookup_product'){
   facts.push({id:'product.records',kind:'issuer',text:r.reason,evidence_refs:r.evidence_refs});
  }else if(name==='lookup_seller')facts.push({id:'seller.authorization',kind:'seller',text:r.reason,evidence_refs:r.evidence_refs});
  else if(name==='get_product_notices'){
   const data=r.data as {notices:{recordId:string;explanation:string}[]}|null;
   if(data?.notices.length)for(const n of data.notices)facts.push({id:`notice.${n.recordId}`,kind:'notice',text:n.explanation,evidence_refs:[n.recordId]});
   else facts.push({id:'notices.coverage',kind:'limitation',text:r.reason,evidence_refs:r.evidence_refs});
  }else facts.push({id:'history.coverage',kind:'history',text:r.reason,evidence_refs:r.evidence_refs});
 }
 return facts;
}
export async function finalize(options:{input:InvestigationInput;services:EvidenceServices;selected:Partial<Record<ToolName,ToolResult>>;answer:unknown;error:string|null;pendingEvidence?:boolean;mode?:'live'|'recorded-demo';at?:string;clock?:()=>string;maxAgeMs?:number;audit?:(name:ToolName,result:ToolResult)=>Promise<void>}){
 const i=options.input;
 const product=await options.services.lookupProduct({namespace:i.namespace,productMark:i.productMark,packagingMark:i.packagingMark});
 const item=product.data?.itemId;
 // These independent reads still validate their signed sources separately.
 const [seller,notices,history]=await Promise.all([
  item&&i.sellerId?options.services.lookupSeller({itemId:item,sellerId:i.sellerId}):null,
  item?options.services.getProductNotices({itemId:item}):null,
  item?options.services.getCustodyHistory({itemId:item}):null,
 ]);
 const at=options.at??options.clock?.()??new Date().toISOString();
 const checks={lookup_product:product,lookup_seller:seller,get_product_notices:notices,get_custody_history:history};
 // Wait for every audit write, including when another fails. Do not release
 // the request's pool with outstanding writes or issue a partial finding.
 const audits=await Promise.allSettled(Object.entries(checks).flatMap(([name,result])=>result&&options.audit?[options.audit(name as ToolName,result)]:[]));
 const failedAudit=audits.find(r=>r.status==='rejected');
 if(failedAudit?.status==='rejected')throw failedAudit.reason;
 const missingChecks=REQUIRED.filter(name=>!options.selected[name]||!checks[name]);
 const facts=factCatalog(Object.fromEntries(Object.entries(checks).filter(([,v])=>v!==null)) as Partial<Record<ToolName,ToolResult>>);
 // A server assessment at a persisted evidence request is not a final model
 // answer. It can have no selected facts yet; all mandatory checks still run.
 const awaiting=options.pendingEvidence===true&&options.selected.request_additional_evidence?.status==='needs_evidence';
 const answer=(awaiting?ModelAnswer.or(z.strictObject({claimIds:z.tuple([])})):ModelAnswer).safeParse(options.answer);
 const ids=answer.success?answer.data.claimIds:[];
 const badCitations=!answer.success||new Set(ids).size!==ids.length||ids.some(id=>!facts.some(f=>f.id===id));
 const timestamps=Object.values(checks).flatMap(r=>r?[r.asOf]:[]);
 if(history?.data?.snapshot)timestamps.push(history.data.snapshot.asOf);
 const stale=timestamps.some(time=>Date.parse(at)<Date.parse(time)||Date.parse(at)-Date.parse(time)>(options.maxAgeMs??86400000));
 const inspected=options.selected.inspect_product_image;
 const gates=Object.values(checks).filter(v=>v!==null);
 let status:'supported'|'blocked'|'needs_evidence'|'unavailable'|'stale'='supported';
 if(options.error||badCitations)status='unavailable';
 else if(inspected?.status==='blocked'||gates.some(r=>r.status==='blocked'))status='blocked';
 else if(gates.some(r=>r.status==='unavailable'))status='unavailable';
 else if(stale||gates.some(r=>r.status==='stale'))status='stale';
 else if(awaiting||missingChecks.length||gates.some(r=>r.status==='needs_evidence')||i.context==='physical')status='needs_evidence';
 const summary=status==='supported'?'Fictional listing records support this relationship and registered seller. The physical item has not been inspected.':status==='blocked'?(seller?.status==='blocked'?seller.reason:product.status==='blocked'?product.reason:inspected?.reason??product.reason):status==='unavailable'?'Investigation could not produce a validated explanation. No supported finding was issued.':status==='stale'?'Evidence is stale or its retrieval time is unreliable. Refresh before relying on it.':'More evidence is needed. Record consistency and physical association remain separate.';
 // Model text and invented citations never reach the UI. Only verified fact sentences are selected.
 const selectedFacts=badCitations?[]:ids.map(id=>facts.find(f=>f.id===id)!);
 return Finding.parse({status,recordStatus:product.status,sellerStatus:seller?.status??'needs_evidence',physicalStatus:i.context==='listing'?'not_inspected':'unresolved',demo:true,mode:options.mode??'recorded-demo',summary,claims:selectedFacts,product,seller,notices,history,missingChecks,asOf:at,policyVersion:'p1b-mandatory-finalizer-1'});
}
