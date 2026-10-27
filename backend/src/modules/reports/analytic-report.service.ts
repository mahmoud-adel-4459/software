import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx } from '@/common/http/types';
import { cairoDate, dayStart, nextDay } from '@/common/utils/time';
import { date, identifier, text } from '@/common/utils/validation';
import type { PrismaClient } from '@/config/prisma';
import { dateOnly } from '@/modules/fitness/fitness.service';
import { fitnessScore, gradeFor, unitPolicyOf, type FitnessStandard, type GradeBand } from '@/modules/settings/unit-policy';

/** Column type drives formatting in the preview, the PDF and Excel. */
type ColumnType = 'text' | 'number' | 'money' | 'percent';
export interface Column { key: string; label: string; type?: ColumnType; total?: boolean }
export interface Table { title: string; columns: Column[]; rows: Record<string, string | number | null>[] }
export interface Kpi { label: string; value: number | string | null; unit?: string; previous?: number | null }
export interface Section { id: string; title: string; kpis: Kpi[]; tables: Table[] }

export const TOPICS = ['gate', 'canteen', 'buffet', 'fitness', 'leave', 'grant', 'reward', 'penalty', 'medical', 'security', 'evaluation', 'visitors', 'roster'] as const;
export type Topic = (typeof TOPICS)[number];
export const TOPIC_TITLES: Record<Topic, string> = {
  gate: 'حركات البوابة والتصاريح', canteen: 'الكانتين', buffet: 'البوفيه', fitness: 'اللياقة والتدريب',
  leave: 'الإجازات', grant: 'المنح', reward: 'المكافآت', penalty: 'الجزاءات والغرامات', medical: 'الموقف الطبي',
  security: 'الموقف الأمني', evaluation: 'التقييمات', visitors: 'الزوار', roster: 'قوة الأفراد',
};
const PERSONNEL: Partial<Record<Topic, string[]>> = {
  leave: ['leave'], grant: ['grant'], reward: ['reward'], penalty: ['penalty'],
  medical: ['medical', 'medical_affairs'], security: ['security_scan', 'security_report'], evaluation: ['evaluation'],
};
const PERSONNEL_LABELS: Record<string, string> = {
  leave: 'إجازة', grant: 'منحة', reward: 'مكافأة', penalty: 'جزاء', medical: 'أمر طبي', medical_affairs: 'موقف طبي',
  security_scan: 'مسح أمني', security_report: 'تقرير ضابط الأمن', evaluation: 'تقييم',
};

type Subject = { type: 'soldier'; soldierId: string } | { type: 'company'; company: string } | { type: 'unit' };
interface Period { from: string; to: string; start: Date; end: Date }
interface Env { prisma: PrismaClient; subject: Subject; standards: FitnessStandard[]; scale: GradeBand[]; now: Date }

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false });
/** "2026-10-20 08:30" in Cairo time. */
const stamp = (d: Date | null | undefined) => (d ? `${cairoDate(d)} ${timeFormat.format(d)}` : null);
const egp = (cents: number) => Math.round(cents) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null);
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

function period(from: string, to: string): Period {
  return { from, to, start: new Date(dayStart(from)), end: new Date(dayStart(nextDay(to))) };
}

/** The same number of days immediately before `p`. */
function previousPeriod(p: Period): Period {
  const to = prevDay(p.from);
  let from = to;
  for (let i = daysBetween(p.from, p.to); i > 0; i--) from = prevDay(from);
  return period(from, to);
}

/** Prisma `where` on the soldier relation for the report subject. */
const soldierWhere = (s: Subject) =>
  s.type === 'soldier' ? { id: s.soldierId } : s.type === 'company' ? { company: s.company } : {};
const many = (s: Subject) => s.type !== 'soldier';

