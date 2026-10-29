# SaveFrame resolution and preparation performance

Date: 2026-10-29. Baseline commit: `d8573dda69382476102b4f7688ba9ffc0ed2cfd8`.

## Result and limits

Repeated-link work and eligible MP4 preparation are substantially faster in repeatable local fixtures. Cold extraction remains dependent on the same proven upstream extractors. These tests do **not** establish a live Instagram or Contabo latency improvement. No fresh authorized public media links were supplied for this run, and no Instagram requests, authentication attempts, push or deployment were performed.

The 24-link workload improved from **137.05 ms p50 / 186.40 ms p95** to **0.01 ms p50 / 156.13 ms p95** at the service boundary. Cache hits increased from **0% to 66.7%**. This workload repeats each link three times inside the TTL; the first visit still extracts. The sub-millisecond median is an in-process cache lookup, excluding Next.js, network, operational analytics, image delivery and browser rendering. It is not a promised user-visible response time.

Eligible complete-MP4 preparation improved from **213.26 ms p50 / 233.01 ms p95** to **29.06 ms p50 / 31.18 ms p95**, with identical source/output bytes and no second extractor subprocess. This uses a controlled local download-process fixture, not live yt-dlp network performance.

## Project review and bottlenecks

Reviewed the Next resolve/download/job/preview routes and singleton, legacy Node router, URL/DNS validation, HTTP and image/profile adapters, yt-dlp normalization/cache/process control, optional instagrapi orchestration and Python worker, download manager/ZIP/cancellation/disk retention, FFmpeg audio path, frontend paste/submit/result/preview logic, rate limiter, operational analytics, privacy controls, build configuration, Nginx examples and relevant regression suites. Existing admin data and migrations were not edited.

The critical path is: paste or submit → immediate loader → local validation/rate limiting/analytics → source metadata extraction → normalization → sanitized JSON → existing result renderer. On-demand video playback/download then enters the existing preparation queue. The current browser code already renders the returned media/options immediately, coalesces native paste events, suppresses concurrent duplicate submits, aborts on input changes, and rejects stale results. There was no need to change its layout, CSS, animations or polling intervals.

Measured and confirmed problems:

1. An eight-entry cache churned continuously under a 24-link working set. Every repeat extracted again.
2. Concurrent requests for the same canonical link through different tool tabs used different pending keys. Photos, Reels, videos and carousels could launch two extractor processes; profiles could make two HTTP requests. Audio already reused its underlying source in this test.
3. A new request could join work already aborted by its last subscriber. It now waits for bounded teardown before starting replacement work; remaining subscribers are unaffected.
4. Complete MP4 preparation unnecessarily launched a download extractor even when the selected stream and anonymous metadata were already available. Separate audio/video streams still need the established merge path.
5. The legacy Node router wrote complete metadata to a second five-minute Redis JSON cache that the download path did not use. This duplicated signed media URLs without the new expiry policy. That write was removed.
6. Operator primary-success/photo-adapter paths could populate the public cache despite the intended session boundary. All operator paths now avoid reading and populating anonymous caches.

For cold fixtures, subprocess extraction dominates. In the final cold Reel run it averaged 139.87 ms, normalization 0.19 ms, and validation 0.03 ms. The 60 ms simulated extractor delay plus actual process/interpreter overhead dominates that controlled workload. The photo fixture intentionally makes yt-dlp return a no-video error, then obtains complete photo data through the adapter. The fixture does not prove how frequently Instagram production responses need that fallback.

## Implemented behavior

