import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestApp } from './helpers';
import { cairoDate } from '@/common/utils/time';

test('24 reusable cards preserve each occupant, prevent conflicts, and survive backup restore', async t => {
  const app = await createTestApp(t);
  const { api, send, internal, adminToken } = app;
  const cards = await api('GET', '/api/visitor-cards');
  assert.equal(cards.cards.length, 24);
  assert.deepEqual(cards.cards.map((c: { cardNo: number }) => c.cardNo), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.ok(cards.cards.every((c: { openVisit: unknown }) => c.openVisit === null));
  const body = { cardNo: 1, action: 'in', name: 'First visitor', categoryId: '00000000-0000-0000-0000-000000000020',
    purpose: 'Delivery', nationalId: '30101010101011', phone: '010', organization: 'First company', notes: 'Entry note' };
  const path = '/api/gate/visitor-card';
  const requestId = randomUUID();
  const first = await api('POST', path, body, requestId);
  assert.equal((await api('POST', path, body, requestId)).id, first.id);
  assert.equal((await send(internal, 'POST', path, body, adminToken)).status, 409);
  const occupied = await api('GET', '/api/gate/visitor-card?cardNo=1');
  assert.equal(occupied.openVisit.visitor.name, 'First visitor');
  assert.equal(occupied.openVisit.visitor.notes, 'Entry note');
  assert.equal((await send(internal, 'POST', path, { cardNo: 1, action: 'out', visitId: randomUUID() }, adminToken)).status, 409);
  await api('POST', path, { cardNo: 1, action: 'out', visitId: first.id, notes: 'Returned' });
  assert.equal((await api('GET', '/api/gate/visitor-card?cardNo=1')).openVisit, null);
  const second = await api('POST', path, { ...body, name: 'Second visitor', organization: 'Second company', nationalId: '' });
  assert.notEqual(first.visit.visitor_id, second.visit.visitor_id);
  assert.equal((await send(internal, 'POST', path, { cardNo: 1, action: 'out', visitId: first.id }, adminToken)).status, 409);
  const history = await app.backend.store.prisma.visitorVisit.findMany({ where: { card_no: 1 }, include: { visitor: true } });
  assert.equal(history.length, 2);
  assert.equal(history.find(v => v.id === first.id)!.visitor.name, 'First visitor');
  assert.ok(history.find(v => v.id === first.id)!.check_out);
  assert.equal(history.find(v => v.id === second.id)!.visitor.name, 'Second visitor');
  const parallel = await Promise.all([1, 2].map(() => send(internal, 'POST', path, { ...body, cardNo: 24 }, adminToken)));
  assert.deepEqual(parallel.map(r => r.status).sort(), [201, 409]);
  for (const cardNo of [0, 25, 1.5, '01', '1x']) {
    assert.equal((await send(internal, 'POST', path, { ...body, cardNo }, adminToken)).status, 400);
  }
  assert.equal((await send(internal, 'POST', path, { ...body, cardNo: 2, name: '' }, adminToken)).status, 400);
  assert.equal((await send(internal, 'POST', path, { ...body, cardNo: 2, nationalId: 'abc' }, adminToken)).status, 400);
  assert.equal((await api('GET', '/api/gate/visitor-card?cardNo=2')).openVisit, null);
  // The partial unique index also protects writes outside the HTTP queue.
  await assert.rejects(() => app.backend.store.prisma.visitorVisit.create({ data: {
    id: randomUUID(), card_no: 1, visitor_id: first.visit.visitor_id, purpose: 'Conflict',
  } }));
  const backup = await app.backend.backupManager!.create();
  await app.backend.backupManager!.restore(backup.id);
  assert.equal((await api('GET', '/api/gate/visitor-card?cardNo=1')).openVisit.visitor.name, 'Second visitor');
  const day = cairoDate(new Date());
  const report = await api('GET', `/api/reports?type=visitor&from=${day}&to=${day}`);
  assert.equal(report.rows.filter((r: { badge_no: string }) => r.badge_no === '1').length, 2);
  await api('POST', '/api/admin/users', { username: 'cashier-test', name: 'Cashier', role: 'clerk', password: 'cashier-password-12' });
  const clerk = await app.login(internal, 'cashier-test', 'cashier-password-12');
  assert.equal((await send(internal, 'GET', '/api/visitor-cards', {}, clerk)).status, 403);
  assert.equal((await send(internal, 'POST', path, { ...body, cardNo: 3 }, clerk)).status, 403);
});
