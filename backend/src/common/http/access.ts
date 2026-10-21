import { requireValue } from '@/common/errors/AppError';
import type { Actor } from './types';

/**
 * Role checks. An actor is { user, deviceId, kind }: `kind` is the licensed device type
 * ('internal' office PC or 'gate' station) and `user.role` is the account role.
 */
export const isInternal = (actor: Actor): boolean => actor.kind === 'internal';
export const isAdmin = (actor: Actor): boolean => isInternal(actor) && actor.user.role === 'admin';

export function requireInternal(actor: Actor): void {
  requireValue(isInternal(actor), 'هذه الوظيفة متاحة للجهاز الداخلي فقط', 403);
}
export function requireAdmin(actor: Actor): void {
  requireValue(isAdmin(actor), 'هذه الوظيفة للمسؤول فقط', 403);
}
export function requireClerkOrAdmin(actor: Actor): void {
  requireValue(
    isInternal(actor) && ['admin', 'clerk'].includes(actor.user.role),
    'هذه الوظيفة للجهاز الداخلي (مسؤول أو كاشير) فقط',
    403,
  );
}
/** Gate station device, or an internal PC signed in as gate officer / admin. */
export function requireGate(actor: Actor): void {
  requireValue(
    actor.kind === 'gate' || (isInternal(actor) && ['gate', 'admin'].includes(actor.user.role)),
    'محطة البوابة فقط',
    403,
  );
}

export type Policy = 'any' | 'internal' | 'admin' | 'clerkOrAdmin' | 'gate' | ((actor: Actor) => void);

const POLICIES: Record<string, (actor: Actor) => void> = {
  any: () => {},
  internal: requireInternal,
  admin: requireAdmin,
  clerkOrAdmin: requireClerkOrAdmin,
  gate: requireGate,
};

export function applyPolicy(policy: Policy, actor: Actor): void {
  (typeof policy === 'function' ? policy : POLICIES[policy]!)(actor);
}
