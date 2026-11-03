import {transferHttp} from '../../../../server/transfers/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=async(r:Request,c:{params:Promise<{action:string}>})=>transferHttp(r,'auth',[(await c.params).action]);
export const GET=POST;
