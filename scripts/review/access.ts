// Operator-only local access sheet. No invitations or passwords enter public assets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import QRCode from 'qrcode';
type Pair={identities:{role:'buyer'|'seller';code:string}[];items:{product:string;packaging:string}[]};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function writeReviewAccess(pairs:Pair[],settings:{origin:string;limitUsd:number;reviewUntil:string}){
 if(!['https://packproof-p0-preview.vercel.app','https://packproof-p0.vercel.app'].includes(settings.origin))throw new Error('existing_app_origin_required');
 const sections:string[]=[];
 for(const [index,pair]of pairs.entries()){
  const cards:string[]=[];
  for(const role of ['seller','buyer'] as const){
   const a=pair.identities.find(a=>a.role===role);if(!a)throw new Error('review_pair_incomplete');
   const sender=role==='seller',label=sender?'First sender':'First receiver',url=`${settings.origin}/#invite=${encodeURIComponent(a.code)}`,qr=await QRCode.toDataURL(url,{width:240,margin:2});
   cards.push(`<article><h3>${label}</h3><p>${sender?'Starts as the registered owner. Use this invitation on the phone that sends the item.':'Use this invitation on the other phone to receive the item and approve the handover.'}</p><img src="${qr}" alt="Private ${label.toLowerCase()} invitation"><p><a href="${escape(url)}">Open ${label.toLowerCase()} invitation</a></p><p>Reviewer code: <code>${escape(a.code)}</code></p></article>`);
  }
  sections.push(`<section class="pair" id="pair-${index+1}"><h2>Pair ${index+1}</h2><p>Use these two invitations together. Assigned items: ${pair.items.map(i=>`<code>${escape(i.product)} / ${escape(i.packaging)}</code>`).join(' · ')}.</p><div class="cards">${cards.join('')}</div></section>`);
 }
 let manufacturer='<p>No prepared producer sign-in is available locally. Open Account, create an account and choose Manufacturer / Producer.</p>';
 try{
  const accounts=JSON.parse(await readFile('.local/platform/acceptance-accounts.json','utf8')) as {email:string;password:string;userId:string}[];
  const evidence=JSON.parse(await readFile('docs/packproof/evidence/platform-accounts.json','utf8')) as {accounts:{userId:string;accountType:string}[]};
  const producer=accounts.find(a=>evidence.accounts.some(p=>p.userId===a.userId&&p.accountType==='manufacturer'));
  if(producer)manufacturer=`<p>This existing account is for creating private product drafts and original evidence. It is separate from the regular reviewer pairs and does not grant trusted issuer authority or live-AI reviewer access.</p><p><a href="${settings.origin}/account?next=/products">Open manufacturer sign-in</a>, then copy these details:</p><p>Email: <code>${escape(producer.email)}</code></p><p>Password: <code>${escape(producer.password)}</code></p>`;
 }catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
 await mkdir('.local/review',{recursive:true,mode:0o700});
 await writeFile('.local/review/access.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private PackProof access</title><style>body{font:16px/1.6 system-ui;margin:24px auto;max-width:960px;padding:20px;background:#f5f7f4;color:#163b32}h1,h2,h3{line-height:1.25}header,.pair,details{padding:22px;background:white;border:1px solid #cddccf;border-radius:18px;margin-bottom:24px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{padding:18px;border:1px solid #cddccf;border-radius:12px}img{display:block;max-width:100%;height:auto}code{overflow-wrap:anywhere}a{color:#155d3b}li{margin:10px 0}summary{cursor:pointer;font-weight:700}nav{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:500px){body{padding:12px}header,.pair,details{padding:16px}}</style></head><body><header><h1>Which account should I use?</h1><p>${pairs.length} reviewer pairs · ${pairs.length*2} regular accounts · one shared $${settings.limitUsd} AI allowance. Reviewer access ends ${escape(settings.reviewUntil.slice(0,10))}.</p><ul><li><b>First sender:</b> the person who owns the pair’s assigned items at the beginning. Use this invitation on the sending phone.</li><li><b>First receiver:</b> the other person, using the receiving phone. Pick the same pair number.</li><li><b>Manufacturer / Producer:</b> use the separate sign-in below to create private product drafts and add original evidence.</li></ul><p>Sender and receiver are transaction roles. Both reviewer accounts are Regular User accounts: after receiving an item, that person can send it onward using the same account and enrolled device. Each handover requires two different people, independent device keys and both approvals.</p><p>Use one invitation per person. Switching accounts on the same phone during a two-person test is unnecessary. Share only the intended person’s invitation; this entire page contains private access details.</p><nav><a href="#pair-1">Start with Pair 1</a><a href="#manufacturer">Manufacturer sign-in</a></nav></header><details id="manufacturer"><summary>Manufacturer / Producer account</summary>${manufacturer}<p>Trusted product issuance still requires a separately authorized issuer. Saving a draft does not issue a trusted product.</p></details><main>${sections.join('')}</main></body></html>`,{mode:0o600});
}
if(import.meta.main){
 const pairs=JSON.parse(await readFile('.local/review/invitations.json','utf8')) as Pair[];
 const release=JSON.parse(await readFile('docs/packproof/evidence/reviewer-release.json','utf8')) as {limitUsd:number;reviewUntil:string};
 await writeReviewAccess(pairs,{origin:process.env.PACKPROOF_REVIEW_ORIGIN??'https://packproof-p0-preview.vercel.app',limitUsd:release.limitUsd,reviewUntil:release.reviewUntil});
 console.log(JSON.stringify({status:'written',path:'.local/review/access.html',pairs:pairs.length,databaseWrites:0,providerRequests:0}));
}