function countBy<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r) || '—', (map.get(key(r) || '—') ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// ---- topic builders -------------------------------------------------------------------------

async function gateSection(env: Env, p: Period): Promise<Section> {
  const permits = await env.prisma.permit.findMany({
    where: { exit_at: { gte: p.start, lt: p.end }, voided: false, soldier: soldierWhere(env.subject) },
    include: { soldier: { select: { name: true, military_no: true, company: true } } },
    orderBy: { exit_at: 'desc' },
  });
  const isLate = (r: (typeof permits)[number]) =>
    r.returned_at ? r.returned_at > r.expected_return : r.expected_return < env.now;
  const returned = permits.filter((r) => r.returned_at);
  const hours = returned.map((r) => (r.returned_at!.getTime() - r.exit_at.getTime()) / 3600000);
  const late = permits.filter(isLate);
  const tables: Table[] = [
    { title: 'حسب سبب الخروج', columns: [{ key: 'reason', label: 'السبب' }, { key: 'count', label: 'مرات', type: 'number', total: true }],
      rows: countBy(permits, (r) => r.reason).map(([reason, count]) => ({ reason, count })) },
  ];
  if (many(env.subject)) {
    tables.push({ title: 'حسب السرية', columns: [{ key: 'company', label: 'السرية' }, { key: 'count', label: 'مرات', type: 'number', total: true }],
      rows: countBy(permits, (r) => r.soldier.company).map(([company, count]) => ({ company, count })) });
    tables.push({ title: 'الأكثر خروجًا', columns: [{ key: 'name', label: 'العسكري' }, { key: 'count', label: 'مرات', type: 'number' }],
      rows: countBy(permits, (r) => `${r.soldier.name} (${r.soldier.military_no})`).slice(0, 10).map(([name, count]) => ({ name, count })) });
  }
  tables.push({
    title: 'تفاصيل التصاريح',
    columns: [
      { key: 'no', label: 'رقم' }, { key: 'name', label: 'العسكري' }, { key: 'military_no', label: 'الرقم العسكري' },
      { key: 'reason', label: 'السبب' }, { key: 'exit', label: 'الخروج' }, { key: 'expected', label: 'العودة المتوقعة' },
      { key: 'returned', label: 'العودة الفعلية' }, { key: 'hours', label: 'المدة (ساعة)', type: 'number', total: true }, { key: 'late', label: 'متأخر' },
    ],
    rows: permits.map((r) => ({
      no: r.no, name: r.soldier.name, military_no: r.soldier.military_no, reason: r.reason,
      exit: stamp(r.exit_at), expected: stamp(r.expected_return), returned: stamp(r.returned_at) ?? 'لم يعد',
      hours: r.returned_at ? round1((r.returned_at.getTime() - r.exit_at.getTime()) / 3600000) : null, late: isLate(r) ? 'نعم' : '',
    })),
  });
  return {
    id: 'gate', title: TOPIC_TITLES.gate,
    kpis: [
      { label: 'مرات الخروج', value: permits.length }, { label: 'عادوا', value: returned.length },
      { label: 'لم يعودوا بعد', value: permits.length - returned.length }, { label: 'متأخرون عن الموعد', value: late.length },
      { label: 'متوسط مدة الخروج', value: mean(hours), unit: 'ساعة' },
    ],
    tables,
  };
}

async function foodSection(env: Env, p: Period, kind: 'canteen' | 'buffet'): Promise<Section> {
  const rows = await env.prisma.canteenTransaction.findMany({
    where: { at: { gte: p.start, lt: p.end }, outlet: { kind }, soldier: soldierWhere(env.subject) },
    include: { outlet: { select: { name: true } }, soldier: { select: { name: true, military_no: true, company: true } }, reversal: { select: { id: true } } },
    orderBy: { at: 'desc' },
  });
  const total = rows.reduce((s, r) => s + r.amount_cents, 0);
  const purchases = rows.filter((r) => r.amount_cents > 0);
  const byOutlet = new Map<string, { count: number; cents: number }>();
  const bySoldier = new Map<string, number>();
  for (const r of rows) {
    const o = byOutlet.get(r.outlet.name) ?? { count: 0, cents: 0 };
    o.count++; o.cents += r.amount_cents; byOutlet.set(r.outlet.name, o);
    const k = `${r.soldier.name} (${r.soldier.military_no})`;
    bySoldier.set(k, (bySoldier.get(k) ?? 0) + r.amount_cents);
  }
  const tables: Table[] = [{
    title: 'حسب نقطة البيع',
    columns: [{ key: 'outlet', label: 'النقطة' }, { key: 'count', label: 'العمليات', type: 'number', total: true }, { key: 'total', label: 'الإجمالي', type: 'money', total: true }],
    rows: [...byOutlet.entries()].map(([outlet, v]) => ({ outlet, count: v.count, total: egp(v.cents) })),
  }];
  if (many(env.subject)) {
    tables.push({ title: 'الأعلى إنفاقًا', columns: [{ key: 'name', label: 'العسكري' }, { key: 'total', label: 'الإجمالي', type: 'money' }],
      rows: [...bySoldier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, cents]) => ({ name, total: egp(cents) })) });
  }
  tables.push({
    title: 'تفاصيل العمليات',
    columns: [{ key: 'at', label: 'الوقت' }, { key: 'outlet', label: 'النقطة' }, { key: 'name', label: 'العسكري' }, { key: 'military_no', label: 'الرقم العسكري' },
      { key: 'amount', label: 'المبلغ', type: 'money', total: true }, { key: 'state', label: 'الحالة' }, { key: 'notes', label: 'ملاحظات' }],
    rows: rows.map((r) => ({
      at: stamp(r.at), outlet: r.outlet.name, name: r.soldier.name, military_no: r.soldier.military_no, amount: egp(r.amount_cents),
      state: r.reversal_of ? 'حركة عكسية' : r.reversal ? 'تم عكسها' : 'سارية', notes: r.notes,
    })),
  });
  return {
    id: kind, title: TOPIC_TITLES[kind],
    kpis: [
      { label: 'صافي المبيعات', value: egp(total), unit: 'ج.م' }, { label: 'عمليات شراء', value: purchases.length },
      { label: 'تصحيحات', value: rows.length - purchases.length },
      { label: 'متوسط العملية', value: purchases.length ? egp(purchases.reduce((s, r) => s + r.amount_cents, 0) / purchases.length) : null, unit: 'ج.م' },
    ],
    tables,
  };
}

