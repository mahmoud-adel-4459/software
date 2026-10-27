import assert from 'node:assert/strict';
import test from 'node:test';
import { cairoDate } from '@/common/utils/time';
import { DEFAULT_FITNESS_STANDARDS, fitnessScore, gradeFor, DEFAULT_GRADE_SCALE } from '@/modules/settings/unit-policy';
import { completeSoldierInput } from './soldier.fixture';
import { createTestApp } from './helpers';

test('fitness percentage: repetitions up, times down, capped at 100, unscored when the unit differs', () => {
  const s = DEFAULT_FITNESS_STANDARDS;
  assert.equal(fitnessScore(s, 'ضغط', 'مرة', 55), 100);
  assert.equal(fitnessScore(s, 'ضغط', 'مرة', 44), 80);
  assert.equal(fitnessScore(s, 'ضغط', 'مرة', 70), 100);
  assert.equal(fitnessScore(s, 'جري معدل', 'ثانية', 50), 90);
  assert.equal(fitnessScore(s, 'جري معدل', 'ثانية', 40), 100);
  assert.equal(fitnessScore(s, 'جري 3 كم', 'ثانية', 700), null, 'a test that is not in Settings');
  assert.equal(fitnessScore(s, 'جري الضاحية 3 كم', 'ثانية', 700), null, 'old results in another unit');
  assert.equal(gradeFor(DEFAULT_GRADE_SCALE, 92), 'ممتاز');
  assert.equal(gradeFor(DEFAULT_GRADE_SCALE, 80), 'جيد جدًا');
  assert.equal(gradeFor(DEFAULT_GRADE_SCALE, 49.9), 'ضعيف');
  assert.equal(gradeFor(DEFAULT_GRADE_SCALE, null), null);
});

test('soldier evaluation, leave times, editable standards and the monthly report', async (t) => {
  const app = await createTestApp(t, { withBackups: false });
  const { id } = await app.api('POST', '/api/soldiers', completeSoldierInput({
    militaryNo: '000444001', nationalId: '30101010101011', name: 'اختبار التقييم', rank: 'مجند', company: 'الأولى', unit: 'الوحدة',
  }));
  const today = cairoDate();
  await app.api('POST', '/api/fitness', { soldierId: id, type: 'ضغط', value: 44, date: today, notes: '' });
  await app.api('POST', '/api/fitness', { soldierId: id, type: 'جري معدل', value: 50, date: today, notes: '' });
  const records = (await app.api('GET', `/api/fitness?soldierId=${id}`)).records;
  assert.deepEqual(records.map((r: { score: number }) => r.score).sort(), [80, 90]);

  let evaluation = await app.api('GET', `/api/soldier/evaluation?soldierId=${id}`);
  assert.equal(evaluation.average, 85);
  assert.equal(evaluation.testedCount, 2);
  assert.equal(evaluation.suggestedGrade, 'جيد جدًا');
  assert.equal(evaluation.finalGrade, null);

  await app.api('POST', '/api/soldier/records', { soldierId: id, category: 'evaluation', title: 'ممتاز', recordDate: today, details: 'قرار القائد' });
  evaluation = await app.api('GET', `/api/soldier/evaluation?soldierId=${id}`);
  assert.equal(evaluation.finalGrade.grade, 'ممتاز');

  const leave = await app.api('POST', '/api/soldier/records', {
    soldierId: id, category: 'leave', title: 'إجازة اعتيادية', recordDate: '2026-11-01', startTime: '08:00', endDate: '2026-11-05', endTime: '18:30',
  });
  assert.equal(leave.start_time, '08:00');
  assert.equal(leave.end_time, '18:30');
  const badLeave = await app.send(app.internal, 'POST', '/api/soldier/records', {
    soldierId: id, category: 'leave', title: 'خطأ', recordDate: '2026-11-01', startTime: '10:00', endDate: '2026-11-01', endTime: '09:00',
  }, app.adminToken);
  assert.equal(badLeave.status, 400);
  await app.api('POST', '/api/soldier/records', { soldierId: id, category: 'security_scan', title: 'مسح أمني دوري', recordDate: today });

  const catalog = await app.api('GET', '/api/catalog');
  assert.equal(catalog.fitnessStandards.length, 6);
  await app.api('POST', '/api/settings', {
    ...catalog.settings,
    fitnessStandards: [...catalog.fitnessStandards, { name: 'سباحة', unit: 'متر', target: 400, better: 'higher' }],
    gradeScale: [{ label: 'ممتاز', min: 95 }, { label: 'جيد', min: 60 }],
  });
  const after = await app.api('GET', '/api/catalog');
  assert.equal(after.fitnessTypes['سباحة'], 'متر');
  assert.equal((await app.api('GET', `/api/soldier/evaluation?soldierId=${id}`)).suggestedGrade, 'جيد');
  const unknown = await app.send(app.internal, 'POST', '/api/fitness', { soldierId: id, type: 'غير معرف', value: 1, date: today }, app.adminToken);
  assert.equal(unknown.status, 400);

  const month = await app.api('GET', `/api/reports/daily?date=${today}&period=month`);
  assert.equal(month.period, 'month');
  assert.equal(month.from, `${today.slice(0, 7)}-01`);
  assert.equal(month.activity.fitness.records, 2);
  assert.equal(month.activity.personnel.evaluation, 1);
  assert.equal(month.activity.personnel.security_scan, 1);
  assert.ok(month.activity.gateTimeline.length >= 28);
  const year = await app.api('GET', `/api/reports/daily?date=${today}&period=year`);
  assert.equal(year.activity.gateTimeline.length, 12);
  assert.equal(year.to, `${today.slice(0, 4)}-12-31`);
});
