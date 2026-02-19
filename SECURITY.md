# Security Policy

AgentCloak takes security seriously. Because this project handles email credentials and filters sensitive content, we are committed to addressing security vulnerabilities promptly and transparently.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's private security advisory feature to report vulnerabilities confidentially:

[Report a vulnerability](https://github.com/ryanfren/AgentCloak/security/advisories)

You can also find this under **Settings > Security > Advisories** in the repository.

When reporting, please include:

- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested mitigations, if known

## Response Timeline

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation plan within **7 days** for confirmed vulnerabilities.

## Scope

### In Scope

The following types of issues are considered security vulnerabilities:

- **Authentication bypass** -- Circumventing API key validation or gaining access without valid credentials
- **PII leaks through filters** -- Sensitive content passing through the filter pipeline when it should be redacted or blocked
- **Credential exposure** -- Email passwords, API keys, or other secrets being logged, leaked in responses, or otherwise exposed
- **Injection into filter pipeline** -- Crafted input that manipulates filter behavior to bypass content sanitization
- **Unauthorized access to email content** -- Accessing email data belonging to a different user or connection

### Out of Scope

The following are not considered in-scope vulnerabilities:

- **Social engineering** -- Attacks that rely on manipulating individuals rather than exploiting technical flaws
- **Denial of service against self-hosted instances** -- Resource exhaustion or availability attacks targeting user-managed deployments
- **Issues in dependencies that are already patched upstream** -- Vulnerabilities in third-party packages where a fix is already available in a newer version

## Disclosure

We follow a coordinated disclosure process. Once a fix is available, we will publish a security advisory on GitHub detailing the vulnerability and the remediation steps. We ask that reporters refrain from public disclosure until a fix has been released.

## Thank You

We appreciate the efforts of security researchers and community members who help keep AgentCloak and its users safe. Thank you for reporting responsibly.