async function fitnessSection(env: Env, p: Period): Promise<Section> {
  const rows = await env.prisma.fitnessRecord.findMany({
    where: { date: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, soldier: soldierWhere(env.subject) },
    include: { soldier: { select: { name: true, military_no: true } } },
    orderBy: { date: 'desc' },
  });
  const scored = rows.map((r) => ({ ...r, score: fitnessScore(env.standards, r.type, r.unit, r.value) }));
  const scores = scored.map((r) => r.score).filter((s): s is number => s !== null);
  const avg = mean(scores);
  const lowest = Math.min(...env.scale.map((b) => b.min));
  const byType = new Map<string, number[]>();
  const bySoldier = new Map<string, number[]>();
  for (const r of scored) {
    if (r.score === null) continue;
    byType.set(r.type, [...(byType.get(r.type) ?? []), r.score]);
    const k = `${r.soldier.name} (${r.soldier.military_no})`;
    bySoldier.set(k, [...(bySoldier.get(k) ?? []), r.score]);
  }
  const tables: Table[] = [{
    title: 'حسب الاختبار',
    columns: [{ key: 'type', label: 'الاختبار' }, { key: 'target', label: 'المعيار' }, { key: 'count', label: 'النتائج', type: 'number', total: true },
      { key: 'avg', label: 'متوسط النسبة', type: 'percent' }, { key: 'best', label: 'أعلى', type: 'percent' }, { key: 'worst', label: 'أدنى', type: 'percent' }],
    rows: env.standards.map((s) => {
      const v = byType.get(s.name) ?? [];
      return { type: s.name, target: `${s.target} ${s.unit}`, count: v.length, avg: mean(v), best: v.length ? Math.max(...v) : null, worst: v.length ? Math.min(...v) : null };
    }),
  }];
  if (many(env.subject)) {
    tables.push({
      title: 'ترتيب العسكريين',
      columns: [{ key: 'name', label: 'العسكري' }, { key: 'count', label: 'اختبارات', type: 'number' }, { key: 'avg', label: 'المتوسط', type: 'percent' }, { key: 'grade', label: 'التقدير' }],
      rows: [...bySoldier.entries()].map(([name, v]) => ({ name, count: v.length, avg: mean(v), grade: gradeFor(env.scale, mean(v)) }))
        .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)),
    });
  }
  tables.push({
    title: 'تفاصيل النتائج',
    columns: [{ key: 'date', label: 'التاريخ' }, { key: 'name', label: 'العسكري' }, { key: 'type', label: 'الاختبار' },
      { key: 'result', label: 'النتيجة' }, { key: 'score', label: 'النسبة', type: 'percent' }, { key: 'grade', label: 'التقدير' }],
    rows: scored.map((r) => ({
      date: r.date.toISOString().slice(0, 10), name: r.soldier.name, type: r.type, result: `${r.value ?? r.raw_result} ${r.unit}`,
      score: r.score, grade: gradeFor(env.scale, r.score),
    })),
  });
  return {
    id: 'fitness', title: TOPIC_TITLES.fitness,
    kpis: [
      { label: 'نتائج مسجلة', value: rows.length }, { label: 'متوسط النسبة', value: avg, unit: '%' },
      { label: 'التقدير', value: gradeFor(env.scale, avg) }, { label: `أقل من ${lowest}%`, value: scores.filter((s) => s < lowest).length },
    ],
    tables,
  };
}

