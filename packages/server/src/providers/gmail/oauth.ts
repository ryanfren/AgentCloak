import { google, type Auth } from "googleapis";
import { createHmac, randomBytes } from "node:crypto";
import type { Config } from "../../config.js";
import type { OAuthTokens } from "../../storage/types.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function createOAuth2Client(config: Config): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

export function generateAuthUrl(
  config: Config,
  userId: string,
): string {
  const client = createOAuth2Client(config);
  const state = signState(userId, config.googleClientSecret);

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(
  config: Config,
  code: string,
): Promise<{ tokens: OAuthTokens; email: string }> {
  const client = createOAuth2Client(config);
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    tokens: {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: tokens.expiry_date ?? Date.now() + 3600 * 1000,
      scope: tokens.scope ?? SCOPES.join(" "),
    },
    email: data.email!,
  };
}

export function signState(userId: string, secret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}:${nonce}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

export function verifyState(
  state: string,
  secret: string,
): { userId: string } | null {
  const parts = state.split(":");
  if (parts.length !== 3) return null;

  const [userId, nonce, hmac] = parts;
  const expectedHmac = createHmac("sha256", secret)
    .update(`${userId}:${nonce}`)
    .digest("hex");

  if (hmac !== expectedHmac) return null;
  return { userId };
}
