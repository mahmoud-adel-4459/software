import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_PASSWORD, createTestApp, newDevice } from './helpers';

test('starts without a license and accepts a new computer with valid credentials', async (t) => {
  const app = await createTestApp(t, { licenseProvider: undefined });
  const device = newDevice('internal');
  const token = await app.login(device, 'admin', ADMIN_PASSWORD);
  const result = await app.send(device, 'GET', '/api/catalog', {}, token);
  assert.equal(result.status, 200);
  const wrongPassword = await app.send(device, 'POST', '/api/login', { username: 'admin', password: 'incorrect-password' });
  assert.equal(wrongPassword.status, 401);
  const copiedId = { ...newDevice('internal'), id: device.id };
  const stolenSession = await app.send(copiedId, 'GET', '/api/catalog', {}, token);
  assert.equal(stolenSession.status, 401);
  const invalidSignature = await app.send(device, 'POST', '/api/login', {}, undefined, undefined, { 'X-Signature': 'invalid' });
  assert.equal(invalidSignature.status, 401);
});
