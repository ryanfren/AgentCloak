import { describe, it, expect } from "vitest";
import { encryptPassword, decryptPassword } from "../crypto.js";

const TEST_SECRET = "a-very-secret-session-key-for-testing-32chars!";

describe("IMAP credential encryption", () => {
  it("encryptPassword returns salt, iv, authTag, and encryptedPassword", () => {
    const result = encryptPassword("mypassword", TEST_SECRET);

    expect(result.salt).toBeDefined();
    expect(result.iv).toBeDefined();
    expect(result.authTag).toBeDefined();
    expect(result.encryptedPassword).toBeDefined();
    // All hex-encoded
    expect(result.salt).toMatch(/^[0-9a-f]+$/);
    expect(result.iv).toMatch(/^[0-9a-f]+$/);
    expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    expect(result.encryptedPassword).toMatch(/^[0-9a-f]+$/);
  });

  it("generates different salt each call", () => {
    const r1 = encryptPassword("same-password", TEST_SECRET);
    const r2 = encryptPassword("same-password", TEST_SECRET);

    expect(r1.salt).not.toBe(r2.salt);
  });

  it("decryptPassword with correct salt returns original password", () => {
    const password = "super-secret-123!";
    const { encryptedPassword, iv, authTag, salt } = encryptPassword(password, TEST_SECRET);

    const decrypted = decryptPassword(encryptedPassword, iv, authTag, TEST_SECRET, salt);
    expect(decrypted).toBe(password);
  });

  it("decryptPassword with wrong salt throws", () => {
    const { encryptedPassword, iv, authTag } = encryptPassword("mypassword", TEST_SECRET);
    const wrongSalt = "00".repeat(16); // 16 bytes of zeros in hex

    expect(() => {
      decryptPassword(encryptedPassword, iv, authTag, TEST_SECRET, wrongSalt);
    }).toThrow();
  });

  it("legacy fallback: decryptPassword without salt uses LEGACY_SALT", () => {
    // Encrypt with the new method (random salt)
    const { encryptedPassword, iv, authTag, salt } = encryptPassword("test", TEST_SECRET);

    // Decrypt with explicit salt should work
    const decrypted = decryptPassword(encryptedPassword, iv, authTag, TEST_SECRET, salt);
    expect(decrypted).toBe("test");

    // Decrypt without salt (legacy mode) should fail because it uses a different salt
    expect(() => {
      decryptPassword(encryptedPassword, iv, authTag, TEST_SECRET, undefined);
    }).toThrow();
  });

  it("roundtrip: encrypt then decrypt returns original password (special chars and unicode)", () => {
    const passwords = [
      "p@$$w0rd!#%^&*()",
      "unicode: 日本語テスト",
    ];

    for (const password of passwords) {
      const { encryptedPassword, iv, authTag, salt } = encryptPassword(password, TEST_SECRET);
      const decrypted = decryptPassword(encryptedPassword, iv, authTag, TEST_SECRET, salt);
      expect(decrypted).toBe(password);
    }
  }, 15000);

  it("different passwords produce different ciphertext", () => {
    const r1 = encryptPassword("password-one", TEST_SECRET);
    const r2 = encryptPassword("password-two", TEST_SECRET);

    expect(r1.encryptedPassword).not.toBe(r2.encryptedPassword);
  });
});
