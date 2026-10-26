import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { lockActiveSoldier } from '@/common/store/lookups';
import { DEFAULT_CANTEEN_OUTLET } from '@/common/utils/catalog';
import { cairoDate, dayStart } from '@/common/utils/time';
import { identifier, positiveInt, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

const OUTLET_KINDS = ['canteen', 'buffet'];
const OUTLET_LABEL: Record<string, string> = { buffet: 'بوفيه', canteen: 'كانتين' };
const OUTLET_FIELDS = { id: true, kind: true, name: true, disabled: true, sort_order: true } as const;

const RECEIPT_ACTION = 'canteen.receipt.print.';

/** Reserve a durable copy number inside the idempotent write transaction. */
export async function reserveReceiptPrint(tx: Tx, data: Input, { actor, store }: Ctx) {
  const id = identifier(data.id);
  requireValue(await tx.canteenTransaction.findUnique({ where: { id }, select: { id: true } }), 'عملية غير موجودة', 404);
  const previous = await tx.auditLog.findMany({
    where: { entity_id: id, action: { startsWith: RECEIPT_ACTION } }, select: { action: true },
  });
  const printNumber = previous.reduce((max, row) => Math.max(max, Number(row.action.slice(RECEIPT_ACTION.length)) || 0), 0) + 1;
  const reservationId = randomUUID();
  await tx.auditLog.create({ data: {
    id: reservationId, entity_id: id, action: `${RECEIPT_ACTION}${printNumber}`,
    user_id: actor.user.id, device_id: actor.deviceId, at: store.now(),
  } });
  return { id, reservationId, printNumber };
}

/** Keep the failure in the audit trail; an unsuccessful final reservation does not consume a copy. */
export async function failReceiptPrint(tx: Tx, data: Input, { actor }: Ctx) {
  const id = identifier(data.id);
  const reservationId = identifier(data.reservationId);
  await tx.auditLog.updateMany({
    where: { id: reservationId, entity_id: id, user_id: actor.user.id, device_id: actor.deviceId, action: { startsWith: RECEIPT_ACTION } },
    data: { action: 'canteen.receipt.failed' },
  });
  return { id };
}

export async function getTransaction(ctx: Ctx) {
  const id = identifier(param(ctx, 'id'));
  const t = await ctx.store.prisma.canteenTransaction.findUnique({
    where: { id },
    include: {
      soldier: { select: { name: true, military_no: true, rank: true, company: true, unit: true } },
      outlet: { select: { name: true, kind: true } },
      creator: { select: { name: true } },
      reversal: { select: { id: true } },
    },
  });
  requireValue(t, 'عملية غير موجودة', 404);
  return {
    id: t.id,
    at: t.at,
    amount_cents: t.amount_cents,
    notes: t.notes,
    reversal_of: t.reversal_of,
    reversed_by: t.reversal?.id ?? null,
    ...t.soldier,
    cashier: t.creator.name,
    outlet_name: t.outlet.name,
    outlet_kind: t.outlet.kind,
  };
}

/** Monthly statement of one soldier at one outlet (month = YYYY-MM, Cairo time). */
export async function monthlyLedger(ctx: Ctx) {
  const soldierId = identifier(param(ctx, 'soldierId'));
  const month = text(param(ctx, 'month') || cairoDate(new Date(ctx.clock())).slice(0, 7), 7, true);
  requireValue(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'الشهر غير صالح');
  const outletId = identifier(param(ctx, 'outletId') || DEFAULT_CANTEEN_OUTLET);
  const prisma = ctx.store.prisma;
  const outlet = await prisma.foodOutlet.findUnique({ where: { id: outletId } });
  requireValue(outlet && !outlet.disabled, 'نقطة البيع غير متاحة', 404);

  const [year = 0, monthNo = 0] = month.split('-').map(Number);
  const nextMonth = `${monthNo === 12 ? year + 1 : year}-${String(monthNo === 12 ? 1 : monthNo + 1).padStart(2, '0')}-01`;
  const rows = await prisma.canteenTransaction.findMany({
    where: {
      soldier_id: soldierId,
      outlet_id: outletId,
      at: { gte: new Date(dayStart(`${month}-01`)), lt: new Date(dayStart(nextMonth)) },
    },
    include: { reversal: { select: { id: true } } },
    orderBy: [{ at: 'desc' }, { id: 'asc' }],
  });
  const transactions = rows.map(({ created_by: _by, reversal, ...row }) => ({
    ...row,
    reversed_by: reversal?.id ?? null,
  }));
  return {
    transactions,
    totalCents: rows.reduce((sum, row) => sum + row.amount_cents, 0),
    month,
    outletId,
  };
}

export async function addPurchase(tx: Tx, data: Input, { actor, store }: Ctx) {
  await lockActiveSoldier(tx, data.soldierId);
  const cents = positiveInt(data.amountCents);
  const outletId = identifier(data.outletId || DEFAULT_CANTEEN_OUTLET);
  const outlet = await tx.foodOutlet.findUnique({ where: { id: outletId } });
  requireValue(outlet && !outlet.disabled, 'نقطة البيع غير متاحة', 404);
  return tx.canteenTransaction.create({
    data: {
      id: randomUUID(),
      soldier_id: data.soldierId as string,
      outlet_id: outletId,
      amount_cents: cents,
      notes: text(data.notes || '', 1000),
      at: store.now(),
      created_by: actor.user.id,
    },
    select: { id: true, soldier_id: true, outlet_id: true, amount_cents: true, at: true },
  });
}

/** A purchase is never edited: it is cancelled by a negative counter-transaction (once). */
export async function reversePurchase(tx: Tx, data: Input, { actor, store }: Ctx) {
  const original = await tx.canteenTransaction.findUnique({ where: { id: identifier(data.id) } });
  requireValue(original && original.amount_cents > 0 && !original.reversal_of, 'لا يمكن عكس هذه العملية', 409);
  return tx.canteenTransaction.create({
    data: {
      id: randomUUID(),
      soldier_id: original.soldier_id,
      outlet_id: original.outlet_id,
      amount_cents: -original.amount_cents,
      reversal_of: original.id,
      notes: text(data.reason, 1000, true),
      at: store.now(),
      created_by: actor.user.id,
    },
    select: { id: true, amount_cents: true, reversal_of: true },
  });
}

export async function createOutlet(tx: Tx, data: Input) {
  requireValue(typeof data.kind === 'string' && OUTLET_KINDS.includes(data.kind), 'نوع نقطة البيع غير صالح');
  const name = text(data.name, 80, true);
  return tx.foodOutlet.create({
    data: {
      id: randomUUID(),
      kind: data.kind,
      name,
      sort_order: typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
    },
    select: OUTLET_FIELDS,
  });
}

export async function updateOutlet(tx: Tx, data: Input) {
  const id = identifier(data.id);
  const current = await tx.foodOutlet.findUnique({ where: { id } });
  requireValue(current, 'نقطة البيع غير موجودة', 404);
  const name = data.name != null ? text(data.name, 80, true) : current.name;
  const disabled = typeof data.disabled === 'boolean' ? data.disabled : current.disabled;
  if (disabled && !current.disabled) {
    const others = await tx.foodOutlet.count({ where: { kind: current.kind, disabled: false, id: { not: id } } });
    requireValue(others >= 1, `يجب أن يبقى ${OUTLET_LABEL[current.kind]} واحد نشط على الأقل`, 409);
  }
  return tx.foodOutlet.update({ where: { id }, data: { name, disabled }, select: OUTLET_FIELDS });
}

/** Deletes an outlet that never had a transaction (otherwise it must be disabled, not deleted). */
export async function deleteOutlet(tx: Tx, data: Input) {
  const id = identifier(data.id);
  requireValue(id !== DEFAULT_CANTEEN_OUTLET, 'لا يمكن حذف نقطة البيع الافتراضية للكانتين', 409);
  const current = await tx.foodOutlet.findUnique({ where: { id } });
  requireValue(current, 'نقطة البيع غير موجودة', 404);
  const used = await tx.canteenTransaction.count({ where: { outlet_id: id } });
  requireValue(used === 0, 'لا يمكن حذف نقطة بيع لها حركات؛ عطّلها بدلًا من حذفها', 409);
  if (!current.disabled) {
    const others = await tx.foodOutlet.count({ where: { kind: current.kind, disabled: false, id: { not: id } } });
    requireValue(others >= 1, `يجب أن يبقى ${OUTLET_LABEL[current.kind]} واحد نشط على الأقل`, 409);
  }
  await tx.foodOutlet.delete({ where: { id } });
  return { id };
}
