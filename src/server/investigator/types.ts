import type { InvestigationInput, Finding, EvidenceRequest, Capture, ModelAnswer, Claim, ToolName } from '../../contracts/investigation.js';
import type { GateResult } from '../../contracts/p0.js';
export type ToolResult=GateResult<unknown>;
export type Message={role:'system'|'human'|'ai'|'tool';content:string;callId?:string;name?:string;calls?:ToolCall[]};
export type ToolCall={id:string;name:ToolName;args:Record<string,unknown>};
export type RunState={id:string;revision:number;input:InvestigationInput;messages:Message[];turn:number;actions:number;recaptures:number;retries:number;results:Partial<Record<ToolName,ToolResult>>;pending:ToolCall|null;request:EvidenceRequest|null;answer:ModelAnswer|null;finding:Finding|null;error:string|null;claims:Claim[];startedAt:number};
export type Owner={sessionHash:string;userId:string|null};
export type Row={id:string;revision:number;status:string;input:InvestigationInput;actions:number;recaptures:number;retries:number;request:EvidenceRequest|null;finding:Finding|null;error:string|null;createdAt:string};
export interface InvestigationStore {
 create(owner:Owner,input:InvestigationInput):Promise<Row>;
 get(owner:Owner,id:string):Promise<Row>;
 save(owner:Owner,id:string,patch:Partial<Pick<Row,'status'|'request'|'finding'|'error'>>):Promise<void>;
 operation<T>(owner:Owner,id:string,key:string,args:unknown,kind:'model'|'tool'|'retry'|'resume',effect:()=>Promise<T>,options?:{recapture?:boolean;reservationCents?:number;sessionCapCents?:number}):Promise<T>;
 revise(owner:Owner,id:string,expected:number,input:InvestigationInput):Promise<Row>;
 capture(owner:Owner,id:string,captureId:string):Promise<Capture>;
 addCapture(owner:Owner,capture:Capture):Promise<void>;
 audit(owner:Owner,id:string,name:ToolName,result:ToolResult,key:string):Promise<void>;
 events(owner:Owner,id:string):Promise<{tool:ToolName;result:ToolResult;source?:'model_tool'|'mandatory_finalizer'}[]>;
}
