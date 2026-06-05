-- 0003_node_models.sql — optional per-node model allowlist (null = all models).
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS enabled_models jsonb;
