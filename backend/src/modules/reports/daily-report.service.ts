import { requireValue } from '@/common/errors/AppError';
import { cairoDate, cairoHour, dayStart, nextDay } from '@/common/utils/time';
import type { Store } from '@/common/store/Store';
import { dateOnly, numericText } from '@/modules/fitness/fitness.service';
import { fitnessScore, gradeFor, unitPolicyOf, type GradeBand } from '@/modules/settings/unit-policy';

interface FoodRow {
  at: Date;
  amount_cents: number;
  reversal_of: string | null;
  notes: string;
  outlet_name: string;
  kind: string;
  name: string;
  military_no: string;
}

function tallySoldiers(rows: { status: string; archived: boolean; company: string }[]) {
  const snapshot = {
    total: 0,
    inside: 0,
    outside: 0,
    archived: 0,
    byCompany: [] as { company: string; count: number }[],
  };
  const companies = new Map<string, number>();
  for (const s of rows) {
    if (s.archived) {
      snapshot.archived++;
      continue;
    }
    snapshot.total++;
    if (s.status === 'in') snapshot.inside++;
    else snapshot.outside++;
    const c = (s.company || '').trim() || '—';
    companies.set(c, (companies.get(c) || 0) + 1);
  }
  snapshot.byCompany = [...companies.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count);
  return snapshot;
}

function bucketGate(events: { kind: string; at: Date; reason: string; name: string; military_no: string }[]) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, entries: 0, exits: 0 }));
  const byReason = new Map<string, number>();
  for (const e of events) {
    const bucket = byHour[cairoHour(e.at)]!;
    if (e.kind === 'entry') bucket.entries++;
    else bucket.exits++;
    const reason = e.reason || '—';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  return {
    entries: events.filter((e) => e.kind === 'entry').length,
    exits: events.filter((e) => e.kind === 'exit').length,
    total: events.length,
    byHour,
    byReason: [...byReason.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    recent: events.slice(0, 30).map((e) => ({
      at: e.at,
      kind: e.kind,
      name: e.name,
      military_no: e.military_no,
      reason: e.reason,
    })),
  };
}

function tallyFood(rows: FoodRow[], kind: string) {
  const outlets = new Map<string, { name: string; count: number; totalCents: number }>();
  let totalCents = 0;
  let transactions = 0;
  let reversals = 0;
  const mine = rows.filter((r) => r.kind === kind);
  for (const r of mine) {
    transactions++;
    totalCents += r.amount_cents;
    if (r.reversal_of || r.amount_cents < 0) reversals++;
    const name = r.outlet_name || '—';
    const o = outlets.get(name) || { name, count: 0, totalCents: 0 };
    o.count++;
    o.totalCents += r.amount_cents;
    outlets.set(name, o);
  }
  return {
    transactions,
    totalCents,
    reversals,
    outlets: [...outlets.values()].sort((a, b) => b.totalCents - a.totalCents),
    recent: mine.slice(0, 25).map((r) => ({
      at: r.at,
      outlet_name: r.outlet_name,
      name: r.name,
      military_no: r.military_no,
      amount_cents: r.amount_cents,
      notes: r.notes,
    })),
  };
}

type VisitRow = {
  check_in: Date;
  check_out: Date | null;
  purpose: string;
  name: string;
  badge_no: string;
  category_name: string;
};

function tallyVisitors(rows: VisitRow[]) {
  const byCategory = new Map<string, number>();
  let checkOuts = 0;
  let stillInside = 0;
  for (const v of rows) {
    if (v.check_out) checkOuts++;
    else stillInside++;
    const cat = v.category_name || '—';
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }
  return {
    checkIns: rows.length,
    checkOuts,
    stillInside,
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 25).map((v) => ({
      at: v.check_in,
      check_out: v.check_out,
      name: v.name,
      badge_no: v.badge_no,
      category_name: v.category_name,
      purpose: v.purpose,
    })),
  };
}

function tallyFitness(
  rows: { date: Date; type: string; value: number | null; unit: string; name: string; military_no: string; score: number | null }[],
  gradeScale: GradeBand[],
) {
  const byType = new Map<string, { count: number; scores: number[] }>();
  for (const r of rows) {
    const t = byType.get(r.type) || { count: 0, scores: [] };
    t.count++;
    if (r.score !== null) t.scores.push(r.score);
    byType.set(r.type, t);
  }
  const mean = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);
  const averageScore = mean(rows.map((r) => r.score).filter((s): s is number => s !== null));
  return {
    records: rows.length,
    averageScore,
    averageGrade: gradeFor(gradeScale, averageScore),
    byType: [...byType.entries()]
      .map(([type, t]) => ({ type, count: t.count, averageScore: mean(t.scores) }))
      .sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 20).map((r) => ({
      date: r.date,
      type: r.type,
      value: numericText(r.value),
      unit: r.unit,
      score: r.score,
      name: r.name,
      military_no: r.military_no,
    })),
  };
}

export type ReportPeriod = 'day' | 'month' | 'year';
export const REPORT_PERIODS: ReportPeriod[] = ['day', 'month', 'year'];

/** First and last-plus-one calendar day (YYYY-MM-DD) of the day, month or year containing `date`. */
function periodBounds(date: string, period: ReportPeriod): { first: string; afterLast: string } {
  const [y = 0, m = 1] = date.split('-').map(Number);
  if (period === 'day') return { first: date, afterLast: nextDay(date) };
  if (period === 'month') {
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { first: `${date.slice(0, 7)}-01`, afterLast: next };
  }
  return { first: `${y}-01-01`, afterLast: `${y + 1}-01-01` };
}

