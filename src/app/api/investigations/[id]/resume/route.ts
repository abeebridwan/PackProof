import {handle} from '../../../../../server/investigator/http';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(request,'resume',(await context.params).id);}
