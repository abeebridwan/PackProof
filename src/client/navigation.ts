// Shared by the app, offline viewer and device-check build.
export const navigation=[
 ['/','Home'],['/products','Products'],['/investigate','Investigate'],
 ['/inspector','Inspect'],['/chainproof','Hand over'],['/dualproof','DualProof'],
 ['/offline/index.html','OfflineProof'],['/developers','Developers'],
] as const;
export const accountLabel='Account / Sign in';
export const signedInAccountLabel='Your account';
export const authChangedEvent='packproof-auth-changed';
export function notifyAuthChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(authChangedEvent));}
// Static offline/device pages share the same label; no session state is saved offline.
export function bindAccountHeader(){
 const link=document.querySelector<HTMLAnchorElement>('header .account-link');if(!link)return;
 let version=0;
 const refresh=async()=>{const current=++version;if(!navigator.onLine)return;try{const r=await fetch('/api/review/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){const v=await r.json();if(current===version)link.textContent=v.authenticated===true?signedInAccountLabel:accountLabel;}}catch{}};
 void refresh();addEventListener('focus',refresh);addEventListener('online',refresh);addEventListener(authChangedEvent,refresh);
}
export function headerHtml(current:string,icon:string){
 return `<header class="topbar"><a class="brand" data-home href="/"><img src="${icon}" width="36" height="36" alt="">PackProof</a><a class="account-link" data-online-only href="/account">${accountLabel}</a></header><nav class="journey" aria-label="PackProof features">${navigation.map(([href,label])=>`<a href="${href}"${href==='/offline/index.html'?'':' data-online-only'}${href===current?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
