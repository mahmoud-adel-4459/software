ALTER TABLE fitness_records ADD COLUMN raw_result text NOT NULL DEFAULT '';
ALTER TABLE fitness_records ALTER COLUMN value DROP NOT NULL;
CREATE TABLE legacy_imports (
  id uuid PRIMARY KEY,
  sha256 text NOT NULL UNIQUE,
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);
INSERT INTO schema_migrations(version) VALUES(3);
