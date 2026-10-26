// A single byte range is sufficient for native browser video seeking.
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || !size || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return null;
  const start = first ?? Math.max(0, size - (last || 0));
  const end = first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  return start >= size || end < start || (first === undefined && !last) ? null : { start, end };
}
