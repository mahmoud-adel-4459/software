import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import ActivityIcon from '@mui/icons-material/TimelineOutlined';
import BackupIcon from '@mui/icons-material/StorageOutlined';
import CartIcon from '@mui/icons-material/ShoppingCartOutlined';
import ChartIcon from '@mui/icons-material/BarChartOutlined';
import CoffeeIcon from '@mui/icons-material/CoffeeOutlined';
import DailyIcon from '@mui/icons-material/InsightsOutlined';
import FitnessIcon from '@mui/icons-material/FitnessCenterOutlined';
import GateIcon from '@mui/icons-material/MeetingRoomOutlined';
import ImportIcon from '@mui/icons-material/MoveToInboxOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import ScrollIcon from '@mui/icons-material/HistoryEduOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import ShieldIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import type { ElementType } from 'react';
import type { Session } from '@/api/types';

export interface NavItem {
  key: string;
  to: string;
  label: string;
  hint: string;
  icon: ElementType;
}
export interface NavSection {
  label: string;
  items: NavItem[];
}

const item = (key: string, to: string, label: string, hint: string, icon: ElementType): NavItem => ({
  key,
  to,
  label,
  hint,
  icon,
});

const GATE = item('gate', '/gate', 'البوابة', 'محطة المسح وتسجيل الخروج والدخول', GateIcon);
const MOVEMENTS = item('movements', '/movements', 'حركات البوابة', 'أحدث التصاريح وحالة العودة', ActivityIcon);
const CANTEEN = item('canteen', '/canteen', 'الكانتين', 'مشتريات وكشف شهري للكانتين', CartIcon);
const BUFFET = item('buffet', '/buffet', 'البوفيه', 'مشتريات وكشف شهري للبوفيه', CoffeeIcon);

export const isAdmin = (s: Session | null): boolean => s?.kind === 'internal' && s.user.role === 'admin';
export const isClerk = (s: Session | null): boolean => s?.kind === 'internal' && s.user.role === 'clerk';
export const isInternalStaff = (s: Session | null): boolean => isAdmin(s) || isClerk(s);

/** Sidebar groups by role/device (same rules as the legacy navGroups()). */
export function navSections(session: Session | null): NavSection[] {
  if (!session) return [];
  if (!isInternalStaff(session)) return [{ label: 'التشغيل', items: [GATE, MOVEMENTS] }];
  if (isClerk(session)) {
    return [
      {
        label: 'العمليات',
        items: [CANTEEN, BUFFET, item('reports', '/reports', 'التقارير', 'تقارير الكانتين والبوفيه', ChartIcon)],
      },
    ];
  }
  return [
    { label: 'الرئيسية', items: [item('dashboard', '/', 'الرئيسية', 'لوحة المتابعة: الموقف والحركة والمبيعات', DashboardIcon)] },
    {
      label: 'السجل',
      items: [
        item('soldiers', '/soldiers', 'العسكريون', 'بحث الأفراد وملفاتهم ورموز QR', PeopleIcon),
        item('new', '/soldiers/new', 'إضافة عسكري', 'تسجيل ملف عسكري جديد', PersonAddIcon),
        item('visitors', '/visitors', 'الزوار', 'بطاقات الزوار وفئاتهم', BadgeIcon),
      ],
    },
    {
      label: 'العمليات',
      items: [CANTEEN, BUFFET, item('fitness', '/fitness', 'اللياقة', 'نتائج اختبارات اللياقة', FitnessIcon), GATE, MOVEMENTS],
    },
    {
      label: 'الإدارة',
      items: [
        item('daily-report', '/daily-report', 'التقرير اليومي', 'لوحة نشاط اليوم الشاملة', DailyIcon),
        item('reports', '/reports', 'التقارير التفصيلية', 'ستة أنواع من التقارير مع تصدير CSV', ChartIcon),
        item('printing', '/printing', 'الطباعة', 'ملصقات QR وبطاقات العسكريين', PrintIcon),
        item('settings', '/settings', 'الإعدادات', 'الوحدة والطباعة ونقاط البيع والنسخ', SettingsIcon),
        item('users', '/users', 'المستخدمون', 'الحسابات والأدوار', ShieldIcon),
        item('backups', '/backups', 'النسخ والاستعادة', 'نسخ مشفرة واستعادة آمنة', BackupIcon),
        item('import', '/import', 'استيراد بيانات', 'نقل بيانات النسخة القديمة', ImportIcon),
        item('audit', '/audit', 'سجل العمليات', 'آخر 500 عملية إدارية', ScrollIcon),
      ],
    },
  ];
}

export const allowedItems = (s: Session | null): NavItem[] => navSections(s).flatMap((g) => g.items);

/** Whether the session may open a path (soldier sub-pages follow the soldiers entry). */
export function canOpen(session: Session | null, pathname: string): boolean {
  if (!session) return false;
  const sub = /^\/soldiers\/[^/]+(\/edit)?$/.test(pathname);
  if (sub) return isAdmin(session);
  return allowedItems(session).some((i) => i.to === pathname);
}

/** First page the session may use (home redirect after login). */
export function homePath(session: Session | null): string {
  if (!session) return '/login';
  if (session.kind === 'gate' || session.user.role === 'gate') return '/gate';
  return allowedItems(session)[0]?.to ?? '/gate';
}
