import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/Card";

export function SettingsPage() {
  const { account } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Account</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Email</span>
            <span className="text-sm">{account?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Name</span>
            <span className="text-sm">{account?.name ?? "Not set"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">Account ID</span>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
              {account?.id}
            </code>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">
          MCP Configuration
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Add AgentCloak as an MCP server in Claude Code:
        </p>
        <div className="rounded-md bg-zinc-800 p-3">
          <code className="block whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {`claude mcp add --transport http agentcloak \\
  http://localhost:3000/mcp \\
  --header "Authorization: Bearer YOUR_API_KEY"`}
          </code>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Create an API key for a connection, then replace YOUR_API_KEY above.
        </p>
      </Card>
    </div>
  );
}
