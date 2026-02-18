import type { MiddlewareHandler } from "hono";
import { hashApiKey } from "../storage/sqlite.js";
import type { Storage } from "../storage/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiKeyAuth(storage: Storage): MiddlewareHandler<any> {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const key = authHeader.slice(7);
    if (!key.startsWith("ac_")) {
      return c.json({ error: "Invalid API key format" }, 401);
    }

    const keyHash = hashApiKey(key);
    const apiKey = await storage.getApiKeyByHash(keyHash);
    if (!apiKey) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Fire-and-forget last-used update
    storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});

    c.set("userId", apiKey.userId);
    c.set("apiKeyId", apiKey.id);
    await next();
  };
}
