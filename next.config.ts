import type {NextConfig} from 'next';
const config:NextConfig={
 typescript:{tsconfigPath:'tsconfig.app.json'},poweredByHeader:false,serverExternalPackages:['pg','sharp','@langchain/langgraph-checkpoint-postgres'],
 webpack(config){config.resolve.extensionAlias={...config.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};return config;},
 async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'}]}];},
};
export default config;
