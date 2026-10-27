import fs from 'node:fs';
import path from 'node:path';
import {DownloaderAppError, NormalizedMediaResult} from '../types/media.types';

export const audioQualities = [128, 192, 320] as const;
export const isMp3Format = (value?: string) => /^mp3-(128|192|320)$/.test(value || '');

export function audioMetadata(source: NormalizedMediaResult): NormalizedMediaResult {
  const item = source.items.find(item => item.mediaType === 'video' && item.formats.some(format => format.hasAudio && !format.needsMerge));
  if (!item) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'This post has no accessible video audio track.', 422);
  if (item.durationSeconds && item.durationSeconds > 600) throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'Audio extraction supports videos up to 10 minutes.', 422);
  return {...source, category: 'audio', isCarousel: false, supportsZipDownload: false, itemCount: 1, items: [{...item, mediaType: 'audio', formats: audioQualities.map(bitrate => ({
    formatId: `mp3-${bitrate}`, label: bitrate === 128 ? 'Standard · 128 kbps MP3' : bitrate === 192 ? 'High · 192 kbps MP3' : 'Best available · up to 320 kbps MP3',
    ext: 'mp3', Container: 'MP3 Audio', resolution: `${bitrate} kbps`, hasVideo: false, hasAudio: true, needsMerge: false, filesizeFormatted: '',
  }))}]};
}

type Runner = (args: string[], timeout: number) => Promise<{exitCode: number; stderr: string; stdout: string}>;
export async function encodeMp3(source: string, destination: string, bitrate: number, maxBytes: number, runner: Runner) {
  if (!audioQualities.includes(bitrate as typeof audioQualities[number])) throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'Choose a supported MP3 quality.', 400);
  const probe = await runner(['-nostdin', '-hide_banner', '-max_alloc', '67108864', '-threads', '1', '-format_whitelist', 'mov,mp3', '-protocol_whitelist', 'file,pipe', '-i', source], 10000);
  const duration = probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const seconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600 || !/Audio:/.test(probe.stderr)) {
    throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Audio must contain a valid track with a duration of up to 10 minutes.', 422);
  }
  let owned = false;
  try {
    const file = await fs.promises.open(destination, 'wx', 0o600); owned = true; await file.close();
    const cap = Math.min(maxBytes, 32 * 1024 * 1024);
    const sourceBitrate = Number(probe.stderr.match(/Audio:[^\n]*,\s*(\d+)\s*kb\/s/)?.[1]);
    const copy = /Input #0, mp3,/.test(probe.stderr) && (sourceBitrate === bitrate || (bitrate === 320 && sourceBitrate > 0 && sourceBitrate < 320));
    const result = await runner(['-nostdin', '-hide_banner', '-y', '-max_alloc', '67108864', '-threads', '1', '-filter_threads', '1', '-format_whitelist', 'mov,mp3', '-protocol_whitelist', 'file,pipe', '-i', source,
      '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-c:a', copy ? 'copy' : 'libmp3lame', '-threads', '1', ...(copy ? [] : ['-b:a', `${bitrate}k`]), '-t', '600', '-fs', String(cap), '-f', 'mp3', destination], 60000);
    if (result.exitCode !== 0) throw new DownloaderAppError('FFMPEG_ERROR', 'Unable to convert the available audio to MP3.', 502, true);
    const stat = await fs.promises.stat(destination);
    if (!stat.size || stat.size >= cap) throw new DownloaderAppError('FILE_TOO_LARGE', 'MP3 output exceeds the supported size limit or is empty.', 413);
    const handle = await fs.promises.open(destination, 'r');
    const prefix = Buffer.alloc(16);
    try { await handle.read(prefix, 0, prefix.length, 0); } finally { await handle.close(); }
    if (prefix.toString('ascii', 0, 3) !== 'ID3' && !(prefix[0] === 255 && (prefix[1] & 224) === 224)) throw new DownloaderAppError('FFMPEG_ERROR', 'Audio conversion did not return a valid MP3.', 502);
    const playback = await runner(['-nostdin', '-v', 'error', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', destination, '-t', '0.2', '-f', 'null', '-'], 10000);
    if (playback.exitCode !== 0) throw new DownloaderAppError('FFMPEG_ERROR', 'The converted MP3 could not be decoded.', 502);
    return {filePath: destination, safeFilename: path.basename(destination), mimeType: 'audio/mpeg', filesizeBytes: stat.size, durationSeconds: seconds};
  } catch (error) {
    if (owned) await fs.promises.unlink(destination).catch(() => {});
    throw error;
  }
}
