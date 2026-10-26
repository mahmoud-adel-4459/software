import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApp } from './helpers';

test('memo signatures and formation survive ordinary unit-setting saves', async (t) => {
  const { api } = await createTestApp(t);
  const original = (await api('GET', '/api/catalog')).settings;
  await api('POST', '/api/settings', { ...original, memoFormation: 'قيادة الاختبار', memoUnitLine: 'كتيبة الاختبار', memoRightName: 'الموقّع الأول', memoRightRank: 'نقيب', memoRightRole: 'ضابط الأمن', memoLeftName: 'الموقّع الثاني', memoLeftRank: 'مقدم', memoLeftRole: 'قائد الكتيبة' });
  const saved = (await api('GET', '/api/catalog')).settings;
  assert.equal(saved.memoRightName, 'الموقّع الأول');
  const ordinary = { ...saved, unitName: 'الوحدة الجديدة' };
  for (const key of Object.keys(ordinary)) if (key.startsWith('memo')) delete ordinary[key];
  await api('POST', '/api/settings', ordinary);
  const preserved = (await api('GET', '/api/catalog')).settings;
  assert.equal(preserved.memoFormation, 'قيادة الاختبار');
  assert.equal(preserved.memoLeftName, 'الموقّع الثاني');
  await assert.rejects(api('POST', '/api/settings', { ...preserved, memoRightName: 'x'.repeat(151) }));
});
