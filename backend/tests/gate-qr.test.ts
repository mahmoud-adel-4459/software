import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { ADMIN_PASSWORD, createTestApp } from './helpers';

// Same pipeline as the printed label: payload -> PNG at print resolution -> camera/scanner decode.
async function scanPrinted(payload: string): Promise<string> {
  const png = PNG.sync.read(await QRCode.toBuffer(payload, { errorCorrectionLevel: 'L', margin: 2, width: 1200 }));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, 'QR must be decodable');
  return decoded.data;
}

test('QR -> gate scan -> exit/entry is stored in gate log, permits, audit and reports', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const { send, internal, gate, backend, api } = app;
  const prisma = backend.store.prisma;

  const soldier = await api('POST', '/api/soldiers', completeSoldierInput({
    name: 'أحمد بوابة',
    militaryNo: '000012345',
    nationalId: '30101010101011',
    rank: 'جندي',
    company: 'الأولى',
    unit: 'وحدة',
  }));
  await api('POST', '/api/admin/users', {
    username: 'gateuser01',
    name: 'عامل بوابة',
    role: 'gate',
    password: 'gate-password-12',
  });
  await api('POST', '/api/admin/users', {
    username: 'clerkuser01',
    name: 'كاشير',
    role: 'clerk',
    password: 'clerk-password-12',
  });
  const visitor = await api('POST', '/api/visitors', {
    name: 'زائر اختبار',
    categoryId: '00000000-0000-0000-0000-000000000020',
  });

  // The QR printed for the soldier / visitor decodes to a value the gate understands.
  assert.equal(await scanPrinted(soldier.military_no), '000012345');
  assert.equal(await scanPrinted(visitor.id), visitor.id);

  // Clerk may not operate the gate.
  const clerkToken = await app.login(internal, 'clerkuser01', 'clerk-password-12');
  const exitBody = {
    soldierId: soldier.id,
    kind: 'exit',
    reason: 'إجازة اعتيادية',
    expectedReturn: new Date(Date.now() + 3600000).toISOString(),
    notes: 'خروج اختبار',
  };
  assert.equal((await send(internal, 'POST', '/api/gate', exitBody, clerkToken)).status, 403);

  // Gate station scans the soldier and records exit.
  const gateToken = await app.login(gate, 'gateuser01', 'gate-password-12');
  const g = (route: string) => send(gate, 'GET', route, {}, gateToken);
  const profile = await g('/api/gate/soldier?militaryNo=000012345');
  assert.equal(profile.body.soldier.id, soldier.id);
  assert.equal(profile.body.soldier.status, 'in');
  const exitId = randomUUID();
  const permit = (await send(gate, 'POST', '/api/gate', exitBody, gateToken, exitId)).body;
  assert.equal((await send(gate, 'POST', '/api/gate', exitBody, gateToken, exitId)).body.id, permit.id);

  let events = await prisma.gateEvent.findMany({ orderBy: { sequence: 'asc' } });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.kind, 'exit');
  assert.equal(events[0]!.soldier_id, soldier.id);
  assert.equal(events[0]!.permit_id, permit.id);
  assert.equal(events[0]!.device_id, gate.id);
  assert.equal(events[0]!.user_id, (await prisma.user.findFirstOrThrow({ where: { username: 'gateuser01' } })).id);
  assert.equal((await prisma.soldier.findUniqueOrThrow({ where: { id: soldier.id } })).status, 'out');
  const storedPermit = await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } });
  assert.equal(storedPermit.reason, 'إجازة اعتيادية');
  assert.equal(storedPermit.notes, 'خروج اختبار');
  assert.equal(storedPermit.returned_at, null);
  assert.equal(await prisma.auditLog.count({ where: { action: 'gate.exit', entity_id: permit.id } }), 1);

  // Scanning an already-out soldier shows 'out'; a second exit is refused.
  assert.equal((await g('/api/gate/soldier?militaryNo=000012345')).body.soldier.status, 'out');
  assert.equal((await send(gate, 'POST', '/api/gate', { ...exitBody, notes: 'تكرار' }, gateToken)).status, 409);

  // Entry closes the permit.
  const entry = { soldierId: soldier.id, kind: 'entry', notes: 'عودة اختبار' };
  assert.equal((await send(gate, 'POST', '/api/gate', entry, gateToken)).status, 201);
  events = await prisma.gateEvent.findMany({ orderBy: { sequence: 'asc' } });
  assert.deepEqual(
    events.map((e) => e.kind),
    ['exit', 'entry'],
  );
  assert.deepEqual(
    events.map((e) => e.sequence),
    [1, 2],
  );
  const closed = await prisma.permit.findUniqueOrThrow({ where: { id: permit.id } });
  assert.ok(closed.returned_at);
  assert.equal(closed.entry_notes, 'عودة اختبار');
  assert.equal((await prisma.soldier.findUniqueOrThrow({ where: { id: soldier.id } })).status, 'in');

  // Visitor flow from the scanned QR.
  assert.equal((await g(`/api/gate/visitor?id=${visitor.id}`)).body.openVisit, null);
  const inbound = { visitorId: visitor.id, action: 'in', purpose: 'زيارة عائلية' };
  assert.equal((await send(gate, 'POST', '/api/gate/visitor', inbound, gateToken)).status, 201);
  assert.equal(
    (await send(gate, 'POST', '/api/gate/visitor', { visitorId: visitor.id, action: 'out' }, gateToken)).status,
    201,
  );
  const visits = await prisma.visitorVisit.findMany();
  assert.equal(visits.length, 1);
  assert.equal(visits[0]!.purpose, 'زيارة عائلية');
  assert.ok(visits[0]!.check_out);

  // The gate log screens/reports (admin) show exactly what was stored.
  assert.equal((await g('/api/permits')).body.permits.filter((p: { id: string }) => p.id === permit.id).length, 1);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const report = await api('GET', `/api/reports?type=gate&from=${from}&to=${to}`);
  assert.equal(report.rows.length, 2);
  assert.deepEqual(report.rows.map((r: { kind: string }) => r.kind).sort(), ['entry', 'exit']);
  assert.ok(
    report.rows.every(
      (r: { military_no: string; name: string }) => r.military_no === '000012345' && r.name === 'أحمد بوابة',
    ),
  );
  assert.equal(report.summary.entries, 1);
  assert.equal(report.summary.exits, 1);
  assert.equal((await api('GET', `/api/reports?type=visitor&from=${from}&to=${to}`)).rows.length, 1);
  assert.ok((await api('GET', `/api/reports/daily?date=${today}`)).activity.gate.total >= 0);
  void ADMIN_PASSWORD;
});
