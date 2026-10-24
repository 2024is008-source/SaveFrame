# SaveFrame generated blog covers

Fifteen distinct generated covers illustrate the fifteen articles, matching the old warm afternoon light, beige palette, natural textures and creator-workspace photography. These are AI-generated editorial illustrations in a photographic style, not documentary photographs. The initial female-creator variant was superseded by this coordinated set. The full 15-article blog system is implemented.

The first five covers are stories, photos, reels, workflow and profile. Ten additional article-specific covers are listed with their complete prompts in `unique-cover-prompts.json`. Website assets are `public/images/blog/<cover-name>-{480,960,1200}.webp`. All fifteen use landscape 4:3 crops, WebP quality 82, effort 6, stripped metadata, responsive sizes and descriptive alternative text. The homepage uses responsive WebP directly; article pages and cards use Next Image. The first five 960px files range from 41 to 135 KiB. Exact sizes are in `image-optimization.json`. Every article has its own unique cover; the same article retains its cover wherever it is linked. The ten new images were generated using the built-in image tool. No CLI image-generation fallback was used.

Repeat compression from an original source with `node scripts/optimize-blog-images.cjs <cover-name> <source-path> 82`. The utility writes the three sizes; it does not change article metadata. Retain original sources to avoid recompressing WebP.

## Prompts

For Stories, Photos and Reels, the common prompt was:

Create a new original editorial photograph for SaveFrame's Instagram tutorial blog. Match the reference images' aesthetic only: warm afternoon window light, soft beige/off-white palette, light wood or travertine, natural shadows, tactile photographic grain, believable proportions, restrained depth of field, premium but candid creator-workspace photography. Landscape 4:3, no lettering, logos, watermarks, graphic overlays, fake Instagram screenshots or readable app interfaces. Keep important subjects inside the central 80 percent for responsive crops.

Stories: An adult person's hand holding a smartphone upright beside a sunlit window and a pale wooden desk. Seen naturally over their shoulder, the phone is slightly turned so only a soft indistinct reflection of coastal landscape imagery is visible, no UI or text. Another hand rests by a notebook. Emphasis on viewing short vertical stories, warm intimate photography, no floating symbols.

Photos: An elegant black classic rangefinder camera with a lens and a modern smartphone lying face down on warm pale travertine stone. A few small printed travel photographs and a linen camera strap sit nearby. Overhead diagonal composition, genuine optical detail and irregular stone texture, soft afternoon sunlight, no text. Similar tactile world to the reference camera photo but a distinctly new arrangement.

Reels: An adult male creator at a light wooden desk, casually speaking toward a vertical smartphone on a compact tabletop tripod. Camera viewpoint from beside the tripod, with the creator clearly visible in soft background focus, laptop to the right and a notebook to the left. Rear of the phone visible, screen hidden; he records with the phone's front selfie camera. Bright large window, soft natural grain, candid realistic body language. This is a new composition in the same world as the reference creator image.

For Workflow and Profile, the common prompt was:

New original photorealistic editorial cover for SaveFrame's tutorial blog. Match only the references' old photographic style: warm natural afternoon side-window light, beige and light wood palette, crisp believable physical textures, gentle grain, restrained depth of field, candid real-world arrangement. Landscape 4:3 with main subjects safely inside crop. No typography, logos, watermarks, UI overlays, screenshots or plastic CGI rendering.

Workflow: A tidy light oak creator desk with an open unbranded laptop seen from a three-quarter angle, a small external SSD connected by one plausible USB cable, studio headphones, a camera memory-card case and a paper notebook. Screen is softly reflective neutral with no readable content. Composition communicates organizing and backing up media.

Profile: A photographer's hands arranging a small printed portrait photograph of an adult woman beside a face-down unbranded smartphone and a compact camera on pale travertine. The portrait is an ordinary friendly head-and-shoulders portrait with a plain background. Composition communicates choosing a profile photograph, with no social-media interface or text.

Style references were the three original embedded blog images extracted to `.runtime/blog-original-{0,1,2}.jpg`. Original generated PNG paths and output sizes are recorded in `image-optimization.json`.
