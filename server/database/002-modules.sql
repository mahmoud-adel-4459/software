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
