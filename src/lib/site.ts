const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const fallback = process.env.NODE_ENV === 'production' ? 'https://saveframe.site' : 'http://localhost:3000';
const parsed = new URL(configured || fallback);
if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.');
export const siteUrl = parsed.origin;
export const hasPublicSiteUrl = !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
export const absoluteUrl = (pathname: string) => new URL(pathname, siteUrl).href;
