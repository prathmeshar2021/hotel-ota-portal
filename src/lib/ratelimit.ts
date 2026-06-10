import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Lightweight rate limiting for public endpoints.
 *
 * - When Upstash Redis is configured (UPSTASH_REDIS_REST_URL + _TOKEN), uses a
 *   distributed sliding-window limiter that works correctly across serverless
 *   instances.
 * - Otherwise falls back to a per-instance in-memory limiter — weaker (each
 *   lambda instance has its own counter) but gives baseline protection with
 *   zero setup, and still blunts scripted bursts that hit a warm instance.
 *
 * Add the two Upstash env vars (free tier) in production for full protection.
 */

const hasUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redis: Redis | null = null;
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(name: string, limit: number, windowSec: number): Ratelimit {
  redis ??= Redis.fromEnv();
  const key = `${name}:${limit}:${windowSec}`;
  let limiter = upstashLimiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `rl:${name}`,
      analytics: false,
    });
    upstashLimiters.set(key, limiter);
  }
  return limiter;
}

// ── In-memory fallback ──
const memBuckets = new Map<string, number[]>();
let lastSweep = Date.now();

function memoryAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Periodic sweep so the map can't grow unbounded.
  if (now - lastSweep > 60_000) {
    for (const [k, arr] of memBuckets) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length === 0) memBuckets.delete(k);
      else memBuckets.set(k, kept);
    }
    lastSweep = now;
  }
  const arr = (memBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    memBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  memBuckets.set(key, arr);
  return true;
}

export interface RateLimitOpts {
  name: string; // bucket name, e.g. "chatbot"
  identifier: string; // per-client key, e.g. the IP
  limit: number; // max requests
  windowSec: number; // per this many seconds
}

/** Returns true if the request is allowed, false if it should be blocked. */
export async function rateLimit(o: RateLimitOpts): Promise<boolean> {
  if (hasUpstash) {
    try {
      const { success } = await getUpstashLimiter(o.name, o.limit, o.windowSec).limit(o.identifier);
      return success;
    } catch (e) {
      console.error("[ratelimit] Upstash error — falling back to in-memory:", e);
    }
  }
  return memoryAllow(`${o.name}:${o.identifier}`, o.limit, o.windowSec * 1000);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

/**
 * Enforce a limit for an endpoint. Returns a 429 `NextResponse` when the client
 * is over the limit, or `null` when the request should proceed.
 */
export async function enforceRateLimit(
  req: Request,
  o: { name: string; limit: number; windowSec: number; identifier?: string }
): Promise<NextResponse | null> {
  const identifier = o.identifier ?? clientIp(req);
  const allowed = await rateLimit({ name: o.name, identifier, limit: o.limit, windowSec: o.windowSec });
  if (allowed) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(o.windowSec) } }
  );
}
