const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ts = require('typescript');
process.env.NODE_ENV = 'test';
process.env.SAVEFRAME_ANALYTICS_DISABLED = '1';
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
const validation = require('../src/security/url-validator.ts');
validation.assertSafeHostResolution = async () => {};
const {YtDlpService} = require('../src/services/yt-dlp.service.ts');
const {audioMetadata, encodeMp3} = require('../src/services/audio.ts');
const {analyticsEvent} = require('../src/lib/analytics.ts');
const {DownloadManagerService} = require('../src/services/download-manager.service.ts');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-mp3-'));
const source = path.join(directory, 'authorized-synthetic-tone.m4a');
const service = new YtDlpService();
const run = service.runSubprocess.bind(service);
let mode = 'video', downloads = 0;
const commands = [];
function ffmpeg(args) {
  const result = spawnSync(service.ffmpegPath, ['-nostdin', '-hide_banner', ...args], {encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024});
  assert.equal(result.status, 0, result.stderr);
  return result.stderr;
}
service.runSubprocess = async (binary, args, ...rest) => {
  if (binary === service.ytDlpPath) {
    if (args.includes('--dump-single-json')) {
      if (mode === 'private') return {exitCode: 1, stdout: '', stderr: 'You need to log in to access this content'};
      const raw = mode === 'photo' ? {id: 'Photo12345', uploader_id: 'fixture', thumbnails: [{url: 'https://scontent.cdninstagram.com/photo.jpg'}]} : {
        id: 'Audio12345', uploader_id: 'fixture', duration: 1,
        formats: [{format_id: 'combined', url: 'https://scontent.cdninstagram.com/source.mp4', vcodec: 'h264', acodec: 'aac', width: 64, height: 64},
          {format_id: 'sound', url: 'https://scontent.cdninstagram.com/source.m4a', vcodec: 'none', acodec: 'aac'}],
      };
      return {exitCode: 0, stdout: JSON.stringify(raw), stderr: ''};
    }
    downloads++;
    assert.equal(args[args.indexOf('--audio-format') + 1], 'm4a');
    fs.copyFileSync(source, args[args.indexOf('-o') + 1].replace('.%(ext)s', '.m4a'));
    return {exitCode: 0, stdout: '', stderr: ''};
  }
  commands.push({args, timeout: rest[0]});
  return run(binary, args, ...rest);
};

