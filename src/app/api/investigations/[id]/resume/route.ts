import {handle} from '../../../../../server/investigator/http';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(request,'resume',(await context.params).id);}
