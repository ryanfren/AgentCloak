import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

/** @deprecated Only used for decrypting credentials stored before per-credential salt */
const LEGACY_SALT = "agentcloak-imap-credential-salt";

function deriveKey(sessionSecret: string, salt: Buffer | string): Buffer {
  return scryptSync(sessionSecret, salt, KEY_LENGTH);
}

export function encryptPassword(
  password: string,
  sessionSecret: string,
): { encryptedPassword: string; iv: string; authTag: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(sessionSecret, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedPassword: encrypted,
    iv: iv.toString("hex"),
    authTag,
    salt: salt.toString("hex"),
  };
}

export function decryptPassword(
  encryptedPassword: string,
  iv: string,
  authTag: string,
  sessionSecret: string,
  salt?: string,
): string {
  // Use per-credential salt if available, otherwise fall back to legacy static salt
  const effectiveSalt = salt ? Buffer.from(salt, "hex") : LEGACY_SALT;
  const key = deriveKey(sessionSecret, effectiveSalt);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedPassword, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
