import assert from 'node:assert/strict';
import test from 'node:test';
import { completeSoldierInput } from './soldier.fixture';
import { ADMIN_PASSWORD, createTestApp } from './helpers';

test('the administrator-set minimum time between exit and return is enforced on both movements', async (t) => {
  let now = Date.now();
  const app = await createTestApp(t, { withBackups: false, clock: () => now });
  const soldier = await app.api('POST', '/api/soldiers', completeSoldierInput({
    militaryNo: '000555001', nationalId: '30101010101011', name: 'اختبار المدة', rank: 'مجند', company: 'الأولى', unit: 'الوحدة',
  }));
  const catalog = await app.api('GET', '/api/catalog');
  assert.equal(catalog.gateMinMinutes, 0, 'off until the administrator sets it');
  await app.api('POST', '/api/settings', { ...catalog.settings, gateMinMinutes: 180 });
  assert.equal((await app.api('GET', '/api/catalog')).gateMinMinutes, 180);

  const exit = (hours: number) => app.send(app.internal, 'POST', '/api/gate', {
    soldierId: soldier.id, kind: 'exit', reason: 'إجازة', notes: '', expectedReturn: new Date(now + hours * 3600000).toISOString(),
  }, app.adminToken);
  const tooSoon = await exit(1);
  assert.equal(tooSoon.status, 400);
  assert.match(tooSoon.body.error, /3 ساعات/);
  assert.equal((await exit(4)).status, 201);

  // Sessions expire on the injected clock, so sign in again after each jump in time.
  const entry = async () => {
    const { token } = (await app.send(app.internal, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD })).body;
    return app.send(app.internal, 'POST', '/api/gate', { soldierId: soldier.id, kind: 'entry', notes: '' }, token);
  };
  now += 2 * 3600000;
  const early = await entry();
  assert.equal(early.status, 409);
  assert.match(early.body.error, /مضى ساعتين فقط/);
  now += 3600000;
  assert.equal((await entry()).status, 201);

  const { token } = (await app.send(app.internal, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD })).body;
  const fresh = (await app.send(app.internal, 'GET', '/api/catalog', {}, token)).body;
  const invalid = await app.send(app.internal, 'POST', '/api/settings', { ...fresh.settings, gateMinMinutes: -5 }, token);
  assert.equal(invalid.status, 400);
});
