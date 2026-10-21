import type { RequestHandler, Response } from 'express';
import { requireValue } from '@/common/errors/AppError';
import { digest } from '@/common/utils/crypto';
import { isUuid } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { applyPolicy, type Policy } from './access';
import { locals } from './pipeline';
import type { Ctx, Input } from './types';

function buildCtx(req: Parameters<RequestHandler>[0], res: Response): Ctx {
  const l = locals(res);
  const header = req.headers['x-request-id'];
  const ctx: Ctx = {
    ...l.base,
    req,
    url: new URL(req.originalUrl, 'https://server.invalid'),
    data: l.data,
    deviceId: l.deviceId,
    device: l.device,
    license: l.license,
    requestId: Array.isArray(header) ? header[0] : header,
    actor: l.actor,
    token: l.token,
    session: l.session,
  };
  l.ctx = ctx;
  return ctx;
}

/** Sends the JSON response; successful writes keep an active session alive (reads/polling never do). */
function reply(ctx: Ctx, res: Response, status: number, body: unknown): void {
  if (ctx.req.method === 'POST' && ctx.session && ctx.sessions.sessions.has(ctx.token)) ctx.sessions.touch(ctx.session);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

/** Custom/read endpoint (the legacy `handle` route): policy check, then returns the JSON body. */
export function handle<T>(access: Policy, run: (ctx: Ctx) => T | Promise<T>, status = 200): RequestHandler {
  return async (req, res) => {
    const ctx = buildCtx(req, res);
    applyPolicy(access, ctx.actor);
    reply(ctx, res, status, await run(ctx));
  };
}

/** Request body used to recognise a retry; passwords are replaced by a digest. */
function retryFingerprint(path: string, data: Input): Record<string, unknown> {
  const { password, ...rest } = data;
  const body: Record<string, unknown> = { route: path, ...rest };
  if (password) body.credentialDigest = digest(password as string);
  return body;
}

export interface WriteOptions<I, R> {
  path: string;
  access: Policy;
  status?: number;
  /** Validation/transformation that runs BEFORE the transaction (e.g. slow password hashing). */
  prepare?: (ctx: Ctx) => I | Promise<I>;
  /** `false` when execute writes its own audit row. */
  audit?: { action: string; entity: (row: R) => string } | false;
  execute: (tx: Tx, input: I, ctx: Ctx) => Promise<R>;
}

/** Transactional, idempotent write (needs X-Request-Id; a retry returns the stored response). */
export function write<I = Input, R = { id: string }>(options: WriteOptions<I, R>): RequestHandler {
  const audit =
    options.audit === undefined
      ? { action: options.path.slice(5).replaceAll('/', '.'), entity: (row: R) => (row as { id: string }).id }
      : options.audit;
  return async (req, res) => {
    const ctx = buildCtx(req, res);
    applyPolicy(options.access, ctx.actor);
    requireValue(isUuid(ctx.requestId), 'معرف العملية مطلوب');
    const input = options.prepare ? await options.prepare(ctx) : (ctx.data as I);
    const body = await ctx.store.mutate(
      ctx.actor,
      ctx.requestId,
      retryFingerprint(options.path, ctx.data),
      async (tx) => {
        const row = await options.execute(tx, input, ctx);
        if (audit) await ctx.store.audit(tx, ctx.actor, audit.action, audit.entity(row));
        return row;
      },
    );
    reply(ctx, res, options.status ?? 201, body);
  };
}

/** Query-string helper: GET parameters are read from the raw URL (no qs parsing). */
export const param = (ctx: Ctx, name: string): string | null => ctx.url.searchParams.get(name);
