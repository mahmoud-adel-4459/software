CREATE TABLE soldier_personnel_records_expanded (
  id TEXT NOT NULL PRIMARY KEY,
  soldier_id TEXT NOT NULL REFERENCES soldiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('grant', 'leave', 'penalty', 'reward', 'medical', 'medical_affairs', 'security_report')),
  title TEXT NOT NULL,
  record_date TEXT NOT NULL,
  end_date TEXT,
  reference TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO soldier_personnel_records_expanded
  (id, soldier_id, category, title, record_date, end_date, reference, details, version, deleted, created_by, created_at, updated_at)
SELECT id, soldier_id, category, title, record_date, end_date, reference, details, version, deleted, created_by, created_at, updated_at
FROM soldier_personnel_records;
DROP TABLE soldier_personnel_records;
ALTER TABLE soldier_personnel_records_expanded RENAME TO soldier_personnel_records;
CREATE INDEX personnel_soldier_category_date ON soldier_personnel_records(soldier_id, category, record_date);
