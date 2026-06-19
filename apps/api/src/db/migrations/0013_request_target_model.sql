-- Record the substitute model actually sent upstream when it differs from the
-- requested model (e.g. an equivalence-chain target such as `grok-2-latest`).
-- Null when no substitution happened (the request ran as-asked, e.g. locally).
ALTER TABLE request_events ADD COLUMN IF NOT EXISTS target_model text;
