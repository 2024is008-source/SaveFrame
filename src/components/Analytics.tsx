'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { createAnalytics, type AnalyticsOptions } from '../lib/analytics';
import { createTrafficTracker } from '../lib/traffic-client';

export default function Analytics({id,origin,production,options}:{id:string;origin:string;production:boolean;options:AnalyticsOptions}){
  const pathname=usePathname();
  const search=useSearchParams();
  const controller=useRef<ReturnType<typeof createAnalytics>|null>(null);
  const traffic=useRef<ReturnType<typeof createTrafficTracker>|null>(null);
  const [load,setLoad]=useState(false);
  useEffect(()=>{
    const active=createAnalytics(window,id,origin,production,()=>setLoad(true),options);controller.current=active;
    traffic.current=createTrafficTracker(window,options.trafficEnabled===true,options);
    return ()=>{active.dispose();controller.current=null;traffic.current=null;};
  },[id,origin,production,options]);
  useEffect(()=>{
    // Next can commit page metadata just after the route changes. Wait a frame
    // so the manual view uses that page's title, and cancel superseded routes.
    const frame=requestAnimationFrame(()=>{controller.current?.page();traffic.current?.page();});
    return ()=>cancelAnimationFrame(frame);
  },[pathname,search]);
  return load?<Script id="saveframe-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}&l=saveframeDataLayer`} strategy="afterInteractive" referrerPolicy="no-referrer"/>:null;
}
