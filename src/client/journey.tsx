'use client';
import {useEffect,useState} from 'react';
import {navigation,accountLabel} from './navigation';
export type ReviewStatus={authenticated:boolean;reviewer:boolean;live:boolean;role?:'buyer'|'seller';remainingCents?:number;units?:{id:string;product:string;packaging:string;seller:string;available:boolean;version:number}[]};
export function useReview(){const [status,setStatus]=useState<ReviewStatus|null>(null);useEffect(()=>{let active=true;void fetch('/api/review/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(active)setStatus(v);}).catch(()=>{});return()=>{active=false;};},[]);return status;}
export function Journey(){const [path,setPath]=useState('');useEffect(()=>setPath(location.pathname),[]);return <nav className="journey" aria-label="PackProof features">{navigation.map(([url,label])=><a key={url} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}</nav>;}
export function AppHeader(){return <><header className="topbar"><a className="brand" data-home href="/review"><img src="/icon.svg" width="36" height="36" alt=""/>PackProof</a><a className="account-link" href="/account">{accountLabel}</a></header><Journey/></>;}
