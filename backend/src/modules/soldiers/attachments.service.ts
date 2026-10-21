import { randomUUID } from 'node:crypto';
import { requireValue } from '@/common/errors/AppError';
import { requireAdmin } from '@/common/http/access';
import { param } from '@/common/http/route';
import type { Ctx, Input } from '@/common/http/types';
import { lockActiveSoldier } from '@/common/store/lookups';
import { GATE_READABLE_ATTACHMENTS } from '@/common/utils/catalog';
import { digest } from '@/common/utils/crypto';
import { attachmentBytes, identifier, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';

const KINDS = ['photo', 'idPhoto', 'tagPhoto', 'carnetFront', 'carnetBack', 'document'];

export async function getAttachment(ctx: Ctx) {
  const id = identifier(param(ctx, 'id'));
  const attachment = await ctx.store.prisma.attachment.findUnique({ where: { id } });
  requireValue(attachment, 'المرفق غير موجود', 404);
  // Gate stations may read soldier photos; documents stay with the administrator.
  if (!GATE_READABLE_ATTACHMENTS.includes(attachment.kind)) requireAdmin(ctx.actor);
  return attachment;
}

export async function listPhotos(ctx: Ctx) {
  const soldierId = identifier(param(ctx, 'soldierId'));
  const photos = await ctx.store.prisma.attachment.findMany({
    where: { soldier_id: soldierId, kind: 'photo' },
    select: { id: true, soldier_id: true, mime: true },
    orderBy: { created_at: 'desc' },
  });
  return { photos };
}

export async function addAttachment(tx: Tx, data: Input) {
  await lockActiveSoldier(tx, data.soldierId);
  requireValue(typeof data.kind === 'string' && KINDS.includes(data.kind), 'نوع المرفق غير صالح');
  const bytes = attachmentBytes(data.content, data.mime);
  requireValue(
    data.kind === 'document' || (data.mime as string).startsWith('image/'),
    'الصورة يجب أن تكون PNG أو JPEG',
  );
  // One picture per kind (replaced on upload); documents accumulate.
  if (data.kind !== 'document') {
    await tx.attachment.deleteMany({ where: { soldier_id: data.soldierId as string, kind: data.kind } });
  }
  return tx.attachment.create({
    data: {
      id: randomUUID(),
      soldier_id: data.soldierId as string,
      kind: data.kind,
      name: text(data.name, 200, true),
      mime: data.mime as string,
      content: data.content as string,
      sha256: digest(bytes),
      size: bytes.length,
    },
    select: { id: true, soldier_id: true, kind: true, name: true, mime: true, size: true },
  });
}
