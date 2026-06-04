-- 0001_init.sql — initial schema for AI Orchestrator.
-- TimescaleDB is required (the docker-compose image provides it). For a plain
-- PostgreSQL dev database, comment out the CREATE EXTENSION + create_hypertable
-- lines; request_events then remains an ordinary table.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 11434,
  protocol text NOT NULL DEFAULT 'http',
  weight integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  max_concurrency integer NOT NULL DEFAULT 4,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  base_url text,
  region text,
  default_model text,
  credentials_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE,
  provider_id uuid REFERENCES providers(id) ON DELETE CASCADE,
  provider_type text NOT NULL,
  target_model text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS settings (
  id smallint PRIMARY KEY DEFAULT 1,
  strategy text NOT NULL DEFAULT 'least-connections',
  model_aware boolean NOT NULL DEFAULT true,
  auto_pull boolean NOT NULL DEFAULT false,
  failover_retries integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS request_events (
  time timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  node_id uuid,
  provider text NOT NULL DEFAULT 'ollama',
  model text NOT NULL DEFAULT '',
  endpoint text NOT NULL,
  status integer NOT NULL,
  latency_ms double precision,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  error text,
  client_key_id uuid
);

-- Convert to a TimescaleDB hypertable partitioned on time.
SELECT create_hypertable('request_events', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS request_events_node_time_idx ON request_events (node_id, time DESC);
CREATE INDEX IF NOT EXISTS request_events_model_time_idx ON request_events (model, time DESC);
CREATE INDEX IF NOT EXISTS request_events_provider_time_idx ON request_events (provider, time DESC);
