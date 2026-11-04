import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'PackProof · Check, inspect and keep evidence',description:'Understand signed product evidence, seller authorization and what remains unknown.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#183d32'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
