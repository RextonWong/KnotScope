// Simple in-memory rate limiter.
//
// On Vercel each serverless function instance runs independently, so this
// is per-instance rather than globally consistent. That is still a meaningful
// barrier against abuse: each instance rejects excess requests on its own.
// For a globally consistent limit, swap the store for an Upstash Redis client.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Prune stale entries periodically so the Map doesn't grow unbounded.
// With typical serverless cold-start lifetimes this rarely runs, but it's
// the right thing to do for long-lived warm instances.
let pruneScheduled = false;
function schedulePrune() {
  if (pruneScheduled) return;
  pruneScheduled = true;
  setTimeout(() => {
    const now = Date.now();
    for (const [key, bucket] of store) {
      if (now > bucket.resetAt) store.delete(key);
    }
    pruneScheduled = false;
  }, 60_000);
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

/**
 * Check whether `key` (typically a client IP) is within the allowed rate.
 *
 * @param key       Identifier to rate-limit (usually client IP).
 * @param max       Maximum requests allowed in the window. Default 20.
 * @param windowMs  Window duration in milliseconds. Default 60 000 (1 min).
 */
export function checkRateLimit(
  key: string,
  max = 20,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  schedulePrune();

  const bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { ok: true };
}

/**
 * Extract the best-effort client IP from a Next.js request.
 * Falls back to "anonymous" if no header is present (e.g. local dev).
 */
export function clientIp(req: Request): string {
  // Vercel / most proxies set x-forwarded-for; take the first entry.
  const xff = (req.headers as Headers).get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (req.headers as Headers).get("x-real-ip") ?? "anonymous";
}
