import { requireValue } from '@/common/errors/AppError';
import { requireAdmin } from '@/common/http/access';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { lockSoldier } from '@/common/store/lookups';
import { identifier, positiveInt, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { MILITARY_NO, NATIONAL_ID, offsetParam, soldierFields, soldierPhotos } from './soldiers.validator';
import { addAttachment } from './attachments.service';

export async function listSoldiers(ctx: Ctx) {
  const offset = offsetParam(param(ctx, 'offset'));
  const archived = param(ctx, 'archived') === 'true';
  if (archived) requireAdmin(ctx.actor);
  const search = text(param(ctx, 'q') || '', 100);
  const soldiers = await ctx.store.list(ctx.actor, search, offset, archived);
  return { soldiers, serverTime: new Date(ctx.clock()).toISOString() };
}

export async function getSoldier(ctx: Ctx) {
  const id = identifier(param(ctx, 'id'));
  const prisma = ctx.store.prisma;
  if (ctx.actor.user.role === 'clerk') {
    // Cashiers only see what they need to identify the soldier.
    const soldier = await prisma.soldier.findUnique({
      where: { id },
      select: {
        id: true,
        military_no: true,
        name: true,
        rank: true,
        military_rank: true,
        company: true,
        unit: true,
        sub_unit: true,
        status: true,
        version: true,
      },
    });
    requireValue(soldier, 'العسكري غير موجود', 404);
    return { soldier, attachments: [] };
  }
  const soldier = await prisma.soldier.findUnique({ where: { id } });
  requireValue(soldier, 'العسكري غير موجود', 404);
  const attachments = await prisma.attachment.findMany({
    where: { soldier_id: soldier.id },
    select: { id: true, name: true, mime: true, kind: true, size: true, created_at: true },
    orderBy: { created_at: 'desc' },
  });
  return { soldier, attachments };
}

export async function updateSoldier(tx: Tx, data: Input) {
  const old = await lockSoldier(tx, data.id);
  positiveInt(data.version);
  requireValue(old.version === data.version, 'تم تعديل الملف من جهاز آخر؛ أعد فتحه', 409);
  const s = soldierFields(data);
  const photos = soldierPhotos(data.photos);
  requireValue(MILITARY_NO.test(s.militaryNo) && NATIONAL_ID.test(s.nationalId), 'الأرقام غير صحيحة');
  const updated = await tx.soldier.update({
    where: { id: old.id },
    data: {
      name: s.name,
      military_no: s.militaryNo,
      national_id: s.nationalId,
      rank: s.rank,
      military_rank: s.militaryRank,
      company: s.company,
      unit: s.unit,
      sub_unit: s.subUnit,
      phone: s.phone,
      address: s.address,
      details: s.details,
      version: { increment: 1 },
    },
  });
  for (const photo of photos) await addAttachment(tx, { ...photo, soldierId: old.id });
  return updated;
}

export async function archiveSoldier(tx: Tx, data: Input) {
  const old = await lockSoldier(tx, data.id);
  requireValue(typeof data.archived === 'boolean' && old.version === data.version, 'الملف تغير؛ أعد فتحه', 409);
  requireValue(old.status === 'in' || !data.archived, 'أعد العسكري إلى الوحدة قبل أرشفة الملف', 409);
  return tx.soldier.update({
    where: { id: old.id },
    data: { archived: data.archived, version: { increment: 1 } },
    select: { id: true, archived: true, version: true },
  });
}
