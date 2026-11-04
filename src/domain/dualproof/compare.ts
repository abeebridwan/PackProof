import {DualComparison,type DualComparison as Comparison} from '../../contracts/platform.js';
import type {PackagingCondition} from '../../contracts/inspection.js';
export type ComparedEvidence={id:string;side:'dispatch'|'arrival';captureId:string;sourceSha256:string;sourceVideoSha256?:string|null;integrity:boolean;conditionNote:string;readings:{question:'product_mark'|'package_mark'|'printed_expiry'|'packaging_condition';value:string|null;bound:boolean;observationId:string;condition?:PackagingCondition|null}[]};
export function compareEvidence(transferId:string,records:ComparedEvidence[],expected:{product:string;packaging:string},notices:{id:string;message:string}[],asOf=new Date().toISOString()):Comparison{
 const findings:Comparison['findings']=[];const sides=['dispatch','arrival'] as const;
 for(const question of ['product_mark','package_mark','printed_expiry'] as const){
  const values=sides.map(side=>records.filter(r=>r.side===side).flatMap(r=>r.readings.filter(o=>o.question===question).map(o=>({record:r,observation:o}))));
  const observed=values.map(v=>[...new Set(v.filter(o=>o.record.integrity&&o.observation.bound&&o.observation.value!==null).map(o=>o.observation.value!))]);
  const refs=values.flatMap(v=>v.flatMap(o=>[o.record.id,o.observation.observationId]));
  const expectedValue=question==='product_mark'?expected.product:question==='package_mark'?expected.packaging:null;
  // Keep the original literal for display. Only a printed EXP label is ignored
  // when comparing a complete date string; no date format, year or validity is inferred.
  const comparable=(value:string)=>question==='printed_expiry'?(value.match(/^(?:EXP(?:IRY)?(?:\s+DATE)?[:.\s]+)?(\d{2}\/\d{2}\/\d{4})$/i)?.[1]??value):value;
  const forms=observed.map(v=>[...new Set(v.map(comparable))]);
  const mismatch=forms.some(v=>v.length>1)||forms[0]!.length===1&&forms[1]!.length===1&&forms[0]![0]!==forms[1]![0]||expectedValue!==null&&observed.some(v=>v.some(value=>value!==expectedValue));
  const status=mismatch?'mismatch':forms.every(v=>v.length===1)?'observed_consistency':values.some(v=>v.some(o=>o.record.integrity&&o.observation.bound&&o.observation.value===null))?'unreadable_evidence':'insufficient_evidence';
  findings.push({field:question,status,dispatch:observed[0]!.join(' / ')||null,arrival:observed[1]!.join(' / ')||null,evidenceRefs:refs,nextView:status==='observed_consistency'?null:`Supply a sharp, glare-free close view of the complete ${question.replaceAll('_',' ')} on the ${observed[0]!.length!==1?'dispatch':'arrival'} side. Contradictory readings need a new contextual view.`});
 }
 for(const part of ['seal','surface'] as const){
  const values=sides.map(side=>records.filter(r=>r.side===side&&r.integrity).flatMap(r=>r.readings.filter(o=>o.question==='packaging_condition'&&o.bound&&o.condition&&o.condition[part]!=='unknown').map(o=>({value:o.condition![part],id:o.observationId}))));
  const unique=values.map(v=>[...new Set(v.map(o=>o.value))]);const status=unique.some(v=>v.length>1)||unique.every(v=>v.length===1)&&unique[0]![0]!==unique[1]![0]?'mismatch':unique.every(v=>v.length===1)?'observed_consistency':'insufficient_evidence';
  findings.push({field:`packaging_${part}_model_observation`,status,dispatch:unique[0]!.join(' / ')||null,arrival:unique[1]!.join(' / ')||null,evidenceRefs:values.flatMap(v=>v.map(o=>o.id)),nextView:status==='observed_consistency'?null:'Show the entire seal and affected outer package surface from a sharp new angle. This is a visible condition observation, not forensic proof.'});
 }
 const reused=records.filter(r=>records.some(other=>other.side!==r.side&&(other.sourceSha256===r.sourceSha256||!!r.sourceVideoSha256&&other.sourceVideoSha256===r.sourceVideoSha256)));
 findings.push({field:'original_integrity',status:records.some(r=>!r.integrity)?'mismatch':sides.every(s=>records.some(r=>r.side===s))?'observed_consistency':'insufficient_evidence',dispatch:null,arrival:null,evidenceRefs:records.map(r=>r.id),nextView:records.some(r=>!r.integrity)?'The saved source or crop failed its fingerprint check. Supply a new original.':null});
 findings.push({field:'reused_source',status:reused.length?'mismatch':records.length?'observed_consistency':'not_inspected',dispatch:null,arrival:null,evidenceRefs:reused.map(r=>r.id),nextView:reused.length?'The same source bytes were used for dispatch and arrival. Take a new arrival photo with the complete package in view.':null});
 const notes=sides.map(s=>records.filter(r=>r.side===s&&r.conditionNote).map(r=>r.conditionNote).join(' / ')||null);
 findings.push({field:'packaging_condition_human_observation',status:notes.every(Boolean)?notes[0]===notes[1]?'observed_consistency':'mismatch':'insufficient_evidence',dispatch:notes[0]!,arrival:notes[1]!,evidenceRefs:records.filter(r=>r.conditionNote).map(r=>r.id),nextView:'Human condition descriptions are not model findings. Supply full-package views of any discrepancy for Inspector.'});
 for(const n of notices)findings.push({field:'manufacturer_packaging_notice',status:'unresolved_physical_association',dispatch:n.message,arrival:null,evidenceRefs:[n.id],nextView:'Compare both package views with this signed packaging-revision notice. A notice alone does not establish the observed revision.'});
 findings.push({field:'physical_association',status:'unresolved_physical_association',dispatch:null,arrival:null,evidenceRefs:records.map(r=>r.id),nextView:'Keep both markings and the full package in one contextual view. Matching readings do not establish authenticity, substitution resistance or uninterrupted custody.'});
 return DualComparison.parse({schemaVersion:1,transferId,asOf,findings,physicalAssociation:'unresolved',ownershipEffect:'none',evidenceRefs:[...new Set(records.map(r=>r.id))]});
}
