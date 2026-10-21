import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppError, requireValue } from '@/common/errors/AppError';
import { applyMigrations } from '@/config/migrator';
import { openRaw, type Database } from '@/config/prisma';
import { openEnvelope, sealSqlite, type Envelope, type OpenedBackup } from './backup.format';
import { mergeBackupPolicy, type BackupPolicy } from './backup.policy';
import { countTables, verifySqlite, writeTablesToSqlite } from './backup.snapshot';

export interface BackupManagerOptions {
  database: Database;
  key: string;
  serverId: string;
  directory: string;
  retentionDays?: number;
  clock?: () => number;
}

const NAME_RE = /^[0-9a-f-]{36}\.mab$/;
const MAX_READ_BYTES = 128 * 1024 * 1024;

/**
 * Encrypted SQLite backups (online snapshot -> gzip -> AES-256-GCM), atomic restore, legacy `.mab` import
 * and the auto-backup scheduler. All operations are administrator-only at the HTTP layer.
 */
export class BackupManager {
  readonly key: Buffer;
  readonly directory: string;
  retentionDays: number;
  lastAutoBackupAt: string | undefined;
  private scheduleTimer: NodeJS.Timeout | null = null;
  private scheduleRunning = false;
  private operationRunning = false;
  private readonly database: Database;
  private readonly serverId: string;
  private readonly clock: () => number;

