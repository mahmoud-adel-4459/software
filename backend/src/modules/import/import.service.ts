import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import type { Actor } from '@/common/http/types';
import type { Store } from '@/common/store/Store';
import { DEFAULT_CANTEEN_OUTLET } from '@/common/utils/catalog';
import { digest } from '@/common/utils/crypto';
import { attachmentBytes, soldierDetails } from '@/common/utils/validation';

type Legacy = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const IMAGE_RE = /^data:(image\/(?:png|jpeg));base64,(.+)$/;

/** Validates a v=1 export of the legacy browser prototype without writing anything. */
export function validateLegacy(source: Legacy) {
  requireValue(source?.v === 1, 'ملف المصدر يجب أن يكون نسخة v=1 من النموذج القديم');
  for (const name of ['soldiers', 'permits', 'canteen', 'fitness']) {
    requireValue(Array.isArray(source[name]) && source[name].length <= 100000, `جدول ${name} مفقود أو أكبر من الحد`);
  }
  const errors: string[] = [];
  const ids = new Set<unknown>();
  const numbers = new Set<string>();
  const permits = new Set<string>();
  const active = new Map<unknown, number>();
  const check = (condition: unknown, message: string) => {
    if (!condition && errors.length < 100) errors.push(message);
  };
  for (const s of source.soldiers as Legacy[]) {
    check(s && Number.isSafeInteger(s.id) && !ids.has(s.id), 'معرف فرد مكرر أو غير صالح');
    if (!s) continue;
    ids.add(s.id);
    check(typeof s.name === 'string' && s.name.trim() && s.name.length <= 200, `اسم غير صالح للفرد ${s.id}`);
    check(
      typeof s.militaryNo === 'string' && /^\d{6,30}$/.test(s.militaryNo) && !numbers.has(s.militaryNo),
      `رقم عسكري مكرر أو غير صالح: ${s.militaryNo}`,
    );
    numbers.add(s.militaryNo);
    check(typeof s.nationalId === 'string' && /^\d{14}$/.test(s.nationalId), `رقم قومي غير صالح للفرد ${s.id}`);
    check(['in', 'out'].includes(s.status), `حالة غير صالحة للفرد ${s.id}`);
    for (const key of ['createdAt', 'enlistDate', 'permitDate']) {
      if (s[key]) check(Number.isFinite(Date.parse(s[key])), `تاريخ ${key} غير صالح للفرد ${s.id}`);
    }
    for (const key of ['rank', 'company', 'unit']) {
      check(typeof s[key] === 'string' && s[key].trim() && s[key].length <= 100, `حقل ${key} غير صالح للفرد ${s.id}`);
    }
    for (const key of ['photo', 'idPhoto']) {
      if (!s[key]) continue;
      try {
        const match = IMAGE_RE.exec(s[key]);
        requireValue(match, 'صيغة صورة قديمة غير مدعومة');
        attachmentBytes(match[2], match[1]);
      } catch (e) {
        check(false, `صورة غير صالحة للفرد ${s.id}: ${(e as Error).message}`);
      }
    }
  }
  for (const p of source.permits as Legacy[]) {
    check(p && ids.has(p.soldierId) && !permits.has(String(p.no)), `تصريح مكرر أو فرد غير موجود: ${p?.no}`);
    if (!p) continue;
    permits.add(String(p.no));
    check(/^\d+$/.test(String(p.no)) && Number.isSafeInteger(Number(p.no)) && Number(p.no) > 0, 'رقم تصريح غير صالح');
    check(
      Number.isFinite(Date.parse(p.exitAt)) &&
        Date.parse(p.expectedReturn) > Date.parse(p.exitAt) &&
        (!p.returnedAt || Date.parse(p.returnedAt) >= Date.parse(p.exitAt)),
      `تواريخ غير صالحة للتصريح ${p.no}`,
    );
    check(typeof p.reason === 'string' && p.reason.length <= 100 && p.reason.trim(), `سبب غير صالح للتصريح ${p.no}`);
    if (!p.returnedAt) active.set(p.soldierId, (active.get(p.soldierId) || 0) + 1);
  }
  for (const s of source.soldiers as Legacy[]) {
    if (s) {
      check(
        (active.get(s.id) || 0) <= 1 && (s.status === 'out') === (active.get(s.id) === 1),
        `حالة حضور غير متسقة للفرد ${s.id}`,
      );
    }
  }
  for (const tx of source.canteen as Legacy[]) {
    check(
      tx &&
        ids.has(tx.soldierId) &&
        Number.isFinite(tx.amount) &&
        tx.amount > 0 &&
        tx.amount <= 1000000 &&
        Math.abs(tx.amount * 100 - Math.round(tx.amount * 100)) < 0.000001 &&
        Number.isFinite(Date.parse(tx.at)),
      'عملية كانتين غير صالحة',
    );
  }
  for (const f of source.fitness as Legacy[]) {
    check(
      f &&
        ids.has(f.soldierId) &&
        typeof f.type === 'string' &&
        f.type.length <= 100 &&
        typeof f.result === 'string' &&
        f.result.length <= 1000 &&
        Number.isFinite(Date.parse(f.date)),
      'سجل لياقة غير صالح',
    );
  }
  return {
    valid: !errors.length,
    errors,
    counts: Object.fromEntries(['soldiers', 'permits', 'canteen', 'fitness'].map((k) => [k, source[k].length])),
    warnings: [
      'لا تُنقل كلمة مرور المسؤول القديمة. نتائج اللياقة النصية تُحفظ كما هي دون اختراع درجات تقييم.',
      'راجع أن الملف يحتوي بيانات حقيقية؛ النموذج القديم يولد بيانات تجريبية تلقائيًا.',
    ],
  };
}

