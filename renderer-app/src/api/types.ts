/** Response/request shapes of the (frozen) server API. Field names are the server's snake_case DB columns. */

export type Role = 'admin' | 'gate' | 'clerk';
export type DeviceKind = 'internal' | 'gate';
export type ExitStatus = 'in' | 'out';
export type VisitorTier = 'normal' | 'special' | 'admin';
export type OutletKind = 'canteen' | 'buffet';

export interface Session {
  user: { name: string; username: string; role: Role };
  kind: DeviceKind;
  installation: string;
}

export interface AppInfo {
  deviceId: string;
  fingerprint: string;
  machineId: string;
  machineGuid?: string;
  serverUrl: string | null;
  caImported: boolean;
  version: string;
  labMode: boolean;
  standaloneMode: boolean;
  playMode: boolean;
  previewMode?: boolean;
  networkRole?: NetworkRole;
  loginHintPath: string | null;
}

/** local: this PC only · host: the unit PC sharing its data · client: a gate PC using the unit PC. */
export type NetworkRole = 'local' | 'host' | 'client';
export interface NetworkInfo {
  role: NetworkRole;
  sharing: boolean;
  addresses: string[];
  hostname: string | null;
  pairingCode: string | null;
}

export interface SoldierDetails {
  cardNo?: string;
  originalUnit?: string;
  specialty?: string;
  enlistDate?: string;
  dischargeDate?: string;
  weaponNo?: string;
  unitJoinDate?: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  age?: string;
  offDutyJob?: string;
}

export interface Soldier {
  id: string;
  military_no: string;
  name: string;
  /** الدرجة */
  rank: string;
  /** الرتبة */
  military_rank?: string;
  company: string;
  unit: string;
  sub_unit?: string;
  status: ExitStatus;
  version: number;
  national_id?: string;
  phone?: string;
  address?: string;
  created_at?: string;
  archived?: boolean;
  details?: SoldierDetails | string;
}

export interface SoldiersResponse {
  soldiers: Soldier[];
  serverTime: string;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  created_at: string;
}
export type AttachmentKind = 'photo' | 'idPhoto' | 'tagPhoto' | 'carnetFront' | 'carnetBack' | 'document';
export interface AttachmentFile {
  id: string;
  mime: string;
  content: string;
  name?: string;
}
export interface SoldierRecord {
  soldier: Soldier;
  attachments: AttachmentMeta[];
}

