import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from '@/app';
import type { LicenseProvider } from '@/common/http/types';
import type { SessionStore } from '@/common/http/sessions';
import { Store } from '@/common/store/Store';
import { Database } from '@/config/prisma';
import { BackupManager } from '@/modules/backup/backup.service';
import { mergeBackupPolicy } from '@/modules/backup/backup.policy';
import { ensureAdminUser, seedSampleData, type AdminSeed } from '@/seed';

export interface CreateBackendOptions {
  /** SQLite file (created and migrated when missing). */
  dbPath: string;
  licenseProvider: LicenseProvider;
  serverId: string;
  /** 64 hex characters; together with backupDirectory it enables encrypted backups. */
  backupKeyHex?: string;
  backupDirectory?: string;
  backupRetentionDays?: number;
  /** Injected time source (ms) used for sessions, nonces, timestamps and schedules. */
  clock?: () => number;
  /** Creates this administrator when the database has none. */
  admin?: AdminSeed;
  /** Seeds 3 demo soldiers + demo unit settings when the database has no soldiers (play mode). */
  seedDemo?: boolean;
}

export interface Backend {
  /** Express application (also a valid `(req, res)` listener). */
  app: Express;
  /** Node request listener for `http.createServer` / `https.createServer`. */
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  store: Store;
  database: Database;
  sessions: SessionStore;
  backupManager: BackupManager | undefined;
  /** Requests currently being served. */
  activeRequests: () => number;
  /** Starts background jobs (auto-backup scheduler). */
  start: () => void;
  /** Stops background jobs and closes the database. */
  shutdown: () => Promise<void>;
}

/** Opens (and migrates) the database, seeds on demand and assembles the HTTP application. */
export async function createBackend(options: CreateBackendOptions): Promise<Backend> {
  const clock = options.clock ?? Date.now;
  const database = new Database(options.dbPath);
  await database.open();
  const store = new Store(database, clock);
  if (options.admin) await ensureAdminUser(database.prisma, options.admin);
  if (options.seedDemo) await seedSampleData(database.prisma);

  const backupManager =
    options.backupKeyHex && options.backupDirectory
      ? new BackupManager({
          database,
          key: options.backupKeyHex,
          serverId: options.serverId,
          directory: options.backupDirectory,
          retentionDays: options.backupRetentionDays ?? mergeBackupPolicy({}).backupRetentionDays,
          clock,
        })
      : undefined;

  const { app, sessions, activeRequests } = createApp({
    store,
    database,
    licenseProvider: options.licenseProvider,
    backupManager,
    clock,
  });

  return {
    app,
    handler: app,
    store,
    database,
    sessions,
    backupManager,
    activeRequests,
    start() {
      backupManager?.startSchedule({
        loadPolicy: async () => {
          const row = await store.prisma.settings.findUnique({ where: { id: 1 } });
          return mergeBackupPolicy(row?.data);
        },
        isBusy: () => activeRequests() > 0,
      });
    },
    async shutdown() {
      backupManager?.stopSchedule();
      await database.close();
    },
  };
}

export { loadLicense, fileLicenseProvider } from '@/common/http/licensing';
export { serverFingerprint } from '@/common/utils/identity';
export { BackupManager } from '@/modules/backup/backup.service';
