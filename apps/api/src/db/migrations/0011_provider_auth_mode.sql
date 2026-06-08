-- Provider authentication mode.
--   'api-key'      a static API key / access key (default; existing behaviour)
--   'subscription' OAuth device-flow login (e.g. xAI SuperGrok). The OAuth
--                  tokens (access/refresh/expiry) are stored inside the existing
--                  encrypted `credentials_encrypted` blob, so no new column is
--                  needed for them — only this discriminator.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'api-key';
