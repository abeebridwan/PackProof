// Build-time only: pinned patched upstream source; no decoder download at request time.
import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const run=promisify(execFile),version='9.0.2',sourceHash='6e374ed621e48faa40639307dff48ba6fe574a509977956d2cce9669b7cc27e9',destination='vendor/ffmpeg';
const report=process.report.getReport();const header=typeof report==='object'&&report&&'header' in report?report.header as {glibcVersionRuntime?:string}:null;const target=`${process.platform}-${process.arch}-${header?.glibcVersionRuntime??'system'}`;
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
try{const m=JSON.parse(await readFile(destination+'/build.json','utf8'));if(m.target===target&&m.sourceSha256===sourceHash&&m.binarySha256===hash(await readFile(destination+'/ffmpeg'))){console.log(JSON.stringify({videoDecoder:'cached',version}));process.exit(0);}}catch{}
const dir=await mkdtemp(join(tmpdir(),'packproof-video-build-'));
try{
 let source:Uint8Array;
 if(process.env.FFMPEG_SOURCE_ARCHIVE)source=await readFile(process.env.FFMPEG_SOURCE_ARCHIVE);else{const response=await fetch(`https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/refs/tags/n${version}`,{redirect:'error',signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('video_source_unavailable');source=new Uint8Array(await response.arrayBuffer());}
 if(source.length>32*1024*1024||hash(source)!==sourceHash)throw new Error('video_source_hash_mismatch');
 await writeFile(join(dir,'source.tar.gz'),source);await run('tar',['-xzf','source.tar.gz'],{cwd:dir,maxBuffer:1024*1024});const work=join(dir,`FFmpeg-n${version}`);
 const configure=['--disable-everything','--disable-autodetect','--disable-network','--disable-x86asm','--disable-doc','--disable-debug','--disable-shared','--enable-static','--enable-ffmpeg','--disable-ffprobe','--disable-ffplay','--enable-protocol=file,pipe','--enable-demuxer=mov,matroska','--enable-decoder=h264,hevc,vp8,vp9,mjpeg,png','--enable-parser=h264,hevc,vp8,vp9','--enable-filter=select,scale,showinfo,format,setsar,setpts','--enable-encoder=mjpeg','--enable-muxer=image2','--enable-swscale'];
 await run('./configure',configure,{cwd:work,timeout:120000,maxBuffer:2*1024*1024});await run('make',['-j2'],{cwd:work,timeout:600000,maxBuffer:16*1024*1024});
 await mkdir(destination,{recursive:true});await copyFile(join(work,'ffmpeg'),destination+'/ffmpeg');await chmod(destination+'/ffmpeg',0o755);
 await copyFile(join(work,'COPYING.LGPLv2.1'),destination+'/COPYING.LGPLv2.1');const binaryHash=hash(await readFile(destination+'/ffmpeg'));
 await writeFile(destination+'/build.json',JSON.stringify({version,target,sourceUrl:`https://github.com/FFmpeg/FFmpeg/releases/tag/n${version}`,sourceSha256:sourceHash,binarySha256:binaryHash,configure})+'\n');console.log(JSON.stringify({videoDecoder:'built',version,sourceSha256:sourceHash,binarySha256:binaryHash}));
}finally{await rm(dir,{recursive:true,force:true});}
