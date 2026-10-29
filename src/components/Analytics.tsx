'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { consentKey, createAnalytics, type AnalyticsOptions } from '../lib/analytics';

export default function Analytics({id,origin,production,options}:{id:string;origin:string;production:boolean;options:AnalyticsOptions}){
  const pathname=usePathname();
  const search=useSearchParams();
  const controller=useRef<ReturnType<typeof createAnalytics>|null>(null);
  const [load,setLoad]=useState(false);
  const [showChoice,setShowChoice]=useState(false);
  const settingsButton=useRef<HTMLButtonElement>(null);
  const enabled=production && /^G-[A-Z0-9]+$/.test(id);
  useEffect(()=>{
    const active=createAnalytics(window,id,origin,production,()=>setLoad(true),options);controller.current=active;
    const updateChoice=()=>{
      let preference:string|null=null;
      try { preference=window.localStorage.getItem(consentKey); } catch {}
      const savedCookie=/(?:^|;\s*)sf_analytics_preference=(granted|denied)(?:;|$)/.test(document.cookie);
      const privacySignal=['1','yes'].includes(navigator.doNotTrack)||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true;
      setShowChoice(production && /^G-[A-Z0-9]+$/.test(id) && !options.automaticAllowed && !privacySignal && !savedCookie && !['granted','denied'].includes(preference||'') && new URLSearchParams(location.search).get('analytics')!=='off');
    };
    updateChoice();
    window.addEventListener('storage',updateChoice);
    return ()=>{active.dispose();controller.current=null;window.removeEventListener('storage',updateChoice);};
  },[id,origin,production,options]);
  useEffect(()=>{controller.current?.page();},[pathname,search]);
  const choose=(value:'granted'|'denied')=>{
    window.dispatchEvent(new CustomEvent('saveframe:analytics-consent',{detail:{analytics:value}}));
    setShowChoice(false);
    settingsButton.current?.focus();
  };
  return <>
    {load && <Script id="saveframe-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}&l=saveframeDataLayer`} strategy="afterInteractive" referrerPolicy="no-referrer"/>}
    {enabled && <div className="analytics-settings"><button ref={settingsButton} type="button" aria-expanded={showChoice} aria-controls="analytics-choice" onClick={()=>setShowChoice(value=>!value)}>Analytics settings</button></div>}
    {enabled && showChoice && <section id="analytics-choice" className="analytics-choice" aria-labelledby="analytics-choice-title">
      <h2 id="analytics-choice-title">Optional analytics</h2>
      <p>Allow Google Analytics cookies to help us understand page visits and downloads? Your submitted TikTok links are excluded. You can change your choice in Analytics settings. <Link href="/privacy">Privacy policy</Link></p>
      <div><button type="button" onClick={()=>choose('granted')}>Allow analytics</button><button type="button" onClick={()=>choose('denied')}>Decline analytics</button></div>
    </section>}
  </>;
}
