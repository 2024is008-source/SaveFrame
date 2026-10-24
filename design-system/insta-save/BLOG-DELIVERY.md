# SaveFrame blog delivery — 24 October 2026

The existing SaveFrame UI now links to a complete file-based blog. Fifteen original articles contain 16,819 words in total, with individual articles between 1,067 and 1,170 words. Fifteen distinct generated cover images match the original warm photographic style. The homepage shows Stories by Link, Photos Online and Reels in MP4, with real article links. The supplied header, footer, colors and downloader layout are retained.

## Features

- `/blog`: three starting guides, search across titles/descriptions, seven category filters, nine results per page, pagination and empty states.
- `/blog/[slug]`: complete content, publication date, SaveFrame byline, reading time, cover image, table of contents, FAQs, internal links, matching downloader link, three related articles, and Back to All Guides.
- Markdown and metadata stored in the repository; no database, CMS or additional runtime dependency.
- `published: false` excludes a draft from listings, lookup, related articles, static routes and sitemap. Rebuild after content changes.
- Responsive cards and readable article layout; native GET search and links work without client-side search code.

## SEO

Production uses `https://saveframe.site`, configured in `.env.production`. Each article has a canonical URL, title, description, Open Graph and Twitter card metadata, BlogPosting and BreadcrumbList JSON-LD. Sitemap contains the homepage, blog index and fifteen published articles. Robots permits public pages and excludes `/api/`. Search/filter/pagination variations are noindex and canonicalize to `/blog`. Local development without a public-origin override disables indexing. This configuration does not deploy the site or set up DNS; the domain must point to the deployed application.

## Files created

- `src/content/blog/posts.json` and fifteen matching Markdown bodies.
- `src/lib/blog.ts`, `src/lib/site.ts`.
- `src/components/blog/ArticleCard.tsx`, `Markdown.tsx`, `BlogShell.tsx`, `SiteChrome.tsx`.
- `src/app/blog/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`.
- Forty-five WebP variants in `public/images/blog/`: fifteen unique article covers at widths 480, 960 and 1200.
- `.env.production`, `.env.example`, `scripts/check-blog.cjs`, `scripts/check-blog-live.cjs`, image notes, optimization report and this delivery report.

## Files updated

`src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/ui/saveframe.json`, `public/saveframe.js`, `tailwind.config.js`, `package.json`, `README.md` and `scripts/optimize-blog-images.cjs`. The old short article-modal definitions were removed in favor of real pages. Downloader backend behavior was preserved during the blog update.

## Images

Fifteen distinct generated editorial covers share warm window light, neutral beige, wood and stone textures. They are illustrations in a photographic style. They are not real Instagram screenshots or documentary photographs. WebP quality 82, three responsive sizes per cover, descriptive alt text, and caching-friendly separate files keep image payloads modest. At 960px wide the five files range from approximately 41 to 135 KiB. All prompts and original generated source paths are in `IMAGE-NOTES.md`, `unique-cover-prompts.json` and `image-optimization.json` in this folder.

## Validation

- `npm run build`: passed, including all fifteen static article routes.
- `npm run test:blog`: passed for article lengths, unique slugs, FAQs, heading anchors, internal article links, tool links, related posts, search/filter behavior and image variants.
- `node scripts/check-blog-live.cjs`: passed for every article HTTP response, missing article 404, search, categories, pagination, home cards, canonical URLs, JSON-LD, robots and the seventeen sitemap entries.
- `npm run test:downloader`: passed for cached extraction, audio merging, photo carousels, honest quality metadata, cleanup and production UI.
- Browser checks: desktop covers and article, search, combined category/search empty state, pagination, phone menu and matching Reels downloader link. Article layouts at 390px and 768px had no horizontal overflow.
- Existing repository limitations: standalone `tsc --noEmit` reports the old `src/tests/backend.test.ts` import of missing `../server`; the existing `npm run lint` needs an ESLint configuration. The production build succeeds. No claim of a clean standalone typecheck or lint run is made.

## Add a post

1. Add a unique metadata record to `src/content/blog/posts.json`, initially `published: false`.
2. Write `src/content/blog/<slug>.md`, using supported Markdown paragraphs, h2/h3 headings, lists, inline links, bold and code. Raw HTML is not rendered.
3. Choose a relevant existing cover or generate a 4:3 source at least 1200px wide. Run `node scripts/optimize-blog-images.cjs <cover-name> <source-path> 82` and set the cover basename and alt text in the record.
4. Check publication/modification dates, links, category, author and matching downloader tool; set `published: true` when ready.
5. Run blog checks, stop the app, rebuild, restart, and deploy. The fixed fifteen-article count in the current content test should be updated when intentionally expanding the collection.

## Scope and limitations

The server is available locally at `http://localhost:3000`. Deployment and DNS changes are not part of this completed local implementation. There is no guarantee of search-engine ranking or immediate indexing. Instagram can restrict public-media requests; private, expired or login-restricted media remains unsupported. The articles explain these limits instead of promising universal access. Every article has its own unique image. Tests reject duplicate cover names and duplicate 960px file contents.

## Article URLs

The following are configured production destinations; local previews use the same paths at `http://localhost:3000`.

1. [How to Download Instagram Stories by Link](https://saveframe.site/blog/how-to-download-instagram-stories-by-link)
2. [How to Download Instagram Story Videos](https://saveframe.site/blog/how-to-download-instagram-story-videos)
3. [How to Download Instagram Photos Online](https://saveframe.site/blog/how-to-download-instagram-photos-online)
4. [Instagram Photo Downloader: How to Copy an Instagram Post Link](https://saveframe.site/blog/how-to-copy-instagram-photo-link)
5. [How to View Instagram Profile Pictures Using a URL](https://saveframe.site/blog/view-instagram-profile-picture-by-url)
6. [How to Download Instagram Reels in MP4 Format](https://saveframe.site/blog/how-to-download-instagram-reels-mp4)
7. [How to Download Instagram Reels on iPhone](https://saveframe.site/blog/download-instagram-reels-on-iphone)
8. [How to Download Instagram Videos on PC](https://saveframe.site/blog/download-instagram-videos-on-pc)
9. [How to Download Multiple Photos from an Instagram Carousel](https://saveframe.site/blog/download-instagram-carousel-photos)
10. [How to Download Instagram Reels with Audio](https://saveframe.site/blog/download-instagram-reels-with-audio)
11. [Instagram Downloader Not Working? Common Problems and Solutions](https://saveframe.site/blog/instagram-downloader-not-working)
12. [Why Can't I Download Instagram Videos?](https://saveframe.site/blog/why-instagram-videos-wont-download)
13. [How to Download Instagram Photos on iPhone and Android](https://saveframe.site/blog/download-instagram-photos-iphone-android)
14. [Instagram Photo Sizes and Aspect Ratios Explained](https://saveframe.site/blog/instagram-photo-sizes-aspect-ratios)
15. [How to Back Up Your Own Instagram Photos, Videos, and Reels](https://saveframe.site/blog/backup-instagram-photos-videos-reels)
