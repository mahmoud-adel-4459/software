import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestApp } from './helpers';
import { completeSoldierInput } from './soldier.fixture';

test('registration requires all profile fields, images are optional, and saves them atomically', async (t) => {
  const app = await createTestApp(t);
  const send = (data: unknown, requestId = randomUUID()) => app.send(app.internal, 'POST', '/api/soldiers', data, app.adminToken, requestId);
  const data = completeSoldierInput({ militaryNo: '000777888' });
  for (const field of ['name', 'militaryNo', 'nationalId', 'rank', 'company', 'unit', 'phone', 'address']) {
    assert.equal((await send({ ...data, [field]: '  ' })).status, 400, `${field} is required`);
  }
  for (const field of Object.keys(data.details)) {
    assert.equal((await send({ ...data, details: { ...data.details, [field]: '' } })).status, 400, `${field} is required`);
  }
  const invalid = structuredClone(data);
  invalid.photos[3]!.content = Buffer.from('not an image').toString('base64');
  assert.equal((await send(invalid)).status, 400);
  assert.equal(await app.backend.store.prisma.soldier.count(), 0);
  assert.equal(await app.backend.store.prisma.attachment.count(), 0);
  const requestId = randomUUID();
  const created = await send(data, requestId);
  assert.equal(created.status, 201);
  assert.equal((await send(data, requestId)).body.id, created.body.id);
  assert.equal(await app.backend.store.prisma.soldier.count(), 1);
  assert.equal(await app.backend.store.prisma.attachment.count(), 4);

  const update = { ...data, photos: [], id: created.body.id, version: 1, phone: '01111111111' };
  const updated = await app.api('POST', '/api/soldier/update', update);
  assert.equal(updated.version, 2);
  assert.equal(await app.backend.store.prisma.attachment.count(), 4, 'existing images are retained');
  await app.backend.store.prisma.attachment.deleteMany({ where: { soldier_id: created.body.id, kind: 'carnetBack' } });
  await app.api('POST', '/api/soldier/update', { ...update, version: 2, phone: '01222222222' });
  assert.equal((await app.backend.store.prisma.soldier.findUniqueOrThrow({ where: { id: created.body.id } })).phone, '01222222222', 'update without images succeeds');
  await app.api('POST', '/api/soldier/update', { ...update, version: 3, photos: [data.photos[3]] });
  assert.equal(await app.backend.store.prisma.attachment.count(), 4);
  const noPhotos = await send(completeSoldierInput({ militaryNo: '000777999', nationalId: '30101010101099', photos: [] }));
  assert.equal(noPhotos.status, 201, 'images are optional');
});
