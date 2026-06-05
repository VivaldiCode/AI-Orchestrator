# Users & Roles (RBAC)

The dashboard supports multiple user accounts with **role-based access control**. The first account
is created during [first-run setup](Getting-Started.md) and is always an **admin**.

## Roles

| Role     | Can do                                                                            |
| -------- | --------------------------------------------------------------------------------- |
| `admin`  | Everything, including managing users.                                             |
| `editor` | Read + write on nodes, providers, settings and API keys. **Cannot** manage users. |
| `viewer` | Read-only across the panel.                                                       |

> **Note:** today, new users default to **admin** (full access) — this matches the current
> "everyone is a full operator" stage. The full permission model below is already in place so you
> can downgrade accounts and so future installs can be locked down without code changes.

## Permissions

Roles are a convenience layer over a set of fine-grained, feature-level permissions:

```
nodes:read      nodes:write
providers:read  providers:write
analytics:read
apikeys:read    apikeys:write
settings:read   settings:write
users:read      users:write
```

A user's **effective permissions** are their role's defaults, unless an explicit per-user override
is set (the data model supports overrides; the dashboard currently edits the role). The set is
resolved server-side and embedded in the access token (`perms` claim), and returned by
`GET /admin/auth/me` so the dashboard can hide what you can't use (e.g. the **Users** tab only
appears with `users:read`).

The mapping lives in one place — `packages/shared/src/auth.ts` (`ROLE_PERMISSIONS`,
`effectivePermissions`) — and is unit-tested in `apps/api/test/rbac.test.ts`.

## Managing users

On the dashboard **Users** page (admins only) you can:

- **Add** a user — username, password (min 12 chars), and role.
- **Change a role** — inline, with immediate effect on the next login/refresh.
- **Delete** a user.

Two safety rails are enforced by the API:

- You cannot **delete your own** account.
- You cannot **delete or demote the last admin** (the instance must always have one).

## API

All endpoints are under `/admin` and require an admin token (gated on `users:*`):

| Method   | Path               | Body                                          |
| -------- | ------------------ | --------------------------------------------- |
| `GET`    | `/admin/users`     | —                                             |
| `POST`   | `/admin/users`     | `{ username, password, role?, permissions? }` |
| `PATCH`  | `/admin/users/:id` | `{ role?, permissions?, password? }`          |
| `DELETE` | `/admin/users/:id` | —                                             |

Passwords are hashed with **scrypt** (`node:crypto`); plaintext is never stored. See
[Security](Security.md).

## Single sign-on

SSO via OAuth/OIDC (Google, Microsoft, Okta, generic OIDC) is **available** — see
[Authentication & OAuth/SSO](Authentication-OAuth.md). The roles and permissions described here map
directly onto SSO logins: each provider has a **default role** granted on first login, and admins
can change any user's role afterwards on the Users page.
