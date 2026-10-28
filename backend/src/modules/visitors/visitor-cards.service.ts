import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { identifier, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { createVisitor } from './visitors.service';

/** Validates one of the 24 permanent visitor cards. */
export function cardNumber(value: unknown): number {
  const no = typeof value === 'string' && /^(?:[1-9]|1[0-9]|2[0-4])$/.test(value) ? Number(value) : value;
  requireValue(typeof no === 'number' && Number.isInteger(no) && no >= 1 && no <= 24, 'رقم البطاقة من 1 إلى 24');
  return no;
}

/** Each permanent card is either free or occupied by exactly one open visit. */
export async function listVisitorCards({ store }: Ctx) {
  const visits = await store.prisma.visitorVisit.findMany({
    where: { card_no: { not: null }, check_out: null, voided: false },
    include: { visitor: { include: { category: true } } },
  });
  return { cards: Array.from({ length: 24 }, (_, i) => ({ cardNo: i + 1, openVisit: visits.find(v => v.card_no === i + 1) ?? null })) };
}

/** Latest 200 visits (card and badge) with check-in / check-out, for the live movements screen. */
export async function listVisitorVisits({ store }: Ctx) {
  const rows = await store.prisma.visitorVisit.findMany({
    where: { voided: false },
    include: { visitor: { include: { category: true } } },
    orderBy: { check_in: 'desc' },
    take: 200,
  });
  return {
    visits: rows.map((v) => ({
      id: v.id,
      name: v.visitor.name,
      badge_no: v.card_no == null ? v.visitor.badge_no : String(v.card_no),
      organization: v.visitor.organization,
      category_name: v.visitor.category.name,
      purpose: v.purpose,
      check_in: v.check_in,
      check_out: v.check_out,
      entry_notes: v.entry_notes,
    })),
  };
}

/** Looks up the current occupant without reusing any previous visitor's personal details. */
export async function findVisitorCard(ctx: Ctx) {
  const cardNo = cardNumber(param(ctx, 'cardNo'));
  const openVisit = await ctx.store.prisma.visitorVisit.findFirst({
    where: { card_no: cardNo, check_out: null, voided: false },
    include: { visitor: { include: { category: true } } },
  });
  return { cardNo, openVisit };
}

/** Check-in makes a fresh visitor record; check-out frees the card while preserving its visit history. */
export async function moveVisitorCard(tx: Tx, ctx: Ctx, data: Input) {
  const cardNo = cardNumber(data.cardNo);
  requireValue(data.action === 'in' || data.action === 'out', 'حركة الزائر غير صحيحة');
  const open = await tx.visitorVisit.findFirst({ where: { card_no: cardNo, check_out: null, voided: false } });
  let visit;
  if (data.action === 'in') {
    requireValue(!open, 'البطاقة مستخدمة؛ سجل خروج الزائر الحالي أولًا', 409);
    const purpose = text(data.purpose, 500, true);
    const nationalId = text(data.nationalId || '', 14);
    requireValue(!nationalId || /^[0-9]{14}$/.test(nationalId), 'الرقم القومي يجب أن يكون 14 رقمًا');
    const visitor = await createVisitor(tx, { ...data, badgeNo: undefined, nationalId });
    visit = await tx.visitorVisit.create({ data: {
      id: randomUUID(), visitor_id: visitor.id, card_no: cardNo, purpose,
      check_in: ctx.store.now(), created_by: ctx.actor.user.id,
      device_id: ctx.actor.deviceId, request_id: ctx.requestId,
    } });
  } else {
    requireValue(open, 'البطاقة متاحة ولا توجد زيارة مفتوحة', 409);
    // A stale screen must never check out a different visitor who later received the same card.
    requireValue(open.id === identifier(data.visitId), 'تغيرت الزيارة؛ امسح البطاقة مجددًا', 409);
    visit = await tx.visitorVisit.update({ where: { id: open.id }, data: {
      check_out: ctx.store.now(), entry_notes: text(data.notes || '', 1000),
    } });
  }
  await ctx.store.audit(tx, ctx.actor, `visitor.${data.action}`, visit.id);
  return { id: visit.id, cardNo, visit };
}
