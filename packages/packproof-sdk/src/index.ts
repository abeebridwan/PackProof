import {API_OPERATIONS,type Operation,type Input,type Output} from '../../../src/contracts/api-v1.js';
export type {Operation,Input,Output};
export class PackProofError extends Error{constructor(public code:string,public status:number,public retryAfter:string|null=null){super(code);this.name='PackProofError';}}
export class PackProofClient{
 private readonly base:URL;
 constructor(private readonly options:{baseUrl:string;apiKey?:string;accessToken?:string;timeoutMs?:number;fetch?:typeof fetch}){this.base=new URL(options.baseUrl);if(this.base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(this.base.hostname))throw new Error('HTTPS required');if(this.base.username||this.base.password)throw new Error('URL credentials forbidden');if(options.apiKey&&options.accessToken)throw new Error('Choose one credential');}
 async call<K extends Operation>(operation:K,input:Input<K>,options:{signal?:AbortSignal;idempotencyKey?:string}={}):Promise<Output<K>>{
  const schema=API_OPERATIONS[operation],args=schema.input.parse(input),credential=this.options.apiKey??this.options.accessToken;
  const timeout=AbortSignal.timeout(this.options.timeoutMs??90000),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
  const response=await (this.options.fetch??fetch)(new URL(`/api/v1/${operation}`,this.base),{method:'POST',headers:{'content-type':'application/json',...(credential?{authorization:`Bearer ${credential}`}:{ }),...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})},credentials:'same-origin',body:JSON.stringify(args),signal,redirect:'error'});
  if(!response.ok){const error=await response.json().catch(()=>({error:'invalid_response'})) as {error?:string};throw new PackProofError(error.error??'request_failed',response.status,response.headers.get('retry-after'));}
  return schema.output.parse(await response.json()) as Output<K>;
 }
}
