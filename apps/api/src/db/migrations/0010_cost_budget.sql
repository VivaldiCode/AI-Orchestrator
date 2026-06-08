-- 0010_cost_budget.sql — per-model pricing, per-request cost, provider budgets.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS budget_monthly_usd double precision NOT NULL DEFAULT 0;
ALTER TABLE request_events ADD COLUMN IF NOT EXISTS cost_usd double precision;

CREATE TABLE IF NOT EXISTS model_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_per_mtok double precision NOT NULL DEFAULT 0,
  output_per_mtok double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS model_prices_provider_model_idx ON model_prices (provider, model);

-- Seed reasonable defaults (USD per 1M tokens). Edit any of these in the dashboard.
-- '*' is a provider-wide fallback used when a specific model has no row.
INSERT INTO model_prices (provider, model, input_per_mtok, output_per_mtok) VALUES
  ('ollama', '*', 0, 0),
  ('openai', '*', 0.50, 1.50),
  ('openai', 'gpt-4o-mini', 0.15, 0.60),
  ('openai', 'gpt-4o', 2.50, 10.00),
  ('openai', 'gpt-4.1', 2.00, 8.00),
  ('openai', 'gpt-4.1-mini', 0.40, 1.60),
  ('openai', 'o3-mini', 1.10, 4.40),
  ('anthropic', '*', 3.00, 15.00),
  ('anthropic', 'claude-3-5-haiku', 0.80, 4.00),
  ('anthropic', 'claude-3-5-sonnet', 3.00, 15.00),
  ('anthropic', 'claude-sonnet-4', 3.00, 15.00),
  ('xai', '*', 2.00, 10.00),
  ('xai', 'grok-2', 2.00, 10.00),
  ('mistral', '*', 0.40, 2.00),
  ('google', '*', 0.30, 1.20)
ON CONFLICT (provider, model) DO NOTHING;
