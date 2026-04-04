import type { Context, Next } from "hono";

interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  trustProxy?: boolean;
}

interface DualKeyRateLimiterOptions extends RateLimiterOptions {
  /** Max attempts per email address (should be lower than maxAttempts per IP) */
  maxAttemptsPerEmail?: number;
  /** Function to extract email from request body */
  getEmail?: (c: Context) => Promise<string | undefined>;
}

function getClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    return (
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown"
    );
  }
  // Use socket remote address when not behind a trusted proxy
  const connInfo = c.req.raw.headers.get("x-real-ip");
  return connInfo ?? "unknown";
}

function checkLimit(
  map: Map<string, number[]>,
  key: string,
  windowMs: number,
  maxAttempts: number,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const timestamps = map.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxAttempts) {
    const retryAfter = Math.ceil((recent[0]! + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  recent.push(now);
  map.set(key, recent);
  return { allowed: true };
}

export function createRateLimiter({
  windowMs,
  maxAttempts,
  trustProxy = false,
}: RateLimiterOptions) {
  const ipAttempts = new Map<string, number[]>();

  // Periodically clean up old entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of ipAttempts) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        ipAttempts.delete(key);
      } else {
        ipAttempts.set(key, valid);
      }
    }
  }, windowMs);
  cleanup.unref();

  return async (c: Context, next: Next) => {
    const ip = getClientIp(c, trustProxy);

    const result = checkLimit(ipAttempts, ip, windowMs, maxAttempts);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json(
        { error: "Too many attempts. Please try again later." },
        429,
      );
    }

    await next();
  };
}

/**
 * Rate limiter for MCP endpoint — keyed by API key ID.
 * Returns null if allowed, or an error message if rate limited.
 */
export function createMcpRateLimiter(maxRequests: number, windowMs: number) {
  const keyAttempts = new Map<string, number[]>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of keyAttempts) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        keyAttempts.delete(key);
      } else {
        keyAttempts.set(key, valid);
      }
    }
  }, windowMs);
  cleanup.unref();

  return (keyId: string): boolean => {
    const result = checkLimit(keyAttempts, keyId, windowMs, maxRequests);
    return result.allowed;
  };
}
