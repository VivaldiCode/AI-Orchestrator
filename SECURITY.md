# Security Policy

Security is a first-class goal of AI Orchestrator. Thank you for helping keep it and its
users safe.

## Supported versions

The project is pre-1.0. Security fixes are applied to the latest `main` and the most recent
`release/*` line.

| Version       | Supported |
| ------------- | --------- |
| latest `main` | ✅        |
| older tags    | ❌        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, use one of:

1. **GitHub Security Advisories** — "Report a vulnerability" on the repository's _Security_
   tab (preferred; keeps the report private until a fix ships).
2. **Email** — `guilhermecamachop@gmail.com` with the subject `SECURITY: ai-orchestrator`.

Please include: affected version/commit, reproduction steps or a proof of concept, impact,
and any suggested remediation.

### What to expect

- Acknowledgement within **72 hours**.
- An initial assessment within **7 days**.
- Coordinated disclosure once a fix is available; we will credit you unless you prefer to
  remain anonymous.

## Security design summary

- **Input validation** — every request body/query is validated with Zod.
- **Transport & headers** — Helmet security headers, strict CORS allow-list, HSTS when
  served over TLS.
- **Rate limiting** — global and per-API-key limits to mitigate brute force / abuse.
- **Authentication** — dashboard uses short-lived JWT access tokens + refresh tokens;
  passwords hashed with `scrypt` (`node:crypto`).
- **API keys** — issued to API clients, stored only as hashes, never recoverable.
- **Secrets at rest** — provider credentials encrypted with **AES-256-GCM** using
  `ORCHESTRATOR_MASTER_KEY`; never logged or returned by the API.
- **No secrets in the repo** — only `.env.example` is committed; `.gitignore` blocks `.env`.
- **Supply chain** — audited, permissively licensed dependencies; `npm audit` runs in CI;
  Dependabot is enabled; container images are pinned and run as a non-root user.

## Hardening checklist for operators

- Generate unique `ORCHESTRATOR_MASTER_KEY` and `JWT_SECRET` (`openssl rand -base64 32`).
- Run the orchestrator on a trusted network or behind a VPN; expose the dashboard over TLS.
- Restrict `DASHBOARD_ORIGIN` to your real origin(s).
- Keep your Macs' Ollama instances on a private network segment.
- Back up the database (it holds your encrypted configuration and metrics).
