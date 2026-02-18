import { Shield } from "lucide-react";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shield className="h-8 w-8 text-emerald-400" />
          <h1 className="text-2xl font-bold text-zinc-100">AgentCloak</h1>
        </div>
        <p className="mb-6 text-sm text-zinc-400">
          Sign in to manage your email connections, API keys, and content
          filters.
        </p>
        <a
          href="/auth/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
