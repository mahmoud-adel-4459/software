import type BetterSqlite3 from 'better-sqlite3';
import { requireValue } from '@/common/errors/AppError';

/** Tables (in dependency order) and columns of the legacy schema-3 JSON snapshot (.mab from the PostgreSQL build). */
export const COLUMNS: Record<string, string[]> = {
  users: ['id', 'username', 'name', 'password_hash', 'role', 'disabled', 'auth_version'],
  soldiers: [
    'id',
    'military_no',
    'national_id',
    'name',
    'rank',
    'company',
    'unit',
    'phone',
    'address',
    'status',
    'version',
    'created_at',
    'archived',
    'details',
  ],
  permits: [
    'id',
    'no',
    'soldier_id',
    'reason',
    'exit_at',
    'expected_return',
    'returned_at',
    'notes',
    'entry_notes',
    'created_by',
    'voided',
  ],
  gate_events: ['id', 'permit_id', 'soldier_id', 'kind', 'at', 'user_id', 'device_id', 'request_id', 'sequence'],
  audit_log: ['id', 'user_id', 'device_id', 'action', 'entity_id', 'at'],
  requests: ['id', 'user_id', 'device_id', 'body_hash', 'response', 'created_at'],
  attachments: ['id', 'soldier_id', 'kind', 'name', 'mime', 'content', 'sha256', 'size', 'created_at'],
  food_outlets: ['id', 'kind', 'name', 'disabled', 'sort_order', 'created_at'],
  canteen_transactions: ['id', 'soldier_id', 'outlet_id', 'amount_cents', 'reversal_of', 'notes', 'at', 'created_by'],
  fitness_records: ['id', 'soldier_id', 'type', 'value', 'unit', 'date', 'notes', 'created_by', 'raw_result'],
  gate_corrections: ['id', 'event_id', 'reason', 'before_state', 'after_state', 'at', 'created_by'],
  settings: ['id', 'version', 'data'],
  legacy_imports: ['id', 'sha256', 'at', 'created_by'],
  visitor_categories: ['id', 'name', 'tier', 'sort_order', 'disabled'],
  visitors: [
    'id',
    'name',
    'category_id',
    'badge_no',
    'phone',
    'national_id',
    'organization',
    'notes',
    'disabled',
    'created_at',
  ],
  visitor_visits: [
    'id',
    'visitor_id',
    'purpose',
    'check_in',
    'check_out',
    'entry_notes',
    'created_by',
    'device_id',
    'request_id',
    'voided',
  ],
};

export type Row = Record<string, unknown>;
export interface Snapshot {
  schema: 3;
  tables: Record<string, Row[]>;
}

const BOOLEAN_COLUMNS = new Set(['disabled', 'archived', 'voided']);
const JSON_COLUMNS = new Set(['details', 'response', 'before_state', 'after_state', 'data']);
const TIME_COLUMNS = new Set([
  'created_at',
  'exit_at',
  'expected_return',
  'returned_at',
  'at',
  'check_in',
  'check_out',
  'date',
]);
const INT_COLUMNS = new Set(['no', 'sequence', 'version', 'auth_version', 'size', 'amount_cents', 'sort_order']);

/** Timestamp text exactly as Prisma stores it in SQLite (ISO-8601 with an explicit +00:00 offset). */
export function sqliteTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  requireValue(Number.isFinite(date.getTime()), 'تاريخ غير صالح في النسخة');
  return date.toISOString().replace('Z', '+00:00');
}

function cell(table: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value);
  if (BOOLEAN_COLUMNS.has(column)) return value ? 1 : 0;
  if (TIME_COLUMNS.has(column)) return sqliteTime(value);
  if (INT_COLUMNS.has(column) || (table === 'settings' && column === 'id')) return Number(value);
  if (table === 'fitness_records' && column === 'value') return Number(value);
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * Replaces the content of a (freshly migrated) SQLite database with the rows of a PostgreSQL-era snapshot
 * and rebuilds the counters. Shared by the `.mab` importer and the PGlite migration script.
 * Foreign keys are verified at the end instead of per row (rows are inserted table by table).
 */
