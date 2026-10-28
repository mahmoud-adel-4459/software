import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestApp } from './helpers';
import { PASS_VALID_HOURS } from '@/modules/visitors/visitor-passes.service';

const CATEGORY = '00000000-0000-0000-0000-000000000020';

test('gate request -> unit approval -> pass scan admits once and releases the visitor', async (t) => {
  const app = await createTestApp(t);
  const { api, send, internal, gate, adminToken } = app;
  await api('POST', '/api/admin/users', { username: 'gateuser02', name: 'Gate', role: 'gate', password: 'gate-password-12' });
  const gateToken = await app.login(gate, 'gateuser02', 'gate-password-12');
  const atGate = (method: 'GET' | 'POST', route: string, data?: unknown) =>
    send(gate, method, route, data ?? {}, gateToken, method === 'POST' ? randomUUID() : undefined);

  const body = { name: 'Visitor One', nationalId: '30101010101011', phone: '010', organization: 'Supplier',
    categoryId: CATEGORY, host: 'Unit commander', purpose: 'Meeting' };
  const requestId = randomUUID();
  const created = await send(gate, 'POST', '/api/gate/visitor-passes', body, gateToken, requestId);
  assert.equal(created.status, 201);
  assert.equal((await send(gate, 'POST', '/api/gate/visitor-passes', body, gateToken, requestId)).body.id, created.body.id);
  const second = (await atGate('POST', '/api/gate/visitor-passes', { ...body, name: 'Visitor Two' })).body;
  assert.equal(second.no, created.body.no + 1);
  assert.equal((await atGate('POST', '/api/gate/visitor-passes', { ...body, nationalId: '123' })).status, 400);
  assert.equal((await atGate('POST', '/api/gate/visitor-passes', { ...body, purpose: '' })).status, 400);

  // Both sides see the request; only the unit (admin) decides.
  const listed = (await atGate('GET', '/api/visitor-passes')).body.passes;
  assert.equal(listed.find((p: { id: string }) => p.id === created.body.id).status, 'pending');
  const id = created.body.id;
  assert.equal((await atGate('POST', '/api/visitor-passes/decide', { id, decision: 'approve' })).status, 403);
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id, action: 'in' })).status, 409);
  await api('POST', '/api/visitor-passes/decide', { id, decision: 'approve' });
  assert.equal((await send(internal, 'POST', '/api/visitor-passes/decide', { id, decision: 'reject' }, adminToken, randomUUID())).status, 409);
  await api('POST', '/api/visitor-passes/decide', { id: second.id, decision: 'reject', notes: 'Not expected' });
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id: second.id, action: 'in' })).status, 409);

  // First scan admits, a second "in" with the same pass is refused, then the exit closes the visit.
  const admitted = await atGate('POST', '/api/gate/visitor-pass', { id, action: 'in' });
  assert.equal(admitted.status, 201);
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id, action: 'in' })).status, 409);
  const inside = (await atGate('GET', `/api/visitor-pass?id=${id}`)).body;
  assert.equal(inside.status, 'inside');
  assert.ok(inside.check_in);
  const visit = await app.backend.store.prisma.visitorVisit.findFirst({ where: { check_out: null }, include: { visitor: true } });
  assert.equal(visit!.visitor.name, 'Visitor One');
  assert.equal(visit!.purpose, 'Meeting');
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id, action: 'out', notes: 'Left' })).status, 201);
  const done = (await atGate('GET', `/api/visitor-pass?id=${id}`)).body;
  assert.equal(done.status, 'completed');
  assert.ok(done.check_out);
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id, action: 'out' })).status, 409);

  // An unused pass can be cancelled by the gate; an approved pass expires.
  const third = (await atGate('POST', '/api/gate/visitor-passes', { ...body, name: 'Visitor Three' })).body;
  assert.equal((await atGate('POST', '/api/gate/visitor-passes/cancel', { id: third.id })).status, 201);
  assert.equal((await atGate('POST', '/api/gate/visitor-passes/cancel', { id: third.id })).status, 409);
  const fourth = (await atGate('POST', '/api/gate/visitor-passes', { ...body, name: 'Visitor Four' })).body;
  await api('POST', '/api/visitor-passes/decide', { id: fourth.id, decision: 'approve' });
  await app.backend.store.prisma.visitorPass.update({
    where: { id: fourth.id },
    data: { decided_at: new Date(Date.now() - (PASS_VALID_HOURS + 1) * 3_600_000) },
  });
  assert.equal((await atGate('GET', `/api/visitor-pass?id=${fourth.id}`)).body.expired, true);
  assert.equal((await atGate('POST', '/api/gate/visitor-pass', { id: fourth.id, action: 'in' })).status, 409);

  // A cashier account cannot see or move passes.
  await api('POST', '/api/admin/users', { username: 'cashier-pass', name: 'Cashier', role: 'clerk', password: 'cashier-password-12' });
  const clerk = await app.login(internal, 'cashier-pass', 'cashier-password-12');
  assert.equal((await send(internal, 'GET', '/api/visitor-passes', {}, clerk)).status, 403);
  assert.equal((await send(internal, 'POST', '/api/gate/visitor-passes', body, clerk, randomUUID())).status, 403);
});
