const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(compiled.outputText, filename);
};

// Keep this regression check offline; subprocess behavior is supplied below.
const validation = require('../src/security/url-validator.ts');
validation.assertSafeHostResolution = async () => {};
const { YtDlpService } = require('../src/services/yt-dlp.service.ts');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-check-'));
  const service = new YtDlpService();
  const url = 'https://www.instagram.com/reel/RealTest123/';
  const raw = {
    id: 'RealTest123', title: 'Public Reel', uploader_id: 'creator',
    formats: [
      { format_id: 'video', url: 'https://scontent.cdninstagram.com/video.mp4', width: 720, height: 1280, vcodec: 'h264', acodec: 'none' },
      { format_id: 'audio', url: 'https://scontent.cdninstagram.com/audio.m4a', vcodec: 'none', acodec: 'aac' },
    ],
  };
  let extractions = 0;
  service.runSubprocess = async (_binary, args) => {
    if (args.includes('--dump-single-json')) {
      extractions++;
      return { stdout: JSON.stringify(raw), stderr: '', exitCode: 0 };
    }
    const infoPath = args[args.indexOf('--load-info-json') + 1];
    assert.deepEqual(JSON.parse(fs.readFileSync(infoPath, 'utf8')), raw);
    assert.equal(args.includes(url), false, 'Cached downloads must not resolve the post again');
    assert.equal(args[args.indexOf('-f') + 1], 'video+bestaudio/best');
    fs.writeFileSync(args[args.indexOf('-o') + 1], Buffer.from('downloaded-file'));
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  let artifact;
  try {
    const media = await service.extractMetadata(url);
    const video = media.items[0].formats[0];
    assert.equal(video.needsMerge, true, 'Video-only streams require an audio merge');
    assert.equal(video.label, 'HD (720×1280)');
    assert.equal(video.filesizeFormatted, 'Size unavailable');
    assert.equal(await service.extractMetadata(url), media);
    artifact = await service.downloadMedia(url, { jobId: 'cache-test', formatId: video.formatId, itemIndex: 0, outputDir: directory });
    assert.equal(extractions, 1, 'Resolve and download must share extraction results');
    assert.equal(artifact.filesizeBytes, 15);
    assert.equal(fs.existsSync(path.join(directory, 'cache-test.info.json')), false);
    const photoService = new YtDlpService();
    photoService.runSubprocess = async (_binary, args) => {
      assert.equal(args.includes('--ignore-no-formats-error'), true);
      return {
        stdout: JSON.stringify({
          _type: 'playlist', id: 'ImagePost123', channel: 'photographer',
          entries: [0, 1].map(index => ({
            id: `image${index}`, formats: [], thumbnails: [
              { url: `https://scontent.cdninstagram.com/small${index}.jpg`, width: 320, height: 400 },
              { url: `https://scontent.cdninstagram.com/original${index}.jpg`, width: 1080, height: 1350 },
            ],
          })),
        }), stderr: '', exitCode: 0,
      };
    };
    const photos = await photoService.extractMetadata('https://www.instagram.com/p/ImagePost123/');
    assert.equal(photos.category, 'carousel');
    assert.equal(photos.itemCount, 2);
    assert.equal(photos.items[0].mediaType, 'photo');
    assert.equal(photos.items[0].formats[0].directUrl, 'https://scontent.cdninstagram.com/original0.jpg');
    assert.equal(photos.items[1].index, 1);
    const unknownDimensions = photoService.normalizeYtDlpOutput({
      id: 'ImagePost456', thumbnails: [
        { url: 'https://scontent.cdninstagram.com/small.jpg' },
        { url: 'https://scontent.cdninstagram.com/large.jpg' },
      ],
    }, { canonicalUrl: 'https://www.instagram.com/p/ImagePost456/', category: 'photo', shortcode: 'ImagePost456' });
    assert.equal(unknownDimensions.items[0].formats[0].directUrl, 'https://scontent.cdninstagram.com/large.jpg');
    assert.equal(unknownDimensions.items[0].formats[0].resolution, 'Source resolution');
    assert.equal(unknownDimensions.items[0].width, undefined);
    const { markup } = require('../src/ui/saveframe.json');
    for (const removed of ['try-sample-link-btn', 'state-mode-btn', 'result-boundary-status', 'footer-api-boundary-btn']) {
      assert.equal(markup.includes(removed), false, removed + ' must be removed');
    }
    console.log('PASS: cached extraction, audio merging, photo-only carousels, honest quality metadata, temporary metadata cleanup, and production UI.');
  } finally {
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
