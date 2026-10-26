import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { lockActiveSoldier } from '@/common/store/lookups';
import { date as dateOnly, identifier, positiveInt, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

const CATEGORIES = ['grant', 'leave', 'penalty', 'reward', 'medical', 'medical_affairs', 'security_report'];

/** Lists administrative and medical entries only for an administrator viewing the matching soldier. */
export async function listPersonnelRecords(ctx: Ctx) {
  const soldierId = identifier(param(ctx, 'soldierId'));
  requireValue(await ctx.store.prisma.soldier.findUnique({ where: { id: soldierId }, select: { id: true } }), 'العسكري غير موجود', 404);
  const records = await ctx.store.prisma.soldierPersonnelRecord.findMany({
    where: { soldier_id: soldierId, deleted: false },
    orderBy: [{ record_date: 'desc' }, { created_at: 'desc' }, { id: 'asc' }],
  });
  return { records };
}

/** Writes one entry independently of the personal-data form, with version protection and transaction auditing. */
export async function savePersonnelRecord(tx: Tx, ctx: Ctx, data: Input) {
  const soldierId = identifier(data.soldierId);
  await lockActiveSoldier(tx, soldierId);
  requireValue(typeof data.category === 'string' && CATEGORIES.includes(data.category), 'نوع السجل غير صالح');
  const recordDate = dateOnly(data.recordDate);
  const endDate = data.endDate ? dateOnly(data.endDate) : null;
  requireValue(!endDate || endDate >= recordDate, 'تاريخ النهاية يجب ألا يسبق تاريخ البداية');
  const fields = { category: data.category, title: text(data.title, 200, true), record_date: recordDate,
    end_date: endDate, reference: text(data.reference || '', 100), details: text(data.details || '', 5000), updated_at: ctx.store.now() };
  if (data.id) {
    const old = await tx.soldierPersonnelRecord.findUnique({ where: { id: identifier(data.id) } });
    requireValue(old && !old.deleted && old.soldier_id === soldierId, 'السجل غير موجود في ملف العسكري', 404);
    requireValue(old.version === positiveInt(data.version), 'السجل تغير؛ أعد فتحه', 409);
    const row = await tx.soldierPersonnelRecord.update({ where: { id: old.id }, data: { ...fields, version: { increment: 1 } } });
    await ctx.store.audit(tx, ctx.actor, `soldier.${row.category}.update`, row.id);
    return row;
  }
  const row = await tx.soldierPersonnelRecord.create({ data: { ...fields, id: randomUUID(), soldier_id: soldierId,
    created_by: ctx.actor.user.id, created_at: ctx.store.now() } });
  await ctx.store.audit(tx, ctx.actor, `soldier.${row.category}.create`, row.id);
  return row;
}

/** Hides an entry without erasing its stored data; concurrent edits and cross-soldier requests are refused. */
export async function deletePersonnelRecord(tx: Tx, ctx: Ctx, data: Input) {
  const soldierId = identifier(data.soldierId);
  await lockActiveSoldier(tx, soldierId);
  const row = await tx.soldierPersonnelRecord.findUnique({ where: { id: identifier(data.id) } });
  requireValue(row && !row.deleted && row.soldier_id === soldierId, 'السجل غير موجود في ملف العسكري', 404);
  requireValue(row.version === positiveInt(data.version), 'السجل تغير؛ أعد فتحه', 409);
  await tx.soldierPersonnelRecord.update({ where: { id: row.id }, data: { deleted: true, version: { increment: 1 }, updated_at: ctx.store.now() } });
  await ctx.store.audit(tx, ctx.actor, `soldier.${row.category}.delete`, row.id);
  return { id: row.id };
}
