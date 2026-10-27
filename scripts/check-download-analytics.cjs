const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
const {analyticsEvent, createAnalytics, consentKey} = require('../src/lib/analytics.ts');
const source = fs.readFileSync('public/saveframe.js', 'utf8');
const parsed = ts.createSourceFile('saveframe.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);

function fixture({consent = 'granted', states = []} = {}) {
  const listeners = new Map(), emissions = [], timers = [];
  const window = {
    location: {origin: 'https://saveframe.site', hostname: 'saveframe.site', pathname: '/reels-downloader', search: ''},
    navigator: {}, document: {cookie: ''},
    localStorage: {getItem: key => key === consentKey ? consent : null, setItem() {}},
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  let loads = 0, polls = 0;
  const controller = createAnalytics(window, 'G-0EYTT0CW4Z', window.location.origin, true, () => loads++);
  const sandbox = {
    window, previewedItems: new WeakMap(),
    analytics: (name, params, operation) => {
      emissions.push({name, params, operation});
      listeners.get('saveframe:analytics-event')?.({detail: {name, params, operation}});
    },
    setTimeout: fn => timers.push(fn),
    fetch: async () => {
      polls++;
      const next = states.shift();
      if (next instanceof Error) throw next;
      return {ok: Boolean(next), json: async () => ({job: next})};
    },
    URL, Date, Set, WeakMap, encodeURIComponent, AbortSignal,
  };
  const names = ['downloadParameters', 'createDownloadTracking', 'monitorDownloadHandoff', 'recordMediaPreview'];
  vm.createContext(sandbox);
  vm.runInContext(names.map(name => functions.get(name)).join('\n'), sandbox);
  const commands = () => Array.from(window.saveframeDataLayer || [], args => Array.from(args));
  const events = () => commands().filter(command => command[0] === 'event' && command[1] !== 'page_view');
  async function flush() {
    for (let i = 0; i < 20; i++) {
      timers.splice(0).forEach(fn => fn());
      await Promise.resolve();
    }
  }
  return {sandbox, window, controller, emissions, commands, events, flush, polls: () => polls, loads: () => loads};
}

function media(category, type = 'video', ext = 'mp4') {
  return {category, canonicalUrl: 'https://instagram.com/private-user/secret', uploader: {username: 'private-user'}, items: [
    {index: 0, mediaType: type, formats: [{formatId: 'private-format-id', ext}]},
    {index: 1, mediaType: 'video', formats: [{formatId: 'second', ext: 'mp4'}]},
  ]};
}

async function clientTests() {
  let test = fixture();
  for (const [category, type, ext, expected] of [
    ['reel', 'video', 'mp4', 'reel'], ['video', 'video', 'mp4', 'video'],
    ['photo', 'photo', 'jpg', 'photo'], ['carousel', 'photo', 'jpg', 'photo'],
    ['carousel', 'video', 'mp4', 'video'], ['audio', 'audio', 'mp3', 'audio'],
    ['reel', 'video', 'm4a', 'reel'],
  ]) {
    const params = test.sandbox.downloadParameters(media(category, type, ext), {itemIndex: 0, formatId: 'private-format-id'});
    assert.equal(params.media_type, expected);
    assert.equal(params.download_format, ext);
  }
  const zip = test.sandbox.downloadParameters(media('carousel'), {zipCarousel: true});
  assert.equal(zip.media_type, 'zip'); assert.equal(zip.download_format, 'zip'); assert.equal(zip.download_method, 'bulk');
  const selected = test.sandbox.downloadParameters(media('carousel', 'photo', 'jpg'), {itemIndex: 1, formatId: 'second'});
  assert.equal(selected.media_type, 'video');
  // Execute the actual click handler, including duplicate clicks and automatic link activation.
  for (const outcome of ['handed_off', 'EXTRACTOR_FAILURE', 'JOB_CANCELLED']) {
    test = fixture();
    let click, posts = 0, activations = 0;
    const button = {addEventListener: (_, callback) => {click = callback;}};
    Object.assign(test.sandbox, {
      resolvedMedia: media('reel'), pendingDownloads: new Map(),
      downloadRequest: () => ({url: 'https://instagram.com/reel/private', itemIndex: 0, formatId: 'private-format-id'}),
      syncDownloadButtons() {}, t: value => value, showToast() {}, setValidationBanner() {},
      apiError: error => error?.message || 'Failed', localError: () => 'Failed',
      document: {
        querySelectorAll: () => [button], body: {appendChild() {}},
        createElement: () => ({click: () => activations++, remove() {}}),
      },
      fetch: async (_, options) => {
        if (options?.method === 'POST') {
          posts++;
          return {ok: true, json: async () => ({jobId: 'secret-job-id'})};
        }
        return {ok: true, json: async () => ({job: outcome === 'handed_off'
          ? {status: 'completed', deliveryStatus: 'handed_off', safeFilename: 'private-user.mp4'}
          : {status: outcome === 'JOB_CANCELLED' ? 'cancelled' : 'failed', error: {code: outcome, message: 'secret-message'}}})};
      },
    });
    vm.runInContext(functions.get('attachDownloadTriggers') + '\nattachDownloadTriggers();', test.sandbox);
    const first = click(), duplicate = click();
    await test.flush(); await Promise.all([first, duplicate]);
    assert.equal(posts, 1, 'Double clicks must create only one job/start');
    assert.equal(activations, outcome === 'handed_off' ? 1 : 0);
    assert.deepEqual(test.events().map(event => event[1]), outcome === 'handed_off'
      ? ['download_started', 'download_prepared', 'download_delivered']
      : ['download_started', 'download_failed']);
    for (const secret of ['private-user', 'secret-job-id', 'secret-message', 'instagram.com']) {
      assert.ok(!JSON.stringify(test.commands()).includes(secret));
    }
  }
  test = fixture();
  const tracking = test.sandbox.createDownloadTracking(zip);
  tracking.transition('download_started'); tracking.transition('download_started');
  tracking.transition('download_delivered'); // No handoff before preparation.
  tracking.transition('download_prepared'); tracking.transition('download_prepared');
  const poll = test.sandbox.monitorDownloadHandoff('secret-job-id', tracking, '/reels-downloader');
  await test.flush(); await poll;
  assert.deepEqual(test.events().map(event => event[1]), ['download_started', 'download_prepared']);
  assert.equal(test.events()[0][2].download_status, 'requested');

  test = fixture({states: [{deliveryStatus: 'streaming'}, {deliveryStatus: 'handed_off'}]});
  const success = test.sandbox.createDownloadTracking(zip);
  success.transition('download_started'); success.transition('download_prepared');
  const handoff = test.sandbox.monitorDownloadHandoff('secret-job-id', success, '/reels-downloader');
  await test.flush(); await handoff;
  success.transition('download_delivered'); success.transition('download_failed');
  assert.deepEqual(test.events().map(event => event[1]), ['download_started', 'download_prepared', 'download_delivered']);
  assert.equal(test.events().at(-1)[2].download_status, 'handed_off');
  const detail = test.emissions.at(-1);
  // Replayed dispatch and controller remount must not replay the same operation.
  const replay = () => test.sandbox.analytics(detail.name, detail.params, detail.operation);
  replay(); assert.equal(test.events().length, 3);
  test.controller.dispose();
  createAnalytics(test.window, 'G-0EYTT0CW4Z', test.window.location.origin, true, () => {});
  replay(); assert.equal(test.events().length, 3);

  for (const code of ['DELIVERY_CANCELLED', 'DELIVERY_STREAM_ERROR', 'FILE_UNAVAILABLE']) {
    test = fixture({states: [{deliveryStatus: 'failed', deliveryErrorCode: code}]});
    const failure = test.sandbox.createDownloadTracking(zip);
    failure.transition('download_started'); failure.transition('download_prepared');
    const pending = test.sandbox.monitorDownloadHandoff('secret-job-id', failure, '/reels-downloader');
    await test.flush(); await pending;
    assert.equal(test.events().at(-1)[1], 'download_failed');
    assert.equal(test.events().at(-1)[2].failure_stage, 'handoff');
    assert.equal(test.events().at(-1)[2].download_status, code === 'DELIVERY_CANCELLED' ? 'cancelled' : 'failed');
  }
  test = fixture({states: [new Error('secret network error')]});
  const uncertain = test.sandbox.createDownloadTracking(zip);
  uncertain.transition('download_started'); uncertain.transition('download_prepared');
  const lost = test.sandbox.monitorDownloadHandoff('secret-job-id', uncertain, '/reels-downloader');
  await test.flush(); await lost;
  assert.equal(test.events().length, 2, 'Unknown transport outcome must not fabricate a failure or handoff');

  test = fixture({states: [{deliveryStatus: 'handed_off'}]});
  test.window.location.pathname = '/blog';
  await test.sandbox.monitorDownloadHandoff('secret-job-id', test.sandbox.createDownloadTracking(zip), '/reels-downloader');
  assert.equal(test.polls(), 0, 'Stop monitoring across navigation');

  for (const consent of ['granted', 'denied', 'unset']) {
    test = fixture({consent});
    const attempt = test.sandbox.createDownloadTracking(zip);
    attempt.transition('download_started');
    attempt.transition('download_failed', {error_code: 'JOB_CANCELLED'});
    assert.equal(test.events().length, consent === 'granted' ? 2 : 0);
    assert.equal(test.loads(), consent === 'granted' ? 1 : 0);
  }
  test = fixture();
  for (const code of ['LOGIN_REQUIRED', 'EXTRACTOR_FAILURE', 'JOB_CANCELLED']) {
    const attempt = test.sandbox.createDownloadTracking(zip);
    attempt.transition('download_started'); attempt.transition('download_failed', {error_code: code});
    attempt.transition('download_prepared'); attempt.transition('download_failed');
  }
  assert.equal(test.events().length, 6);

  // Confirmed media load/play only, deduplicated per resolved item; no download events.
  test = fixture();
  const resolved = media('carousel', 'photo', 'jpg'), callbacks = [];
  const image = {complete: false, naturalWidth: 0, addEventListener: (_, fn) => callbacks.push(fn)};
  test.sandbox.recordMediaPreview(resolved, resolved.items[0], null, image, 'load');
  assert.equal(test.events().length, 0);
  callbacks[0](); callbacks[0]();
  test.sandbox.recordMediaPreview(resolved, resolved.items[0], null, {...image, complete: true, naturalWidth: 40}, 'load');
  assert.equal(test.events().length, 1);
  test.sandbox.recordMediaPreview(resolved, resolved.items[1], resolved.items[1].formats[0], image, 'playing');
  callbacks.at(-1)(); assert.equal(test.events().length, 2);
  assert.ok(test.events().every(event => event[1] === 'media_previewed'));

  const sensitive = {media_type: 'private-user', download_format: 'secret.mp4', download_method: 'secret',
    source_page: '/?instagramUrl=private-user', download_status: 'saved', error_code: 'secret-error',
    username: 'private-user', job_id: 'secret-job-id', url: 'https://instagram.com/private-user', cookies: 'secret-cookie'};
  for (const name of ['download_started', 'download_prepared', 'download_delivered', 'download_failed', 'media_previewed']) {
    const safe = analyticsEvent(name, sensitive);
    for (const secret of ['private-user', 'secret', 'instagram.com', 'saved']) assert.ok(!JSON.stringify(safe).includes(secret));
    assert.ok(!('job_id' in safe.params));
  }
}

async function serverTests() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-ga4-handoff-'));
  const filename = path.join(directory, 'fixture.mp4');
  fs.writeFileSync(filename, Buffer.alloc(256 * 1024, 1));
  let job, events = [];
  const reset = (tracked = true) => {
    events = [];
    job = {jobId: 'secret-job-id', status: 'completed', category: 'video', outputFilePath: filename,
      analyticsId: tracked ? 'private-operational-id' : undefined, mimeType: 'video/mp4', safeFilename: 'private-user.mp4'};
  };
  const singleton = require.resolve('../src/app/api/singleton.ts');
  const analytics = require.resolve('../src/admin/analytics.ts');
  require.cache[singleton] = {id: singleton, filename: singleton, loaded: true, exports: {
    getApiContext: () => ({downloadManager: {getJob: () => job, retainJobFile: () => () => {}}}),
  }};
  require.cache[analytics] = {id: analytics, filename: analytics, loaded: true, exports: {jobEvent: (...args) => events.push(args)}};
  const {NextRequest} = require('next/server');
  const {GET} = require('../src/app/api/media/download/[jobId]/route.ts');
  const status = require('../src/app/api/media/jobs/[jobId]/route.ts').GET;
  const context = {params: Promise.resolve({jobId: 'secret-job-id'})};
  const request = (suffix = '', options) => new NextRequest('http://localhost/api/media/download/secret-job-id' + suffix, options);
  try {
    reset();
    const response = await GET(request(), context);
    assert.notEqual(job.deliveryStatus, 'handed_off');
    await response.arrayBuffer();
    assert.equal(job.deliveryStatus, 'handed_off');
    const snapshot = (await (await status(request(), context)).json()).job;
    assert.equal(snapshot.deliveryStatus, 'handed_off');
    assert.equal(snapshot.analyticsId, undefined);
    assert.equal(snapshot.outputFilePath, undefined);
    assert.equal(events.filter(event => event[1] === 'delivery_completed').length, 1);
    // Repeat/failed requests cannot erase an already confirmed handoff.
    await (await GET(request(), context)).body.cancel();
    assert.equal(job.deliveryStatus, 'handed_off');
    reset();
    await (await GET(request(), context)).body.cancel();
    assert.equal(job.deliveryStatus, 'failed'); assert.equal(job.deliveryErrorCode, 'DELIVERY_CANCELLED');
    reset(); job.outputFilePath = path.join(directory, 'missing');
    assert.equal((await GET(request(), context)).status, 404);
    assert.equal(job.deliveryErrorCode, 'FILE_UNAVAILABLE');
    reset();
    const originalStream = fs.createReadStream;
    try {
      fs.createReadStream = () => ({destroy() {}, [Symbol.asyncIterator]: () => ({next: async () => {throw Error('secret stream error');}})});
      const broken = await GET(request(), context);
      await assert.rejects(() => broken.arrayBuffer());
      assert.equal(job.deliveryErrorCode, 'DELIVERY_STREAM_ERROR');
      assert.equal(events.filter(event => event[1] === 'delivery_failed').length, 1);
    } finally {
      fs.createReadStream = originalStream;
    }
    for (const tracked of [true, false]) {
      reset(tracked);
      await (await GET(request('?preview=1', {headers: {range: 'bytes=0-3'}}), context)).arrayBuffer();
      await GET(request('', {method: 'HEAD'}), context);
      assert.equal(job.deliveryStatus, undefined); assert.equal(events.length, 0);
    }
  } finally {
    await new Promise(resolve => setTimeout(resolve, 20));
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

(async () => {
  await clientTests();
  await serverTests();
  console.log('PASS: selected media/format/ZIP classification; start/preparation/handoff/failure deduplication; cancellation; preview isolation; consent; navigation; sensitive-field rejection; real local response streaming and job-status correlation. No Google requests sent.');
})().catch(error => {console.error(error); process.exitCode = 1;});