async function personnelSection(env: Env, p: Period, topic: Topic): Promise<Section> {
  const categories = PERSONNEL[topic]!;
  const rows = await env.prisma.soldierPersonnelRecord.findMany({
    where: { category: { in: categories }, deleted: false, record_date: { gte: p.from, lte: p.to }, soldier: soldierWhere(env.subject) },
    include: { soldier: { select: { name: true, military_no: true, company: true } } },
    orderBy: [{ record_date: 'desc' }, { created_at: 'desc' }],
  });
  const kpis: Kpi[] = [{ label: 'عدد السجلات', value: rows.length }];
  if (topic === 'leave') {
    const days = rows.reduce((s, r) => s + (r.end_date ? daysBetween(r.record_date, r.end_date) + 1 : 1), 0);
    kpis.push({ label: 'إجمالي أيام الإجازات', value: days, unit: 'يوم' });
    kpis.push({ label: 'في إجازة اليوم', value: rows.filter((r) => r.record_date <= cairoDate(env.now) && (r.end_date ?? r.record_date) >= cairoDate(env.now)).length });
  }
  if (many(env.subject)) kpis.push({ label: 'عسكريون معنيون', value: new Set(rows.map((r) => r.soldier_id)).size });
  const tables: Table[] = [];
  if (categories.length > 1) {
    tables.push({ title: 'حسب النوع', columns: [{ key: 'kind', label: 'النوع' }, { key: 'count', label: 'العدد', type: 'number', total: true }],
      rows: countBy(rows, (r) => PERSONNEL_LABELS[r.category] ?? r.category).map(([kind, count]) => ({ kind, count })) });
  }
  tables.push({ title: topic === 'evaluation' ? 'توزيع التقديرات' : 'حسب البيان', columns: [{ key: 'title', label: topic === 'evaluation' ? 'التقدير' : 'البيان' }, { key: 'count', label: 'العدد', type: 'number', total: true }],
    rows: countBy(rows, (r) => r.title).map(([title, count]) => ({ title, count })) });
  if (many(env.subject)) {
    tables.push({ title: 'حسب السرية', columns: [{ key: 'company', label: 'السرية' }, { key: 'count', label: 'العدد', type: 'number', total: true }],
      rows: countBy(rows, (r) => r.soldier.company).map(([company, count]) => ({ company, count })) });
  }
  const leave = topic === 'leave';
  tables.push({
    title: 'التفاصيل',
    columns: [
      { key: 'from', label: leave ? 'الخروج' : 'التاريخ' }, { key: 'to', label: leave ? 'العودة' : 'النهاية' },
      ...(leave ? [{ key: 'days', label: 'الأيام', type: 'number' as const, total: true }] : []),
      { key: 'name', label: 'العسكري' }, { key: 'military_no', label: 'الرقم العسكري' },
      ...(categories.length > 1 ? [{ key: 'kind', label: 'النوع' }] : []),
      { key: 'title', label: topic === 'evaluation' ? 'التقدير' : 'البيان' }, { key: 'reference', label: 'المرجع' }, { key: 'details', label: 'التفاصيل' },
    ],
    rows: rows.map((r) => ({
      from: `${r.record_date}${r.start_time ? ` ${r.start_time}` : ''}`, to: r.end_date ? `${r.end_date}${r.end_time ? ` ${r.end_time}` : ''}` : null,
      days: leave ? (r.end_date ? daysBetween(r.record_date, r.end_date) + 1 : 1) : null,
      name: r.soldier.name, military_no: r.soldier.military_no, kind: PERSONNEL_LABELS[r.category] ?? r.category,
      title: r.title, reference: r.reference, details: r.details,
    })),
  });
  return { id: topic, title: TOPIC_TITLES[topic], kpis, tables };
}