- Public metadata is coalesced by canonical URL across tools. MP3 remains a derived view of the source metadata and preserves all 128/192/320 kbps options.
- Anonymous cache defaults: **64 entries**, **16 MiB serialized-size budget**, **2 MiB maximum per entry**, and **60 seconds** maximum age. Entries use LRU eviction and an unreferenced expiry timer, including deletion during idle periods. Serialized bytes are a budget estimate; JavaScript object overhead is additional.
- `oe` hexadecimal and `expires`/`exp` decimal URL expiries shorten the TTL with a ten-second margin. Already-expiring URLs, credentials, private/auth-dependent metadata, and recognized signatures without readable expiry are ineligible. No failures are cached. Signed URLs are not persisted to Redis. Unknown signature schemes remain an upstream integration uncertainty; do not increase the TTL to compensate for low hit rate.
- Anonymous and operator metadata remain separate. Cache hits still pass input validation and the API rate limiter. A cancelled subscriber cannot cancel other subscribers. At most three distinct inspections run at once, including teardown before replacement.
- Complete, unmerged MP4 streams from approved CDN hosts use the existing streaming HTTP client. It preserves the selected stream, validated public User-Agent/Instagram Referer requirements, DNS checks, MIME/signature checks, byte limits and cancellation. Credential-dependent formats, manifests and merge-required formats stay on the extractor path. A generic transport failure can fall back to yt-dlp; access restrictions, cancellation, size and format errors do not trigger retries.
- Existing raw metadata is reused through the private, temporary `--load-info-json` path where appropriate. Null adapter metadata is no longer written as an invalid info JSON file. Temporary info files retain restrictive permissions and cleanup.
- HTTP(S) pools are explicitly bounded: four sockets per origin, twelve total per protocol, two free sockets per origin, five-second free-socket timeout. Active socket reuse clears that idle timeout; existing wall-clock request deadlines remain intact. New connections retain checked DNS lookup; reusing a socket reuses its already checked destination. Redirects remain unfollowed.
- Video posters now select existing approximately 640px renditions, with smaller thumbnails and original preview references where provided. Download quality, aspect ratio and file bytes are unchanged; no signed URL is rewritten.
- No upstream request races or speculative parallel extractor requests were added. No extraction timeout was shortened. yt-dlp remains primary for Reels/video/posts, the photo adapter remains a fallback, and profiles continue directly through the profile adapter. A single-image OpenGraph response can be a carousel cover or video poster, so moving that parser ahead of the primary extractor without real response evidence would risk incomplete results.
- The Python worker remains isolated per request, bounded and fallback-only. No persistent session-bearing Python daemon, login flow, access bypass, or unsupported feature was added.

## Measurements

Environment: Windows, Node v24.18.0. The resolution fixture uses actual Node child processes with a controlled 60 ms extractor delay and a loopback HTTP server with a controlled 20 ms delay. Photo/profile parsing, metadata normalization, cache policy, coalescing and subprocess control run through the real application services. DNS preflight is stubbed only for the offline fixture; no public-host request is sent.

Cold: ten samples per media type, fresh service/cache per sample. Working set: 24 distinct links (four per media type), three sequential passes, twelve samples per type. Concurrent: two views of each canonical link. p50/p95 use nearest-rank quantiles. Samples are small, sequential, and subject to host scheduling noise; cold/p95 changes are not statistical proof of improvement.

All latency values below are milliseconds, shown as p50 / p95. Every resolution fixture succeeded before and after (**100% fixture success**, not a production success rate).

| Workload | Type | Before p50 / p95 | After p50 / p95 | Cache hit rate | Fallback frequency |
| --- | --- | --- | --- | --- | --- |
| Cold | Photo | 173.93 / 203.75 | 183.94 / 196.97 | 0% → 0% | 100% → 100% |
| Cold | Reel | 126.22 / 142.90 | 138.98 / 150.82 | 0% → 0% | 0% → 0% |
| Cold | Video | 138.88 / 144.36 | 138.27 / 143.80 | 0% → 0% | 0% → 0% |
| Cold | Carousel | 137.48 / 146.06 | 138.73 / 140.52 | 0% → 0% | 0% → 0% |
| Cold | Audio | 138.77 / 143.19 | 138.39 / 141.53 | 0% → 0% | 0% → 0% |
| Cold | Profile | 30.65 / 33.33 | 30.41 / 33.08 | 0% → 0% | 0% → 0% |
| 24-link working set | Photo | 172.26 / 203.03 | 0.01 / 185.42 | 0% → 66.7% | 100% → 33.3% |
| 24-link working set | Reel | 137.18 / 167.86 | 0.01 / 152.18 | 0% → 66.7% | 0% → 0% |
| 24-link working set | Video | 128.18 / 140.46 | 0.01 / 155.17 | 0% → 66.7% | 0% → 0% |
| 24-link working set | Carousel | 137.95 / 144.79 | 0.01 / 155.94 | 0% → 66.7% | 0% → 0% |
| 24-link working set | Audio | 136.60 / 156.93 | 0.02 / 153.79 | 0% → 66.7% | 0% → 0% |
| 24-link working set | Profile | 35.72 / 37.21 | 0.01 / 35.84 | 0% → 66.7% | 0% → 0% |

