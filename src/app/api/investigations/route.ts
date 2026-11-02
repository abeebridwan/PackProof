import {handle} from '../../../server/investigator/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>handle(request,'create');
