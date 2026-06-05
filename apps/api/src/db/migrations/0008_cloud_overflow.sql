-- 0008_cloud_overflow.sql — spill inference to a cloud provider when all nodes
-- are saturated. Two settings: a master toggle and the target provider id.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cloud_overflow boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cloud_overflow_provider_id text NOT NULL DEFAULT '';
