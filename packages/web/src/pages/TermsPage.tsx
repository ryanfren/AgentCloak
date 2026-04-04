import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export function TermsPage() {
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
            <h1 className="text-3xl font-bold">Terms of Use</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Last updated: February 2026
            </p>
            <p className="mt-4 text-sm text-zinc-400 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3">
              These terms apply to the hosted AgentCloak service at{" "}
              <span className="text-zinc-300">agentcloak.up.railway.app</span>.
              If you are self-hosting AgentCloak, the{" "}
              <a
                href="https://github.com/ryanfren/AgentCloak/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                BSL-1.1 license
              </a>{" "}
              governs your use of the software.
            </p>
          </div>

          <Section title="Service Description">
            <p>
              AgentCloak is a source-available proxy that sits between AI agents and
              your email. It holds credentials server-side, filters sensitive
              content, redacts PII, and sanitizes for prompt injection so that
              agents can safely triage, summarize, and draft emails.
            </p>
          </Section>

          <Section title="Your Account">
            <p>
              You are responsible for maintaining the security of your account
              credentials and API keys. Do not share your API keys with untrusted
              parties. You are responsible for all activity that occurs under your
              account and any API keys you create.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>You agree to use the hosted service only for:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Personal email management and productivity</li>
              <li>Internal business use within your organization</li>
              <li>Evaluation and testing of the AgentCloak software</li>
            </ul>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Use the service to access email accounts you are not authorized to
                access
              </li>
              <li>
                Attempt to circumvent the content filter pipeline or security
                controls
              </li>
              <li>
                Use the service to scrape, harvest, or exfiltrate email data at
                scale
              </li>
              <li>
                Interfere with or disrupt the service for other users
              </li>
            </ul>
          </Section>

          <Section title="Email Access">
            <p>
              AgentCloak operates in read-only mode by design. Agents can search,
              read, and create drafts, but cannot send, delete, or modify any
              emails. Draft emails created by agents are saved to your drafts
              folder for your review before sending.
            </p>
          </Section>

          <Section title="No Warranty">
            <p>
              The hosted service is provided <strong className="text-zinc-200">"as is"</strong> without
              warranty of any kind, express or implied. We do not guarantee that
              the service will be uninterrupted, error-free, or that all sensitive
              content will be successfully filtered.
            </p>
            <p className="mt-3">
              While AgentCloak includes multiple layers of content filtering (PII
              redaction, blocklists, injection detection), no automated system is
              perfect. You should review agent-created drafts before sending and
              periodically audit what content agents are accessing.
            </p>
          </Section>

          <Section title="Service Availability">
            <p>
              The hosted service may be modified, suspended, or discontinued at
              any time. Because AgentCloak is source-available, you can always
              self-host your own instance using the{" "}
              <a
                href="https://github.com/ryanfren/AgentCloak"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                public repository
              </a>
              .
            </p>
          </Section>

          <Section title="License">
            <p>
              AgentCloak is licensed under the{" "}
              <a
                href="https://github.com/ryanfren/AgentCloak/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Business Source License 1.1
              </a>
              . You may self-host for internal use, personal projects, and
              non-commercial purposes. The only restriction is offering it as a
              competing hosted service. On February 18, 2030, the code converts to
              Apache 2.0.
            </p>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              We may update these terms from time to time. Changes will be
              reflected by the "Last updated" date at the top of this page.
              Continued use of the service after changes constitutes acceptance of
              the updated terms.
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
            <Link to="/privacy" className="hover:text-zinc-300 transition-colors">
              Privacy
            </Link>
            <span className="text-zinc-400">Terms</span>
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