async function visitorsSection(env: Env, p: Period): Promise<Section> {
  const rows = await env.prisma.visitorVisit.findMany({
    where: { check_in: { gte: p.start, lt: p.end }, voided: false },
    include: { visitor: { include: { category: { select: { name: true } } } } },
    orderBy: { check_in: 'desc' },
  });
  return {
    id: 'visitors', title: TOPIC_TITLES.visitors,
    kpis: [{ label: 'زيارات', value: rows.length }, { label: 'ما زالوا بالداخل', value: rows.filter((r) => !r.check_out).length }],
    tables: [
      { title: 'حسب الفئة', columns: [{ key: 'category', label: 'الفئة' }, { key: 'count', label: 'زيارات', type: 'number', total: true }],
        rows: countBy(rows, (r) => r.visitor.category.name).map(([category, count]) => ({ category, count })) },
      { title: 'تفاصيل الزيارات',
        columns: [{ key: 'in', label: 'الدخول' }, { key: 'out', label: 'الخروج' }, { key: 'name', label: 'الزائر' }, { key: 'category', label: 'الفئة' },
          { key: 'organization', label: 'الجهة' }, { key: 'purpose', label: 'سبب الزيارة' }],
        rows: rows.map((r) => ({ in: stamp(r.check_in), out: stamp(r.check_out) ?? 'بالداخل', name: r.visitor.name, category: r.visitor.category.name,
          organization: r.visitor.organization, purpose: r.purpose })) },
    ],
  };
}

async function rosterSection(env: Env): Promise<Section> {
  const rows = await env.prisma.soldier.findMany({
    where: { archived: false, ...soldierWhere(env.subject) },
    orderBy: [{ company: 'asc' }, { name: 'asc' }],
  });
  const by = (title: string, label: string, key: (r: (typeof rows)[number]) => string): Table => ({
    title, columns: [{ key: 'k', label }, { key: 'count', label: 'العدد', type: 'number', total: true }],
    rows: countBy(rows, key).map(([k, count]) => ({ k, count })),
  });
  return {
    id: 'roster', title: TOPIC_TITLES.roster,
    kpis: [{ label: 'القوة', value: rows.length }, { label: 'داخل الوحدة', value: rows.filter((r) => r.status === 'in').length },
      { label: 'خارج الوحدة', value: rows.filter((r) => r.status !== 'in').length }],
    tables: [
      by('حسب السرية', 'السرية', (r) => r.company), by('حسب الدرجة', 'الدرجة', (r) => r.rank), by('حسب الرتبة', 'الرتبة', (r) => r.military_rank),
      { title: 'كشف الأفراد',
        columns: [{ key: 'name', label: 'الاسم' }, { key: 'military_no', label: 'الرقم العسكري' }, { key: 'rank', label: 'الدرجة' }, { key: 'military_rank', label: 'الرتبة' },
          { key: 'company', label: 'السرية' }, { key: 'sub_unit', label: 'الوحدة الفرعية' }, { key: 'status', label: 'الحالة' }],
        rows: rows.map((r) => ({ name: r.name, military_no: r.military_no, rank: r.rank, military_rank: r.military_rank, company: r.company,
          sub_unit: r.sub_unit, status: r.status === 'in' ? 'داخل الوحدة' : 'خارج الوحدة' })) },
    ],
  };
}

