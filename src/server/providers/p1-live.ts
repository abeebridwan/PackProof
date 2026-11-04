import {z} from 'zod';
import {META_BASE_URL,MUSE_MODEL} from '../../../scripts/spikes/meta-gateway.js';
import {ModelAnswer,ToolName} from '../../contracts/investigation.js';
import {H2_INPUTS} from '../evidence/services.js';
import {TOOL_OUTPUTS, type langChainTools} from '../investigator/tools.js';
import type {RunState} from '../investigator/types.js';
import {LangChainMuse,ProviderFailure,type MusePlanner} from './muse.js';
import {P1Budget,P1BudgetError,P1_LIMITS,Usage,estimateUsd,MUSE_PRICING} from './p1-budget.js';
import {sha256,utf8} from '../../domain/verification/p0-crypto.js';

const Identifier=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const Call=z.object({id:Identifier,type:z.literal('function'),function:z.object({name:ToolName,arguments:z.string().max(16000)})});
type WireMessage={role:string;content?:string|null;tool_call_id?:string;tool_calls?:z.infer<typeof Call>[]};
type WireBody={model:string;reasoning_effort?:string;messages:WireMessage[];tools:{type:string;function:{name:string;description?:string;parameters:unknown;strict?:boolean}}[];response_format?:{type:string;json_schema?:Record<string,unknown>};max_completion_tokens:number;stream?:boolean;parallel_tool_calls?:boolean};
export function countPayload(body:WireBody){
 const input:unknown[]=[];const pending=new Map<string,ToolName>();
 for(const message of body.messages){
  if(message.role==='tool'){
   const id=Identifier.parse(message.tool_call_id),name=pending.get(id);
   if(!name||typeof message.content!=='string')throw new P1BudgetError('p1_tool_correlation');
   TOOL_OUTPUTS[name].parse(JSON.parse(message.content));pending.delete(id);
   input.push({type:'function_call_output',call_id:id,output:message.content});
  }else{
   if(!['system','developer','user','assistant'].includes(message.role))throw new P1BudgetError('p1_request_invalid');
   if(message.content)input.push({role:message.role,content:message.content});
   for(const raw of message.tool_calls??[]){const call=Call.parse(raw);if(pending.has(call.id))throw new P1BudgetError('p1_tool_correlation');H2_INPUTS[call.function.name].parse(JSON.parse(call.function.arguments));pending.set(call.id,call.function.name);input.push({type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments});}
  }
 }
 if(pending.size)throw new P1BudgetError('p1_tool_correlation');
 return {model:MUSE_MODEL,input,...(body.reasoning_effort?{reasoning:{effort:body.reasoning_effort}}:{}),tools:body.tools.map(t=>({type:'function',...t.function})),parallel_tool_calls:false,...(body.response_format?.json_schema?{text:{format:{type:'json_schema',...body.response_format.json_schema}}}:{})};
}
async function limitedJson(response:Response){
 const reader=response.body?.getReader();if(!reader)throw new Error('empty_provider_body');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();throw new Error('provider_body_limit');}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;
}
export function providerEvidence(value:unknown){
 const response=z.object({id:Identifier,model:z.literal(MUSE_MODEL),choices:z.array(z.object({finish_reason:z.enum(['tool_calls','stop','length','content_filter']),message:z.object({tool_calls:z.array(Call).max(1).optional(),content:z.string().nullable().optional()})})).length(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative(),prompt_tokens_details:z.object({cached_tokens:z.number().int().nonnegative()}).optional()}).optional()}).parse(value);
 const choice=response.choices[0]!;
 const calls=(choice.message.tool_calls??[]).map(c=>({id:c.id,name:c.function.name,args:H2_INPUTS[c.function.name].parse(JSON.parse(c.function.arguments))}));
 const answer=choice.finish_reason==='stop'?ModelAnswer.parse(JSON.parse(choice.message.content??'')):null;
 if(choice.finish_reason==='tool_calls'&&calls.length!==1||choice.finish_reason==='stop'&&calls.length!==0)throw new Error('invalid_tool_result');
 if(choice.finish_reason!=='tool_calls'&&choice.finish_reason!=='stop')throw new Error('incomplete_provider_output');
 const usage=response.usage?Usage.parse({inputTokens:response.usage.prompt_tokens,outputTokens:response.usage.completion_tokens,cachedTokens:response.usage.prompt_tokens_details?.cached_tokens??0}):null;
 return {responseId:response.id,model:response.model,finishReason:choice.finish_reason,calls,answer,usage};
}
export type LiveEvidence={operationKey:string;requestId:string|null;requestSha256:string;countedInputTokens:number;latencyMs:number;preflightMs:number;inferenceMs:number;toolResults:{callId:string;name:ToolName;result:unknown}[];response:ReturnType<typeof providerEvidence>|null;outcome:string;adapter?:'langchain'|'native_validated_fallback';adapterFailure?:'SyntaxError'|'TypeError'|'Error'|'other'|null;wireShape?:{jsonContentType:boolean;assistantRole:boolean;contentKind:'absent'|'null'|'empty'|'json'|'text'}};
export type LiveBudget={assertRun():void|Promise<void>;assertCapacity(retry:boolean):void|Promise<void>;reserve(key:string,tokens:number,retry:boolean):string|Promise<string>;settle(id:string,receipt:Parameters<P1Budget['settle']>[1]):void|Promise<void>};
export function liveMuse(budget:LiveBudget,options:{apiKey:string;transport?:typeof fetch;evidence:LiveEvidence[];preflights?:{count:number}}):MusePlanner{
 if(budget instanceof P1Budget)budget.assertRun();
 if(!options.apiKey)throw new P1BudgetError('p1_credentials_missing');
 const network=options.transport??fetch;
 let current:{key:string;retry:boolean;sent:boolean;failure?:Error}|null=null;
 const transport:typeof fetch=async(url,init)=>{
  await budget.assertRun();
  if(String(url)!==`${META_BASE_URL}/chat/completions`||!current||current.sent)throw new P1BudgetError('p1_endpoint_refused');
  await budget.assertCapacity(current.retry);
  const body=JSON.parse(String(init?.body)) as WireBody;
  if(body.model!==MUSE_MODEL||body.reasoning_effort!=='minimal'||body.stream||body.max_completion_tokens!==2048||body.parallel_tool_calls!==false||body.tools.length!==6||new Set(body.tools.map(t=>t.function.name)).size!==6||body.tools.some(t=>t.type!=='function'||!ToolName.safeParse(t.function.name).success))throw new P1BudgetError('p1_request_invalid');
  const payload=countPayload(body);
  if(Buffer.byteLength(JSON.stringify(body))>128000)throw new P1BudgetError('p1_input_limit');
  const signal=AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(P1_LIMITS.timeoutMs)]);
  const headers=new Headers(init?.headers);headers.set('content-type','application/json');
  const start=Date.now();
  const count=await network(`${META_BASE_URL}/responses/input_tokens`,{method:'POST',headers,body:JSON.stringify(payload),signal,redirect:'error'});
  if(options.preflights)options.preflights.count++;
  if(!count.ok)throw new P1BudgetError('p1_token_count_unavailable');
  const tokens=z.object({input_tokens:z.number().int().nonnegative().max(16000)}).safeParse(await limitedJson(count));
  if(!tokens.success)throw new P1BudgetError('p1_input_limit');
  const id=await budget.reserve(current.key,tokens.data.input_tokens,current.retry);current.sent=true;
  const knownCalls=new Map<string,ToolName>();const toolResults:LiveEvidence['toolResults']=[];
  for(const m of body.messages){for(const c of m.tool_calls??[])knownCalls.set(c.id,c.function.name);if(m.role==='tool')toolResults.push({callId:m.tool_call_id!,name:knownCalls.get(m.tool_call_id!)!,result:JSON.parse(m.content!)});}
  const event:LiveEvidence={operationKey:current.key,requestId:null,requestSha256:await sha256(utf8(JSON.stringify(body))),countedInputTokens:tokens.data.input_tokens,latencyMs:0,preflightMs:Date.now()-start,inferenceMs:0,toolResults,response:null,outcome:'ambiguous'};
  options.evidence.push(event);
  let receipt:{state:'responded'|'failed'|'ambiguous';responseId:string|null;requestId:string|null;model:typeof MUSE_MODEL|null;usage:Usage|null}={state:'ambiguous',responseId:null,requestId:null,model:null,usage:null};
  const inferenceStart=Date.now();
  try{
   const response=await network(url,{...init,signal,redirect:'error'});
   const rid=Identifier.safeParse(response.headers.get('x-request-id'));event.requestId=rid.success?rid.data:null;receipt.requestId=event.requestId;
   if(!response.ok){receipt.state='failed';event.outcome='provider_unavailable';throw new ProviderFailure(response.status===429||response.status>=500);}
   const raw=await limitedJson(response);
   // Preserve accounting even if the structured answer is malformed. Never
   // retain unrestricted content, provider errors or reasoning text.
   const ridBody=Identifier.safeParse(raw.id);if(ridBody.success)receipt.responseId=ridBody.data;
   if(raw.model===MUSE_MODEL)receipt.model=MUSE_MODEL;
   const accounting=z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative(),prompt_tokens_details:z.object({cached_tokens:z.number().int().nonnegative()}).optional()}).safeParse(raw.usage);
   if(accounting.success)receipt.usage=Usage.parse({inputTokens:accounting.data.prompt_tokens,outputTokens:accounting.data.completion_tokens,cachedTokens:accounting.data.prompt_tokens_details?.cached_tokens??0});
   receipt.state='responded';
   event.response=providerEvidence(raw);event.outcome='validated';
   const nativeMessage=(raw.choices as {message:{role?:unknown;content?:unknown}}[])[0]!.message;
   let contentKind:NonNullable<LiveEvidence['wireShape']>['contentKind']=nativeMessage.content===undefined?'absent':nativeMessage.content===null?'null':nativeMessage.content===''?'empty':'text';
   if(contentKind==='text'&&typeof nativeMessage.content==='string'){try{JSON.parse(nativeMessage.content);contentKind='json';}catch{/* Only classify shape, never retain unrestricted content. */}}
   event.wireShape={jsonContentType:response.headers.get('content-type')?.includes('application/json')??false,assistantRole:nativeMessage.role==='assistant',contentKind};
   if(receipt.usage&&(receipt.usage.inputTokens>16000||receipt.usage.outputTokens>2048)){event.outcome='usage_limit';throw new P1BudgetError('p1_usage_limit');}
   // SDK sees the real envelope. Only the allowlisted evidence above is saved.
   return new Response(JSON.stringify(raw),{status:response.status,headers:response.headers});
  }catch(error){if(event.outcome==='ambiguous')event.outcome=receipt.state==='responded'?'invalid_output':'ambiguous';current.failure=error instanceof P1BudgetError||error instanceof ProviderFailure?error:receipt.state==='responded'?new P1BudgetError('p1_invalid_output'):new P1BudgetError('p1_operation_in_doubt');throw error;}
  finally{event.latencyMs=Date.now()-start;event.inferenceMs=Date.now()-inferenceStart;await budget.settle(id,receipt);}
 };
 const guarded:typeof fetch=async(...args)=>{try{return await transport(...args);}catch(error){if(current&&!current.failure)current.failure=error instanceof P1BudgetError?error:new P1BudgetError('p1_preflight_unavailable');throw error;}};
 const adapter=new LangChainMuse(guarded,{apiKey:options.apiKey,timeoutMs:45000,live:true});
 return {async invoke(state:RunState,tools:ReturnType<typeof langChainTools>,attempt?:{retry:boolean;attempt:number}){
  await budget.assertRun();if(current)throw new P1BudgetError('p1_run_locked');
  current={key:`${state.id}:${state.revision}:${state.turn}:${attempt?.attempt??0}`,retry:attempt?.retry??false,sent:false};
  try{
   let result;
   try{result=await adapter.invoke(state,tools);const event=options.evidence.at(-1);if(event?.operationKey===current.key)event.adapter='langchain';}
   catch(error){
    if(current.failure)throw current.failure;
    const event=options.evidence.at(-1),native=event?.operationKey===current.key&&event.outcome==='validated'?event.response:null;
    if(!native)throw error;
    // LangChain still constructs the request and binds/executes its tools.
    // Bridge only this operation's strictly validated real Meta envelope when
    // SDK-specific response parsing fails. Never reuse a prior receipt, retry
    // a paid call, or manufacture a tool choice/answer.
    event!.adapter='native_validated_fallback';event!.adapterFailure=error instanceof ProviderFailure?error.adapterErrorName:'other';
    const call=native.calls[0];
    result={call:call?{id:call.id,name:call.name,args:call.args as Record<string,unknown>}:null,answer:native.answer,responseId:native.responseId,inputTokens:native.usage?.inputTokens??null,outputTokens:native.usage?.outputTokens??null};
   }
   const usage=options.evidence.at(-1)?.response?.usage;return {...result,...(usage?{estimatedCostUsd:estimateUsd(usage),pricingVerifiedAt:MUSE_PRICING.verifiedAt}:{})};
  }finally{current=null;}
 }};
}
