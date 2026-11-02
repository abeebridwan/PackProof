import {handle} from '../../../server/investigator/http';
export const runtime='nodejs';
export const POST=(request:Request)=>handle(request,'capture');
