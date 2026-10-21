-- Allow role clerk (كاشير كانتين) on internal devices.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'gate', 'clerk'));
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
