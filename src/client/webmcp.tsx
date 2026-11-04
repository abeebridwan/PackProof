'use client';
import {useEffect} from 'react';
import {z} from 'zod';
import {API_OPERATIONS} from '../contracts/api-v1';
type BrowserContext={registerTool(tool:{name:string;description:string;inputSchema:Record<string,unknown>;execute:(args:unknown,options?:{signal?:AbortSignal})=>Promise<unknown>;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean}},options:{signal:AbortSignal}):Promise<void>};
export function WebMCP(){useEffect(()=>{
 const context=(document as Document&{modelContext?:BrowserContext}).modelContext;if(!context)return;
 const controller=new AbortController();
 void (async()=>{
 // React development cleanup can run before asynchronous registration settles.
 await Promise.resolve();if(controller.signal.aborted)return;
 for(const [operation,descriptor] of Object.entries(API_OPERATIONS)){
  if(controller.signal.aborted)return;
  const mutating=['products.draft','evidence.attach','investigations.start','investigations.resume','captures.submit','transfers.propose','packs.create'].includes(operation);
  await context.registerTool({name:'packproof_'+operation.replaceAll('.','_'),description:`PackProof ${operation}. Uses your current session and mandatory evidence checks. Never signs participant consent or changes ownership.`,inputSchema:z.toJSONSchema(descriptor.input) as Record<string,unknown>,annotations:{readOnlyHint:!mutating,untrustedContentHint:true},execute:async(raw,options)=>{
   const input=descriptor.input.parse(raw);
   if(mutating&&!window.confirm(`Allow PackProof ${operation}? ${operation==='captures.submit'?'This saves the photo privately. Meta processing requires the supplied consent and an authorized live session.':'This may save evidence or use your shared live allowance. It does not approve an ownership transfer.'}`))throw new Error('User declined');
   const response=await fetch(`/api/v1/${operation}`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(input),signal:options?.signal??controller.signal});
   const result=await response.json();if(!response.ok)throw new Error(result.error??'request_failed');return JSON.stringify(descriptor.output.parse(result));
  }},{signal:controller.signal});
 }
 })().catch(()=>{/* Browser support may be disabled or restricted. Normal UI remains usable. */});
 return()=>controller.abort();
},[]);return null;}
