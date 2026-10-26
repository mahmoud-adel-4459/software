import { requireValue } from '@/common/errors/AppError';
import { checkPassword } from '@/common/utils/crypto';
import type { Ctx } from '@/common/http/types';
import { loginInput } from './auth.validator';

// Compared against when the username is unknown, so response time does not reveal valid usernames.
const DUMMY_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

/** Verifies credentials (rate-limited per device) and opens an in-memory session bound to the device. */
export async function login(ctx: Ctx) {
  const { store, sessions, deviceId, device, license } = ctx;
  sessions.registerLoginAttempt(deviceId);
  const { username, password } = loginInput(ctx.data);
  const user = await store.user(username);
  const valid = await checkPassword(password, user?.password_hash || DUMMY_HASH);
  requireValue(user && valid, 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  sessions.clearLoginAttempts(deviceId);
  const token = sessions.create({ userId: user.id, deviceId, authVersion: user.auth_version });
  return {
    token,
    user: { name: user.name, username: user.username, role: user.role },
    kind: user.role === 'gate' ? 'gate' : device.kind,
    installation: license.installation,
  };
}

export function logout({ sessions, token }: Ctx) {
  sessions.destroy(token);
  return { ok: true };
}
