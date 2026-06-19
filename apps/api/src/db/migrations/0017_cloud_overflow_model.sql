-- Cloud overflow target model (empty = the chosen provider's default model).
-- Lets overflow work without configuring a provider-level default model.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cloud_overflow_model text NOT NULL DEFAULT '';
