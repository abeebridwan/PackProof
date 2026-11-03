import type {Pool} from 'pg';
import type {ImageInspector} from '../providers/recorded-image.js';
// Only the operator's non-deployed HTTPS launcher installs this in its process.
// An environment flag alone cannot enable inference in the public runtime.
export const LOCAL_VALIDATION=Symbol.for('packproof.p3.local-validation');
export type LocalValidation={origin:string;inspector:(pool:Pool)=>ImageInspector};
export function localValidation():LocalValidation|null{
 if(process.env.NODE_ENV!=='development'||process.env.VERCEL||process.env.P3_LOCAL_LIVE!=='1')return null;
 const value=(globalThis as typeof globalThis&{[LOCAL_VALIDATION]?:LocalValidation})[LOCAL_VALIDATION];
 if(!value||value.origin!==process.env.APP_ORIGIN)return null;
 const url=new URL(value.origin);
 if(url.protocol!=='https:'||!/^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname))return null;
 return value;
}
