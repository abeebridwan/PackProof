'use client';
import {useEffect,useRef,useState} from 'react';
import type {CaptureDetails} from '../contracts/inspection';
type Box=CaptureDetails['box'];
type Handle='n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';
type Mode='draw'|'move'|Handle;
type Props={src:string;width:number;height:number;box:Box|null;onChange:(box:Box)=>void;onLoad:(image:HTMLImageElement)=>void};
const handles:Handle[]=['n','s','e','w','nw','ne','sw','se'];
const names:Record<Handle,string>={n:'top edge',s:'bottom edge',e:'right edge',w:'left edge',nw:'top left corner',ne:'top right corner',sw:'bottom left corner',se:'bottom right corner'};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function RegionSelector({src,width,height,box,onChange,onLoad}:Props){
 const gesture=useRef<{id:number;x:number;y:number;clientX:number;clientY:number;moved:boolean;previous:Box|null;mode:Mode}|null>(null);
 const [locked,setLocked]=useState(false),[previewReady,setPreviewReady]=useState(false);
 const imageRef=useRef<HTMLImageElement|null>(null),cropRef=useRef<HTMLCanvasElement|null>(null);
 useEffect(()=>{setLocked(false);},[src]);
 useEffect(()=>{setPreviewReady(false);const image=imageRef.current,canvas=cropRef.current;if(!image?.complete||!canvas||!box||width<1||height<1)return;const w=box.right-box.left,h=box.bottom-box.top,scale=Math.min(1,720/w,480/h);canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const context=canvas.getContext('2d');if(!context)return;context.drawImage(image,box.left,box.top,w,h,0,0,canvas.width,canvas.height);setPreviewReady(true);},[src,width,height,box]);
 const ready=width>0&&height>0;
 const point=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:clamp(Math.round((e.clientX-r.left)/r.width*width),0,width),y:clamp(Math.round((e.clientY-r.top)/r.height*height),0,height)};};
 function centered(x:number,y:number,w:number,h:number){const boundedW=clamp(Math.round(w),1,width),boundedH=clamp(Math.round(h),1,height);const left=clamp(Math.round(x-boundedW/2),0,width-boundedW),top=clamp(Math.round(y-boundedH/2),0,height-boundedH);return{left,top,right:left+boundedW,bottom:top+boundedH};}
 function adjusted(previous:Box,mode:Exclude<Mode,'draw'>,dx:number,dy:number):Box{
  const b={...previous};
  if(mode==='move'){const x=clamp(dx,-b.left,width-b.right),y=clamp(dy,-b.top,height-b.bottom);return{left:b.left+x,top:b.top+y,right:b.right+x,bottom:b.bottom+y};}
  if(mode.includes('w'))b.left=clamp(b.left+dx,0,b.right-1);
  if(mode.includes('e'))b.right=clamp(b.right+dx,b.left+1,width);
  if(mode.includes('n'))b.top=clamp(b.top+dy,0,b.bottom-1);
  if(mode.includes('s'))b.bottom=clamp(b.bottom+dy,b.top+1,height);
  return b;
 }
 function drag(x:number,y:number){const g=gesture.current!;if(g.mode!=='draw'&&g.previous)return adjusted(g.previous,g.mode,x-g.x,y-g.y);const left=clamp(Math.min(x,g.x),0,width-1),top=clamp(Math.min(y,g.y),0,height-1);return{left,top,right:clamp(Math.max(x,g.x),left+1,width),bottom:clamp(Math.max(y,g.y),top+1,height)};}
 function keyboard(e:React.KeyboardEvent,mode:Exclude<Mode,'draw'>){if(locked||!box||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?10:1;onChange(adjusted(box,mode,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0));}
 const changeSize=(axis:'width'|'height',percent:number)=>{if(locked||!box)return;const w=box.right-box.left,h=box.bottom-box.top;onChange(centered((box.left+box.right)/2,(box.top+box.bottom)/2,axis==='width'?width*percent/100:w,axis==='height'?height*percent/100:h));};
 const widthPercent=box?Math.max(1,Math.round((box.right-box.left)/width*100)):100,heightPercent=box?Math.max(1,Math.round((box.bottom-box.top)/height*100)):100;
 return <div className="region-picker"><p>{locked?'Selection locked. Scroll freely; the box stays fixed. Tap Edit selection to adjust it.':'Drag inside the green box to move it. Drag an edge or corner handle to resize it, then lock your selection.'}</p>
 <div className={`region-selector${locked?' region-locked':''}`} aria-label="Photo region selection" onPointerDown={e=>{if(locked||!ready||!e.isPrimary||e.button!==0||gesture.current)return;e.preventDefault();const target=e.target as HTMLElement,handle=target.closest<HTMLElement>('[data-region-handle]')?.dataset.regionHandle as Handle|undefined,selected=target.closest('.selected-region');let mode:Mode=handle??(selected?'move':'draw');if(!handle&&selected){const r=selected.getBoundingClientRect(),horizontal=Math.min(e.clientX-r.left,r.right-e.clientX)<=10?(e.clientX-r.left<r.right-e.clientX?'w':'e'):'',vertical=Math.min(e.clientY-r.top,r.bottom-e.clientY)<=10?(e.clientY-r.top<r.bottom-e.clientY?'n':'s'):'';if(horizontal||vertical)mode=(vertical+horizontal) as Handle;}const p=point(e);gesture.current={id:e.pointerId,...p,clientX:e.clientX,clientY:e.clientY,moved:false,previous:box,mode};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(Math.hypot(e.clientX-g.clientX,e.clientY-g.clientY)>=(g.mode==='draw'?12:3))g.moved=true;if(g.moved){const p=point(e);onChange(drag(p.x,p.y));}}} onPointerUp={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const p=point(e);if(g.moved)onChange(drag(p.x,p.y));else if(g.mode==='draw')onChange(centered(p.x,p.y,width*.6,height*.25));gesture.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={e=>{if(gesture.current?.id===e.pointerId){const previous=gesture.current.previous;if(previous)onChange(previous);gesture.current=null;}}} onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)gesture.current=null;}}>
 <img ref={imageRef} src={src} alt="Your photo with the selected text region" draggable={false} onLoad={e=>onLoad(e.currentTarget)}/>
 {ready&&box&&<span className="selected-region" role="group" aria-label={locked?'Selected region; locked':'Selected region; drag to move'} tabIndex={locked?-1:0} onKeyDown={e=>keyboard(e,'move')} style={{left:`${box.left/width*100}%`,top:`${box.top/height*100}%`,width:`${(box.right-box.left)/width*100}%`,height:`${(box.bottom-box.top)/height*100}%`}}>{!locked&&handles.map(handle=><button key={handle} type="button" className={`region-handle handle-${handle}`} data-region-handle={handle} aria-label={`Resize ${names[handle]}`} title={`Drag to resize ${names[handle]}; arrow keys adjust`} onKeyDown={e=>keyboard(e,handle)}/>)}</span>}
 </div>
 {ready&&<><button type="button" className="text-button region-lock-button" disabled={!box} aria-pressed={locked} onClick={()=>{gesture.current=null;setLocked(v=>!v);}}>{locked?'Edit selection':'Lock selection'}</button><p role="status">{box?`Selected region: ${box.right-box.left} × ${box.bottom-box.top} pixels.`:'Choose a region.'} Original: {width} × {height}. This guides SAM; it is not a model mask.</p><label>Region width · {widthPercent}%<input type="range" min="1" max="100" value={widthPercent} disabled={locked||!box} onChange={e=>changeSize('width',Number(e.target.value))}/></label><label>Region height · {heightPercent}%<input type="range" min="1" max="100" value={heightPercent} disabled={locked||!box} onChange={e=>changeSize('height',Number(e.target.value))}/></label><button type="button" className="text-button" disabled={locked} onClick={()=>onChange({left:0,top:0,right:width,bottom:height})}>Use whole image as region prompt</button></>}
 {ready&&box&&<figure className="selected-area-preview"><figcaption><b>Selected area preview</b><span>{locked?'Locked — this area stays fixed.':'Adjust the box until the complete text is visible.'}</span></figcaption><canvas ref={cropRef} role="img" aria-label="Preview of the selected area" hidden={!previewReady}/><p>This preview stays on your device. The original photo and selected coordinates are saved; the original may also be used for context if you consent to live analysis.</p></figure>}
 </div>;
}
