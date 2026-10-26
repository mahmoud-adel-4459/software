CREATE TABLE soldier_personnel_records (
  id TEXT NOT NULL PRIMARY KEY,
  soldier_id TEXT NOT NULL REFERENCES soldiers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('grant', 'leave', 'penalty', 'reward', 'medical')),
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
CREATE INDEX personnel_soldier_category_date ON soldier_personnel_records(soldier_id, category, record_date);
