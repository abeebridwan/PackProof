// pnpm exec tsx packages/packproof-sdk/example.ts
// Set PACKPROOF_BASE_URL to the local or protected Preview app. Optional
// PACKPROOF_API_KEY must be a scoped PackProof key, never a provider key.
import {PackProofClient} from './src/index.js';
const baseUrl=process.env.PACKPROOF_BASE_URL;
if(!baseUrl)throw new Error('Set PACKPROOF_BASE_URL');
const client=new PackProofClient({baseUrl,apiKey:process.env.PACKPROOF_API_KEY});
const result=await client.call('products.lookup',{
 namespace:'packproof-demo',productMark:'FP-1002',packagingMark:'PK-2002',
});
console.log(JSON.stringify(result,null,2));
