import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
await mkdir('dist/offline',{recursive:true});
const root=JSON.parse(await readFile('docs/packproof/demo/root-public.json','utf8'));
const result=await build({entryPoints:['src/offline/viewer.ts'],outfile:'dist/offline/viewer.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,define:{PACKPROOF_ROOT:JSON.stringify(root)}});
await writeFile('dist/offline/bundle-inputs.json',JSON.stringify(Object.keys(result.metafile.inputs),null,2));
await copyFile('src/offline/viewer.html','dist/offline/index.html');await copyFile('src/offline/style.css','dist/offline/style.css');
for(const size of [192,512])await sharp('public/icon.svg').resize(size,size).png().toFile(`dist/offline/icon${size}.png`);
await writeFile('dist/offline/manifest.webmanifest',JSON.stringify({id:'/',name:'PackProof',short_name:'PackProof',description:'Signed evidence with clear limits. OfflineProof works after trusted setup.',start_url:'/offline/index.html',scope:'/',display:'standalone',background_color:'#f5f6f2',theme_color:'#183d32',icons:[{src:'/offline/icon192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/offline/icon512.png',sizes:'512x512',type:'image/png',purpose:'any'}]}));
const names=['index.html','viewer.js','style.css','icon192.png','icon512.png','manifest.webmanifest'];const hash=createHash('sha256');for(const n of names)hash.update(await readFile('dist/offline/'+n));const version=hash.digest('hex').slice(0,20);
// Exact public asset allowlist only. No /api requests, responses, cookies or signed packs enter CacheStorage.
await writeFile('dist/offline/sw.js',`const CACHE='packproof-offline-assets-${version}';const ASSETS=${JSON.stringify(names.map(n=>'/offline/'+n))};
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);try{for(const path of ASSETS){const r=await fetch(path,{cache:'reload',credentials:'omit',redirect:'error'});if(!r.ok||r.headers.get('x-packproof-public-asset')!=='1')throw new Error('unsafe_asset_response');await c.put(path,r);}await self.skipWaiting();}catch(error){await caches.delete(CACHE);throw error;}})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('packproof-offline-assets-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.includes(u.pathname)||u.search)return;e.respondWith((async()=>{const c=await caches.open(CACHE),hit=await c.match(u.pathname);if(hit)return hit;return fetch(e.request);})());});\n`);
console.log(JSON.stringify({offlineAssetsBuilt:true,version,viewerBytes:(await readFile('dist/offline/viewer.js')).length}));
