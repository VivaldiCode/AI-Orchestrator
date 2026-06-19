-- Opt-in cloud overflow for embeddings: when no local node can serve /api/embed
-- or /api/embeddings, spill to a provider's /v1/embeddings. Off by default.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS embed_overflow boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS embed_overflow_provider_id text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS embed_overflow_model text NOT NULL DEFAULT '';
