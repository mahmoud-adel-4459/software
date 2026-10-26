export const EXIT_REASONS = [
  "مكتب قائد القوات",
  "الامن",
  "الشرطه",
  "التنظيم و الاداره",
  "الدفاع الجوي",
  "القضاء",
  "النظم",
  "المركبات",
  "المشروعات",
  "بوابه الفوج",
  "التسليح",
  "العمليات",
  "التدريب",
  "الشئون الإدارية",
  "الشئون المعنويه",
  "اجازه",
  "راحه",
  "اجازه مرضي",
  "سجن",
  "عياده",
  "تحركات مركبات",
  "غفره",
  "مأموريه",
  "جهات اخري"
];

export const FITNESS_TYPES: Record<string, string> = {
  'جري 3 كم': 'ثانية',
  ضغط: 'مرة',
  عقلة: 'مرة',
  بطن: 'مرة',
  'اختبار اللياقة الشامل': 'درجة',
};

export const DETAIL_FIELD_KEYS = [
  'cardNo',
  'originalUnit',
  'specialty',
  'enlistDate',
  'dischargeDate',
  'weaponNo',
  'unitJoinDate',
  'birthDate',
  'height',
  'weight',
  'age',
  'offDutyJob',
];

/** Attachment kinds a gate station may read (documents stay with the administrator). */
export const GATE_READABLE_ATTACHMENTS = ['photo', 'idPhoto', 'carnetFront', 'carnetBack', 'tagPhoto'];

export const DEFAULT_CANTEEN_OUTLET = '00000000-0000-0000-0000-000000000010';
export const SETTINGS_AUDIT_ENTITY = '00000000-0000-0000-0000-000000000001';
