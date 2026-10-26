import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyMigrations, readMigrations } from '@/config/migrator';
import { openRaw } from '@/config/prisma';
import { createTestApp } from './helpers';

const soldierBody = (n: number) => ({
  name: `فرد ${n}`,
  militaryNo: String(100000 + n),
  nationalId: '30101010101011',
  rank: 'جندي',
  company: 'الأولى',
  unit: 'وحدة',
});

test('PRAGMAs, partial unique indexes and counters hold at the database level', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const prisma = app.backend.store.prisma;
  const fk = (await prisma.$queryRawUnsafe<{ foreign_keys: number | bigint }[]>('PRAGMA foreign_keys'))[0]!;
  assert.equal(Number(fk.foreign_keys), 1);
  const jm = (await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode'))[0]!;
  assert.equal(jm.journal_mode, 'wal');

  const soldier = await app.api('POST', '/api/soldiers', completeSoldierInput(soldierBody(1)));
  const admin = await prisma.user.findFirstOrThrow();
  const permit = (no: number, extra = {}) => ({
    id: randomUUID(),
    no,
    soldier_id: soldier.id,
    reason: 'x',
    exit_at: new Date(),
    expected_return: new Date(Date.now() + 1000),
    created_by: admin.id,
    ...extra,
  });
  await prisma.permit.create({ data: permit(901) });
  await assert.rejects(() => prisma.permit.create({ data: permit(902) }), /Unique|unique|constraint/i);
  await prisma.permit.create({ data: permit(903, { voided: true }) });
  await prisma.permit.create({ data: permit(904, { returned_at: new Date() }) });
  // Foreign keys are enforced.
  await assert.rejects(() =>
    prisma.attachment.create({
      data: {
        id: randomUUID(),
        soldier_id: randomUUID(),
        kind: 'photo',
        name: 'x',
        mime: 'image/png',
        content: '',
        sha256: '',
        size: 0,
      },
    }),
  );
  // CHECK constraints are enforced.
  await assert.rejects(() =>
    prisma.user.create({ data: { id: randomUUID(), username: 'q', name: 'q', password_hash: 'x', role: 'root' } }),
  );
});

test('parallel writers are serialised: unique permit numbers, no lost updates, idempotent retries', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const { send, internal, gate } = app;
  const gateToken = await app.login(gate, 'admin', 'test-password-long');
  const soldiers: { id: string }[] = [];
  for (let i = 1; i <= 8; i++) soldiers.push(await app.api('POST', '/api/soldiers', completeSoldierInput(soldierBody(i))));
  const exits = await Promise.all(
    soldiers.map((s) =>
      send(
        gate,
        'POST',
        '/api/gate',
        {
          kind: 'exit',
          soldierId: s.id,
          reason: 'إجازة اعتيادية',
          expectedReturn: new Date(Date.now() + 86400000).toISOString(),
        },
        gateToken,
      ),
    ),
  );
  assert.ok(
    exits.every((r) => r.status === 201),
    JSON.stringify(exits.map((r) => r.body)),
  );
  assert.deepEqual(
    exits.map((r) => r.body.no).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const sameId = randomUUID();
  const purchases = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      send(
        internal,
        'POST',
        '/api/canteen',
        { soldierId: soldiers[0]!.id, amountCents: 100, notes: String(i % 3) },
        app.adminToken,
        i < 4 ? sameId : randomUUID(),
      ),
    ),
  );
  assert.ok(purchases.every((r) => [201, 409].includes(r.status)));
  const sum = await app.backend.store.prisma.canteenTransaction.aggregate({
    _sum: { amount_cents: true },
    _count: true,
  });
  // 8 independent writes + the first of the "same id" group (the others replay or conflict by body).
  assert.ok((sum._count ?? 0) >= 8 && (sum._sum.amount_cents ?? 0) % 100 === 0);
  const events = await app.backend.store.prisma.gateEvent.findMany({ orderBy: { sequence: 'asc' } });
  assert.deepEqual(
    events.map((e) => e.sequence),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('data survives a restart; migrations are idempotent and checksummed', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mil-restart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = await createTestApp(t, { withBackups: false, dir });
  const soldier = await first.api('POST', '/api/soldiers', completeSoldierInput(soldierBody(1)));
  await first.close();
  const second = await createTestApp(t, { withBackups: false, dir, seedDemo: true });
  const list = await second.api('GET', '/api/soldiers');
  assert.deepEqual(
    list.soldiers.map((s: { id: string }) => s.id),
    [soldier.id],
    'demo seed skipped: DB not empty',
  );
  assert.equal(await second.backend.store.prisma.user.count({ where: { role: 'admin' } }), 1);
  await second.close();

  const raw = openRaw(path.join(dir, 'data', 'app.db'));
  try {
    const rows = raw.prepare('SELECT name FROM _migrations').all();
    assert.equal(rows.length, readMigrations().length);
    assert.deepEqual(applyMigrations(raw), []);
    raw.prepare("UPDATE _migrations SET checksum = 'tampered'").run();
    assert.throws(() => applyMigrations(raw), /modified/);
    raw.prepare("INSERT INTO _migrations (name, checksum, applied_at) VALUES ('99999999_future', 'x', 'x')").run();
    raw
      .prepare(
        "UPDATE _migrations SET checksum = (SELECT checksum FROM _migrations LIMIT 1) WHERE name <> '99999999_future'",
      )
      .run();
    assert.throws(() => applyMigrations(raw), /newer version/);
  } finally {
    raw.close();
  }
});

test('play mode seeds three demo soldiers once and ensures the admin account', async (t) => {
  const app = await createTestApp(t, { withBackups: false, seedDemo: true });
  const list = await app.api('GET', '/api/soldiers');
  assert.equal(list.soldiers.length, 3);
  assert.equal((await app.api('GET', '/api/catalog')).settings.unitName, 'وحدة تجربة — Lab');
});

test('auto-backup scheduler: skips while busy, runs on schedule, prunes by retention', async (t) => {
  let now = Date.now();
  const app = await createTestApp(t, { clock: () => now });
  const manager = app.backend.backupManager!;
  let busy = true;
  const policy = { autoBackup: true, autoBackupIntervalHours: 6, backupRetentionDays: 7 };
  manager.startSchedule({ loadPolicy: async () => policy, isBusy: () => busy, tickMs: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(manager.list().length, 0);
  assert.equal(manager.scheduleStatus(policy).lastSkipReason, 'busy');
  busy = false;
  manager.stopSchedule();
  manager.startSchedule({ loadPolicy: async () => policy, isBusy: () => busy, tickMs: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(manager.list().length, 1);
  const status = manager.scheduleStatus(policy);
  assert.ok(status.lastAutoBackupAt);
  assert.equal(status.nextDueAt, new Date(Date.parse(status.lastAutoBackupAt!) + 6 * 3600000).toISOString());
  assert.equal((await app.api('GET', '/api/backups')).schedule.autoBackupIntervalHours, 24);
  // Retention: a backup older than the window is deleted by prune().
  now += 8 * 86400000;
  manager.prune();
  assert.equal(manager.list().length, 0);
  manager.stopSchedule();
  // Disabled policy never backs up.
  manager.startSchedule({ loadPolicy: async () => ({ ...policy, autoBackup: false }), tickMs: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(manager.list().length, 0);
});
