import fs from 'node:fs';
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { applyMigrations } from './migrator';

export type Tx = Prisma.TransactionClient;
export type { PrismaClient };

const BUSY_TIMEOUT_MS = 8000;

/** Opens a raw SQLite handle with the project PRAGMAs (used for migrations, backups and restore checks). */
/** Electron needs its own build of better-sqlite3; the app points SQLITE_NATIVE_BINDING at it. */
const nativeOptions = (): BetterSqlite3.Options =>
  process.env.SQLITE_NATIVE_BINDING ? { nativeBinding: process.env.SQLITE_NATIVE_BINDING } : {};

export function openRaw(file: string, options?: BetterSqlite3.Options): BetterSqlite3.Database {
  const raw = new BetterSqlite3(file, { ...nativeOptions(), ...options });
  raw.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  raw.pragma('foreign_keys = ON');
  return raw;
}

/**
 * Owns the SQLite file and the Prisma client. `prisma` is re-created by reopen() after a restore,
 * so callers must always read it from this object instead of caching it.
 */
export class Database {
  prisma!: PrismaClient;
  constructor(readonly file: string) {}

  /** Applies migrations, then connects Prisma and sets journal/foreign-key/busy PRAGMAs. */
  async open(): Promise<void> {
    fs.mkdirSync(path.dirname(path.resolve(this.file)), { recursive: true });
    const raw = openRaw(this.file);
    try {
      raw.pragma('journal_mode = WAL');
      applyMigrations(raw);
    } finally {
      raw.close();
    }
    const url = `file:${path.resolve(this.file).replaceAll('\\', '/')}`;
    this.prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url, ...nativeOptions() }) });
    await this.prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await this.prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await this.prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async reopen(): Promise<void> {
    await this.open();
  }

  /** Consistent online snapshot of the live database (SQLite backup API) written to `destination`. */
  async snapshotTo(destination: string): Promise<void> {
    const raw = openRaw(this.file);
    try {
      await raw.backup(destination);
    } finally {
      raw.close();
    }
  }
}
