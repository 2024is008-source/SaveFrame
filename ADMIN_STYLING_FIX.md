# Admin styling repair — 25 October 2026

## Root cause

The running `next start` process referenced production CSS files `4d76df24a9044408.css` and `f2b772a34e01ad10.css`. Both returned **HTTP 400 with text/html**, not CSS, on localhost and 127.0.0.1. The active `.next` directory contained development output (`static/development`), no production CSS directory and no `BUILD_ID`. Development had overwritten the production output directory used by the still-running server. A browser with cached styles could still look correct while a fresh asset request failed.

Inspection confirmed that the root layout imports `globals.css`, the admin layout imports `admin.css`, Tailwind scans all source TS/TSX/JSON plus the public script, and PostCSS enables Tailwind. Missing imports, class scanning and authentication were not the cause.

## Changes

- `next.config.ts`: development uses `.next-dev`, while production build/start continue using `.next`. Existing headers, indexing protections and server package configuration are preserved.
- `.gitignore` and `tsconfig.json`: ignore the development output and include its generated types.
- `src/app/admin/admin.css`: admin-scoped input sizing, 44 px control targets, 48 px login button, 16 px login/mobile input text, visible focus outlines, mobile card padding and readable footer text. The existing light/violet design remains.
- Requested scroll behavior: the desktop sidebar is pinned to the viewport, with its 220 px column reserved in the main grid (190 px on narrower desktops). Long navigation can scroll inside its own full-height panel. At 850 px and below the existing mobile menu remains in use.
- `scripts/check-styles.cjs`: checks real CSS URLs for HTTP 200, CSS MIME type and expected selectors on admin login, homepage and blog.
- Existing live admin tests now check actual linked CSS on the login and all seven authenticated sections. `npm test` aggregates the existing offline regression suites.
- README explains the output directories and production restart workflow.

No authentication, Gmail verification, SQLite, analytics, SEO or media extraction service implementation was changed for this repair. No UI packages were installed. The existing admin account was not modified.

## Verification

- `npm run dev` runs on localhost:3000 using `.next-dev`.
- `npm run build` passed while that development server stayed running. Production assets appeared in `.next` and the development assets continued to return HTTP 200/text/css after the build.
- Development and production `test:styles` passed for `/admin/login`, `/` and `/blog`.
- `npm test` passed admin/security, downloader, direct stories, 10-language and 15-article checks.
- Production `test:admin:live` passed authentication and all seven sections, including their CSS URLs, using a temporary isolated database and local SMTP fixture. No real Gmail messages were sent.
- Browser verification: login at 1440 and 390 px; all seven authenticated sections at desktop and 390 px; audit layout at 768 px. No horizontal page overflow. Mobile navigation closes after selecting a page; tables scroll inside their panels. Login input text is 16 px, input height 46 px and primary button height 48 px. Browser console inspection showed no CSS or JavaScript errors.
- Fixed-sidebar verification: at 1440 px, scrolling the document 748 px left the sidebar at top 0 with a 900 px viewport height. At 1000 px the sidebar and reserved content offset both measure 190 px. At 390 px the desktop sidebar is hidden and the mobile menu is displayed, without horizontal page overflow. Scroll proof: `admin-sidebar-fixed-scroll.png`.
- Public homepage inspected at desktop and mobile. The public production stylesheet remains `4d76df24a9044408.css` (38,425 bytes), the same content hash referenced before the repair. Public layout and global styles were preserved.
- Live SEO, localization, blog and TypeScript checks passed.

Proof screenshots are saved in the task visualization folder: `admin-login-fixed-desktop.png`, `admin-login-fixed-mobile.png`, `admin-dashboard-fixed-desktop.png`, `admin-dashboard-fixed-mobile.png`, `public-styling-preserved-desktop.png` and `public-styling-preserved-mobile.png`.

## Additional requested photo-selector cleanup

The owner's screenshot showed 13 JPEG options for one photo. These are alternate CDN renditions, already ordered best first by the existing extractor. The public UI now displays only the first/best photo format, preserving its format ID and underlying metadata. Video/audio choices and distinct carousel items are unchanged. The downloader regression check verifies that 13 photo renditions become one visible choice, the selected ID remains `photo-original`, original format data is unchanged, and video choices remain available.

The development server is the working local preview. For a separate production preview, build first, then start it on another free port; stop a production process before rebuilding its `.next` output. A hard refresh clears any stale failed assets retained by a browser.
