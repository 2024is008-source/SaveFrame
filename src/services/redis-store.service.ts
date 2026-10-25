import * as net from 'net';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtSeconds: number;
  limit: number;
}

/**
 * Redis Caching & Rate-Limiting Service.
 * Connects to Redis via TCP using native RESP protocol (zero external npm binary dependencies required)
 * and automatically falls back to a bounded in-memory TTL store when Redis is unavailable.
 */
export class RedisStoreService {
  private readonly redisHost: string;
  private readonly redisPort: number;
  private readonly redisPassword?: string;
  private readonly memoryCache = new Map<string, CacheEntry<string>>();
  private readonly rateBuckets = new Map<string, { count: number; resetAt: number }>();
  private redisReachable = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      const parsed = new URL(redisUrl);
      this.redisHost = parsed.hostname || '127.0.0.1';
      this.redisPort = parseInt(parsed.port || '6379', 10);
      this.redisPassword = parsed.password || process.env.REDIS_PASSWORD || undefined;
    } catch {
      this.redisHost = '127.0.0.1';
      this.redisPort = 6379;
    }
  }

  private async execRespCommand(args: string[], timeoutMs = 600): Promise<string | null> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      let buffer = '';

      const finish = (val: string | null, ok: boolean) => {
        if (settled) return;
        settled = true;
        this.redisReachable = ok;
        socket.destroy();
        resolve(val);
      };

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => finish(null, false));
      socket.on('error', () => finish(null, false));

      socket.connect(this.redisPort, this.redisHost, () => {
        const commands: string[][] = [];
        if (this.redisPassword) {
          commands.push(['AUTH', this.redisPassword]);
        }
        commands.push(args);

        const payload = commands
          .map(
            (cmd) =>
              `*${cmd.length}\r\n` +
              cmd
                .map((arg) => `$${Buffer.byteLength(arg, 'utf8')}\r\n${arg}\r\n`)
                .join('')
          )
          .join('');
        socket.write(payload);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes('\r\n')) {
          const lines = buffer.split('\r\n');
          const lastNonEmpty = lines.filter(Boolean).pop() || '';
          if (lastNonEmpty.startsWith('-')) {
            finish(null, false);
          } else if (lastNonEmpty.startsWith('+') || lastNonEmpty.startsWith(':')) {
            finish(lastNonEmpty.slice(1), true);
          } else if (lines.length >= 2) {
            finish(lines[lines.length - 2] || null, true);
          }
        }
      });
    });
  }

  public async checkHealth(): Promise<{
    ok: boolean;
    mode: 'redis' | 'memory-fallback';
    latencyMs: number;
  }> {
    const start = Date.now();
    const pong = await this.execRespCommand(['PING'], 400);
    const latencyMs = Date.now() - start;
    if (pong === 'PONG') {
      return { ok: true, mode: 'redis', latencyMs };
    }
    return { ok: true, mode: 'memory-fallback', latencyMs };
  }

  public async getJson<T>(key: string): Promise<T | null> {
    if (this.redisReachable) {
      const raw = await this.execRespCommand(['GET', `saveframe:${key}`]);
      if (raw && raw !== '$-1') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          // Fall through to memory cache
        }
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  public async setJson<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.redisReachable) {
      await this.execRespCommand([
        'SETEX',
        `saveframe:${key}`,
        String(ttlSeconds),
        serialized,
      ]);
    }
    if (this.memoryCache.size > 1000) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async checkRateLimit(
    clientIp: string,
    action: 'resolve' | 'download',
    limit = 30,
    windowSeconds = 60
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `rl:${action}:${clientIp}`;
    const existing = this.rateBuckets.get(bucketKey);

    if (!existing || now > existing.resetAt) {
      if(this.rateBuckets.size>=1000)for(const [key,bucket]of this.rateBuckets)if(now>bucket.resetAt)this.rateBuckets.delete(key);
      if(!existing&&this.rateBuckets.size>=10000)return {allowed:false,remaining:0,resetAtSeconds:Math.ceil((now+windowSeconds*1000)/1000),limit};
      const resetAt = now + windowSeconds * 1000;
      this.rateBuckets.set(bucketKey, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        resetAtSeconds: Math.ceil(resetAt / 1000),
        limit,
      };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - existing.count),
      resetAtSeconds: Math.ceil(existing.resetAt / 1000),
      limit,
    };
  }
}
