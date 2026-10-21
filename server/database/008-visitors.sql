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
