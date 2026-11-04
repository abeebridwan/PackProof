import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {TransferError} from '../transfers/database.js';
import {validateImage} from '../investigator/captures.js';
export const VIDEO_LIMIT=3*1024*1024;
export async function decodeVideo(bytes:Uint8Array,mime:string){
 if(bytes.length<16||bytes.length>VIDEO_LIMIT||!['video/mp4','video/webm'].includes(mime))throw new TransferError('invalid_video',400);
 const directory=await mkdtemp(join(tmpdir(),'packproof-clip-'));try{
  await writeFile(join(directory,'source'),bytes,{mode:0o600});let stderr:string;
  try{({stderr}=await promisify(execFile)(resolve('vendor/ffmpeg/ffmpeg'),['-nostdin','-hide_banner','-loglevel','info','-max_alloc','33554432','-threads','1','-filter_threads','1','-f',mime==='video/mp4'?'mov':'matroska','-i','source','-an','-sn','-dn','-t','8.1','-vf',"setpts=PTS-STARTPTS,select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)',scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,showinfo",'-fps_mode','vfr','-frames:v','9','-q:v','3','frame-%02d.jpg'],{cwd:directory,timeout:20000,maxBuffer:1024*1024}));}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')throw new TransferError('video_decoder_unavailable',503);throw new TransferError('video_could_not_be_decoded',400);}
  const duration=stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);if(!duration)throw new TransferError('video_duration_required',400);
  const durationMs=Math.round((Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]))*1000);if(durationMs<200||durationMs>8000)throw new TransferError('video_maximum_eight_seconds',400);
  const times=[...stderr.matchAll(/\bn:\s*\d+\s+pts:\s*[-\d]+\s+pts_time:([\d.]+)/g)].map(m=>Math.round(Number(m[1])*1000));
  const files=(await readdir(directory)).filter(f=>/^frame-\d\d\.jpg$/.test(f)).sort();if(files.length<1||files.length>8||files.length!==times.length)throw new TransferError('invalid_video_frames',400);
  const frames=await Promise.all(files.map(async(file,i)=>{const data=new Uint8Array(await readFile(join(directory,file))),image=await validateImage(data,'image/jpeg');if(!Number.isFinite(times[i])||times[i]!>durationMs)throw new TransferError('invalid_frame_timestamp',400);return {bytes:data,timestampMs:times[i]!,...image};}));
  return {durationMs,decoderVersion:'9.0.2' as const,frames};
 }finally{await rm(directory,{recursive:true,force:true});}
}
