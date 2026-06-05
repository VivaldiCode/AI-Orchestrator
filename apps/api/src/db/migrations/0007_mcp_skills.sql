-- MCP servers + Skills + triage settings (opt-in tool/skill enrichment).

ALTER TABLE settings ADD COLUMN IF NOT EXISTS triage_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS triage_model text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_tool_calls integer NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  transport text NOT NULL DEFAULT 'http',
  url text,
  command text,
  args jsonb NOT NULL DEFAULT '[]'::jsonb,
  auth_encrypted text,
  enabled boolean NOT NULL DEFAULT true,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  model_hint text,
  tool_preset jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