/** Gate movements per day (month) or per month (year), Cairo calendar. */
function gateTimeline(events: { kind: string; at: Date }[], period: ReportPeriod, first: string, afterLast: string) {
  if (period === 'day') return [];
  const buckets = new Map<string, { label: string; entries: number; exits: number }>();
  for (let d = first; d < afterLast; d = nextDay(d)) {
    const key = period === 'month' ? d : d.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, { label: period === 'month' ? d.slice(8) : d.slice(5, 7), entries: 0, exits: 0 });
  }
  for (const e of events) {
    const d = cairoDate(e.at);
    const bucket = buckets.get(period === 'month' ? d : d.slice(0, 7));
    if (!bucket) continue;
    if (e.kind === 'entry') bucket.entries++;
    else bucket.exits++;
  }
  return [...buckets.values()];
}

/**
 * Comprehensive summary of a Cairo calendar day, month or year: snapshot of the unit plus the period's gate,
 * food, visitor, fitness and soldier-file activity.
 */
export async function buildDailyReport(store: Store, date: string, period: ReportPeriod = 'day') {
  requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'تاريخ غير صالح');
  requireValue(REPORT_PERIODS.includes(period), 'فترة التقرير غير صالحة');
  const { first, afterLast } = periodBounds(date, period);
  const start = new Date(dayStart(first));
  const end = new Date(dayStart(afterLast));
  const range = { gte: start, lt: end };
  const prisma = store.prisma;
  const now = store.now();

  const settings = ((await prisma.settings.findUnique({ where: { id: 1 } }))?.data ?? {}) as Record<string, string>;
  const [soldierRows, activeOutside, late, gateRows, foodRows, visitorRows, fitnessRows, outletRows, auditRows, personnelRows] =
    await Promise.all([
      prisma.soldier.findMany({ select: { status: true, archived: true, company: true } }),
      prisma.permit.count({ where: { returned_at: null, voided: false } }),
      prisma.permit.count({ where: { returned_at: null, voided: false, expected_return: { lt: now } } }),
      prisma.gateEvent.findMany({
        where: { at: range },
        include: { permit: { select: { reason: true } }, soldier: { select: { name: true, military_no: true } } },
        orderBy: { at: 'desc' },
      }),
      prisma.canteenTransaction.findMany({
        where: { at: range },
        include: {
          outlet: { select: { name: true, kind: true } },
          soldier: { select: { name: true, military_no: true } },
        },
        orderBy: { at: 'desc' },
      }),
      prisma.visitorVisit.findMany({
        where: { check_in: range, voided: false },
        include: { visitor: { include: { category: { select: { name: true } } } } },
        orderBy: { check_in: 'desc' },
      }),
      prisma.fitnessRecord.findMany({
        where: { date: { gte: dateOnly(first), lt: dateOnly(afterLast) } },
        include: { soldier: { select: { name: true, military_no: true } } },
        orderBy: { date: 'desc' },
      }),
      prisma.foodOutlet.groupBy({ by: ['kind'], where: { disabled: false }, _count: { _all: true } }),
      prisma.auditLog.findMany({
        where: { at: range },
        include: { user: { select: { name: true } } },
        orderBy: { at: 'desc' },
        take: 15,
      }),
      prisma.soldierPersonnelRecord.groupBy({
        by: ['category'],
        where: { deleted: false, record_date: { gte: first, lt: afterLast } },
        _count: { _all: true },
      }),
    ]);
  const policy = unitPolicyOf(settings);

  const outlets: Record<string, number> = { canteen: 0, buffet: 0 };
  for (const r of outletRows) outlets[r.kind] = r._count._all;

  const food: FoodRow[] = foodRows.map((t) => ({
    at: t.at,
    amount_cents: t.amount_cents,
    reversal_of: t.reversal_of,
    notes: t.notes,
    outlet_name: t.outlet.name,
    kind: t.outlet.kind,
    name: t.soldier.name,
    military_no: t.soldier.military_no,
  }));

  return {
    date,
    period,
    from: first,
    to: new Date(Date.parse(`${afterLast}T12:00:00Z`) - 86400000).toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    unit: { name: settings.unitName || 'الوحدة', parentFormation: settings.parentFormation || '' },
    snapshot: {
      soldiers: tallySoldiers(soldierRows),
      permits: { activeOutside, late },
      outlets,
    },
    activity: {
      gate: bucketGate(
        gateRows.map((e) => ({
          kind: e.kind,
          at: e.at,
          reason: e.permit.reason,
          name: e.soldier.name,
          military_no: e.soldier.military_no,
        })),
      ),
      visitors: tallyVisitors(
        visitorRows.map((v) => ({
          check_in: v.check_in,
          check_out: v.check_out,
          purpose: v.purpose,
          name: v.visitor.name,
          badge_no: v.card_no == null ? v.visitor.badge_no : String(v.card_no),
          category_name: v.visitor.category.name,
        })),
      ),
      canteen: tallyFood(food, 'canteen'),
      buffet: tallyFood(food, 'buffet'),
      fitness: tallyFitness(
        fitnessRows.map((r) => ({
          date: r.date,
          type: r.type,
          value: r.value,
          unit: r.unit,
          name: r.soldier.name,
          military_no: r.soldier.military_no,
          score: fitnessScore(policy.fitnessStandards, r.type, r.unit, r.value),
        })),
        policy.gradeScale,
      ),
      gateTimeline: gateTimeline(gateRows, period, first, afterLast),
      personnel: Object.fromEntries(personnelRows.map((r) => [r.category, r._count._all])),
    },
    audit: auditRows.map((r) => ({ at: r.at, action: r.action, username: r.user.name })),
  };
}
