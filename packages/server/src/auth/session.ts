import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";
import type { Config } from "../config.js";
import type { Storage } from "../storage/types.js";

const SESSION_COOKIE = "sid";

export type SessionEnv = {
  Variables: {
    accountId: string;
    sessionId: string;
  };
};

export function sessionMiddleware(storage: Storage, config: Config) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (!sid) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const session = await storage.getSession(sid);
    if (!session) {
      deleteCookie(c, SESSION_COOKIE);
      return c.json({ error: "Session expired" }, 401);
    }

    c.set("accountId", session.accountId);
    c.set("sessionId", session.id);
    await next();
  });
}

export async function createSessionAndSetCookie(
  c: { header: (name: string, value: string) => void },
  storage: Storage,
  config: Config,
  accountId: string,
): Promise<string> {
  const sessionId = nanoid(32);
  const now = Date.now();

  await storage.createSession({
    id: sessionId,
    accountId,
    expiresAt: now + config.sessionMaxAge,
    createdAt: now,
  });

  // Set cookie manually via header for full control
  const secure = config.baseUrl.startsWith("https");
  const maxAgeSecs = Math.floor(config.sessionMaxAge / 1000);
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSecs}`,
  ];
  if (secure) parts.push("Secure");
  c.header("Set-Cookie", parts.join("; "));

  return sessionId;
}

export function clearSessionCookie(c: {
  header: (name: string, value: string) => void;
}): void {
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
