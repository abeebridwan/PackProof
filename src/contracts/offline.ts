import {z} from 'zod';
import {Id,Utc,Hash,PublicJwk,PackManifest,SignedPackManifest} from './p0.js';
import {StoredRecord} from './evidence.js';
export const MAX_PACK_BYTES=2*1024*1024;
export const PROFILE='packproof-public-demo-1';
export const DATASET='packproof-demo-1';
export const DAY=86400000;
// Directory refresh window is distinct from the unchanged 24-hour pack window.
export const DIRECTORY_MAX_AGE=14*DAY;
export const SETUP_REQUIRED='Trusted setup required. Connect to the official PackProof application.';
export const EvidencePack=z.strictObject({schemaVersion:z.literal(1),manifestJws:SignedPackManifest,directoryJws:SignedPackManifest,records:z.array(z.strictObject({id:Id,jws:SignedPackManifest})).min(1).max(128),media:z.array(z.strictObject({sha256:Hash,mime:z.literal('image/jpeg'),base64:z.string().max(1400000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)})).max(8)});
export type EvidencePack=z.infer<typeof EvidencePack>;
export const OfflineDirectory=z.strictObject({schemaVersion:z.literal(1),profileVersion:z.literal(PROFILE),namespace:z.literal('packproof-demo'),version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),issuedAt:Utc,expiresAt:Utc,records:z.array(StoredRecord).min(2).max(64),packSigners:z.array(z.strictObject({keyId:Id,issuerId:Id,publicKey:PublicJwk,role:z.literal('pack'),purposes:z.tuple([z.literal('pack-manifest'),z.literal('public-custody-snapshot')]),validFrom:Utc,validUntil:Utc,revokedAt:Utc.nullable()})).min(1).max(16)});
export type OfflineDirectory=z.infer<typeof OfflineDirectory>;
export const Manifest=PackManifest.safeExtend({namespace:z.literal('packproof-demo'),profileVersion:z.literal(PROFILE),sourceDatasetVersion:z.literal(DATASET),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),itemIds:z.array(Id).min(1).max(3),records:z.array(PackManifest.shape.records.element).min(1).max(128),media:z.array(PackManifest.shape.media.element).max(8)});
export type Manifest=z.infer<typeof Manifest>;
export const Bootstrap=z.strictObject({directoryJws:SignedPackManifest,serverTime:Utc,sequences:z.array(z.strictObject({scopeKey:z.string().max(256),sequence:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)})).max(32)});
export type Bootstrap=z.infer<typeof Bootstrap>;
export const scopeKey=(ids:readonly string[])=>'packproof-demo:'+DATASET+':'+[...ids].sort().join(',');
