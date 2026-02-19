import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="flex items-center gap-2 text-zinc-100 hover:text-emerald-400 transition-colors w-fit">
            <Shield className="h-5 w-5 text-emerald-400" />
            <span className="text-lg font-semibold">AgentCloak</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Last updated: February 2026
            </p>
            <p className="mt-4 text-sm text-zinc-400 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3">
              This privacy policy applies to the hosted AgentCloak service at{" "}
              <span className="text-zinc-300">agentcloak.up.railway.app</span>.
              If you are self-hosting AgentCloak, your deployment is governed by
              your own privacy practices.
            </p>
          </div>

          <Section title="What We Collect">
            <p>When you use the hosted AgentCloak service, we store:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-zinc-200">Account information</strong> --
                email address, hashed password, and display name
              </li>
              <li>
                <strong className="text-zinc-200">Email connection credentials</strong> --
                Gmail OAuth tokens, IMAP credentials, or Apps Script secrets, all encrypted at rest
              </li>
              <li>
                <strong className="text-zinc-200">API keys</strong> -- stored as
                SHA-256 hashes (the original key is shown once and never stored)
              </li>
              <li>
                <strong className="text-zinc-200">Filter configuration</strong> --
                your content filter preferences (blocklist rules, PII settings, folder restrictions)
              </li>
            </ul>
          </Section>

          <Section title="How Data Is Stored">
            <p>
              All data is stored in a database on the server. Email
              credentials (OAuth tokens, IMAP passwords, Apps Script secrets) are
              encrypted at rest using AES-256-GCM. Passwords are hashed using
              scrypt. API keys are stored as SHA-256 hashes.
            </p>
            <p className="mt-3">
              Email content is <strong className="text-zinc-200">not stored</strong>.
              Emails are fetched from your email provider on demand, passed through
              the filter pipeline, and returned to the requesting agent. No email
              content is cached or persisted on AgentCloak's servers.
            </p>
          </Section>

          <Section title="What AI Agents Can Access">
            <p>
              Agents authenticate with API keys and receive only filtered email
              content. They never have access to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Your email credentials (OAuth tokens, passwords, secrets)</li>
              <li>Your account password or session</li>
              <li>Your filter configuration or dashboard settings</li>
              <li>Email addresses (redacted by default)</li>
              <li>Emails blocked by your filter rules</li>
            </ul>
          </Section>

          <Section title="Third-Party Services">
            <p>
              AgentCloak does not share your data with third parties. Your email
              content passes directly between your email provider and the
              AgentCloak server. The only external connections are to your
              configured email provider (Gmail API, IMAP server, or Apps Script
              endpoint).
            </p>
          </Section>

          <Section title="Data Retention and Deletion">
            <p>
              You can delete your email connections and API keys at any time
              through the dashboard. Deleting a connection removes the stored
              credentials. Account deletion removes all associated data.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Changes will be
              reflected by the "Last updated" date at the top of this page.
            </p>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span>AgentCloak</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">Privacy</span>
            <Link to="/terms" className="hover:text-zinc-300 transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">
        {children}
      </div>
    </section>
  );
}
