import {z} from 'zod';
import {randomBytes,randomUUID} from 'node:crypto';
import {ProfileInput,ProductDraftInput} from '../../contracts/platform.js';
import {ApiScope} from '../../contracts/api-v1.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';
import {platformLimit,platformTransaction,type PlatformIdentity} from './database.js';
import {TransferError} from '../transfers/database.js';
export async function profile(who:PlatformIdentity){return platformTransaction(who,async c=>{
 const row=(await c.query('SELECT account_type,display_name FROM packproof.account_profiles WHERE user_id=$1',[who.userId])).rows[0];
 return {actorId:who.actorId,accountType:row?.account_type??'regular',displayName:row?.display_name??'PackProof participant',profileConfigured:!!row,issuerAuthority:'not_granted_by_account_type' as const};
});}
export async function saveProfile(who:PlatformIdentity,input:unknown){const v=ProfileInput.parse(input);await platformLimit(`profile:${who.userId}`,30);await platformTransaction(who,c=>c.query('INSERT INTO packproof.account_profiles(user_id,actor_id,account_type,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET account_type=EXCLUDED.account_type,display_name=EXCLUDED.display_name',[who.userId,who.actorId,v.accountType,v.displayName]));return profile(who);}
export async function createDraft(who:PlatformIdentity,input:unknown){
 const v=ProductDraftInput.parse(input);if((await profile(who)).accountType!=='manufacturer')throw new TransferError('producer_profile_required',403);
 await platformLimit(`draft:${who.userId}`,30);const id=randomUUID();await platformTransaction(who,c=>c.query('INSERT INTO packproof.product_drafts(id,user_id,actor_id,data) VALUES($1,$2,$3,$4)',[id,who.userId,who.actorId,v]));
 return {id,data:v,status:'draft',trustedIssuance:false,issuanceBlocker:'A separately verified issuer must authorize and sign this record.'};
}
export async function listDrafts(who:PlatformIdentity){return platformTransaction(who,async c=>(await c.query('SELECT id,data,created_at FROM packproof.product_drafts ORDER BY created_at DESC LIMIT 100')).rows);}
export async function ownedItems(who:PlatformIdentity){return platformTransaction(who,async c=>(await c.query('SELECT i.id,i.unit_mark AS "productMark",r.packaging_mark AS "packagingMark",i.owner_version AS "ownerVersion",i.registered_owner_id AS "ownerActorId" FROM packproof.items i JOIN packproof.marking_relations r ON r.item_id=i.id WHERE i.registered_owner_id=$1 ORDER BY i.unit_mark LIMIT 100',[who.actorId])).rows);}
export const KeyInput=z.strictObject({label:z.string().trim().min(1).max(80),scopes:z.array(ApiScope).min(1).max(6),expiresInDays:z.number().int().min(1).max(30)});
export async function createDeveloperKey(who:PlatformIdentity,input:unknown){const v=KeyInput.parse(input);await platformLimit(`key-create:${who.userId}`,10);const key='ppk_'+randomBytes(32).toString('hex'),id=randomUUID(),expiresAt=new Date(Date.now()+v.expiresInDays*86400000).toISOString(),hash=await sha256(utf8(key));await platformTransaction(who,c=>c.query('INSERT INTO packproof.developer_keys(id,user_id,label,token_hash,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,who.userId,v.label,hash,[...new Set(v.scopes)],expiresAt]));return {id,key,expiresAt,scopes:v.scopes};}
export async function developerKeys(who:PlatformIdentity){return platformTransaction(who,async c=>(await c.query('SELECT id,label,scopes,expires_at,revoked_at FROM packproof.developer_keys ORDER BY created_at DESC LIMIT 100')).rows);}
export async function revokeDeveloperKey(who:PlatformIdentity,id:unknown){await platformTransaction(who,c=>c.query('UPDATE packproof.developer_keys SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1',[z.uuid().parse(id)]));return {revoked:true};}
export async function rotateDeveloperKey(who:PlatformIdentity,id:unknown){const keyId=z.uuid().parse(id);await platformLimit(`key-create:${who.userId}`,10);const key='ppk_'+randomBytes(32).toString('hex'),nextId=randomUUID(),hash=await sha256(utf8(key));return platformTransaction(who,async c=>{const row=(await c.query('SELECT * FROM packproof.developer_keys WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[keyId])).rows[0];if(!row)throw new TransferError('not_found',404);await c.query('INSERT INTO packproof.developer_keys(id,user_id,label,token_hash,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[nextId,who.userId,row.label,hash,row.scopes,row.expires_at]);await c.query('UPDATE packproof.developer_keys SET revoked_at=now() WHERE id=$1',[keyId]);return {id:nextId,key,expiresAt:new Date(row.expires_at).toISOString(),scopes:row.scopes};});}
