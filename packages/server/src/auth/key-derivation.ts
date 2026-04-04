import { hkdfSync } from "node:crypto";

/** Pre-defined HKDF contexts for purpose-specific key derivation */
export const KEY_CONTEXTS = {
  CREDENTIAL_ENCRYPTION: "agentcloak-credential-encryption-v1",
  OAUTH_STATE: "agentcloak-oauth-state-v1",
  SESSION: "agentcloak-session-v1",
} as const;

/**
 * Derive a purpose-specific key from a master secret using HKDF-SHA256.
 * This ensures different subsystems use different keys even when sharing
 * a single SESSION_SECRET.
 */
export function deriveKey(
  masterSecret: string,
  context: string,
  length = 32,
): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterSecret, "", context, length),
  );
}
