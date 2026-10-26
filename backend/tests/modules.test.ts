import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import QRCode from 'qrcode';
import { hashPassword } from '@/common/utils/crypto';
import { cairoDate, dayStart, nextDay } from '@/common/utils/time';
import { openRaw } from '@/config/prisma';
import { openEnvelope, sealLegacy, sealSqlite } from '@/modules/backup/backup.format';
import { COLUMNS, type Row, type Snapshot } from '@/modules/backup/backup.snapshot';
import { importLegacy, validateLegacy } from '@/modules/import/import.service';
import { ADMIN_PASSWORD, createTestApp, serverId } from './helpers';

test('Cairo calendar boundaries', () => {
  for (const d of ['2026-04-24', '2026-10-30', '2026-10-07']) {
    const start = Date.parse(dayStart(d));
    assert.equal(cairoDate(new Date(start)), d);
    assert.equal(
      cairoDate(new Date(start - 1000)),
      new Date(Date.parse(d + 'T12:00Z') - 86400000).toISOString().slice(0, 10),
    );
    assert.ok(Date.parse(dayStart(nextDay(d))) > start);
  }
});

/** Builds the PostgreSQL-era schema-3 JSON snapshot from the current SQLite file (what old builds exported). */
function legacySnapshot(dbPath: string): Snapshot {
  const raw = openRaw(dbPath, { readonly: true });
  try {
    const tables: Record<string, Row[]> = {};
    for (const [table, columns] of Object.entries(COLUMNS)) {
      tables[table] = (raw.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all() as Row[]).map((row) => {
        const out: Row = {};
        for (const col of columns) {
          let v = row[col];
          if (v !== null && ['disabled', 'archived', 'voided'].includes(col)) v = Boolean(v);
          else if (v !== null && ['details', 'response', 'before_state', 'after_state', 'data'].includes(col))
            v = JSON.parse(v as string);
          else if (
            v !== null &&
            ['created_at', 'exit_at', 'expected_return', 'returned_at', 'at', 'check_in', 'check_out', 'date'].includes(
              col,
            )
          )
            v = new Date(v as string).toISOString();
          else if (table === 'fitness_records' && col === 'value' && v !== null) v = String(v);
          out[col] = v;
        }
        return out;
      });
    }
    return { schema: 3, tables };
  } finally {
    raw.close();
  }
}

