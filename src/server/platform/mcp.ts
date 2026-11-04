import {McpServer,WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/server';
import {API_OPERATIONS,type Operation} from '../../contracts/api-v1.js';
import {apiContext,executeOperation,apiFailure} from './api.js';
import {sameOrigin} from '../auth/session.js';
import {bodyBytes} from '../auth/body.js';
import {TransferError} from '../transfers/database.js';
export async function mcpHttp(request:Request){try{
 if(request.headers.has('origin'))sameOrigin(request);
 if(request.method!=='POST')throw new TransferError('method_not_allowed',405);
 // Bound before handing the body to the official protocol implementation.
 const parsedBody=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(request,3*1024*1024)));
 const server=new McpServer({name:'packproof',version:'1.0.0'});
 let setCookie:string|null=null;
 for(const [name,descriptor] of Object.entries(API_OPERATIONS)){
  const operation=name as Operation,readOnly=!['products.draft','evidence.attach','investigations.start','investigations.resume','captures.submit','transfers.propose','packs.create'].includes(name);
  server.registerTool(name.replaceAll('.','_'),{description:`PackProof v1 ${name}. Sample evidence only; uncertainty and authorization gates remain mandatory. No ownership commit.`,inputSchema:descriptor.input,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:!readOnly}},async (input:unknown)=>{
   try{const auth=await apiContext(request,operation);setCookie=auth.setCookie;const value=await executeOperation(operation,input as never,auth,request);return {content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:value as Record<string,unknown>};}
   catch(e){const r=apiFailure(e);return {isError:true,content:[{type:'text' as const,text:JSON.stringify(await r.json())}]};}
  });
 }
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 try{const response=await transport.handleRequest(request,{parsedBody}),bytes=await response.arrayBuffer(),headers=new Headers(response.headers);if(setCookie)headers.set('set-cookie',setCookie);return new Response(response.status===204?null:bytes,{status:response.status,headers});}finally{await transport.close();await server.close();}
}catch(e){return apiFailure(e);}}
