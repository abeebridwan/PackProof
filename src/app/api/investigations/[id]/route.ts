import {handle} from '../../../../server/investigator/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(request,'get',(await context.params).id);}
