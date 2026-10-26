import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EXIT_REASONS } from '@/common/utils/catalog';
import { createTestApp } from './helpers';

test('all 24 gate reasons support repeated exit and entry with separate dates and notes', async t => {
  const app = await createTestApp(t, { withBackups: false });
  const soldier = await app.api('POST', '/api/soldiers', completeSoldierInput({ militaryNo: '000123456', nationalId: '30101010101011',
    name: 'اختبار حركات متكررة', rank: 'جندي', company: 'الأولى', unit: 'الوحدة' }));
  assert.equal(EXIT_REASONS.length, 24);
  const ids = new Set();
  for (const reason of EXIT_REASONS) {
    for (let cycle = 1; cycle <= 2; cycle++) {
      const notes = `${reason} — خروج ${cycle}`;
      const entryNotes = `${reason} — دخول ${cycle}`;
      const permit = await app.api('POST', '/api/gate', { soldierId: soldier.id, kind: 'exit', reason, notes,
        expectedReturn: new Date(Date.now() + 3600000).toISOString() });
      ids.add(permit.id);
      await app.api('POST', '/api/gate', { soldierId: soldier.id, kind: 'entry', notes: entryNotes });
      const saved = await app.api('GET', `/api/permit?id=${permit.id}`);
      assert.equal(saved.reason, reason);
      assert.equal(saved.notes, notes);
      assert.equal(saved.entry_notes, entryNotes);
      assert.ok(Date.parse(saved.returned_at) >= Date.parse(saved.exit_at));
    }
  }
  assert.equal(ids.size, 48);
  assert.equal(await app.backend.store.prisma.gateEvent.count(), 96);
  const permits = (await app.api('GET', '/api/permits')).permits;
  assert.equal(permits.length, 48);
  assert.ok(permits.every((p: { returned_at: string; notes: string; entry_notes: string }) => p.returned_at && p.notes && p.entry_notes));
});
