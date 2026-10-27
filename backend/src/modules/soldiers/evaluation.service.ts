import { requireValue } from '@/common/errors/AppError';
import { param } from '@/common/http/route';
import type { Ctx } from '@/common/http/types';
import { identifier } from '@/common/utils/validation';
import { numericText } from '@/modules/fitness/fitness.service';
import { BELOW_LAST_GRADE, fitnessScore, gradeFor, unitPolicyOf } from '@/modules/settings/unit-policy';

/**
 * The soldier's latest result in each fitness test against the Settings standards, their average,
 * the grade it suggests, and the final grade the administrator recorded (category «evaluation»).
 */
export async function soldierEvaluation(ctx: Ctx) {
  const soldierId = identifier(param(ctx, 'soldierId'));
  const prisma = ctx.store.prisma;
  requireValue(await prisma.soldier.findUnique({ where: { id: soldierId }, select: { id: true } }), 'العسكري غير موجود', 404);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const { fitnessStandards, gradeScale } = unitPolicyOf((settings?.data ?? {}) as object);
  const results = await prisma.fitnessRecord.findMany({ where: { soldier_id: soldierId }, orderBy: [{ date: 'desc' }, { id: 'asc' }] });
  const tests = fitnessStandards.map((standard) => {
    const latest = results.find((r) => r.type === standard.name);
    return {
      ...standard,
      value: latest ? numericText(latest.value) : null,
      date: latest?.date ?? null,
      score: latest ? fitnessScore(fitnessStandards, latest.type, latest.unit, latest.value) : null,
    };
  });
  const scores = tests.map((t) => t.score).filter((s): s is number => s !== null);
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const final = await prisma.soldierPersonnelRecord.findFirst({
    where: { soldier_id: soldierId, category: 'evaluation', deleted: false },
    orderBy: [{ record_date: 'desc' }, { created_at: 'desc' }],
  });
  return {
    tests,
    testedCount: scores.length,
    average,
    suggestedGrade: gradeFor(gradeScale, average),
    finalGrade: final ? { grade: final.title, date: final.record_date, details: final.details } : null,
    gradeLabels: [...[...gradeScale].sort((a, b) => b.min - a.min).map((b) => b.label), BELOW_LAST_GRADE],
  };
}
