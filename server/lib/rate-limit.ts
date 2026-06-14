import { Redis } from "@upstash/redis";
import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
      })
    : null;
const IP_ADDRESS_HEADERS = [
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'fly-client-ip',
  'x-real-ip',
  'x-forwarded-for',
] as const;

// Purge expired buckets every 5 minutes so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

function clientKey(req: Request): string {
  for (const header of IP_ADDRESS_HEADERS) {
    const value = req.headers[header];
    const ip = (Array.isArray(value) ? value[0] : value)
      ?.split(',')[0]
      ?.trim();
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Returns an Express middleware that limits each IP to `max` requests per
 * `windowMs` milliseconds. Responds 429 with Retry-After when exceeded.
 */
export function rateLimit(options: {
  namespace?: string;
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = 'Too many requests. Please slow down.' } = options;
  const namespace = options.namespace ?? `${windowMs}:${max}:${message}`;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${namespace}:${clientKey(req)}`;
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }

        if (count > max) {
          const ttlSeconds = await redis.ttl(key);
          if (ttlSeconds > 0) {
            res.setHeader('Retry-After', String(ttlSeconds));
          }
          return res.status(429).json({ error: message });
        }

        return next();
      } catch (error) {
        console.warn('[rate-limit] Redis limiter failed, falling back to in-memory buckets:', error);
      }
    }

    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || bucket.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    bucket.count += 1;
    return next();
  };
}
