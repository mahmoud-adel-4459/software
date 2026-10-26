import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApp } from './helpers';

test('all exit reasons can be replaced and removed, persist, and survive unrelated settings saves', async t => {
  const app = await createTestApp(t, { withBackups: false });
  const original = await app.api('GET', '/api/catalog');
  assert.ok(original.exitReasons.includes('مكتب قائد القوات'));
  const reasons = ['سبب جديد', 'سبب معدل', 'سبب ثالث', 'سبب رابع'];
  await app.api('POST', '/api/settings', { ...original.settings, exitReasons: reasons });
  let current = await app.api('GET', '/api/catalog');
  assert.deepEqual(current.exitReasons, reasons);
  assert.ok(!current.exitReasons.includes('إجازة اعتيادية'));
  const gateToken = await app.login(app.gate, 'admin', 'test-password-long');
  assert.deepEqual((await app.send(app.gate, 'GET', '/api/catalog', {}, gateToken)).body.exitReasons, reasons);
  const { exitReasons: _reasons, ...otherSettings } = current.settings;
  await app.api('POST', '/api/settings', { ...otherSettings, unitName: 'تغيير اسم الوحدة' });
  current = await app.api('GET', '/api/catalog');
  assert.deepEqual(current.exitReasons, reasons);
  for (const exitReasons of [['مكرر', ' مكرر '], [''], 'invalid', ['a'.repeat(101)]]) {
    assert.equal((await app.send(app.internal, 'POST', '/api/settings', { ...current.settings, exitReasons }, app.adminToken)).status, 400);
  }
  await app.api('POST', '/api/settings', { ...current.settings, exitReasons: [] });
  assert.deepEqual((await app.api('GET', '/api/catalog')).exitReasons, []);
  await app.backend.database.close();
  await app.backend.database.reopen();
  assert.deepEqual((await app.api('GET', '/api/catalog')).exitReasons, []);
});
