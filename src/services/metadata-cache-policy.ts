// Cache only anonymous results, and stop before a known signed URL expiry.
export function metadataCachePolicy(data: unknown, raw: unknown, ttlMs: number, now = Date.now()) {
  let expiresAt = now + ttlMs, eligible = true;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 40) { eligible = false; return; }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.username || url.password) eligible = false;
        for (const key of url.searchParams.keys()) if (/^(sessionid|session_token|access_token|authorization|cookie)$/i.test(key)) eligible = false;
        let knownExpiry = false;
        for (const key of ['oe', 'expires', 'exp']) {
          const expiry = url.searchParams.get(key);
          if (expiry === null) continue;
          const seconds = key === 'oe' && /^[\da-f]{1,12}$/i.test(expiry) ? parseInt(expiry, 16)
            : /^\d{1,13}$/.test(expiry) ? Number(expiry) : NaN;
          if (!Number.isFinite(seconds)) eligible = false;
          else { knownExpiry = true; expiresAt = Math.min(expiresAt, seconds * 1000 - 10000); }
        }
        if (['signature', 'sig', 'token', 'oh', '__gda__', '_nc_ohc', 'hash'].some(key => url.searchParams.has(key)) && !knownExpiry) eligible = false;
      } catch { eligible = false; }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (/^(cookie|cookies|set-cookie|authorization|proxy-authorization|sessionid|session_token|access_token|password)$/i.test(key) && child) eligible = false;
        if ((key === 'is_private' || key === 'requires_auth') && child === true) eligible = false;
        visit(child, depth + 1);
      }
    }
  };
  visit(data); visit(raw);
  return {eligible: eligible && expiresAt > now, expiresAt};
}
