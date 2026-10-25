import type { Metadata } from 'next';
import './admin.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'SaveFrame Admin',robots:{index:false,follow:false,nocache:true},alternates:{canonical:null},referrer:'no-referrer'};
export default function AdminLayout({children}:{children:React.ReactNode}) { return <div className="sf-admin">{children}</div>; }
