import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';
import { cell, eachRow, importRows } from '@/common/utils/bulk';
import { listVisitorCategories, nextVisitorBadge } from '@/common/store/lookups';
import { text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

/** Bulk visitor registration from Excel (category by name, badge generated when empty). */
export async function importVisitors(tx: Tx, ctx: Ctx) {
  const rows = importRows(ctx);
  const { store, actor } = ctx;
  const categories = await listVisitorCategories(tx);
  const badges = new Set((await tx.visitor.findMany({ select: { badge_no: true } })).map((v) => v.badge_no));
  const result = await eachRow(rows, async (row) => {
    const categoryName = cell(row, 'categoryName');
    const category = categoryName ? categories.find((c) => c.name === categoryName) : categories[0];
    requireValue(category, 'فئة الزائر غير متاحة');
    const name = text(cell(row, 'name'), 200, true);
    const given = cell(row, 'badgeNo');
    if (given) requireValue(!badges.has(text(given, 20)), 'رقم البطاقة مسجل مسبقًا');
    const badge = given ? text(given, 20, true) : await nextVisitorBadge(tx);
    await tx.visitor.create({
      data: {
        id: randomUUID(),
        name,
        category_id: category.id,
        badge_no: badge,
        phone: text(cell(row, 'phone'), 30),
        national_id: text(cell(row, 'nationalId'), 14),
        organization: text(cell(row, 'organization'), 200),
        notes: text(cell(row, 'notes'), 1000),
        created_at: store.now(),
      },
    });
    badges.add(badge);
  });
  await store.audit(tx, actor, 'visitors.import', ctx.requestId as string);
  return result;
}
