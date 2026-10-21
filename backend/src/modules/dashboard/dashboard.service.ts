import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx } from '@/common/http/types';
import { cairoDate, dayStart, nextDay } from '@/common/utils/time';

interface GateDay {
  date: string;
  exits: number;
  entries: number;
}
interface CountDay {
  date: string;
  count: number;
}
interface CentsDay {
  date: string;
  cents: number;
}

const DAY_MS = 86400000;
const RANGES = [7, 30, 90];

const shiftDay = (day: string, delta: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Every calendar date from..to inclusive. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) days.push(d);
  return days;
}

function count<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return [...map]
    .map(([k, c]) => ({ key: k, count: c }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'ar'));
}

/** Admin dashboard: unit snapshot plus gate, visitor, food and fitness trends over the last 7/30/90 Cairo days. */
export async function dashboard(ctx: Ctx) {
  const raw = param(ctx, 'days');
  const days = raw === null ? 7 : Number(raw);
  requireValue(RANGES.includes(days), 'مدة غير صالحة');
  const prisma = ctx.store.prisma;
  const now = ctx.store.now();
  const to = cairoDate(now);
  const from = shiftDay(to, -(days - 1));
  const prevFrom = shiftDay(from, -days);
  const list = daysBetween(from, to);
  const startAt = new Date(dayStart(from));
  const endAt = new Date(dayStart(nextDay(to)));
  const prevAt = new Date(dayStart(prevFrom));
  const inRange = (at: Date) => at >= startAt;
  const dayOf = (at: Date) => cairoDate(at);
  const zero = <T>(make: (date: string) => T) => list.map(make);

  const [soldierRows, late, gateRows, visitRows, openVisits, foodRows, fitnessRows] = await Promise.all([
    prisma.soldier.findMany({ select: { status: true, archived: true, company: true } }),
    prisma.permit.count({ where: { returned_at: null, voided: false, expected_return: { lt: now } } }),
    prisma.gateEvent.findMany({
      where: { at: { gte: prevAt, lt: endAt } },
      select: {
        at: true,
        kind: true,
        permit: { select: { reason: true } },
        soldier: { select: { name: true, military_no: true } },
      },
      orderBy: { at: 'desc' },
    }),
    prisma.visitorVisit.findMany({
      where: { check_in: { gte: prevAt, lt: endAt }, voided: false },
      select: { check_in: true, visitor: { select: { category: { select: { name: true } } } } },
    }),
    prisma.visitorVisit.count({ where: { check_out: null, voided: false } }),
    prisma.canteenTransaction.findMany({
      where: { at: { gte: prevAt, lt: endAt } },
      select: { at: true, amount_cents: true, outlet: { select: { name: true, kind: true } } },
    }),
    prisma.fitnessRecord.findMany({
      where: { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
      select: { type: true },
    }),
  ]);

  const active = soldierRows.filter((s) => !s.archived);
  const inside = active.filter((s) => s.status === 'in').length;

  const gateCur = gateRows.filter((e) => inRange(e.at));
  const gateByDay = new Map(zero((date): [string, GateDay] => [date, { date, exits: 0, entries: 0 }]));
  for (const e of gateCur) {
    const slot = gateByDay.get(dayOf(e.at));
    if (slot && e.kind === 'exit') slot.exits++;
    else if (slot) slot.entries++;
  }
  const todaySlot = gateByDay.get(to)!;

  const visitCur = visitRows.filter((v) => inRange(v.check_in));
  const visitByDay = new Map(zero((date): [string, CountDay] => [date, { date, count: 0 }]));
  for (const v of visitCur) {
    const slot = visitByDay.get(dayOf(v.check_in));
    if (slot) slot.count++;
  }

  const food = (kind: string) => {
    const rows = foodRows.filter((t) => t.outlet.kind === kind);
    const cur = rows.filter((t) => inRange(t.at));
    const byDay = new Map(zero((date): [string, CentsDay] => [date, { date, cents: 0 }]));
    const byOutlet = new Map<string, number>();
    for (const t of cur) {
      const slot = byDay.get(dayOf(t.at));
      if (slot) slot.cents += t.amount_cents;
      byOutlet.set(t.outlet.name, (byOutlet.get(t.outlet.name) ?? 0) + t.amount_cents);
    }
    const sum = (items: typeof rows) => items.reduce((acc, t) => acc + t.amount_cents, 0);
    return {
      todayCents: byDay.get(to)!.cents,
      rangeCents: sum(cur),
      previousCents: sum(rows.filter((t) => !inRange(t.at))),
      byDay: [...byDay.values()],
      byOutlet: [...byOutlet].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
    };
  };

  return {
    range: { days, from, to },
    soldiers: {
      total: active.length,
      inside,
      outside: active.filter((s) => s.status === 'out').length,
      late,
      archived: soldierRows.length - active.length,
    },
    byCompany: count(active, (s) => s.company).map(({ key, count: n }) => ({ company: key, count: n })),
    gate: {
      today: { exits: todaySlot.exits, entries: todaySlot.entries },
      total: gateCur.length,
      previousTotal: gateRows.length - gateCur.length,
      byDay: [...gateByDay.values()],
      byReason: count(
        gateCur.filter((e) => e.kind === 'exit'),
        (e) => e.permit.reason,
      ).map(({ key, count: n }) => ({ reason: key, count: n })),
      recent: gateCur.slice(0, 10).map((e) => ({
        at: e.at,
        kind: e.kind,
        name: e.soldier.name,
        military_no: e.soldier.military_no,
        reason: e.permit.reason,
      })),
    },
    visitors: {
      today: visitByDay.get(to)!.count,
      inside: openVisits,
      total: visitCur.length,
      previousTotal: visitRows.length - visitCur.length,
      byDay: [...visitByDay.values()],
      byCategory: count(visitCur, (v) => v.visitor.category.name).map(({ key, count: n }) => ({
        category: key,
        count: n,
      })),
    },
    food: { canteen: food('canteen'), buffet: food('buffet') },
    fitness: {
      records: fitnessRows.length,
      byType: count(fitnessRows, (r) => r.type).map(({ key, count: n }) => ({ type: key, count: n })),
    },
  };
}
