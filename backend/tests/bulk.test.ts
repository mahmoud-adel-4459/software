import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { hashPassword } from '@/common/utils/crypto';
import { cairoDate } from '@/common/utils/time';
import { createTestApp } from './helpers';

const DEFAULT_OUTLET = '00000000-0000-0000-0000-000000000010';
const soldierRow = (n: number, extra: Record<string, unknown> = {}) => ({
  name: `جندي ${n}`,
  militaryNo: 700000 + n,
  nationalId: 30101010100000 + n,
  rank: 'جندي',
  company: 'الأولى',
  unit: 'وحدة',
  height: 170,
  birthDate: '2000-01-01',
  ...extra,
});

test('outlet delete, dashboard and bulk imports', async (t) => {
  const app = await createTestApp(t);
  const { send, internal, api } = app;
  const prisma = app.backend.store.prisma;

  // Clerk is refused everywhere admin-only.
  await prisma.user.create({
    data: {
      id: randomUUID(),
      username: 'clerk2',
      name: 'كاشير',
      password_hash: await hashPassword('clerk-password-long'),
      role: 'clerk',
    },
  });
  const clerk = await app.login(internal, 'clerk2', 'clerk-password-long');
  assert.equal((await send(internal, 'GET', '/api/dashboard', {}, clerk)).status, 403);
  assert.equal((await send(internal, 'POST', '/api/soldiers/import', { rows: [soldierRow(1)] }, clerk)).status, 403);
  assert.equal((await send(internal, 'POST', '/api/outlets/delete', { id: DEFAULT_OUTLET }, clerk)).status, 403);

  // Soldiers: valid, duplicate (db + in batch), invalid; idempotent by request id.
  const requestId = randomUUID();
  const rows = [
    soldierRow(1),
    soldierRow(2),
    soldierRow(1),
    soldierRow(3, { nationalId: 'abc' }),
    soldierRow(4, { name: '' }),
  ];
  const first = await api('POST', '/api/soldiers/import', { rows }, requestId);
  assert.equal(first.created, 2);
  assert.equal(first.skipped, 3);
  assert.deepEqual(
    first.errors.map((e: { row: number }) => e.row),
    [3, 4, 5],
  );
  assert.equal(first.errors[0].message, 'الرقم العسكري مسجل مسبقًا');
  assert.deepEqual(await api('POST', '/api/soldiers/import', { rows }, requestId), first);
  assert.equal(await prisma.soldier.count(), 2);
  assert.equal((await send(internal, 'POST', '/api/soldiers/import', { rows: [] }, app.adminToken)).status, 400);
  const big = Array.from({ length: 5001 }, (_, i) => soldierRow(i));
  assert.equal((await send(internal, 'POST', '/api/soldiers/import', { rows: big }, app.adminToken)).status, 400);

  // Visitors.
  const visitors = await api('POST', '/api/visitors/import', {
    rows: [
      { name: 'زائر 1' },
      { name: 'زائر 2', categoryName: 'غير موجودة' },
      { name: 'زائر 3', badgeNo: 'B1', phone: 123 },
      { name: 'زائر 4', badgeNo: 'B1' },
      { name: '' },
    ],
  });
  assert.equal(visitors.created, 2);
  assert.deepEqual(
    visitors.errors.map((e: { row: number }) => e.row),
    [2, 4, 5],
  );

  // Fitness + canteen.
  const today = cairoDate();
  const fitness = await api('POST', '/api/fitness/import', {
    rows: [
      { militaryNo: 700001, type: 'ضغط', value: 40, date: today },
      { militaryNo: 700001, type: 'خطأ', value: 40, date: today },
      { militaryNo: 999999, type: 'ضغط', value: 40, date: today },
      { militaryNo: 700002, type: 'ضغط', value: 'x', date: today },
    ],
  });
  assert.equal(fitness.created, 1);
  assert.equal(fitness.skipped, 3);
  const canteen = await api('POST', '/api/canteen/import', {
    rows: [
      { militaryNo: 700001, amount: 12.5 },
      { militaryNo: 700002, outletName: 'كانتين', amount: 3, date: today },
      { militaryNo: 700002, amount: 0 },
      { militaryNo: 700002, outletName: 'لا يوجد', amount: 1 },
    ],
  });
  assert.equal(canteen.created + canteen.skipped, 4);
  assert.ok(canteen.errors.some((e: { row: number }) => e.row === 3));
  assert.ok(canteen.errors.some((e: { row: number }) => e.row === 4));
  const cents = await prisma.canteenTransaction.findFirst({ where: { amount_cents: 1250 } });
  assert.ok(cents);

  // Dashboard: zero-filled ascending days, totals.
  for (const days of [7, 30, 90]) {
    const d = await api('GET', `/api/dashboard?days=${days}`);
    assert.equal(d.range.days, days);
    assert.equal(d.gate.byDay.length, days);
    assert.equal(d.visitors.byDay.length, days);
    assert.equal(d.food.canteen.byDay.length, days);
    assert.equal(d.food.buffet.byDay.length, days);
    assert.equal(d.range.to, today);
    const dates = d.gate.byDay.map((x: { date: string }) => x.date);
    assert.deepEqual(dates, [...dates].sort());
  }
  const dash = await api('GET', '/api/dashboard');
  assert.equal(dash.range.days, 7);
  assert.equal(dash.soldiers.total, 2);
  assert.equal(dash.soldiers.inside, 2);
  assert.equal(dash.fitness.records, 1);
  assert.equal(dash.visitors.total, 0);
  assert.ok(dash.food.canteen.rangeCents >= 1250);
  assert.equal(dash.food.canteen.todayCents, dash.food.canteen.rangeCents);
  assert.equal((await send(internal, 'GET', '/api/dashboard?days=5', {}, app.adminToken)).status, 400);

  // Outlet delete rules.
  const extra = await api('POST', '/api/outlets', { name: 'كانتين ثانٍ', kind: 'canteen' });
  const lone = await api('POST', '/api/outlets', { name: 'بوفيه وحيد', kind: 'buffet' });
  const del = (id: string) => send(internal, 'POST', '/api/outlets/delete', { id }, app.adminToken);
  assert.equal((await del(DEFAULT_OUTLET)).status, 409);
  const soldier = await prisma.soldier.findFirstOrThrow();
  await api('POST', '/api/canteen', { soldierId: soldier.id, outletId: extra.id, amountCents: 100 });
  const used = await del(extra.id);
  assert.equal(used.status, 409);
  assert.ok(JSON.stringify(used.body).includes('لا يمكن حذف نقطة بيع لها حركات'));
  // The only active buffet cannot be deleted; a second one can.
  assert.equal((await del(lone.id)).status, 409);
  const spare = await api('POST', '/api/outlets', { name: 'بوفيه إضافي', kind: 'buffet' });
  assert.deepEqual(await api('POST', '/api/outlets/delete', { id: spare.id }), { id: spare.id });
  assert.equal(await prisma.foodOutlet.count({ where: { id: spare.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: 'outlets.delete' } }), 1);
});