test('SQLite engine: modules, privacy, corrections, encrypted backups and atomic restore', async (t) => {
  const app = await createTestApp(t);
  const { send, internal, gate, backend } = app;
  const prisma = () => backend.store.prisma;
  const gateToken = await app.login(gate, 'admin', ADMIN_PASSWORD);
  const api = app.api;
  const s = await api('POST', '/api/soldiers', completeSoldierInput({
    name: 'اختبار',
    militaryNo: '000012345',
    nationalId: '30101010101011',
    rank: 'جندي',
    company: 'الأولى',
    unit: 'اختبار',
    details: { height: '175' },
  }));
  assert.equal(s.details.height, '175');
  const updated = await api('POST', '/api/soldier/update', {
    id: s.id,
    version: s.version,
    name: 'اسم معدل',
    militaryNo: s.military_no,
    nationalId: s.national_id,
    rank: s.rank,
    company: s.company,
    unit: s.unit,
    phone: '01000000000',
    address: 'سري',
    details: { ...s.details, height: '176' },
  });
  assert.equal(updated.version, 2);
  assert.equal(
    (await send(internal, 'POST', '/api/soldier/update', { id: s.id, version: 1 }, app.adminToken)).status,
    409,
  );
  const image = await QRCode.toBuffer('000012345');
  const upload = (kind: string, name: string) =>
    api('POST', '/api/attachments', {
      soldierId: s.id,
      kind,
      name,
      mime: 'image/png',
      content: image.toString('base64'),
    });
  const attachment = await upload('photo', 'صورة.png');
  const idPhoto = await upload('idPhoto', 'هوية.png');
  const tagPhoto = await upload('tagPhoto', 'بطاقة.png');
  assert.ok(tagPhoto.id);
  assert.equal((await send(gate, 'GET', `/api/attachment?id=${attachment.id}`, {}, gateToken)).status, 200);
  assert.equal((await send(gate, 'GET', `/api/attachment?id=${idPhoto.id}`, {}, gateToken)).status, 200);
  const doc = await api('POST', '/api/attachments', {
    soldierId: s.id,
    kind: 'document',
    name: 'ملف.pdf',
    mime: 'application/pdf',
    content: Buffer.from('%PDF-1.4 test').toString('base64'),
  });
  assert.equal((await send(gate, 'GET', `/api/attachment?id=${doc.id}`, {}, gateToken)).status, 403);
  // Re-uploading a picture replaces the previous one of that kind.
  await upload('photo', 'صورة2.png');
  assert.equal((await api('GET', `/api/photos?soldierId=${s.id}`)).photos.length, 1);
  const purchase = await api('POST', '/api/canteen', { soldierId: s.id, amountCents: 12345, notes: 'مشتريات' });
  assert.equal((await api('GET', `/api/canteen?soldierId=${s.id}&month=${cairoDate().slice(0, 7)}`)).totalCents, 12345);
  const receipt = await api('GET', `/api/canteen/transaction?id=${purchase.id}`);
  assert.equal(receipt.amount_cents, 12345);
  assert.equal(receipt.cashier, 'مسؤول');
  assert.equal(receipt.reversed_by, null);
  assert.equal((await send(gate, 'GET', `/api/canteen/transaction?id=${purchase.id}`, {}, gateToken)).status, 403);
  const reversalId = randomUUID();
  await api('POST', '/api/canteen/reverse', { id: purchase.id, reason: 'خطأ إدخال' }, reversalId);
  await api('POST', '/api/canteen/reverse', { id: purchase.id, reason: 'خطأ إدخال' }, reversalId);
  assert.equal((await api('GET', `/api/canteen?soldierId=${s.id}`)).totalCents, 0);
  assert.equal(
    (await send(internal, 'POST', '/api/canteen/reverse', { id: purchase.id, reason: 'مرة ثانية' }, app.adminToken))
      .status,
    409,
  );
  const fitness = await api('POST', '/api/fitness', {
    soldierId: s.id,
    type: 'ضغط',
    value: 40,
    date: cairoDate(),
    notes: 'جيد',
  });
  assert.equal(fitness.unit, 'مرة');
  assert.equal(fitness.value, '40');
  const records = (await api('GET', `/api/fitness?soldierId=${s.id}`)).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].date, `${cairoDate()}T00:00:00.000Z`);
  const catalog = await api('GET', '/api/catalog');
  await api('POST', '/api/settings', { ...catalog.settings, unitName: 'وحدة جديدة', extraReasons: ['زيارة معتمدة'] });
  assert.equal((await api('GET', '/api/catalog')).settings.unitName, 'وحدة جديدة');
  // print settings: defaults, validation, round trip
  assert.deepEqual(
    [catalog.settings.labelWidthMm, catalog.settings.labelHeightMm, catalog.settings.receiptWidthMm, catalog.settings.silentPrint],
    [45, 50, 80, false],
  );
  const cur = (await api('GET', '/api/catalog')).settings;
  assert.deepEqual(
    [catalog.settings.receiptPrintableWidthMm, catalog.settings.receiptMarginMm, catalog.settings.receiptFontPt, catalog.settings.receiptLineHeight, catalog.settings.receiptBold, catalog.settings.receiptShowLogo, catalog.settings.receiptLogoMm, catalog.settings.receiptHeightMode, catalog.settings.receiptHeightMm, catalog.settings.receiptCopies, catalog.settings.receiptFooter, catalog.settings.receiptTopFeedMm, catalog.settings.receiptBottomFeedMm],
    [72, 1, 11, 1.4, true, true, 20, 'auto', 150, 1, '', 2, 8],
  );
  const bads = [
    { labelWidthMm: 10 }, { labelHeightMm: 500 }, { receiptWidthMm: 200 }, { silentPrint: 'yes' },
    { receiptPrintableWidthMm: 39 }, { receiptPrintableWidthMm: 90 }, { receiptMarginMm: 11 }, { receiptFontPt: 6 },
    { receiptFontPt: 19 }, { receiptLineHeight: 2.5 }, { receiptBold: 'no' }, { receiptHeightMode: 'tall' },
    { receiptHeightMm: 30 }, { receiptCopies: 4 }, { receiptCopies: 1.5 }, { receiptFooter: 'x'.repeat(121) },
    { receiptTopFeedMm: 21 }, { receiptBottomFeedMm: 31 }, { receiptLogoMm: 5 },
  ];
  for (const bad of bads) {
    await assert.rejects(api('POST', '/api/settings', { ...cur, ...bad }));
  }
  await api('POST', '/api/settings', { ...cur, labelPrinter: 'XP-246B', receiptPrinter: 'XP-90', labelWidthMm: 60, labelHeightMm: 40, receiptWidthMm: 58, receiptPrintableWidthMm: 48, receiptMarginMm: 2, receiptFontPt: 10, receiptLineHeight: 1.6, receiptBold: false, receiptShowLogo: false, receiptHeightMode: 'fixed', receiptHeightMm: 200, receiptCopies: 2, receiptFooter: 'شكرًا', receiptTopFeedMm: 3, receiptBottomFeedMm: 12, silentPrint: false });
  const saved = (await api('GET', '/api/catalog')).settings;
  assert.deepEqual(
    [saved.labelPrinter, saved.receiptPrinter, saved.labelWidthMm, saved.labelHeightMm, saved.receiptWidthMm, saved.silentPrint],
    ['XP-246B', 'XP-90', 60, 40, 58, false],
  );
  assert.deepEqual(
    [saved.receiptPrintableWidthMm, saved.receiptMarginMm, saved.receiptFontPt, saved.receiptLineHeight, saved.receiptBold, saved.receiptShowLogo, saved.receiptHeightMode, saved.receiptHeightMm, saved.receiptCopies, saved.receiptFooter, saved.receiptTopFeedMm, saved.receiptBottomFeedMm],
    [48, 2, 10, 1.6, false, false, 'fixed', 200, 2, 'شكرًا', 3, 12],
  );
  await assert.rejects(api('POST', '/api/settings', { ...saved, receiptWidthMm: 50, receiptPrintableWidthMm: 60 }), 'printable > width');
  const branchCanteen = await api('POST', '/api/outlets', { name: 'كانتين فرعي', kind: 'canteen' });
  await api('POST', '/api/canteen', { soldierId: s.id, outletId: branchCanteen.id, amountCents: 500, notes: 'فرع' });
  const month = cairoDate().slice(0, 7);
  assert.equal(
    (await api('GET', `/api/canteen?soldierId=${s.id}&month=${month}&outletId=${branchCanteen.id}`)).totalCents,
    500,
  );
  await api('POST', '/api/outlets/update', { id: '00000000-0000-0000-0000-000000000010', disabled: true });
  assert.equal(
    (await send(internal, 'POST', '/api/outlets/update', { id: branchCanteen.id, disabled: true }, app.adminToken))
      .status,
    409,
  );
  await api('POST', '/api/outlets/update', { id: '00000000-0000-0000-0000-000000000010', disabled: false });
  const visitor = await api('POST', '/api/visitors', {
    name: 'زائر اختبار',
    categoryId: '00000000-0000-0000-0000-000000000020',
    organization: 'جهة',
  });
  assert.match(visitor.badge_no, /^Z\d{6}$/);
  await api('POST', '/api/gate/visitor', { visitorId: visitor.id, action: 'in', purpose: 'اجتماع' });
  assert.equal(
    (
      await send(
        internal,
        'POST',
        '/api/gate/visitor',
        { visitorId: visitor.id, action: 'in', purpose: 'مرة ثانية' },
        app.adminToken,
      )
    ).status,
    409,
  );
  assert.equal((await api('GET', `/api/gate/visitor?id=${visitor.id}`)).openVisit.purpose, 'اجتماع');
  await api('POST', '/api/gate/visitor', { visitorId: visitor.id, action: 'out', notes: '' });
  assert.equal((await api('GET', `/api/gate/visitor?id=${visitor.id}`)).openVisit, null);
  assert.equal((await api('GET', `/api/visitors?q=${encodeURIComponent('اختبار')}`)).visitors.length, 1);
  const move = await api('POST', '/api/gate', {
    kind: 'exit',
    soldierId: s.id,
    reason: 'إجازة اعتيادية',
    expectedReturn: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.deepEqual(await api('GET', '/api/summary'), { outside: 1, late: 0 });
  const daily = await api('GET', `/api/reports/daily?date=${cairoDate()}`);
  assert.ok(daily.snapshot.soldiers.total >= 1);
  assert.equal(daily.activity.gate.total, 1);
  assert.equal(daily.activity.fitness.records, 1);
  assert.equal(daily.snapshot.permits.activeOutside, 1);
  const today = cairoDate();
  const gateReport = await api('GET', `/api/reports?type=gate&from=${today}&to=${today}`);
  assert.equal(gateReport.rows.length, 1);
  assert.equal(
    (await send(gate, 'GET', `/api/reports?type=gate&from=${today}&to=${today}`, {}, gateToken)).status,
    403,
  );
  await api('POST', '/api/gate/correct', { eventId: gateReport.rows[0].id, reason: 'خروج سجل بالخطأ' });
  assert.equal((await api('GET', `/api/permit?id=${move.id}`)).voided, true);
  assert.equal((await api('GET', `/api/soldier?id=${s.id}`)).soldier.status, 'in');
  // A voided permit frees the partial unique index: the soldier may leave again.
  await api('POST', '/api/gate', {
    kind: 'exit',
    soldierId: s.id,
    reason: 'إجازة اعتيادية',
    expectedReturn: new Date(Date.now() + 86400000).toISOString(),
  });
  await api('POST', '/api/gate', { kind: 'entry', soldierId: s.id, notes: '' });
  for (const route of [
    '/api/canteen',
    '/api/fitness',
    '/api/settings',
    '/api/users/update',
    '/api/soldier/archive',
    '/api/attachments',
    '/api/gate/correct',
    '/api/backup/create',
  ]) {
    assert.equal((await send(gate, 'POST', route, {}, gateToken)).status, 403, route);
  }
  const report = await api('GET', `/api/reports?type=canteen&from=${today}&to=${today}`);
  assert.equal(report.totalCents, 500);
  assert.equal(report.rows.length, 3);
  assert.equal((await api('GET', `/api/reports?type=fitness&from=${today}&to=${today}`)).rows[0].value, '40');
  assert.equal((await api('GET', `/api/reports?type=visitor&from=${today}&to=${today}`)).summary.completed, 1);

  // ---- Backups -------------------------------------------------------------------------------------------
  const backup = await api('POST', '/api/backup/create');
  const preview = await api('GET', `/api/backup/preview?id=${backup.id}`);
  assert.equal(preview.format, 'sqlite-1');
  assert.equal(preview.counts.attachments, 6);
  const envelope = await api('GET', `/api/backup/download?id=${backup.id}`);
  assert.equal(envelope.format, 'sqlite-1');
  assert.equal(JSON.stringify(envelope).includes('30101010101011'), false);
  const tampered = { ...envelope, content: envelope.content.slice(0, -4) + 'AAAA' };
  const key = backend.backupManager!.key;
  assert.throws(() => openEnvelope(tampered, key, serverId));
  assert.throws(() => openEnvelope(envelope, key, 'another-installation'), /لا تخص المنشأة/);
  const opened = openEnvelope(envelope, key, serverId);
  assert.equal(opened.format, 'sqlite-1');
  await api('POST', '/api/canteen', {
    soldierId: s.id,
    outletId: branchCanteen.id,
    amountCents: 999,
    notes: 'بعد النسخة',
  });
  assert.equal(
    (
      await send(
        internal,
        'POST',
        '/api/backup/restore',
        { id: backup.id, confirm: 'RESTORE', password: 'wrong-password-x' },
        app.adminToken,
      )
    ).status,
    400,
  );
  const restored = await api('POST', '/api/backup/restore', {
    id: backup.id,
    confirm: 'RESTORE',
    password: ADMIN_PASSWORD,
  });
  assert.ok(restored.safetyId);
  assert.equal(
    (await send(internal, 'GET', '/api/soldiers', {}, app.adminToken)).status,
    401,
    'restoration invalidates sessions',
  );
  app.adminToken = await app.login(internal, 'admin', ADMIN_PASSWORD);
  const total = await prisma().canteenTransaction.aggregate({ _sum: { amount_cents: true } });
  assert.equal(total._sum.amount_cents, 500);
  assert.equal(
    await prisma()
      .attachment.findUniqueOrThrow({ where: { id: attachment.id } })
      .catch(() => null),
    null,
  ); // replaced photo
  assert.equal(await prisma().attachment.count(), 6);
  assert.ok(fs.existsSync(backend.backupManager!.filename(restored.safetyId)));
  // The safety copy holds the pre-restore data (999 extra cents).
  const safety = await api('GET', `/api/backup/preview?id=${restored.safetyId}`);
  assert.equal(safety.counts.canteen_transactions, 4);

  // A backup with a dangling reference is rejected and leaves the live database untouched.
  const live = legacySnapshot(app.dbPath);
  const broken = structuredClone(live);
  broken.tables.fitness_records![0]!.soldier_id = randomUUID();
  const brokenId = backend.backupManager!.write(sealLegacy(broken, key, serverId));
  await assert.rejects(() => backend.backupManager!.restore(brokenId));
  assert.equal(await prisma().soldier.count(), 1, 'failed restore left the data untouched');
  assert.equal((await api('GET', '/api/catalog')).settings.unitName, 'وحدة جديدة');

  // Failed transactions roll back completely.
  const ctx = { user: (await backend.store.user('admin'))!, deviceId: internal.id, kind: 'internal' as const };
  await assert.rejects(
    backend.store.mutate(ctx, randomUUID(), { failure: true }, async (tx) => {
      await tx.soldier.updateMany({ data: { name: 'BROKEN' } });
      throw new Error('simulated failure');
    }),
  );
  assert.equal((await prisma().soldier.findFirstOrThrow()).name, 'اسم معدل');

  // ---- Legacy .mab (PostgreSQL build, schema 3) import + restore ------------------------------------------
  const legacyEnvelope = sealLegacy(live, key, serverId);
  const imported = await api('POST', '/api/backup/import', legacyEnvelope);
  const importedPreview = await api('GET', `/api/backup/preview?id=${imported.id}`);
  assert.equal(importedPreview.counts.soldiers, 1);
  assert.equal(importedPreview.counts.attachments, 6);
  assert.equal(importedPreview.counts.permits, 2);
  await api('POST', '/api/canteen', { soldierId: s.id, amountCents: 77, notes: 'قبل الاستعادة القديمة' });
  await api('POST', '/api/backup/restore', { id: imported.id, confirm: 'RESTORE', password: ADMIN_PASSWORD });
  app.adminToken = await app.login(internal, 'admin', ADMIN_PASSWORD);
  assert.equal((await prisma().canteenTransaction.aggregate({ _sum: { amount_cents: true } }))._sum.amount_cents, 500);
  // Counters were rebuilt: the next permit continues after the highest imported number.
  const next = await api('POST', '/api/gate', {
    kind: 'exit',
    soldierId: s.id,
    reason: 'إجازة اعتيادية',
    expectedReturn: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(next.no, 3);
  await api('POST', '/api/gate', { kind: 'entry', soldierId: s.id, notes: '' });
  assert.throws(
    () => openEnvelope(sealSqlite(Buffer.from('not a database'), key, serverId), key, serverId),
    /غير صالح/,
  );

  // ---- Legacy browser prototype import --------------------------------------------------------------------
  const legacy = {
    v: 1,
    soldiers: [
      {
        id: 1,
        name: 'فرد قديم',
        militaryNo: '000099999',
        nationalId: '30101010101012',
        rank: 'جندي',
        company: 'الثانية',
        unit: 'اختبار',
        status: 'in',
        height: 180,
        photo: `data:image/png;base64,${image.toString('base64')}`,
      },
    ],
    permits: [],
    canteen: [{ id: 1, soldierId: 1, amount: 20.25, at: new Date().toISOString() }],
    fitness: [
      {
        id: 1,
        soldierId: 1,
        type: 'اختبار اللياقة الشامل',
        result: 'جيد جدًا',
        date: new Date().toISOString(),
        notes: '',
      },
    ],
  };
  assert.equal(validateLegacy(legacy).valid, true);
  const importPreview = await api('POST', '/api/import/preview', legacy);
  assert.equal(importPreview.counts.soldiers, 1);
  const actor = { ...ctx, user: (await backend.store.user('admin'))! };
  const importId = randomUUID();
  const done = await importLegacy(backend.store, actor, importId, legacy);
  assert.equal(done.counts.soldiers, 1);
  const rawResult = await prisma().fitnessRecord.findFirstOrThrow({ where: { raw_result: { not: '' } } });
  assert.equal(rawResult.raw_result, 'جيد جدًا');
  assert.equal(rawResult.value, null);
  await assert.rejects(() => importLegacy(backend.store, actor, randomUUID(), legacy), /مستورد/);
  const badLegacy = structuredClone(legacy);
  badLegacy.soldiers.push({ ...badLegacy.soldiers[0]!, id: 2 });
  assert.equal(validateLegacy(badLegacy).valid, false);
  assert.equal(
    (
      await send(
        internal,
        'POST',
        '/api/import/apply',
        { confirm: 'IMPORT', source: badLegacy },
        app.adminToken,
        randomUUID(),
      )
    ).status,
    400,
  );

  // ---- Roles ------------------------------------------------------------------------------------------------
  await prisma().user.create({
    data: {
      id: randomUUID(),
      username: 'clerk1',
      name: 'كاشير',
      password_hash: await hashPassword('clerk-password-long'),
      role: 'clerk',
    },
  });
  const clerkToken = await app.login(internal, 'clerk1', 'clerk-password-long');
  assert.equal(
    (await send(internal, 'POST', '/api/canteen', { soldierId: s.id, amountCents: 100, notes: 'كاشير' }, clerkToken))
      .status,
    201,
  );
  assert.equal((await send(internal, 'POST', '/api/settings', { unitName: 'x' }, clerkToken)).status, 403);
  assert.equal(
    (await send(internal, 'GET', `/api/reports?type=canteen&from=${today}&to=${today}`, {}, clerkToken)).status,
    200,
  );
  assert.equal(
    (await send(internal, 'GET', `/api/reports?type=gate&from=${today}&to=${today}`, {}, clerkToken)).status,
    403,
  );
  const clerkSoldier = (await send(internal, 'GET', `/api/soldier?id=${s.id}`, {}, clerkToken)).body;
  assert.equal('national_id' in clerkSoldier.soldier, false);
  assert.deepEqual(clerkSoldier.attachments, []);
  const version = (await prisma().soldier.findUniqueOrThrow({ where: { id: s.id } })).version;
  const archived = await send(
    internal,
    'POST',
    '/api/soldier/archive',
    { id: s.id, version, archived: true },
    app.adminToken,
  );
  assert.equal(archived.body.archived, true);
  assert.equal(
    (await backend.store.list(actor, '')).some((row) => row.id === s.id),
    false,
  );
  assert.equal(
    (await api('GET', '/api/soldiers?archived=true')).soldiers.some((row: { id: string }) => row.id === s.id),
    true,
  );
  const gateAccount = randomUUID();
  await prisma().user.create({
    data: {
      id: gateAccount,
      username: 'gate-user',
      name: 'بوابة',
      password_hash: await hashPassword('long-gate-password'),
      role: 'gate',
    },
  });
  const disable = await send(
    internal,
    'POST',
    '/api/users/update',
    { id: gateAccount, name: 'بوابة', role: 'gate', disabled: true, password: '' },
    app.adminToken,
  );
  assert.equal(disable.status, 201);
  assert.equal(await backend.store.user('gate-user'), null);
  assert.equal(
    (
      await send(
        internal,
        'POST',
        '/api/users/update',
        { id: s.id, name: 'x', role: 'admin', disabled: false },
        app.adminToken,
      )
    ).status,
    404,
  );
  const lastAdmin = await prisma().user.findFirstOrThrow({ where: { username: 'admin' } });
  assert.equal(
    (
      await send(
        internal,
        'POST',
        '/api/users/update',
        { id: lastAdmin.id, name: 'x', role: 'gate', disabled: false },
        app.adminToken,
      )
    ).status,
    409,
  );
});
