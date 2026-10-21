
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "auth_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'gate', 'clerk'))
);

-- CreateTable
CREATE TABLE "soldiers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "military_no" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'in',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB NOT NULL,
    CONSTRAINT "soldiers_status_check" CHECK ("status" IN ('in', 'out'))
);

-- CreateTable
CREATE TABLE "permits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "no" INTEGER NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "exit_at" DATETIME NOT NULL,
    "expected_return" DATETIME NOT NULL,
    "returned_at" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "entry_notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "permits_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "permits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "gate_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permit_id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "gate_events_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "permits" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_events_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_events_kind_check" CHECK ("kind" IN ('exit', 'entry'))
);

-- CreateTable
CREATE TABLE "gate_corrections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "gate_corrections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "gate_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "soldier_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attachments_kind_check" CHECK ("kind" IN ('photo','idPhoto','tagPhoto','carnetFront','carnetBack','document'))
);

-- CreateTable
CREATE TABLE "food_outlets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_outlets_kind_check" CHECK ("kind" IN ('canteen', 'buffet'))
);

-- CreateTable
CREATE TABLE "canteen_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "soldier_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reversal_of" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "canteen_transactions_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canteen_transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "food_outlets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canteen_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canteen_transactions_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "canteen_transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "canteen_amount_check" CHECK ("amount_cents" <> 0)
);

-- CreateTable
CREATE TABLE "fitness_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "soldier_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL,
    "unit" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "raw_result" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "fitness_records_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fitness_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fitness_value_check" CHECK ("value" IS NULL OR "value" >= 0)
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    CONSTRAINT "settings_singleton_check" CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "legacy_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sha256" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "legacy_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visitor_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'normal',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "visitor_categories_tier_check" CHECK ("tier" IN ('normal', 'special', 'admin'))
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "badge_no" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "national_id" TEXT NOT NULL DEFAULT '',
    "organization" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visitors_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "visitor_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "visitor_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitor_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "check_in" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out" DATETIME,
    "entry_notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "device_id" TEXT NOT NULL DEFAULT '',
    "request_id" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "visitor_visits_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visitor_visits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "counters" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "soldiers_military_no_key" ON "soldiers"("military_no");

-- CreateIndex
CREATE UNIQUE INDEX "permits_no_key" ON "permits"("no");

-- CreateIndex
CREATE INDEX "permits_exit_at" ON "permits"("exit_at");

-- CreateIndex
-- Partial: one open, non-voided permit per soldier.
CREATE UNIQUE INDEX "one_active_permit" ON "permits"("soldier_id") WHERE "returned_at" IS NULL AND "voided" = false;

-- CreateIndex
CREATE UNIQUE INDEX "gate_events_request_id_key" ON "gate_events"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_corrections_event_id_key" ON "gate_corrections"("event_id");

-- CreateIndex
CREATE INDEX "attachments_soldier" ON "attachments"("soldier_id");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_transactions_reversal_of_key" ON "canteen_transactions"("reversal_of");

-- CreateIndex
CREATE INDEX "canteen_soldier_at" ON "canteen_transactions"("soldier_id", "at");

-- CreateIndex
CREATE INDEX "fitness_soldier_date" ON "fitness_records"("soldier_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_imports_sha256_key" ON "legacy_imports"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_badge_no_key" ON "visitors"("badge_no");

-- CreateIndex
CREATE INDEX "visitor_visits_check_in" ON "visitor_visits"("check_in");

-- CreateIndex
-- Partial: one open, non-voided visit per visitor.
CREATE UNIQUE INDEX "visitor_open_visit" ON "visitor_visits"("visitor_id") WHERE "check_out" IS NULL AND "voided" = false;


-- Reference data (same ids as the legacy PostgreSQL migrations).
INSERT INTO "food_outlets" ("id", "kind", "name", "sort_order") VALUES ('00000000-0000-0000-0000-000000000010', 'canteen', 'الكانتين', 0);
INSERT INTO "visitor_categories" ("id", "name", "tier", "sort_order") VALUES
  ('00000000-0000-0000-0000-000000000020', 'زائر عادي', 'normal', 0),
  ('00000000-0000-0000-0000-000000000021', 'زائر خاص', 'special', 1),
  ('00000000-0000-0000-0000-000000000022', 'زيارة إدارية', 'admin', 2);
INSERT INTO "settings" ("id", "data") VALUES (1, '{"unitName":"الوحدة","parentFormation":"","extraReasons":[],"paper":"A4","margins":"normal","printer":"","showLogo":true,"logo":null}');
INSERT INTO "counters" ("name", "value") VALUES ('permits.no', 0), ('gate_events.sequence', 0);
