import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError, requireValue } from '@/common/errors/AppError';
import { fingerprint, requestMessage, verify } from '@/common/utils/crypto';
import { isUuid } from '@/common/utils/validation';
import type { Store } from '@/common/store/Store';
import type { Actor, Ctx, CtxBase, Device, Input, License, LicenseProvider } from './types';
import type { SessionStore } from './sessions';

const MB = 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const DEFAULT_BODY_MB = 8;
/** Routes that accept large uploads (everything else is capped at 8 MB). */
const BODY_LIMITS_MB: Record<string, number> = {
  'POST /api/soldiers': 32,
  'POST /api/soldier/update': 32,
  'POST /api/soldiers/import': 48,
  'POST /api/backup/import': 48,
  'POST /api/import/preview': 48,
  'POST /api/import/apply': 48,
};

export interface PipelineDeps {
  store: Store;
  sessions: SessionStore;
  licenseProvider?: LicenseProvider;
  clock: () => number;
  restoring: () => boolean;
  track: (res: Response) => void;
}

interface Locals {
  base: CtxBase;
  rawBody: string;
  data: Input;
  device: Device;
  license: License;
  deviceId: string;
  actor: Actor;
  token: string;
  session: ReturnType<SessionStore['find']>;
  ctx: Ctx;
}

export const locals = (res: Response): Locals => res.locals as Locals;

/** JSON headers shared by every response, errors included. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

/** Refuses traffic while a restore runs and counts in-flight requests (restore needs to run alone). */
export const restoreGate =
  (deps: PipelineDeps): RequestHandler =>
  (_req, res, next) => {
    requireValue(!deps.restoring(), 'الخادم في وضع الاستعادة؛ حاول بعد قليل', 503);
    deps.track(res);
    next();
  };

/**
 * Captures the request body as raw text BEFORE any JSON parsing: the device signature covers the exact bytes.
 * (No express.json(): re-serialising would break signature verification.)
 */
export const captureRawBody: RequestHandler = async (req, res, next) => {
  try {
    const pathname = new URL(req.originalUrl, 'https://server.invalid').pathname;
    const limit = (BODY_LIMITS_MB[`${req.method} ${pathname}`] ?? DEFAULT_BODY_MB) * MB;
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      requireValue(bytes <= limit, 'حجم الطلب أكبر من المسموح', 413);
      chunks.push(chunk);
    }
    locals(res).rawBody = Buffer.concat(chunks).toString('utf8');
    next();
  } catch (error) {
    next(error);
  }
};

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Method gate, device signature (known device, fresh timestamp+nonce, Ed25519, no replay) and JSON body. */
export const deviceAuth =
  (deps: PipelineDeps): RequestHandler =>
  (req, res, next) => {
    requireValue(['GET', 'POST'].includes(req.method), 'طريقة غير مسموحة', 405);
    deps.sessions.prune();
    const license = deps.licenseProvider?.() ?? { installation: 'شؤون الأفراد', devices: [] };
    const deviceId = header(req.headers, 'x-device-id');
    let device = license.devices.find((d) => d.id === deviceId);
    if (!deps.licenseProvider) {
      requireValue(isUuid(deviceId), 'هوية الجهاز غير صالحة', 401);
      const encodedKey = header(req.headers, 'x-device-key');
      requireValue(encodedKey && encodedKey.length < 2048, 'مفتاح الجهاز مطلوب', 401);
      device = { id: deviceId, kind: 'internal', publicKey: Buffer.from(encodedKey, 'base64').toString('utf8') };
    }
    requireValue(device, 'هذا الجهاز غير معتمد؛ تواصل مع الجهة المالكة', 403);
    const timestamp = header(req.headers, 'x-timestamp');
    const nonce = header(req.headers, 'x-nonce');
    requireValue(
      typeof timestamp === 'string' &&
        /^\d{13}$/.test(timestamp) &&
        Math.abs(deps.clock() - Number(timestamp)) < MAX_CLOCK_SKEW_MS &&
        isUuid(nonce),
      'طلب منتهي أو هوية غير صالحة',
      401,
    );
    const rawBody = locals(res).rawBody;
    const message = requestMessage({
      deviceId: device.id,
      timestamp,
      nonce,
      method: req.method,
      path: req.originalUrl,
      body: rawBody,
    });
    requireValue(
      verify(device.publicKey, message, header(req.headers, 'x-signature') ?? ''),
      'تعذر التحقق من هوية الجهاز',
      401,
    );
    // Only a correctly signed request may occupy a nonce slot.
    // Bind sessions to the verified key, preventing reuse with a copied device id.
    const sessionDeviceId = deps.licenseProvider ? device.id : fingerprint(device.publicKey);
    deps.sessions.useNonce(sessionDeviceId, nonce);
    let data: unknown = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      requireValue(false, 'صيغة الطلب غير صحيحة');
    }
    requireValue(data && typeof data === 'object' && !Array.isArray(data), 'الطلب غير صالح');
    Object.assign(res.locals, { license, device, deviceId: sessionDeviceId, data });
    next();
  };

/** Resolves the bearer-token session (bound to the device) except for the public login route. */
export const sessionAuth =
  (deps: PipelineDeps): RequestHandler =>
  async (req, res, next) => {
    try {
      const l = locals(res);
      const isPublic =
        req.method === 'POST' && new URL(req.originalUrl, 'https://server.invalid').pathname === '/api/login';
      let actor = undefined as Actor | undefined;
      let token = '';
      if (!isPublic) {
        token = (req.headers.authorization || '').replace(/^Bearer /, '');
        const session = deps.sessions.find(token, l.deviceId);
        requireValue(session, 'انتهت الجلسة؛ سجل الدخول', 401);
        const user = await deps.store.userById(session.userId);
        requireValue(user && user.auth_version === session.authVersion, 'الحساب معطل أو تغير؛ سجل الدخول', 401);
        if (!deps.licenseProvider) l.device.kind = user.role === 'gate' ? 'gate' : 'internal';
        actor = { user, deviceId: l.deviceId, kind: l.device.kind };
        l.session = session;
      }
      Object.assign(res.locals, { actor, token });
      next();
    } catch (error) {
      next(error);
    }
  };

export const notFound: RequestHandler = () => {
  throw new AppError(404, 'الوظيفة غير موجودة');
};

const ERROR_MESSAGES: Record<number, string> = {
  409: 'سجل مكرر أو حركة متعارضة؛ حدّث البيانات',
  400: 'القيم لا تحقق شروط العملية',
  500: 'تعذر تنفيذ العملية؛ راجع اتصال الخادم وقاعدة البيانات',
};

/** Maps database errors (unique / check violations) to HTTP statuses. */
function statusOf(error: unknown): number {
  const e = error as { status?: number; code?: string; message?: string };
  if (e.status) return e.status;
  const detail = `${e.code ?? ''} ${e.message ?? ''} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`;
  if (e.code === 'P2002' || /UNIQUE constraint failed/i.test(detail)) return 409;
  if (/CHECK constraint failed/i.test(detail)) return 400;
  return 500;
}

export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) return next(error);
  const status = statusOf(error);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      error: (error as { status?: number }).status ? (error as Error).message : ERROR_MESSAGES[status],
    }),
  );
  if (status === 500) console.error('API failure', (error as { code?: string }).code || (error as Error).name);
};
