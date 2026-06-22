# Authentication & OAuth/SSO

> **Status: implemented.** The dashboard supports **OAuth 2.0 / OIDC single sign-on** (Google,
> Microsoft Entra ID, Okta, and any compliant provider) alongside local username + password.
> `id_token` verification uses the audited [`jose`](https://github.com/panva/jose) library; the
> handshake (discovery, PKCE, code exchange, sealed state) uses only `node:crypto` + `fetch`.

## Configuration

1. Set **`PUBLIC_BASE_URL`** to the URL users hit in their browser (e.g. `https://ai.acme.com`).
   It's used to build the redirect URI and must match what you register at the provider.
2. In the dashboard, go to **Authentication** (admin only) → **Add a provider**:
   - **Type** — Google, Microsoft, Okta, or Generic OIDC (the issuer drives everything).
   - **Issuer URL** — e.g. `https://accounts.google.com`, `https://login.microsoftonline.com/<tenant>/v2.0`, or your Okta org URL. The `…/.well-known/openid-configuration` is discovered automatically.
   - **Client ID / Client secret** — from the provider's app registration (secret is encrypted at rest with AES-256-GCM, never returned).
   - **Allowed email domains** _(optional)_ — restrict sign-in to e.g. `acme.com` (requires a verified email).
   - **Default role** — role granted to users on first SSO login (defaults to **viewer**; see [Users & Roles](Users-and-Roles.md)).
3. After saving, copy the per-provider **callback URL** shown in the table
   (`${PUBLIC_BASE_URL}/admin/auth/oauth/<id>/callback`) and register it as an authorized redirect
   URI in the provider console.
4. A **"Continue with …"** button now appears on the login screen.

> **Break-glass:** keep at least one **local admin** so a misconfigured IdP can never lock you out.

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

## Security checklist (what we enforce)

- ✅ Verify `id_token` signature against the IdP **JWKS** with a strict asymmetric-algorithm
  allowlist (`RS256`/`PS256`/`ES256`) — blocks algorithm-confusion. JWKS is cached and rotated by
  `jose`.
- ✅ Validate `iss`, `aud`, `exp` and the `nonce` we issued; enforce `allowed_domains` (with a
  verified email) when configured. If `email` is absent from the `id_token`, fetch it from
  `/userinfo` — but only trust those claims when their `sub` matches the `id_token`'s.
- ✅ **PKCE** (S256) + a `state` and `nonce` sealed in an **encrypted, HttpOnly, SameSite=Lax,
  single-use** cookie (AES-256-GCM); `state` is cross-checked on callback.
- ✅ Tokens are delivered to the SPA via a **single-use, 60-second handoff code** — they never ride
  in a URL the browser would log.
- ✅ Client secrets encrypted at rest (AES-256-GCM); never returned by the API.
- ✅ A **local break-glass admin** always remains usable (local password login still works).

Verified end-to-end against a mock OIDC IdP (`docker/mock-oidc.mjs`) and unit-tested in
`apps/api/test/oidc.test.ts` (accepts valid; rejects tampered / wrong-aud / wrong-iss / expired /
nonce-mismatch; parses `userinfo_endpoint`; `fetchUserinfo` sends the bearer token).

## Email-domain allowlist & troubleshooting

When **Allowed email domains** is set, sign-in requires a **verified** email whose domain is on the
list. Domains are matched **case- and whitespace-insensitively** (`Guilhermepinto.PT ` ≡
`guilhermepinto.pt`) and stored normalized.

Some IdPs (notably **Pocket-ID**) return `email`/`email_verified` only from the **`/userinfo`**
endpoint, not in the `id_token`. When the `id_token` carries no `email`, the orchestrator now calls
`/userinfo` with the access token (verifying its `sub` matches the `id_token`) and uses those claims
for the allowlist check.

A blocked login renders a **branded HTML page** (not raw JSON) with a **specific** reason so you can
tell what to fix:

| Message | Cause | Fix |
| --- | --- | --- |
| `…did not return an email…` | No `email` claim in `id_token` **or** `/userinfo` | Grant the `email` scope; have the IdP expose email |
| `Email "x" is not marked as verified…` | IdP sent `email_verified: false` | Verify the address in the IdP, **or** turn off **Require verified email** for this provider |
| `Email domain "x" is not in this provider's allowed list (…)` | Domain not on the list | Add the domain (the message lists what's allowed) |

### Require verified email (per provider)

Each provider has a **Require verified email** toggle (default **on**). Keep it on for public IdPs
(Google/Microsoft), where `email_verified` is meaningful. Turn it **off** only for a trusted
self-hosted IdP — e.g. **Pocket-ID**, which manages users and emails but reports
`email_verified: false` — so domain-restricted sign-in still works. The domain allowlist is always
enforced regardless of this toggle.

## Status & next steps

Shipped: generic **OIDC** + **Google/Microsoft/Okta** (all via discovery), admin config UI,
domain allowlist, default-role provisioning.

Next: IdP **group/claim → role** mapping, and opt-in **account linking** by verified email
(today, first SSO login always creates a dedicated account — no auto-link, to avoid takeover).

## Dependency note

`id_token` verification uses **`jose`** (panva, MIT, **zero runtime dependencies**, Web Crypto) —
chosen as the audited, hardened choice for the crypto-critical path. Everything else is
`node:crypto` + `fetch`, consistent with our [dependency policy](Security.md).

See also: [Users & Roles](Users-and-Roles.md) · [Security](Security.md) · [Roadmap](Roadmap.md).
