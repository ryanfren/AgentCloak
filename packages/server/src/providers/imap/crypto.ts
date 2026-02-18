import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const APP_SALT = "agentcloak-imap-credential-salt";

function deriveKey(sessionSecret: string): Buffer {
  return scryptSync(sessionSecret, APP_SALT, KEY_LENGTH);
}

export function encryptPassword(
  password: string,
  sessionSecret: string,
): { encryptedPassword: string; iv: string; authTag: string } {
  const key = deriveKey(sessionSecret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedPassword: encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

export function decryptPassword(
  encryptedPassword: string,
  iv: string,
  authTag: string,
  sessionSecret: string,
): string {
  const key = deriveKey(sessionSecret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encryptedPassword, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
