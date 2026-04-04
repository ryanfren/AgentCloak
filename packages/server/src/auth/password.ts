import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 32;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash a password using scrypt. Returns a self-describing string:
 * scrypt$N$r$p$salt_hex$hash_hex
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Verify a password against a stored hash string.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = parseInt(parts[1]!, 10);
  const r = parseInt(parts[2]!, 10);
  const p = parseInt(parts[3]!, 10);
  const salt = Buffer.from(parts[4]!, "hex");
  const storedHash = Buffer.from(parts[5]!, "hex");

  const derived = await scryptAsync(password, salt, storedHash.length, {
    N,
    r,
    p,
  });

  if (derived.length !== storedHash.length) return false;
  return timingSafeEqual(derived, storedHash);
}
