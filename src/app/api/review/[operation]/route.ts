import {reviewHttp} from '../../../../server/review/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=async(r:Request,c:{params:Promise<{operation:string}>})=>reviewHttp(r,(await c.params).operation);
export const POST=GET;