async function main() {
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', source]);
  let artifact;
  for (const [url, category] of [['https://www.instagram.com/reel/Audio12345/', 'reel'], ['https://www.instagram.com/p/Video12345/', 'video']]) {
    const result = await service.extractMetadata(url, 'audio');
    assert.equal(result.category, 'audio');
    assert.deepEqual(result.items[0].formats.map(format => format.formatId), ['mp3-128', 'mp3-192', 'mp3-320']);
    assert.equal(result.supportsZipDownload, false);
    for (const quality of [128, 192, 320]) {
      artifact = await service.downloadMedia(url, {jobId: `audio_${category}_${quality}`, itemIndex: 0, formatId: `mp3-${quality}`, outputDir: directory});
      assert.equal(artifact.mimeType, 'audio/mpeg'); assert.ok(artifact.safeFilename.endsWith('.mp3'));
      assert.ok(artifact.filesizeBytes > 1000); assert.ok(artifact.durationSeconds >= 1);
      const bytes = fs.readFileSync(artifact.filePath); assert.equal(bytes.toString('ascii', 0, 3), 'ID3');
      const decoded = ffmpeg(['-i', artifact.filePath, '-af', 'volumedetect', '-f', 'null', '-']);
      assert.ok(Number(decoded.match(/mean_volume:\s*(-?[\d.]+)/)[1]) > -80, 'Real decoded audio, not a silent placeholder');
      assert.ok(!fs.readdirSync(directory).some(file => file.startsWith(`audio_${category}_${quality}_audio_source`)), 'Intermediate source removed');
    }
  }
  assert.equal(downloads, 6);
  const encoders = commands.filter(command => command.args.includes('libmp3lame'));
  assert.equal(encoders.length, 6);
  for (const command of encoders) {
    assert.equal(command.timeout, 60000);
    assert.equal(command.args[command.args.indexOf('-protocol_whitelist') + 1], 'file,pipe');
    assert.equal(command.args[command.args.indexOf('-t') + 1], '600');
    assert.ok(command.args.includes('-fs') && command.args.includes('-max_alloc') && command.args.includes('-threads'));
  }
  const tooLong = await service.extractMetadata('https://www.instagram.com/reel/Audio12345/');
  assert.throws(() => audioMetadata({...tooLong, items: [{...tooLong.items[0], durationSeconds: 601}]}), error => error.code === 'UNSUPPORTED_OPERATION');
  assert.throws(() => audioMetadata({...tooLong, items: [{...tooLong.items[0], formats: tooLong.items[0].formats.filter(format => format.needsMerge)}]}), error => error.code === 'UNSUPPORTED_MEDIA_TYPE');
  mode = 'photo';
  await assert.rejects(service.extractMetadata('https://www.instagram.com/p/Photo12345/', 'audio'), error => error.code === 'UNSUPPORTED_MEDIA_TYPE');
  mode = 'private';
  await assert.rejects(service.extractMetadata('https://www.instagram.com/reel/Private12345/', 'audio'), error => error.code === 'LOGIN_REQUIRED');
  for (const url of ['https://evil.example/reel/Audio12345/', 'http://127.0.0.1/', 'https://www.instagram.com/stories/fixture/123456/', '@fixture']) {
    await assert.rejects(service.extractMetadata(url, 'audio'));
  }
  assert.throws(() => validation.validatePublicMediaInput('https://www.instagram.com/stories/fixture/123456/'), error => error.statusCode === 410);
  const occupied = path.join(directory, 'occupied.mp3'); fs.writeFileSync(occupied, 'preserve');
  await assert.rejects(encodeMp3(source, occupied, 128, 100000, args => run(service.ffmpegPath, args, 10000)));
  assert.equal(fs.readFileSync(occupied, 'utf8'), 'preserve');
  await assert.rejects(encodeMp3(source, path.join(directory, 'limited.mp3'), 320, 1000, args => run(service.ffmpegPath, args, 10000)), error => error.code === 'FILE_TOO_LARGE');
  assert.equal(fs.existsSync(path.join(directory, 'limited.mp3')), false);

  // Actual queue, progress and MIME projection, then existing attachment endpoint.
  mode = 'video';
  const manager = new DownloadManagerService(service, {tempDir: directory, minFreeDiskBytes: 0});
  manager.getStorageHealth = async () => ({ok: true});
  const job = await manager.createJob({url: 'https://www.instagram.com/reel/Audio12345/', formatId: 'mp3-192', trackAnalytics: false});
  for (let i = 0; i < 500 && !['completed', 'failed'].includes(job.status); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(job.status, 'completed', JSON.stringify(job.error)); assert.equal(job.category, 'audio'); assert.equal(job.conversionStarted, true);
  const singleton = require.resolve('../src/app/api/singleton.ts');
  require.cache[singleton] = {id: singleton, filename: singleton, loaded: true, exports: {getApiContext: () => ({downloadManager: manager})}};
  const {GET} = require('../src/app/api/media/download/[jobId]/route.ts');
  const {NextRequest} = require('next/server');
  const response = await GET(new NextRequest('http://localhost/api/media/download/' + job.jobId), {params: Promise.resolve({jobId: job.jobId})});
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.match(response.headers.get('content-disposition'), /\.mp3"$/); assert.equal((await response.arrayBuffer()).byteLength, job.filesizeBytes);
  const safe = analyticsEvent('audio_conversion_started', {media_type: 'audio', download_format: 'mp3', source_page: '/audio-downloader', username: 'private', url: 'secret'});
  assert.equal(safe.params.download_status, 'converting'); assert.equal(safe.params.media_type, 'audio'); assert.equal(safe.params.download_format, 'mp3'); assert.ok(!JSON.stringify(safe).includes('private'));
  assert.equal(manager.activeCount, 0);
  const slow = path.join(directory, 'slow-ffmpeg.js');
  fs.writeFileSync(slow, "if(process.argv.includes('-c:a'))setTimeout(()=>{},100000);else{process.stderr.write('Duration: 00:00:01.00, Audio: aac');process.exitCode=1;}");
  const cancelService = new YtDlpService({ffmpegBinaryPath: slow});
  const cancelRun = cancelService.runSubprocess.bind(cancelService);
  cancelService.runSubprocess = (binary, args, ...rest) => binary === cancelService.ytDlpPath ? service.runSubprocess(binary, args, ...rest) : cancelRun(binary, args, ...rest);
  let cancelTimer;
  const cancelled = cancelService.downloadMedia('https://www.instagram.com/reel/Audio12345/', {jobId: 'cancel_audio', formatId: 'mp3-128', outputDir: directory,
    onProgress: progress => {if(progress.conversionStarted && !cancelTimer)cancelTimer = setTimeout(() => cancelService.cancelDownload('cancel_audio'), 150);}});
  await assert.rejects(cancelled, error => error.code === 'JOB_CANCELLED');
  clearTimeout(cancelTimer);
  assert.equal(cancelService.activeTransfers.size, 0);
  assert.ok(!fs.readdirSync(directory).some(file => file.startsWith('cancel_audio_')), 'Cancellation cleans intermediate and partial MP3 files');
  fs.writeFileSync('reports/audio-tests.json', JSON.stringify({passed: true, realFfmpeg: true, offlineMediaFixtures: true, liveInstagramVerified: false, qualities: [128, 192, 320], sourceCategories: ['reel', 'video'], tests: ['real MP3 conversion/decoding/non-silent signal', 'headers/signature', 'duration/size/process limits', 'source cleanup', 'photo/private/URL rejection', 'queue/conversion status', 'safe analytics']}, null, 2) + '\n');
  console.log('PASS: real FFmpeg MP3 at 128/192/320 kbps from Reel/video fixtures; decode/non-silent audio; MIME/filename/signature; resource limits; cleanup; photo/private/invalid rejection; queue/conversion status; safe analytics. No live Instagram success claimed.');
}
main().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => fs.rmSync(directory, {recursive: true, force: true}));
