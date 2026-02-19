import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Github,
  Link as LinkIcon,
  SlidersHorizontal,
  Bot,
  ShieldCheck,
  AlertTriangle,
  Landmark,
  Lock,
  KeyRound,
  FolderLock,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const horrorScenarios = [
  {
    title: "Bank Account Takeover",
    label: "INCIDENT REPORT #0041",
    lines: [
      { agent: true, text: '> Searching inbox for "bank"...' },
      { agent: true, text: "> Found: ACME Bank password reset confirmation" },
      { agent: true, text: "> Extracting reset link from email body..." },
      { agent: true, text: "> Navigating to password reset page..." },
      { agent: true, text: "> Reading 2FA code from new SMS notification email..." },
      { agent: false, text: "Password successfully changed." },
      { agent: true, text: "> Logging in to ACME Bank Online Banking..." },
      { agent: true, text: "> Initiating wire transfer: $24,900.00" },
    ],
  },
  {
    title: "Client List Exfiltrated",
    label: "INCIDENT REPORT #0087",
    lines: [
      { agent: true, text: '> Searching inbox for "invoice", "proposal", "contract"...' },
      { agent: true, text: "> Scanning 1,847 emails for contact information..." },
      { agent: true, text: "> Extracted 312 unique client names and emails" },
      { agent: true, text: "> Compiling: client_list_full.csv" },
      { agent: false, text: "Export complete. 312 contacts with revenue data." },
      { agent: true, text: "> Drafting email to competitors@rival.com..." },
    ],
  },
  {
    title: "Reputation Destroyed",
    label: "INCIDENT REPORT #0153",
    lines: [
      { agent: true, text: '> Reading thread: "Q4 Partnership Proposal"...' },
      { agent: true, text: "> Drafting reply to CEO of partner company..." },
      { agent: true, text: '> Tone: "direct and assertive" (per user preferences)' },
      { agent: false, text: 'Sent: "Your proposal is inadequate and we have better options."' },
      { agent: true, text: '> Reading thread: "Team Feedback Request"...' },
      { agent: true, text: "> Replying-all to 47 recipients..." },
      { agent: false, text: "Sent: Performance critiques to entire department." },
      { agent: true, text: "> 12 new unread replies. Subject: Urgent..." },
    ],
  },
];

const steps = [
  {
    icon: LinkIcon,
    title: "Connect",
    description:
      "Link your Gmail via OAuth or any IMAP email account.",
  },
  {
    icon: SlidersHorizontal,
    title: "Configure",
    description:
      "Set content filters, block sensitive senders, restrict folders, and enable PII redaction.",
  },
  {
    icon: Bot,
    title: "Connect Agents",
    description:
      "Give each AI agent its own API key with its own filter config. Works with Claude Code, OpenClaw, or any MCP-compatible client.",
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: "PII Redaction",
    description:
      "SSNs, credit cards, API keys, and bank account numbers automatically replaced with placeholders.",
  },
  {
    icon: AlertTriangle,
    title: "Prompt Injection Detection",
    description:
      "Emails containing hidden instructions to manipulate agents are flagged and blocked.",
  },
  {
    icon: Landmark,
    title: "Financial Email Blocking",
    description:
      "Bank statements, payment confirmations, and tax documents blocked by default.",
  },
  {
    icon: Lock,
    title: "Security Email Blocking",
    description:
      "Password resets, 2FA codes, verification links, and login alerts never reach agents.",
  },
  {
    icon: KeyRound,
    title: "Credential Isolation",
    description:
      "OAuth tokens and passwords stay server-side. Agents only get filtered content through API keys.",
  },
  {
    icon: FolderLock,
    title: "Folder & Sender Controls",
    description:
      "Restrict which folders agents can see. Block specific domains and sender patterns.",
  },
];

const GITHUB_URL = "https://github.com/ryanfren/AgentCloak";

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is AgentCloak?",
    answer:
      "AgentCloak is an open-source MCP (Model Context Protocol) proxy for email. It sits between AI agents and your inbox, holding credentials server-side while filtering sensitive content before it reaches the agent.",
  },
  {
    question: "Which email providers are supported?",
    answer: "Gmail via OAuth and any IMAP-compatible email server.",
  },
  {
    question: "Which AI agents work with AgentCloak?",
    answer:
      "Any MCP-compatible client works out of the box — Claude Code, OpenClaw, or custom integrations via the HTTP MCP endpoint.",
  },
  {
    question: "Can I self-host it?",
    answer: (
      <>
        Yes, AgentCloak is fully open-source. Clone the repo, set up your
        environment variables, and run with Docker or Node. See the{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:underline"
        >
          GitHub repo
        </a>{" "}
        for deployment instructions.
      </>
    ),
  },
  {
    question: "Is this the hosted version?",
    answer: (
      <>
        Yes, this instance is hosted. You can also{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:underline"
        >
          self-host your own instance
        </a>
        .
      </>
    ),
  },
  {
    question: "How do API keys work?",
    answer:
      "Each connection can have multiple API keys with independent filter configurations. Keys are hashed server-side and never stored in plain text.",
  },
];

function TypewriterLine({
  text,
  className,
  delay,
  onDone,
}: {
  text: string;
  className: string;
  delay: number;
  onDone: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setDisplayed("");
    const timeout = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(id);
          onDoneRef.current();
        }
      }, 18);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);

  return (
    <div className={`py-0.5 ${className}`}>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </div>
  );
}

