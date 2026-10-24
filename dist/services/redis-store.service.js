"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RedisStoreService = void 0;
var net = _interopRequireWildcard(require("net"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/**
 * Redis Caching & Rate-Limiting Service.
 * Connects to Redis via TCP using native RESP protocol (zero external npm binary dependencies required)
 * and automatically falls back to a bounded in-memory TTL store when Redis is unavailable.
 */
class RedisStoreService {
  memoryCache = new Map();
  rateBuckets = new Map();
  redisReachable = false;
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
  async execRespCommand(args, timeoutMs = 600) {
    return new Promise(resolve => {
      const socket = new net.Socket();
      let settled = false;
      let buffer = '';
      const finish = (val, ok) => {
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
        const commands = [];
        if (this.redisPassword) {
          commands.push(['AUTH', this.redisPassword]);
        }
        commands.push(args);
        const payload = commands.map(cmd => `*${cmd.length}\r\n` + cmd.map(arg => `$${Buffer.byteLength(arg, 'utf8')}\r\n${arg}\r\n`).join('')).join('');
        socket.write(payload);
      });
      socket.on('data', chunk => {
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
  async checkHealth() {
    const start = Date.now();
    const pong = await this.execRespCommand(['PING'], 400);
    const latencyMs = Date.now() - start;
    this.lastPingMs = latencyMs;
    if (pong === 'PONG') {
      return {
        ok: true,
        mode: 'redis',
        latencyMs
      };
    }
    return {
      ok: true,
      mode: 'memory-fallback',
      latencyMs
    };
  }
  async getJson(key) {
    if (this.redisReachable) {
      const raw = await this.execRespCommand(['GET', `saveframe:${key}`]);
      if (raw && raw !== '$-1') {
        try {
          return JSON.parse(raw);
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
      return JSON.parse(entry.value);
    } catch {
      return null;
    }
  }
  async setJson(key, value, ttlSeconds = 300) {
    const serialized = JSON.stringify(value);
    if (this.redisReachable) {
      await this.execRespCommand(['SETEX', `saveframe:${key}`, String(ttlSeconds), serialized]);
    }
    if (this.memoryCache.size > 1000) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
  async checkRateLimit(clientIp, action, limit = 30, windowSeconds = 60) {
    const now = Date.now();
    const bucketKey = `rl:${action}:${clientIp}`;
    const existing = this.rateBuckets.get(bucketKey);
    if (!existing || now > existing.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      this.rateBuckets.set(bucketKey, {
        count: 1,
        resetAt
      });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        resetAtSeconds: Math.ceil(resetAt / 1000),
        limit
      };
    }
    existing.count += 1;
    const allowed = existing.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - existing.count),
      resetAtSeconds: Math.ceil(existing.resetAt / 1000),
      limit
    };
  }
}
exports.RedisStoreService = RedisStoreService;