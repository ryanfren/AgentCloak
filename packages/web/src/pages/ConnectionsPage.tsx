import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Copy, Mail, Plus, Server, Trash2, Zap } from "lucide-react";
import { api } from "../api/client";
import type { Connection } from "../api/types";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";

export function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [imapModalOpen, setImapModalOpen] = useState(false);
  const [gasModalOpen, setGasModalOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const load = () => {
    api
      .listConnections()
      .then(setConnections)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Disconnect this email? This will also revoke all API keys for this connection.",
      )
    )
      return;
    await api.deleteConnection(id);
    load();
  };

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connections</h1>
        <div className="relative" ref={addMenuRef}>
          <button
            onClick={() => setAddMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Add
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
              <button
                onClick={() => {
                  setAddMenuOpen(false);
                  setGasModalOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <Zap className="h-4 w-4 text-amber-500" />
                Gmail (Apps Script)
              </button>
              <a
                href="/api/connections/gmail/connect"
                onClick={() => setAddMenuOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <Mail className="h-4 w-4 text-zinc-400" />
                Gmail (OAuth)
              </a>
              <button
                onClick={() => {
                  setAddMenuOpen(false);
                  setImapModalOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <Server className="h-4 w-4 text-zinc-400" />
                IMAP
              </button>
            </div>
          )}
        </div>
      </div>

      {connections.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <Mail className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">
              No email accounts connected. Connect Gmail, add an IMAP account,
              or use Apps Script to get started.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Card key={conn.id}>
              <div className="flex items-center justify-between">
                <Link
                  to={`/connections/${conn.id}`}
                  className="flex-1"
                >
                  <div className="flex items-center gap-3">
                    {conn.provider === "gas" ? (
                      <Zap className="h-5 w-5 text-amber-500" />
                    ) : conn.provider.startsWith("imap") ? (
                      <Server className="h-5 w-5 text-zinc-500" />
                    ) : (
                      <Mail className="h-5 w-5 text-zinc-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {conn.displayName ?? conn.email}
                        </span>
                        <StatusBadge status={conn.status} />
                      </div>
                      {conn.displayName && (
                        <div className="text-xs text-zinc-500">
                          {conn.email}
                        </div>
                      )}
                      <div className="text-xs text-zinc-600">
                        {conn.provider === "gas"
                          ? "Apps Script"
                          : conn.provider}{" "}
                        &middot; Connected{" "}
                        {new Date(conn.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(conn.id)}
                  className="rounded-md p-2 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
                  title="Disconnect"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ImapModal
        open={imapModalOpen}
        onClose={() => setImapModalOpen(false)}
        onConnected={() => {
          setImapModalOpen(false);
          load();
        }}
      />

      <GasModal
        open={gasModalOpen}
        onClose={() => setGasModalOpen(false)}
        onConnected={() => {
          setGasModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

function ImapModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tls, setTls] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setHost("");
    setPort("993");
    setUsername("");
    setPassword("");
    setTls(true);
    setDisplayName("");
    setTesting(false);
    setConnecting(false);
    setTestResult(null);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const result = await api.testImapConnection({
        host,
        port: Number(port),
        username,
        password,
        tls,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      await api.connectImap({
        host,
        port: Number(port),
        username,
        password,
        tls,
        displayName: displayName || undefined,
      });
      reset();
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const inputClass = INPUT_CLASS;

  return (
    <Modal open={open} onClose={handleClose} title="Add IMAP Account">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            IMAP Host
          </label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="imap.fastmail.com"
            className={inputClass}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Port
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={tls}
                onChange={(e) => setTls(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
              />
              TLS
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Username / Email
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="user@example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Password / App Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="App-specific password"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Display Name (optional)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Fastmail"
            className={inputClass}
          />
        </div>

        {testResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              testResult.success
                ? "bg-emerald-900/50 text-emerald-300"
                : "bg-red-900/50 text-red-300"
            }`}
          >
            {testResult.success
              ? "Connection successful!"
              : `Failed: ${testResult.error}`}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !host || !username || !password}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting || !host || !username || !password}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy Script
        </>
      )}
    </button>
  );
}

function GasModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret, setSecret] = useState("");
  const [script, setScript] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    email?: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setStep(1);
    setSecret("");
    setScript("");
    setEndpointUrl("");
    setDisplayName("");
    setLoading(false);
    setTesting(false);
    setTestResult(null);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Load script on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getGasScript()
      .then(({ secret: s, script: sc }) => {
        setSecret(s);
        setScript(sc);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to generate script"),
      )
      .finally(() => setLoading(false));
  }, [open]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const result = await api.testGasConnection({ endpointUrl, secret });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      await api.connectGas({
        endpointUrl,
        secret,
        displayName: displayName || undefined,
      });
      reset();
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Connect via Apps Script" wide>
      <div className="space-y-4">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={step === 1 ? "font-semibold text-amber-400" : step > 1 ? "text-emerald-400" : ""}
          >
            1. Copy Script
          </span>
          <span>&rarr;</span>
          <span
            className={step === 2 ? "font-semibold text-amber-400" : step > 2 ? "text-emerald-400" : ""}
          >
            2. Test
          </span>
          <span>&rarr;</span>
          <span className={step === 3 ? "font-semibold text-amber-400" : ""}>
            3. Connect
          </span>
        </div>

        {step === 1 && (
          <>
            {loading ? (
              <div className="py-8 text-center text-sm text-zinc-400">
                Generating script...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Apps Script Code
                  </span>
                  <CopyButton text={script} />
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
                  {script}
                </pre>
                <div className="space-y-2 text-sm text-zinc-400">
                  <p className="font-medium text-zinc-300">Instructions:</p>
                  <ol className="list-inside list-decimal space-y-2">
                    <li>
                      Go to{" "}
                      <span className="text-amber-400">script.google.com</span>{" "}
                      and create a new project
                    </li>
                    <li>
                      Delete the default code, paste the script above, and click{" "}
                      <strong>Save</strong>
                    </li>
                    <li>
                      Click <strong>Run</strong>. A permissions dialog will appear:
                      <ul className="mt-1 ml-4 list-disc space-y-1 text-zinc-500">
                        <li>
                          Click <strong>&quot;Review permissions&quot;</strong> and
                          select your Google account
                        </li>
                        <li>
                          You&apos;ll see a{" "}
                          <strong>
                            &quot;Google hasn&apos;t verified this app&quot;
                          </strong>{" "}
                          warning &mdash; this is expected
                        </li>
                        <li>
                          Click <strong>&quot;Advanced&quot;</strong>, then click{" "}
                          <strong>
                            &quot;Go to &lt;project name&gt; (unsafe)&quot;
                          </strong>
                        </li>
                        <li>
                          Check the <strong>checkbox</strong> to grant Gmail
                          permissions and click <strong>&quot;Continue&quot;</strong>
                        </li>
                      </ul>
                    </li>
                    <li>
                      Click <strong>Deploy</strong> &rarr;{" "}
                      <strong>New deployment</strong> &rarr;{" "}
                      <strong>Web app</strong>
                    </li>
                    <li>
                      Set &quot;Execute as&quot; to <strong>Me</strong> and
                      &quot;Who has access&quot; to <strong>Anyone</strong>
                    </li>
                    <li>Copy the deployment URL</li>
                  </ol>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={loading || !script}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-400">
              <p className="font-medium text-zinc-300">
                To get the deployment URL:
              </p>
              <ol className="list-inside list-decimal space-y-1">
                <li>
                  In Apps Script, click <strong>Deploy</strong> &rarr;{" "}
                  <strong>New deployment</strong>
                </li>
                <li>
                  Click the <strong>gear icon</strong> next to &quot;Select
                  type&quot; and choose <strong>Web app</strong>
                </li>
                <li>
                  Set &quot;Execute as&quot; to <strong>Me</strong>
                </li>
                <li>
                  Change &quot;Who has access&quot; from &quot;Only myself&quot;
                  to <strong>Anyone</strong>
                </li>
                <li>
                  Click <strong>Deploy</strong> and copy the URL
                </li>
              </ol>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Deployment URL
              </label>
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Gmail (Apps Script)"
                className={INPUT_CLASS}
              />
            </div>

            {testResult && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  testResult.success
                    ? "bg-emerald-900/50 text-emerald-300"
                    : "bg-red-900/50 text-red-300"
                }`}
              >
                {testResult.success
                  ? `Connected to ${testResult.email}`
                  : `Failed: ${testResult.error}`}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => {
                  setStep(1);
                  setTestResult(null);
                  setError("");
                }}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !endpointUrl}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!testResult?.success}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-md bg-zinc-800 px-4 py-3 text-sm">
              <p className="text-zinc-300">
                Ready to connect{" "}
                <span className="font-medium text-emerald-400">
                  {testResult?.email}
                </span>{" "}
                via Apps Script.
              </p>
              {displayName && (
                <p className="mt-1 text-xs text-zinc-500">
                  Display name: {displayName}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => {
                  setStep(2);
                  setError("");
                }}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Back
              </button>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
