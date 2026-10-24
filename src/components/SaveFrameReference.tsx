'use client';

import Script from 'next/script';

declare global {
  interface Window {
    initializeSaveFrame?: () => void;
  }
}

export function SaveFrameReference({ markup }: { markup: string }) {
  return (
    <>
      <div className="saveframe-home" style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: markup }} />
      <Script src="/saveframe.js" strategy="afterInteractive" onReady={() => window.initializeSaveFrame?.()} />
    </>
  );
}
