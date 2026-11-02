import type {BaseCheckpointSaver} from '@langchain/langgraph';
import type {RunState} from '../../src/server/investigator/types.js';

// Lose both graph checkpoint paths after the first durable model/tool cycle.
// The real saver retains the preceding checkpoint; the operation store keeps
// its separately committed results. A rebuilt graph must reuse those results.
export function failFirstCycle(saver:BaseCheckpointSaver):BaseCheckpointSaver{
 return new Proxy(saver,{get(target,key){
  if(key==='put')return async(...args:Parameters<BaseCheckpointSaver['put']>)=>{
   if((args[1].channel_values.value as RunState|undefined)?.actions===1)throw new Error('injected_checkpoint_loss');
   return target.put(...args);
  };
  if(key==='putWrites')return async(...args:Parameters<BaseCheckpointSaver['putWrites']>)=>{
   if(args[1].some(([channel,value])=>channel==='value'&&(value as RunState|undefined)?.actions===1))throw new Error('injected_checkpoint_loss');
   return target.putWrites(...args);
  };
  const value=Reflect.get(target,key,target);
  return typeof value==='function'?value.bind(target):value;
 }});
}
