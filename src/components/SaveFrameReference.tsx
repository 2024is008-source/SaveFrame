'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import clientAsset from '../ui/client-asset.json';

declare global {
  interface Window {
    initializeSaveFrame?: () => void;
  }
}

export function SaveFrameReference({ markup }: { markup: string }) {
  // A development/server refresh can replace the supplied HTML without remounting
  // next/script. Rebind only genuinely new form nodes; preserve live result state.
  useEffect(() => { window.initializeSaveFrame?.(); }, [markup]);
  return (
    <>
      <div className="saveframe-home" style={{ display: 'contents' }} onSubmitCapture={event => event.preventDefault()} dangerouslySetInnerHTML={{ __html: markup }} />
      <Script src={clientAsset.src} strategy="afterInteractive" onReady={() => window.initializeSaveFrame?.()} />
    </>
  );
}
