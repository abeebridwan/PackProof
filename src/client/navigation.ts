// Shared by the app, offline viewer and device-check build.
export const navigation=[
 ['/review','Start here'],['/products','Products'],['/','Investigate'],
 ['/inspector','Inspect'],['/chainproof','Hand over'],['/dualproof','DualProof'],
 ['/offline/index.html','OfflineProof'],['/developers','Developers'],
] as const;
export const accountLabel='Account / Sign in';
export function headerHtml(current:string,icon:string){
 return `<header class="topbar"><a class="brand" data-home href="/review"><img src="${icon}" width="36" height="36" alt="">PackProof</a><a class="account-link" data-online-only href="/account">${accountLabel}</a></header><nav class="journey" aria-label="PackProof features">${navigation.map(([href,label])=>`<a href="${href}"${href==='/offline/index.html'?'':' data-online-only'}${href===current?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
