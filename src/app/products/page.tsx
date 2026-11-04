'use client';
import {useEffect,useState} from 'react';
import type {z} from 'zod';
import {AppHeader} from '../../client/journey';
import {platformRead} from '../../client/platform';
import type {ProductDraftInput} from '../../contracts/platform';

type Draft={id:string;data:z.infer<typeof ProductDraftInput>;created_at:string};
const identifiers=[['modelCode','Model code'],['batchCode','Batch identifier'],['productMark','Unit product identifier'],['packagingMark','Packaging identifier'],['containerMark','Container identifier'],['printedExpiry','Printed expiry · human observation']] as const;
function fillSample(form:HTMLFormElement){
 const suffix=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
 const values={name:'PackProof sample product',producer:'Sample manufacturer',description:'Synthetic practice product. Not for sale; no regulatory or safety claim.',scope:'unit',modelCode:'SAMPLE-MODEL',batchCode:'SAMPLE-BATCH-'+suffix,productMark:'SAMPLE-UNIT-'+suffix,packagingMark:'SAMPLE-PACK-'+suffix,containerMark:'SAMPLE-BOX-'+suffix,printedExpiry:'19/08/2028'};
 for(const [name,value] of Object.entries(values)){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement)field.value=value;}
}
export default function Products(){
 const [drafts,setDrafts]=useState<Draft[]>([]),[type,setType]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[evidence,setEvidence]=useState<any[]>([]);
 useEffect(()=>{void Promise.all([platformRead<any>('/api/platform/profile'),platformRead<Draft[]>('/api/platform/drafts')]).then(([p,d])=>{setType(p.accountType);setDrafts(d);}).catch(e=>setError(e.message));},[]);
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setMessage('');const form=e.currentTarget,f=new FormData(form),text=(n:string)=>String(f.get(n)??'').trim();
  try{
   await platformRead('/api/platform/drafts',{name:text('name'),description:text('description'),producer:text('producer'),scope:text('scope'),modelCode:text('modelCode'),batchCode:text('batchCode')||null,productMark:text('productMark')||null,packagingMark:text('packagingMark')||null,containerMark:text('containerMark')||null,printedExpiry:text('printedExpiry')||null});
   setDrafts(await platformRead('/api/platform/drafts'));form.reset();setMessage('Product saved. Add its original photos or video in Your products below.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="app-shell"><AppHeader/><main>
  <div className="page-heading"><div><span className="eyebrow">MANUFACTURER / PRODUCER</span><h1>Add your products.</h1><p>Enter your own product or use the complete sample. Save it, then attach original photos or video.</p></div></div>
  <div className="platform-notifications">{error&&!error.startsWith('Sign in to your PackProof account')&&<p role="alert" className="error-box">{error} <a href="/account?next=/products">Open account →</a></p>}{message&&<p className="progress" role="status">{message}</p>}</div>
  <div className="workspace"><section className="input-panel"><h2>1. Add product details</h2>
   {type==='manufacturer'?<form onSubmit={save}>
    <p>No product ready? Use a sample with unique identifiers. You can edit every field before saving.</p>
    <button type="button" className="text-button" disabled={busy} onClick={e=>{if(e.currentTarget.form){fillSample(e.currentTarget.form);setError('');setMessage('Sample details filled. Review them, then tap Save product.');}}}>Use a sample product</button>
    <label>Product name<input name="name" required maxLength={160}/></label>
    <label>Producer / manufacturer<input name="producer" required maxLength={160}/></label>
    <label>Description<textarea name="description" maxLength={2000}/></label>
    <label>Record scope<select name="scope" aria-label="Record scope"><option value="unit">One unit</option><option value="model">Model</option><option value="batch">Batch</option><option value="container">Container</option></select></label>
    {identifiers.map(([name,label])=><label key={name}>{label}<input name={name} required={name==='modelCode'} maxLength={128}/></label>)}
    <p className="fine-print">Identifiers stay text, including leading zeros. A unit needs a batch and different product and packaging identifiers.</p>
    <button className="primary" disabled={busy}>{busy?'Saving…':'Save product'}</button>
   </form>:type==='regular'?<p>To add products, choose Manufacturer / Producer in <a href="/account?next=/products">your existing account</a>. You keep the same account for buying and selling.</p>:<>
    <p>Sign in with a Manufacturer / Producer account to add products and original evidence.</p><a className="review-cta" href="/account?next=/products">Sign in →</a><p>New to PackProof? <a href="/account?mode=signup&type=manufacturer&next=/products">Create a producer account →</a></p>
   </>}
  </section><section className="results"><h2>2. Your products</h2>
   {!drafts.length&&<p>Save a product to see it here and add its photos or video.</p>}
   {drafts.map(d=><article className="evidence-card" key={d.id} data-product-id={d.id}>
    <h3>{d.data.name}</h3><p>{d.data.producer} · {d.data.scope}</p><p><code>{d.data.productMark??d.data.modelCode}</code> / <code>{d.data.packagingMark??'No packaging code'}</code></p>
    <p className="fine-print">Saved privately · issuer approval pending. Original evidence can be added now. Trusted issuance and registered handovers require a verified issuer’s signature.</p>
    <a className="review-cta" href={`/inspector?draft=${d.id}&product=${encodeURIComponent(d.data.productMark??d.data.name)}&pack=${encodeURIComponent(d.data.packagingMark??'')}`}>Add photos or video →</a>
    {d.data.modelCode==='SAMPLE-MODEL'&&<details className="platform-section"><summary>Show sample label to photograph</summary><p>Display this label on another screen or print it, then photograph it in Inspector.</p>
     <svg viewBox="0 0 1000 480" role="img" aria-label="Synthetic product label" style={{display:'block',width:'100%',height:'auto',background:'#fff',border:'1px solid #cddccf',borderRadius:12}}>
      <g fontFamily="sans-serif" fill="#163b32"><text x="35" y="55" fontSize="30" fontWeight="bold">SYNTHETIC SAMPLE · NOT FOR SALE</text><text x="35" y="110" fontSize="27">PRODUCT: {d.data.productMark}</text><text x="35" y="165" fontSize="27">PACKAGE: {d.data.packagingMark}</text><text x="35" y="220" fontSize="27">BATCH: {d.data.batchCode}</text><text x="35" y="310" fontSize="48" fontWeight="bold">EXP: {d.data.printedExpiry??'Not supplied'}</text><text x="35" y="390" fontSize="24">Practice evidence only. No regulatory or safety claim.</text><text x="35" y="435" fontSize="24">Entered details; not a signed product-issuance record.</text></g>
     </svg>
    </details>}
    <p><button className="text-button" onClick={()=>void platformRead<any[]>(`/api/platform/history?draftId=${d.id}`).then(v=>{setSelected(d.id);setEvidence(v);}).catch(e=>setError(e.message))}>View saved evidence</button></p>
    {selected===d.id&&(!evidence.length?<p>No original evidence attached yet. Use Add photos or video.</p>:evidence.map(v=><figure key={v.id}><img className="platform-image" src={v.mediaUrl} alt="Original producer evidence"/><figcaption>Revision {v.revision} · source fingerprint <code>{v.source_sha256}</code></figcaption></figure>))}
   </article>)}
  </section></div>
 </main></div>;
}
