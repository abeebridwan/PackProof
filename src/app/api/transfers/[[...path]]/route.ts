import {transferHttp} from '../../../../server/transfers/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{path?:string[]}>};
export const POST=async(r:Request,c:Context)=>transferHttp(r,'transfer',(await c.params).path??[]);
export const GET=POST;
