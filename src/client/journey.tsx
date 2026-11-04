'use client';
import {useEffect,useState} from 'react';
import {navigation,accountLabel,signedInAccountLabel,authChangedEvent} from './navigation';
export type ReviewStatus={authenticated:boolean;reviewer:boolean;live:boolean;role?:'buyer'|'seller';remainingCents?:number;units?:{id:string;product:string;packaging:string;seller:string;available:boolean;version:number}[]};
let reviewRequest:Promise<ReviewStatus|null>|null=null;
function readReview(){
 if(!reviewRequest){const request=fetch('/api/review/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null) as Promise<ReviewStatus|null>;reviewRequest=request;void request.finally(()=>{if(reviewRequest===request)reviewRequest=null;});}
 return reviewRequest;
}
export function useReview(){const [status,setStatus]=useState<ReviewStatus|null>(null);useEffect(()=>{
 let active=true,version=0;const refresh=()=>{const current=++version;void readReview().then(v=>{if(active&&current===version&&v)setStatus(v);});};
 const changed=()=>{reviewRequest=null;refresh();};refresh();window.addEventListener('focus',refresh);window.addEventListener(authChangedEvent,changed);
 return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener(authChangedEvent,changed);};
 },[]);return status;}
export function Journey(){const [path,setPath]=useState('');useEffect(()=>setPath(location.pathname),[]);return <nav className="journey" aria-label="PackProof features">{navigation.map(([url,label])=><a key={url} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}</nav>;}
export function AppHeader(){const status=useReview();return <><header className="topbar"><a className="brand" data-home href="/"><img src="/icon.svg" width="36" height="36" alt=""/>PackProof</a><a className="account-link" href="/account">{status?.authenticated?signedInAccountLabel:accountLabel}</a></header><Journey/></>;}
