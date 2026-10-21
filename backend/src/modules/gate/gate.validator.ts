import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { isUuid, text } from '@/common/utils/validation';

export const MILITARY_NO = /^\d{6,30}$/;

export interface MovementInput {
  soldierId: string;
  kind: 'exit' | 'entry';
  notes: string;
  reason?: string;
  expectedReturn?: string;
}

/** Validates a gate movement request into the shape gate.service expects. */
export function prepareMovement(data: Input): MovementInput {
  requireValue(
    isUuid(data.soldierId || '') && (data.kind === 'exit' || data.kind === 'entry'),
    'بيانات الحركة غير صحيحة',
  );
  const movement: MovementInput = {
    soldierId: data.soldierId as string,
    kind: data.kind,
    notes: text(data.notes || '', 1000),
  };
  if (data.kind === 'exit') {
    movement.reason = text(data.reason, 100, true);
    requireValue(
      typeof data.expectedReturn === 'string' && Number.isFinite(Date.parse(data.expectedReturn)),
      'موعد العودة غير صالح',
    );
    movement.expectedReturn = new Date(data.expectedReturn).toISOString();
  }
  return movement;
}
