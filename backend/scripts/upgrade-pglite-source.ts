import type { PGlite } from '@electric-sql/pglite';

// Historical migrations run only against the temporary copy; the source stays untouched.
const STEPS = [
  { version: 5, sql: `ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','idPhoto','tagPhoto','document'));` },
  { version: 6, sql: `ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','idPhoto','tagPhoto','carnetFront','carnetBack','document'));` },
  { version: 7, sql: `CREATE TABLE food_outlets (
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
ALTER TABLE canteen_transactions ADD CONSTRAINT canteen_transactions_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES food_outlets(id);` },
  { version: 8, sql: `CREATE TABLE visitor_categories (
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
CREATE INDEX visitor_visits_check_in ON visitor_visits(check_in);` },
];

/** Upgrades supported old databases in the disposable migration copy before reading their tables. */
export async function upgradeCopiedSource(pg: PGlite, version: number): Promise<void> {
  if (!Number.isInteger(version) || version < 4 || version > 8) {
    throw new Error('Unsupported source schema version: ' + version);
  }
  for (const step of STEPS) {
    if (version < step.version) {
      await pg.exec('BEGIN;\n' + step.sql + '\nINSERT INTO schema_migrations(version) VALUES (' + step.version + ');\nCOMMIT;');
    }
  }
}
