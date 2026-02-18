import type { Context, Next } from "hono";

interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
}

export function createRateLimiter({ windowMs, maxAttempts }: RateLimiterOptions) {
  const attempts = new Map<string, number[]>();

  // Periodically clean up old entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of attempts) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        attempts.delete(key);
      } else {
        attempts.set(key, valid);
      }
    }
  }, windowMs);
  cleanup.unref();

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    const timestamps = attempts.get(ip) ?? [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxAttempts) {
      const retryAfter = Math.ceil(
        (recent[0]! + windowMs - now) / 1000,
      );
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too many attempts. Please try again later." },
        429,
      );
    }

    recent.push(now);
    attempts.set(ip, recent);

    await next();
  };
}
