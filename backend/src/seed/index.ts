import { randomUUID } from 'node:crypto';
import { hashPassword } from '@/common/utils/crypto';
import type { PrismaClient } from '@/config/prisma';

export interface AdminSeed {
  username: string;
  name: string;
  password: string;
}

/** Creates the first administrator when the database has no active one (existing accounts are never touched). */
export async function ensureAdminUser(prisma: PrismaClient, admin: AdminSeed): Promise<boolean> {
  if (await prisma.user.findFirst({ where: { role: 'admin', disabled: false }, select: { id: true } })) return false;
  await prisma.user.create({
    data: {
      id: randomUUID(),
      username: admin.username,
      name: admin.name,
      password_hash: await hashPassword(admin.password),
      role: 'admin',
    },
  });
  return true;
}

const SAMPLES = [
  {
    name: 'أحمد محمد علي',
    military_no: '000012345',
    national_id: '30101010101011',
    rank: 'جندي',
    company: 'السرية الأولى',
    unit: 'وحدة تجربة',
    details: {
      cardNo: 'B-1001',
      originalUnit: 'الكتيبة 5',
      specialty: 'مشاة',
      enlistDate: '2022-03-01',
      weaponNo: 'سلاح-445',
      unitJoinDate: '2024-01-15',
      height: '175',
      weight: '72',
      offDutyJob: '—',
    },
  },
  {
    name: 'محمود حسن إبراهيم',
    military_no: '000054321',
    national_id: '30202020202022',
    rank: 'عريف',
    company: 'السرية الثانية',
    unit: 'وحدة تجربة',
    details: {},
  },
  {
    name: 'خالد سعيد عبدالله',
    military_no: '000099887',
    national_id: '30303030303033',
    rank: 'رقيب',
    company: 'السرية الأولى',
    unit: 'وحدة تجربة',
    details: {},
  },
];

/** Demo soldiers + demo unit settings when the database has no soldiers (play / lab modes). */
export async function seedSampleData(prisma: PrismaClient): Promise<boolean> {
  if ((await prisma.soldier.count()) > 0) return false;
  for (const s of SAMPLES) {
    await prisma.soldier.create({ data: { id: randomUUID(), ...s, phone: '', address: '', status: 'in', version: 1 } });
  }
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      data: {
        ...(settings.data as object),
        unitName: 'وحدة تجربة — Lab',
        parentFormation: 'تشكيل تجريبي',
        extraReasons: ['زيارة عائلية'],
        paper: 'A4',
        margins: 'normal',
        printer: '',
        labelPrinter: '',
        receiptPrinter: '',
        labelWidthMm: 89,
        labelHeightMm: 102,
        receiptWidthMm: 80,
        receiptPrintableWidthMm: 72,
        receiptMarginMm: 1,
        receiptFontPt: 11,
        receiptLineHeight: 1.4,
        receiptBold: true,
        receiptShowLogo: true,
        receiptLogoMm: 20,
        receiptHeightMode: 'auto',
        receiptHeightMm: 150,
        receiptCopies: 1,
        receiptFooter: '',
        receiptTopFeedMm: 2,
        receiptBottomFeedMm: 8,
        silentPrint: false,
        showLogo: true,
        logo: null,
      },
    },
  });
  return true;
}
