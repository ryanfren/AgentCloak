import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  databasePath: z.string().default("data/agentcloak.db"),
  databaseEncryptionKey: z.string().optional(),
  googleClientId: z.string().min(1).optional(),
  googleClientSecret: z.string().min(1).optional(),
  googleRedirectUri: z.string().url().optional(),
  baseUrl: z.string().url(),
  sessionSecret: z.string().min(32),
  sessionMaxAge: z.coerce.number().default(7 * 24 * 60 * 60 * 1000), // 7 days
  /** Optional dedicated key for credential encryption (falls back to derived key from sessionSecret) */
  credentialEncryptionKey: z.string().min(32).optional(),
  /** Optional dedicated key for OAuth state HMAC (falls back to derived key from sessionSecret) */
  oauthStateSecret: z.string().min(32).optional(),
  /** Whether to trust X-Forwarded-For for rate limiting (only enable behind a trusted proxy) */
  trustProxy: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT,
    databasePath: process.env.DATABASE_PATH,
    databaseEncryptionKey: process.env.DATABASE_ENCRYPTION_KEY,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    baseUrl: process.env.BASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    sessionMaxAge: process.env.SESSION_MAX_AGE,
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
    oauthStateSecret: process.env.OAUTH_STATE_SECRET,
    trustProxy: process.env.TRUST_PROXY,
  });
}

export function isGoogleOAuthConfigured(config: Config): boolean {
  return !!(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);
}