function buildSection(env: Env, p: Period, topic: Topic): Promise<Section> {
  if (topic === 'gate') return gateSection(env, p);
  if (topic === 'canteen' || topic === 'buffet') return foodSection(env, p, topic);
  if (topic === 'fitness') return fitnessSection(env, p);
  if (topic === 'visitors') return visitorsSection(env, p);
  if (topic === 'roster') return rosterSection(env);
  return personnelSection(env, p, topic);
}

/** Rows that need the commander's attention, taken from the built sections. */
function exceptions(sections: Section[], scale: GradeBand[]): Table[] {
  const out: Table[] = [];
  const detail = (id: string) => {
    const t = sections.find((s) => s.id === id)?.tables.at(-1);
    return t && { ...t, columns: t.columns.map((c) => ({ ...c, total: false })) };
  };
  const gate = detail('gate');
  if (gate) {
    const rows = gate.rows.filter((r) => r.late === 'نعم');
    if (rows.length) out.push({ ...gate, title: 'متأخرون عن موعد العودة', rows });
  }
  const fitness = detail('fitness');
  const lowest = Math.min(...scale.map((b) => b.min));
  if (fitness) {
    const rows = fitness.rows.filter((r) => typeof r.score === 'number' && r.score < lowest);
    if (rows.length) out.push({ ...fitness, title: `نتائج لياقة أقل من ${lowest}%`, rows });
  }
  const penalty = detail('penalty');
  if (penalty) {
    const repeated = countBy(penalty.rows, (r) => `${r.name} (${r.military_no})`).filter(([, n]) => n >= 2);
    if (repeated.length) out.push({ title: 'جزاءات متكررة في الفترة', columns: [{ key: 'name', label: 'العسكري' }, { key: 'count', label: 'عدد الجزاءات', type: 'number' }],
      rows: repeated.map(([name, count]) => ({ name, count })) });
  }
  return out;
}

async function soldierProfile(env: Env, soldierId: string): Promise<{ label: string; table: Table; kpis: Kpi[] }> {
  const s = await env.prisma.soldier.findUnique({ where: { id: soldierId } });
  requireValue(s, 'العسكري غير موجود', 404);
  const latest = await env.prisma.fitnessRecord.findMany({ where: { soldier_id: soldierId }, orderBy: { date: 'desc' } });
  const scores = env.standards
    .map((st) => latest.find((r) => r.type === st.name))
    .map((r) => (r ? fitnessScore(env.standards, r.type, r.unit, r.value) : null))
    .filter((v): v is number => v !== null);
  const final = await env.prisma.soldierPersonnelRecord.findFirst({
    where: { soldier_id: soldierId, category: 'evaluation', deleted: false }, orderBy: [{ record_date: 'desc' }, { created_at: 'desc' }],
  });
  const avg = mean(scores);
  const pairs: [string, string][] = [
    ['الاسم', s.name], ['الرقم العسكري', s.military_no], ['الرقم القومي', s.national_id], ['الدرجة', s.rank], ['الرتبة', s.military_rank || '—'],
    ['السرية', s.company], ['الوحدة', s.unit], ['الوحدة الفرعية', s.sub_unit || '—'], ['الهاتف', s.phone || '—'],
    ['الحالة الآن', s.status === 'in' ? 'داخل الوحدة' : 'خارج الوحدة'],
  ];
  return {
    label: `${s.military_rank || s.rank} / ${s.name} (${s.military_no})`,
    table: { title: 'البيانات الأساسية', columns: [{ key: 'field', label: 'البيان' }, { key: 'value', label: 'القيمة' }], rows: pairs.map(([field, value]) => ({ field, value })) },
    kpis: [
      { label: 'متوسط اللياقة (آخر نتيجة لكل اختبار)', value: avg, unit: '%' },
      { label: 'التقدير المقترح', value: gradeFor(env.scale, avg) },
      { label: 'التقدير النهائي', value: final?.title ?? 'لم يُحدد' },
    ],
  };
}

