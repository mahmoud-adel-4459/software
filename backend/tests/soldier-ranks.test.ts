import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOLDIER_GRADES, DEFAULT_SOLDIER_RANKS } from '@/modules/settings/soldier-lists';
import { completeSoldierInput } from './soldier.fixture';
import { createTestApp } from './helpers';

test('grade, rank and sub-unit are saved with the soldier and the lists are edited from settings', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const catalog = await app.api('GET', '/api/catalog');
  assert.deepEqual(catalog.soldierGrades, DEFAULT_SOLDIER_GRADES);
  assert.deepEqual(catalog.soldierRanks, DEFAULT_SOLDIER_RANKS);

  const created = await app.api('POST', '/api/soldiers', completeSoldierInput({
    militaryNo: '000777001', nationalId: '30101010101011', name: 'اختبار الرتبة',
    rank: 'مجند', militaryRank: 'رقيب', company: 'الأولى', unit: 'الوحدة', subUnit: 'الفصيلة الثانية',
  }));
  const { soldier } = await app.api('GET', `/api/soldier?id=${created.id}`);
  assert.equal(soldier.rank, 'مجند');
  assert.equal(soldier.military_rank, 'رقيب');
  assert.equal(soldier.sub_unit, 'الفصيلة الثانية');

  const { soldiers } = await app.api('GET', '/api/soldiers?q=000777001');
  assert.equal(soldiers[0].military_rank, 'رقيب');
  assert.equal(soldiers[0].sub_unit, 'الفصيلة الثانية');

  await app.api('POST', '/api/settings', { ...catalog.settings, soldierRanks: ['عسكري', 'رقيب أول'] });
  const after = await app.api('GET', '/api/catalog');
  assert.deepEqual(after.soldierRanks, ['عسكري', 'رقيب أول']);
  assert.deepEqual(after.soldierGrades, DEFAULT_SOLDIER_GRADES, 'a list that was not sent keeps its value');

  const duplicate = await app.send(app.internal, 'POST', '/api/settings', { ...after.settings, soldierGrades: ['مجند', 'مجند'] }, app.adminToken);
  assert.equal(duplicate.status, 400);
});
