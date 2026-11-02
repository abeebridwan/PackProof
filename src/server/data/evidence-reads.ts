import type {SqlReader} from './evidence-repository.js';

// Scope to one owner-bound runtime. Concurrent readers of the same SQL share
// only an in-flight database snapshot; nothing survives settlement. Repository
// callers still parse their own JSON and independently verify every signature.
export function coalesceEvidenceReads(read:SqlReader):SqlReader{
 const pending=new Map<string,Promise<string>>();
 return query=>{
  const existing=pending.get(query);if(existing)return existing;
  const result=Promise.resolve().then(()=>read(query)).finally(()=>pending.delete(query));
  pending.set(query,result);return result;
 };
}
