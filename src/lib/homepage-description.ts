// Public copy uses the supported feature set; legacy values are matched only for compatibility.
export const homepageDescriptionKey = 'Download public Instagram Reels, videos, photos, carousels, and MP3 audio with a simple link. Fast, clean, mobile-friendly web utility.';

const legacyDescriptions = new Set([
  'Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link. Fast, clean, mobile-friendly web utility.',
  'Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link.',
]);

/** Ignore only the shipped English homepage defaults, preserving custom SEO edits. */
export function isLegacyHomepageDescription(route: string, description: unknown): boolean {
  return route === '/' && typeof description === 'string' && legacyDescriptions.has(description.trim());
}
