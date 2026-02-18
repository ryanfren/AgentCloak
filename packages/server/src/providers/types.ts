export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  labels: string[];
  attachments: EmailAttachmentMeta[];
  isUnread: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: EmailAddress[];
  messageCount: number;
  snippet: string;
  lastMessageDate: string;
  labels: string[];
  isUnread: boolean;
}

export interface DraftInfo {
  id: string;
  messageId: string;
  to: EmailAddress[];
  subject: string;
  snippet: string;
  updatedAt: string;
}

export interface LabelInfo {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal: number;
  messagesUnread: number;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  pageToken?: string;
}

export interface SearchResult {
  messages: EmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface ThreadListResult {
  threads: EmailThread[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface DraftListResult {
  drafts: DraftInfo[];
}

export interface CreateDraftInput {
  to: string[];
  subject: string;
  body: string;
  inReplyToThreadId?: string;
}

export interface CreateDraftResult {
  draftId: string;
  messageId: string;
}

export interface ProviderInfo {
  type: string;
  searchCapabilities: string[];
  supportsThreading: boolean;
  supportedFolders: string[];
  limitations: string[];
}

export interface EmailProvider {
  search(options: SearchOptions): Promise<SearchResult>;
  getMessage(messageId: string): Promise<EmailMessage>;
  listThreads(options: SearchOptions): Promise<ThreadListResult>;
  getThread(threadId: string): Promise<{ thread: EmailThread; messages: EmailMessage[] }>;
  createDraft(input: CreateDraftInput): Promise<CreateDraftResult>;
  listDrafts(maxResults?: number): Promise<DraftListResult>;
  listLabels(): Promise<LabelInfo[]>;
  getProviderInfo(): ProviderInfo;
}
