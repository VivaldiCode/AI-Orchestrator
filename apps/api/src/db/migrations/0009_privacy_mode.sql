-- 0009_privacy_mode.sql — global privacy toggle: force all inference local.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS privacy_mode boolean NOT NULL DEFAULT false;
