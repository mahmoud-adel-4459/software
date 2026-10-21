import { requireValue } from '@/common/errors/AppError';
import { cairoHour, dayStart, nextDay } from '@/common/utils/time';
import type { Store } from '@/common/store/Store';
import { dateOnly, numericText } from '@/modules/fitness/fitness.service';

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
  rows: { date: Date; type: string; value: number | null; unit: string; name: string; military_no: string }[],
) {
  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.type, (byType.get(r.type) || 0) + 1);
  return {
    records: rows.length,
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    recent: rows.slice(0, 20).map((r) => ({
      date: r.date,
      type: r.type,
      value: numericText(r.value),
      unit: r.unit,
      name: r.name,
      military_no: r.military_no,
    })),
  };
}

/** Day summary (Cairo calendar day): snapshot of the unit plus the day's gate, food, visitor and fitness activity. */
export async function buildDailyReport(store: Store, date: string) {
  requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'تاريخ غير صالح');
  const start = new Date(dayStart(date));
  const end = new Date(dayStart(nextDay(date)));
  const range = { gte: start, lt: end };
  const prisma = store.prisma;
  const now = store.now();

  const settings = ((await prisma.settings.findUnique({ where: { id: 1 } }))?.data ?? {}) as Record<string, string>;
  const [soldierRows, activeOutside, late, gateRows, foodRows, visitorRows, fitnessRows, outletRows, auditRows] =
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
        where: { date: dateOnly(date) },
        include: { soldier: { select: { name: true, military_no: true } } },
      }),
      prisma.foodOutlet.groupBy({ by: ['kind'], where: { disabled: false }, _count: { _all: true } }),
      prisma.auditLog.findMany({
        where: { at: range },
        include: { user: { select: { name: true } } },
        orderBy: { at: 'desc' },
        take: 15,
      }),
    ]);

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
          badge_no: v.visitor.badge_no,
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
        })),
      ),
    },
    audit: auditRows.map((r) => ({ at: r.at, action: r.action, username: r.user.name })),
  };
}
