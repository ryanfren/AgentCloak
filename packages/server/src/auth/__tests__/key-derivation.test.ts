import { describe, it, expect } from "vitest";
import { deriveKey, KEY_CONTEXTS } from "../key-derivation.js";

describe("Key derivation (HKDF)", () => {
  it("produces different keys for different contexts", () => {
    const secret = "test-master-secret-32-bytes-long!";
    const key1 = deriveKey(secret, KEY_CONTEXTS.CREDENTIAL_ENCRYPTION);
    const key2 = deriveKey(secret, KEY_CONTEXTS.SESSION);
    const key3 = deriveKey(secret, KEY_CONTEXTS.OAUTH_STATE);

    expect(key1.equals(key2)).toBe(false);
    expect(key1.equals(key3)).toBe(false);
    expect(key2.equals(key3)).toBe(false);
  });

  it("produces identical keys for same context and secret (deterministic)", () => {
    const secret = "test-master-secret-32-bytes-long!";
    const key1 = deriveKey(secret, KEY_CONTEXTS.CREDENTIAL_ENCRYPTION);
    const key2 = deriveKey(secret, KEY_CONTEXTS.CREDENTIAL_ENCRYPTION);

    expect(key1.equals(key2)).toBe(true);
  });

  it("defaults to 32-byte key length", () => {
    const secret = "test-master-secret-32-bytes-long!";
    const key = deriveKey(secret, KEY_CONTEXTS.SESSION);

    expect(key.length).toBe(32);
  });

  it("supports custom key length", () => {
    const secret = "test-master-secret-32-bytes-long!";
    const key16 = deriveKey(secret, "custom-context", 16);
    const key64 = deriveKey(secret, "custom-context", 64);

    expect(key16.length).toBe(16);
    expect(key64.length).toBe(64);
  });

  it("has all KEY_CONTEXTS defined and distinct", () => {
    const values = Object.values(KEY_CONTEXTS);
    expect(values.length).toBe(3);

    // All values are unique
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);

    // All values are non-empty strings
    for (const v of values) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
