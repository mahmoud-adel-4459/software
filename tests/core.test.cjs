'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { newDb } = require('pg-mem');
const { keyPair, fingerprint, sign, requestMessage, hashPassword, checkPassword } = require('../shared/crypto.cjs');
const { loadLicense } = require('../server/licensing.cjs');
const { createHandler } = require('../server/api.cjs');
const { Store } = require('../server/store.cjs');
const { validateServer } = require('../desktop/transport.cjs');

function fixtureLicense() {
  const issuer = keyPair();
  const clients = ['internal', 'gate'].map(kind => ({ id: randomUUID(), kind, ...keyPair() }));
  const serverId = randomUUID();
  const payload = JSON.stringify({ version: 1, installation: 'وحدة اختبار', serverId,
    devices: clients.map(({ privateKey, ...d }) => ({ ...d, fingerprint: fingerprint(d.publicKey) })) });
  const envelope = { payload, signature: sign(issuer.privateKey, payload) };
  return { issuer, clients, serverId, envelope, license: loadLicense(issuer.publicKey, envelope, serverId) };
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
  assert.throws(() => loadLicense(f.issuer.publicKey, { ...f.envelope, payload: f.envelope.payload.replace('gate', 'internal') }, f.serverId));
  assert.throws(() => loadLicense(f.issuer.publicKey, f.envelope, randomUUID()));
  assert.throws(() => loadLicense(keyPair().publicKey, f.envelope, f.serverId));
  assert.throws(() => loadLicense(f.issuer.publicKey, f.envelope, f.serverId,'a'.repeat(64)),/Windows Server/);
});

test('connection settings require an HTTPS server origin without credentials', () => {
  assert.equal(validateServer('https://server.local:8443/'), 'https://server.local:8443');
  for (const bad of ['http://server.local', 'https://user:pass@server.local', 'https://server.local/api', 'https://server.local/#x']) {
    assert.throws(() => validateServer(bad));
  }
});

