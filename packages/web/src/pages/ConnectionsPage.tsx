import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Server, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Connection } from "../api/types";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";

export function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [imapModalOpen, setImapModalOpen] = useState(false);

  const load = () => {
    api
      .listConnections()
      .then(setConnections)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImapModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
          >
            <Server className="h-4 w-4" />
            Add IMAP Account
          </button>
          <a
            href="/api/connections/gmail/connect"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Connect Gmail
          </a>
        </div>
      </div>

      {connections.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <Mail className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">
              No email accounts connected. Connect Gmail or add an IMAP account
              to get started.
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
                    {conn.provider.startsWith("imap") ? (
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
                        {conn.provider} &middot; Connected{" "}
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
    </div>
  );
}

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

  const inputClass =
    "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

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
