import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { lockSoldier } from '@/common/store/lookups';
import { identifier, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { unitPolicyOf } from '@/modules/settings/unit-policy';
import { MILITARY_NO, type MovementInput } from './gate.validator';

const PHOTO_KINDS = ['photo', 'idPhoto', 'carnetFront', 'carnetBack'];

/** 90 → "ساعة و30 دقيقة". */
function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
  const mins = m === 0 ? '' : `${m} دقيقة`;
  return [hours, mins].filter(Boolean).join(' و') || '0 دقيقة';
}

/** Soldier + latest photos for the gate screen after a QR scan or manual entry. */
export async function findSoldierForGate(ctx: Ctx) {
  const militaryNo = text(param(ctx, 'militaryNo'), 30, true);
  requireValue(MILITARY_NO.test(militaryNo), 'الرقم العسكري غير صالح');
  const prisma = ctx.store.prisma;
  const soldier = await prisma.soldier.findFirst({
    where: { military_no: militaryNo, archived: false },
    select: {
      id: true,
      military_no: true,
      name: true,
      rank: true,
      military_rank: true,
      company: true,
      unit: true,
      sub_unit: true,
      phone: true,
      address: true,
      status: true,
      details: true,
    },
  });
  requireValue(soldier, 'لا يوجد عسكري بهذا الرقم', 404);
  const all = await prisma.attachment.findMany({
    where: { soldier_id: soldier.id, kind: { in: PHOTO_KINDS } },
    select: { id: true, kind: true, mime: true },
    orderBy: [{ kind: 'asc' }, { created_at: 'desc' }],
  });
  // Latest attachment per kind (the legacy query used DISTINCT ON (kind)).
  const photos = all.filter((row, index) => index === all.findIndex((other) => other.kind === row.kind));
  return { soldier, photos };
}

export async function getPermit(ctx: Ctx) {
  const row = await ctx.store.prisma.permit.findUnique({
    where: { id: identifier(param(ctx, 'id')) },
    include: { soldier: { select: { name: true, military_no: true, rank: true, military_rank: true, company: true } } },
  });
  requireValue(row, 'التصريح غير موجود', 404);
  return {
    id: row.id,
    no: row.no,
    reason: row.reason,
    exit_at: row.exit_at,
    expected_return: row.expected_return,
    returned_at: row.returned_at,
    voided: row.voided,
    notes: row.notes,
    entry_notes: row.entry_notes,
    ...row.soldier,
  };
}

export const listPermits = async ({ store }: Ctx) => ({ permits: await store.permits() });

export async function summary({ store, clock }: Ctx) {
  const where = { returned_at: null, voided: false };
  const [outside, late] = await Promise.all([
    store.prisma.permit.count({ where }),
    store.prisma.permit.count({ where: { ...where, expected_return: { lt: new Date(clock()) } } }),
  ]);
  return { outside, late };
}

