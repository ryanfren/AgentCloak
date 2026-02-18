import type { Config } from "../config.js";
import { SqliteStorage } from "./sqlite.js";
import type { Storage } from "./types.js";

export async function createStorage(config: Config): Promise<Storage> {
  const storage = new SqliteStorage(
    config.databasePath,
    config.databaseEncryptionKey,
  );
  await storage.init();
  return storage;
}

export type { Storage } from "./types.js";
