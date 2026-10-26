import type { Stats } from 'node:fs';
import * as path from 'node:path';
import { DownloaderAppError, NormalizedMediaResult } from '../types/media.types';
import { ValidatedInstagramUrl, validateMediaInput } from '../security/url-validator';
import { InstagramHttpClient, StoryMime } from './instagram-http.service';

// Session files and optional executables are runtime inputs, never build assets.
// Node 24's builtin lookup prevents Next's file tracer from walking private temp
// directories while still using the ordinary, permission-checked filesystem API.
const fs:typeof import('node:fs')=process.getBuiltinModule('fs');
const os:typeof import('node:os')=process.getBuiltinModule('os');

export interface AuthorizedStoryAccess {
  requesterId: string;
  allowedUsernames: readonly string[];
  cookieFile: string;
}
export interface StoryContext { signal: AbortSignal; deadline: number; access?: AuthorizedStoryAccess; cookie?: string }
export type StoryRunner = (binary: string, args: string[], timeout: number, jobId?: string, progress?: (line: string) => void, signal?: AbortSignal, outputLimit?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
export interface StoryCandidate {
  id: string; url: string; mediaType: 'photo' | 'video'; thumbnail?: string;
  width?: number; height?: number; duration?: number; hasAudio?: boolean; expires?: number;
}
export interface StoryPipelineOptions {
  primary: (url: ValidatedInstagramUrl, context: StoryContext) => Promise<StoryCandidate[]>;
  runner: StoryRunner;
  mapError: (stderr: string) => DownloaderAppError;
  http?: InstagramHttpClient;
  timeoutMs?: number;
  galleryEnabled?: boolean;
  galleryBinary?: string;
  maxFileBytes?: number;
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const dimension = (value: unknown) => { const n = number(value); return n && Number.isInteger(n) && n <= 32768 ? n : undefined; };
const id = (value: unknown) => typeof value === 'string' ? value.split('_')[0] : Number.isSafeInteger(value) ? String(value) : '';
const recoverable = new Set(['EXTRACTOR_FAILURE', 'DOWNLOAD_TIMEOUT', 'YTDLP_NOT_INSTALLED']);
const unavailable = () => new DownloaderAppError('EXTRACTOR_FAILURE', 'No accessible media for this exact story was returned by Instagram.', 502, true);
// Node 24's JSON reviver source preserves Instagram's 64-bit numeric identifiers.
// Do not round a story ID through JavaScript's Number representation.
export function parseStoryJson(text:string):any{
  return JSON.parse(text,(key:string,value:unknown,context?:{source?:string})=>
    ['id','pk','media_id','story_id','post_id'].includes(key)&&typeof value==='number'&&!Number.isSafeInteger(value)&&/^\d+$/.test(context?.source||'')?context!.source:value);
}
export function storyBudget(value: unknown, fallback = 45000) { const n = Number(value); return Number.isFinite(n) ? Math.max(5000, Math.min(60000, n)) : fallback; }

/** Validate an operator-supplied, requester-scoped session. Public APIs never call this. */
export function authorizedStoryCookie(validated: ValidatedInstagramUrl, access: AuthorizedStoryAccess): string {
  if (process.env.STORY_AUTH_ENABLED !== '1' || typeof access.requesterId!=='string' || !Array.isArray(access.allowedUsernames) || typeof access.cookieFile!=='string' || !/^[a-zA-Z0-9@._-]{1,128}$/.test(access.requesterId) ||
      !access.allowedUsernames.some(user => /^[a-zA-Z0-9._]{1,30}$/.test(user) && user.toLowerCase() === validated.username?.toLowerCase())) {
    throw new DownloaderAppError('PRIVATE_CONTENT', 'This requester is not authorized for this story.', 403);
  }
  if (!path.isAbsolute(access.cookieFile)) throw new DownloaderAppError('PRIVATE_CONTENT', 'An external private session file is required.', 403);
  const root = fs.realpathSync(process.cwd());
  let file:string,stat:Stats;
  try{file=fs.realpathSync(access.cookieFile);stat=fs.statSync(file);}catch{throw new DownloaderAppError('LOGIN_REQUIRED','The authorized session file is unavailable.',403);}
  const relative = path.relative(root, file);
  if ((!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) || !stat.isFile() || stat.size > 65536 ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw new DownloaderAppError('PRIVATE_CONTENT', 'The session file must be private and outside the application checkout.', 403);
  const cookies = new Map<string,string>();
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.startsWith('#HttpOnly_') ? raw.slice(10) : raw;
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    if (columns.length !== 7) continue;
    const [domain, , cookiePath, secure, expires, name, value] = columns;
    if (!['instagram.com', 'www.instagram.com', '.instagram.com'].includes(domain.toLowerCase()) || cookiePath !== '/' || secure !== 'TRUE' ||
        !['sessionid', 'csrftoken', 'ds_user_id'].includes(name) || /[\r\n;]/.test(value) || !value || value.length > 8192) continue;
    if (!Number.isFinite(Number(expires)) || (Number(expires) !== 0 && Number(expires) * 1000 <= Date.now())) continue;
    cookies.set(name,value);
  }
  if (!cookies.has('sessionid')) throw new DownloaderAppError('LOGIN_REQUIRED', 'The authorized session is missing or expired.', 403);
  const header=[...cookies].map(([name,value])=>name+'='+value).join('; ');
  if(header.length>8192)throw new DownloaderAppError('PRIVATE_CONTENT','The authorized session is invalid.',403);
  return header;
}

/** Only a matching story ID can become a candidate; unrelated page images are ignored. */
export function instagramStoryCandidates(payload: unknown, validated: ValidatedInstagramUrl): StoryCandidate[] {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
  const found: StoryCandidate[] = []; let visited = 0;
  while (visited < queue.length && visited < 10000 && found.length < 36) {
    const { value, depth } = queue[visited++];
    if (!value || typeof value !== 'object' || depth > 24) continue;
    const entry = value as any;
    if (!Array.isArray(entry) && id(entry.pk ?? entry.id ?? entry.media_id) === validated.storyId) {
      if (entry.user?.username && String(entry.user.username).toLowerCase() !== validated.username?.toLowerCase()) throw new DownloaderAppError('PRIVATE_CONTENT', 'The returned story does not match the requested account.', 403);
      const expires = number(entry.expiring_at ?? entry.expires_at);
      if (expires && expires * 1000 <= Date.now()) throw new DownloaderAppError('EXPIRED_STORY', 'This Instagram story has expired.', 404);
      const isPhoto=entry.media_type===1||entry.__typename==='GraphImage';
      const images = Array.isArray(entry.image_versions2?.candidates) ? entry.image_versions2.candidates :
        isPhoto&&Array.isArray(entry.display_resources)?entry.display_resources.map((image:any)=>({url:image.src,width:image.config_width,height:image.config_height})):
        isPhoto&&typeof entry.display_url==='string'?[{url:entry.display_url,width:entry.dimensions?.width,height:entry.dimensions?.height}]:[];
      const videos = Array.isArray(entry.video_versions) ? entry.video_versions : [];
      const poster = images.find((image: any) => typeof image.url === 'string')?.url;
      const versions = videos.length ? videos : isPhoto ? images : [];
      for (const version of versions.slice(0, 12)) if (typeof version?.url === 'string') found.push({
        id: validated.storyId!, url: version.url, mediaType: videos.length ? 'video' : 'photo',
        thumbnail: videos.length ? poster : version.url,
        width: dimension(version.width ?? entry.original_width), height: dimension(version.height ?? entry.original_height),
        duration: number(entry.video_duration), hasAudio: typeof entry.has_audio === 'boolean' ? entry.has_audio : undefined, expires,
      });
    }
    for (const child of Object.values(entry).slice(0, 200)) if (queue.length < 10000 && child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });
  }
  return found;
}

export function ytDlpStoryCandidates(raw: any, validated: ValidatedInstagramUrl): StoryCandidate[] {
  if (!raw || typeof raw !== 'object') throw unavailable();
  const entries = raw._type === 'playlist' && Array.isArray(raw.entries) ? raw.entries : [raw];
  if (!entries.length) throw new DownloaderAppError('NO_ACTIVE_STORIES', 'No available story media was returned.', 404);
  const matches = entries.filter((entry: any) => entry && id(entry.id) === validated.storyId);
  if (matches.length !== 1) throw unavailable();
  const entry = matches[0];
  const formats = Array.isArray(entry.formats) ? entry.formats : [];
  const separateAudio = formats.some((format: any) => format.vcodec === 'none' && format.acodec && format.acodec !== 'none');
  const videos = formats.filter((format: any) => typeof format.url === 'string' && format.vcodec !== 'none' &&
    (format.vcodec || format.width || format.height) && !format.manifest_url && !/m3u8|dash/.test(String(format.protocol || '')) &&
    !(format.acodec === 'none' && separateAudio));
  if (videos.length) return videos.slice(0, 12).map((format: any) => ({
    id: validated.storyId!, url: format.url, mediaType: 'video', thumbnail: entry.thumbnail || entry.thumbnails?.at(-1)?.url,
    width: dimension(format.width ?? entry.width), height: dimension(format.height ?? entry.height), duration: number(entry.duration),
    hasAudio: format.acodec ? format.acodec !== 'none' : format.has_audio === true,
  }));
  // A thumbnail alone is never treated as an actual story image.
  if (entry.media_type === 1 || entry.__typename === 'GraphImage') return instagramStoryCandidates({ ...entry, id: validated.storyId, image_versions2: entry.image_versions2 }, validated);
  throw unavailable();
}

export function galleryStoryCandidates(raw: unknown, validated: ValidatedInstagramUrl): StoryCandidate[] {
  if (!Array.isArray(raw) || raw.length > 100) throw unavailable();
  const found: StoryCandidate[] = [];
  for (const record of raw) {
    if (!Array.isArray(record) || record[0] !== 3 || typeof record[1] !== 'string') continue;
    const metadata = record[2];
    if (!metadata || metadata.type !== 'story' || id(metadata.media_id) !== validated.storyId) continue;
    if (metadata.username && metadata.username.toLowerCase() !== validated.username?.toLowerCase()) throw new DownloaderAppError('PRIVATE_CONTENT', 'Story account mismatch.', 403);
    const video = metadata.extension === 'mp4';
    if (!video && !['jpg', 'jpeg', 'webp'].includes(metadata.extension)) continue;
    found.push({ id: validated.storyId!, url: record[1], mediaType: video ? 'video' : 'photo', thumbnail: video ? metadata.display_url : record[1], width: dimension(metadata.width), height: dimension(metadata.height), duration: number(metadata.duration) });
  }
  if (found.length !== 1) throw unavailable();
  return found;
}

export class StoryExtractionPipeline {
  readonly http: InstagramHttpClient;
  private readonly timeout: number;
  constructor(private readonly options: StoryPipelineOptions) {
    this.http = options.http || new InstagramHttpClient();
    this.timeout = storyBudget(options.timeoutMs ?? process.env.STORY_EXTRACTION_TIMEOUT_MS ?? 45000);
  }
  async galleryAvailability(): Promise<{ available: boolean; enabled: boolean }> {
    const enabled = this.options.galleryEnabled ?? process.env.STORY_GALLERY_DL_ENABLED === '1';
    const binary = this.galleryBinary();
    try{return { enabled, available: !!binary && fs.statSync(binary).isFile() };}catch{return {enabled,available:false};}
  }
  private galleryBinary() {
    const configured = this.options.galleryBinary || process.env.GALLERY_DL_BINARY_PATH;
    if (configured) return path.isAbsolute(configured) ? configured : undefined;
    const local = path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'Scripts/gallery-dl.exe' : 'bin/gallery-dl');
    return fs.existsSync(local) ? local : undefined;
  }
  async extract(validated: ValidatedInstagramUrl, signal?: AbortSignal, access?: AuthorizedStoryAccess): Promise<NormalizedMediaResult> {
    validated=validateMediaInput(validated.canonicalUrl,'story');
    if(!access)return this.extractScoped(validated,signal);
    const cookie=authorizedStoryCookie(validated,access);
    // yt-dlp can update its cookie file on exit. Give providers a disposable,
    // filtered copy, never the operator's original credential file.
    const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'saveframe-story-session-'));
    try{
      if(process.platform!=='win32')await fs.promises.chmod(directory,0o700);
      const cookieFile=path.join(directory,'session.cookies.txt');
      const rows=cookie.split('; ').map(pair=>{const at=pair.indexOf('=');return '.instagram.com\tTRUE\t/\tTRUE\t0\t'+pair.slice(0,at)+'\t'+pair.slice(at+1);});
      await fs.promises.writeFile(cookieFile,'# Netscape HTTP Cookie File\n'+rows.join('\n')+'\n',{flag:'wx',mode:0o600});
      return await this.extractScoped(validated,signal,{...access,cookieFile},cookie);
    }finally{
      if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(directory).startsWith('saveframe-story-session-'))throw new Error('Unsafe session cleanup target');
      await fs.promises.rm(directory,{recursive:true,force:true});
    }
  }
  private async extractScoped(validated:ValidatedInstagramUrl,signal?:AbortSignal,access?:AuthorizedStoryAccess,cookie?:string):Promise<NormalizedMediaResult>{
    if (validated.category !== 'story' || !validated.storyId || !validated.username) throw new DownloaderAppError('INVALID_STORY_LINK', 'A direct story URL is required.', 400);
    // Reserve a bounded termination grace inside the overall extraction budget.
    const providerBudget=this.timeout-2000;
    const deadline = Date.now() + providerBudget;
    const total = signal ? AbortSignal.any([signal, AbortSignal.timeout(providerBudget)]) : AbortSignal.timeout(providerBudget);
    const context: StoryContext = { deadline, signal: total, access, cookie };
    const remaining = () => { if (total.aborted || Date.now()>=deadline) throw new DownloaderAppError(signal?.aborted ? 'JOB_CANCELLED' : 'DOWNLOAD_TIMEOUT', signal?.aborted ? 'Story request was cancelled.' : 'Story extraction timed out.', signal?.aborted ? 499 : 504, true); return deadline - Date.now(); };
    let last: DownloaderAppError;
    try { return await this.normalize(await this.within(this.options.primary(validated, context),context), validated, context, 'yt-dlp'); }
    catch (error) { if (!(error instanceof DownloaderAppError) || !recoverable.has(error.code)) throw error; last = error; }
    remaining();
    try {
      const body = await this.http.metadata(validated.canonicalUrl, { signal: total, timeoutMs: Math.min(10000, remaining()), cookie: context.cookie });
      const payloads: unknown[] = [];
      if (body.trim().startsWith('{') || body.trim().startsWith('[')) { try { payloads.push(parseStoryJson(body)); } catch {} }
      else for (const match of body.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        if (payloads.length >= 30) break;
        try { payloads.push(parseStoryJson(match[1])); } catch { /* HTML is never evaluated. */ }
      }
      const candidates = payloads.flatMap(payload => instagramStoryCandidates(payload, validated));
      if (!candidates.length) throw unavailable();
      return await this.normalize(candidates, validated, context, 'story-http');
    } catch (error) { if (!(error instanceof DownloaderAppError) || !recoverable.has(error.code)) throw error; last = error; }
    remaining();
    const gallery = await this.galleryAvailability();
    if (!gallery.enabled || !gallery.available) throw last;
    const binary = this.galleryBinary()!;
    const args = ['--config-ignore', '--dump-json', '--no-download', '--retries', '0', '--timeout', '5', '--range', '1', '-o', 'extractor.instagram.videos=merged',
      '-o','extractor.instagram.input=false','-o','extractor.instagram.netrc=false','-o','extractor.instagram.username=null','-o','extractor.instagram.password=null',
      '-o','extractor.instagram.cookies-update=false','-o','extractor.instagram.proxy-env=false',
      ...(access ? ['--cookies', access.cookieFile] : ['-o','extractor.instagram.cookies=null']), '--', validated.canonicalUrl];
    let result:Awaited<ReturnType<StoryRunner>>;
    try{result=await this.within(this.options.runner(binary, args, Math.min(10000, remaining()), undefined, undefined, total, 2 * 1024 * 1024),context);}
    catch(error){if(error instanceof DownloaderAppError&&error.code==='YTDLP_NOT_INSTALLED')throw last;throw error;}
    if (result.exitCode !== 0) throw this.options.mapError(result.stderr);
    let json: unknown; try { json = parseStoryJson(result.stdout); } catch { throw unavailable(); }
    return this.normalize(galleryStoryCandidates(json, validated), validated, context, 'gallery-dl');
  }

  private within<T>(operation:Promise<T>,context:StoryContext):Promise<T>{
    return new Promise((resolve,reject)=>{
      let settled=false,cancellation:DownloaderAppError|undefined,cleanup:ReturnType<typeof setTimeout>|undefined;
      const finish=(value?:T,error?:unknown)=>{if(settled)return;settled=true;context.signal.removeEventListener('abort',abort);if(cleanup)clearTimeout(cleanup);if(cancellation||error)reject(cancellation||error);else resolve(value as T);};
      const abort=()=>{
        cancellation=new DownloaderAppError(context.signal.reason?.name==='TimeoutError'?'DOWNLOAD_TIMEOUT':'JOB_CANCELLED','Story request was cancelled or timed out.',context.signal.reason?.name==='TimeoutError'?504:499,true);
        // Keep the concurrency slot while the subprocess closes, rather than
        // letting repeated cancelled requests accumulate terminating processes.
        cleanup=setTimeout(()=>finish(undefined,cancellation),2000);
      };
      context.signal.addEventListener('abort',abort,{once:true});
      operation.then(value=>finish(value),error=>finish(undefined,error));
      if(context.signal.aborted)abort();
    });
  }

  private async normalize(candidates: StoryCandidate[], validated: ValidatedInstagramUrl, context: StoryContext, source: NormalizedMediaResult['extractorSource']): Promise<NormalizedMediaResult> {
    if (!candidates.length || candidates.length > 36 || candidates.some(candidate => candidate.id !== validated.storyId)) throw unavailable();
    for (const candidate of candidates) {
      this.http.validateUrl(candidate.url, true);
      if (candidate.thumbnail) this.http.validateUrl(candidate.thumbnail, true);
    }
    const candidate = [...candidates].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
    if (context.signal.aborted || Date.now() >= context.deadline) throw new DownloaderAppError('DOWNLOAD_TIMEOUT', 'Story extraction timed out.', 504, true);
    const proof = await this.http.probe(candidate.url, { signal: context.signal, timeoutMs: Math.min(5000, context.deadline - Date.now()) });
    if ((candidate.mediaType === 'video') !== (proof.mime === 'video/mp4')) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Story media does not match its metadata.', 422);
    if (proof.bytes && proof.bytes > (this.options.maxFileBytes || 150 * 1024 * 1024)) throw new DownloaderAppError('FILE_TOO_LARGE', 'Story media exceeds the download size limit.', 413);
    const ext = proof.mime === 'video/mp4' ? 'mp4' : proof.mime === 'image/webp' ? 'webp' : 'jpg';
    const width = dimension(candidate.width), height = dimension(candidate.height);
    const resolution = width && height ? `${width}x${height}` : 'Source resolution';
    return {
      id: validated.storyId!, shortcode: validated.storyId!, canonicalUrl: validated.canonicalUrl, category: 'story',
      title: `Story by @${validated.username}`, uploader: { username: validated.username! }, itemCount: 1, isCarousel: false, supportsZipDownload: false,
      items: [{ index: 0, itemId: validated.storyId!, shortcode: validated.storyId!, mediaType: candidate.mediaType, title: `Story by @${validated.username}`,
        thumbnailUrl: candidate.thumbnail || '', width, height, aspectRatio: width && height ? `${width}:${height}` : 'Source resolution', durationSeconds: number(candidate.duration),
        formats: [{ formatId: 'story-original', label: width && height ? `${width}×${height}` : 'Source resolution', ext, Container: ext === 'mp4' ? 'MP4' : ext === 'webp' ? 'WebP' : 'JPEG',
          width, height, resolution, hasVideo: candidate.mediaType === 'video', hasAudio: candidate.hasAudio === true, needsMerge: false, filesizeBytes: proof.bytes,
          filesizeFormatted: proof.bytes ? `${(proof.bytes / (1024 * 1024)).toFixed(2)} MB` : 'Size unavailable', directUrl: candidate.url },
          ...(candidate.mediaType === 'video' && candidate.hasAudio === true ? [{
            formatId: 'story-audio', sourceFormatId: 'story-original', label: 'Audio Track Only (M4A)', ext: 'm4a' as const,
            Container: 'M4A Audio', resolution: 'Audio Only', hasVideo: false, hasAudio: true, needsMerge: false, filesizeFormatted: '', directUrl: candidate.url,
          }] : [])],
      }], extractorSource: source,
    };
  }
}
