const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const parsed = new URL(configured || 'http://localhost:3000');
if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.');
export const siteUrl = parsed.origin;
export const hasPublicSiteUrl = Boolean(configured) && !['localhost', '127.0.0.1'].includes(parsed.hostname);
export const absoluteUrl = (pathname: string) => new URL(pathname, siteUrl).href;
