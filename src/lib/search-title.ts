import titles from '../content/search-titles.json';
/** Search metadata only; visible page headings and editorial titles stay intact. */
export function searchTitle(route: string, fallback: string): string {
  return Object.hasOwn(titles, route) ? titles[route as keyof typeof titles] : fallback;
}
