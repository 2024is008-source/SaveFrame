'use client';

import Script from 'next/script';
import clientAsset from '../ui/client-asset.json';

declare global {
  interface Window {
    initializeSaveFrame?: () => void;
  }
}

export function SaveFrameReference({ markup }: { markup: string }) {
  return (
    <>
      <div className="saveframe-home" style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: markup }} />
      <Script src={clientAsset.src} strategy="afterInteractive" onReady={() => window.initializeSaveFrame?.()} />
    </>
  );
}