/** Analytical report on a soldier, a company or the whole unit, for any period, optionally against the previous one. */
export async function buildAnalyticReport(ctx: Ctx) {
  const subjectType = param(ctx, 'subject') || 'unit';
  requireValue(['soldier', 'company', 'unit'].includes(subjectType), 'موضوع التقرير غير صالح');
  const subject: Subject = subjectType === 'soldier'
    ? { type: 'soldier', soldierId: identifier(param(ctx, 'soldierId')) }
    : subjectType === 'company' ? { type: 'company', company: text(param(ctx, 'company'), 100, true) } : { type: 'unit' };
  const today = cairoDate(new Date(ctx.clock()));
  const from = date(param(ctx, 'from') || today);
  const to = date(param(ctx, 'to') || from);
  requireValue(from <= to, 'تاريخ البداية بعد النهاية');
  requireValue(daysBetween(from, to) <= 3 * 366, 'أقصى مدة للتقرير 3 سنوات');
  const requested = (param(ctx, 'topics') || '').split(',').filter(Boolean);
  requireValue(requested.every((t) => (TOPICS as readonly string[]).includes(t)), 'قسم غير صالح في التقرير');
  let topics = (requested.length ? requested : [...TOPICS]) as Topic[];
  if (subject.type !== 'unit') topics = topics.filter((t) => t !== 'visitors');
  if (subject.type === 'soldier') topics = topics.filter((t) => t !== 'roster');
  requireValue(topics.length, 'اختر قسمًا واحدًا على الأقل');

  const prisma = ctx.store.prisma;
  const settings = ((await prisma.settings.findUnique({ where: { id: 1 } }))?.data ?? {}) as Record<string, unknown>;
  const policy = unitPolicyOf(settings);
  const env: Env = { prisma, subject, standards: policy.fitnessStandards, scale: policy.gradeScale, now: new Date(ctx.clock()) };
  const current = period(from, to);
  const sections: Section[] = [];
  for (const topic of topics) sections.push(await buildSection(env, current, topic));

  const compare = param(ctx, 'compare') === '1';
  const previous = compare ? previousPeriod(current) : null;
  if (previous) {
    for (const [i, topic] of topics.entries()) {
      if (topic === 'roster') continue;
      const before = await buildSection(env, previous, topic);
      sections[i]!.kpis.forEach((k, j) => {
        const v = before.kpis[j]?.value;
        if (typeof k.value === 'number' || k.value === null) k.previous = typeof v === 'number' ? v : null;
      });
    }
  }

  let subjectLabel = 'الوحدة كلها';
  const profile = subject.type === 'soldier' ? await soldierProfile(env, subject.soldierId) : null;
  if (profile) subjectLabel = profile.label;
  if (subject.type === 'company') subjectLabel = `السرية: ${subject.company}`;

  const summary: Kpi[] = [...(profile?.kpis ?? []), ...sections.map((s) => ({ ...s.kpis[0]!, label: `${s.title} — ${s.kpis[0]!.label}` }))];
  return {
    title: subject.type === 'soldier' ? 'تقرير مفصل عن عسكري' : subject.type === 'company' ? 'تقرير مفصل عن سرية' : 'تقرير الوحدة المفصل',
    subject: { type: subject.type, label: subjectLabel },
    from, to, days: daysBetween(from, to) + 1,
    previous: previous ? { from: previous.from, to: previous.to } : null,
    generatedAt: env.now.toISOString(),
    generatedBy: ctx.actor.user.name,
    unit: { name: String(settings.unitName || 'الوحدة'), parentFormation: String(settings.parentFormation || '') },
    topics,
    summary,
    exceptions: exceptions(sections, env.scale),
    profile: profile?.table ?? null,
    sections,
  };
}
