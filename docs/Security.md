# Security

Security is a first-class goal. See also the repository [SECURITY.md](../SECURITY.md).

## Authentication & authorization

- **Dashboard** — first-run admin creation, then login issues a short-lived JWT **access**
  token + a longer **refresh** token. Passwords are hashed with **scrypt** (`node:crypto`).
- **Inference clients** — **API keys** (256-bit). Stored only as SHA-256 hashes; the secret is
  shown once at creation and never again. Inference is open until the first key exists, then
  enforced.

## Secrets at rest

Provider credentials are encrypted with **AES-256-GCM** using `ORCHESTRATOR_MASTER_KEY`. They
are never logged (pino redaction) nor returned by the API (only `hasCredentials` is exposed).

## Transport & input

- **Helmet** security headers, strict **CORS** allow-list, **rate limiting** (per API key / IP).
- Every request body and query is validated with **Zod**.
- Outbound auth headers from clients are stripped before proxying to nodes.

## Supply chain

- Audited, permissively licensed dependencies; `node:crypto`/`fetch` preferred over new deps.
- `npm audit --audit-level=high` runs in CI; **Dependabot** is enabled.
- Docker images are pinned, multi-stage, and run as a **non-root** user.

## Operator hardening checklist

- [ ] Unique `ORCHESTRATOR_MASTER_KEY` and `JWT_SECRET` (`openssl rand -base64 32`)
- [ ] Serve the dashboard over TLS; restrict `DASHBOARD_ORIGIN`
- [ ] Keep the orchestrator and Macs on a private network / VPN
- [ ] Create an API key to lock down inference
- [ ] Back up the database (encrypted config + metrics)

## Reporting a vulnerability

Please **do not** open a public issue — use a GitHub Security Advisory or email
`guilhermecamachop@gmail.com`. See [SECURITY.md](../SECURITY.md).
