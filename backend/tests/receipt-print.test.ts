import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ADMIN_PASSWORD, createTestApp } from './helpers';

test('receipt copy numbers are per transaction, atomic, idempotent and survive reopening the database', async (t) => {
  const app = await createTestApp(t);
  const soldier = await app.api('POST', '/api/soldiers', completeSoldierInput({
    name: 'اختبار إيصال', militaryNo: '000012345', nationalId: '30101010101011', rank: 'جندي', company: 'الأولى', unit: 'اختبار',
  }));
  const buffet = await app.api('POST', '/api/outlets', { kind: 'buffet', name: 'بوفيه الاختبار' });
  for (const outletId of [undefined, buffet.id]) {
    const purchase = await app.api('POST', '/api/canteen', { soldierId: soldier.id, outletId, amountCents: 500 });
    const requestId = randomUUID();
    const first = await app.api('POST', '/api/canteen/receipt-print', { id: purchase.id }, requestId);
    assert.equal(first.printNumber, 1);
    assert.deepEqual(await app.api('POST', '/api/canteen/receipt-print', { id: purchase.id }, requestId), first);
    const copies = await Promise.all([1, 2].map(() => app.api('POST', '/api/canteen/receipt-print', { id: purchase.id })));
    assert.deepEqual(copies.map((copy) => copy.printNumber).sort(), [2, 3]);
    const last = copies.find((copy) => copy.printNumber === 3)!;
    await app.api('POST', '/api/canteen/receipt-print/failed', { id: purchase.id, reservationId: last.reservationId });
    const retry = await app.api('POST', '/api/canteen/receipt-print', { id: purchase.id });
    assert.equal(retry.printNumber, 3);
    await app.backend.database.close();
    await app.backend.database.open();
    assert.equal((await app.api('POST', '/api/canteen/receipt-print', { id: purchase.id })).printNumber, 4);
    const gateToken = await app.login(app.gate, 'admin', ADMIN_PASSWORD);
    assert.equal((await app.send(app.gate, 'POST', '/api/canteen/receipt-print', { id: purchase.id }, gateToken)).status, 403);
  }
  assert.equal(await app.backend.store.prisma.canteenTransaction.count(), 2);
  assert.equal((await app.api('POST', '/api/canteen/receipt-print', { id: randomUUID() }).catch(() => null)), null);
});
