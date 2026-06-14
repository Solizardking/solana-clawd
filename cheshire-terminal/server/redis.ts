import { Redis } from "@upstash/redis";

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("[redis] WARNING: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set");
}

export const redis = new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL ?? "").trim(),
  token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim(),
});
