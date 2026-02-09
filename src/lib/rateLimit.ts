interface RateLimitConfig {
  key: string;
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const bucket = new Map<string, RateLimitEntry>();

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = bucket.get(config.key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + config.windowMs;
    bucket.set(config.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(config.maxRequests - 1, 0),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  existing.count += 1;
  bucket.set(config.key, existing);

  const remaining = Math.max(config.maxRequests - existing.count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);

  return {
    allowed: existing.count <= config.maxRequests,
    remaining,
    retryAfterSeconds,
  };
}
