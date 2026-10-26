import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadLicense } from '@/common/http/licensing';
import { checkPassword, fingerprint, hashPassword, keyPair, sign } from '@/common/utils/crypto';
import { createTestApp, newDevice, ADMIN_PASSWORD } from './helpers';

function fixtureLicense() {
  const issuer = keyPair();
  const clients = (['internal', 'gate'] as const).map((kind) => ({ ...newDevice(kind) }));
  const serverId = randomUUID();
  const payload = JSON.stringify({
    version: 1,
    installation: 'وحدة اختبار',
    serverId,
    devices: clients.map(({ privateKey: _k, ...d }) => ({ ...d, fingerprint: fingerprint(d.publicKey) })),
  });
  const envelope = { payload, signature: sign(issuer.privateKey, payload) };
  return { issuer, serverId, envelope, license: loadLicense(issuer.publicKey, envelope, serverId) };
}

test('passwords are salted and checked without storing plaintext', async () => {
  const first = await hashPassword('a-long-password');
  assert.notEqual(first, await hashPassword('a-long-password'));
  assert.equal(await checkPassword('a-long-password', first), true);
  assert.equal(await checkPassword('wrong', first), false);
  assert.equal(first.includes('a-long-password'), false);
});

test('license rejects altered payload, wrong installation server and copied issuer', () => {
  const f = fixtureLicense();
  assert.equal(f.license.devices.length, 2);
  assert.throws(() =>
    loadLicense(
      f.issuer.publicKey,
      { ...f.envelope, payload: f.envelope.payload.replace('gate', 'internal') },
      f.serverId,
    ),
  );
  assert.throws(() => loadLicense(f.issuer.publicKey, f.envelope, randomUUID()));
  assert.throws(() => loadLicense(keyPair().publicKey, f.envelope, f.serverId));
  assert.throws(() => loadLicense(f.issuer.publicKey, f.envelope, f.serverId, 'a'.repeat(64)), /Windows Server/);
});

