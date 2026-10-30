// Exact retired defaults only: deliberate custom administrator copy still wins.
// Google may rearrange title words; include the observed old search title forms.
export const legacyToolSeo: Record<string, {titles: string[]; descriptions: string[]}> = {
  '/reels-downloader': {
    titles: ['Instagram Reels Downloader', 'Instagram Reels Downloader – Preview & Save MP4', 'Preview & Save MP4 - Instagram Reels Downloader'],
    descriptions: ['Download supported public Instagram Reels as MP4. Preview available resolutions, choose video or audio, and check the finished file on your device.'],
  },
  '/video-downloader': {
    titles: ['Instagram Video Downloader', 'Save Instagram Videos as MP4 – Video Downloader'],
    descriptions: ['Save supported public Instagram feed videos to your phone or computer. Inspect MP4 options and troubleshoot processing or playback problems.'],
  },
  '/photo-downloader': {
    titles: ['Instagram Photo Downloader', 'Instagram Photo Downloader – Preview & Save Images', 'Preview & Save Images - Instagram Photo Downloader'],
    descriptions: ['Download supported public Instagram photos from a post link. Preview the image, inspect available dimensions, and save a local copy without signing in.'],
  },
  '/carousel-downloader': {
    titles: ['Instagram Carousel Downloader', 'Instagram Carousel Downloader – Pick Photos or Save a ZIP', 'Pick Photos or Save a ZIP - Instagram Carousel Downloader'],
    descriptions: ['Download individual photos from supported public Instagram carousels. Preview each returned slide, choose the items you need, and preserve their order.'],
  },
  '/audio-downloader': {
    titles: ['Instagram Audio Downloader', 'Instagram Audio Downloader – Download Reels MP3', 'Download Reels MP3 - Instagram Audio Downloader'],
    descriptions: [
      'Download audio from public Instagram Reels and videos as MP3. Paste an Instagram link, extract the available audio, and save it to your device for free.',
      'Download audio from Instagram Reels and videos as MP3. Paste a public Instagram link, extract audio online, and save it for free. No signup required.',
    ],
  },
};
const normalizedTitle = (value: string) => value.trim().replace(/\s*\|\s*SaveFrame\s*$/i, '').replace(/\s*[–—-]\s*/g, ' – ').replace(/\s+/g, ' ');
export function isLegacyToolTitle(route: string, value: unknown): boolean {
  return typeof value === 'string' && Boolean(legacyToolSeo[route]?.titles.some(title => normalizedTitle(title) === normalizedTitle(value)));
}
export function isLegacyToolDescription(route: string, value: unknown): boolean {
  return typeof value === 'string' && Boolean(legacyToolSeo[route]?.descriptions.includes(value.trim()));
}
