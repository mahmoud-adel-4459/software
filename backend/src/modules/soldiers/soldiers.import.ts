import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';
import { cell, eachRow, importRows } from '@/common/utils/bulk';
import { DETAIL_FIELD_KEYS } from '@/common/utils/catalog';
import type { Tx } from '@/config/prisma';
import { newSoldierInput } from './soldiers.validator';

const FIELDS = ['name', 'militaryNo', 'nationalId', 'rank', 'company', 'unit', 'phone', 'address'];

/** Bulk soldier registration from Excel; existing military numbers are skipped. */
export async function importSoldiers(tx: Tx, ctx: Ctx) {
  const rows = importRows(ctx);
  const { store, actor } = ctx;
  const known = new Set((await tx.soldier.findMany({ select: { military_no: true } })).map((s) => s.military_no));
  const result = await eachRow(rows, async (row) => {
    const data: Record<string, unknown> = Object.fromEntries(FIELDS.map((k) => [k, cell(row, k)]));
    data.details = Object.fromEntries(DETAIL_FIELD_KEYS.map((k) => [k, cell(row, k)]));
    const soldier = newSoldierInput(data);
    requireValue(!known.has(soldier.militaryNo), 'الرقم العسكري مسجل مسبقًا');
    await tx.soldier.create({
      data: {
        id: randomUUID(),
        military_no: soldier.militaryNo,
        national_id: soldier.nationalId,
        name: soldier.name,
        rank: soldier.rank,
        company: soldier.company,
        unit: soldier.unit,
        phone: soldier.phone,
        address: soldier.address,
        details: soldier.details,
        created_at: store.now(),
      },
    });
    known.add(soldier.militaryNo);
  });
  await store.audit(tx, actor, 'soldiers.import', ctx.requestId as string);
  return result;
}
