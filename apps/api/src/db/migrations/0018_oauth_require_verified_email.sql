-- Per-provider toggle: require the IdP to assert a verified email before sign-in.
-- Defaults to true (strict) so existing providers keep their current behavior;
-- admins can turn it off for a trusted self-hosted IdP (e.g. Pocket-ID) that
-- manages emails but does not verify them.
ALTER TABLE oauth_providers
  ADD COLUMN IF NOT EXISTS require_verified_email boolean NOT NULL DEFAULT true;
