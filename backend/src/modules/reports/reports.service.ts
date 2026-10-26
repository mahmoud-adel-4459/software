import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx } from '@/common/http/types';
import { REPORT_IDS, summarizeReport, type ReportId, type ReportRow } from '@/common/utils/reports';
import { cairoDate, dayStart, nextDay } from '@/common/utils/time';
import { date, identifier, text } from '@/common/utils/validation';
import { dateOnly, numericText } from '@/modules/fitness/fitness.service';

const MAX_REPORT_ROWS = 10000;

export interface Filters {
  type: ReportId;
  from: string;
  to: string;
  range: { start: Date; end: Date };
  q: string;
  company: string;
  outletId: string | null;
}

/** Validates the query string of a report request (Cairo calendar days become UTC instants). */
export function parseFilters(ctx: Ctx): Filters {
  const type = param(ctx, 'type') || 'soldiers';
  requireValue((REPORT_IDS as readonly string[]).includes(type), 'نوع تقرير غير صالح');
  const from = date(param(ctx, 'from') || cairoDate(new Date(ctx.clock())));
  const to = date(param(ctx, 'to') || from);
  requireValue(from <= to, 'بداية الفترة بعد نهايتها');
  return {
    type: type as ReportId,
    from,
    to,
    range: { start: new Date(dayStart(from)), end: new Date(dayStart(nextDay(to))) },
    q: text(param(ctx, 'q') || '', 100),
    company: text(param(ctx, 'company') || '', 100),
    outletId: param(ctx, 'outletId'),
  };
}

const soldierMatch = (q: string, company: string) => ({
  ...(q ? { OR: [{ name: { contains: q } }, { military_no: { contains: q } }] } : {}),
  ...(company ? { company } : {}),
});

type Builder = (ctx: Ctx, f: Filters) => Promise<ReportRow[]>;
const take = MAX_REPORT_ROWS + 1;

const soldiers: Builder = (ctx, f) =>
  ctx.store.prisma.soldier.findMany({ where: soldierMatch(f.q, f.company), orderBy: { name: 'asc' }, take });

const gate: Builder = async (ctx, f) => {
  const rows = await ctx.store.prisma.gateEvent.findMany({
    where: { at: { gte: f.range.start, lt: f.range.end }, soldier: soldierMatch(f.q, f.company) },
    include: { soldier: true, permit: true, correction: true },
    orderBy: [{ at: 'desc' }, { sequence: 'desc' }],
    take,
  });
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    at: e.at,
    name: e.soldier.name,
    military_no: e.soldier.military_no,
    company: e.soldier.company,
    no: e.permit.no,
    reason: e.permit.reason,
    notes: e.kind === 'entry' ? e.permit.entry_notes : e.permit.notes,
    expected_return: e.permit.expected_return,
    returned_at: e.permit.returned_at,
    voided: e.permit.voided,
    correction_reason: e.correction?.reason ?? null,
  }));
};

const food =
  (kind: 'canteen' | 'buffet'): Builder =>
  async (ctx, f) => {
    const rows = await ctx.store.prisma.canteenTransaction.findMany({
      where: {
        outlet: { kind },
        ...(f.outletId ? { outlet_id: identifier(f.outletId) } : {}),
        at: { gte: f.range.start, lt: f.range.end },
        soldier: soldierMatch(f.q, f.company),
      },
      include: { soldier: true, outlet: true },
      orderBy: { at: 'desc' },
      take,
    });
    return rows.map((t) => ({
      id: t.id,
      at: t.at,
      amount_cents: t.amount_cents,
      reversal_of: t.reversal_of,
      notes: t.notes,
      outlet_name: t.outlet.name,
      name: t.soldier.name,
      military_no: t.soldier.military_no,
      company: t.soldier.company,
    }));
  };

const fitness: Builder = async (ctx, f) => {
  const rows = await ctx.store.prisma.fitnessRecord.findMany({
    where: { date: { gte: dateOnly(f.from), lte: dateOnly(f.to) }, soldier: soldierMatch(f.q, f.company) },
    include: { soldier: true },
    orderBy: { date: 'desc' },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    value: numericText(r.value),
    unit: r.unit,
    notes: r.notes,
    raw_result: r.raw_result,
    name: r.soldier.name,
    military_no: r.soldier.military_no,
    company: r.soldier.company,
  }));
};

const visitor: Builder = async (ctx, f) => {
  const rows = await ctx.store.prisma.visitorVisit.findMany({
    where: {
      check_in: { gte: f.range.start, lt: f.range.end },
      voided: false,
      ...(f.q
        ? {
            OR: [
              { visitor: { name: { contains: f.q } } },
              { visitor: { badge_no: { contains: f.q } } },
              { visitor: { organization: { contains: f.q } } },
              { purpose: { contains: f.q } },
            ],
          }
        : {}),
    },
    include: { visitor: { include: { category: true } } },
    orderBy: { check_in: 'desc' },
    take,
  });
  return rows.map((vv) => ({
    id: vv.id,
    at: vv.check_in,
    check_out: vv.check_out,
    purpose: vv.purpose,
    entry_notes: vv.entry_notes,
    name: vv.visitor.name,
    badge_no: vv.card_no == null ? vv.visitor.badge_no : String(vv.card_no),
    organization: vv.visitor.organization,
    category_name: vv.visitor.category.name,
    category_tier: vv.visitor.category.tier,
  }));
};

const BUILDERS: Record<ReportId, Builder> = {
  soldiers,
  gate,
  canteen: food('canteen'),
  buffet: food('buffet'),
  fitness,
  visitor,
};

export async function buildReport(ctx: Ctx) {
  const filters = parseFilters(ctx);
  const rows = await BUILDERS[filters.type](ctx, filters);
  requireValue(rows.length <= MAX_REPORT_ROWS, 'التقرير يتجاوز 10000 سجل؛ ضيق الفترة أو البحث', 413);
  const summary = summarizeReport(filters.type, rows);
  const isMoney = filters.type === 'canteen' || filters.type === 'buffet';
  const totalCents =
    summary.totalCents ?? (isMoney ? rows.reduce((sum, row) => sum + Number(row.amount_cents), 0) : null);
  return { type: filters.type, from: filters.from, to: filters.to, rows, summary, totalCents };
}

/** Cashiers may only run the canteen/buffet reports. */
export function reportsGuard(ctx: Ctx) {
  if (ctx.actor.user.role === 'clerk') {
    const allowed = ['canteen', 'buffet'].includes(param(ctx, 'type') ?? '');
    requireValue(allowed, 'كاشير الكانتين يمكنه تقارير الكانتين والبوفيه فقط', 403);
  }
  return buildReport(ctx);
}
