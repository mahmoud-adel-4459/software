import assert from 'node:assert/strict';
import test from 'node:test';
import { REPORT_IDS, catalogForClient, summarizeReport } from '@/common/utils/reports';

test('report catalog lists six types for admin and two for clerk', () => {
  assert.equal(catalogForClient('admin').length, REPORT_IDS.length);
  assert.deepEqual(
    catalogForClient('clerk').map((r) => r.id),
    ['canteen', 'buffet'],
  );
});

test('report summary aggregates gate and canteen rows', () => {
  const gate = summarizeReport('gate', [{ kind: 'exit' }, { kind: 'entry', correction_reason: 'خطأ' }]);
  assert.equal(gate.entries, 1);
  assert.equal(gate.exits, 1);
  assert.equal(gate.corrected, 1);
  const canteen = summarizeReport('canteen', [
    { amount_cents: 500, reversal_of: null },
    { amount_cents: -500, reversal_of: 'x' },
  ]);
  assert.equal(canteen.totalCents, 0);
  assert.equal(canteen.reversals, 1);
});
