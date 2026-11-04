// Operator only: additive synthetic identities/units, never reset an existing item.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {importJWK} from 'jose';
import sharp from 'sharp';
import {writeReviewAccess} from './access.js';
import {databasePool} from '../../src/server/data/postgres.js';
import {loadSources,rootPin} from '../../src/server/transfers/authority.js';
import {validateDataset} from '../../src/server/evidence/services.js';
import {EvidenceRecord,Dataset,type StoredRecord} from '../../src/contracts/evidence.js';
import {signRecord} from '../../src/domain/trust/evidence.js';
import {seedSql} from '../p1/seed.js';
import {DEMO} from '../p1/demo.js';
import {REVIEW_GRANT} from '../../src/server/review/budget.js';
if(!process.argv.includes('--prepare'))throw new Error('Use --prepare; --renew explicitly appends fresh authority for reviewer units only');
process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();
await mkdir('.local/review',{recursive:true,mode:0o700});
type Identity={role:'buyer'|'seller';email:string;password:string;code:string;actorId:string;userId?:string};
type Pair={id:string;identities:Identity[];items:{id:string;product:string;packaging:string}[]};
const pairArgument=process.argv.find(a=>a.startsWith('--pairs='));
const targetPairs=pairArgument?Number(pairArgument.slice('--pairs='.length)):null;
if(targetPairs!==null&&(!Number.isSafeInteger(targetPairs)||targetPairs<1||targetPairs>50))throw new Error('expected_pair_count_1_to_50');
function newPairs(start:number,count:number):Pair[]{
 const suffix=randomBytes(4).toString('hex');
 return Array.from({length:count},(_,index)=>{const n=start+index;return {id:randomUUID(),identities:(['buyer','seller'] as const).map(role=>({role,email:`packproof-review-${suffix}-${n}-${role}@example.invalid`,password:randomBytes(24).toString('base64url'),code:randomBytes(24).toString('base64url'),actorId:randomUUID()})),items:[1,2].map(i=>({id:randomUUID(),product:`JR-${suffix.toUpperCase()}-${n}-${i}`,packaging:`JP-${suffix.toUpperCase()}-${n}-${i}`}))};});
}
const path='.local/review/invitations.json';let pairs:Pair[];
try{pairs=JSON.parse(await readFile(path,'utf8'));}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;
 pairs=newPairs(1,targetPairs??2);
 await writeFile(path,JSON.stringify(pairs,null,2)+'\n',{flag:'wx',mode:0o600});
}
const persist=()=>writeFile(path,JSON.stringify(pairs,null,2)+'\n',{mode:0o600});
if(targetPairs!==null){if(targetPairs<pairs.length)throw new Error('cannot_remove_existing_pairs');if(targetPairs>pairs.length){pairs.push(...newPairs(pairs.length+1,targetPairs-pairs.length));await persist();}}
const authOrigin=process.env.SUPABASE_URL;if(authOrigin!=='https://hvbzxeuedookkwleyjmx.supabase.co')throw new Error('Existing project required');
const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)throw new Error('Operator credential required');
const pool=databasePool();
try{
 const planned=pairs.flatMap(p=>p.items).map(i=>i.id);
 const capacity=(await pool.query('SELECT count(*)::int n FROM packproof.items WHERE NOT(id=ANY($1::uuid[]))',[planned])).rows[0];
 if(capacity.n+planned.length>32)throw new Error('reviewer_unit_capacity_exceeded');
 const sql=await readFile('supabase/migrations/202611040008_review.sql','utf8'),hash=createHash('sha256').update(sql).digest('hex');
 const m=await pool.connect();try{await m.query('BEGIN');await m.query('SELECT pg_advisory_xact_lock(7140915)');const prior=(await m.query("SELECT sha256 FROM packproof.schema_migrations WHERE version='202611040008'")).rows[0];if(prior&&prior.sha256!==hash)throw new Error('migration_hash_changed');if(!prior){await m.query(sql);await m.query("INSERT INTO packproof.schema_migrations(version,sha256) VALUES('202611040008',$1)",[hash]);}await m.query('COMMIT');}catch(e){await m.query('ROLLBACK');throw e;}finally{m.release();}
 const windowSql=await readFile('supabase/migrations/202611040009_review_window.sql','utf8'),windowHash=createHash('sha256').update(windowSql).digest('hex');
 const wc=await pool.connect();try{await wc.query('BEGIN');await wc.query('SELECT pg_advisory_xact_lock(7140915)');const prior=(await wc.query("SELECT sha256 FROM packproof.schema_migrations WHERE version='202611040009'")).rows[0];if(prior&&prior.sha256!==windowHash)throw new Error('migration_hash_changed');if(!prior){await wc.query(windowSql);await wc.query("INSERT INTO packproof.schema_migrations(version,sha256) VALUES('202611040009',$1)",[windowHash]);}await wc.query('COMMIT');}catch(e){await wc.query('ROLLBACK');throw e;}finally{wc.release();}
 for(const pair of pairs)for(const a of pair.identities){
  if(!a.userId){
   const marker=`.local/review/create-${a.actorId}`;let pending=false;try{await stat(marker);pending=true;}catch{}
   if(pending)throw new Error('uncertain_account_create_inspect_before_retry');
   await writeFile(marker,'intent\n',{mode:0o600,flag:'wx'});
   const r=await fetch(`${authOrigin}/auth/v1/admin/users`,{method:'POST',headers:{apikey:secret,authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({email:a.email,password:a.password,email_confirm:true,user_metadata:{demo:true,purpose:'PackProof invited review'}}),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw new Error(`auth_create_${r.status}`);a.userId=(await r.json()).id;await persist();
  }
 }
 const c=await pool.connect();try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7140912)');await c.query('LOCK TABLE packproof.items,packproof.signed_records IN SHARE ROW EXCLUSIVE MODE');
  const pin=await rootPin(),at=(await c.query('SELECT clock_timestamp() at')).rows[0].at.toISOString();
  const before=await loadSources(c,'packproof');await validateDataset(before,pin,at);
  if((await stat('.local/p1/offline-keys.json')).mode&0o077)throw new Error('offline_key_permissions');
  const keys=JSON.parse(await readFile('.local/p1/offline-keys.json','utf8')),issuer=await importJWK(keys.issuer,'ES256') as CryptoKey;
  const records:StoredRecord[]=[],products:Dataset['products']=[];
  async function signed(type:EvidenceRecord['type'],data:unknown,itemId:string,previousIds:string[]=[],visibility='public'){
   const r=EvidenceRecord.parse({schemaVersion:1,id:randomUUID(),type,namespace:pin.namespace,subjectIds:[itemId],scope:'unit',issuerId:DEMO.issuer,keyId:DEMO.issuerKey,issuedAt:at,receivedAt:at,revision:1,previousIds,evidenceHashes:previousIds.map(id=>[...before.records,...records].find(s=>s.id===id)!.sha256),visibility,demo:true,data});
   return signRecord(r,issuer);
  }
  for(const pair of pairs){
   const seller=pair.identities.find(a=>a.role==='seller')!;
   for(const a of pair.identities){
    const old=(await c.query('SELECT actor_id FROM packproof.actor_accounts WHERE user_id=$1',[a.userId])).rows[0];if(old&&old.actor_id!==a.actorId)throw new Error('actor_binding_conflict');
    await c.query('INSERT INTO packproof.actors VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING',[a.actorId,a.role==='seller'?'shop':'consumer',`Fictional reviewer ${pairs.indexOf(pair)+1} · ${a.role}`]);
    await c.query('INSERT INTO packproof.actor_accounts VALUES($1,$2) ON CONFLICT DO NOTHING',[a.actorId,a.userId]);
    await c.query('INSERT INTO packproof.review_access(user_id,actor_id,email,role,pair_id,invite_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[a.userId,a.actorId,a.email,a.role,pair.id,createHash('sha256').update(a.code).digest('hex'),new Date(Date.parse(at)+14*86400000).toISOString()]);
   }
   for(const item of pair.items){
    const existing=before.products.find(p=>p.itemId===item.id);if(existing){if(existing.unitMark!==item.product)throw new Error('existing_unit_conflict');continue;}
    const mark=(value:string,physicalLocation:string)=>({namespace:pin.namespace,value,format:'text',scope:'unit',physicalLocation});
    const issuance=await signed('issuance',{itemId:item.id,modelCode:'JUDGE-SAMPLE',batchCode:'SYNTHETIC-01',unitMark:mark(item.product,'immediate vessel'),registeredHolderId:seller.actorId,ownerVersion:1,lifecycle:'issued',label:'Synthetic reviewer label; never a real product registration or safety claim'},item.id);records.push(issuance);
    const mapping=await signed('mapping',{itemId:item.id,issuanceRecordId:issuance.id,productMark:mark(item.product,'immediate vessel'),packagingMark:mark(item.packaging,'outer wrapper'),containerMark:null},item.id,[issuance.id]);records.push(mapping);
    const custody=await signed('custody',{itemId:item.id,fromActorId:DEMO.issuer,toActorId:seller.actorId,occurredAt:at,kind:'receipt'},item.id,[issuance.id]);records.push(custody);
    const snapshot=await signed('custody_snapshot',{itemId:item.id,holderReference:'Fictional reviewer seller',sourceRecordIds:[custody.id],gapRecordIds:[],asOf:at},item.id,[custody.id]);records.push(snapshot);
    products.push({itemId:item.id,namespace:pin.namespace,unitMark:item.product,modelCode:'JUDGE-SAMPLE',batchCode:'SYNTHETIC-01',issuanceRecordId:issuance.id,mappingRecordId:mapping.id,ownerRecordId:issuance.id,ownerVersion:1,registeredOwnerId:seller.actorId});
   }
  }
  // The existing seed helper refuses ownership/projection conflicts. Strip its
  // outer transaction so the entire append stays inside this locked transaction.
  if(products.length){const currentActors=(await c.query('SELECT id,kind,public_label AS label,demo FROM packproof.actors')).rows;
   const addition=Dataset.parse({schemaVersion:1,demo:true,label:'Fictional PackProof demonstration data',actors:currentActors,records,products});
   const merged=Dataset.parse({...before,actors:currentActors,records:[...before.records,...records],products:[...before.products,...products]});await validateDataset(merged,pin,at);
   await c.query(seedSql(addition).replace(/^BEGIN; /,'').replace(/COMMIT;$/,''));
  }
  // Fixed window, not a fresh allowance each time this operator command runs.
  const previousRelease=JSON.parse(await readFile('docs/packproof/evidence/reviewer-release.json','utf8').catch(()=>'{"checkedAt":null}'));
  const reviewUntil=previousRelease.reviewUntil??new Date(Date.parse(previousRelease.checkedAt??at)+14*86400000).toISOString();
  for(const pair of pairs){await c.query('UPDATE packproof.review_access SET expires_at=$2 WHERE pair_id=$1',[pair.id,reviewUntil]);await c.query('UPDATE packproof.review_units SET authority_until=$2 WHERE pair_id=$1 AND authority_until IS NULL',[pair.id,reviewUntil]);}
  let authorities=0;
  const data=await loadSources(c,'packproof');await validateDataset(data,pin,at);
  for(const pair of pairs)for(const unit of pair.items){
   const p=data.products.find(p=>p.itemId===unit.id)!;
   const old=(await c.query('SELECT id FROM packproof.transfer_authority_snapshots WHERE item_id=$1 AND owner_version=$2 ORDER BY created_at DESC LIMIT 1',[p.itemId,p.ownerVersion])).rows[0];
   if(old&&!process.argv.includes('--renew'))continue;
   const refs=[p.issuanceRecordId,p.mappingRecordId,p.ownerRecordId].filter((v,i,a)=>a.indexOf(v)===i);
   const record=EvidenceRecord.parse({schemaVersion:1,id:randomUUID(),type:'custody_snapshot',namespace:pin.namespace,subjectIds:[p.itemId],scope:'unit',issuerId:DEMO.issuer,keyId:DEMO.issuerKey,issuedAt:at,receivedAt:at,revision:p.ownerVersion,previousIds:refs,evidenceHashes:refs.map(id=>data.records.find(s=>s.id===id)!.sha256),visibility:'restricted',demo:true,data:{itemId:p.itemId,holderReference:`registered-actor:${p.registeredOwnerId}`,sourceRecordIds:refs,gapRecordIds:[],asOf:at}});
   const stored=await signRecord(record,issuer);await c.query('INSERT INTO packproof.transfer_authority_snapshots(id,item_id,owner_version,jws,sha256,payload) VALUES($1,$2,$3,$4,$5,$6)',[stored.id,p.itemId,p.ownerVersion,stored.jws,stored.sha256,record]);authorities++;
   await c.query('INSERT INTO packproof.review_units(item_id,pair_id,product_mark,packaging_mark,seller_id,authority_until) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[p.itemId,pair.id,unit.product,unit.packaging,pair.identities.find(a=>a.role==='seller')!.actorId,reviewUntil]);
  }
  const budget=(await c.query('SELECT limit_cents FROM packproof.review_budget WHERE id=$1',[REVIEW_GRANT])).rows[0];
  if(!budget)throw new Error('existing_approved_budget_required');
  await validateDataset(await loadSources(c,'packproof'),pin,at);await c.query('COMMIT');
  const sample=pairs[0]!.items[0]!;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#fff"/><rect x="30" y="30" width="1140" height="840" rx="20" fill="none" stroke="#163b32" stroke-width="5"/><g font-family="sans-serif" fill="#163b32"><text x="80" y="120" font-size="48" font-weight="bold">PackProof · SYNTHETIC TEST LABEL</text><text x="80" y="195" font-size="30">Fictional sample · not for sale · no regulatory claim</text><text x="80" y="310" font-size="44">PRODUCT: ${sample.product}</text><text x="80" y="400" font-size="44">PACKAGE: ${sample.packaging}</text><text x="80" y="495" font-size="44">BATCH: SYNTHETIC-01</text><text x="80" y="610" font-size="64" font-weight="bold">EXP: 19/08/2028</text><text x="80" y="735" font-size="28">Print or display this label, then photograph it.</text><text x="80" y="790" font-size="28">A literal reading is not a product safety verdict.</text></g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile('public/review-label.png');
  const evidence={...previousRelease,status:'passed',checkedAt:at,pairs:pairs.length,syntheticUnits:pairs.flatMap(p=>p.items).length,newProducts:products.length,newRestrictedAuthorities:authorities,migrationSha256:hash,grant:REVIEW_GRANT,limitUsd:budget.limit_cents/100,requestCountCap:null,invitationFile:path,privateKeysDeployed:false,originalItemsReset:false,reviewUntil,originalItemAuthorityWindowHours:24,syntheticReviewerAuthorityWindowDays:14};
  await writeFile('docs/packproof/evidence/reviewer-release.json',JSON.stringify(evidence,null,2)+'\n');
  const origin=process.env.PACKPROOF_REVIEW_ORIGIN??'https://packproof-p0.vercel.app';
  if(!['https://packproof-p0-preview.vercel.app','https://packproof-p0.vercel.app'].includes(origin))throw new Error('existing_app_origin_required');
  await writeReviewAccess(pairs,{origin,limitUsd:budget.limit_cents/100,reviewUntil});
  console.log(JSON.stringify({status:evidence.status,pairs:evidence.pairs,syntheticUnits:evidence.syntheticUnits,newProducts:evidence.newProducts,newRestrictedAuthorities:evidence.newRestrictedAuthorities,limitUsd:evidence.limitUsd,reviewUntil,privateAccessFile:'.local/review/access.html',origin}));
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}catch(e){console.error(JSON.stringify({status:'blocked',code:e&&typeof e==='object'&&'code'in e?e.code:e instanceof Error&&/^[a-z_0-9]+$/.test(e.message)?e.message:'review_prepare_failed'}));process.exitCode=1;}finally{await pool.end();}
