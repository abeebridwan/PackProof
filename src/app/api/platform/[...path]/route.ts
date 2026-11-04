import {platformHttp} from '../../../../server/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{path:string[]}>};
export const GET=async(r:Request,c:Context)=>platformHttp(r,(await c.params).path);
export const POST=GET;
