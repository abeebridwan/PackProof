import {inspectionHttp} from '../../../../../server/inspector/http';
export const runtime='nodejs';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){return inspectionHttp(r,(await c.params).id);}
