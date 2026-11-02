import {handle} from '../../../../server/investigator/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handle(request,'lookup');
