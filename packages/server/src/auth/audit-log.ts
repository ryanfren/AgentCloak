/**
 * Structured audit logging for security-relevant events.
 * Outputs JSON lines to stdout for easy ingestion by log aggregators.
 */
export function auditLog(event: string, meta: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...meta,
  }));
}
