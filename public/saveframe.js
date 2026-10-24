
    window.initializeSaveFrame = function () {
      // The public interface resolves and downloads media through local API routes.
      window.INSTA_DOWNLOADER_API_ENDPOINT = '/api/media/resolve';
      let resolvedMedia = null;
      let resolveController = null;

      // Escape API text before inserting it into the reference's HTML templates.
      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      }

      function previewUrl(value) {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.href) : '';
        } catch { return ''; }
      }

      function liveQualities(item) {
        return item.formats.map(format => ({
          id: format.formatId,
          label: escapeHtml(formatLabel(format.label)),
          dimensions: escapeHtml(t(format.resolution)),
          format: escapeHtml(format.Container || format.ext),
          size: escapeHtml(t(format.filesizeFormatted || 'Size unavailable')),
        }));
      }

      function formatLabel(label) {
        return t(label).replace(/^Original(?= \()/, t('Original')).replace(/source resolution/g, t('Source resolution')).replace(/^Image variant (\d+)$/, (_, index) => t('Image variant {index}', { index }));
      }

      function currentConfig() {
        const config = TOOL_CONFIG[state.activeTab];
        if (!resolvedMedia) return config;
        const item = resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0];
        return {
          ...config,
          shortcode: escapeHtml(resolvedMedia.shortcode),
          author: escapeHtml('@' + resolvedMedia.uploader.username),
          caption: escapeHtml(resolvedMedia.caption || resolvedMedia.title),
          mediaTypeBadge: escapeHtml(t(resolvedMedia.category) + ' · ' + t(item.mediaType)),
          aspectRatio: escapeHtml(item.aspectRatio),
          qualities: liveQualities(item),
        };
      }

      function clearLiveResult() {
        resolveController?.abort();
        resolveController = null;
        resolvedMedia = null;
        state.activeCarouselIdx = 0;
        state.selectedQualityIdx = 0;
        state.loupeZoom = false;
        loadingPanel.classList.add('hidden');
        document.getElementById('submit-download-btn').disabled = false;
      }


      const localeData = JSON.parse(document.getElementById('home-i18n')?.textContent || '{}');
      const dictionary = localeData.dictionary || {};
      function t(key, values = {}) {
        return (dictionary[key] || key).replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
      }
      const errorMessages = {
        INVALID_URL: 'This link is not supported. Check the Instagram URL and try again.',
        UNSUPPORTED_DOMAIN: 'This link is not supported. Check the Instagram URL and try again.',
        SSRF_BLOCKED: 'This link is not supported. Check the Instagram URL and try again.',
        UNSUPPORTED_MEDIA_TYPE: 'This link is not supported. Check the Instagram URL and try again.',
        UNSUPPORTED_OPERATION: 'This link is not supported. Check the Instagram URL and try again.',
        PRIVATE_CONTENT: 'This media is private or requires a login.', LOGIN_REQUIRED: 'This media is private or requires a login.',
        DELETED_CONTENT: 'This media has been deleted or is unavailable.', EXPIRED_STORY: 'This story has expired or is no longer available.',
        RATE_LIMITED: 'Instagram is limiting requests. Please wait and try again.',
        EXTRACTOR_FAILURE: 'The media service is unavailable. Please try again later.', YTDLP_NOT_INSTALLED: 'The media service is unavailable. Please try again later.',
        DOWNLOAD_TIMEOUT: 'Download preparation timed out. Please try again.', FILE_TOO_LARGE: 'This file is too large to download.',
        FFMPEG_ERROR: 'The server could not prepare the video and audio.', INSUFFICIENT_DISK_SPACE: 'The server does not have enough storage. Please try again later.',
        JOB_NOT_FOUND: 'This download could not be found. Start a new download.', JOB_CANCELLED: 'Download cancelled.', JOB_NOT_READY: 'Your download is still being prepared.'
      };
      const apiError = (error, fallback) => t(errorMessages[error?.code] || fallback);
      const localError = (error, fallback) => {
        if (error instanceof TypeError) return t('Network error. Check your connection and try again.');
        if (dictionary[error?.message]) return t(error.message);
        if (Object.values(dictionary).includes(error?.message)) return error.message;
        return t(fallback);
      };
      function translateResult() {
        const walker = document.createTreeWalker(resultDynamicContent, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('[data-user-content]')) continue;
          const source = node.textContent.trim();
          if (dictionary[source]) node.textContent = node.textContent.replace(source, dictionary[source]);
        }
        resultDynamicContent.querySelectorAll('[aria-label]').forEach(el => el.setAttribute('aria-label', t(el.getAttribute('aria-label'))));
      }

      // Tool configuration per tab
      const TOOL_CONFIG = {
        photo: {
          id: 'photo',
          route: '/photo-downloader',
          heroHeading: t("Instagram Photo Downloader"),
          heroDescription: t("Save supported public Instagram photos and multi-slide carousel images with a link."),
          panelTitle: t("Instagram Photo & Carousel Downloader"),
          panelSubtitle: t("Paste a public Instagram photo link (/p/...) to inspect dimensions and save original JPEG images."),
          placeholder: t("Paste an Instagram photo or carousel link"),
          ctaLabel: t("Download Photo"),
          label: t("Photo")
        },
        reels: {
          id: 'reels',
          route: '/reels-downloader',
          heroHeading: t("Instagram Reels Downloader"),
          heroDescription: t("Save supported public Instagram Reels in vertical MP4 format with a simple link."),
          panelTitle: t("Instagram Reels Video Downloader"),
          panelSubtitle: t("Paste a public Instagram Reel link (/reel/...) to preview video streams and audio tracks."),
          placeholder: t("Paste an Instagram Reel link"),
          ctaLabel: t("Download Reel"),
          label: t("Reels")
        },
        video: {
          id: 'video',
          route: '/video-downloader',
          heroHeading: t("Instagram Video Downloader"),
          heroDescription: t("Save supported public Instagram feed videos and MP4 streams directly in your browser."),
          panelTitle: t("Instagram Feed Video Downloader"),
          panelSubtitle: t("Paste a public Instagram video link (/p/... or /tv/...) to inspect MP4 stream quality."),
          placeholder: t("Paste an Instagram video link"),
          ctaLabel: t("Download Video"),
          label: t("Video")
        },
        story: {
          id: 'story',
          route: '/story-downloader',
          heroHeading: t("Instagram Story Downloader"),
          heroDescription: t("Preview and save active public 24-hour Instagram stories with a link."),
          panelTitle: t("Instagram Public Story Downloader"),
          panelSubtitle: t("Enter a public Instagram story link (/stories/username/...) published within the last 24 hours."),
          placeholder: t("Paste a public Instagram story link"),
          ctaLabel: t("View Story"),
          label: t("Story")
        },
        profile: {
          id: 'profile',
          route: '/profile-viewer',
          heroHeading: t("Instagram Profile Viewer"),
          heroDescription: t("View supported public Instagram profile information, bio, and profile picture."),
          panelTitle: t("Instagram Public Profile Viewer"),
          panelSubtitle: t("Enter a public Instagram username (@username) or profile URL to inspect public profile metadata."),
          placeholder: t("Paste a public profile link or @username"),
          ctaLabel: t("View Profile"),
          label: t("Profile")
        }
      };

      // Application State
      let state = {
        activeTab: 'photo',
        dedicatedRouteActive: false, // false = homepage "Instagram Downloader" heading; true = dedicated tool heading
        uiStateMode: 'single',       // Real single-item or carousel result
        selectedQualityIdx: 0,
        activeCarouselIdx: 0,
        loupeZoom: false,
        lang: localeData.locale || 'en',
        loadingTimer: null
      };

      // DOM Elements
      const heroHeading = document.getElementById('hero-heading');
      const heroDescription = document.getElementById('hero-description');
      const panelTitle = document.getElementById('panel-tool-title');
      const panelSubtitle = document.getElementById('panel-tool-subtitle');
      const urlInput = document.getElementById('instagram-url-input');
      const clearBtn = document.getElementById('clear-url-btn');
      const pasteBtn = document.getElementById('paste-url-btn');
      const submitBtnLabel = document.getElementById('submit-btn-label');
      const validationBanner = document.getElementById('validation-feedback');
      const validationMsg = document.getElementById('validation-message');
      const validationActionBtn = document.getElementById('validation-action-btn');
      const loadingPanel = document.getElementById('loading-state-panel');
      const cancelLoadingBtn = document.getElementById('cancel-loading-btn');
      const resultDynamicContent = document.getElementById('result-dynamic-content');
      const downloaderPanel = document.getElementById('downloader-panel');
      const toastBanner = document.getElementById('toast-banner');
      const toastText = document.getElementById('toast-text');

      let toastTimeout = null;
      function showToast(message) {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastText.textContent = t(message);
        toastBanner.classList.remove('hidden');
        toastTimeout = setTimeout(() => {
          toastBanner.classList.add('hidden');
        }, 3200);
      }

      // Update Clear button visibility
      function syncInputControls() {
        const hasVal = urlInput.value.trim().length > 0;
        if (hasVal) {
          clearBtn.classList.remove('hidden');
          clearBtn.classList.add('inline-flex');
        } else {
          clearBtn.classList.add('hidden');
          clearBtn.classList.remove('inline-flex');
        }
        // Longer translations need room beside the existing inline controls.
        const controlsWidth = clearBtn.parentElement?.getBoundingClientRect().width || 0;
        urlInput.style.paddingRight = Math.max(140, Math.ceil(controlsWidth) + 12) + 'px';
      }

      // Parse Instagram URL or username
      function parseInstagramInput(raw) {
        const val = (raw || '').trim();
        if (!val) {
          return { valid: false, reason: 'empty', message: 'Please paste an Instagram link or @username above to continue.' };
        }
        // Check if @username for profile tab
        if (/^@?[a-zA-Z0-9._]{2,30}$/.test(val) && !val.includes('/')) {
          return {
            valid: true,
            detectedTab: 'profile',
            shortcode: val.replace(/^@/, ''),
            canonicalUrl: 'https://www.instagram.com/' + val.replace(/^@/, '') + '/'
          };
        }
        // Check URL
        let parsedUrl;
        try {
          parsedUrl = new URL(val.startsWith('http') ? val : 'https://' + val);
        } catch (e) {
          return { valid: false, reason: 'malformed', message: 'That does not look like a valid Instagram link. Copy the link directly from Instagram and try again.' };
        }
        const host = parsedUrl.hostname.toLowerCase();
        if (!['instagram.com', 'instagr.am'].some(domain => host === domain || host.endsWith('.' + domain))) {
          return {
            valid: false,
            reason: 'domain',
            message: 'Only instagram.com or instagr.am links are supported. Please copy a link directly from Instagram.'
          };
        }

        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathParts.length === 0) {
          return { valid: false, reason: 'root', message: 'This link points to the Instagram homepage. Paste a specific photo, Reel, video, story, or profile URL.' };
        }

        const first = pathParts[0].toLowerCase();
        if (first === 'p') {
          return { valid: true, detectedTab: 'photo', shortcode: pathParts[1] || 'post_id', canonicalUrl: parsedUrl.href };
        }
        if (first === 'reel' || first === 'reels') {
          return { valid: true, detectedTab: 'reels', shortcode: pathParts[1] || 'reel_id', canonicalUrl: parsedUrl.href };
        }
        if (first === 'tv') {
          return { valid: true, detectedTab: 'video', shortcode: pathParts[1] || 'video_id', canonicalUrl: parsedUrl.href };
        }
        if (first === 'stories') {
          return { valid: true, detectedTab: 'story', shortcode: pathParts[2] || pathParts[1] || 'story_id', canonicalUrl: parsedUrl.href };
        }
        // Otherwise treat single path segment as profile username
        return { valid: true, detectedTab: 'profile', shortcode: pathParts[0], canonicalUrl: parsedUrl.href };
      }

      // Show or hide inline validation banner
      function setValidationBanner(type, message, actionLabel, onAction) {
        if (!type) {
          validationBanner.classList.add('hidden');
          return;
        }
        validationBanner.classList.remove('hidden', 'bg-red-50', 'border-red-200', 'text-red-800', 'bg-amber-50', 'border-amber-200', 'text-amber-900', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
        if (type === 'error') {
          validationBanner.classList.add('bg-red-50', 'border-red-200', 'text-red-800');
        } else if (type === 'warning') {
          validationBanner.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-900');
        } else {
          validationBanner.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
        }
        validationMsg.textContent = t(message);
        if (actionLabel && typeof onAction === 'function') {
          validationActionBtn.textContent = actionLabel;
          validationActionBtn.classList.remove('hidden');
          validationActionBtn.onclick = onAction;
        } else {
          validationActionBtn.classList.add('hidden');
          validationActionBtn.onclick = null;
        }
      }

      // Render Active Tab & Header / Hero Text
      function renderToolState() {
        const cfg = TOOL_CONFIG[state.activeTab];

        // Hero Heading: On main homepage view keep "Instagram Downloader" unless user switched tabs or chose a dedicated tool page
        if (state.dedicatedRouteActive) {
          heroHeading.textContent = cfg.heroHeading;
          heroDescription.textContent = cfg.heroDescription;
        } else {
          heroHeading.textContent = t('Instagram Downloader');
          heroDescription.textContent = t('Save supported Instagram photos, videos, and Reels with a simple link.');
        }

        panelTitle.textContent = cfg.panelTitle;
        panelSubtitle.textContent = cfg.panelSubtitle;
        urlInput.placeholder = cfg.placeholder;
        submitBtnLabel.textContent = cfg.ctaLabel;
        downloaderPanel.setAttribute('aria-labelledby', 'tab-' + state.activeTab);

        // Update 5 Media Tool Tabs visual & ARIA state
        document.querySelectorAll('.media-tab-btn').forEach((btn) => {
          const tabId = btn.getAttribute('data-tab');
          const active = tabId === state.activeTab;
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
          if (active) {
            btn.className = 'media-tab-btn min-h-[52px] sm:min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm font-semibold cursor-pointer ui-transition bg-white text-brand-violet border border-line';
          } else {
            btn.className = 'media-tab-btn min-h-[52px] sm:min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium cursor-pointer ui-transition text-ink-muted hover:text-ink border border-transparent';
          }
        });

        renderResultSection();
      }

      // Render the Result Section based on state.uiStateMode and state.activeTab
      function renderResultSection() {
        const cfg = currentConfig();
        const wrapper = document.getElementById('result-section-wrap');
        wrapper.classList.toggle('hidden', !resolvedMedia);
        if (!resolvedMedia) {
          resultDynamicContent.replaceChildren();
          return;
        }
        const primaryImg = previewUrl((resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0]).thumbnailUrl);

        // 3. Multi-Media Carousel State (3 items)
        if (state.uiStateMode === 'carousel') {
          const slides = resolvedMedia.items.map((item, idx) => ({
            idx, type: escapeHtml(t('{type} · Slide {index} of {count}', { type: t(item.mediaType), index: idx + 1, count: resolvedMedia.items.length })),
            dim: escapeHtml(t(item.formats[0]?.resolution || 'Source resolution')),
            format: escapeHtml(item.formats[0]?.Container || item.formats[0]?.ext || item.mediaType),
            size: escapeHtml(t(item.formats[0]?.filesizeFormatted || 'Size unavailable')),
            img: previewUrl(item.thumbnailUrl), title: escapeHtml(item.title || t('Slide {index}', { index: idx + 1 })),
          }));
          const activeSlide = slides[state.activeCarouselIdx] || slides[0];

          resultDynamicContent.innerHTML = `
            <div class="bg-white border border-line rounded-xl p-4 sm:p-5">
              <div class="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-line">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 rounded-md bg-brand-violetSoft text-brand-violet text-xs font-semibold">
                    ${escapeHtml(t('Carousel Post · {count} Media Items', { count: slides.length }))}
                  </span>
                  <span class="text-xs text-ink-muted font-medium tabular-nums">${cfg.author}</span>
                </div>
                <span class="text-xs text-ink-muted tabular-nums">Shortcode: <strong class="text-ink">${cfg.shortcode}</strong></span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                <!-- Active Slide Thumbnail Preview -->
                <div class="md:col-span-5">
                  <div class="relative rounded-xl overflow-hidden border border-line bg-soft aspect-[4/3]">
                    <img src="${activeSlide.img}" alt="${activeSlide.title}" class="w-full h-full object-cover" />
                    <div class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-ink/80 text-white text-[11px] font-semibold tabular-nums">
                      ${activeSlide.type}
                    </div>
                  </div>
                  <!-- Carousel Thumbnails Switcher -->
                  <div class="grid grid-cols-3 gap-2 mt-2.5" role="group" aria-label="Carousel slide selector">
                    ${slides.map((s) => `
                      <button
                        type="button"
                        data-carousel-idx="${s.idx}"
                        class="carousel-slide-btn p-1.5 rounded-lg border ${s.idx === state.activeCarouselIdx ? 'border-brand-violet bg-brand-violetSoft/50' : 'border-line bg-soft/60 hover:bg-soft'} text-left cursor-pointer ui-transition flex items-center gap-2"
                      >
                        <img src="${s.img}" alt="${escapeHtml(t('Slide {index}', { index: s.idx + 1 }))}" class="w-9 h-9 rounded object-cover shrink-0" />
                        <div class="min-w-0">
                          <span class="block text-[11px] font-semibold text-ink truncate">${escapeHtml(t('Slide {index}', { index: s.idx + 1 }))}</span>
                          <span class="block text-[10px] text-ink-muted tabular-nums">${s.format.split(' ')[0]}</span>
                        </div>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <!-- Slide Quality & Download Options -->
                <div class="md:col-span-7 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 data-user-content class="font-display font-bold text-base sm:text-lg text-ink">${activeSlide.title}</h3>
                    <p class="text-xs sm:text-sm text-ink-muted mt-1">
                      Select an individual carousel slide on the left or download any item below in its source resolution.
                    </p>
                  </div>

                  <div class="space-y-2">
                    ${slides.map((s) => `
                      <div class="p-3 rounded-xl border ${s.idx === state.activeCarouselIdx ? 'border-brand-violet bg-brand-violetSoft/25' : 'border-line bg-soft/40'} flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-3">
                          <span class="w-7 h-7 rounded-lg bg-white border border-line text-xs font-bold text-ink flex items-center justify-center tabular-nums">#${s.idx + 1}</span>
                          <div>
                            <span data-user-content class="block text-xs sm:text-sm font-semibold text-ink">${s.title}</span>
                            <span class="block text-xs text-ink-muted tabular-nums">${s.dim} · ${s.format} · ${s.size}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          data-dl-title="${s.title}"
                          data-dl-dim="${s.dim}"
                          data-item-index="${s.idx}"
                          class="trigger-download-btn min-h-[38px] px-3.5 py-1.5 rounded-lg ${s.idx === state.activeCarouselIdx ? 'bg-brand-violet text-white hover:bg-brand-violetHover' : 'bg-white border border-line text-ink hover:bg-soft'} text-xs font-semibold cursor-pointer ui-transition inline-flex items-center gap-1.5"
                        >
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          <span>${escapeHtml(t('Save Slide {index}', { index: s.idx + 1 }))}</span>
                        </button>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          `;

          document.querySelectorAll('.carousel-slide-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              state.activeCarouselIdx = parseInt(btn.getAttribute('data-carousel-idx'), 10) || 0;
              renderResultSection();
            });
          });
          translateResult();
          attachDownloadTriggers();
          return;
        }

        // 4. Default: Single Media / Profile Result with Interactive Quality & Frame Loupe Inspector
        const qualities = cfg.qualities;
        const selectedQ = qualities[state.selectedQualityIdx] || qualities[0];

        resultDynamicContent.innerHTML = `
          <div class="bg-white border border-line rounded-xl p-4 sm:p-5">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              
              <!-- Left Column: Media Thumbnail Preview + Optical Loupe Toggle -->
              <div class="md:col-span-5">
                <div id="media-preview-frame" class="relative rounded-xl overflow-hidden border border-line bg-soft aspect-[4/3] ${state.loupeZoom ? 'loupe-active' : ''}">
                  <img
                    src="${primaryImg}"
                    alt="${escapeHtml(t('Preview for {author}', { author: resolvedMedia.uploader.username }))}"
                    class="w-full h-full object-cover ui-transition"
                  />
                  <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span class="px-2.5 py-1 rounded-md bg-ink/80 text-white text-[11px] font-semibold">
                      ${cfg.mediaTypeBadge}
                    </span>
                  </div>
                  <button
                    type="button"
                    id="toggle-loupe-btn"
                    class="absolute bottom-2.5 right-2.5 min-h-[34px] px-2.5 py-1 rounded-lg bg-white/95 hover:bg-white text-ink border border-line text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <svg class="w-3.5 h-3.5 text-brand-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
                    <span>${escapeHtml(t(state.loupeZoom ? 'Reset Crop (1×)' : 'Inspect Detail (1.65×)'))}</span>
                  </button>
                </div>

                <div class="mt-2.5 flex items-center justify-between text-xs text-ink-muted px-0.5 tabular-nums">
                  <span>Aspect: <strong class="text-ink">${cfg.aspectRatio}</strong></span>
                  <span>Shortcode: <strong class="text-ink">${cfg.shortcode}</strong></span>
                </div>
              </div>

              <!-- Right Column: Metadata, Quality Selector, & Download CTA -->
              <div class="md:col-span-7 flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-brand-violet">${cfg.author}</span>
                    <span class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">Public Stream Verified</span>
                  </div>
                  <p data-user-content class="text-xs sm:text-sm text-ink-secondary mt-1.5 line-clamp-2 leading-relaxed">
                    ${cfg.caption}
                  </p>
                </div>

                <!-- Quality Selection Matrix -->
                <div>
                  <label class="block text-xs font-semibold text-ink-secondary mb-2">
                    Available Quality &amp; Format Options (Select to inspect):
                  </label>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Select media quality">
                    ${qualities.map((q, idx) => `
                      <button
                        type="button"
                        role="radio"
                        aria-checked="${idx === state.selectedQualityIdx ? 'true' : 'false'}"
                        data-quality-idx="${idx}"
                        class="quality-option-btn p-2.5 rounded-xl border text-left cursor-pointer ui-transition ${idx === state.selectedQualityIdx ? 'border-brand-violet bg-brand-violetSoft/35' : 'border-line bg-soft/50 hover:bg-soft'}"
                      >
                        <div class="flex items-center justify-between gap-1">
                          <span class="text-xs font-bold text-ink">${q.label}</span>
                          <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-line text-ink-secondary tabular-nums">${q.format.split(' ')[0]}</span>
                        </div>
                        <span class="block text-[11px] text-ink-muted mt-1 tabular-nums">${q.dimensions}</span>
                        <span class="block text-[11px] font-medium text-brand-violet mt-0.5 tabular-nums">${q.size}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <!-- Action Row -->
                <div class="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <button
                    type="button"
                    data-dl-title="${cfg.shortcode}_${selectedQ.label}"
                    data-dl-dim="${selectedQ.dimensions}"
                    class="trigger-download-btn flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-brand-violet hover:bg-brand-violetHover text-white font-display font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ui-transition"
                  >
                    <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    <span>${escapeHtml(t('Download {label} ({size})', { label: formatLabel((resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0]).formats[state.selectedQualityIdx]?.label || ''), size: t((resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0]).formats[state.selectedQualityIdx]?.filesizeFormatted || 'Size unavailable') }))}</span>
                  </button>

                </div>
              </div>

            </div>
          </div>
        `;

        translateResult();
        // Attach Loupe toggle
        const loupeBtn = document.getElementById('toggle-loupe-btn');
        if (loupeBtn) {
          loupeBtn.addEventListener('click', () => {
            state.loupeZoom = !state.loupeZoom;
            renderResultSection();
          });
        }

        // Attach Quality selector buttons
        document.querySelectorAll('.quality-option-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.selectedQualityIdx = parseInt(btn.getAttribute('data-quality-idx'), 10) || 0;
            renderResultSection();
          });
        });

        attachDownloadTriggers();
      }

      function attachDownloadTriggers() {
        document.querySelectorAll('.trigger-download-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (resolvedMedia) {
              const media = resolvedMedia;
              const index = Number(btn.getAttribute('data-item-index') ?? state.activeCarouselIdx);
              const item = media.items[index];
              const format = item.formats[btn.hasAttribute('data-item-index') ? 0 : state.selectedQualityIdx] || item.formats[0];
              btn.disabled = true;
              const originalLabel = btn.querySelector('span')?.textContent;
              const label = btn.querySelector('span');
              if (label) label.textContent = t('Preparing download…');
              try {
                const response = await fetch('/api/media/download', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: media.canonicalUrl, formatId: format.formatId, itemIndex: item.index }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(apiError(payload.error, 'Unable to start download.'));
                showToast('Preparing your download…');
                const deadline = Date.now() + 180000;
                while (Date.now() < deadline) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const statusResponse = await fetch('/api/media/jobs/' + encodeURIComponent(payload.jobId));
                  const statusPayload = await statusResponse.json();
                  if (!statusResponse.ok) throw new Error(apiError(statusPayload.error, 'Unable to check download.'));
                  const job = statusPayload.job;
                  if (label) label.textContent = t('Preparing download… {progress}%', { progress: Math.round(job.progress || 0) });
                  if (job.status === 'completed') {
                    const link = document.createElement('a');
                    link.href = '/api/media/download/' + encodeURIComponent(payload.jobId);
                    link.download = job.safeFilename || '';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    showToast('Your download is ready');
                    return;
                  }
                  if (job.status === 'failed' || job.status === 'cancelled') throw new Error(apiError(job.error, 'Download cancelled.'));
                }
                throw new Error('Download preparation timed out. Please try again.');
              } catch (error) {
                setValidationBanner('error', localError(error, 'Unable to download media.'));
              } finally {
                btn.disabled = false;
                if (label) label.textContent = originalLabel;
              }
              return;
            }

          });
        });
      }

      // Switch Tab handler
      function selectTab(tabId, fromRouteMenu) {
        if (!TOOL_CONFIG[tabId]) return;
        clearLiveResult();
        state.activeTab = tabId;
        state.selectedQualityIdx = 0;
        state.loupeZoom = false;
        if (fromRouteMenu) {
          state.dedicatedRouteActive = true;
        }
        setValidationBanner(null);
        renderToolState();
      }

      // Attach 5 Tab Listeners + Keyboard Arrow Navigation
      const tabButtons = Array.from(document.querySelectorAll('.media-tab-btn'));
      tabButtons.forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          state.dedicatedRouteActive = true;
          selectTab(btn.getAttribute('data-tab'), true);
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const dir = (e.key === 'ArrowRight' ? 1 : -1) * (localeData.locale === 'ar' ? -1 : 1);
            const nextIdx = (idx + dir + tabButtons.length) % tabButtons.length;
            tabButtons[nextIdx].focus();
            state.dedicatedRouteActive = true;
            selectTab(tabButtons[nextIdx].getAttribute('data-tab'), true);
          }
        });
      });

      // Brand Home Reset
      document.getElementById('brand-home-btn').addEventListener('click', () => {
        state.dedicatedRouteActive = false;
        clearLiveResult();
        state.activeTab = 'photo';
        state.uiStateMode = 'single';
        urlInput.value = '';
        syncInputControls();
        setValidationBanner(null);
        renderToolState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      // Input typing listener
      urlInput.addEventListener('input', () => {
        clearLiveResult();
        renderResultSection();
        syncInputControls();
        setValidationBanner(null);
      });

      // Clear Button
      clearBtn.addEventListener('click', () => {
        clearLiveResult();
        renderResultSection();
        urlInput.value = '';
        syncInputControls();
        setValidationBanner(null);
        urlInput.focus();
      });

      // Paste Button
      pasteBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const clip = await navigator.clipboard.readText();
            if (clip && clip.trim()) {
              clearLiveResult();
              renderResultSection();
              urlInput.value = clip.trim();
              syncInputControls();
              showToast('Pasted link from clipboard');
              return;
            }
          }
        } catch {}
        urlInput.focus();
        setValidationBanner('warning', 'Clipboard access is unavailable. Paste your Instagram link into the field.');
      });

      // Form Submit Handler
      document.getElementById('downloader-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const parsed = parseInstagramInput(urlInput.value);
        if (!parsed.valid) {
          setValidationBanner('error', parsed.message);
          urlInput.focus();
          return;
        }

        // Check if detected tab differs from active tab
        if (parsed.detectedTab && parsed.detectedTab !== state.activeTab) {
          const targetTab = parsed.detectedTab;
          setValidationBanner(
            'warning',
            t('Detected a {label} link ({shortcode}). Switched to the {label} tab automatically.', { label: TOOL_CONFIG[targetTab].label, shortcode: parsed.shortcode })
          );
          state.activeTab = targetTab;
          state.dedicatedRouteActive = true;
        } else {
          setValidationBanner(null);
        }

        clearLiveResult();
        const controller = new AbortController();
        resolveController = controller;
        renderToolState();
        resultDynamicContent.innerHTML = '';
        loadingPanel.classList.remove('hidden');
        document.getElementById('submit-download-btn').disabled = true;
        document.getElementById('loading-step-detail').textContent = t('Fetching available media and formats…');
        try {
          const response = await fetch(window.INSTA_DOWNLOADER_API_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: parsed.canonicalUrl }), signal: controller.signal,
          });
          const payload = await response.json();
          if (!response.ok || payload.status !== 'ok') throw new Error(apiError(payload.error, 'Unable to inspect this link.'));
          if (controller.signal.aborted) return;
          if (!payload.data?.items?.length || payload.data.items.some(item => !item.formats?.length)) throw new Error('No downloadable media was found for this link.');
          resolvedMedia = payload.data;
          const category = resolvedMedia.category;
          state.activeTab = category === 'reel' ? 'reels' : category === 'carousel' ? 'photo' : category;
          state.uiStateMode = resolvedMedia.isCarousel ? 'carousel' : 'single';
          renderToolState();
          setValidationBanner('success', 'Public media found. Select a format to download.');
        } catch (error) {
          if (controller.signal.aborted) return;
          resultDynamicContent.innerHTML = '';
          setValidationBanner('error', localError(error, 'Unable to inspect this link.'));
        } finally {
          if (resolveController === controller) {
            loadingPanel.classList.add('hidden');
            resolveController = null;
            document.getElementById('submit-download-btn').disabled = false;
          }
        }
      });

      cancelLoadingBtn.addEventListener('click', () => {
        clearLiveResult();
        renderToolState();
        loadingPanel.classList.add('hidden');
        showToast('Cancelled inspection request');
      });

      // Header Dropdowns (Desktop)
      const dlBtn = document.getElementById('nav-downloader-btn');
      const dlMenu = document.getElementById('nav-downloader-menu');
      const vwBtn = document.getElementById('nav-viewer-btn');
      const vwMenu = document.getElementById('nav-viewer-menu');

      function closeAllDropdowns() {
        dlMenu.classList.add('hidden');
        dlBtn.setAttribute('aria-expanded', 'false');
        vwMenu.classList.add('hidden');
        vwBtn.setAttribute('aria-expanded', 'false');
      }

      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dlMenu.classList.contains('hidden');
        closeAllDropdowns();
        if (!isOpen) {
          dlMenu.classList.remove('hidden');
          dlBtn.setAttribute('aria-expanded', 'true');
        }
      });

      vwBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !vwMenu.classList.contains('hidden');
        closeAllDropdowns();
        if (!isOpen) {
          vwMenu.classList.remove('hidden');
          vwBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', () => {
        closeAllDropdowns();
      });

      // Route-tab links in Header, Mobile Drawer, and Footer
      document.querySelectorAll('[data-route-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabId = btn.getAttribute('data-route-tab');
          closeAllDropdowns();
          closeMobileMenu();
          selectTab(tabId, true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      document.getElementById('nav-carousel-inspector-btn').addEventListener('click', () => {
        closeAllDropdowns();
        selectTab('photo', true);
        urlInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      // Mobile Navigation Drawer
      const mobileMenuBtn = document.getElementById('mobile-menu-btn');
      const mobileDrawer = document.getElementById('mobile-nav-drawer');
      const iconOpen = document.getElementById('mobile-menu-icon-open');
      const iconClose = document.getElementById('mobile-menu-icon-close');

      function closeMobileMenu() {
        mobileDrawer.classList.add('hidden');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        iconOpen.classList.remove('hidden');
        iconClose.classList.add('hidden');
      }

      mobileMenuBtn.addEventListener('click', () => {
        const isHidden = mobileDrawer.classList.contains('hidden');
        if (isHidden) {
          mobileDrawer.classList.remove('hidden');
          mobileMenuBtn.setAttribute('aria-expanded', 'true');
          iconOpen.classList.add('hidden');
          iconClose.classList.remove('hidden');
        } else {
          closeMobileMenu();
        }
      });

      document.querySelectorAll('.mobile-nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          closeMobileMenu();
        });
      });

      // Language changes use normal navigation so direct URLs and browser history agree.
      document.getElementById('language-select').addEventListener('change', event => {
        const locale = event.target.value;
        if (!['en', 'es', 'pt-br', 'de', 'fr', 'ja', 'id', 'tr', 'hi', 'ar'].includes(locale)) return;
        const destination = new URL(locale === 'en' ? '/' : '/' + locale + '/', window.location.origin);
        if (state.dedicatedRouteActive) destination.searchParams.set('tool', state.activeTab);
        window.location.assign(destination.href);
      });

      // FAQ Accordions
      document.querySelectorAll('.faq-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          const panelId = btn.getAttribute('aria-controls');
          const panel = document.getElementById(panelId);
          const chevron = btn.querySelector('.faq-chevron');

          btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          if (expanded) {
            panel.classList.add('hidden');
            chevron.classList.remove('rotate-180', 'text-brand-violet');
            chevron.classList.add('text-ink-muted');
          } else {
            panel.classList.remove('hidden');
            chevron.classList.add('rotate-180', 'text-brand-violet');
            chevron.classList.remove('text-ink-muted');
          }
        });
      });

      // Article reader and legal information dialogs.
      const modalBackdrop = document.getElementById('info-modal-backdrop');
      const modalTitle = document.getElementById('info-modal-title');
      const modalBody = document.getElementById('info-modal-body');

      const MODAL_CONTENT = {
        'privacy': {
          title: 'Privacy Policy',
          html: `
            <p>SaveFrame processes pasted public links solely to inspect media metadata requested by the user in real time.</p>
            <ul class="list-disc list-inside space-y-1.5">
              <li>No account registration or Instagram login credentials are requested or stored.</li>
              <li>Submitted public links are not sold or shared with third-party advertisers.</li>
              <li>Private accounts and non-public media are strictly excluded from processing.</li>
            </ul>
          `
        },
        'terms': {
          title: 'Terms of Service & Fair Use',
          html: `
            <p>SaveFrame is provided as an independent web interface for inspecting and backing up publicly available media that you own or have explicit permission from the copyright holder to download.</p>
            <ul class="list-disc list-inside space-y-1.5">
              <li>Users are solely responsible for complying with applicable copyright laws and Instagram's Terms of Use.</li>
              <li>Do not use this tool to redistribute creators' work without authorization.</li>
            </ul>
          `
        },
        'contact': {
          title: 'Contact Support & Takedown Requests',
          html: `
            <p>Need help integrating the SaveFrame UI with your backend endpoint or submitting a copyright inquiry?</p>
            <div class="p-4 rounded-xl bg-soft border border-line space-y-1.5 text-xs sm:text-sm">
              <p><strong>Support Email:</strong> support@saveframe.app</p>
              <p><strong>Copyright &amp; Removal Requests:</strong> legal@saveframe.app</p>
              <p><strong>Response Window:</strong> Within 1 business day</p>
            </div>
          `
        }
      };

      function openModal(key) {
        const item = MODAL_CONTENT[key];
        if (!item) return;
        modalTitle.textContent = item.title;
        modalBody.innerHTML = item.html;
        modalBackdrop.classList.remove('hidden');
      }

      function closeModal() {
        modalBackdrop.classList.add('hidden');
      }

      document.querySelectorAll('.open-legal-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          openModal(btn.getAttribute('data-modal-target'));
        });
      });

      document.getElementById('close-modal-btn').addEventListener('click', closeModal);
      document.getElementById('modal-done-btn').addEventListener('click', closeModal);
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });

      // Escape key closes modals & dropdowns
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeAllDropdowns();
          closeMobileMenu();
          closeModal();
        }
      });

      // Initial render
      syncInputControls();
      renderToolState();
      const initialQuery = new URLSearchParams(window.location.search);
      const initialTool = initialQuery.get('tool');
      if (initialTool && TOOL_CONFIG[initialTool]) selectTab(initialTool, true);
      const initialInfo = initialQuery.get('info');
      if (initialInfo && ['privacy', 'terms', 'contact'].includes(initialInfo)) openModal(initialInfo);
    };
  
