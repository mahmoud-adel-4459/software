import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { text } from '@/common/utils/validation';

/** A fitness test and the result that scores 100%. `higher`: repetitions; `lower`: a time. */
export interface FitnessStandard {
  name: string;
  unit: string;
  target: number;
  better: 'higher' | 'lower';
}
/** Lowest percentage that earns `label`; bands are kept from the highest to the lowest. */
export interface GradeBand {
  label: string;
  min: number;
}

/** 0 = no minimum until the administrator sets one in Settings. */
export const DEFAULT_GATE_MIN_MINUTES = 0;
export const DEFAULT_FITNESS_STANDARDS: FitnessStandard[] = [
  { name: 'عقلة', unit: 'مرة', target: 22, better: 'higher' },
  { name: 'ضغط', unit: 'مرة', target: 55, better: 'higher' },
  { name: 'بطن', unit: 'مرة', target: 80, better: 'higher' },
  { name: 'جري معدل', unit: 'ثانية', target: 45, better: 'lower' },
  { name: 'جري ترددي', unit: 'ثانية', target: 47, better: 'lower' },
  { name: 'جري الضاحية 3 كم', unit: 'دقيقة', target: 12, better: 'lower' },
];
export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { label: 'ممتاز', min: 90 },
  { label: 'جيد جدًا', min: 80 },
  { label: 'جيد', min: 65 },
  { label: 'مقبول', min: 50 },
];
export const BELOW_LAST_GRADE = 'ضعيف';

interface StoredPolicy {
  gateMinMinutes?: unknown;
  fitnessStandards?: unknown;
  gradeScale?: unknown;
}

export function unitPolicyOf(settings: StoredPolicy) {
  return {
    gateMinMinutes: typeof settings.gateMinMinutes === 'number' ? settings.gateMinMinutes : DEFAULT_GATE_MIN_MINUTES,
    fitnessStandards: Array.isArray(settings.fitnessStandards)
      ? (settings.fitnessStandards as FitnessStandard[])
      : DEFAULT_FITNESS_STANDARDS,
    gradeScale: Array.isArray(settings.gradeScale) ? (settings.gradeScale as GradeBand[]) : DEFAULT_GRADE_SCALE,
  };
}

const positive = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;

function parseStandards(value: unknown): FitnessStandard[] {
  requireValue(Array.isArray(value) && value.length <= 50, 'قائمة اختبارات اللياقة غير صالحة');
  const standards = value.map((item: Input) => {
    requireValue(item && typeof item === 'object', 'اختبار لياقة غير صالح');
    const name = text(item.name, 80, true);
    requireValue(positive(item.target, 100000), `معيار «${name}» يجب أن يكون رقمًا أكبر من صفر`);
    requireValue(item.better === 'higher' || item.better === 'lower', `حدد طريقة احتساب «${name}»`);
    return { name, unit: text(item.unit, 20, true), target: item.target as number, better: item.better as 'higher' | 'lower' };
  });
  requireValue(new Set(standards.map((s) => s.name)).size === standards.length, 'اسم اختبار لياقة مكرر');
  return standards;
}

function parseScale(value: unknown): GradeBand[] {
  requireValue(Array.isArray(value) && value.length >= 1 && value.length <= 10, 'سلم التقديرات غير صالح');
  const bands = value.map((item: Input) => {
    requireValue(item && typeof item === 'object', 'تقدير غير صالح');
    const label = text(item.label, 40, true);
    requireValue(typeof item.min === 'number' && item.min >= 0 && item.min <= 100, `الحد الأدنى لتقدير «${label}» من 0 إلى 100`);
    return { label, min: item.min as number };
  });
  requireValue(new Set(bands.map((b) => b.label)).size === bands.length, 'تقدير مكرر');
  return bands.sort((a, b) => b.min - a.min);
}

/** Policy fields sent with the settings form; a field that was not sent keeps its stored value. */
export function parseUnitPolicy(data: Input, previous: StoredPolicy) {
  const current = unitPolicyOf(previous);
  if (data.gateMinMinutes !== undefined) {
    requireValue(
      Number.isInteger(data.gateMinMinutes) && (data.gateMinMinutes as number) >= 0 && (data.gateMinMinutes as number) <= 7 * 24 * 60,
      'أقل مدة بين الخروج والعودة بالدقائق من 0 إلى 10080',
    );
  }
  return {
    gateMinMinutes: data.gateMinMinutes === undefined ? current.gateMinMinutes : (data.gateMinMinutes as number),
    fitnessStandards: data.fitnessStandards === undefined ? current.fitnessStandards : parseStandards(data.fitnessStandards),
    gradeScale: data.gradeScale === undefined ? current.gradeScale : parseScale(data.gradeScale),
  };
}

/** Percentage of the standard achieved (capped at 100), or null when the test has no standard. */
export function fitnessScore(standards: FitnessStandard[], type: string, unit: string, value: number | null): number | null {
  const standard = standards.find((s) => s.name === type);
  if (!standard || value === null || standard.unit !== unit) return null;
  if (value <= 0) return standard.better === 'higher' ? 0 : null;
  const ratio = standard.better === 'higher' ? value / standard.target : standard.target / value;
  return Math.round(Math.min(1, ratio) * 1000) / 10;
}

export function gradeFor(scale: GradeBand[], percent: number | null): string | null {
  if (percent === null) return null;
  return [...scale].sort((a, b) => b.min - a.min).find((band) => percent >= band.min)?.label ?? BELOW_LAST_GRADE;
}
