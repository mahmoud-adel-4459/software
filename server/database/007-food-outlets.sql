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
