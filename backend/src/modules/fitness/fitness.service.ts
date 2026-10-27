import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx, Input } from '@/common/http/types';
import { param } from '@/common/http/route';
import { lockActiveSoldier } from '@/common/store/lookups';
import { date, identifier, text } from '@/common/utils/validation';
import type { PrismaClient, Tx } from '@/config/prisma';
import { fitnessScore, unitPolicyOf, type FitnessStandard } from '@/modules/settings/unit-policy';

/** The fitness tests currently defined in Settings. */
export async function fitnessStandards(db: Tx | PrismaClient): Promise<FitnessStandard[]> {
  const row = await db.settings.findUnique({ where: { id: 1 } });
  return unitPolicyOf((row?.data ?? {}) as object).fitnessStandards;
}

/** Validates a test name against Settings and returns its standard. */
export function standardFor(standards: FitnessStandard[], type: unknown): FitnessStandard {
  const standard = typeof type === 'string' ? standards.find((s) => s.name === type) : undefined;
  requireValue(standard, 'نوع الاختبار غير معرّف في الإعدادات');
  return standard;
}

/** The legacy PostgreSQL `numeric` column serialised as a string; keep that JSON shape. */
export const numericText = (value: number | null): string | null => (value === null ? null : String(value));

/** Calendar date stored as UTC midnight (the legacy `date` column serialised as ...T00:00:00.000Z). */
export const dateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export async function listFitness(ctx: Ctx) {
  const soldierId = identifier(param(ctx, 'soldierId'));
  const rows = await ctx.store.prisma.fitnessRecord.findMany({
    where: { soldier_id: soldierId },
    select: {
      id: true,
      soldier_id: true,
      type: true,
      value: true,
      unit: true,
      date: true,
      notes: true,
      raw_result: true,
    },
    orderBy: { date: 'desc' },
  });
  const standards = await fitnessStandards(ctx.store.prisma);
  return {
    records: rows.map((r) => ({ ...r, value: numericText(r.value), score: fitnessScore(standards, r.type, r.unit, r.value) })),
  };
}

export async function addFitness(tx: Tx, data: Input, { actor }: Ctx) {
  await lockActiveSoldier(tx, data.soldierId);
  const standard = standardFor(await fitnessStandards(tx), data.type);
  requireValue(
    typeof data.value === 'number' &&
      Number.isFinite(data.value) &&
      data.value >= 0 &&
      data.value <= 100000,
    'نتيجة غير صالحة',
  );
  const row = await tx.fitnessRecord.create({
    data: {
      id: randomUUID(),
      soldier_id: data.soldierId as string,
      type: standard.name,
      value: data.value,
      unit: standard.unit,
      date: dateOnly(date(data.date)),
      notes: text(data.notes || '', 1000),
      created_by: actor.user.id,
    },
    select: { id: true, type: true, value: true, unit: true, date: true },
  });
  return { ...row, value: numericText(row.value) };
}