const day = (value: string) => new Date(value).toISOString().slice(0, 10);

/** One-time idempotent import of the legacy browser prototype export (soldiers, permits, canteen, fitness). */
export async function importLegacy(store: Store, actor: Actor, requestId: string, source: Legacy) {
  const preview = validateLegacy(source);
  requireValue(preview.valid, preview.errors.join('؛ '));
  const hash = digest(JSON.stringify(source));
  return store.mutate(actor, requestId, { route: 'legacy.import', hash }, async (tx) => {
    requireValue(!(await tx.legacyImport.findUnique({ where: { sha256: hash } })), 'هذا الملف مستورد بالفعل', 409);
    const map = new Map<unknown, string>();
    for (const old of source.soldiers as Legacy[]) {
      const details: Record<string, string> = {};
      for (const key of ['description', 'prevUnit', 'specialty', 'permitNo', 'phone2', 'height', 'weight']) {
        details[key] = String(old[key] || '');
      }
      for (const key of ['enlistDate', 'permitDate']) details[key] = old[key] ? day(old[key]) : '';
      const soldier = await store.createSoldier(tx, actor, {
        name: old.name.trim(),
        militaryNo: old.militaryNo,
        nationalId: old.nationalId,
        rank: old.rank,
        company: old.company,
        unit: old.unit,
        phone: String(old.phone || ''),
        address: String(old.address || ''),
        details: soldierDetails(details),
      });
      map.set(old.id, soldier.id);
      await tx.soldier.update({
        where: { id: soldier.id },
        data: { status: old.status, created_at: new Date(old.createdAt || store.now()) },
      });
      for (const kind of ['photo', 'idPhoto']) {
        if (!old[kind]) continue;
        const match = IMAGE_RE.exec(old[kind])!;
        const bytes = attachmentBytes(match[2], match[1]);
        await tx.attachment.create({
          data: {
            id: randomUUID(),
            soldier_id: soldier.id,
            kind,
            name: `${kind}.${match[1] === 'image/png' ? 'png' : 'jpg'}`,
            mime: match[1]!,
            content: match[2]!,
            sha256: digest(bytes),
            size: bytes.length,
          },
        });
      }
    }
    for (const p of source.permits as Legacy[]) {
      const id = randomUUID();
      const soldierId = map.get(p.soldierId)!;
      await tx.permit.create({
        data: {
          id,
          no: Number(p.no),
          soldier_id: soldierId,
          reason: p.reason,
          exit_at: new Date(p.exitAt),
          expected_return: new Date(p.expectedReturn),
          returned_at: p.returnedAt ? new Date(p.returnedAt) : null,
          notes: p.notes || '',
          entry_notes: p.entryNotes || '',
          created_by: actor.user.id,
        },
      });
      const events: [string, string][] = [['exit', p.exitAt]];
      if (p.returnedAt) events.push(['entry', p.returnedAt]);
      for (const [kind, at] of events) {
        await tx.gateEvent.create({
          data: {
            id: randomUUID(),
            permit_id: id,
            soldier_id: soldierId,
            kind,
            at: new Date(at),
            user_id: actor.user.id,
            device_id: actor.deviceId,
            request_id: randomUUID(),
            sequence: await store.nextCounter(tx, 'gate_events.sequence'),
          },
        });
      }
    }
    for (const t of source.canteen as Legacy[]) {
      await tx.canteenTransaction.create({
        data: {
          id: randomUUID(),
          soldier_id: map.get(t.soldierId)!,
          outlet_id: DEFAULT_CANTEEN_OUTLET,
          amount_cents: Math.round(t.amount * 100),
          at: new Date(t.at),
          created_by: actor.user.id,
        },
      });
    }
    for (const f of source.fitness as Legacy[]) {
      await tx.fitnessRecord.create({
        data: {
          id: randomUUID(),
          soldier_id: map.get(f.soldierId)!,
          type: f.type,
          value: null,
          unit: 'نص قديم',
          date: new Date(`${day(f.date)}T00:00:00.000Z`),
          notes: f.notes || '',
          created_by: actor.user.id,
          raw_result: f.result,
        },
      });
    }
    // Explicit permit numbers were imported: the counter must continue after the highest one.
    await tx.$executeRawUnsafe(
      `UPDATE counters SET value = MAX(value, (SELECT COALESCE(MAX(no), 0) FROM permits)) WHERE name = 'permits.no'`,
    );
    const id = randomUUID();
    await tx.legacyImport.create({ data: { id, sha256: hash, created_by: actor.user.id, at: store.now() } });
    await store.audit(tx, actor, 'legacy.import', id);
    return { id, counts: preview.counts };
  });
}