export type PersonnelCategory = 'grant' | 'leave' | 'penalty' | 'reward' | 'medical' | 'medical_affairs' | 'security_report' | 'security_scan' | 'evaluation';
export interface PersonnelRecord {
  id: string;
  soldier_id: string;
  category: PersonnelCategory;
  title: string;
  record_date: string;
  end_date: string | null;
  /** HH:MM — leave exit / return time */
  start_time?: string;
  end_time?: string;
  reference: string;
  details: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GateSoldierResponse {
  soldier: Soldier;
  photos: { id: string; kind: AttachmentKind; mime: string }[];
}

export interface Permit {
  id: string;
  no: number | string;
  soldier_id: string;
  reason: string;
  exit_at: string;
  expected_return: string;
  returned_at: string | null;
  notes?: string;
  entry_notes?: string;
  voided: boolean;
  name: string;
  military_no: string;
  rank: string;
  company: string;
}

export interface Summary {
  outside: number | string;
  late: number | string;
}

export interface GateMovementBody {
  soldierId: string;
  kind: 'exit' | 'entry';
  notes: string;
  reason?: string;
  expectedReturn?: string;
}
export interface GateMovementResult {
  id: string;
  no?: number | string;
  returned_at?: string | null;
  [key: string]: unknown;
}

export interface VisitorCategory {
  id: string;
  name: string;
  tier: VisitorTier;
  disabled: boolean;
  sort_order: number;
}
export interface Outlet {
  id: string;
  kind: OutletKind;
  name: string;
  disabled: boolean;
  sort_order: number;
}
export interface Visitor {
  id: string;
  name: string;
  badge_no: string;
  phone: string;
  organization: string;
  disabled: boolean;
  category_name: string;
  category_tier: VisitorTier;
}
export interface GateVisitorResponse {
  visitor: Visitor & { category_id: string; national_id?: string; notes?: string; category_disabled: boolean };
  openVisit: { id: string; purpose: string; check_in: string } | null;
}

export interface VisitorCard {
  cardNo: number;
  openVisit: {
    id: string; purpose: string; check_in: string;
    visitor: { name: string; national_id: string; phone: string; organization: string; notes: string;
      category: { name: string } };
  } | null;
}

export interface BackupPolicy {
  autoBackup: boolean;
  autoBackupIntervalHours: number;
  backupRetentionDays: number;
}
export interface UnitSettings extends Partial<BackupPolicy> {
  memoFormation?: string | null;
  memoUnitLine?: string | null;
  memoRightName?: string | null;
  memoRightRank?: string | null;
  memoRightRole?: string | null;
  memoLeftName?: string | null;
  memoLeftRank?: string | null;
  memoLeftRole?: string | null;
  memoLogo?: string | null;
  exitReasons?: string[];
  unitName: string;
  parentFormation: string;
  extraReasons: string[];
  paper: 'A4' | 'A5';
  margins: 'normal' | 'narrow';
  printer?: string;
  labelPrinter?: string;
  receiptPrinter?: string;
  labelWidthMm?: number;
  labelHeightMm?: number;
  receiptWidthMm?: number;
  receiptPrintableWidthMm?: number;
  receiptMarginMm?: number;
  receiptFontPt?: number;
  receiptLineHeight?: number;
  receiptBold?: boolean;
  receiptShowLogo?: boolean;
  receiptLogoMm?: number;
  receiptHeightMode?: 'auto' | 'fixed';
  receiptHeightMm?: number;
  receiptCopies?: number;
  receiptFooter?: string;
  receiptTopFeedMm?: number;
  receiptBottomFeedMm?: number;
  silentPrint?: boolean;
  showLogo: boolean;
  logo: string | null;
  version?: number;
}

export interface ReportColumnMeta {
  id: string;
  title: string;
  short: string;
  hint: string;
  filters: { fromTo: boolean; company: boolean; q: boolean; outlet: boolean; outletKind?: OutletKind };
  columns: [string, string][];
}
export interface Catalog {
  exitReasons: string[];
  soldierGrades: string[];
  soldierRanks: string[];
  gateMinMinutes?: number;
  fitnessStandards?: FitnessStandard[];
  gradeScale?: GradeBand[];
  fitnessTypes: Record<string, string>;
  reports: ReportColumnMeta[];
  outlets: { canteen: Outlet[]; buffet: Outlet[] };
  outletsAll: Outlet[] | null;
  visitorCategories: VisitorCategory[];
  visitorCategoriesAll: VisitorCategory[] | null;
  settings: UnitSettings;
}

export type ReportType = 'soldiers' | 'gate' | 'visitor' | 'canteen' | 'buffet' | 'fitness';
export interface ReportFilter {
  type: ReportType;
  from: string;
  to: string;
  q: string;
  company: string;
  outletId: string;
}
export interface ReportResponse {
  type: ReportType;
  from: string;
  to: string;
  rows: Record<string, unknown>[];
  summary: Record<string, number>;
  totalCents: number | null;
}

export interface LedgerTransaction {
  id: string;
  at: string;
  amount_cents: number;
  notes: string;
  reversal_of: string | null;
  reversed_by: string | null;
}
export interface LedgerResponse {
  transactions: LedgerTransaction[];
  totalCents: number;
  month: string;
  outletId: string;
  outletName?: string;
  outletKind?: OutletKind;
}

export interface FitnessRecord {
  id: string;
  soldier_id: string;
  type: string;
  value: number | null;
  unit: string;
  date: string;
  notes: string;
  raw_result: string | null;
  /** Percentage of the Settings standard (null when the test has no standard). */
  score?: number | null;
}

export interface FitnessStandard {
  name: string;
  unit: string;
  target: number;
  better: 'higher' | 'lower';
}
export interface GradeBand {
  label: string;
  min: number;
}
export interface SoldierEvaluation {
  tests: (FitnessStandard & { value: string | null; date: string | null; score: number | null })[];
  testedCount: number;
  average: number | null;
  suggestedGrade: string | null;
  finalGrade: { grade: string; date: string; details: string } | null;
  gradeLabels: string[];
}

export interface UserRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  disabled: boolean;
}
export interface AuditRow {
  id?: string;
  at: string;
  username: string;
  action: string;
  device_id: string;
  entity_id: string;
}

export interface BackupItem {
  id: string;
  createdAt: string;
  size: number;
}
export interface BackupSchedule extends BackupPolicy {
  lastAutoBackupAt: string | null;
  nextDueAt: string | null;
  lastSkipReason: 'busy' | 'disabled' | null;
  running: boolean;
}
export interface BackupsResponse {
  backups: BackupItem[];
  schedule: BackupSchedule;
}
export interface BackupPreview {
  schema: number;
  counts: Record<string, number>;
}

export interface LegacyPreview {
  valid: boolean;
  counts: Record<string, number>;
  warnings: string[];
  errors: string[];
}

export interface PickedFile {
  name: string;
  mime: string;
  content: string;
}

