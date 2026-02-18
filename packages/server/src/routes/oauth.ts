import { Hono } from "hono";
import { nanoid } from "nanoid";
import type { Config } from "../config.js";
import {
  exchangeCode,
  generateAuthUrl,
  verifyState,
} from "../providers/gmail/oauth.js";
import type { Storage } from "../storage/types.js";

export function createOAuthRoutes(storage: Storage, config: Config) {
  const routes = new Hono();

  // GET /auth/gmail?user_id=xxx - Redirect to Google OAuth consent
  routes.get("/gmail", (c) => {
    const userId = c.req.query("user_id");
    if (!userId) {
      return c.json({ error: "user_id query parameter is required" }, 400);
    }

    const url = generateAuthUrl(config, userId);
    return c.redirect(url);
  });

  // GET /auth/callback - Handle OAuth callback from Google
  routes.get("/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.json({ error: `OAuth error: ${error}` }, 400);
    }

    if (!code || !state) {
      return c.json({ error: "Missing code or state parameter" }, 400);
    }

    // Verify HMAC-signed state
    const verified = verifyState(state, config.googleClientSecret);
    if (!verified) {
      return c.json({ error: "Invalid state parameter (CSRF check failed)" }, 403);
    }

    const { userId } = verified;

    // Exchange code for tokens
    const { tokens, email } = await exchangeCode(config, code);

    // Check if user already exists
    const existing = await storage.getUserByEmail(email, "gmail");
    const finalUserId = existing?.id ?? userId;

    await storage.upsertUser({
      id: finalUserId,
      email,
      provider: "gmail",
      tokens,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    // Create default filter config if none exists
    const filterConfig = await storage.getFilterConfig(finalUserId);
    if (!filterConfig) {
      await storage.upsertFilterConfig({
        userId: finalUserId,
        blockedDomains: [],
        blockedSenderPatterns: [],
        blockedSubjectPatterns: [],
        piiRedactionEnabled: true,
        injectionDetectionEnabled: true,
        emailRedactionEnabled: true,
        showFilteredCount: true,
      });
    }

    return c.json({
      success: true,
      message: `Gmail connected for ${email}`,
      userId: finalUserId,
    });
  });

  return routes;
}