/** Records one gate movement (soldier exit with a new permit, or entry closing the active permit). */
export async function recordMovement(tx: Tx, ctx: Pick<Ctx, 'actor' | 'requestId' | 'store'>, data: MovementInput) {
  const { store, actor, requestId } = ctx;
  const soldier = await tx.soldier.findUnique({ where: { id: data.soldierId } });
  requireValue(soldier, 'العسكري غير موجود', 404);
  requireValue(!soldier.archived, 'ملف العسكري مؤرشف', 409);
  const now = store.now();
  const { gateMinMinutes } = unitPolicyOf(((await tx.settings.findUnique({ where: { id: 1 } }))?.data ?? {}) as object);
  const minGapMs = gateMinMinutes * 60 * 1000;
  let permit;
  if (data.kind === 'exit') {
    requireValue(soldier.status === 'in', 'العسكري مسجل خارج الوحدة بالفعل', 409);
    requireValue(Date.parse(data.expectedReturn!) > now.getTime(), 'موعد العودة يجب أن يكون في المستقبل');
    requireValue(
      Date.parse(data.expectedReturn!) >= now.getTime() + minGapMs,
      `موعد العودة يجب أن يكون بعد ${durationText(gateMinMinutes)} على الأقل من الخروج`,
    );
    permit = await tx.permit.create({
      data: {
        id: randomUUID(),
        no: await store.nextCounter(tx, 'permits.no'),
        soldier_id: soldier.id,
        reason: data.reason!,
        exit_at: now,
        expected_return: new Date(data.expectedReturn!),
        notes: data.notes,
        created_by: actor.user.id,
      },
    });
  } else {
    requireValue(soldier.status === 'out', 'العسكري مسجل داخل الوحدة بالفعل', 409);
    const active = await tx.permit.findFirst({ where: { soldier_id: soldier.id, returned_at: null, voided: false } });
    requireValue(active, 'لا يوجد تصريح نشط؛ اطلب مراجعة المسؤول', 409);
    const elapsedMs = now.getTime() - active.exit_at.getTime();
    requireValue(
      elapsedMs >= minGapMs,
      `لا يمكن تسجيل العودة قبل مرور ${durationText(gateMinMinutes)} على الخروج؛ مضى ${durationText(Math.floor(elapsedMs / 60000))} فقط. لتصحيح خروج بالخطأ اطلب من المسؤول «عكس الحركة».`,
      409,
    );
    permit = await tx.permit.update({ where: { id: active.id }, data: { returned_at: now, entry_notes: data.notes } });
  }
  await tx.soldier.update({
    where: { id: soldier.id },
    data: { status: data.kind === 'exit' ? 'out' : 'in', version: { increment: 1 } },
  });
  await tx.gateEvent.create({
    data: {
      id: randomUUID(),
      permit_id: permit.id,
      soldier_id: soldier.id,
      kind: data.kind,
      at: now,
      user_id: actor.user.id,
      device_id: actor.deviceId,
      request_id: requestId!,
      sequence: await store.nextCounter(tx, 'gate_events.sequence'),
    },
  });
  await store.audit(tx, actor, `gate.${data.kind}`, permit.id);
  const { created_by: _createdBy, ...safe } = permit;
  return safe;
}

/** Admin correction: undoes the soldier's latest, not-yet-corrected gate event. */
export async function correctMovement(tx: Tx, data: Input, { actor, store }: Ctx) {
  const event = await tx.gateEvent.findUnique({ where: { id: identifier(data.eventId) } });
  requireValue(event, 'الحركة غير موجودة', 404);
  const soldier = await lockSoldier(tx, event.soldier_id);
  const last = await tx.gateEvent.findFirst({
    where: { soldier_id: soldier.id },
    orderBy: [{ at: 'desc' }, { sequence: 'desc' }],
  });
  const alreadyCorrected = Boolean(await tx.gateCorrection.findUnique({ where: { event_id: event.id } }));
  requireValue(last?.id === event.id && !alreadyCorrected, 'يمكن عكس أحدث حركة غير مصححة فقط', 409);

  const permit = await tx.permit.findUniqueOrThrow({ where: { id: event.permit_id } });
  const before = { status: soldier.status, permit };
  if (event.kind === 'exit') {
    requireValue(!permit.returned_at && !permit.voided, 'التصريح مغلق', 409);
    await tx.permit.update({ where: { id: permit.id }, data: { voided: true } });
  } else {
    requireValue(permit.returned_at && !permit.voided, 'حركة العودة غير قابلة للعكس', 409);
    await tx.permit.update({ where: { id: permit.id }, data: { returned_at: null } });
  }
  const status = event.kind === 'exit' ? 'in' : 'out';
  await tx.soldier.update({ where: { id: soldier.id }, data: { status, version: { increment: 1 } } });
  return tx.gateCorrection.create({
    data: {
      id: randomUUID(),
      event_id: event.id,
      reason: text(data.reason, 1000, true),
      before_state: JSON.parse(JSON.stringify(before)),
      after_state: { status },
      at: store.now(),
      created_by: actor.user.id,
    },
    select: { id: true, event_id: true },
  });
}
