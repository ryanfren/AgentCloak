import { Hono } from "hono";
import { nanoid } from "nanoid";
import type { Config } from "../config.js";
import { isGoogleOAuthConfigured } from "../config.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createRateLimiter } from "../auth/rate-limit.js";
import { createSessionAndSetCookie } from "../auth/session.js";
import type { Storage } from "../storage/types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export function createAuthRoutes(storage: Storage, config: Config) {
  const routes = new Hono();

  const rateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 10,
  });

  // GET /auth/config — Public endpoint for available auth methods
  routes.get("/config", (c) => {
    return c.json({
      googleOAuth: isGoogleOAuthConfigured(config),
      emailPassword: true,
    });
  });

  // POST /auth/register — Create account or add password to existing OAuth account
  routes.post("/register", rateLimiter, async (c) => {
    const body = await c.req.json<{
      email?: string;
      password?: string;
      name?: string;
    }>();

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const name = body.name?.trim() || null;

    if (!email || !EMAIL_RE.test(email)) {
      return c.json({ error: "Valid email is required" }, 400);
    }
    if (!password || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return c.json(
        { error: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters` },
        400,
      );
    }

    const existing = await storage.getAccountByEmail(email);

    if (existing && existing.passwordHash) {
      return c.json({ error: "Account already exists" }, 409);
    }

    const passwordHash = await hashPassword(password);

    if (existing) {
      // OAuth-only account — add password
      await storage.updateAccountPasswordHash(existing.id, passwordHash);
      await createSessionAndSetCookie(c, storage, config, existing.id);
      return c.json({
        id: existing.id,
        email: existing.email,
        name: existing.name,
        avatarUrl: existing.avatarUrl,
      });
    }

    // New account
    const accountId = nanoid(21);
    const now = Date.now();
    await storage.upsertAccount({
      id: accountId,
      email,
      name,
      avatarUrl: null,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Re-fetch to get actual ID (in case of race on upsert)
    const account = await storage.getAccountByEmail(email);
    await createSessionAndSetCookie(c, storage, config, account!.id);

    return c.json(
      {
        id: account!.id,
        email: account!.email,
        name: account!.name,
        avatarUrl: account!.avatarUrl,
      },
      201,
    );
  });

  // POST /auth/login — Email/password login
  routes.post("/login", rateLimiter, async (c) => {
    const body = await c.req.json<{
      email?: string;
      password?: string;
    }>();

    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const account = await storage.getAccountByEmail(email);

    if (!account || !account.passwordHash) {
      // Timing attack prevention: run a dummy hash so response time is consistent
      await hashPassword(password);
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    await createSessionAndSetCookie(c, storage, config, account.id);
    return c.json({
      id: account.id,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
    });
  });

  return routes;
}
