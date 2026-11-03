import {inspectionHttp} from '../../../../../../../server/inspector/http';
export const runtime='nodejs';
export async function GET(r:Request,c:{params:Promise<{id:string;captureId:string;kind:string}>}){const p=await c.params;return inspectionHttp(r,p.id,p);}
