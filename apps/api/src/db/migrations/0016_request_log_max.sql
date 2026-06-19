-- Cyclic retention: max recorded requests to keep (0 = unlimited; oldest trimmed).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS request_log_max integer NOT NULL DEFAULT 0;
