const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
process.env.SAVEFRAME_ANALYTICS_DISABLED='1';

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
    service.runSubprocess = async (_binary, args) => {
      assert.equal(args[args.indexOf('-f') + 1], 'audio');
      assert.ok(args.includes('--extract-audio'));
      assert.equal(args[args.indexOf('--audio-format') + 1], 'm4a');
      assert.ok(!args.includes('--merge-output-format'), 'M4A is not a valid video merge format');
      const output = args[args.indexOf('-o') + 1];
      assert.ok(output.endsWith('.%(ext)s'));
      fs.writeFileSync(output.replace('.%(ext)s', '.m4a'), 'audio-track');
      return { stdout: '', stderr: '', exitCode: 0 };
    };
    const audioArtifact = await service.downloadMedia(url, { jobId: 'audio-cache-test', formatId: 'audio', itemIndex: 0, outputDir: directory });
    assert.equal(audioArtifact.safeFilename, 'creator_RealTest123_audio.m4a');
    assert.equal(audioArtifact.mimeType, 'audio/mp4');
    assert.equal(audioArtifact.filesizeBytes, 11);
    // Exercise the real download route: the suggested filename must match the audio MIME type.
    const singletonPath = require.resolve('../src/app/api/singleton.ts');
    const originalSingleton = require.cache[singletonPath];
    const routeJob = { status: 'completed', shortcode: 'RealTest123', ...audioArtifact, outputFilePath: audioArtifact.filePath };
    require.cache[singletonPath] = { exports: { getApiContext: () => ({ downloadManager: { getJob: () => routeJob } }) } };
    try {
      const { GET } = require('../src/app/api/media/download/[jobId]/route.ts');
      const response = await GET(new Request('http://localhost/api/media/download/audio-cache-test'), { params: Promise.resolve({ jobId: 'audio-cache-test' }) });
      assert.equal(response.headers.get('Content-Type'), 'audio/mp4');
      assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="creator_RealTest123_audio.m4a"');
      assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'audio-track');
      routeJob.mimeType = 'image/jpeg';
      routeJob.safeFilename = 'creator_RealTest123_photo.jpg';
      const imageResponse = await GET(new Request('http://localhost/api/media/download/photo-test'), { params: Promise.resolve({ jobId: 'photo-test' }) });
      assert.equal(imageResponse.headers.get('Content-Disposition'), 'attachment; filename="creator_RealTest123_photo.jpg"');
    } finally {
      if (originalSingleton) require.cache[singletonPath] = originalSingleton;
      else delete require.cache[singletonPath];
    }
    const muxedService = new YtDlpService();
    muxedService.runSubprocess = async (_binary, args) => {
      if (args.includes('--dump-single-json')) return { stdout: JSON.stringify({ ...raw, formats: [{ ...raw.formats[0], format_id: 'combined', acodec: 'aac' }] }), stderr: '', exitCode: 0 };
      assert.equal(args[args.indexOf('-f') + 1], 'combined', 'Extract from the real combined source, not the synthetic audio option ID');
      assert.ok(args.includes('--extract-audio') && !args.includes('--merge-output-format'));
      fs.writeFileSync(args[args.indexOf('-o') + 1].replace('.%(ext)s', '.m4a'), 'extracted-audio');
      return { stdout: '', stderr: '', exitCode: 0 };
    };
    const muxed = await muxedService.extractMetadata(url);
    const extractedAudio = muxed.items[0].formats.find(format => !format.hasVideo && format.hasAudio);
    assert.equal(extractedAudio.sourceFormatId, 'combined');
    assert.equal(extractedAudio.filesizeFormatted, 'Size unavailable', 'Do not present video size as extracted audio size');
    const extractedArtifact = await muxedService.downloadMedia(url, { jobId: 'muxed-audio-test', formatId: extractedAudio.formatId, outputDir: directory });
    assert.equal(extractedArtifact.safeFilename, 'creator_RealTest123_audio.m4a');
    const silent = muxedService.normalizeYtDlpOutput({ ...raw, formats: [raw.formats[0]] }, { category: 'reel', shortcode: 'RealTest123', canonicalUrl: url });
    assert.ok(!silent.items[0].formats.some(format => !format.hasVideo && format.hasAudio), 'Do not offer extracted audio when no audio source is known');
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
    // Exercise the same ZIP job used by the bulk action, including mixed slide order.
    const { DownloadManagerService } = require('../src/services/download-manager.service.ts');
    const downloadedIndices = [];
    const archiveItems = [0, 1, 2].map(index => ({ index, formats: [{ formatId: 'source-' + index }] }));
    const manager = new DownloadManagerService({
      extractMetadata: async () => ({ shortcode: 'ZipPost123', uploader: { username: 'creator' }, items: archiveItems }),
      downloadMedia: async (_url, options) => {
        downloadedIndices.push(options.itemIndex);
        const safeFilename = options.filenamePrefix + (options.itemIndex === 1 ? '.mp4' : '.jpg');
        const filePath = path.join(directory, safeFilename);
        fs.writeFileSync(filePath, 'slide-content-' + options.itemIndex);
        return { safeFilename, filePath };
      },
    }, { tempDir: directory });
    const zipJob = await manager.createJob({ url: 'https://www.instagram.com/p/ZipPost123/', zipCarousel: true });
    const deadline = Date.now() + 5000;
    while (!['completed', 'failed'].includes(zipJob.status) && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
    assert.equal(zipJob.status, 'completed', zipJob.error?.message);
    assert.equal(zipJob.mimeType, 'application/zip');
    assert.deepEqual(downloadedIndices, [0, 1, 2]);
    const zip = fs.readFileSync(zipJob.outputFilePath);
    let offset = 0;
    for (let index = 0; index < 3; index++) {
      assert.equal(zip.readUInt32LE(offset), 0x04034b50);
      const size = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
      assert.ok(name.startsWith('creator_' + String(index + 1).padStart(2, '0') + '_ZipPost123'));
      assert.equal(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size).toString(), 'slide-content-' + index);
      assert.equal(fs.existsSync(path.join(directory, name)), false, 'ZIP part files should be cleaned up');
      offset += 30 + nameLength + size;
    }
    downloadedIndices.length = 0;
    const subset = await manager.createJob({ url: 'https://www.instagram.com/p/ZipPost123/', zipCarousel: true, itemIndices: [2, 0, 2] });
    const subsetDeadline = Date.now() + 5000;
    while (!['completed', 'failed'].includes(subset.status) && Date.now() < subsetDeadline) await new Promise(resolve => setImmediate(resolve));
    assert.equal(subset.status, 'completed', subset.error?.message);
    assert.deepEqual(downloadedIndices, [0, 2], 'Only checked slides should be fetched, deduplicated and in post order');
    const selectedZip = fs.readFileSync(subset.outputFilePath);
    assert.equal(selectedZip.readUInt16LE(selectedZip.length - 22 + 10), 2, 'Selected ZIP must have exactly two entries');
    assert.ok(selectedZip.includes(Buffer.from('creator_01_ZipPost123.jpg')));
    assert.ok(selectedZip.includes(Buffer.from('creator_03_ZipPost123.jpg')));
    assert.ok(!selectedZip.includes(Buffer.from('creator_02_ZipPost123.mp4')));
    for (const itemIndices of [[], [-1], [0.5], ['1'], 'all']) {
      await assert.rejects(manager.createJob({ url: 'https://www.instagram.com/p/ZipPost123/', zipCarousel: true, itemIndices }), error => error.code === 'UNSUPPORTED_OPERATION');
    }
    const unavailable = await manager.createJob({ url: 'https://www.instagram.com/p/ZipPost123/', zipCarousel: true, itemIndices: [99] });
    const invalidDeadline = Date.now() + 5000;
    while (!['completed', 'failed'].includes(unavailable.status) && Date.now() < invalidDeadline) await new Promise(resolve => setImmediate(resolve));
    assert.equal(unavailable.status, 'failed');
    assert.equal(unavailable.error.code, 'UNSUPPORTED_OPERATION');
    const { markup } = require('../src/ui/saveframe.json');
    for (const removed of ['try-sample-link-btn', 'state-mode-btn', 'result-boundary-status', 'footer-api-boundary-btn']) {
      assert.equal(markup.includes(removed), false, removed + ' must be removed');
    }
    const clientSource=fs.readFileSync(path.join(process.cwd(),'public/saveframe.js'),'utf8');
    const qualityFunction=clientSource.slice(clientSource.indexOf('function liveQualities('),clientSource.indexOf('\n      function formatLabel('));
    const visibleQualities=require('node:vm').runInNewContext('('+qualityFunction+')',{escapeHtml:String,formatLabel:String,t:String,visibleFilesize:()=>''});
    const renditions=Array.from({length:13},(_,index)=>({formatId:index?'photo-'+index:'photo-original',label:index?'Image variant '+(index+1):'Original image',resolution:'Source resolution',Container:'JPEG sRGB'}));
    const photoItem={mediaType:'photo',formats:renditions};
    assert.equal(visibleQualities(photoItem).length,1,'One photo must not expose every CDN rendition as a separate image choice');
    assert.equal(visibleQualities(photoItem)[0].id,'photo-original','The best available photo format must remain the download choice');
    assert.equal(photoItem.formats.length,13,'Simplifying the display must not change backend format data');
    assert.equal(visibleQualities({mediaType:'video',formats:renditions}).length,13,'Video and audio format choices must stay available');
    console.log('PASS: cached extraction, audio extraction/merging, creator filenames and HTTP extensions, photo-only carousels, ordered mixed-media bulk ZIP, honest quality metadata, temporary metadata cleanup, and production UI.');
  } finally {
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename));
    fs.rmdirSync(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