  constructor({ database, key, serverId, directory, retentionDays = 30, clock = Date.now }: BackupManagerOptions) {
    requireValue(
      typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key),
      'اضبط BACKUP_KEY_HEX كمفتاح عشوائي من 64 حرفًا سداسيًا',
    );
    requireValue(
      Number.isInteger(retentionDays) && retentionDays >= 7 && retentionDays <= 365,
      'احتفاظ النسخ من 7 إلى 365 يومًا',
    );
    this.database = database;
    this.key = Buffer.from(key, 'hex');
    this.serverId = serverId;
    this.retentionDays = retentionDays;
    this.clock = clock;
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true });
  }

  /** True while a backup or restore is running (the scheduler skips its tick). */
  get busy(): boolean {
    return this.operationRunning || this.scheduleRunning;
  }

  filename(id: unknown): string {
    requireValue(typeof id === 'string' && NAME_RE.test(id), 'اسم نسخة غير صالح');
    return path.join(this.directory, id);
  }

  write(envelope: Envelope): string {
    const id = `${crypto.randomUUID()}.mab`;
    fs.writeFileSync(this.filename(id), JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
    return id;
  }

  list(): { id: string; createdAt: string; size: number }[] {
    return fs
      .readdirSync(this.directory)
      .filter((n) => NAME_RE.test(n))
      .map((id) => {
        const stat = fs.statSync(this.filename(id));
        return { id, createdAt: stat.mtime.toISOString(), size: stat.size };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  read(id: unknown): Envelope {
    const file = this.filename(id);
    requireValue(fs.existsSync(file), 'النسخة غير موجودة', 404);
    requireValue(fs.statSync(file).size < MAX_READ_BYTES, 'نسخة أكبر من الحد');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Envelope;
  }

  open(envelope: Envelope): OpenedBackup {
    return openEnvelope(envelope, this.key, this.serverId);
  }

  /** Writes the backup payload to `file` as a ready-to-use SQLite database (legacy snapshots are converted). */
  private materialize(opened: OpenedBackup, file: string): void {
    if (opened.format === 'sqlite-1') {
      fs.writeFileSync(file, opened.bytes);
      return;
    }
    const raw = openRaw(file);
    try {
      applyMigrations(raw);
      writeTablesToSqlite(raw, opened.snapshot.tables);
    } finally {
      raw.close();
    }
  }

  /** Brings a materialized file to the current schema and verifies integrity; returns its row counts. */
  private prepare(file: string): Record<string, number> {
    const raw = openRaw(file);
    try {
      try {
        applyMigrations(raw);
      } catch (error) {
        if (!(error as { status?: number }).status) {
          throw new AppError(400, 'النسخة من إصدار غير متوافق مع هذا البرنامج');
        }
        throw error;
      }
      verifySqlite(raw);
      const counts = countTables(raw);
      raw.pragma('journal_mode = DELETE');
      return counts;
    } finally {
      raw.close();
    }
  }

  private withTemp<T>(dir: string, task: (file: string) => T): T {
    const file = path.join(dir, `.tmp-${crypto.randomUUID()}.db`);
    try {
      return task(file);
    } finally {
      for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
    }
  }

  /** Online snapshot of the live database, sealed and stored. */
  async create(): Promise<{ id: string; createdAt: string }> {
    this.operationRunning = true;
    try {
      const file = path.join(this.directory, `.tmp-${crypto.randomUUID()}.db`);
      try {
        await this.database.snapshotTo(file);
        const envelope = sealSqlite(fs.readFileSync(file), this.key, this.serverId);
        return { id: this.write(envelope), createdAt: envelope.createdAt };
      } finally {
        fs.rmSync(file, { force: true });
      }
    } finally {
      this.operationRunning = false;
    }
  }

  preview(id: unknown) {
    const opened = this.open(this.read(id));
    if (opened.format === 'legacy') {
      return {
        schema: 3,
        format: 'legacy',
        counts: Object.fromEntries(Object.entries(opened.snapshot.tables).map(([t, rows]) => [t, rows.length])),
      };
    }
    return {
      schema: 'sqlite-1',
      format: 'sqlite-1',
      counts: this.withTemp(this.directory, (file) => {
        this.materialize(opened, file);
        return this.prepare(file);
      }),
    };
  }

  /** Stores an uploaded envelope; legacy schema-3 snapshots are converted to the SQLite format first. */
  import(envelope: Envelope): { id: string } {
    const opened = this.open(envelope);
    if (opened.format === 'sqlite-1') {
      this.withTemp(this.directory, (file) => {
        this.materialize(opened, file);
        this.prepare(file);
      });
      return { id: this.write(envelope) };
    }
    return this.withTemp(this.directory, (file) => {
      this.materialize(opened, file);
      this.prepare(file);
      return { id: this.write(sealSqlite(fs.readFileSync(file), this.key, this.serverId)) };
    });
  }

  /**
   * Atomic restore: verify the backup in a scratch copy, seal a safety copy of the live data, close Prisma,
   * swap the database file, reopen. Any failure before the swap leaves the live database untouched.
   */
  async restore(id: unknown): Promise<{ restored: string; safetyId: string }> {
    const opened = this.open(this.read(id));
    this.operationRunning = true;
    const live = path.resolve(this.database.file);
    const scratch = path.join(path.dirname(live), `.restore-${crypto.randomUUID()}.db`);
    const safetyFile = path.join(this.directory, `.tmp-${crypto.randomUUID()}.db`);
    try {
      this.materialize(opened, scratch);
      this.prepare(scratch);
      await this.database.snapshotTo(safetyFile);
      const safetyId = this.write(sealSqlite(fs.readFileSync(safetyFile), this.key, this.serverId));

      await this.database.close();
      try {
        for (const suffix of ['-wal', '-shm']) fs.rmSync(live + suffix, { force: true });
        fs.renameSync(scratch, live);
      } finally {
        await this.database.reopen();
      }
      try {
        fs.appendFileSync(
          path.join(this.directory, 'restore-history.jsonl'),
          JSON.stringify({ at: new Date(this.clock()).toISOString(), restored: id, safety: safetyId }) + '\n',
        );
      } catch {
        console.error('Restore committed; history file could not be written');
      }
      return { restored: id as string, safetyId };
    } finally {
      for (const file of [scratch, safetyFile]) {
        for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
      }
      this.operationRunning = false;
    }
  }

  // ---- Scheduler --------------------------------------------------------------------------------

  private scheduleStatePath(): string {
    return path.join(this.directory, 'schedule-state.json');
  }

  private readScheduleState(): { lastAutoBackupAt?: string; lastSkipReason?: string | null } {
    try {
      if (fs.existsSync(this.scheduleStatePath())) return JSON.parse(fs.readFileSync(this.scheduleStatePath(), 'utf8'));
    } catch {
      // Missing or corrupt state file: behave as if no backup ran yet.
    }
    return {};
  }

  private writeScheduleState(patch: Record<string, unknown>): void {
    const next = { ...this.readScheduleState(), ...patch };
    fs.writeFileSync(this.scheduleStatePath(), JSON.stringify(next), { mode: 0o600 });
  }

  /** Deletes backups older than the retention window. */
  prune(): void {
    const cutoff = this.clock() - this.retentionDays * 86400000;
    for (const backup of this.list()) {
      if (Date.parse(backup.createdAt) < cutoff) {
        const target = path.resolve(this.filename(backup.id));
        requireValue(path.dirname(target) === this.directory, 'مسار نسخة غير صالح');
        fs.unlinkSync(target);
      }
    }
  }

  scheduleStatus(policy: BackupPolicy = mergeBackupPolicy({})) {
    const state = this.readScheduleState();
    const last = state.lastAutoBackupAt || null;
    let nextDueAt: string | null = null;
    if (policy.autoBackup && last)
      nextDueAt = new Date(Date.parse(last) + policy.autoBackupIntervalHours * 3600000).toISOString();
    else if (policy.autoBackup) nextDueAt = new Date(this.clock()).toISOString();
    return {
      ...policy,
      lastAutoBackupAt: last,
      nextDueAt,
      lastSkipReason: state.lastSkipReason || null,
      running: this.scheduleRunning,
    };
  }

  stopSchedule(): void {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    this.scheduleTimer = null;
  }

  /** Starts the periodic auto-backup (6/12/24/48 h, retention 7-365 d); skips while the server is busy. */
  startSchedule({
    loadPolicy,
    isBusy,
    tickMs = 15 * 60 * 1000,
  }: {
    loadPolicy?: () => Promise<BackupPolicy>;
    isBusy?: () => boolean;
    tickMs?: number;
  } = {}): void {
    this.stopSchedule();
    const state = this.readScheduleState();
    if (state.lastAutoBackupAt && !this.lastAutoBackupAt) this.lastAutoBackupAt = state.lastAutoBackupAt;
    const tick = async () => {
      if (this.busy) return;
      let policy: BackupPolicy;
      try {
        policy = loadPolicy ? await loadPolicy() : mergeBackupPolicy({});
      } catch (e) {
        console.error('Backup policy read failed:', (e as { code?: string }).code || (e as Error).message);
        return;
      }
      this.retentionDays = policy.backupRetentionDays;
      if (!policy.autoBackup) {
        this.writeScheduleState({ lastSkipReason: 'disabled' });
        return;
      }
      const lastMs = this.lastAutoBackupAt ? Date.parse(this.lastAutoBackupAt) : 0;
      if (lastMs && this.clock() < lastMs + policy.autoBackupIntervalHours * 3600000) return;
      if (isBusy?.()) {
        this.writeScheduleState({ lastSkipReason: 'busy' });
        return;
      }
      this.scheduleRunning = true;
      try {
        const created = await this.create();
        this.lastAutoBackupAt = created.createdAt;
        this.prune();
        this.writeScheduleState({ lastAutoBackupAt: created.createdAt, lastSkipReason: null });
      } catch (e) {
        console.error('Scheduled backup failed:', (e as AppError).status ? (e as Error).message : (e as Error).name);
      } finally {
        this.scheduleRunning = false;
      }
    };
    this.scheduleTimer = setInterval(() => {
      tick().catch((e: Error) => console.error('Scheduled backup tick failed:', e.message));
    }, tickMs);
    this.scheduleTimer.unref();
    tick().catch(() => {});
  }
}
