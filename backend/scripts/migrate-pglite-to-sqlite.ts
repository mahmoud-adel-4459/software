/**
 * One-time migration: PGlite (PostgreSQL) data directory -> new SQLite database.
 *
 *   npm run backend:migrate-pglite -- --source "<...>\standalone\database" --target "<...>\app.db" [--force]
 *
 * The source is NEVER opened in place: it is copied to a scratch directory first and the copy is read.
 * The target is written to `<target>.migrating` and renamed only when the reconciliation report is clean.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '@/config/migrator';
import { openRaw } from '@/config/prisma';
import { COLUMNS, writeTablesToSqlite, type Row } from '@/modules/backup/backup.snapshot';

export interface ReconciliationLine {
  check: string;
  source: string | number;
  target: string | number;
  ok: boolean;
}

export interface MigrationResult {
  ok: boolean;
  lines: ReconciliationLine[];
  counts: Record<string, number>;
}

const fingerprint = (ids: string[]) =>
  createHash('sha256')
    .update([...ids].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);

/** Copies the PGlite data directory to a scratch dir (the original is never modified). */
function copyDataDir(source: string): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-migrate-'));
  fs.cpSync(source, scratch, { recursive: true });
  return scratch;
}

type Query = (sql: string) => Promise<Row[]>;

/** Aggregates compared between the PostgreSQL source and the SQLite target. */
const MEASURES: { check: string; table: string; sql: string }[] = [
  {
    check: 'canteen total (cents)',
    table: 'canteen_transactions',
    sql: 'SELECT COALESCE(SUM(amount_cents),0) AS v FROM canteen_transactions',
  },
  {
    check: 'canteen reversals',
    table: 'canteen_transactions',
    sql: 'SELECT COUNT(*) AS v FROM canteen_transactions WHERE reversal_of IS NOT NULL',
  },
  {
    check: 'canteen total per outlet',
    table: 'canteen_transactions',
    sql: "SELECT string_agg(o || ':' || t, ',' ORDER BY o) AS v FROM (SELECT outlet_id AS o, SUM(amount_cents) AS t FROM canteen_transactions GROUP BY outlet_id) x",
  },
  { check: 'soldiers inside', table: 'soldiers', sql: "SELECT COUNT(*) AS v FROM soldiers WHERE status = 'in'" },
  { check: 'soldiers archived', table: 'soldiers', sql: 'SELECT COUNT(*) AS v FROM soldiers WHERE archived' },
  {
    check: 'active permits',
    table: 'permits',
    sql: 'SELECT COUNT(*) AS v FROM permits WHERE returned_at IS NULL AND NOT voided',
  },
  { check: 'highest permit no', table: 'permits', sql: 'SELECT COALESCE(MAX(no),0) AS v FROM permits' },
  {
    check: 'highest gate sequence',
    table: 'gate_events',
    sql: 'SELECT COALESCE(MAX(sequence),0) AS v FROM gate_events',
  },
  { check: 'attachment bytes', table: 'attachments', sql: 'SELECT COALESCE(SUM(size),0) AS v FROM attachments' },
  {
    check: 'open visits',
    table: 'visitor_visits',
    sql: 'SELECT COUNT(*) AS v FROM visitor_visits WHERE check_out IS NULL AND NOT voided',
  },
];

/** SQLite flavour of the same measures (booleans are 0/1, no string_agg ORDER BY). */
const SQLITE_MEASURES: Record<string, string> = {
  'canteen total per outlet':
    "SELECT group_concat(o || ':' || t, ',') AS v FROM (SELECT outlet_id AS o, SUM(amount_cents) AS t FROM canteen_transactions GROUP BY outlet_id ORDER BY outlet_id)",
  'soldiers archived': 'SELECT COUNT(*) AS v FROM soldiers WHERE archived = 1',
  'active permits': 'SELECT COUNT(*) AS v FROM permits WHERE returned_at IS NULL AND voided = 0',
  'open visits': 'SELECT COUNT(*) AS v FROM visitor_visits WHERE check_out IS NULL AND voided = 0',
};

/** Reads every table from the (copied) PGlite database, in the column layout of COLUMNS. */
async function readSource(pg: PGlite): Promise<Record<string, Row[]>> {
  const tables: Record<string, Row[]> = {};
  for (const [table, columns] of Object.entries(COLUMNS)) {
    tables[table] = (await pg.query(`SELECT ${columns.join(',')} FROM ${table}`)).rows as Row[];
  }
  return tables;
}

