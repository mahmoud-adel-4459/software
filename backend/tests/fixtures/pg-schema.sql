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
ALTER TABLE soldiers ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE soldiers ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 1;
ALTER TABLE permits ADD COLUMN voided boolean NOT NULL DEFAULT false;
ALTER TABLE gate_events ADD COLUMN sequence bigserial;
DROP INDEX one_active_permit;
CREATE UNIQUE INDEX one_active_permit ON permits(soldier_id) WHERE returned_at IS NULL AND voided=false;
CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  soldier_id uuid NOT NULL REFERENCES soldiers(id),
  kind text NOT NULL CHECK (kind IN ('photo','idPhoto','document')),
  name text NOT NULL,
  mime text NOT NULL,
  content text NOT NULL,
  sha256 text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE canteen_transactions (
  id uuid PRIMARY KEY,
  soldier_id uuid NOT NULL REFERENCES soldiers(id),
  amount_cents integer NOT NULL CHECK (amount_cents <> 0),
  reversal_of uuid UNIQUE REFERENCES canteen_transactions(id),
  notes text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE fitness_records (
  id uuid PRIMARY KEY,
  soldier_id uuid NOT NULL REFERENCES soldiers(id),
  type text NOT NULL,
  value numeric NOT NULL CHECK (value >= 0),
  unit text NOT NULL,
  date date NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE gate_corrections (
  id uuid PRIMARY KEY,
  event_id uuid UNIQUE NOT NULL REFERENCES gate_events(id),
  reason text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE settings (
  id integer PRIMARY KEY CHECK (id=1),
  version integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL
);
INSERT INTO settings(id,data) VALUES(1,'{"unitName":"الوحدة","parentFormation":"","extraReasons":[],"paper":"A4","margins":"normal","printer":"","showLogo":true,"logo":null}');
CREATE INDEX permits_exit_at ON permits(exit_at);
CREATE INDEX canteen_soldier_at ON canteen_transactions(soldier_id,at);
CREATE INDEX fitness_soldier_date ON fitness_records(soldier_id,date);
CREATE INDEX attachments_soldier ON attachments(soldier_id);
INSERT INTO schema_migrations(version) VALUES(2);
ALTER TABLE fitness_records ADD COLUMN raw_result text NOT NULL DEFAULT '';
ALTER TABLE fitness_records ALTER COLUMN value DROP NOT NULL;
CREATE TABLE legacy_imports (
  id uuid PRIMARY KEY,
  sha256 text NOT NULL UNIQUE,
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);
INSERT INTO schema_migrations(version) VALUES(3);
-- Allow role clerk (كاشير كانتين) on internal devices.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'gate', 'clerk'));
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','idPhoto','tagPhoto','document'));
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','idPhoto','tagPhoto','carnetFront','carnetBack','document'));
INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
CREATE TABLE food_outlets (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('canteen','buffet')),
  name text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO food_outlets (id, kind, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000010', 'canteen', 'الكانتين', 0);
ALTER TABLE canteen_transactions ADD COLUMN outlet_id uuid;
UPDATE canteen_transactions SET outlet_id = '00000000-0000-0000-0000-000000000010';
ALTER TABLE canteen_transactions ALTER COLUMN outlet_id SET NOT NULL;
ALTER TABLE canteen_transactions ADD CONSTRAINT canteen_transactions_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES food_outlets(id);
INSERT INTO schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
CREATE TABLE visitor_categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'normal' CHECK (tier IN ('normal', 'special', 'admin')),
  sort_order int NOT NULL DEFAULT 0,
  disabled boolean NOT NULL DEFAULT false
);

INSERT INTO visitor_categories (id, name, tier, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000020', 'زائر عادي', 'normal', 0),
  ('00000000-0000-0000-0000-000000000021', 'زائر خاص', 'special', 1),
  ('00000000-0000-0000-0000-000000000022', 'زيارة إدارية', 'admin', 2);

CREATE TABLE visitors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES visitor_categories(id),
  badge_no text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE visitor_visits (
  id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES visitors(id),
  purpose text NOT NULL,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz,
  entry_notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  device_id text NOT NULL DEFAULT '',
  request_id uuid,
  voided boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX visitor_open_visit ON visitor_visits(visitor_id) WHERE check_out IS NULL AND NOT voided;
CREATE INDEX visitor_visits_check_in ON visitor_visits(check_in);

INSERT INTO schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
