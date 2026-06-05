-- 0002_agent.sql — optional per-node agent port for host system metrics.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_port integer;
