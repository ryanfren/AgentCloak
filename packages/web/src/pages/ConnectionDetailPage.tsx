import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Key, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { ApiKey, Connection, FilterConfig } from "../api/types";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { TagInput } from "../components/TagInput";
import { Toggle } from "../components/Toggle";

interface SetupOption {
  id: string;
  label: string;
  hint: string;
  content: string;
}

function getSetupOptions(apiKey: string, mcpUrl: string): SetupOption[] {
  return [
    {
      id: "claude-global",
      label: "Claude Code (Global)",
      hint: "Run this in your terminal:",
      content: `claude mcp add --transport http agentcloak --scope user ${mcpUrl} --header "Authorization: Bearer ${apiKey}"`,
    },
    {
      id: "claude-project",
      label: "Claude Code (Project)",
      hint: "Run this from your project directory:",
      content: `claude mcp add --transport http agentcloak ${mcpUrl} --header "Authorization: Bearer ${apiKey}"`,
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      hint: "Give this prompt to OpenClaw to set up the connection:",
      content: `Set up AgentCloak email integration for OpenClaw

I have an AgentCloak MCP server for email access. Since OpenClaw doesn't support MCP natively yet, create a shell wrapper that calls the HTTP endpoint directly via curl.

My AgentCloak API key: ${apiKey}

What to do:
Create a script at ~/workspace/tools/mcp-email.sh that wraps the AgentCloak MCP HTTP API. The endpoint is ${mcpUrl}. It uses JSON-RPC over HTTP with SSE responses. You need to:
- Send requests with Authorization: Bearer <api_key> header
- Include Accept: application/json, text/event-stream header
- Use tools/call method with tool name and arguments
- Parse the SSE data: line from the response

First, call the tools/list method to discover what tools are available, then test with a simple query like search_emails with {"query":"is:unread","max_results":5}.

Make the script callable as: mcp-email.sh <tool_name> '<json_params>'

Confirm it works by showing me my latest unread emails.

Available MCP methods for reference: initialize, tools/list, tools/call. The tools/call params format is {"name":"<tool_name>","arguments":{...}}.`,
    },
  ];
}

