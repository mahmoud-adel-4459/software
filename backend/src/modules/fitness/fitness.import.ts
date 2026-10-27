import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';
import { cell, eachRow, importRows } from '@/common/utils/bulk';
import { date, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { dateOnly, fitnessStandards, standardFor } from './fitness.service';

/** Bulk fitness results from Excel (soldier by military number). */
export async function importFitness(tx: Tx, ctx: Ctx) {
  const rows = importRows(ctx);
  const { store, actor } = ctx;
  const soldiers = new Map(
    (await tx.soldier.findMany({ select: { id: true, military_no: true, archived: true } })).map((s) => [
      s.military_no,
      s,
    ]),
  );
  const standards = await fitnessStandards(tx);
  const result = await eachRow(rows, async (row) => {
    const soldier = soldiers.get(cell(row, 'militaryNo'));
    requireValue(soldier, 'الرقم العسكري غير مسجل');
    requireValue(!soldier.archived, 'ملف العسكري مؤرشف');
    const standard = standardFor(standards, cell(row, 'type'));
    const raw = cell(row, 'value');
    const value = Number(raw);
    requireValue(raw !== '' && Number.isFinite(value) && value >= 0 && value <= 100000, 'نتيجة غير صالحة');
    await tx.fitnessRecord.create({
      data: {
        id: randomUUID(),
        soldier_id: soldier.id,
        type: standard.name,
        value,
        unit: standard.unit,
        date: dateOnly(date(cell(row, 'date'))),
        notes: text(cell(row, 'notes'), 1000),
        created_by: actor.user.id,
      },
    });
  });
  await store.audit(tx, actor, 'fitness.import', ctx.requestId as string);
  return result;
}
