import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import type { Config } from "../config.js";
import { isGoogleOAuthConfigured } from "../config.js";
import {
  clearSessionCookie,
  createSessionAndSetCookie,
} from "../auth/session.js";
import {
  exchangeCode,
  generateLoginAuthUrl,
  verifyState,
} from "../providers/gmail/oauth.js";
import type { Storage } from "../storage/types.js";

export function createOAuthRoutes(storage: Storage, config: Config) {
  const routes = new Hono();

  // GET /auth/login — Dashboard login via Google
  routes.get("/login", (c) => {
    if (!isGoogleOAuthConfigured(config)) {
      return c.redirect("/login?error=google_not_configured");
    }
    const url = generateLoginAuthUrl(config);
    return c.redirect(url);
  });

  // GET /auth/callback — Unified OAuth callback for login + connect
  routes.get("/callback", async (c) => {
    if (!isGoogleOAuthConfigured(config)) {
      return c.json({ error: "Google OAuth is not configured" }, 400);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.redirect(`/?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return c.redirect("/?error=missing_params");
    }

    const verified = verifyState(state, config.sessionSecret);
    if (!verified) {
      return c.redirect("/?error=invalid_state");
    }

    let result;
    try {
      result = await exchangeCode(config, code);
    } catch (err) {
      console.error("OAuth code exchange failed:", err);
      return c.redirect("/?error=exchange_failed");
    }

    if (verified.flow === "login") {
      // Dashboard login flow
      const existing = await storage.getAccountByEmail(result.email);
      const accountId = existing?.id ?? nanoid(21);
      const now = Date.now();

      await storage.upsertAccount({
        id: accountId,
        email: result.email,
        name: result.name,
        avatarUrl: result.avatarUrl,
        passwordHash: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      // Re-fetch to get the actual ID in case of race condition on upsert
      const finalAccount = await storage.getAccountByEmail(result.email);
      await createSessionAndSetCookie(
        c,
        storage,
        config,
        finalAccount!.id,
      );
      return c.redirect("/");
    }

    if (verified.flow === "connect") {
      // Connect Gmail flow — accountId comes from state
      const { accountId } = verified;

      // Verify the account exists
      const account = await storage.getAccount(accountId);
      if (!account) {
        return c.redirect("/connections?error=invalid_account");
      }

      // Check if this email is already connected
      const existingConn = await storage.getConnectionByEmail(
        result.email,
        "gmail",
      );
      if (existingConn) {
        // Only allow updating if the connection belongs to this account
        if (existingConn.accountId !== accountId) {
          return c.redirect(
            "/connections?error=email_connected_by_another_account",
          );
        }
        // Re-authorize existing connection
        await storage.updateConnectionTokens(
          existingConn.id,
          result.tokens,
        );
        await storage.updateConnectionStatus(existingConn.id, "active");
        return c.redirect("/connections");
      }

      const connectionId = nanoid(21);
      const now = Date.now();

      await storage.createConnection({
        id: connectionId,
        accountId,
        email: result.email,
        provider: "gmail",
        displayName: null,
        tokens: result.tokens,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Create default filter config
      await storage.upsertFilterConfig({
        connectionId,
        blockedDomains: [],
        blockedSenderPatterns: [],
        blockedSubjectPatterns: [],
        piiRedactionEnabled: true,
        injectionDetectionEnabled: true,
        emailRedactionEnabled: true,
        showFilteredCount: true,
        securityBlockingEnabled: true,
        financialBlockingEnabled: true,
        sensitiveSenderBlockingEnabled: true,
        dollarAmountRedactionEnabled: true,
        attachmentFilteringEnabled: true,
        allowedFolders: [],
      });

      return c.redirect("/connections");
    }

    return c.redirect("/?error=unknown_flow");
  });

  // GET /auth/logout — Clear session
  routes.get("/logout", async (c) => {
    const sid = getCookie(c, "sid");
    if (sid) {
      await storage.deleteSession(sid);
    }
    clearSessionCookie(c);
    return c.redirect("/login");
  });

  return routes;
}
