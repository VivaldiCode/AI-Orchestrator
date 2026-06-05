-- OAuth/OIDC single sign-on: provider config + linked external identities.

-- SSO-only accounts have no local password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  display_name text NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  client_secret_encrypted text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  allowed_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES oauth_providers(id) ON DELETE CASCADE,
  subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS identities_provider_subject_idx
  ON identities (provider_id, subject);
