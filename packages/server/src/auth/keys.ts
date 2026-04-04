import { nanoid } from "nanoid";
import { hashApiKey } from "../storage/sqlite.js";
import type { Storage, StoredApiKey } from "../storage/types.js";

const API_KEY_PREFIX = "ac_";

export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const rawKey = nanoid(40);
  const key = `${API_KEY_PREFIX}${rawKey}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 8);
  return { key, hash, prefix };
}

export async function createApiKey(
  storage: Storage,
  connectionId: string,
  accountId: string,
  name: string,
): Promise<{ key: string; record: StoredApiKey }> {
  const { key, hash, prefix } = generateApiKey();
  const record: StoredApiKey = {
    id: nanoid(21),
    connectionId,
    accountId,
    name,
    keyHash: hash,
    prefix,
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await storage.createApiKey(record);
  return { key, record };
}
