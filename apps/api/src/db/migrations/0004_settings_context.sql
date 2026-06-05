-- 0004_settings_context.sql — context-window-aware routing toggle.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS context_aware boolean NOT NULL DEFAULT true;
