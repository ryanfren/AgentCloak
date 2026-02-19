import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { authApi, type AuthConfig } from "../api/client";

const GOOGLE_OAUTH_INVITE_ONLY =
  import.meta.env.VITE_GOOGLE_OAUTH_INVITE_ONLY === "true";

export function LoginPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.getAuthConfig().then(setAuthConfig).catch(() => {
      // Fallback: assume only Google OAuth (legacy behavior)
      setAuthConfig({ googleOAuth: true, emailPassword: false });
    });
    // Check for error in URL params
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError === "google_not_configured") {
      setError("Google sign-in is not configured. Use email/password instead.");
    } else if (urlError) {
      setError(urlError.replace(/_/g, " "));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        await authApi.register({ email, password, name: name || undefined });
      } else {
        await authApi.loginWithPassword({ email, password });
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shield className="h-8 w-8 text-emerald-400" />
          <h1 className="text-2xl font-bold text-zinc-100">AgentCloak</h1>
        </div>
        <p className="mb-6 text-center text-sm text-zinc-400">
          {mode === "login"
            ? "Sign in to manage your email connections, API keys, and content filters."
            : "Create an account to get started."}
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {authConfig?.emailPassword && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "register" && (
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading
                ? "..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
            <p className="text-center text-sm text-zinc-500">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setError(""); }}
                    className="text-emerald-400 hover:underline"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setError(""); }}
                    className="text-emerald-400 hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        )}

        {authConfig?.emailPassword && authConfig?.googleOAuth && (
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-700" />
            <span className="text-xs text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-700" />
          </div>
        )}

        {authConfig?.googleOAuth && (
          <>
            <a
              href="/auth/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Sign in with Google
            </a>
            {GOOGLE_OAUTH_INVITE_ONLY && (
              <p className="mt-2 text-center text-xs text-amber-400/80">
                Google sign-in is invite-only during beta — use
                email/password above to get started.{" "}
                <a
                  href="/#contact"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = "/#contact";
                  }}
                  className="underline hover:text-amber-300"
                >
                  Request Google access
                </a>
              </p>
            )}
          </>
        )}

        {!authConfig && (
          <div className="text-center text-sm text-zinc-500">Loading...</div>
        )}
      </div>
    </div>
  );
}
