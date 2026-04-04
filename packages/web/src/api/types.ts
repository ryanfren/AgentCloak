export interface Account {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Connection {
  id: string;
  email: string;
  provider: string;
  displayName: string | null;
  status: "active" | "revoked" | "error";
  createdAt: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key?: string; // only present on creation
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface FilterConfig {
  connectionId: string;
  blockedDomains: string[];
  blockedSenderPatterns: string[];
  blockedSubjectPatterns: string[];
  piiRedactionEnabled: boolean;
  injectionDetectionEnabled: boolean;
  emailRedactionEnabled: boolean;
  showFilteredCount: boolean;
  securityBlockingEnabled: boolean;
  financialBlockingEnabled: boolean;
  sensitiveSenderBlockingEnabled: boolean;
  dollarAmountRedactionEnabled: boolean;
  attachmentFilteringEnabled: boolean;
  allowedFolders: string[];
}
