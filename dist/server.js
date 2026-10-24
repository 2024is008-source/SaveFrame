"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createSaveFrameServer = createSaveFrameServer;
var http = _interopRequireWildcard(require("http"));
var fs = _interopRequireWildcard(require("fs"));
var path = _interopRequireWildcard(require("path"));
var _mediaRouter = require("./api/media-router");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function createSaveFrameServer(customCtx) {
  const ctx = customCtx || (0, _mediaRouter.createDefaultApiContext)();
  const staticHtmlPath = process.env.STATIC_UI_HTML_PATH || path.resolve(__dirname, '../../../output/instagram-downloader.html');
  return http.createServer(async (req, res) => {
    if (req.url?.startsWith('/api/')) {
      const handled = await (0, _mediaRouter.handleApiRequest)(req, res, ctx);
      if (handled) return;
    }

    // Serve the frontend UI HTML on root or tool routes
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/photo-downloader') || req.url?.startsWith('/reels-downloader') || req.url?.startsWith('/video-downloader') || req.url?.startsWith('/story-downloader') || req.url?.startsWith('/profile-viewer'))) {
      try {
        const html = await fs.promises.readFile(staticHtmlPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(html);
        return;
      } catch {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.end('SaveFrame Backend Running. API available at /api/health');
        return;
      }
    }
    res.writeHead(404, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
      status: 'error',
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found.'
      }
    }));
  });
}
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = createSaveFrameServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`[SaveFrame] Instagram Downloader server listening on http://0.0.0.0:${port}`);
  });
}