import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
const config: NextConfig = {
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ['@node-rs/argon2'],
  // Runtime state must never be copied into a release/standalone artifact.
  outputFileTracingExcludes: { '/**': ['./.data/**/*', './.env*', './.runtime/downloads/**/*', './**/saveframe-story-session-*/**/*'] },
  images: { deviceSizes: [360, 480, 640, 768, 960, 1200], imageSizes: [48, 96, 160, 240] },
  async headers() {
    return [
      { source: '/admin/:path*', headers: [{key:'X-Robots-Tag',value:'noindex, nofollow, nosnippet'},{key:'Cache-Control',value:'private, no-store, max-age=0'},{key:'X-Frame-Options',value:'DENY'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'}] },
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, nosnippet' }, { key: 'Cache-Control', value: 'private, no-store, max-age=0' }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/images/blog/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
      // Content hashes change whenever these public assets change.
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};
export default function nextConfig(phase: string): NextConfig {
  // A dev server must not replace the CSS/chunk files used by next start.
  return { ...config, distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next' };
}
