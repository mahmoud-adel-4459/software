import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { text } from '@/common/utils/validation';

export function loginInput(data: Input): { username: string; password: string } {
  const username = text(data.username, 80, true);
  const password = data.password;
  requireValue(typeof password === 'string' && password.length <= 256, 'بيانات الدخول غير صحيحة', 401);
  return { username, password };
}