test('signed API flow: device restriction, personal-data filtering, gate cycle, retry and forgery rejection', async t => {
  const f = fixtureLicense();
  const db = newDb();
  // Test adapter only. Real PostgreSQL exercises locking and rollback separately.
  db.public.registerFunction({ name: 'hashtext', args: ['text'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock', args: ['integer'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock_shared', args: ['integer'], returns: 'integer', implementation: () => 1 });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const store = new Store(pool); await store.migrate();
  const userId = randomUUID();
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [userId, 'admin', 'مسؤول اختبار', await hashPassword('test-password-long'), 'admin']);
  const server = http.createServer(createHandler({ store, licenseProvider: () => f.license }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const address = `http://127.0.0.1:${server.address().port}`;
  async function send(device, method, apiPath, data = {}, token, requestId, override = {}) {
    const body = method === 'GET' ? '' : JSON.stringify(data);
    const timestamp = String(Date.now()); const nonce = randomUUID();
    const headers = { 'Content-Type': 'application/json', 'X-Device-Id': device.id, 'X-Timestamp': timestamp, 'X-Nonce': nonce,
      'X-Signature': sign(device.privateKey, requestMessage({ deviceId: device.id, timestamp, nonce, method, path: apiPath, body })), ...override };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (requestId) headers['X-Request-Id'] = requestId;
    const response = await fetch(address + apiPath, { method, headers, body: method === 'GET' ? undefined : body });
    return { status: response.status, body: await response.json(), headers };
  }
  const [internal, gate] = f.clients;
  const internalLogin = await send(internal, 'POST', '/api/login', { username: 'admin', password: 'test-password-long' });
  assert.equal(internalLogin.status, 200);
  assert.equal(internalLogin.body.kind, 'internal');
  const gateLogin = await send(gate, 'POST', '/api/login', { username: 'admin', password: 'test-password-long' });
  assert.equal(gateLogin.body.kind, 'gate');
  const adminToken = internalLogin.body.token; const gateToken = gateLogin.body.token;
  const payload = { name: 'أحمد محمد علي حسن', militaryNo: '202610001', nationalId: '30101010101011', rank: 'جندي', company: 'الأولى', unit: 'وحدة اختبار', phone: '01000000000', address: 'عنوان خاص' };
  const forbidden = await send(gate, 'POST', '/api/soldiers', payload, gateToken, randomUUID());
  assert.equal(forbidden.status, 403, 'admin user on gate device must still be restricted');
  assert.equal((await send(gate, 'GET', '/api/admin/users', {}, gateToken)).status, 403);
  const createId = randomUUID();
  const created = await send(internal, 'POST', '/api/soldiers', payload, adminToken, createId);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const retried = await send(internal, 'POST', '/api/soldiers', payload, adminToken, createId);
  assert.deepEqual(retried.body, created.body);
  const gateList = await send(gate, 'GET', '/api/soldiers', {}, gateToken);
  assert.equal(gateList.body.soldiers.length, 1);
  for (const name of ['national_id', 'phone', 'address', 'password_hash']) assert.equal(name in gateList.body.soldiers[0], false);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].national_id, payload.nationalId);
  assert.equal((await send(internal, 'POST', '/api/soldiers', { ...payload, name: 'تغيير' }, adminToken, createId)).status, 409);
  const movement = { kind: 'exit', soldierId: created.body.id, reason: 'إجازة', expectedReturn: new Date(Date.now() + 86400000).toISOString(), notes: '' };
  assert.equal((await send(gate, 'POST', '/api/gate', { ...movement, expectedReturn: new Date(Date.now() - 60000).toISOString() }, gateToken, randomUUID())).status, 400);
  const movementId = randomUUID();
  const exited = await send(gate, 'POST', '/api/gate', movement, gateToken, movementId);
  assert.equal(exited.status, 201, JSON.stringify(exited.body));
  assert.equal((await send(gate, 'POST', '/api/gate', movement, gateToken, movementId)).body.id, exited.body.id);
  assert.equal((await send(gate, 'POST', '/api/gate', movement, gateToken, randomUUID())).status, 409);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].status, 'out');
  assert.equal((await send(gate, 'POST', '/api/gate', { kind: 'entry', soldierId: created.body.id, notes: '' }, gateToken, randomUUID())).status, 201);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, adminToken)).body.soldiers[0].status, 'in');
  const log = await pool.query('SELECT * FROM audit_log'); assert.equal(log.rows.length, 3);
  const gateAccount = { username: 'gate-operator', name: 'عامل البوابة', role: 'gate', password: 'gate-operator-password' };
  assert.equal((await send(gate, 'POST', '/api/admin/users', gateAccount, gateToken, randomUUID())).status, 403);
  const newUser = await send(internal, 'POST', '/api/admin/users', gateAccount, adminToken, randomUUID());
  assert.equal(newUser.status, 201, JSON.stringify(newUser.body));
  assert.equal('password_hash' in newUser.body, false);
  const lowPrivilege = await send(internal, 'POST', '/api/login', { username: gateAccount.username, password: gateAccount.password });
  assert.equal(lowPrivilege.body.user.role, 'gate');
  assert.equal((await send(internal, 'GET', '/api/admin/users', {}, lowPrivilege.body.token)).status, 403);
  const operatorGate = await send(gate, 'POST', '/api/login', { username: gateAccount.username, password: gateAccount.password });
  const gateSoldiers = (await send(gate, 'GET', '/api/soldiers', {}, operatorGate.body.token)).body.soldiers;
  assert.ok(gateSoldiers.length > 0);
  assert.equal('national_id' in gateSoldiers[0], false);
  assert.equal((await send({ id: randomUUID(), ...keyPair() }, 'POST', '/api/login', { username: 'admin', password: 'test-password-long' })).status, 403);
  assert.equal((await send({ ...gate, privateKey: keyPair().privateKey }, 'GET', '/api/soldiers', {}, gateToken)).status, 401);
  assert.equal((await send(internal, 'GET', '/api/soldiers', {}, gateToken)).status, 401, 'session is bound to its device');
  const validRequest = await send(gate, 'GET', '/api/soldiers', {}, gateToken);
  const replay = await fetch(address + '/api/soldiers', { headers: validRequest.headers }); assert.equal(replay.status, 401);
  assert.equal((await send(gate, 'POST', '/api/logout', {}, gateToken)).status, 200);
  assert.equal((await send(gate, 'GET', '/api/soldiers', {}, gateToken)).status, 401);
});