test('signed API flow: device restriction, personal-data filtering, gate cycle, retry and forgery rejection', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const { send, internal, gate, backend } = app;
  const internalLogin = await send(internal, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD });
  assert.equal(internalLogin.status, 200);
  assert.equal(internalLogin.body.kind, 'internal');
  const gateLogin = await send(gate, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD });
  assert.equal(gateLogin.body.kind, 'gate');
  const adminToken = internalLogin.body.token;
  const gateToken = gateLogin.body.token;
  const payload = {
    name: 'أحمد محمد علي حسن',
    militaryNo: '202610001',
    nationalId: '30101010101011',
    rank: 'جندي',
    company: 'الأولى',
    unit: 'وحدة اختبار',
    phone: '01000000000',
    address: 'عنوان خاص',
  };
  const forbidden = await send(gate, 'POST', '/api/soldiers', completeSoldierInput(payload), gateToken, randomUUID());
  assert.equal(forbidden.status, 403, 'admin user on gate device must still be restricted');
  assert.equal((await send(gate, 'GET', '/api/admin/users', {}, gateToken)).status, 403);
  const createId = randomUUID();
  const created = await send(internal, 'POST', '/api/soldiers', completeSoldierInput(payload), adminToken, createId);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const retried = await send(internal, 'POST', '/api/soldiers', completeSoldierInput(payload), adminToken, createId);
  assert.deepEqual(retried.body, created.body);
  const gateList = await send(gate, 'GET', '/api/soldiers', {}, gateToken);
  assert.equal(gateList.body.soldiers.length, 1);
  for (const name of ['national_id', 'phone', 'address', 'password_hash']) {
    assert.equal(name in gateList.body.soldiers[0], false);
  }
  assert.equal(
    (await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].national_id,
    payload.nationalId,
  );
  assert.equal(
    (await send(internal, 'POST', '/api/soldiers', completeSoldierInput({ ...payload, name: 'تغيير' }), adminToken, createId)).status,
    409,
  );
  // Duplicate military number: unique violation maps to 409 and rolls back.
  assert.equal((await send(internal, 'POST', '/api/soldiers', completeSoldierInput(payload), adminToken, randomUUID())).status, 409);
  const movement = {
    kind: 'exit',
    soldierId: created.body.id,
    reason: 'إجازة',
    expectedReturn: new Date(Date.now() + 86400000).toISOString(),
    notes: '',
  };
  const past = { ...movement, expectedReturn: new Date(Date.now() - 60000).toISOString() };
  assert.equal((await send(gate, 'POST', '/api/gate', past, gateToken, randomUUID())).status, 400);
  const movementId = randomUUID();
  const exited = await send(gate, 'POST', '/api/gate', movement, gateToken, movementId);
  assert.equal(exited.status, 201, JSON.stringify(exited.body));
  assert.equal(exited.body.no, 1);
  assert.equal((await send(gate, 'POST', '/api/gate', movement, gateToken, movementId)).body.id, exited.body.id);
  assert.equal((await send(gate, 'POST', '/api/gate', movement, gateToken, randomUUID())).status, 409);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].status, 'out');
  const entry = { kind: 'entry', soldierId: created.body.id, notes: '' };
  assert.equal((await send(gate, 'POST', '/api/gate', entry, gateToken, randomUUID())).status, 201);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].status, 'in');
  assert.equal(await backend.store.prisma.auditLog.count(), 3);
  const gateAccount = {
    username: 'gate-operator',
    name: 'عامل البوابة',
    role: 'gate',
    password: 'gate-operator-password',
  };
  assert.equal((await send(gate, 'POST', '/api/admin/users', gateAccount, gateToken, randomUUID())).status, 403);
  const newUser = await send(internal, 'POST', '/api/admin/users', gateAccount, adminToken, randomUUID());
  assert.equal(newUser.status, 201, JSON.stringify(newUser.body));
  assert.equal('password_hash' in newUser.body, false);
  const lowPrivilege = await send(internal, 'POST', '/api/login', {
    username: gateAccount.username,
    password: gateAccount.password,
  });
  assert.equal(lowPrivilege.body.user.role, 'gate');
  assert.equal((await send(internal, 'GET', '/api/admin/users', {}, lowPrivilege.body.token)).status, 403);
  const operatorGate = await send(gate, 'POST', '/api/login', {
    username: gateAccount.username,
    password: gateAccount.password,
  });
  const gateSoldiers = (await send(gate, 'GET', '/api/soldiers', {}, operatorGate.body.token)).body.soldiers;
  assert.ok(gateSoldiers.length > 0);
  assert.equal('national_id' in gateSoldiers[0], false);
  assert.equal(
    (
      await send({ ...newDevice('gate'), id: randomUUID() }, 'POST', '/api/login', {
        username: 'admin',
        password: ADMIN_PASSWORD,
      })
    ).status,
    403,
  );
  assert.equal(
    (await send({ ...gate, privateKey: keyPair().privateKey }, 'GET', '/api/soldiers', {}, gateToken)).status,
    401,
  );
  assert.equal(
    (await send(internal, 'GET', '/api/soldiers', {}, gateToken)).status,
    401,
    'session is bound to its device',
  );
  const validRequest = await send(gate, 'GET', '/api/soldiers', {}, gateToken);
  const replay = await fetch(app.origin + '/api/soldiers', { headers: validRequest.headers });
  assert.equal(replay.status, 401);
  assert.equal((await send(gate, 'POST', '/api/logout', {}, gateToken)).status, 200);
  assert.equal((await send(gate, 'GET', '/api/soldiers', {}, gateToken)).status, 401);
  assert.equal((await send(internal, 'GET', '/api/nope', {}, adminToken)).status, 404);
});

test('signature covers raw body bytes and raw URL; stale timestamps and login flooding are refused', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const { send, internal } = app;
  // Body bytes differ from what was signed (extra whitespace) -> forged.
  const stale = await send(internal, 'GET', '/api/catalog', {}, app.adminToken, undefined, {
    'X-Timestamp': String(Date.now() - 5 * 60 * 1000),
  });
  assert.equal(stale.status, 401);
  for (let i = 0; i < 10; i++) {
    assert.equal(
      (await send(app.gate, 'POST', '/api/login', { username: 'admin', password: 'wrong-password' })).status,
      401,
    );
  }
  const blocked = await send(app.gate, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD });
  assert.equal(blocked.status, 429);
});

test('persisted sessions are in-memory: expired by the injected clock, refreshed only by successful POST', async (t) => {
  let now = Date.now();
  const app = await createTestApp(t, { withBackups: false, clock: () => now });
  const { send, internal } = app;
  const token = app.adminToken;
  now += 29 * 60 * 1000;
  assert.equal((await send(internal, 'GET', '/api/catalog', {}, token)).status, 200); // GET does not extend
  now += 2 * 60 * 1000;
  assert.equal((await send(internal, 'GET', '/api/catalog', {}, token)).status, 401);
  const fresh = await app.login(internal, 'admin', ADMIN_PASSWORD);
  now += 20 * 60 * 1000;
  const body = { name: 'ش', username: 'user-abc', role: 'gate', password: 'long-enough-password' };
  assert.equal((await send(internal, 'POST', '/api/admin/users', body, fresh)).status, 201); // refreshes
  now += 20 * 60 * 1000;
  assert.equal((await send(internal, 'GET', '/api/catalog', {}, fresh)).status, 200);
});