export type ReportPeriod = 'day' | 'month' | 'year';
export interface DailyReport {
  date: string;
  period?: ReportPeriod;
  from?: string;
  to?: string;
  generatedAt: string;
  unit: { name: string; parentFormation: string };
  snapshot: {
    soldiers: { total: number; inside: number; outside: number; archived: number; byCompany: { company: string; count: number }[] };
    permits: { activeOutside: number; late: number };
    outlets: { canteen: number; buffet: number };
  };
  activity: {
    gate: {
      entries: number;
      exits: number;
      total: number;
      byHour: { hour: number; entries: number; exits: number }[];
      byReason: { reason: string; count: number }[];
      recent: { at: string; kind: 'entry' | 'exit'; name: string; military_no: string; reason: string }[];
    };
    visitors: {
      checkIns: number;
      checkOuts: number;
      stillInside: number;
      byCategory: { category: string; count: number }[];
      recent: { at: string; check_out: string | null; name: string; badge_no: string; category_name: string; purpose: string }[];
    };
    canteen: FoodActivity;
    buffet: FoodActivity;
    fitness: {
      records: number;
      averageScore?: number | null;
      averageGrade?: string | null;
      byType: { type: string; count: number; averageScore?: number | null }[];
      recent: { date: string; type: string; value: number; unit: string; score?: number | null; name: string; military_no: string }[];
    };
    gateTimeline?: { label: string; entries: number; exits: number }[];
    personnel?: Partial<Record<PersonnelCategory, number>>;
  };
  audit: { at: string; action: string; username: string }[];
}
export interface FoodActivity {
  transactions: number;
  totalCents: number;
  reversals: number;
  outlets: { name: string; count: number; totalCents: number }[];
  recent: { at: string; outlet_name: string; name: string; military_no: string; amount_cents: number }[];
}

export interface DashboardData {
  range: { days: number; from: string; to: string };
  soldiers: { total: number; inside: number; outside: number; late: number; archived: number };
  byCompany: { company: string; count: number }[];
  gate: {
    today: { exits: number; entries: number };
    total: number;
    previousTotal: number;
    byDay: { date: string; exits: number; entries: number }[];
    byReason: { reason: string; count: number }[];
    recent: { at: string; kind: 'entry' | 'exit'; name: string; military_no: string; reason: string }[];
  };
  visitors: {
    today: number;
    inside: number;
    total: number;
    previousTotal: number;
    byDay: { date: string; count: number }[];
    byCategory: { category: string; count: number }[];
  };
  food: { canteen: DashboardFood; buffet: DashboardFood };
  fitness: { records: number; byType: { type: string; count: number }[] };
}
export interface DashboardFood {
  todayCents: number;
  rangeCents: number;
  previousCents: number;
  byDay: { date: string; cents: number }[];
  byOutlet: { name: string; cents: number }[];
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}
export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, string | number | boolean | null>[];
}
export interface ExcelWorkbookArg {
  fileName: string;
  sheets: ExcelSheet[];
}
export interface ExcelImportFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
}
export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** The preload bridge (`window.desktop`). Every call resolves to a wrapped result. */
export interface BridgeResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}
export interface PrinterInfo {
  name: string;
  displayName?: string;
  isDefault?: boolean;
}
export interface DocumentArg {
  cardNos?: number[];
  type: string;
  id?: string;
  ids?: string[];
  copies?: number;
  mode?: 'preview' | 'print' | 'pdf';
  filter?: Partial<ReportFilter>;
  soldierId?: string;
  month?: string;
  outletId?: string;
  date?: string;
  period?: ReportPeriod;
  /** soldier-file: print one section only */
  category?: PersonnelCategory;
}
export interface DesktopBridge {
  info(): Promise<BridgeResult<AppInfo>>;
  copyText(text: string): Promise<BridgeResult<boolean>>;
  configure(serverUrl: string): Promise<BridgeResult<unknown>>;
  importCA(): Promise<BridgeResult<boolean>>;
  importBundledCA(): Promise<BridgeResult<unknown>>;
  exportDevice(): Promise<BridgeResult<boolean>>;
  network(): Promise<BridgeResult<NetworkInfo>>;
  setNetworkRole(role: NetworkRole): Promise<BridgeResult<boolean>>;
  pair(arg: { address: string; code: string }): Promise<BridgeResult<{ serverUrl: string }>>;
  login(credentials: { username: string; password: string }): Promise<BridgeResult<Session>>;
  logout(): Promise<BridgeResult<unknown>>;
  request(method: 'GET' | 'POST', path: string, data?: unknown, requestId?: string): Promise<BridgeResult>;
  qr(soldierId: string): Promise<BridgeResult<string>>;
  qrVisitor(visitorId: string): Promise<BridgeResult<string>>;
  excelExport(arg: ExcelWorkbookArg): Promise<BridgeResult<boolean>>;
  excelTemplate(arg: ExcelWorkbookArg): Promise<BridgeResult<boolean>>;
  excelImport(): Promise<BridgeResult<ExcelImportFile | null>>;
  printers(): Promise<BridgeResult<PrinterInfo[]>>;
  testPrint(arg: { kind: 'label' | 'receipt' | 'office'; mode?: 'print' | 'preview' }): Promise<BridgeResult<boolean>>;
  document(arg: DocumentArg): Promise<BridgeResult<unknown>>;
  exportReport(filter: Partial<ReportFilter>): Promise<BridgeResult<boolean>>;
  pickAttachment(): Promise<BridgeResult<PickedFile | null>>;
  saveAttachment(id: string): Promise<BridgeResult<unknown>>;
  saveBackup(id: string): Promise<BridgeResult<unknown>>;
  importBackup(): Promise<BridgeResult<unknown>>;
  previewLegacy(): Promise<BridgeResult<LegacyPreview | null>>;
  applyLegacy(confirmation: string): Promise<BridgeResult<unknown>>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
  const __DEV_MOCK__: boolean;
}
