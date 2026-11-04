import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {PackProofClient,PackProofError} from '../../packages/packproof-sdk/src/index.js';
import {apiHttp} from '../../src/server/platform/api.js';
import {mcpHttp} from '../../src/server/platform/mcp.js';
import {platformPool} from '../../src/server/platform/database.js';
const enabled=process.env.PACKPROOF_PLATFORM_INTEGRATION==='1';
describe.skipIf(!enabled)('v1 actual signed Supabase evidence through REST, SDK and official MCP v2 client',()=>{
 let server:Server,base:string;
 beforeAll(async()=>{
  process.env.SUPABASE_DB_URL=(await readFile('.local/deploy/preview-db-url','utf8')).trim();
  server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const request=new Request(base+req.url,{method:req.method??'GET',headers:req.headers as Record<string,string>,...(req.method!=='GET'?{body:Buffer.concat(chunks)}:{})});const response=req.url==='/api/mcp'?await mcpHttp(request):await apiHttp(request,decodeURIComponent(req.url!.split('/').at(-1)!));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('test_server_unavailable');base=`http://127.0.0.1:${address.port}`;
 },30000);
 afterAll(async()=>{await new Promise<void>((resolve,reject)=>server?.close(e=>e?reject(e):resolve()));await platformPool().end();});
 it('initializes, lists tools and calls the actual common product service; SDK and MCP preserve gates and signed references',async()=>{
  const client=new Client({name:'packproof-acceptance',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base)));
  try{const list=await client.listTools();expect(list.tools.map(t=>t.name)).toContain('products_lookup');expect(list.tools.some(t=>/confirm|commit/.test(t.name))).toBe(false);
   const args={namespace:'packproof-demo',productMark:'FP-1002',packagingMark:'PK-2002'},sdk=new PackProofClient({baseUrl:base});
   const [fromSdk,fromMcp]=await Promise.all([sdk.call('products.lookup',args),client.callTool({name:'products_lookup',arguments:args})]);
   expect(fromMcp.isError).not.toBe(true);const actual=fromMcp.structuredContent as typeof fromSdk;expect(fromSdk.status).toBe('supported');expect(actual.status).toBe(fromSdk.status);expect(actual.data).toEqual(fromSdk.data);expect(actual.evidence_refs).toEqual(fromSdk.evidence_refs);expect(fromSdk.data?.physicalBinding).toBe('unresolved');
   const invalid=await client.callTool({name:'products_lookup',arguments:{...args,productMark:123}});expect(invalid.isError).toBe(true);
   const privateCall=await client.callTool({name:'transfers_get',arguments:{id:crypto.randomUUID()}});expect(privateCall.isError).toBe(true);
   const missing=await client.callTool({name:'products_lookup',arguments:{...args,productMark:'MISSING'}});expect((missing.structuredContent as {status:string}).status).toBe('needs_evidence');
   const historical=await client.callTool({name:'verification_summary',arguments:{...args,sellerId:null,listingText:'Historical demo record; no current authority assumed',context:'listing',captureId:null}});expect((historical.structuredContent as {status:string}).status).toBe('stale');
  }finally{await client.close();}
 },30000);
 it('rejects invalid credentials and scopes, preserves negative gates, and never emits a history gap as a notice event',async()=>{
  const sdk=new PackProofClient({baseUrl:base}),args={namespace:'packproof-demo',productMark:'FP-1002',packagingMark:'WRONG'};
  expect((await sdk.call('products.lookup',args)).status).toBe('blocked');expect((await sdk.call('products.lookup',{...args,productMark:'MISSING'})).status).toBe('needs_evidence');
  const denied=new PackProofClient({baseUrl:base,apiKey:'ppk_'+'0'.repeat(64)});await expect(denied.call('transfers.get',{id:crypto.randomUUID()})).rejects.toMatchObject({code:'invalid_api_key',status:401});
  const events=await sdk.call('notices.events',{itemId:'30000000-0000-4000-8000-000000000103'});expect(events.events.every(e=>e.type==='packaging_revision')).toBe(true);
  const itemId='10000000-0000-4000-8000-000000000002',first=await sdk.call('notices.events',{itemId}),again=await sdk.call('notices.events',{itemId});expect(first.events.length).toBeGreaterThan(0);expect(first.events.map(e=>[e.eventId,e.idempotencyKey])).toEqual(again.events.map(e=>[e.eventId,e.idempotencyKey]));expect(first.events.every(e=>e.demo&&e.provenance==='verified_signed_record'&&e.broadcastEligible&&e.scope==='batch')).toBe(true);
  const abort=new AbortController();abort.abort();await expect(sdk.call('products.lookup',args,{signal:abort.signal})).rejects.toThrow();
  expect(PackProofError.prototype).toBeInstanceOf(Error);
 },30000);
});
