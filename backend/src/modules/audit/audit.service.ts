import type { Ctx } from '@/common/http/types';

/** Latest 500 audit rows with the acting user's name (as `username`, like the legacy query). */
export async function listAudit({ store }: Ctx) {
  const rows = await store.prisma.auditLog.findMany({
    orderBy: { at: 'desc' },
    take: 500,
    include: { user: { select: { name: true } } },
  });
  return { rows: rows.map(({ user, ...row }) => ({ ...row, username: user.name })) };
}
