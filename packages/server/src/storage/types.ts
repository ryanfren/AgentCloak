export interface OAuthTokens {
  type?: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface ImapCredentials {
  type: "imap";
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  iv: string;
  authTag: string;
  tls: boolean;
}

/**
 * Union of credential types. Discriminate via `StoredEmailConnection.provider`
 * (not `type`), since existing OAuth records lack a `type` field.
 */
export type ConnectionCredentials = OAuthTokens | ImapCredentials;

export type ConnectionStatus = "active" | "revoked" | "error";

export interface StoredAccount {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredEmailConnection {
  id: string;
  accountId: string;
  email: string;
  provider: string;
  displayName: string | null;
  tokens: ConnectionCredentials;
  status: ConnectionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface StoredSession {
  id: string;
  accountId: string;
  expiresAt: number;
  createdAt: number;
}

export interface StoredApiKey {
  id: string;
  connectionId: string;
  accountId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface StoredFilterConfig {
  connectionId: string;
  blockedDomains: string[];
  blockedSenderPatterns: string[];
  blockedSubjectPatterns: string[];
  piiRedactionEnabled: boolean;
  injectionDetectionEnabled: boolean;
  emailRedactionEnabled: boolean;
  showFilteredCount: boolean;
  // Tier 1 — category toggles
  securityBlockingEnabled: boolean;
  financialBlockingEnabled: boolean;
  sensitiveSenderBlockingEnabled: boolean;
  dollarAmountRedactionEnabled: boolean;
  // Tier 2
  attachmentFilteringEnabled: boolean;
  allowedFolders: string[];
}

export interface Storage {
  init(): Promise<void>;

  // Accounts
  getAccount(id: string): Promise<StoredAccount | null>;
  getAccountByEmail(email: string): Promise<StoredAccount | null>;
  upsertAccount(account: StoredAccount): Promise<void>;

  // Email Connections
  getConnection(id: string): Promise<StoredEmailConnection | null>;
  getConnectionByEmail(
    email: string,
    provider: string,
  ): Promise<StoredEmailConnection | null>;
  listConnections(accountId: string): Promise<StoredEmailConnection[]>;
  createConnection(conn: StoredEmailConnection): Promise<void>;
  updateConnectionTokens(id: string, tokens: ConnectionCredentials): Promise<void>;
  updateConnectionStatus(id: string, status: ConnectionStatus): Promise<void>;
  updateConnectionDisplayName(id: string, displayName: string | null): Promise<void>;
  deleteConnection(id: string): Promise<void>;

  // Sessions
  createSession(session: StoredSession): Promise<void>;
  getSession(id: string): Promise<StoredSession | null>;
  deleteSession(id: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
  deleteAccountSessions(accountId: string): Promise<void>;

  // API Keys
  createApiKey(key: StoredApiKey): Promise<void>;
  getApiKeyByHash(keyHash: string): Promise<StoredApiKey | null>;
  listApiKeys(accountId: string): Promise<StoredApiKey[]>;
  listApiKeysForConnection(connectionId: string): Promise<StoredApiKey[]>;
  revokeApiKey(keyId: string): Promise<void>;
  updateApiKeyLastUsed(keyId: string): Promise<void>;

  // Filter Config
  getFilterConfig(connectionId: string): Promise<StoredFilterConfig | null>;
  upsertFilterConfig(config: StoredFilterConfig): Promise<void>;
}
