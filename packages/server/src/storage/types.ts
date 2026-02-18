export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface StoredUser {
  id: string;
  email: string;
  provider: string;
  tokens: OAuthTokens;
  createdAt: number;
  updatedAt: number;
}

export interface StoredApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface StoredFilterConfig {
  userId: string;
  blockedDomains: string[];
  blockedSenderPatterns: string[];
  blockedSubjectPatterns: string[];
  piiRedactionEnabled: boolean;
  injectionDetectionEnabled: boolean;
  emailRedactionEnabled: boolean;
  showFilteredCount: boolean;
}

export interface Storage {
  init(): Promise<void>;

  // Users
  getUser(userId: string): Promise<StoredUser | null>;
  getUserByEmail(email: string, provider: string): Promise<StoredUser | null>;
  upsertUser(user: StoredUser): Promise<void>;
  updateTokens(userId: string, tokens: OAuthTokens): Promise<void>;

  // API Keys
  createApiKey(key: StoredApiKey): Promise<void>;
  getApiKeyByHash(keyHash: string): Promise<StoredApiKey | null>;
  listApiKeys(userId: string): Promise<StoredApiKey[]>;
  revokeApiKey(keyId: string): Promise<void>;
  updateApiKeyLastUsed(keyId: string): Promise<void>;

  // Filter Config
  getFilterConfig(userId: string): Promise<StoredFilterConfig | null>;
  upsertFilterConfig(config: StoredFilterConfig): Promise<void>;
}
