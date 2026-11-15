import type { RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

/**
 * Creates a per-IP sliding-window rate limiter middleware.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const hits = new Map<string, number[]>();

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && process.env.FORCE_RATE_LIMIT !== 'true') {
      next();
      return;
    }

    const now = Date.now();
    const cutoff = now - options.windowMs;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    const existing = hits.get(clientIp) ?? [];
    const activeTimestamps = existing.filter((ts) => ts > cutoff);

    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, options.maxRequests - activeTimestamps.length))
    );

    if (activeTimestamps.length >= options.maxRequests) {
      const oldestActive = activeTimestamps[0] ?? now;
      const retryAfterSec = Math.ceil((oldestActive + options.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      hits.set(clientIp, activeTimestamps);
      res.status(429).json({
        success: false,
        error: options.message ?? 'Too many requests. Please try again later.'
      });
      return;
    }

    activeTimestamps.push(now);
    hits.set(clientIp, activeTimestamps);
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, options.maxRequests - activeTimestamps.length))
    );
    next();
  };
}
