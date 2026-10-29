'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { createAnalytics, type AnalyticsOptions } from '../lib/analytics';

export default function Analytics({id,origin,production,options}:{id:string;origin:string;production:boolean;options:AnalyticsOptions}){
  const pathname=usePathname();
  const search=useSearchParams();
  const controller=useRef<ReturnType<typeof createAnalytics>|null>(null);
  const [load,setLoad]=useState(false);
  const [needsConsent,setNeedsConsent]=useState(false);
  useEffect(()=>{
    const active=createAnalytics(window,id,origin,production,()=>setLoad(true),options,setNeedsConsent);controller.current=active;
    return ()=>{active.dispose();controller.current=null;};
  },[id,origin,production,options]);
  useEffect(()=>{controller.current?.page();},[pathname,search]);
  const choose=(value:'granted'|'denied')=>window.dispatchEvent(new CustomEvent('saveframe:analytics-consent',{detail:{analytics:value}}));
  return <>
    {load&&<Script id="saveframe-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}&l=saveframeDataLayer`} strategy="afterInteractive" referrerPolicy="no-referrer"/>}
    {needsConsent&&<section aria-label="Analytics preferences" lang="en" dir="ltr" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-line bg-white p-4 text-sm text-ink shadow-lg">
      <p className="font-semibold">Allow optional analytics?</p>
      <p className="mt-1 text-ink-muted">Google Analytics uses cookies to help us understand visits and downloads. Your Instagram links are excluded. <Link href="/privacy" className="underline">Privacy policy</Link></p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={()=>choose('granted')} className="min-h-[44px] rounded-lg border border-line px-4 py-2 font-medium hover:bg-soft">Allow analytics</button>
        <button type="button" onClick={()=>choose('denied')} className="min-h-[44px] rounded-lg border border-line px-4 py-2 font-medium hover:bg-soft">Decline analytics</button>
      </div>
    </section>}
  </>;
}
