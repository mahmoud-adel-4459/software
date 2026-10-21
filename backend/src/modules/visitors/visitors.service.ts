import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { nextVisitorBadge } from '@/common/store/lookups';
import { identifier, isUuid, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

const TIERS = ['normal', 'special', 'admin'];

export interface VisitorMovement {
  visitorId: string;
  action: 'in' | 'out';
  purpose: string;
  notes: string;
}

export function prepareVisitorMovement(data: Input): VisitorMovement {
  requireValue(
    isUuid(data.visitorId || '') && (data.action === 'in' || data.action === 'out'),
    'بيانات زائر غير صحيحة',
  );
  return {
    visitorId: data.visitorId as string,
    action: data.action,
    purpose: data.action === 'in' ? text(data.purpose, 500, true) : '',
    notes: text(data.notes || '', 1000),
  };
}

type VisitorWithCategory = {
  id: string;
  name: string;
  badge_no: string;
  phone: string;
  national_id: string;
  organization: string;
  notes: string;
  disabled: boolean;
  category: { id: string; name: string; tier: string; disabled: boolean };
};

const flatten = ({ category, ...v }: VisitorWithCategory) => ({
  id: v.id,
  name: v.name,
  badge_no: v.badge_no,
  phone: v.phone,
  national_id: v.national_id,
  organization: v.organization,
  notes: v.notes,
  disabled: v.disabled,
  category_id: category.id,
  category_name: category.name,
  category_tier: category.tier,
  category_disabled: category.disabled,
});

/** Visitor + open visit for the gate screen (by QR id or badge number). */
export async function findVisitorForGate(ctx: Ctx) {
  const id = param(ctx, 'id');
  const prisma = ctx.store.prisma;
  const where = id ? { id: identifier(id) } : { badge_no: text(param(ctx, 'badge') || '', 20, true) };
  const found = await prisma.visitor.findUnique({ where, include: { category: true } });
  const row = found && flatten(found);
  requireValue(row && !row.disabled, 'لا يوجد زائر بهذا الرمز', 404);
  requireValue(!row.category_disabled, 'فئة الزائر معطلة', 409);
  const openVisit = await prisma.visitorVisit.findFirst({
    where: { visitor_id: row.id, check_out: null, voided: false },
    select: { id: true, purpose: true, check_in: true },
    orderBy: { check_in: 'desc' },
  });
  return { visitor: row, openVisit };
}

export async function listVisitors(ctx: Ctx) {
  const q = text(param(ctx, 'q') || '', 100);
  const rows = await ctx.store.prisma.visitor.findMany({
    where: { OR: [{ name: { contains: q } }, { badge_no: { contains: q } }, { organization: { contains: q } }] },
    include: { category: true },
    orderBy: { name: 'asc' },
    take: 500,
  });
  return {
    visitors: rows.map((v) => ({
      id: v.id,
      name: v.name,
      badge_no: v.badge_no,
      phone: v.phone,
      organization: v.organization,
      disabled: v.disabled,
      category_name: v.category.name,
      category_tier: v.category.tier,
    })),
  };
}

/** Records a visitor check-in / check-out. */
export async function recordVisit(tx: Tx, { store, actor, requestId }: Ctx, data: VisitorMovement) {
  const found = await tx.visitor.findUnique({ where: { id: data.visitorId }, include: { category: true } });
  requireValue(found && !found.disabled, 'الزائر غير موجود أو معطل', 404);
  requireValue(!found.category.disabled, 'فئة الزائر معطلة', 409);
  const { category, ...visitorRow } = found;
  let visit;
  if (data.action === 'in') {
    const open = await tx.visitorVisit.findFirst({ where: { visitor_id: found.id, check_out: null, voided: false } });
    requireValue(!open, 'الزائر مسجل داخل الوحدة بالفعل', 409);
    visit = await tx.visitorVisit.create({
      data: {
        id: randomUUID(),
        visitor_id: found.id,
        purpose: data.purpose,
        check_in: store.now(),
        created_by: actor.user.id,
        device_id: actor.deviceId,
        request_id: requestId,
      },
    });
  } else {
    const open = await tx.visitorVisit.findFirst({ where: { visitor_id: found.id, check_out: null, voided: false } });
    requireValue(open, 'لا توجد زيارة مفتوحة لهذا الزائر', 409);
    visit = await tx.visitorVisit.update({
      where: { id: open.id },
      data: { check_out: store.now(), entry_notes: data.notes || '' },
    });
  }
  await store.audit(tx, actor, `visitor.${data.action}`, visit.id);
  return { visit, visitor: { ...visitorRow, category_name: category.name, category_tier: category.tier } };
}

async function activeCategory(tx: Tx, id: string) {
  const category = await tx.visitorCategory.findUnique({ where: { id } });
  requireValue(category && !category.disabled, 'فئة الزائر غير متاحة', 404);
}

const VISITOR_FIELDS = {
  id: true,
  name: true,
  badge_no: true,
  category_id: true,
  phone: true,
  organization: true,
  disabled: true,
} as const;

export async function createVisitor(tx: Tx, data: Input) {
  const categoryId = identifier(data.categoryId);
  await activeCategory(tx, categoryId);
  const badge = data.badgeNo ? text(data.badgeNo, 20, true) : await nextVisitorBadge(tx);
  return tx.visitor.create({
    data: {
      id: randomUUID(),
      name: text(data.name, 200, true),
      category_id: categoryId,
      badge_no: badge,
      phone: text(data.phone || '', 30),
      national_id: text(data.nationalId || '', 14),
      organization: text(data.organization || '', 200),
      notes: text(data.notes || '', 1000),
    },
    select: VISITOR_FIELDS,
  });
}

/** Partial update: fields that are not sent keep their current value. */
export async function updateVisitor(tx: Tx, data: Input) {
  const id = identifier(data.id);
  const current = await tx.visitor.findUnique({ where: { id } });
  requireValue(current, 'الزائر غير موجود', 404);
  const categoryId = data.categoryId != null ? identifier(data.categoryId) : current.category_id;
  await activeCategory(tx, categoryId);
  const pick = (value: unknown, max: number, fallback: string, required = false) =>
    value != null ? text(value, max, required) : fallback;
  return tx.visitor.update({
    where: { id },
    data: {
      name: pick(data.name, 200, current.name, true),
      category_id: categoryId,
      phone: pick(data.phone, 30, current.phone),
      national_id: pick(data.nationalId, 14, current.national_id),
      organization: pick(data.organization, 200, current.organization),
      notes: pick(data.notes, 1000, current.notes),
      disabled: typeof data.disabled === 'boolean' ? data.disabled : current.disabled,
    },
    select: VISITOR_FIELDS,
  });
}

const CATEGORY_FIELDS = { id: true, name: true, tier: true, disabled: true, sort_order: true } as const;

export async function createCategory(tx: Tx, data: Input) {
  requireValue(typeof data.tier === 'string' && TIERS.includes(data.tier), 'نوع الفئة غير صالح');
  const name = text(data.name, 80, true);
  return tx.visitorCategory.create({
    data: {
      id: randomUUID(),
      name,
      tier: data.tier,
      sort_order: typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
    },
    select: CATEGORY_FIELDS,
  });
}

export async function updateCategory(tx: Tx, data: Input) {
  const id = identifier(data.id);
  const current = await tx.visitorCategory.findUnique({ where: { id } });
  requireValue(current, 'الفئة غير موجودة', 404);
  const disabled = typeof data.disabled === 'boolean' ? data.disabled : current.disabled;
  if (disabled && !current.disabled) {
    const others = await tx.visitorCategory.count({ where: { disabled: false, id: { not: id } } });
    requireValue(others >= 1, 'يجب أن تبقى فئة زائر واحدة نشطة على الأقل', 409);
  }
  const tier = data.tier != null ? data.tier : current.tier;
  requireValue(typeof tier === 'string' && TIERS.includes(tier), 'نوع الفئة غير صالح');
  return tx.visitorCategory.update({
    where: { id },
    data: { name: data.name != null ? text(data.name, 80, true) : current.name, tier, disabled },
    select: CATEGORY_FIELDS,
  });
}
