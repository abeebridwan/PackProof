'use client';
import {useEffect,useState} from 'react';
import {AppHeader,useReview} from '../client/journey';

export default function Home(){
 const status=useReview();
 const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[invitationOpen,setInvitationOpen]=useState(false);
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1)),invite=hash.get('invite');
  if(invite){setCode(invite);setInvitationOpen(true);history.replaceState(null,'','/#reviewer');document.getElementById('reviewer')?.scrollIntoView();}
  else if(location.hash==='#reviewer')setInvitationOpen(true);
  const showInvitation=()=>{if(location.hash==='#reviewer')setInvitationOpen(true);};
  window.addEventListener('hashchange',showInvitation);return()=>window.removeEventListener('hashchange',showInvitation);
 },[]);
 async function enter(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const r=await fetch('/api/review/enter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:code.trim()})}),v=await r.json();if(!r.ok)throw new Error(v.message??'Check your reviewer code.');location.assign('/');}
  catch(e){setError((e as Error).message);setBusy(false);}
 }
 const unit=status?.units?.find(u=>u.available)??status?.units?.[0];
 const inspectionUrl=unit?'/inspector?product='+encodeURIComponent(unit.product)+'&pack='+encodeURIComponent(unit.packaging):'/inspector';
 const offlineUrl=unit?'/offline/index.html#item='+unit.id+'&label='+encodeURIComponent(unit.product+' / '+unit.packaging):'/offline/index.html';
 return <div className="app-shell review-home"><AppHeader/><main>
  <div className="page-heading"><div><span className="eyebrow">WELCOME TO PACKPROOF</span><h1>What would you<br/><em>like to do?</em></h1><p>Check a product, add original evidence or hand an item to its next owner. Start with the task you need.</p></div><aside className="demo-note"><div><b>One account for buying and selling.</b><p>Retailers, distributors and consumers use a Regular User account. Manufacturers and producers can also create product drafts and upload original evidence.</p></div></aside></div>
  <div className="review-entry">{status?.authenticated?<><a className="account-link" href="/account">Your account</a><p>You’re signed in. Choose a task below.</p></>:<><a className="account-link" href="/account?mode=signup">Create an account</a><a className="home-sign-in" href="/account">Already have an account? Sign in →</a><p>You can check public product records before signing in.</p></>}</div>
  <section id="reviewer" className="review-access evidence-card">{status?.reviewer?<><span className="eyebrow">REVIEWER ACCESS READY</span><h2>Your sample items are ready</h2><p>{status.live?'Live Muse and SAM are enabled. Photos and video frames require your consent.':'Live AI is unavailable or the shared allowance has ended. Saved records and signature checks remain available.'} Choose any task above or below. Use a separate invitation for the second participant in a handover.</p><p className="fine-print">Sample records are synthetic. Signatures and registered handovers are real; record matches do not establish physical authenticity.</p></>:<details open={invitationOpen} onToggle={e=>setInvitationOpen(e.currentTarget.open)}><summary>Have a reviewer invitation?</summary><p>Enter your private code to use prepared sample items and live AI when its allowance is available. Your sign-in works across PackProof.</p>{error&&<p className="error-box" role="alert">{error}</p>}<form onSubmit={enter} className="review-login"><label>Reviewer code<input autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} required maxLength={32}/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Enter reviewer session'}</button></form><p className="fine-print">Keep your code private. Each handover participant uses a different invitation.</p></details>}</section>
  <section aria-label="Choose your task" className="review-cards home-paths">
   <article className="evidence-card"><span className="eyebrow">FOR BUYERS, RETAILERS AND DISTRIBUTORS</span><h2>Check a product</h2><p>Enter product and packaging codes to check records, seller authority, notices and custody history. Continue to a photo or video if you need more evidence.</p><a className="review-cta" href="/investigate">Check product records →</a><p className="fine-print">No account needed for public record checks.</p></article>
   <article className="evidence-card"><span className="eyebrow">FOR MANUFACTURERS AND PRODUCERS</span><h2>Add your products</h2><p>Create a Manufacturer / Producer account, save product identifiers and attach original photos or video frames.</p><a className="review-cta" href={status?.authenticated?'/products':'/account?mode=signup&type=manufacturer&next=/products'}>{status?.authenticated?'Open your products →':'Set up a producer account →'}</a><p className="fine-print">Drafts need separately verified issuer approval before becoming trusted product records.</p></article>
   <article className="evidence-card"><span className="eyebrow">FOR CURRENT OWNERS AND RECEIVERS</span><h2>Send or receive an item</h2><p>Use ChainProof to review the item, exchange QR checks and both approve a signed handover. Buying and selling use the same account.</p><a className="review-cta" href={status?.authenticated?'/chainproof':'/account?next=/chainproof'}>Start a handover →</a><p className="fine-print">Each participant needs their own account and phone.</p></article>
  </section>

  <h2>More ways to use PackProof</h2><div className="review-cards">
   <article className="evidence-card"><h2>Inspect a photo or video</h2><p>Photograph a marking or select a frame from a short video. Read visible text, check packaging condition and supply a clearer view when requested.</p><a className="review-cta" href={inspectionUrl}>Open Inspector →</a><a href="/review-label.png" target="_blank" rel="noreferrer">Open a sample label to photograph ↗</a></article>
   <article className="evidence-card"><h2>Compare before and after</h2><p>DualProof compares dispatch and arrival evidence for a handover. See differences, missing details and requests for a closer view.</p><a className="review-cta" href="/dualproof">Compare handover evidence →</a></article>
   <article className="evidence-card"><h2>Keep evidence offline</h2><p>Prepare your browser online, then download or receive a signed pack. Verify it and reopen saved evidence without internet.</p><a className="review-cta" href={offlineUrl}>Open OfflineProof →</a></article>
   <article className="evidence-card"><h2>Connect your software</h2><p>Use the API, TypeScript SDK, MCP or browser tools to work with the same evidence and authorization checks.</p><a className="review-cta" href="/developers">Open developer tools →</a></article>
  </div>
 </main><footer><b>PackProof</b><a href="/tools">Camera and device diagnostics</a></footer></div>;
}
