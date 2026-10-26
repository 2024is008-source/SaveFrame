'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { createAnalytics, type AnalyticsOptions } from '../lib/analytics';

export default function Analytics({id,origin,production,options}:{id:string;origin:string;production:boolean;options:AnalyticsOptions}){
  const pathname=usePathname();
  const search=useSearchParams();
  const controller=useRef<ReturnType<typeof createAnalytics>|null>(null);
  const [load,setLoad]=useState(false);
  useEffect(()=>{
    const active=createAnalytics(window,id,origin,production,()=>setLoad(true),options);controller.current=active;
    return ()=>{active.dispose();controller.current=null;};
  },[id,origin,production,options]);
  useEffect(()=>{controller.current?.page();},[pathname,search]);
  return load?<Script id="saveframe-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}&l=saveframeDataLayer`} strategy="afterInteractive" referrerPolicy="no-referrer"/>:null;
}
