import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';
import { DEFAULT_CANTEEN_OUTLET } from '@/common/utils/catalog';
import { cell, eachRow, importRows } from '@/common/utils/bulk';
import { dayStart } from '@/common/utils/time';
import { date, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

/** Bulk purchases from Excel: soldier by military number, outlet by name, amount in EGP. */
export async function importCanteen(tx: Tx, ctx: Ctx) {
  const rows = importRows(ctx);
  const { store, actor } = ctx;
  const soldiers = new Map(
    (await tx.soldier.findMany({ select: { id: true, military_no: true, archived: true } })).map((s) => [
      s.military_no,
      s,
    ]),
  );
  const outlets = await tx.foodOutlet.findMany({ where: { disabled: false }, select: { id: true, name: true } });
  const result = await eachRow(rows, async (row) => {
    const soldier = soldiers.get(cell(row, 'militaryNo'));
    requireValue(soldier, 'الرقم العسكري غير مسجل');
    requireValue(!soldier.archived, 'ملف العسكري مؤرشف');
    const outletName = cell(row, 'outletName');
    const outlet = outlets.find((o) => (outletName ? o.name === outletName : o.id === DEFAULT_CANTEEN_OUTLET));
    requireValue(outlet, 'نقطة البيع غير متاحة');
    const amount = Number(cell(row, 'amount'));
    requireValue(Number.isFinite(amount) && amount > 0 && amount <= 1000000, 'المبلغ غير صالح');
    const day = cell(row, 'date');
    const at = day ? new Date(Date.parse(dayStart(date(day))) + 12 * 3600000) : store.now();
    await tx.canteenTransaction.create({
      data: {
        id: randomUUID(),
        soldier_id: soldier.id,
        outlet_id: outlet.id,
        amount_cents: Math.round(amount * 100),
        notes: text(cell(row, 'notes'), 1000),
        at,
        created_by: actor.user.id,
      },
    });
  });
  await store.audit(tx, actor, 'canteen.import', ctx.requestId as string);
  return result;
}
