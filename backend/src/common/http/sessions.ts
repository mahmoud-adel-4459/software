import { randomBytes } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';

const SESSION_TTL_MS = 30 * 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_SESSIONS = 1000;
const MAX_NONCES = 10000;

export interface Session {
  userId: string;
  deviceId: string;
  authVersion: number;
  expires: number;
}

/** In-memory login sessions, replay-protection nonces and failed-login counters; all self-expiring. */
export class SessionStore {
  readonly sessions = new Map<string, Session>();
  private readonly nonces = new Map<string, number>();
  private readonly attempts = new Map<string, { count: number; expires: number }>();

  constructor(private readonly clock: () => number = Date.now) {}

  prune(): void {
    const now = this.clock();
    for (const [key, expires] of this.nonces) if (expires < now) this.nonces.delete(key);
    for (const [key, value] of this.sessions) if (value.expires < now) this.sessions.delete(key);
    for (const [key, value] of this.attempts) if (value.expires < now) this.attempts.delete(key);
  }

  /** Rejects a signed request that was already seen (replay) and remembers the new one. */
  useNonce(deviceId: string, nonce: string): void {
    const key = `${deviceId}:${nonce}`;
    requireValue(!this.nonces.has(key), 'لا يمكن إعادة استخدام توقيع الطلب', 401);
    requireValue(this.nonces.size < MAX_NONCES, 'طلبات كثيرة؛ حاول بعد قليل', 429);
    this.nonces.set(key, this.clock() + NONCE_TTL_MS);
  }

  /** Counts a login attempt for the device; throws once the limit is reached. */
  registerLoginAttempt(deviceId: string): void {
    const counter = this.attempts.get(deviceId) ?? { count: 0, expires: this.clock() + LOGIN_WINDOW_MS };
    requireValue(counter.count < MAX_LOGIN_ATTEMPTS, 'محاولات كثيرة؛ انتظر خمس دقائق', 429);
    counter.count++;
    this.attempts.set(deviceId, counter);
  }

  clearLoginAttempts(deviceId: string): void {
    this.attempts.delete(deviceId);
  }

  create({ userId, deviceId, authVersion }: Omit<Session, 'expires'>): string {
    requireValue(this.sessions.size < MAX_SESSIONS, 'جلسات كثيرة؛ حاول لاحقًا', 429);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { userId, deviceId, authVersion, expires: this.clock() + SESSION_TTL_MS });
    return token;
  }

  /** Valid session of this device for the bearer token, or undefined. */
  find(token: string, deviceId: string): Session | undefined {
    const session = this.sessions.get(token);
    return session && session.deviceId === deviceId && session.expires > this.clock() ? session : undefined;
  }

  /** Successful writes keep an active user signed in. */
  touch(session: Session): void {
    session.expires = this.clock() + SESSION_TTL_MS;
  }

  destroy(token: string): void {
    this.sessions.delete(token);
  }

  clear(): void {
    this.sessions.clear();
  }
}
