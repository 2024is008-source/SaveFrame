'use client';

import { useEffect, useRef } from 'react';

export function SiteChrome({ markup }: { markup: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const closeMenus = () => {
      for (const name of ['downloader', 'viewer']) {
        element.querySelector(`#nav-${name}-menu`)?.classList.add('hidden');
        element.querySelector(`#nav-${name}-btn`)?.setAttribute('aria-expanded', 'false');
      }
    };
    const controller = new AbortController();
    element.addEventListener('click', event => {
      const target = (event.target as Element).closest('button');
      if (!target) return;
      if (target.id === 'mobile-menu-btn') {
        const drawer = element.querySelector('#mobile-nav-drawer');
        const open = drawer?.classList.contains('hidden');
        drawer?.classList.toggle('hidden', !open);
        target.setAttribute('aria-expanded', String(open));
        element.querySelector('#mobile-menu-icon-open')?.classList.toggle('hidden', Boolean(open));
        element.querySelector('#mobile-menu-icon-close')?.classList.toggle('hidden', !open);
      } else if (['nav-downloader-btn', 'nav-viewer-btn'].includes(target.id)) {
        const name = target.id.includes('downloader') ? 'downloader' : 'viewer';
        const open = target.getAttribute('aria-expanded') !== 'true';
        closeMenus();
        element.querySelector(`#nav-${name}-menu`)?.classList.toggle('hidden', !open);
        target.setAttribute('aria-expanded', String(open));
        event.stopPropagation();
      }
    }, { signal: controller.signal });
    document.addEventListener('click', closeMenus, { signal: controller.signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeMenus();
        element.querySelector('#mobile-nav-drawer')?.classList.add('hidden');
        element.querySelector('#mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
        element.querySelector('#mobile-menu-icon-open')?.classList.remove('hidden');
        element.querySelector('#mobile-menu-icon-close')?.classList.add('hidden');
      }
    }, { signal: controller.signal });
    return () => controller.abort();
  }, []);
  return <div ref={root} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
