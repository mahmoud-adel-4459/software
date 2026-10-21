import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { digest } from '@/common/utils/crypto';
import type { Actor, UserRow } from '@/common/http/types';
import type { Database, PrismaClient, Tx } from '@/config/prisma';

/** Soldier columns visible to a gate station / the full set for administrators. */
const GATE_FIELDS = {
  id: true,
  military_no: true,
  name: true,
  rank: true,
  company: true,
  unit: true,
  status: true,
  version: true,
} as const;
const INTERNAL_FIELDS = {
  ...GATE_FIELDS,
  national_id: true,
  phone: true,
  address: true,
  created_at: true,
  archived: true,
  details: true,
} as const;

/** Serialises writers: SQLite has one writer, and an in-process queue avoids SQLITE_BUSY on lock upgrades. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export interface CreateSoldierInput {
  militaryNo: string;
  nationalId: string;
  name: string;
  rank: string;
  company: string;
  unit: string;
  phone: string;
  address: string;
  details?: Record<string, unknown>;
}

/** Data access shared by several modules: idempotent transactions, audit trail, counters, lookups. */
export class Store {
  private readonly writer = new Mutex();

  constructor(
    readonly database: Database,
    readonly clock: () => number = Date.now,
  ) {}

  get prisma(): PrismaClient {
    return this.database.prisma;
  }

  /** Current time according to the injected clock. */
  now(): Date {
    return new Date(this.clock());
  }

  user(username: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { username, disabled: false } });
  }

  userById(id: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { id, disabled: false } });
  }

  /** Paged soldier search (200 per page); gate stations get the reduced field set. */
  async list(context: Pick<Actor, 'kind' | 'user'>, search = '', offset = 0, archived = false) {
    const full = context.kind === 'internal' && context.user.role === 'admin';
    return this.prisma.soldier.findMany({
      where: { archived, OR: [{ name: { contains: search } }, { military_no: { contains: search } }] },
      select: full ? INTERNAL_FIELDS : GATE_FIELDS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 200,
      skip: offset,
    });
  }

  /** Latest 200 permits with the soldier's identity. */
  async permits() {
    const rows = await this.prisma.permit.findMany({
      orderBy: { exit_at: 'desc' },
      take: 200,
      include: { soldier: { select: { name: true, military_no: true, rank: true, company: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      no: p.no,
      soldier_id: p.soldier_id,
      reason: p.reason,
      exit_at: p.exit_at,
      expected_return: p.expected_return,
      returned_at: p.returned_at,
      notes: p.notes,
      entry_notes: p.entry_notes,
      voided: p.voided,
      ...p.soldier,
    }));
  }

  /**
   * Runs one idempotent write: re-checks the account, replays the stored response for a repeated
   * X-Request-Id (409 when the same id is reused for a different operation), otherwise runs `operation`
   * and stores its result — all in one transaction.
   */
  mutate<T>(context: Actor, requestId: string, body: unknown, operation: (tx: Tx) => Promise<T>): Promise<T> {
    const bodyHash = digest(JSON.stringify(body));
    return this.writer.run(() =>
      this.prisma.$transaction(
        async (tx) => {
          const active = await tx.user.findUnique({ where: { id: context.user.id } });
          requireValue(
            active &&
              !active.disabled &&
              active.role === context.user.role &&
              (context.user.auth_version === undefined || active.auth_version === context.user.auth_version),
            'تغيرت صلاحيات الحساب؛ سجل الدخول مجددًا',
            401,
          );
          const old = await tx.requestRecord.findUnique({ where: { id: requestId } });
          if (old) {
            requireValue(
              old.user_id === context.user.id && old.device_id === context.deviceId && old.body_hash === bodyHash,
              'رقم الطلب مستخدم لعملية مختلفة',
              409,
            );
            return old.response as T;
          }
          const result = await operation(tx);
          await tx.requestRecord.create({
            data: {
              id: requestId,
              user_id: context.user.id,
              device_id: context.deviceId,
              body_hash: bodyHash,
              response: JSON.parse(JSON.stringify(result)),
              created_at: this.now(),
            },
          });
          return result;
        },
        { timeout: 120000, maxWait: 30000 },
      ),
    );
  }

  /** Same as mutate() but without idempotency bookkeeping (internal jobs, imports). */
  exclusive<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    return this.writer.run(() => this.prisma.$transaction(operation, { timeout: 120000, maxWait: 30000 }));
  }

  /** Appends an audit_log row inside the caller's transaction. */
  async audit(tx: Tx, context: Pick<Actor, 'user' | 'deviceId'>, action: string, entityId: string): Promise<void> {
    await tx.auditLog.create({
      data: {
        id: randomUUID(),
        user_id: context.user.id,
        device_id: context.deviceId,
        action,
        entity_id: entityId,
        at: this.now(),
      },
    });
  }

  /** Next value of a named counter (permits.no, gate_events.sequence), bumped inside the caller's transaction. */
  async nextCounter(tx: Tx, name: 'permits.no' | 'gate_events.sequence'): Promise<number> {
    const rows = await tx.$queryRawUnsafe<{ value: number | bigint }[]>(
      'UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value',
      name,
    );
    requireValue(rows[0], 'عداد غير موجود', 500);
    return Number(rows[0].value);
  }

  /** Creates a soldier plus its audit row (shared by the soldiers module and the legacy importer). */
  async createSoldier(tx: Tx, context: Pick<Actor, 'user' | 'deviceId'>, data: CreateSoldierInput) {
    const row = await tx.soldier.create({
      data: {
        id: randomUUID(),
        military_no: data.militaryNo,
        national_id: data.nationalId,
        name: data.name,
        rank: data.rank,
        company: data.company,
        unit: data.unit,
        phone: data.phone,
        address: data.address,
        details: (data.details ?? {}) as object,
        created_at: this.now(),
      },
    });
    await this.audit(tx, context, 'soldier.create', row.id);
    return row;
  }
}
