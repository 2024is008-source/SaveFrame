import titles from '../content/search-titles.json';
/** Search metadata only; visible page headings and editorial titles stay intact. */
export function searchTitle(route: string, fallback: string): string {
  return Object.hasOwn(titles, route) ? titles[route as keyof typeof titles] : fallback;
}

// Ignore only shipped homepage defaults; preserve deliberate administrator edits.
export function isLegacyHomepageTitle(route: string, title: unknown): boolean {
  return route === '/' && typeof title === 'string' && /^SaveFrame\s*[–—-]\s*Instagram Downloader for Photos, Reels, Videos & (?:Audio|Stories)$/.test(title.trim());
}