export function ConnectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [filters, setFilters] = useState<FilterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [setupOption, setSetupOption] = useState("claude-global");
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([
      api.getConnection(id),
      api.listKeys(id),
      api.getFilters(id),
    ])
      .then(([conn, k, f]) => {
        setConnection(conn);
        setKeys(k);
        setFilters(f);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const handleCreateKey = async () => {
    if (!id || !newKeyName.trim()) return;
    const result = await api.createKey(id, newKeyName.trim());
    setCreatedKey(result.key ?? null);
    setNewKeyName("");
    setShowCreateKey(false);
    load();
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!id || !confirm("Revoke this API key? This cannot be undone.")) return;
    await api.revokeKey(id, keyId);
    load();
  };

  const handleFilterToggle = async (
    field: keyof FilterConfig,
    value: boolean,
  ) => {
    if (!id) return;
    try {
      const updated = await api.updateFilters(id, { [field]: value });
      setFilters(updated);
    } catch (err) {
      console.error("Failed to update filter:", err);
    }
  };

  const handleFilterArray = async (
    field: keyof FilterConfig,
    value: string[],
  ) => {
    if (!id) return;
    try {
      const updated = await api.updateFilters(id, { [field]: value });
      setFilters(updated);
    } catch (err) {
      console.error("Failed to update filter:", err);
    }
  };

  const filterInfo: Record<string, { title: string; body: string }> = {
    piiRedaction: {
      title: "PII Redaction",
      body: "Automatically scans email content and redacts personally identifiable information before it reaches AI agents. This includes Social Security numbers, credit card numbers, API keys and tokens (Stripe, AWS, Bearer tokens), bank account and routing numbers, and PEM private keys. Redacted values are replaced with placeholders like [SSN_REDACTED] so the agent knows something was removed without seeing the sensitive data.",
    },
    emailRedaction: {
      title: "Email Address Redaction",
      body: "Replaces email addresses found in message bodies, subjects, and snippets with [EMAIL_REDACTED]. This prevents AI agents from learning or leaking email addresses of your contacts. Sender and recipient addresses in the email headers are separately controlled\u2014when enabled, the agent sees display names only (e.g. \"John Smith\" instead of \"john@example.com\").",
    },
    injectionDetection: {
      title: "Injection Detection",
      body: "Scans email content for prompt injection attempts\u2014techniques where a malicious email tries to manipulate the AI agent by embedding hidden instructions. Detected patterns include phrases like \"ignore previous instructions\", \"system prompt\", and other common injection vectors. Suspicious emails are flagged and blocked from reaching the agent to prevent unauthorized actions.",
    },
    showFilteredCount: {
      title: "Show Filtered Count",
      body: "When enabled, search results and thread listings will include a count of how many emails were filtered out (e.g. \"3 emails filtered\"). This gives the AI agent context that some messages were hidden. When disabled, filtered emails are silently removed with no indication they existed.",
    },
    securityBlocking: {
      title: "Security Email Blocking",
      body: "Blocks emails related to account security and authentication. This includes password reset links, two-factor authentication codes, one-time passwords (OTPs), verification emails, login alerts, new device notifications, magic links, and suspicious activity warnings. These emails often contain sensitive tokens or codes that should never be exposed to AI agents.",
    },
    financialBlocking: {
      title: "Financial Email Blocking",
      body: "Blocks emails from financial institutions and emails with financial content. Blocked domains include major banks (Chase, Bank of America, Wells Fargo, etc.), payment processors (PayPal, Venmo, Stripe), investment platforms (Robinhood, Fidelity), and government financial agencies (IRS, SSA). Also blocks emails with financial subject lines like bank statements, payment confirmations, tax documents, and wire transfer notifications.",
    },
    sensitiveSenderBlocking: {
      title: "Sensitive Sender Blocking",
      body: "Blocks emails from sender addresses that match security-sensitive patterns. This includes addresses like security@, fraud@, verify@, authentication@, and noreply addresses from government domains (.gov), banks, and financial institutions. These senders typically send authentication tokens, security alerts, or financial notifications that should not be accessible to AI agents.",
    },
    dollarAmountRedaction: {
      title: "Dollar Amount Redaction",
      body: "Redacts large dollar amounts (formatted as $X,XXX.XX or larger) found in email content, replacing them with [AMOUNT_REDACTED]. This is separate from the main PII redaction toggle so you can control financial amount visibility independently. Only amounts with comma separators ($1,000.00 and above) are redacted\u2014smaller amounts like $9.99 pass through.",
    },
    attachmentFiltering: {
      title: "Attachment Filtering",
      body: "When enabled, attachment metadata (filenames, MIME types, file sizes) is stripped from emails before they reach AI agents. The agent will not know that attachments exist on a message. This prevents the agent from referencing or requesting access to potentially sensitive files like financial documents, contracts, or personal photos.",
    },
  };

  const showInfo = (key: string) => {
    const info = filterInfo[key];
    if (info) setInfoModal(info);
  };

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  if (!connection) {
    return <div className="text-zinc-400">Connection not found.</div>;
  }

  const mcpUrl = `${window.location.origin}/mcp`;
  const setupOptions = createdKey ? getSetupOptions(createdKey, mcpUrl) : [];
  const selectedSetup = setupOptions.find((o) => o.id === setupOption) ?? setupOptions[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/connections"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {connection.displayName ?? connection.email}
          </h1>
          {connection.displayName && (
            <p className="text-sm text-zinc-500">{connection.email}</p>
          )}
        </div>
        <StatusBadge status={connection.status} />
        {connection.provider === "gmail" && (
          <a
            href={`/api/connections/${id}/reauthorize`}
            className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Re-authorize
          </a>
        )}
      </div>

      {/* API Keys */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">API Keys</h2>
          <button
            onClick={() => setShowCreateKey(true)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <Plus className="h-3 w-3" />
            Create Key
          </button>
        </div>

        {createdKey && (
          <div className="mb-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-1 text-xs font-medium text-emerald-400">
              New API Key (copy now - shown only once)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200">
                {createdKey}
              </code>
              <CopyButton text={createdKey} />
            </div>
            {/* Setup instructions dropdown */}
            <div className="mt-3 border-t border-emerald-500/10 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-400">Setup for:</span>
                <select
                  value={setupOption}
                  onChange={(e) => setSetupOption(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                >
                  {setupOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {selectedSetup && (
                <>
                  <div className="mb-1 text-xs text-zinc-400">
                    {selectedSetup.hint}
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 whitespace-pre-wrap break-all rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200">
                      {selectedSetup.content}
                    </code>
                    <CopyButton text={selectedSetup.content} />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-400"
            >
              Dismiss
            </button>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-600">
            No API keys. Create one to connect an AI agent.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-zinc-600" />
                  <span className="text-sm">{k.name}</span>
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-500">
                    {k.prefix}...
                  </code>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">
                    {k.revokedAt
                      ? "Revoked"
                      : k.lastUsedAt
                        ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : "Never used"}
                  </span>
                  {!k.revokedAt && (
                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      className="rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                      title="Revoke key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Filter Configuration */}
      {filters && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Content Filters
          </h2>
          <div className="divide-y divide-zinc-800/50">
            <Toggle
              label="PII Redaction"
              description="Redact SSNs, credit cards, API keys, and other sensitive data"
              enabled={filters.piiRedactionEnabled}
              onChange={(v) => handleFilterToggle("piiRedactionEnabled", v)}
              onInfo={() => showInfo("piiRedaction")}
            />
            <Toggle
              label="Email Address Redaction"
              description="Hide email addresses from AI agents, showing only names"
              enabled={filters.emailRedactionEnabled}
              onChange={(v) => handleFilterToggle("emailRedactionEnabled", v)}
              onInfo={() => showInfo("emailRedaction")}
            />
            <Toggle
              label="Injection Detection"
              description="Detect and flag prompt injection attempts in emails"
              enabled={filters.injectionDetectionEnabled}
              onChange={(v) =>
                handleFilterToggle("injectionDetectionEnabled", v)
              }
              onInfo={() => showInfo("injectionDetection")}
            />
            <Toggle
              label="Show Filtered Count"
              description="Tell agents how many emails were filtered out"
              enabled={filters.showFilteredCount}
              onChange={(v) => handleFilterToggle("showFilteredCount", v)}
              onInfo={() => showInfo("showFilteredCount")}
            />
          </div>

          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Blocking Rules
          </h3>
          <div className="divide-y divide-zinc-800/50">
            <Toggle
              label="Security Email Blocking"
              description="Block password resets, 2FA codes, verification emails, login alerts"
              enabled={filters.securityBlockingEnabled}
              onChange={(v) => handleFilterToggle("securityBlockingEnabled", v)}
              onInfo={() => showInfo("securityBlocking")}
            />
            <Toggle
              label="Financial Email Blocking"
              description="Block bank statements, payment confirmations, tax documents"
              enabled={filters.financialBlockingEnabled}
              onChange={(v) => handleFilterToggle("financialBlockingEnabled", v)}
              onInfo={() => showInfo("financialBlocking")}
            />
            <Toggle
              label="Sensitive Sender Blocking"
              description="Block emails from security/verification senders"
              enabled={filters.sensitiveSenderBlockingEnabled}
              onChange={(v) =>
                handleFilterToggle("sensitiveSenderBlockingEnabled", v)
              }
              onInfo={() => showInfo("sensitiveSenderBlocking")}
            />
            <Toggle
              label="Dollar Amount Redaction"
              description="Redact large dollar amounts ($X,XXX.XX) in email content"
              enabled={filters.dollarAmountRedactionEnabled}
              onChange={(v) =>
                handleFilterToggle("dollarAmountRedactionEnabled", v)
              }
              onInfo={() => showInfo("dollarAmountRedaction")}
            />
          </div>

          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Content Processing
          </h3>
          <div className="divide-y divide-zinc-800/50">
            <Toggle
              label="Attachment Filtering"
              description="Hide attachment details from AI agents"
              enabled={filters.attachmentFilteringEnabled}
              onChange={(v) =>
                handleFilterToggle("attachmentFilteringEnabled", v)
              }
              onInfo={() => showInfo("attachmentFiltering")}
            />
          </div>

          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Custom Rules
          </h3>
          <div className="space-y-4 pt-2">
            <div>
              <div className="mb-1 text-sm font-medium text-zinc-200">
                Custom Blocked Domains
              </div>
              <div className="mb-2 text-xs text-zinc-500">
                Additional sender domains to block (e.g. marketing.example.com)
              </div>
              <TagInput
                items={filters.blockedDomains}
                onChange={(items) => handleFilterArray("blockedDomains", items)}
                placeholder="Add domain..."
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-zinc-200">
                Custom Blocked Subject Keywords
              </div>
              <div className="mb-2 text-xs text-zinc-500">
                Subject line patterns to block (supports regex)
              </div>
              <TagInput
                items={filters.blockedSubjectPatterns}
                onChange={(items) =>
                  handleFilterArray("blockedSubjectPatterns", items)
                }
                placeholder="Add keyword or pattern..."
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-zinc-200">
                Allowed Folders
              </div>
              <div className="mb-2 text-xs text-zinc-500">
                Restrict agent access to specific folders. Leave empty to allow
                all folders.
              </div>
              <TagInput
                items={filters.allowedFolders}
                onChange={(items) => handleFilterArray("allowedFolders", items)}
                placeholder="Add folder..."
              />
              <div className="mt-1 text-xs text-zinc-600">
                Common folders: INBOX, Sent, Drafts, Trash, Archive
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Filter Info Modal */}
      <Modal
        open={infoModal !== null}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title ?? ""}
      >
        <p className="text-sm leading-relaxed text-zinc-400">
          {infoModal?.body}
        </p>
      </Modal>

      {/* Create Key Modal */}
      <Modal
        open={showCreateKey}
        onClose={() => setShowCreateKey(false)}
        title="Create API Key"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. claude-code"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreateKey(false)}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateKey}
              disabled={!newKeyName.trim()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
