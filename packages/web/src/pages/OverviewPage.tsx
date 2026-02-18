import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Key, Shield } from "lucide-react";
import { api } from "../api/client";
import type { Connection } from "../api/types";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";

export function OverviewPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listConnections()
      .then(setConnections)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="text-2xl font-bold">{connections.length}</div>
              <div className="text-xs text-zinc-500">
                Email Connection{connections.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-2xl font-bold">
                {connections.filter((c) => c.status === "active").length}
              </div>
              <div className="text-xs text-zinc-500">Active</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-2xl font-bold">
                {connections.filter((c) => c.status !== "active").length}
              </div>
              <div className="text-xs text-zinc-500">Issues</div>
            </div>
          </div>
        </Card>
      </div>

      {connections.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <Mail className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <h2 className="mb-1 text-lg font-semibold text-zinc-300">
              No connections yet
            </h2>
            <p className="mb-4 text-sm text-zinc-500">
              Connect an email account to get started.
            </p>
            <Link
              to="/connections"
              className="inline-flex rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Go to Connections
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">
            Connections
          </h2>
          <div className="divide-y divide-zinc-800">
            {connections.map((conn) => (
              <Link
                key={conn.id}
                to={`/connections/${conn.id}`}
                className="flex items-center justify-between py-3 transition-colors hover:bg-zinc-800/30 -mx-2 px-2 rounded"
              >
                <div>
                  <div className="text-sm font-medium">
                    {conn.displayName ?? conn.email}
                  </div>
                  {conn.displayName && (
                    <div className="text-xs text-zinc-500">{conn.email}</div>
                  )}
                </div>
                <StatusBadge status={conn.status} />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
