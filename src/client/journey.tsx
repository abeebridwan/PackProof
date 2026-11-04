'use client';
import {useEffect,useState} from 'react';
export type ReviewStatus={authenticated:boolean;reviewer:boolean;live:boolean;role?:'buyer'|'seller';remainingCents?:number;units?:{id:string;product:string;packaging:string;seller:string;available:boolean;version:number}[]};
export function useReview(){const [status,setStatus]=useState<ReviewStatus|null>(null);useEffect(()=>{let active=true;void fetch('/api/review/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(active)setStatus(v);}).catch(()=>{});return()=>{active=false;};},[]);return status;}
const steps=[['/review','Start here'],['/account','Your account'],['/products','Products'],['/','Investigate'],['/inspector','Inspect'],['/chainproof','Hand over'],['/dualproof','Compare evidence'],['/offline/index.html','Use offline'],['/developers','Developers']];
export function Journey(){return <nav className="journey" aria-label="PackProof features">{steps.map(([url,label])=><a key={url} href={url}>{label}</a>)}</nav>;}
