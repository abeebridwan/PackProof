import type {NextConfig} from 'next';
const config:NextConfig={
 typescript:{tsconfigPath:'tsconfig.app.json'},poweredByHeader:false,serverExternalPackages:['pg','sharp','@langchain/langgraph-checkpoint-postgres'],
 outputFileTracingIncludes:{'/offline/**':['./dist/offline/**'],'/tools/**':['./dist/index.html','./dist/phone.js'],'/api/**':['./docs/packproof/demo/root-public.json','./certs/supabase-roots.crt','./docs/packproof/evidence/provider.json','./docs/packproof/evidence/sam/special-token-output.txt']},
 outputFileTracingExcludes:{'/*':['./.local/**','./.env*','./tests/**','./scripts/p1/**','./scripts/p1c/**','./scripts/p2/**','./scripts/p3/**','./scripts/p4/**']},
 webpack(config){config.resolve.extensionAlias={...config.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};return config;},
 async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'}]}];},
};
export default config;
