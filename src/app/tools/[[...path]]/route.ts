import {createProbeResponder} from '../../../../scripts/spikes/serve';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// One shared feasibility surface; no issuer keys, model calls or Supabase access.
// Catalog/key state is per warm instance, never durable transfer authority.
let responder:ReturnType<typeof createProbeResponder>|undefined;
export async function GET(_request:Request,context:{params:Promise<{path?:string[]}>}){
 const {path=[]}=await context.params;
 const key='/'+path.join('/');
 if(!['/','/phone.js','/crypto-challenge','/frames','/frame-catalog'].includes(key))return new Response('Not found',{status:404});
 responder??=createProbeResponder().catch(error=>{responder=undefined;throw error;});
 return (await responder)(key,'/tools/');
}