export function writeTablesToSqlite(db: BetterSqlite3.Database, tables: Record<string, Row[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of [...Object.keys(COLUMNS)].reverse()) db.prepare(`DELETE FROM "${table}"`).run();
      for (const [table, columns] of Object.entries(COLUMNS)) {
        const insert = db.prepare(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        );
        let rows = tables[table] ?? [];
        if (table === 'canteen_transactions') {
          rows = [...rows].sort((a, b) => Number(Boolean(a.reversal_of)) - Number(Boolean(b.reversal_of)));
        }
        for (const row of rows) insert.run(columns.map((column) => cell(table, column, row[column])));
        counts[table] = rows.length;
      }
      db.prepare(
        `UPDATE counters SET value = (SELECT COALESCE(MAX(no), 0) FROM permits) WHERE name = 'permits.no'`,
      ).run();
      db.prepare(
        `UPDATE counters SET value = (SELECT COALESCE(MAX(sequence), 0) FROM gate_events) WHERE name = 'gate_events.sequence'`,
      ).run();
    })();
    const broken = db.pragma('foreign_key_check') as unknown[];
    requireValue(broken.length === 0, 'النسخة تحتوي سجلات مرتبطة ببيانات غير موجودة');
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return counts;
}

/** Structural and consistency validation of a legacy schema-3 snapshot (same rules as the PostgreSQL build). */
export function validateSnapshot(snapshot: Snapshot): void {
  requireValue(
    snapshot?.schema === 3 && snapshot.tables && Object.keys(snapshot.tables).length === Object.keys(COLUMNS).length,
    'إصدار النسخة غير مدعوم',
  );
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const rows = snapshot.tables[table];
    requireValue(Array.isArray(rows) && rows.length <= 1000000, 'جدول غير صالح في النسخة');
    for (const row of rows) {
      requireValue(
        row && Object.keys(row).length === columns.length && columns.every((col) => Object.hasOwn(row, col)),
        'أعمدة النسخة لا تطابق الإصدار',
      );
    }
  }
  requireValue(
    snapshot.tables.users!.some((u) => u.role === 'admin' && !u.disabled),
    'النسخة لا تحتوي مسؤولًا نشطًا',
  );
  const ids = new Set(snapshot.tables.soldiers!.map((s) => s.id));
  const counts = new Map<unknown, number>();
  for (const p of snapshot.tables.permits!) {
    if (!p.returned_at && !p.voided) counts.set(p.soldier_id, (counts.get(p.soldier_id) || 0) + 1);
  }
  for (const s of snapshot.tables.soldiers!) {
    const active = counts.get(s.id) || 0;
    requireValue(active < 2 && (s.status === 'out') === (active === 1), 'حالة الأفراد والتصاريح في النسخة غير متسقة');
  }
  for (const p of snapshot.tables.permits!) requireValue(ids.has(p.soldier_id), 'تصريح يتيم في النسخة');
}

/** The same consistency rules, evaluated on a SQLite database file (used before any restore). */
export function verifySqlite(db: BetterSqlite3.Database): void {
  const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
  requireValue(integrity.length === 1 && integrity[0]!.integrity_check === 'ok', 'ملف القاعدة في النسخة تالف');
  requireValue(
    (db.pragma('foreign_key_check') as unknown[]).length === 0,
    'النسخة تحتوي سجلات مرتبطة ببيانات غير موجودة',
  );
  requireValue(
    db.prepare("SELECT 1 FROM users WHERE role = 'admin' AND disabled = 0 LIMIT 1").get(),
    'النسخة لا تحتوي مسؤولًا نشطًا',
  );
  const inconsistent = db
    .prepare(
      `SELECT 1 FROM soldiers s WHERE
         (SELECT COUNT(*) FROM permits p WHERE p.soldier_id = s.id AND p.returned_at IS NULL AND p.voided = 0) >= 2
         OR ((s.status = 'out') <> ((SELECT COUNT(*) FROM permits p WHERE p.soldier_id = s.id AND p.returned_at IS NULL AND p.voided = 0) = 1))
       LIMIT 1`,
    )
    .get();
  requireValue(!inconsistent, 'حالة الأفراد والتصاريح في النسخة غير متسقة');
}

/** Row counts per application table of a SQLite database. */
export function countTables(db: BetterSqlite3.Database): Record<string, number> {
  return Object.fromEntries(
    [...Object.keys(COLUMNS), 'soldier_personnel_records'].map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n,
    ]),
  );
}
