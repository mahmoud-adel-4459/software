CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'gate')),
  disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS soldiers (
  id uuid PRIMARY KEY,
  military_no text NOT NULL UNIQUE,
  national_id text NOT NULL,
  name text NOT NULL,
  rank text NOT NULL,
  company text NOT NULL,
  unit text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'in' CHECK (status IN ('in', 'out')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS permits (
  id uuid PRIMARY KEY,
  no bigserial UNIQUE NOT NULL,
  soldier_id uuid NOT NULL REFERENCES soldiers(id),
  reason text NOT NULL,
  exit_at timestamptz NOT NULL,
  expected_return timestamptz NOT NULL,
  returned_at timestamptz,
  notes text NOT NULL DEFAULT '',
  entry_notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id),
  CHECK (expected_return > exit_at),
  CHECK (returned_at IS NULL OR returned_at >= exit_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_permit ON permits(soldier_id) WHERE returned_at IS NULL;
CREATE TABLE IF NOT EXISTS gate_events (
  id uuid PRIMARY KEY,
  permit_id uuid NOT NULL REFERENCES permits(id),
  soldier_id uuid NOT NULL REFERENCES soldiers(id),
  kind text NOT NULL CHECK (kind IN ('exit', 'entry')),
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id),
  device_id text NOT NULL,
  request_id uuid NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id text NOT NULL,
  action text NOT NULL,
  entity_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id text NOT NULL,
  body_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
