# @packproof/sdk

Typed ESM client for PackProof API v1, with runtime input/output validation, cancellation, timeouts and structured errors. Requires Node.js 24 or a browser bundler with the standard Fetch and AbortSignal APIs.

```sh
npm install @packproof/sdk
```

```ts
import {PackProofClient, PackProofError} from '@packproof/sdk';

const client = new PackProofClient({
  baseUrl: 'http://localhost:3000', // Your running PackProof API v1 deployment.
  timeoutMs: 90_000,
});

const result = await client.call('products.lookup', {
  namespace: 'packproof-demo',
  productMark: 'FP-1001',
  packagingMark: 'PK-2001',
});
console.log(result.status);
```

Use HTTPS outside localhost. Set `baseUrl` to a deployment exposing `/api/v1/<operation>`; protected Preview deployments also require deployment-level access. This package does not host the backend.

For private operations, supply either `apiKey` (a scoped PackProof developer key) or `accessToken` (your authenticated Supabase access token). Keep credentials out of source control. Use a narrowly scoped credential in a trusted server; never embed a privileged key in a public browser bundle.

```ts
const privateClient = new PackProofClient({
  baseUrl: 'https://your-packproof-app.example',
  apiKey: process.env.PACKPROOF_API_KEY,
});
// Use a real handover ID belonging to this participant.
const comparison = await privateClient.call('dualproof.get', {transferId});
```

`call(operation, input, {signal, idempotencyKey})` accepts an optional cancellation signal and idempotency UUID. Transfer proposals require `idempotencyKey`. `PackProofError` exposes `code`, HTTP `status` and `retryAfter`; malformed inputs or responses fail schema validation.

The SDK cannot sign participant consent or commit ownership autonomously. Matching signed records or a photograph never establishes authenticity, safety, legal title or uninterrupted custody. Sample results remain identified as sample evidence.
