
    window.initializeSaveFrame = function () {
      const initializedForm = document.getElementById('downloader-form');
      if (initializedForm?.getAttribute('data-saveframe-initialized') === 'true') return;
      // The public interface resolves and downloads media through local API routes.
      window.INSTA_DOWNLOADER_API_ENDPOINT = '/api/media/resolve';
      let resolvedMedia = null;
      let resolveController = null;
      // Keep in-flight downloads stable when a different carousel thumbnail is selected.
      const pendingDownloads = new Map();
      const preparedPreviews = new Map();
      const previewControllers = new Set();
      // Aggregate categories only. Never pass a source link, account, caption or job ID.
      function analytics(name, params) {
        window.dispatchEvent(new CustomEvent('saveframe:analytics-event', {detail:{name,params}}));
      }

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
        // Photo formats are CDN renditions of this same image, already ordered best first.
        // Keep carousel items separate; video/audio quality choices remain available.
        const formats = item.mediaType === 'photo' ? item.formats.slice(0, 1) : item.formats;
        return formats.map(format => ({
          id: format.formatId,
          label: escapeHtml(formatLabel(format.label)),
          dimensions: escapeHtml(t(format.resolution)),
          format: escapeHtml(format.Container || format.ext),
          size: escapeHtml(visibleFilesize(format)),
        }));
      }

      function formatLabel(label) {
        return t(label).replace(/^Original(?= \()/, t('Original')).replace(/source resolution/g, t('Source resolution')).replace(/^Image variant (\d+)$/, (_, index) => t('Image variant {index}', { index }));
      }

      function visibleFilesize(format) {
        const size = format?.filesizeFormatted;
        return !size || size === 'Size unavailable' || size === t('Size unavailable') ? '' : size;
      }

      function downloadButtonLabel(format) {
        const size = visibleFilesize(format);
        const label = t('Download {label} ({size})', { label: formatLabel(format?.label || ''), size });
        return size ? label : label.replace(/\s*[(（]\s*[)）]/g, '');
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
        previewControllers.forEach(controller => controller.abort());
        previewControllers.clear();
        preparedPreviews.clear();
        resolveController?.abort();
        resolveController = null;
        resolvedMedia = null;
        state.activeCarouselIdx = 0;
        state.selectedCarouselIndices.clear();
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
        NO_ACTIVE_STORIES: 'No downloadable active stories were returned for this account.',
        INVALID_STORY_LINK: 'Paste a direct Instagram story link containing /stories/username/story-id/. Profile links and bulk story downloads are not supported.',
        RATE_LIMITED: 'Instagram is limiting requests. Please wait and try again.',
        EXTRACTOR_FAILURE: 'The media service is unavailable. Please try again later.', YTDLP_NOT_INSTALLED: 'The media service is unavailable. Please try again later.',
        DOWNLOAD_TIMEOUT: 'Download preparation timed out. Please try again.', FILE_TOO_LARGE: 'This file is too large to download.',
        FFMPEG_ERROR: 'The server could not prepare the video and audio.', INSUFFICIENT_DISK_SPACE: 'The server does not have enough storage. Please try again later.',
        JOB_NOT_FOUND: 'This download could not be found. Start a new download.', JOB_CANCELLED: 'Download cancelled.', JOB_NOT_READY: 'Your download is still being prepared.'
      };
      const apiError = (error, fallback) => t(error?.code === 'LOGIN_REQUIRED' && state.activeTab === 'story'
        ? 'Instagram requires login to access this story. This downloader can only retrieve stories that Instagram makes publicly accessible.'
        : errorMessages[error?.code] || fallback);
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
        selectedCarouselIndices: new Set(),
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
      function parseInstagramInput(raw, requestedTab = state.activeTab) {
        const val = (raw || '').trim();
        if (!val) {
          return { valid: false, reason: 'empty', message: 'Please paste an Instagram link or @username above to continue.' };
        }
        // Check if @username for profile tab
        if (/^@?[a-zA-Z0-9._]{2,30}$/.test(val) && !val.includes('/')) {
          if (requestedTab === 'story') return { valid: false, message: errorMessages.INVALID_STORY_LINK };
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
        if (requestedTab === 'story' && first !== 'stories') return { valid: false, message: errorMessages.INVALID_STORY_LINK };
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
          if (pathParts.length !== 3 || pathParts[1].toLowerCase() === 'highlights' || !/^\d{5,32}$/.test(pathParts[2])) return { valid: false, message: errorMessages.INVALID_STORY_LINK };
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
        const page = localeData.pageTool;

        // Hero Heading: On main homepage view keep "Instagram Downloader" unless user switched tabs or chose a dedicated tool page
        if (state.dedicatedRouteActive) {
          heroHeading.textContent = page?.tool === state.activeTab ? page.title : cfg.heroHeading;
          heroDescription.textContent = page?.tool === state.activeTab ? page.description : cfg.heroDescription;
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
        previewControllers.forEach(controller => controller.abort());
        previewControllers.clear();
        const cfg = currentConfig();
        const wrapper = document.getElementById('result-section-wrap');
        wrapper.classList.toggle('hidden', !resolvedMedia);
        if (!resolvedMedia) {
          resultDynamicContent.replaceChildren();
          return;
        }

        // Carousel preview, compact thumbnail selector, and two download actions.
        if (state.uiStateMode === 'carousel') {
          const storyCollection = resolvedMedia.category === 'story';
          const itemName = idx => storyCollection ? t('Story') + ' ' + (idx + 1) : t('Slide {index}', { index: idx + 1 });
          const slides = resolvedMedia.items.map((item, idx) => ({
            idx, type: escapeHtml(storyCollection ? itemName(idx) + ' / ' + resolvedMedia.items.length : t('{type} · Slide {index} of {count}', { type: t(item.mediaType), index: idx + 1, count: resolvedMedia.items.length })),
            dim: escapeHtml(t(item.formats[0]?.resolution || 'Source resolution')),
            format: escapeHtml(item.formats[0]?.Container || item.formats[0]?.ext || item.mediaType),
            size: escapeHtml(visibleFilesize(item.formats[0])),
            img: previewUrl(item.thumbnailUrl), title: escapeHtml(item.title || t('Slide {index}', { index: idx + 1 })),
          }));
          const activeSlide = slides[state.activeCarouselIdx] || slides[0];

          resultDynamicContent.innerHTML = `
            <div class="bg-white border border-line rounded-xl p-4 sm:p-5">
              <div class="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-line">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 rounded-md bg-brand-violetSoft text-brand-violet text-xs font-semibold">
                    ${escapeHtml(storyCollection ? t('Story') + ' · ' + slides.length : t('Carousel Post · {count} Media Items', { count: slides.length }))}
                  </span>
                  <span class="text-xs text-ink-muted font-medium tabular-nums">${cfg.author}</span>
                </div>
                <span class="text-xs text-ink-muted tabular-nums">Shortcode: <strong class="text-ink">${cfg.shortcode}</strong></span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                <!-- Active Slide Thumbnail Preview -->
                <div class="md:col-span-5">
                  <div class="media-source-preview relative rounded-xl overflow-hidden border border-line bg-soft">
                    ${mediaPreviewMarkup(resolvedMedia.items[activeSlide.idx])}
                    <div class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-ink/80 text-white text-[11px] font-semibold tabular-nums">
                      ${activeSlide.type}
                    </div>
                  </div>

                </div>

                <!-- Slide Quality & Download Options -->
                <div class="md:col-span-7 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 data-user-content class="font-display font-bold text-base sm:text-lg text-ink">${activeSlide.title}</h3>
                    <p class="text-xs sm:text-sm text-ink-muted mt-1" aria-live="polite">
                      ${activeSlide.type} · ${activeSlide.dim} · ${activeSlide.format}${activeSlide.size ? ' · ' + activeSlide.size : ''}
                    </p>
                    <p class="text-xs sm:text-sm text-ink-muted mt-2">
                      ${escapeHtml(t(storyCollection ? 'Public media found. Select a format to download.' : 'Tick the images you want to download. Click a thumbnail to preview it, or download all slides as a ZIP.'))}
                    </p>
                  </div>

                  <div class="flex flex-col gap-2.5">
                        <button
                          type="button"
                          ${state.selectedCarouselIndices.size ? 'data-download-selected="true"' : 'data-item-index="' + activeSlide.idx + '"'}
                          class="trigger-download-btn min-h-[46px] px-5 py-2.5 rounded-xl bg-brand-violet text-white hover:bg-brand-violetHover text-sm font-semibold cursor-pointer ui-transition inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                        >
                          <svg aria-hidden="true" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          <span>${escapeHtml(state.selectedCarouselIndices.size ? t('Download selected ({count})', { count: state.selectedCarouselIndices.size }) : t('Download slide {index}', { index: activeSlide.idx + 1 }))}${state.selectedCarouselIndices.size > 1 ? ' · ZIP' : ''}</span>
                        </button>
                    ${resolvedMedia.supportsZipDownload ? `
                      <button type="button" data-download-all="true" class="trigger-download-btn min-h-[46px] px-5 py-2.5 rounded-xl bg-white border border-brand-violet text-brand-violet hover:bg-brand-violetSoft text-sm font-semibold cursor-pointer ui-transition inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
                        <svg aria-hidden="true" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v6m-2 0h4v4h-4zm2 7v2"/></svg>
                        <span>${escapeHtml(t('Download all {count} slides (ZIP)', { count: slides.length }))}</span>
                      </button>` : ''}
                  </div>
                </div>
                  <!-- Carousel Thumbnails Switcher -->
                  <div class="carousel-thumbnail-grid md:col-span-12" role="group" aria-label="Carousel slide selector">
                    ${slides.map((s) => `
                      <div class="min-w-0 rounded-lg border ${state.selectedCarouselIndices.has(s.idx) || s.idx === state.activeCarouselIdx ? 'border-brand-violet bg-brand-violetSoft/50' : 'border-line bg-soft/60'} flex items-stretch">
                      <button
                        type="button"
                        data-carousel-idx="${s.idx}"
                        aria-pressed="${s.idx === state.activeCarouselIdx}"
                        aria-label="${escapeHtml(itemName(s.idx))}"
                        class="carousel-slide-btn flex-1 min-w-0 p-1 sm:p-1.5 rounded-lg hover:bg-soft text-left cursor-pointer ui-transition flex items-center gap-1"
                      >
                        <img src="${s.img}" alt="${escapeHtml(itemName(s.idx))}" class="w-8 h-8 sm:w-9 sm:h-9 rounded object-cover shrink-0" />
                        <div class="min-w-0">
                          <span class="block text-[11px] leading-tight font-semibold text-ink">${escapeHtml(itemName(s.idx))}</span>
                          <span class="block text-[10px] text-ink-muted tabular-nums">${s.format.split(' ')[0]}</span>
                        </div>
                      </button>
                      <label class="min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center cursor-pointer">
                        <input type="checkbox" data-carousel-select="${s.idx}" aria-label="${escapeHtml(t('Select slide {index}', { index: s.idx + 1 }))}" ${state.selectedCarouselIndices.has(s.idx) ? 'checked' : ''} class="w-4 h-4 accent-brand-violet cursor-pointer" />
                      </label>
                      </div>
                    `).join('')}
                  </div>
              </div>
            </div>
          `;

          document.querySelectorAll('.carousel-slide-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              state.activeCarouselIdx = parseInt(btn.getAttribute('data-carousel-idx'), 10) || 0;
              renderResultSection();
              resultDynamicContent.querySelector('[data-carousel-idx="' + state.activeCarouselIdx + '"]')?.focus({ preventScroll: true });
            });
          });
          resultDynamicContent.querySelectorAll('[data-carousel-select]').forEach(input => {
            input.addEventListener('change', () => {
              const index = Number(input.getAttribute('data-carousel-select'));
              if (input.checked) state.selectedCarouselIndices.add(index);
              else state.selectedCarouselIndices.delete(index);
              renderResultSection();
              resultDynamicContent.querySelector('[data-carousel-select="' + index + '"]')?.focus({ preventScroll: true });
            });
          });
          translateResult();
          attachMediaPreviews();
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
                <div id="media-preview-frame" class="media-source-preview relative rounded-xl overflow-hidden border border-line bg-soft ${state.loupeZoom ? 'loupe-active' : ''}">
                  ${mediaPreviewMarkup(resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0])}
                  <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span class="px-2.5 py-1 rounded-md bg-ink/80 text-white text-[11px] font-semibold">
                      ${cfg.mediaTypeBadge}
                    </span>
                  </div>
                  <button
                    type="button"
                    id="toggle-loupe-btn"
                    class="${(resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0]).mediaType === 'video' ? 'hidden' : ''} absolute bottom-2.5 right-2.5 min-h-[34px] px-2.5 py-1 rounded-lg bg-white/95 hover:bg-white text-ink border border-line text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
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
                        ${q.size ? `<span class="block text-[11px] font-medium text-brand-violet mt-0.5 tabular-nums">${q.size}</span>` : ''}
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
                    <span>${escapeHtml(downloadButtonLabel((resolvedMedia.items[state.activeCarouselIdx] || resolvedMedia.items[0]).formats[state.selectedQualityIdx]))}</span>
                  </button>

                </div>
              </div>

            </div>
          </div>
        `;

        translateResult();
        attachMediaPreviews();
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

      function mediaPreviewMarkup(item) {
        const index = resolvedMedia.items.indexOf(item);
        const video = item.mediaType === 'video';
        return `<button type="button" class="media-open-btn" data-preview-index="${index}" aria-label="${escapeHtml(t(video ? 'Play video' : 'Preview photo'))}">
          ${item.thumbnailUrl ? `<img src="${previewUrl(item.thumbnailUrl)}" alt="${escapeHtml(item.title || t('Preview for {author}', { author: resolvedMedia.uploader.username }))}" class="media-source-image" />` : '<span aria-hidden="true" class="media-source-image" style="aspect-ratio:4/3"></span>'}
          ${video ? `<span class="media-play-label" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg></span>` : ''}
        </button>`;
      }

      function attachMediaPreviews() {
        const media = resolvedMedia;
        resultDynamicContent.querySelectorAll('[data-preview-index]').forEach(button => {
          button.addEventListener('click', () => {
            const item = media.items[Number(button.getAttribute('data-preview-index'))];
            const selected = item.formats[state.uiStateMode === 'carousel' ? 0 : state.selectedQualityIdx];
            const format = selected?.hasVideo ? selected : item.formats.find(format => format.hasVideo);
            if (item.mediaType === 'photo' || window.matchMedia('(max-width: 767px)').matches) openMediaPreview(media, item, format, button);
            else startVideoPreview(button.closest('.media-source-preview'), media, item, format);
          });
        });
      }

      function openMediaPreview(media, item, format, opener) {
        const scrollPosition = {left:window.scrollX,top:window.scrollY,behavior:'instant'};
        const dialog = document.createElement('dialog');
        dialog.className = 'media-lightbox';
        dialog.setAttribute('aria-label', t('Media preview'));
        dialog.innerHTML = `<header class="media-lightbox-header"><strong>${escapeHtml(t(item.mediaType === 'video' ? 'Video' : 'Photo'))}${item.width && item.height ? ' · ' + Number(item.width) + ' × ' + Number(item.height) : ''}</strong><button type="button" class="media-lightbox-close" aria-label="${escapeHtml(t('Close dialog'))}"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header><div class="media-lightbox-content">${item.thumbnailUrl ? `<img class="media-source-image" src="${previewUrl(item.thumbnailUrl)}" alt="${escapeHtml(item.title)}" />` : ''}</div>`;
        document.body.appendChild(dialog);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        let controller;
        dialog.addEventListener('close', () => {
          controller?.abort();
          const video = dialog.querySelector('video');
          if(video) { video.pause(); video.removeAttribute('src'); video.load(); }
          dialog.remove();
          document.body.style.overflow = previousOverflow;
          if(opener.isConnected) opener.focus({preventScroll:true});
          window.scrollTo(scrollPosition);
          requestAnimationFrame(()=>window.scrollTo(scrollPosition));
        }, {once:true});
        dialog.querySelector('.media-lightbox-close').addEventListener('click', event => {event.preventDefault();event.stopPropagation();dialog.close();});
        dialog.addEventListener('cancel', event => {event.preventDefault();dialog.close();});
        dialog.addEventListener('click', event => {
          if(event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
        dialog.showModal();
        if(item.mediaType === 'video') controller = startVideoPreview(dialog.querySelector('.media-lightbox-content'), media, item, format);
      }

      function startVideoPreview(container, media, item, format) {
        const controller = new AbortController();
        previewControllers.add(controller);
        const key = JSON.stringify([media.canonicalUrl,item.index,format?.formatId]);
        let jobId, completed = false;
        container.innerHTML = `${item.thumbnailUrl ? `<img class="media-source-image" src="${previewUrl(item.thumbnailUrl)}" alt="${escapeHtml(item.title)}" />` : ''}<p class="media-preview-status" role="status">${escapeHtml(t('Preparing preview…'))}</p>`;
        (async () => {
          try {
            if(!format?.hasVideo) throw new Error(t('Unable to prepare this preview.'));
            const cached = preparedPreviews.get(key);
            if(cached && cached.expires > Date.now()) { jobId=cached.jobId; completed=true; }
            else {
              const response = await fetch('/api/media/download', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:media.canonicalUrl,itemIndex:item.index,formatId:format.formatId,preview:true}),signal:controller.signal});
              const payload = await response.json();
              if(!response.ok) throw new Error(apiError(payload.error,'Unable to prepare this preview.'));
              jobId = payload.jobId;
              const deadline = Date.now()+180000;
              while(Date.now()<deadline && !controller.signal.aborted && container.isConnected) {
                const response = await fetch('/api/media/jobs/'+encodeURIComponent(jobId),{signal:controller.signal});
                const payload = await response.json();
                if(!response.ok) throw new Error(apiError(payload.error,'Unable to prepare this preview.'));
                if(payload.job.status==='completed') { completed=true; break; }
                if(['failed','cancelled'].includes(payload.job.status)) throw new Error(apiError(payload.job.error,'Unable to prepare this preview.'));
                await new Promise(resolve=>setTimeout(resolve,700));
              }
            }
            if(controller.signal.aborted || !container.isConnected) return;
            if(!completed) throw new Error(t('Download preparation timed out. Please try again.'));
            if(preparedPreviews.size>=20) preparedPreviews.delete(preparedPreviews.keys().next().value);
            preparedPreviews.set(key,{jobId,expires:Date.now()+600000});
            container.innerHTML = `<video class="media-source-video" controls playsinline preload="metadata" poster="${previewUrl(item.thumbnailUrl)}" src="/api/media/download/${encodeURIComponent(jobId)}?preview=1" aria-label="${escapeHtml(t('Media preview'))}"></video>`;
            const video = container.querySelector('video');
            video.addEventListener('error',()=>{
              preparedPreviews.delete(key);
              const message=document.createElement('p');message.className='media-preview-status';message.setAttribute('role','status');message.textContent=t('Unable to prepare this preview.');container.appendChild(message);
            },{once:true});
            // Some mobile browsers require a second tap on their native play control.
            video.play().catch(()=>{});
          } catch(error) {
            if(!controller.signal.aborted && container.isConnected) {
              const status=container.querySelector('.media-preview-status');
              if(status) status.textContent=error.message || t('Unable to prepare this preview.');
              const retry=document.createElement('button');retry.type='button';retry.className='media-preview-retry';retry.textContent=t('Play video');retry.addEventListener('click',()=>startVideoPreview(container,media,item,format));container.appendChild(retry);
            }
          } finally {
            previewControllers.delete(controller);
            if(jobId && !completed) fetch('/api/media/jobs/'+encodeURIComponent(jobId),{method:'DELETE'}).catch(()=>{});
          }
        })();
        return controller;
      }

      function downloadRequest(btn, media) {
        if (btn.hasAttribute('data-download-all')) return { url: media.canonicalUrl, zipCarousel: true };
        if (btn.hasAttribute('data-download-selected')) {
          const itemIndices = [...state.selectedCarouselIndices].sort((a, b) => a - b);
          if (itemIndices.length > 1) return { url: media.canonicalUrl, zipCarousel: true, itemIndices };
          const item = media.items[itemIndices[0]];
          return { url: media.canonicalUrl, formatId: item.formats[0].formatId, itemIndex: item.index };
        }
        const index = Number(btn.getAttribute('data-item-index') ?? state.activeCarouselIdx);
        const item = media.items[index];
        const format = item.formats[btn.hasAttribute('data-item-index') ? 0 : state.selectedQualityIdx] || item.formats[0];
        return { url: media.canonicalUrl, formatId: format.formatId, itemIndex: item.index };
      }

      function syncDownloadButtons() {
        if (!resolvedMedia) return;
        resultDynamicContent.querySelectorAll('.trigger-download-btn').forEach(btn => {
          const key = JSON.stringify(downloadRequest(btn, resolvedMedia));
          const pending = pendingDownloads.get(key);
          const label = btn.querySelector('span');
          if (!btn.hasAttribute('data-idle-label')) btn.setAttribute('data-idle-label', label?.textContent || '');
          btn.disabled = Boolean(pending);
          btn.setAttribute('aria-busy', pending ? 'true' : 'false');
          if (label) label.textContent = pending ? pending.label : btn.getAttribute('data-idle-label');
        });
      }

      function attachDownloadTriggers() {
        syncDownloadButtons();
        document.querySelectorAll('.trigger-download-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (resolvedMedia) {
              const media = resolvedMedia;
              const request = downloadRequest(btn, media);
              const key = JSON.stringify(request);
              if (pendingDownloads.has(key)) return;
              const pending = { label: t('Preparing download…') };
              pendingDownloads.set(key, pending);
              syncDownloadButtons();
              analytics('download_started', {media_type:media.category});
              try {
                const response = await fetch('/api/media/download', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(request),
                });
                const payload = await response.json();
                if (!response.ok) throw Object.assign(new Error(apiError(payload.error, 'Unable to start download.')), {analyticsCode:payload.error?.code});
                showToast('Preparing your download…');
                const deadline = Date.now() + (request.zipCarousel ? 900000 : 180000);
                while (Date.now() < deadline) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const statusResponse = await fetch('/api/media/jobs/' + encodeURIComponent(payload.jobId));
                  const statusPayload = await statusResponse.json();
                  if (!statusResponse.ok) throw Object.assign(new Error(apiError(statusPayload.error, 'Unable to check download.')), {analyticsCode:statusPayload.error?.code});
                  const job = statusPayload.job;
                  pending.label = t('Preparing download… {progress}%', { progress: Math.round(job.progress || 0) });
                  syncDownloadButtons();
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
                  if (job.status === 'failed' || job.status === 'cancelled') throw Object.assign(new Error(apiError(job.error, 'Download cancelled.')), {analyticsCode:job.error?.code});
                }
                throw new Error('Download preparation timed out. Please try again.');
              } catch (error) {
                analytics('download_failed', {media_type:media.category,failure_stage:'download',error_code:error?.analyticsCode});
                setValidationBanner('error', localError(error, 'Unable to download media.'));
              } finally {
                pendingDownloads.delete(key);
                syncDownloadButtons();
              }
              return;
            }

          });
        });
      }

      // Switch Tab handler
      function selectTab(tabId, fromRouteMenu) {
        if (!TOOL_CONFIG[tabId]) return;
        if (localeData.pageTool && tabId !== localeData.pageTool.tool) {
          window.location.assign(TOOL_CONFIG[tabId].route);
          return;
        }
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
            body: JSON.stringify({ url: parsed.canonicalUrl, tool: state.activeTab }), signal: controller.signal,
          });
          const payload = await response.json();
          if (!response.ok || payload.status !== 'ok') throw Object.assign(new Error(apiError(payload.error, 'Unable to inspect this link.')), {analyticsCode:payload.error?.code});
          if (controller.signal.aborted) return;
          if (!payload.data?.items?.length || payload.data.items.some(item => !item.formats?.length)) throw new Error('No downloadable media was found for this link.');
          resolvedMedia = payload.data;
          analytics('media_resolved', {media_type:resolvedMedia.category});
          const category = resolvedMedia.category;
          state.activeTab = category === 'reel' ? 'reels' : category === 'carousel' ? 'photo' : category;
          state.uiStateMode = resolvedMedia.isCarousel ? 'carousel' : 'single';
          renderToolState();
          setValidationBanner('success', 'Public media found. Select a format to download.');
        } catch (error) {
          if (controller.signal.aborted) return;
          analytics('download_failed', {media_type:state.activeTab,failure_stage:'resolve',error_code:error?.analyticsCode});
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
          if (btn.tagName === 'A') return;
          const tabId = btn.getAttribute('data-route-tab');
          closeAllDropdowns();
          closeMobileMenu();
          selectTab(tabId, true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      document.getElementById('nav-carousel-inspector-btn').addEventListener('click', (event) => {
        if (event.currentTarget.tagName === 'A') return;
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
            <p>For support, include the public link, browser, device and displayed error. For copyright inquiries, identify the work and the link involved. Never send passwords or login cookies.</p>
            <div class="p-4 rounded-xl bg-soft border border-line space-y-1.5 text-xs sm:text-sm">
              <p><strong>Support Email:</strong> ${escapeHtml(localeData.publicSettings?.contactEmail || 'backbencherz@gmail.com')}</p>
              <p><strong>Copyright &amp; Removal Requests:</strong> backbencherz@gmail.com</p>
              <p>No response-time guarantee is published.</p>
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
          if (btn.tagName === 'A') return;
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
      if(!initialTool && !localeData.pageTool && TOOL_CONFIG[localeData.publicSettings?.defaultTool] && localeData.publicSettings.defaultTool!=='photo') selectTab(localeData.publicSettings.defaultTool,false);
      if (initialTool && TOOL_CONFIG[initialTool]) selectTab(initialTool, true);
      if (localeData.pageTool) selectTab(localeData.pageTool.tool, true);
      const initialInfo = initialQuery.get('info');
      if (initialInfo && ['privacy', 'terms', 'contact'].includes(initialInfo)) openModal(initialInfo);
      initializedForm?.setAttribute('data-saveframe-initialized', 'true');
    };
  
