# Authentication & OAuth/SSO — Plan

> **Status: planned.** Today the dashboard uses local username + password (scrypt) with JWT
> access/refresh tokens. This page describes the design for adding **OAuth 2.0 / OIDC single
> sign-on** (Google, Microsoft Entra ID, Okta, and any compliant provider). It is the contract we
> will build against; nothing here ships yet.

## Goals

- Let operators sign in with their **company identity** (Google / Microsoft / Okta / generic OIDC).
- Keep **local accounts** working (air-gapped installs, break-glass admin).
- Reuse the existing [roles & permissions](Users-and-Roles.md) — an SSO login maps to a role.
- Add **zero** heavy dependencies: OIDC is just HTTPS + JWT verification, doable with `node:crypto`
  and `fetch`, consistent with our [security stance](Security.md).

## Why OIDC (not bare OAuth2)

OpenID Connect standardises the identity layer on top of OAuth2: a signed `id_token` (JWT), a
discovery document (`/.well-known/openid-configuration`), and a JWKS endpoint for key rotation.
Google, Microsoft and Okta are all OIDC providers, so one implementation covers all three.

## Flow (Authorization Code + PKCE)

```
Browser            Dashboard/API                 Identity Provider (IdP)
  │  click "Sign in with Google"                         │
  ├───────────────► GET /admin/auth/oauth/google         │
  │                 (build authz URL, set state+PKCE)     │
  │ ◄─── 302 redirect to IdP authorize endpoint ─────────┤
  ├──────────────────────────────────────────────────────►  user authenticates
  │ ◄─── 302 back to /admin/auth/oauth/google/callback ──┤  with ?code&state
  ├───────────────► GET …/callback?code=…&state=…        │
  │                 exchange code → id_token (server-side)│──► POST /token
  │                 verify id_token via JWKS              │◄── id_token + access
  │                 find/provision local user            │
  │ ◄─── set our JWT (access+refresh), redirect to app ──┤
```

- **Authorization Code + PKCE**, state parameter for CSRF, nonce in the id_token.
- The IdP secret never reaches the browser; the code exchange is server-side.
- On success we mint **our own** JWTs (same `perms` claim as today), so the rest of the app is
  unchanged.

## Data model (additive)

A new `identities` table links external logins to local users:

```
identities(
  id, user_id → users.id,
  provider text,        -- 'google' | 'microsoft' | 'okta' | 'oidc'
  subject text,         -- the IdP 'sub' claim (stable user id)
  email text,
  created_at, last_login_at,
  unique(provider, subject)
)
```

`users` gains nothing required; SSO users simply have no `password_hash` (a partial/nullable
column, or a sentinel). Local + SSO can coexist on one account (account linking by verified email,
opt-in).

## Provider config

Stored encrypted at rest (AES-256-GCM, like provider secrets):

```
oauth_providers(
  id, type, display_name,
  issuer_url, client_id, client_secret(encrypted),
  scopes, enabled,
  allowed_domains text[],     -- e.g. only @yourcompany.com
  default_role text           -- role granted to new SSO users (default: viewer)
)
```

Configured on a new **Settings → Authentication** dashboard panel (admin only).

## Role mapping

1. Start every new SSO user at `oauth_providers.default_role` (default **viewer** — safe by default).
2. Optional: map IdP **groups/claims → roles** (e.g. Okta group `ai-admins` → `admin`).
3. Admins can override any user's role on the [Users](Users-and-Roles.md) page as today.

## Security checklist

- Verify `id_token` signature against the IdP **JWKS** (cache keys, honour rotation).
- Validate `iss`, `aud`, `exp`, `nonce`; enforce `allowed_domains` on `email`/`hd`.
- PKCE (S256) + signed, short-lived `state`; reject reused codes.
- Refresh-token rotation; revoke on sign-out.
- Always keep a **local break-glass admin** so a misconfigured IdP can't lock you out.

## Rollout

1. Generic **OIDC** provider (covers Google & Okta out of the box via discovery).
2. **Microsoft Entra ID** specifics (tenant-aware issuer).
3. Dashboard config UI + **group→role** mapping.
4. Account linking by verified email.

## Candidate dependencies (to be audited)

The flow is implementable with **no new runtime dependency** (discovery + JWKS + JWT verify via
`fetch` and `node:crypto`). If a helper is ever warranted, `openid-client` (MIT) is the reference
OIDC library and would be vetted per our [dependency policy](Security.md) before adoption.

See also: [Users & Roles](Users-and-Roles.md) · [Security](Security.md) · [Roadmap](Roadmap.md).
