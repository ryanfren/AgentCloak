import { google } from "googleapis";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Config } from "../../config.js";
import type { OAuthTokens } from "../../storage/types.js";

const LOGIN_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const CONNECT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
];

export type OAuthFlowType = "login" | "connect";

export interface OAuthStateData {
  flow: OAuthFlowType;
  accountId: string; // empty string for login flow
}

export function createOAuth2Client(
  config: Config,
): InstanceType<typeof google.auth.OAuth2> {
  if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

export function generateLoginAuthUrl(config: Config): string {
  const client = createOAuth2Client(config);
  const state = signState("login", "", config.sessionSecret);

  return client.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: LOGIN_SCOPES,
    state,
  });
}

export function generateConnectAuthUrl(
  config: Config,
  accountId: string,
): string {
  const client = createOAuth2Client(config);
  const state = signState("connect", accountId, config.sessionSecret);

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CONNECT_SCOPES,
    state,
  });
}

export interface ExchangeResult {
  tokens: OAuthTokens;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export async function exchangeCode(
  config: Config,
  code: string,
): Promise<ExchangeResult> {
  const client = createOAuth2Client(config);
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("OAuth token exchange did not return an access token");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) {
    throw new Error("Could not retrieve email from Google user info");
  }

  return {
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      expiresAt: tokens.expiry_date ?? Date.now() + 3600 * 1000,
      scope: tokens.scope ?? "",
    },
    email: data.email,
    name: data.name ?? null,
    avatarUrl: data.picture ?? null,
  };
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function signState(
  flow: OAuthFlowType,
  accountId: string,
  secret: string,
): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString(36);
  const payload = `${flow}:${accountId}:${nonce}:${timestamp}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

export function verifyState(
  state: string,
  secret: string,
): OAuthStateData | null {
  const parts = state.split(":");
  if (parts.length !== 5) return null;

  const [flow, accountId, nonce, timestamp, hmac] = parts;
  if (flow !== "login" && flow !== "connect") return null;

  // Check expiry
  const stateTime = parseInt(timestamp!, 36);
  if (Number.isNaN(stateTime) || Date.now() - stateTime > STATE_MAX_AGE_MS) {
    return null;
  }

  const payload = `${flow}:${accountId}:${nonce}:${timestamp}`;
  const expectedHmac = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Timing-safe comparison
  const hmacBuf = Buffer.from(hmac!, "hex");
  const expectedBuf = Buffer.from(expectedHmac, "hex");
  if (hmacBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;

  return { flow: flow as OAuthFlowType, accountId: accountId! };
}
