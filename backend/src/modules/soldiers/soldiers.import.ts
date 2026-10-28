import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';
import { cell, eachRow, importRows } from '@/common/utils/bulk';
import { DETAIL_FIELD_KEYS } from '@/common/utils/catalog';
import type { Tx } from '@/config/prisma';
import { newSoldierInput, soldierPhotos } from './soldiers.validator';
import { addAttachment } from './attachments.service';

const FIELDS = ['name', 'militaryNo', 'nationalId', 'rank', 'militaryRank', 'company', 'unit', 'subUnit', 'phone', 'address'];

/** Bulk soldier registration from Excel; existing military numbers are skipped. */
export async function importSoldiers(tx: Tx, ctx: Ctx) {
  const rows = importRows(ctx);
  const { store, actor } = ctx;
  const known = new Set((await tx.soldier.findMany({ select: { military_no: true } })).map((s) => s.military_no));
  const result = await eachRow(rows, async (row) => {
    const data: Record<string, unknown> = Object.fromEntries(FIELDS.map((k) => [k, cell(row, k)]));
    data.details = Object.fromEntries(DETAIL_FIELD_KEYS.map((k) => [k, cell(row, k)]));
    const soldier = newSoldierInput(data);
    const photos = soldierPhotos(row.photos);
    requireValue(!known.has(soldier.militaryNo), 'الرقم العسكري مسجل مسبقًا');
    const created = await tx.soldier.create({
      data: {
        id: randomUUID(),
        military_no: soldier.militaryNo,
        national_id: soldier.nationalId,
        name: soldier.name,
        rank: soldier.rank,
        military_rank: soldier.militaryRank,
        company: soldier.company,
        unit: soldier.unit,
        sub_unit: soldier.subUnit,
        phone: soldier.phone,
        address: soldier.address,
        details: soldier.details,
        created_at: store.now(),
      },
    });
    for (const photo of photos) await addAttachment(tx, { ...photo, soldierId: created.id });
    known.add(soldier.militaryNo);
  });
  await store.audit(tx, actor, 'soldiers.import', ctx.requestId as string);
  return result;
}