/** Compares row counts, id sets, money totals and counters of both databases. */
async function reconcile(pgQuery: Query, sqlite: ReturnType<typeof openRaw>): Promise<MigrationResult['lines']> {
  const lines: ReconciliationLine[] = [];
  const add = (check: string, source: string | number, target: string | number) =>
    lines.push({ check, source, target, ok: String(source) === String(target) });
  for (const table of Object.keys(COLUMNS)) {
    const src = Number((await pgQuery(`SELECT COUNT(*) AS v FROM ${table}`))[0]!.v);
    const dst = (sqlite.prepare(`SELECT COUNT(*) AS v FROM "${table}"`).get() as { v: number }).v;
    add(`rows: ${table}`, src, dst);
    if (table !== 'settings') {
      const srcIds = (await pgQuery(`SELECT id::text AS id FROM ${table}`)).map((r) => String(r.id));
      const dstIds = (sqlite.prepare(`SELECT id FROM "${table}"`).all() as { id: string }[]).map((r) => String(r.id));
      add(`ids: ${table}`, fingerprint(srcIds), fingerprint(dstIds));
    }
  }
  for (const m of MEASURES) {
    const src = (await pgQuery(m.sql))[0]!.v;
    const dst = (sqlite.prepare(SQLITE_MEASURES[m.check] ?? m.sql).get() as { v: unknown }).v;
    add(m.check, src === null ? '' : String(src), dst === null ? '' : String(dst));
  }
  const counter = (name: string) =>
    (sqlite.prepare('SELECT value FROM counters WHERE name = ?').get(name) as { value: number }).value;
  add(
    'counter permits.no',
    Number((await pgQuery('SELECT COALESCE(MAX(no),0) AS v FROM permits'))[0]!.v),
    counter('permits.no'),
  );
  add(
    'counter gate_events.sequence',
    Number((await pgQuery('SELECT COALESCE(MAX(sequence),0) AS v FROM gate_events'))[0]!.v),
    counter('gate_events.sequence'),
  );
  const fk = (sqlite.pragma('foreign_key_check') as unknown[]).length;
  add('foreign key violations', 0, fk);
  const integrity = (sqlite.pragma('integrity_check') as { integrity_check: string }[])[0]!.integrity_check;
  add('sqlite integrity_check', 'ok', integrity);
  return lines;
}

export async function migratePglite(options: {
  source: string;
  target: string;
  force?: boolean;
  log?: (line: string) => void;
}): Promise<MigrationResult> {
  const log = options.log ?? (() => {});
  const target = path.resolve(options.target);
  const working = `${target}.migrating`;
  if (fs.existsSync(target) && !options.force)
    throw new Error(`Target already exists: ${target} (use --force to replace it)`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(working + suffix, { force: true });

  const scratch = copyDataDir(path.resolve(options.source));
  log(`Source copied to ${scratch}`);
  const pg = await PGlite.create(scratch);
  try {
    const version = (await pg.query('SELECT MAX(version) AS v FROM schema_migrations')).rows[0] as { v: number };
    log(`Source schema version: ${version.v}`);
    if (Number(version.v) < 8)
      throw new Error(`Source schema version ${version.v} is too old; start the old app once to upgrade it`);
    const tables = await readSource(pg);

    const raw = openRaw(working);
    let counts: Record<string, number>;
    let lines: ReconciliationLine[];
    try {
      raw.pragma('journal_mode = DELETE');
      applyMigrations(raw);
      counts = writeTablesToSqlite(raw, tables);
      lines = await reconcile(async (sql) => (await pg.query(sql)).rows as Row[], raw);
    } finally {
      raw.close();
    }
    const ok = lines.every((l) => l.ok);
    if (ok) {
      for (const suffix of ['', '-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
      fs.renameSync(working, target);
    }
    return { ok, lines, counts };
  } finally {
    await pg.close();
    fs.rmSync(scratch, { recursive: true, force: true });
    if (fs.existsSync(working) && !fs.existsSync(target)) {
      // keep the failed attempt next to the target for inspection
    }
  }
}

function printReport(result: MigrationResult): void {
  console.log('\nReconciliation report');
  console.log('---------------------');
  for (const l of result.lines) {
    console.log(`${l.ok ? 'OK  ' : 'FAIL'}  ${l.check.padEnd(34)} source=${l.source}  target=${l.target}`);
  }
  console.log(result.ok ? '\nRESULT: MATCH - no differences.' : '\nRESULT: MISMATCH - migration NOT completed.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const source = get('source');
  const target = get('target');
  if (!source || !target) {
    console.error('Usage: migrate-pglite-to-sqlite --source <pglite dir> --target <sqlite file> [--force]');
    process.exit(2);
  }
  const result = await migratePglite({ source, target, force: args.includes('--force'), log: (l) => console.log(l) });
  printReport(result);
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error: Error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}

export { printReport };
