-- Record the client IP per request so the Debug view can show and filter by it.
ALTER TABLE request_events ADD COLUMN IF NOT EXISTS client_ip text;
CREATE INDEX IF NOT EXISTS request_events_client_ip_time_idx ON request_events (client_ip, time DESC);
