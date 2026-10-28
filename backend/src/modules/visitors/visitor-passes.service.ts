import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { identifier, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { createVisitor } from './visitors.service';

/**
 * Visitor passes: the gate sends a request for a visitor waiting outside, the unit (admin PC)
 * approves it and prints a QR pass, someone from the unit hands the pass to the gate, and the
 * gate scans it to admit the visitor (and scans it again on the way out).
 *
 * pending -> approved -> inside -> completed
 *         -> rejected
 * pending/approved -> cancelled (by the gate)
 */

/** A printed pass that was never used stops opening the gate after this many hours. */
export const PASS_VALID_HOURS = 12;
const OPEN_STATUSES = ['pending', 'approved', 'inside'];

const INCLUDE = {
  category: { select: { name: true, tier: true } },
  requester: { select: { name: true } },
  decider: { select: { name: true } },
  visit: { select: { check_in: true, check_out: true } },
} as const;

/** Loads one pass with its display relations (inside a write transaction it is serialised with other writers). */
async function findPass(db: Tx, id: unknown) {
  const row = await db.visitorPass.findUnique({ where: { id: identifier(id) }, include: INCLUDE });
  requireValue(row, 'تصريح الزائر غير موجود', 404);
  return row;
}
type PassRow = Awaited<ReturnType<typeof findPass>>;

const expiresAt = (p: { decided_at: Date | null }) =>
  p.decided_at ? new Date(p.decided_at.getTime() + PASS_VALID_HOURS * 3_600_000) : null;

function view(p: PassRow, now: Date) {
  const expires = p.status === 'approved' ? expiresAt(p) : null;
  return {
    id: p.id,
    no: p.no,
    name: p.name,
    national_id: p.national_id,
    phone: p.phone,
    organization: p.organization,
    category_id: p.category_id,
    category_name: p.category.name,
    category_tier: p.category.tier,
    host: p.host,
    purpose: p.purpose,
    status: p.status,
    expired: Boolean(expires && expires <= now),
    expires_at: expires,
    requested_at: p.requested_at,
    requested_by_name: p.requester.name,
    decided_at: p.decided_at,
    decided_by_name: p.decider?.name ?? '',
    decision_notes: p.decision_notes,
    check_in: p.visit?.check_in ?? null,
    check_out: p.visit?.check_out ?? null,
  };
}

/** Open requests/passes plus everything requested in the last 24 hours, newest first. */
export async function listVisitorPasses({ store }: Ctx) {
  const now = store.now();
  const rows = await store.prisma.visitorPass.findMany({
    where: { OR: [{ status: { in: OPEN_STATUSES } }, { requested_at: { gte: new Date(now.getTime() - 86_400_000) } }] },
    include: INCLUDE,
    orderBy: { requested_at: 'desc' },
    take: 300,
  });
  return { passes: rows.map((p) => view(p, now)) };
}

export async function getVisitorPass(ctx: Ctx) {
  return view(await findPass(ctx.store.prisma, param(ctx, 'id')), ctx.store.now());
}

/** Gate: a visitor is waiting outside — ask the unit for a pass. */
export async function requestVisitorPass(tx: Tx, ctx: Ctx, data: Input) {
  const categoryId = identifier(data.categoryId);
  const category = await tx.visitorCategory.findUnique({ where: { id: categoryId } });
  requireValue(category && !category.disabled, 'فئة الزائر غير متاحة', 404);
  const nationalId = text(data.nationalId || '', 14);
  requireValue(!nationalId || /^[0-9]{14}$/.test(nationalId), 'الرقم القومي يجب أن يكون 14 رقمًا');
  const row = await tx.visitorPass.create({
    data: {
      id: randomUUID(),
      no: await ctx.store.nextCounter(tx, 'visitor_passes.no'),
      name: text(data.name, 200, true),
      national_id: nationalId,
      phone: text(data.phone || '', 30),
      organization: text(data.organization || '', 200),
      category_id: categoryId,
      host: text(data.host || '', 200),
      purpose: text(data.purpose, 500, true),
      requested_by: ctx.actor.user.id,
      requested_at: ctx.store.now(),
    },
  });
  await ctx.store.audit(tx, ctx.actor, 'visitor-pass.request', row.id);
  return { id: row.id, no: row.no };
}

/** Unit: approve (the pass is then printed) or reject a pending request. */
export async function decideVisitorPass(tx: Tx, ctx: Ctx, data: Input) {
  requireValue(data.decision === 'approve' || data.decision === 'reject', 'القرار غير صحيح');
  const pass = await findPass(tx, data.id);
  requireValue(pass.status === 'pending', 'تم البت في هذا الطلب بالفعل', 409);
  const status = data.decision === 'approve' ? 'approved' : 'rejected';
  await tx.visitorPass.update({
    where: { id: pass.id },
    data: {
      status,
      decided_by: ctx.actor.user.id,
      decided_at: ctx.store.now(),
      decision_notes: text(data.notes || '', 500),
    },
  });
  await ctx.store.audit(tx, ctx.actor, `visitor-pass.${data.decision}`, pass.id);
  return { id: pass.id, no: pass.no, status };
}

/** Gate: the visitor left before entering — withdraw the request or the unused pass. */
export async function cancelVisitorPass(tx: Tx, ctx: Ctx, data: Input) {
  const pass = await findPass(tx, data.id);
  requireValue(pass.status === 'pending' || pass.status === 'approved', 'لا يمكن إلغاء هذا التصريح', 409);
  await tx.visitorPass.update({ where: { id: pass.id }, data: { status: 'cancelled' } });
  await ctx.store.audit(tx, ctx.actor, 'visitor-pass.cancel', pass.id);
  return { id: pass.id, status: 'cancelled' };
}

/** Gate scan of a printed pass: first scan admits the visitor, the second records the exit. */
export async function moveVisitorPass(tx: Tx, ctx: Ctx, data: Input) {
  requireValue(data.action === 'in' || data.action === 'out', 'حركة الزائر غير صحيحة');
  const pass = await findPass(tx, data.id);
  const now = ctx.store.now();
  if (data.action === 'in') {
    requireValue(pass.status !== 'pending', 'الطلب لم يُعتمد من الوحدة بعد', 409);
    requireValue(pass.status !== 'rejected', 'الوحدة رفضت دخول هذا الزائر', 409);
    requireValue(pass.status !== 'cancelled', 'هذا التصريح ملغى', 409);
    requireValue(pass.status === 'approved', 'التصريح استُخدم بالفعل', 409);
    requireValue(expiresAt(pass)! > now, `انتهت صلاحية التصريح (${PASS_VALID_HOURS} ساعة من الاعتماد)`, 409);
    const visitor = await createVisitor(tx, {
      name: pass.name,
      categoryId: pass.category_id,
      phone: pass.phone,
      nationalId: pass.national_id,
      organization: pass.organization,
      notes: pass.host ? `الجهة المقصودة: ${pass.host}` : '',
    });
    const visit = await tx.visitorVisit.create({
      data: {
        id: randomUUID(),
        visitor_id: visitor.id,
        purpose: pass.purpose,
        check_in: now,
        created_by: ctx.actor.user.id,
        device_id: ctx.actor.deviceId,
        request_id: ctx.requestId,
      },
    });
    await tx.visitorPass.update({ where: { id: pass.id }, data: { status: 'inside', visit_id: visit.id } });
  } else {
    requireValue(pass.status === 'inside' && pass.visit_id, 'الزائر ليس داخل الوحدة بهذا التصريح', 409);
    await tx.visitorVisit.updateMany({
      where: { id: pass.visit_id, check_out: null },
      data: { check_out: now, entry_notes: text(data.notes || '', 1000) },
    });
    await tx.visitorPass.update({ where: { id: pass.id }, data: { status: 'completed' } });
  }
  await ctx.store.audit(tx, ctx.actor, `visitor.${data.action}`, pass.id);
  return { id: pass.id, no: pass.no, status: data.action === 'in' ? 'inside' : 'completed' };
}
