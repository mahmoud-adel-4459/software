import assert from 'node:assert/strict';
import test from 'node:test';
import { cairoDate } from '@/common/utils/time';
import { completeSoldierInput } from './soldier.fixture';
import { ADMIN_PASSWORD, createTestApp } from './helpers';

type Report = {
  subject: { label: string }; days: number; previous: { from: string } | null; topics: string[];
  summary: { label: string; value: unknown }[];
  exceptions: { title: string; rows: unknown[] }[];
  profile: { rows: { field: string; value: string }[] } | null;
  sections: { id: string; kpis: { label: string; value: unknown; previous?: unknown }[]; tables: { title: string; rows: Record<string, unknown>[] }[] }[];
};

test('analytic report: soldier, company and unit subjects with analysis, comparison and exceptions', async (t) => {
  let now = Date.now();
  const app = await createTestApp(t, { withBackups: false, clock: () => now });
  const make = (n: number, company: string) => app.api('POST', '/api/soldiers', completeSoldierInput({
    militaryNo: `00088800${n}`, nationalId: `3010101010101${n}`, name: `عسكري ${n}`, rank: 'مجند', militaryRank: 'عريف', company, unit: 'الوحدة',
  }));
  const a = await make(1, 'الأولى');
  const b = await make(2, 'الثانية');
  const today = cairoDate(new Date(now));

  await app.api('POST', '/api/gate', { soldierId: a.id, kind: 'exit', reason: 'إجازة', notes: '', expectedReturn: new Date(now + 3600000).toISOString() });
  now += 2 * 3600000; // returns one hour late
  const { token } = (await app.send(app.internal, 'POST', '/api/login', { username: 'admin', password: ADMIN_PASSWORD })).body;
  const api = async (method: 'GET' | 'POST', path: string, data: unknown = {}) => {
    const res = await app.send(app.internal, method, path, data, token);
    assert.ok(res.status < 300, `${path}: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  await api('POST', '/api/gate', { soldierId: a.id, kind: 'entry', notes: '' });
  const catalog = await api('GET', '/api/catalog');
  await api('POST', '/api/canteen', { soldierId: a.id, outletId: catalog.outlets.canteen[0].id, amountCents: 2550, notes: '' });
  await api('POST', '/api/canteen', { soldierId: b.id, outletId: catalog.outlets.canteen[0].id, amountCents: 1000, notes: '' });
  await api('POST', '/api/fitness', { soldierId: a.id, type: 'ضغط', value: 55, date: today, notes: '' });
  await api('POST', '/api/fitness', { soldierId: b.id, type: 'ضغط', value: 11, date: today, notes: '' });
  await api('POST', '/api/soldier/records', { soldierId: a.id, category: 'leave', title: 'اعتيادية', recordDate: today, startTime: '08:00', endDate: today, endTime: '20:00' });
  for (const title of ['تأخير', 'غياب']) await api('POST', '/api/soldier/records', { soldierId: b.id, category: 'penalty', title, recordDate: today });

  const soldier: Report = await api('GET', `/api/reports/build?subject=soldier&soldierId=${a.id}&from=${today}&to=${today}&compare=1`);
  assert.match(soldier.subject.label, /عريف \/ عسكري 1/);
  assert.ok(soldier.profile!.rows.some((r) => r.field === 'الرتبة' && r.value === 'عريف'));
  assert.ok(!soldier.topics.includes('visitors') && !soldier.topics.includes('roster'));
  const gate = soldier.sections.find((s) => s.id === 'gate')!;
  assert.deepEqual(gate.kpis.slice(0, 4).map((k) => k.value), [1, 1, 0, 1]);
  assert.equal(gate.kpis[0]!.previous, 0, 'compared with the previous day');
  assert.equal(soldier.sections.find((s) => s.id === 'canteen')!.kpis[0]!.value, 25.5);
  assert.equal(soldier.sections.find((s) => s.id === 'fitness')!.kpis[1]!.value, 100);
  assert.equal(soldier.sections.find((s) => s.id === 'leave')!.kpis[1]!.value, 1);
  assert.ok(soldier.exceptions.some((e) => e.title === 'متأخرون عن موعد العودة'));
  assert.equal(soldier.previous?.from, new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10));

  const company: Report = await api('GET', `/api/reports/build?subject=company&company=${encodeURIComponent('الثانية')}&from=${today}&to=${today}&topics=penalty,fitness,roster`);
  assert.deepEqual(company.topics, ['penalty', 'fitness', 'roster']);
  assert.equal(company.sections.find((s) => s.id === 'roster')!.kpis[0]!.value, 1);
  assert.ok(company.exceptions.some((e) => e.title === 'جزاءات متكررة في الفترة'));
  assert.ok(company.exceptions.some((e) => e.title.startsWith('نتائج لياقة أقل من')));

  const unit: Report = await api('GET', `/api/reports/build?subject=unit&from=${today.slice(0, 7)}-01&to=${today}`);
  assert.equal(unit.sections.length, 13);
  const canteen = unit.sections.find((s) => s.id === 'canteen')!;
  assert.equal(canteen.kpis[0]!.value, 35.5);
  assert.equal(canteen.tables.find((t) => t.title === 'الأعلى إنفاقًا')!.rows[0]!.name, 'عسكري 1 (000888001)');
  assert.ok(unit.summary.length >= 13);

  const bad = await app.send(app.internal, 'GET', `/api/reports/build?subject=unit&topics=nothing`, {}, token);
  assert.equal(bad.status, 400);
  const reversed = await app.send(app.internal, 'GET', `/api/reports/build?subject=unit&from=2026-10-10&to=2026-10-01`, {}, token);
  assert.equal(reversed.status, 400);
});
