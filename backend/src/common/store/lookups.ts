import { fail, requireValue } from '@/common/errors/AppError';
import { identifier } from '@/common/utils/validation';
import type { PrismaClient, Tx } from '@/config/prisma';

type Db = PrismaClient | Tx;

/** Food outlets ordered like the legacy query (kind, sort_order, name). */
export async function listOutlets(db: Db, { includeDisabled = false } = {}) {
  const rows = await db.foodOutlet.findMany({
    select: { id: true, kind: true, name: true, disabled: true, sort_order: true },
    orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
  });
  return includeDisabled ? rows : rows.filter((o) => !o.disabled);
}

export async function listVisitorCategories(db: Db, { includeDisabled = false } = {}) {
  const rows = await db.visitorCategory.findMany({
    select: { id: true, name: true, tier: true, disabled: true, sort_order: true },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  });
  return includeDisabled ? rows : rows.filter((c) => !c.disabled);
}

/** Random 7-character visitor badge (Z + 6 digits) that is not used yet. */
export async function nextVisitorBadge(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const badge = `Z${String(Math.floor(Math.random() * 900000) + 100000)}`;
    if (!(await tx.visitor.findUnique({ where: { badge_no: badge }, select: { id: true } }))) return badge;
  }
  return fail('تعذر إنشاء رقم بطاقة الزائر');
}

/** Loads the soldier inside a write transaction (writers are serialised); 404 when missing. */
export async function lockSoldier(tx: Tx, id: unknown) {
  const row = await tx.soldier.findUnique({ where: { id: identifier(id) } });
  requireValue(row, 'العسكري غير موجود', 404);
  return row;
}

/** Same as lockSoldier but refuses archived files. */
export async function lockActiveSoldier(tx: Tx, id: unknown) {
  const row = await lockSoldier(tx, id);
  requireValue(!row.archived, 'ملف العسكري مؤرشف', 409);
  return row;
}