Aggregate cold resolution: **138.22 / 188.18 → 138.73 / 186.37 ms**. This does not show a meaningful cold-start speedup. Some individual p95 values increased and are reported above.

Aggregate fallback frequency in the working set: **16.7% → 5.6%**, reflecting fewer extraction attempts due to caching, not an intrinsically more reliable extractor. The complete combined fixture run used **119 → 75 subprocesses** and **48 → 30 HTTP requests**. Cross-tool duplicate work fell from two to one extraction for photo/Reel/video/carousel and two to one HTTP request for profile; audio remained one shared extraction.

Download fixture: twenty identical selected-MP4 transfers per version, actual loopback HTTP response, actual baseline Node download subprocess, byte equality checked on every output. One initial metadata extraction occurred per version. Download subprocesses: **20 → 0**. Preparation success: **100% → 100%**. This isolates eliminated process overhead; it does not model real CDN throughput or FFmpeg conversion time.

Installed Python/instagrapi import-only benchmark: ten fresh processes, no network. Median process-plus-import **731.61 ms**, p95 **754.66 ms**; median library import **582.44 ms**. These are Windows observations and cannot be projected directly onto Linux/Contabo. Keeping Python off successful primary/cache paths avoids that cost without weakening isolation.

Raw evidence:

- `reports/resolution-benchmark-before.json`
- `reports/resolution-benchmark-after.json`
- `reports/download-preparation-benchmark.json`

Reproduction from this checkout:

```text
node scripts/benchmark-resolution.cjs reports/resolution-baseline-rerun.json --baseline-ref=d8573dda69382476102b4f7688ba9ffc0ed2cfd8
npm run benchmark:resolution
node scripts/benchmark-download-preparation.cjs d8573dda69382476102b4f7688ba9ffc0ed2cfd8
```

The baseline option compiles the specified service revision in memory and adds timing wrappers, without checking out files. Its collaborators use the current guarded adapters; the original before artifact was captured before optimization. Keep that distinction when comparing reruns. Neither fixture reproduces live Instagram response shape, network restrictions, account visibility, signed URL lifetime or VPS load.

## Timing and diagnosis on production

`SAVEFRAME_MEDIA_TIMING=1` enables a fixed numeric snapshot per resolve/preparation operation and resolve `Server-Timing` headers. Fields contain only total duration, fixed stage names, counts, operation (`resolve`/`download`) and outcome (`ok`/`error`). No URL, shortcode, account, job ID, client IP, cookie, token, SQL, raw exception, authentication data or database record is logged. Timing is disabled in the documented default configuration.

Stages include validation, rate limiting, operational analytics, subprocess DNS preflight, HTTP connection/time to response headers, adapter response handling, extraction, subprocess/OS startup, Python worker, shared wait, fallback, normalization, JSON preparation and download preparation. Nested stages overlap and must not be summed. `preview_response` ends when JSON is prepared; it does not include bytes reaching the browser or poster image decoding. `upstream_connection` includes DNS/TLS/TTFB for Node HTTP clients. yt-dlp's internal upstream phases are opaque; its subprocess duration includes its network work. OS spawn timing is not the Python library-ready time. Shared subscribers report their waiting duration; extraction detail belongs to the initiating context.

Enable timings during a controlled measurement window after a deliberate deployment, then group resolve and download samples separately. Measure production p50/p95, successful outcomes, cache hits, shared waits, and actual fallback frequency with representative authorized links. If `analytics` dominates, investigate SQLite contention using the separate sanitized operation diagnostics; do not disable privacy controls or invent a lower upstream timeout. If unique-link extraction dominates, these local results do not establish that another extractor or lower timeout would be reliable.