function HorrorCarousel() {
  const [current, setCurrent] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  const scenario = horrorScenarios[current]!;

  const handleLineDone = useCallback(() => {
    setVisibleLines((v) => v + 1);
  }, []);

  const selectScenario = useCallback((i: number) => {
    setCurrent(i);
    setVisibleLines(0);
  }, []);

  // Reset visible lines when scenario changes
  useEffect(() => {
    setVisibleLines(0);
  }, [current]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-lg border border-red-900/50 bg-zinc-900">
        {/* Terminal title bar */}
        <div className="flex items-center justify-between border-b border-red-900/30 bg-red-950/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-medium text-red-400">
              {scenario.label}
            </span>
          </div>
          <span className="text-xs font-mono text-red-400/60">
            {scenario.title}
          </span>
        </div>
        {/* Terminal body */}
        <div className="px-4 py-4 font-mono text-sm leading-relaxed min-h-[240px]">
          {scenario.lines.map((line, i) => {
            if (i > visibleLines) return null;
            return (
              <TypewriterLine
                key={`${current}-${i}`}
                text={line.text}
                className={
                  line.agent
                    ? "text-zinc-400"
                    : "text-red-400 font-medium"
                }
                delay={i === 0 ? 300 : 0}
                onDone={i === visibleLines ? handleLineDone : () => {}}
              />
            );
          })}
        </div>
        {/* Dots */}
        <div className="flex items-center justify-center gap-3 border-t border-zinc-800 py-3">
          {horrorScenarios.map((_, i) => (
            <button
              key={i}
              onClick={() => selectScenario(i)}
              className={`h-4 w-4 rounded-full transition-colors ${
                i === current
                  ? "bg-red-400"
                  : "bg-zinc-700 hover:bg-zinc-600"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-zinc-100 transition-colors hover:text-emerald-400"
      >
        {question}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-zinc-400">{answer}</p>
      )}
    </div>
  );
}

export function LandingPage() {
  const { account, loading } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-400" />
            <span className="text-lg font-semibold">AgentCloak</span>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              <>
                {account ? (
                  <>
                    <span className="text-sm text-zinc-400">
                      {account.email}
                    </span>
                    <Link
                      to="/dashboard"
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                    >
                      Dashboard
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
                    >
                      Login
                    </Link>
                    <Link
                      to="/login"
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Give AI agents email access —{" "}
            <span className="text-emerald-400">
              without giving away the keys
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            An open-source MCP proxy that holds credentials server-side, filters
            sensitive content, redacts PII, and detects prompt injection — so
            your AI agents can read email without accessing anything they
            shouldn't.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/login"
              className="rounded-md bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Get Started
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* What Could Go Wrong */}
      <section className="border-t border-zinc-800/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-2xl font-bold">
            What happens without guardrails?
          </h2>
          <p className="mb-12 text-center text-sm text-zinc-500">
            Unfiltered AI agents + full email access.
          </p>
          <HorrorCarousel />
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-zinc-800/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600/20 text-sm font-bold text-emerald-400">
                    {i + 1}
                  </div>
                  <step.icon className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-500">
            Built on the{" "}
            <span className="text-zinc-400">Model Context Protocol (MCP)</span>{" "}
            standard for AI tool interoperability.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="border-t border-zinc-800/50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold">
            Security Features
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-5"
              >
                <feature.icon className="mb-3 h-5 w-5 text-emerald-400" />
                <h3 className="mb-1 text-sm font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-800/50 px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-12 text-center text-2xl font-bold">
            Frequently Asked Questions
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6">
            {faqs.map((faq) => (
              <FAQItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span>AgentCloak</span>
            <span className="hidden sm:inline">
              — Open source email security for AI agents
            </span>
          </div>
          <span>&copy; {new Date().getFullYear()} AgentCloak</span>
        </div>
      </footer>
    </div>
  );
}
