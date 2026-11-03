import {CompactSign,compactVerify,decodeProtectedHeader,importJWK} from 'jose';
import {PublicJwk} from '../../contracts/p0.js';
import {SignedAction,TransferAgreement,ReceiptData,TRANSFER_POLICY} from '../../contracts/transfer.js';
import {sha256,utf8} from '../verification/p0-crypto.js';
export const DEVICE_JWS_TYPE='packproof-device+jws';
export async function signAction(action:SignedAction,key:CryptoKey){
 const a=SignedAction.parse(action);return new CompactSign(utf8(JSON.stringify(a))).setProtectedHeader({alg:'ES256',typ:DEVICE_JWS_TYPE,kid:a.keyId}).sign(key);
}
export async function openAction(jws:string,publicKey:unknown,keyId:string){
 const h=decodeProtectedHeader(jws);
 if(h.alg!=='ES256'||h.typ!==DEVICE_JWS_TYPE||h.kid!==keyId||Object.keys(h).some(k=>!['alg','typ','kid'].includes(k)))throw new Error('invalid_device_signature');
 const {payload}=await compactVerify(jws,await importJWK(PublicJwk.parse(publicKey),'ES256'),{algorithms:['ES256']});
 const value=SignedAction.parse(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(payload)));
 if(value.keyId!==keyId)throw new Error('invalid_device_binding');return value;
}
export async function verifyAction(jws:string,publicKey:unknown,keyId:string,expected:SignedAction){
 const value=await openAction(jws,publicKey,keyId);
 // Canonical schema order for action envelopes; agreement hashes always use original payload bytes.
 if(JSON.stringify(value)!==JSON.stringify(SignedAction.parse(expected)))throw new Error('signed_action_mismatch');return value;
}
export async function verifyReceiptApprovals(input:ReceiptData){
 const d=ReceiptData.parse(input),a=TransferAgreement.parse(JSON.parse(d.agreementPayload));
 if(await sha256(utf8(d.agreementPayload))!==d.agreementHash||a.transferId!==d.transferId||a.itemId!==d.itemId||d.fromVersion!==a.expectedOwnerVersion||d.toVersion!==d.fromVersion+1||a.policyVersion!==TRANSFER_POLICY||Date.parse(d.committedAt)>Date.parse(a.expiresAt))throw new Error('invalid_receipt_agreement');
 await verifyAction(d.buyerOffer,d.buyerPublicKey,a.buyerDeviceKeyId,{kind:'transfer-offer',transferId:a.transferId,agreementHash:d.agreementHash,actorId:a.buyerActorId,keyId:a.buyerDeviceKeyId,expiresAt:a.expiresAt});
 for(const [signature,publicKey,keyId,actorId,direction] of [[d.sellerConsent,d.sellerPublicKey,a.sellerDeviceKeyId,a.sellerActorId,'buyer-to-seller'],[d.buyerConsent,d.buyerPublicKey,a.buyerDeviceKeyId,a.buyerActorId,'seller-to-buyer']] as const){
  const c=await openAction(signature,publicKey,keyId);
  const scan=d.scans.find(s=>s.direction===direction);
  if(c.kind!=='transfer-consent'||c.transferId!==a.transferId||c.agreementHash!==d.agreementHash||c.actorId!==actorId||c.direction!==direction||!scan||scan.actorId!==actorId||scan.reservationId!==c.reservationId||await sha256(utf8(JSON.stringify(scan)))!==c.reservationHash||new Set(scan.frameHashes).size!==3||scan.sequences[1]!==scan.sequences[0]!+1||scan.sequences[2]!==scan.sequences[1]!+1||Date.parse(c.issuedAt)<Date.parse(scan.scannedAt)||Date.parse(c.expiresAt)>Date.parse(a.expiresAt)||Date.parse(c.expiresAt)-Date.parse(c.issuedAt)>30000||Date.parse(d.committedAt)>Date.parse(a.expiresAt)||c.sellerApprovalHash!==(direction==='buyer-to-seller'?null:await sha256(utf8(d.sellerConsent))))throw new Error('invalid_receipt_consent');
 }
 return a;
}
