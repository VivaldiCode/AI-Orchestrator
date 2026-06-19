-- Model equivalence groups: operator-defined sets of "similar" models across
-- providers, ordered by proximity. When the local cluster can't serve a model
-- (saturated or unavailable), the orchestrator descends the group's members to
-- redirect the request to the closest model on another provider.
--   group_id  ties the members of one group together
--   position  proximity order within the group (lower = closer / tried first)
--   model     the model name on that provider (the substitute target)
CREATE TABLE IF NOT EXISTS model_equivalents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  label text NOT NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  provider_type text NOT NULL,
  model text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_equivalents_group_idx ON model_equivalents (group_id);
CREATE INDEX IF NOT EXISTS model_equivalents_model_idx ON model_equivalents (model);
