import { ApiError, bridge, get, post, qs, unwrap } from './client';
import type {
  AppInfo,
  AttachmentFile,
  AuditRow,
  BackupPreview,
  BackupsResponse,
  Catalog,
  DailyReport,
  DashboardData,
  ImportResult,
  DocumentArg,
  ExcelImportFile,
  ExcelWorkbookArg,
  FitnessRecord,
  GateMovementBody,
  GateMovementResult,
  GateSoldierResponse,
  GateVisitorResponse,
  LedgerResponse,
  Permit,
  ReportFilter,
  ReportPeriod,
  ReportResponse,
  Session,
  SoldierEvaluation,
  SoldierRecord,
  SoldiersResponse,
  Summary,
  UserRow,
  Visitor,
  VisitorCard,
  PersonnelRecord,
} from './types';

export type ImportPath = '/api/soldiers/import' | '/api/visitors/import' | '/api/fitness/import' | '/api/canteen/import';

/** The QR channels return a PNG data URL; accept bare base64 or `{dataUrl}` too and fail loudly otherwise. */
export function toQrSrc(value: unknown): string {
  const raw = typeof value === 'string' ? value : (value as { dataUrl?: string; data?: string } | null)?.dataUrl ?? (value as { data?: string } | null)?.data;
  if (typeof raw !== 'string' || raw.length < 20) throw new ApiError('تعذر إنشاء رمز QR');
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
}

/** One object per entity; all calls go through window.desktop.request. */
export const api = {
  info: () => unwrap<AppInfo>(bridge().info()),
  login: (username: string, password: string) => unwrap<Session>(bridge().login({ username, password })),
  logout: () => unwrap(bridge().logout()),
  catalog: () => get<Catalog>('/api/catalog'),
  summary: () => get<Summary>('/api/summary'),
  permits: () => get<{ permits: Permit[] }>('/api/permits').then((r) => r.permits),

  soldiers: (p: { q?: string; offset?: number; archived?: boolean }) =>
    get<SoldiersResponse>(`/api/soldiers${qs({ q: p.q, offset: p.offset ?? 0, archived: p.archived ? 'true' : 'false' })}`),
  soldier: (id: string) => get<SoldierRecord>(`/api/soldier${qs({ id })}`),
  personnelRecords: (soldierId: string) => get<{ records: PersonnelRecord[] }>(`/api/soldier/records${qs({ soldierId })}`).then(r => r.records),
  gateSoldier: (militaryNo: string) => get<GateSoldierResponse>(`/api/gate/soldier${qs({ militaryNo })}`),
  gateVisitor: (id: string) => get<GateVisitorResponse>(`/api/gate/visitor${qs({ id })}`),
  visitorCards: () => get<{ cards: VisitorCard[] }>('/api/visitor-cards').then(r => r.cards),
  visitorCard: (cardNo: number) => get<VisitorCard>(`/api/gate/visitor-card${qs({ cardNo })}`),
  attachment: (id: string) => get<AttachmentFile>(`/api/attachment${qs({ id })}`),
  gateMove: (body: GateMovementBody, requestId: string) => post<GateMovementResult>('/api/gate', body, requestId),
  gateVisitorMove: (
    body: { visitorId: string; action: 'in' | 'out'; purpose: string; notes: string },
    requestId: string,
  ) => post<unknown>('/api/gate/visitor', body, requestId),
  gateCorrect: (body: { eventId: string; reason: string }, requestId?: string) =>
    post<unknown>('/api/gate/correct', body, requestId),

  visitors: (q: string) => get<{ visitors: Visitor[] }>(`/api/visitors${qs({ q })}`).then((r) => r.visitors),
  ledger: (p: { soldierId: string; month: string; outletId: string }) => get<LedgerResponse>(`/api/canteen${qs(p)}`),
  fitness: (soldierId: string) =>
    get<{ records: FitnessRecord[] }>(`/api/fitness${qs({ soldierId })}`).then((r) => r.records),
  report: (f: Partial<ReportFilter>) => get<ReportResponse>(`/api/reports${qs({ ...f })}`),
  dailyReport: (date: string, period: ReportPeriod = 'day') => get<DailyReport>(`/api/reports/daily${qs({ date, period })}`),
  soldierEvaluation: (soldierId: string) => get<SoldierEvaluation>(`/api/soldier/evaluation${qs({ soldierId })}`),
  dashboard: (days: number) => get<DashboardData>(`/api/dashboard${qs({ days })}`),
  importRows: (path: ImportPath, rows: unknown[], requestId: string = crypto.randomUUID()) =>
    post<ImportResult>(path, { rows }, requestId),
  outletCreate: (body: { kind: string; name: string }) => post<{ id: string }>('/api/outlets', body),
  outletUpdate: (body: { id: string; name?: string; disabled?: boolean }) => post<unknown>('/api/outlets/update', body),
  outletDelete: (id: string) => post<{ id: string }>('/api/outlets/delete', { id }),
  users: () => get<{ users: UserRow[] }>('/api/admin/users').then((r) => r.users),
  audit: () => get<{ rows: AuditRow[] }>('/api/audit').then((r) => r.rows),
  backups: () => get<BackupsResponse>('/api/backups'),
  backupPreview: (id: string) => get<BackupPreview>(`/api/backup/preview${qs({ id })}`),

  // dedicated channels (no network from the renderer)
  qr: async (soldierId: string) => toQrSrc(await unwrap<unknown>(bridge().qr(soldierId))),
  qrVisitor: async (visitorId: string) => toQrSrc(await unwrap<unknown>(bridge().qrVisitor(visitorId))),
  document: async (arg: DocumentArg) => {
    const result = await unwrap(bridge().document(arg));
    if (result === false) throw new ApiError('تم إلغاء العملية؛ لم يتم إرسال طباعة أو حفظ ملف');
    return result;
  },
  excelExport: (arg: ExcelWorkbookArg) => unwrap<boolean>(bridge().excelExport(arg)),
  excelTemplate: (arg: ExcelWorkbookArg) => unwrap<boolean>(bridge().excelTemplate(arg)),
  excelImport: () => unwrap<ExcelImportFile | null>(bridge().excelImport()),
};
