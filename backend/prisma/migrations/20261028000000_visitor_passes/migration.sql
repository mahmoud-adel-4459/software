-- Gate -> unit visitor requests: the unit approves and prints a QR pass, the gate scans it to admit / release.
CREATE TABLE "visitor_passes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "national_id" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "organization" TEXT NOT NULL DEFAULT '',
    "category_id" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_by" TEXT NOT NULL,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "decided_at" DATETIME,
    "decision_notes" TEXT NOT NULL DEFAULT '',
    "visit_id" TEXT,
    CONSTRAINT "visitor_passes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "visitor_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visitor_passes_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visitor_passes_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "visitor_passes_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visitor_visits" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "visitor_passes_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled', 'inside', 'completed'))
);
CREATE UNIQUE INDEX "visitor_passes_no_key" ON "visitor_passes"("no");
CREATE UNIQUE INDEX "visitor_passes_visit_id_key" ON "visitor_passes"("visit_id");
CREATE INDEX "visitor_passes_status_requested_at" ON "visitor_passes"("status", "requested_at");
INSERT INTO "counters" ("name", "value") VALUES ('visitor_passes.no', 0);
