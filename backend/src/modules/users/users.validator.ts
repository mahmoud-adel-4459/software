import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { hashPassword } from '@/common/utils/crypto';
import { identifier, text } from '@/common/utils/validation';

const ROLES = ['admin', 'gate', 'clerk'];

/** Password hashing is slow, so it runs before the database transaction opens. */
export async function newUserInput(data: Input) {
  const username = text(data.username, 80, true);
  const name = text(data.name, 200, true);
  requireValue(
    typeof data.role === 'string' &&
      ROLES.includes(data.role) &&
      typeof data.password === 'string' &&
      data.password.length >= 12 &&
      data.password.length <= 256,
    'اختر دورًا صحيحًا وكلمة مرور من 12 إلى 256 حرفًا',
  );
  return { username, name, role: data.role, passwordHash: await hashPassword(data.password) };
}

export interface UserUpdateInput {
  id: string;
  name: string;
  role: string;
  disabled: boolean;
  password: string | null;
}

/** Validates an account update in the legacy order (id, role/disabled, then password and name later). */
export function userUpdateInput(data: Input): { id: string; role: string; disabled: boolean } {
  const id = identifier(data.id);
  requireValue(
    typeof data.role === 'string' && ROLES.includes(data.role) && typeof data.disabled === 'boolean',
    'بيانات الحساب غير صالحة',
  );
  return { id, role: data.role, disabled: data.disabled };
}

export function newPassword(value: unknown): string {
  requireValue(
    typeof value === 'string' && value.length >= 12 && value.length <= 256,
    'كلمة المرور من 12 إلى 256 حرفًا',
  );
  return value;
}
