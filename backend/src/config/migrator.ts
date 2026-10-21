import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';

/** Finds prisma/migrations next to src/ (tsx), dist/ (bundle) or a packaged copy. */
export function migrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../prisma/migrations'),
    path.resolve(__dirname, '../prisma/migrations'),
    path.resolve(__dirname, 'prisma/migrations'),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) throw new Error('Migrations directory not found');
  return found;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(dir = migrationsDir()): MigrationFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

/** Applies pending migrations (equivalent of `prisma migrate deploy`) tracked in the `_migrations` table. */
export function applyMigrations(db: BetterSqlite3.Database, files = readMigrations()): string[] {
  const hasTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_migrations'").get());
  const applied = new Map<string, string>(
    hasTable
      ? (db.prepare('SELECT name, checksum FROM _migrations').all() as { name: string; checksum: string }[]).map(
          (row) => [row.name, row.checksum],
        )
      : [],
  );
  for (const [name] of applied) {
    if (!files.some((file) => file.name === name)) throw new Error(`Database was created by a newer version (${name})`);
  }
  const done: string[] = [];
  for (const file of files) {
    const known = applied.get(file.name);
    if (known !== undefined) {
      if (known !== file.checksum) throw new Error(`Migration ${file.name} was modified after being applied`);
      continue;
    }
    db.transaction(() => {
      db.exec(file.sql);
      db.prepare('INSERT INTO _migrations (name, checksum, applied_at) VALUES (?, ?, ?)').run(
        file.name,
        file.checksum,
        new Date().toISOString(),
      );
    })();
    done.push(file.name);
  }
  return done;
}

/** Latest migration known to this build. */
export function latestMigration(): string {
  return readMigrations().at(-1)?.name ?? '';
}
