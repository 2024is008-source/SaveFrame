# SaveFrame: UI skill study and application guide

Reviewed on 24 October 2026. This is a study and baseline review of the existing site, not a completed redesign or an accessibility certification.

## Installed sources

| Skill | Repository | Installed entry point |
| --- | --- | --- |
| UI/UX Pro Max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | `C:/Users/minuj/.codex/skills/ui-ux-pro-max/SKILL.md` |
| Taste / design-taste-frontend | https://github.com/Leonxlnx/taste-skill | `C:/Users/minuj/.codex/skills/design-taste-frontend/SKILL.md` |

Both were installed using the Codex skill-installer helper. The installed names are `ui-ux-pro-max` and `design-taste-frontend`. They can be discovered automatically on the next conversation turn. The repositories were read as external guidance; their preferences do not override the user's requirements.

## What each contributes

UI/UX Pro Max supplies a priority system and searchable guidance for accessibility, interaction targets, responsive layout, typography, form feedback, performance, and implementation stacks. The useful order for SaveFrame is accessibility and feedback, mobile interactions, responsive layout, then visual details.

Taste supplies a visual review process: establish the product's purpose and actual content, inspect the existing site, review screenshots at desktop/tablet/phone widths, identify the three largest visible problems, then compare the result after implementation. It distinguishes marketing pages from working app interfaces. SaveFrame combines a public information page with a working downloader form and result viewer; those regions should retain their appropriate conventions.

## Existing requirements take precedence

- The supplied SaveFrame HTML is the approved visual reference. Keep its identity, content hierarchy, and working download flow.
- Preserve the white surfaces, violet primary action, restrained spectrum accent, Inter body font, and Plus Jakarta Sans headings. Taste's default preferences against violet, gradients, and these fonts are not grounds for replacing the user's design.
- Keep real form fields, result panels, tables, and functional borders where they improve the tool's usability.
- Never restore sample-result buttons, developer controls, invented progress, fabricated file sizes, fake testimonials, or unverified success badges.
- A missing image dimension should remain unknown until it is established; the UI must not promise a resolution that was guessed.
- Keep Next.js 15, React, Tailwind 3, and the existing APIs. Stack search output tagged for Next.js 16.2 needs compatibility checking before use.
- Keep `MASTER.md` as the existing design reference. This study does not regenerate or overwrite it.

## Product-specific direction

SaveFrame's central interaction is a public Instagram link becoming a preview and a downloadable file. That real interaction should be the first-screen focus. Readability, unambiguous feedback, and accurate media presentation matter more than decorative animation or additional marketing sections.

The existing first screen already makes the product and its primary action clear. The interface should grow more informative only after a real link is submitted. Preserve the actual thumbnail, creator, caption, media count, available formats, and download state returned by the backend.

## Baseline browser observations

The site was reviewed through the available browser tools at viewport settings of 1440, 768, and 390 pixels wide. The measured document client widths were 1425, 753, and 375 pixels because the browser reserved scrollbar space. Document scroll width equaled client width at all three settings; no document-level horizontal overflow was measured in these initial states.

| Observation | Evidence | Application |
| --- | --- | --- |
| Tablet header is overcrowded | At the 768 setting, navigation labels wrap across multiple lines and the brand subtitle wraps tightly | Use the drawer navigation until there is sufficient room for the full desktop header. Check intermediate widths rather than relying only on phone and desktop screenshots. |
| Some interaction targets are small | Paste and article actions measured 40px high; footer links/buttons measured 24–28px high | Increase hit areas toward 44px where practical without changing the visible design unnecessarily. Exclude the intentionally visually hidden skip link from target-size counts. |
| Supporting text is small on phones | Sixteen visible paragraph elements were below 16px at the phone setting; eleven were below 16px at desktop/tablet | Make instructional body copy comfortable to read. Reserve compact text for genuine secondary metadata. |
| Headline and primary action are clear | Title and download form are visible on the first screen at the tested settings | Retain their hierarchy and keep the input action above supporting content. |
| Phone form stacks correctly | The form becomes an input row and a full-width primary action | Preserve this arrangement while checking paste/clear spacing and keyboard interaction. |

Screenshots:

- Desktop: `C:/Users/minuj/.codex/visualizations/2026/10/24/01a16d2d-b4b7-7002-a8af-843978310f37/skill-study-1440.png`
- Tablet: `C:/Users/minuj/.codex/visualizations/2026/10/24/01a16d2d-b4b7-7002-a8af-843978310f37/skill-study-768.png`
- Phone: `C:/Users/minuj/.codex/visualizations/2026/10/24/01a16d2d-b4b7-7002-a8af-843978310f37/skill-study-390.png`

These screenshots cover the first viewport, not a complete review of every page section or result state. The viewport override was reset afterwards.

## Searches and static checks

The UI/UX Pro Max query `error clarity focus management --domain ux` returned error-announcement guidance as its highest result. Apply that recommendation specifically to form errors; unrelated search results are not justification for other changes.

The Next.js query `responsive image layout accessibility --stack nextjs` returned image sizing and layout-reservation guidance. The dataset marks these entries for Next.js 16.2, so preserve the general layout principle without blindly migrating this Next.js 15 implementation.

Taste's static checker ran over `public/saveframe.js`, `src/app/globals.css`, and `src/app/layout.tsx` with app conventions enabled. It reported 12 preset failures (10 violet-colour occurrences and 2 gradients) and 5 warnings (4 shadow occurrences and 1 framework colour). The violet and restrained spectrum accent are documented user-brand exceptions. Shadow occurrences need contextual review: overlays differ from resting panels, and unused utility definitions do not prove that a visible element has a shadow.

The checker does not scan the JSON-stored markup as HTML, so this is a partial source check. Its separate browser inspector was not run; the baseline measurements and screenshots came from the available browser tool. No zero-failure inspector result, complete WCAG pass, or measured performance score is claimed.

## First implementation priorities

1. Correct the tablet header breakpoint and navigation spacing while keeping the same desktop and phone navigation designs.
2. Improve body-copy readability and the hit areas of paste, clear, article, and footer actions.
3. Refine real-media results: show uncropped image inspection where appropriate, handle long creator captions and large carousels, and make selected format and actual download progress unambiguous.

After those changes, compare desktop/tablet/phone screenshots and test keyboard navigation, field errors, clipboard denial, loading cancellation, menus, FAQ, real Reel downloads, and real photo-carousel downloads. Test empty, loading, success, failure, and large-result states. Keep the backend regression checks and production build passing.

## Initial visual critique

ROUND 1 — first-viewport study only

Seen in one second: Instagram Downloader and its primary download form.

Idea: SaveFrame turns a pasted public link into a real media preview and a file the visitor can keep.

Live thing: The connected downloader form and its real result states.

Layout words by section: hero=centred title and workbench / how-to=three instructional columns on desktop, stacked on phone. Lower sections were not screenshot-reviewed in this study.

Scores: Not assigned. A whole-page score would overstate the limited screenshot coverage and the absent automated browser-inspector run.

Top three problems: tablet navigation wrapping; undersized secondary targets; small supporting phone copy. Fixes and screenshot references are recorded above.
