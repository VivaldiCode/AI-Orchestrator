-- Optional per-user permission override for RBAC (null = derive from role).
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions jsonb;
