import type { EmailMessage } from "../providers/types.js";
import type { StoredFilterConfig } from "../storage/types.js";
import { BlocklistFilter } from "./blocklist.js";
import { InjectionFilter } from "./injection.js";
import { PiiFilter } from "./pii.js";
import { SanitizerFilter } from "./sanitizer.js";
import type { EmailFilter, FilterResult } from "./types.js";

export class FilterPipeline {
  private filters: EmailFilter[];
  public readonly showFilteredCount: boolean;
  public readonly emailRedactionEnabled: boolean;
  public readonly blockedDomains: string[];
  public readonly attachmentFilteringEnabled: boolean;
  public readonly allowedFolders: string[];

  constructor(userConfig?: StoredFilterConfig | null) {
    this.showFilteredCount = userConfig?.showFilteredCount ?? true;
    this.emailRedactionEnabled = userConfig?.emailRedactionEnabled ?? true;
    this.attachmentFilteringEnabled = userConfig?.attachmentFilteringEnabled ?? true;
    this.allowedFolders = userConfig?.allowedFolders ?? [];
    const blocklist = new BlocklistFilter(userConfig);
    this.blockedDomains = blocklist.getBlockedDomains();
    this.filters = [
      blocklist,
      new SanitizerFilter(),
      new PiiFilter(
        userConfig?.piiRedactionEnabled ?? true,
        userConfig?.emailRedactionEnabled ?? true,
        userConfig?.dollarAmountRedactionEnabled ?? true,
      ),
      new InjectionFilter(userConfig?.injectionDetectionEnabled ?? true),
    ];
  }

  addFilter(filter: EmailFilter): void {
    this.filters.push(filter);
  }

  process(message: EmailMessage): FilterResult {
    // Folder restriction: block messages not in allowed folders
    if (this.allowedFolders.length > 0) {
      const allowed = this.allowedFolders.map((f) => f.toLowerCase());
      const messageLabels = message.labels ?? [];
      const hasAllowedFolder = messageLabels.some((label) =>
        allowed.includes(label.toLowerCase()),
      );
      if (!hasAllowedFolder) {
        return {
          action: "block",
          reason: "Folder not in allowed list",
          message,
        };
      }
    }

    let current = message;

    for (const filter of this.filters) {
      const result = filter.filter(current);

      if (result.action === "block") {
        return result;
      }

      current = result.message;
    }

    // Attachment filtering: strip attachment metadata
    if (this.attachmentFilteringEnabled) {
      current = { ...current, attachments: [] };
    }

    return { action: "pass", message: current };
  }

  processBatch(messages: EmailMessage[]): {
    passed: EmailMessage[];
    blocked: Array<{ message: EmailMessage; reason: string }>;
  } {
    const passed: EmailMessage[] = [];
    const blocked: Array<{ message: EmailMessage; reason: string }> = [];

    for (const message of messages) {
      const result = this.process(message);
      if (result.action === "block") {
        blocked.push({ message, reason: result.reason ?? "Blocked" });
      } else {
        passed.push(result.message);
      }
    }

    return { passed, blocked };
  }
}
