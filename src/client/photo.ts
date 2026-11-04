// Local preparation only. Network upload still requires the explicit submit.
export async function preparePhoto(file:File):Promise<File>{
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>20*1024*1024)throw new Error('Choose a JPEG or PNG up to 20 MB.');
 const image=await createImageBitmap(file);
 try{
  if(file.size<=2097152&&image.width<=4096&&image.height<=4096)return file;
  const scale=Math.min(1,1920/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo preparation failed.')),'image/jpeg',0.88));
  if(blob.size>2097152)throw new Error('This photo is still too large. Take a closer, smaller photo.');
  return new File([blob],'prepared-photo.jpg',{type:'image/jpeg'});
 }finally{image.close();}
}
