import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Ctx, Input } from '@/common/http/types';
import { hashPassword } from '@/common/utils/crypto';
import { text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { newPassword, userUpdateInput } from './users.validator';

export async function listUsers(ctx: Ctx) {
  const users = await ctx.store.prisma.user.findMany({
    select: { id: true, username: true, name: true, role: true, disabled: true },
    orderBy: { username: 'asc' },
  });
  return { users };
}

export function createUser(tx: Tx, user: { username: string; name: string; role: string; passwordHash: string }) {
  return tx.user.create({
    data: {
      id: randomUUID(),
      username: user.username,
      name: user.name,
      password_hash: user.passwordHash,
      role: user.role,
    },
    select: { id: true, username: true, name: true, role: true },
  });
}

/** Changing role/password/disabled bumps auth_version, which signs the user out everywhere. */
export async function updateUser(tx: Tx, data: Input, { actor }: Ctx) {
  const { id, role, disabled } = userUpdateInput(data);
  const target = await tx.user.findUnique({ where: { id } });
  requireValue(target, 'المستخدم غير موجود', 404);
  if (target.role === 'admin' && !target.disabled && (role !== 'admin' || disabled)) {
    const admins = await tx.user.count({ where: { role: 'admin', disabled: false } });
    requireValue(admins > 1 && id !== actor.user.id, 'لا يمكن تعطيل حسابك أو آخر مسؤول', 409);
  }
  let passwordHash = target.password_hash;
  if (data.password) passwordHash = await hashPassword(newPassword(data.password));
  return tx.user.update({
    where: { id: target.id },
    data: {
      name: text(data.name, 200, true),
      role,
      disabled,
      password_hash: passwordHash,
      auth_version: { increment: 1 },
    },
    select: { id: true, name: true, role: true, disabled: true },
  });
}
