import type { MetadataRoute } from 'next';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
export default function robots(): MetadataRoute.Robots {
  return hasPublicSiteUrl ? { rules: { userAgent: '*', allow: '/', disallow: ['/api/','/admin','/admin/'] }, sitemap: absoluteUrl('/sitemap.xml') } : { rules: { userAgent: '*', disallow: '/' } };
}