## Starting settings for the Contabo 4-core / 8 GB VPS

These are conservative starting settings inferred from this code, not load-tested capacity guarantees. Keep one persistent Next.js Node process behind the existing loopback Nginx configuration. The job registry, queue, deduplication, rate limiter and metadata cache are process-local: launching four PM2/Node instances merely because there are four cores would split jobs and multiply upstream limits. The subprocesses already use other cores. A multi-process deployment needs explicit shared job/state coordination first. Next.js also documents cache coordination requirements for multi-instance hosting: [Next.js 15 self-hosting](https://nextjs.org/docs/15/app/guides/self-hosting).

```dotenv
MAX_CONCURRENT_DOWNLOADS=2
MAX_QUEUED_DOWNLOADS=20
METADATA_CACHE_TTL_MS=60000
METADATA_CACHE_MAX_ENTRIES=64
METADATA_CACHE_MAX_BYTES=16777216
MAX_FILE_SIZE_BYTES=157286400
FILE_RETENTION_MS=900000
MIN_FREE_DISK_BYTES=1073741824
INSTAGRAPI_MAX_WORKERS=1
INSTAGRAPI_MEMORY_MB=512
INSTAGRAPI_TIMEOUT_MS=20000
SAVEFRAME_MEDIA_TIMING=0
```

Keep the existing fallback-enabled choice; do not enable it merely to warm processes. Keep the current metadata/download timeout defaults (45s/120s) until production stage measurements justify changes. If the optional 20s fallback is enabled, the sequential 45s primary + 15s photo adapter + 20s Python path can exceed the example Nginx 75s resolve read timeout. Account for that full chain plus overhead when choosing a proxy budget after production measurements; do not shorten extractor budgets to hide it. No timeout setting was changed here.

Use Node 24+ as required by the project. An optional initial Node old-space ceiling of 2048 MiB leaves room for the OS, workers and media processes, but is not a cap on total RSS or child-process memory; observe RSS and actual workloads before setting it. Keep downloads on private persistent disk, retain the existing 150 MiB file limit, and reserve at least 1 GiB free as a starting floor. Completed files and ZIP/audio intermediates need disk capacity beyond that floor. Monitor disk and queue depth rather than raising the queue to mask saturation.

HTTP connection limits are implemented directly in the transport; no additional agent tuning environment variables are needed. Node documents the distinct per-host, total and free-socket limits in [Node 24 HTTP Agent](https://nodejs.org/download/release/v24.17.0/docs/api/http.html). No production settings were applied automatically.

## Verification

- `npm test`: passed, including new performance regressions, supported-media validation, SSRF checks, cancellation, queue/ZIP cleanup, authentication, country statistics and analytics/privacy tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including build trace privacy checks.
- `npm run test:instagrapi`: passed, including nine Python security tests and real isolated subprocess cancellation/output/timeout checks.
- `npm run test:runtime`: passed, with installed yt-dlp and real FFmpeg encoding/mux/M4A extraction and decoded non-silent audio. `npm test` also passed real MP3 tests at all supported bitrates.
- `npm run test:performance` against a temporary local production server: passed on 37 checked routes.
- New regressions cover cross-tool/MP3 coalescing, LRU/byte/TTL/known-signature limits, idle deletion, independent cancellation, replacement after cancellation, concurrency caps, failure recovery, operator separation, real direct MP4 transfer and required safe headers, socket reuse, restriction preservation, accurate API cache status, rate limiting on hits, thumbnail variants and safe timing logs.
- Existing frontend execution tests now also assert loading feedback before the response, abort on URL replacement, and rejection of out-of-order stale results.
- UI JavaScript, CSS, component design sources, admin logic, country aggregation and Python worker source have no changes in this task. Generated public asset hashes remain unchanged. Retired unsupported features remain rejected.

No database reset, migration change, production record edit, push or deployment occurred. The temporary local production server was stopped after verification.
