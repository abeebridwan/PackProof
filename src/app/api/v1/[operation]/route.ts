import {apiHttp} from '../../../../server/platform/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{operation:string}>};
export const POST=async(r:Request,c:Context)=>apiHttp(r,(await c.params).operation);
