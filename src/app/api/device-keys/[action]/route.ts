import {transferHttp} from '../../../../server/transfers/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=async(r:Request,c:{params:Promise<{action:string}>})=>transferHttp(r,'device',[(await c.params).action]);
