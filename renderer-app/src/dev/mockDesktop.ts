/**
 * In-memory fake of the preload bridge (`window.desktop`) with fixtures shaped like the real server responses.
 * Used by `npm run dev` (browser, no Electron) and by the vitest suites. Never bundled into production.
 */
import type {
  AppInfo, BackupItem, BridgeResult, Catalog, DashboardData, ExcelImportFile, ExcelWorkbookArg, Outlet, DesktopBridge, GateMovementResult, Permit, Role, DeviceKind, Session, Soldier, Visitor, VisitorCard, PersonnelRecord,
} from '@/api/types';

export interface FakeCall { method: string; path: string; data?: unknown; requestId?: string }
export interface FakeOptions {
  role?: Role;
  kind?: DeviceKind;
  info?: Partial<AppInfo>;
  failLogin?: boolean;
  /** Return an error for the next matching request: `${method} ${path-without-query}` -> {status,error}. */
  failures?: Record<string, { status: number; error: string }>;
}
export interface FakeDesktop extends DesktopBridge {
  calls: FakeCall[];
  documents: unknown[];
  testPrints: unknown[];
  /** Workbooks passed to excelExport / excelTemplate, in order. */
  excelFiles: { kind: 'export' | 'template'; arg: ExcelWorkbookArg }[];
  /** What the next excelImport() call returns (null = user cancelled). */
  nextImport: ExcelImportFile | null;
  outlets: Outlet[];
  state: { soldiers: Soldier[]; permits: Permit[]; backups: BackupItem[]; visitors: Visitor[] };
  failures: NonNullable<FakeOptions['failures']>;
}

const ok = <T>(data: T): BridgeResult<T> => ({ ok: true, data });
const fail = (error: string, status = 400): BridgeResult<never> => ({ ok: false, error, status });
const uuid = () => crypto.randomUUID();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const SOLDIER_FIXTURES: Soldier[] = [
  { id: '11111111-1111-4111-8111-111111111111', military_no: '123456789', name: 'أحمد محمود علي حسن', rank: 'جندي', company: 'السرية الأولى', unit: 'الوحدة التجريبية', status: 'in', version: 1, national_id: '29901011234567', phone: '01000000001', address: 'القاهرة', archived: false, details: { cardNo: '5521', specialty: 'مشاة', birthDate: '2000-01-01' } },
  { id: '22222222-2222-4222-8222-222222222222', military_no: '987654321', name: 'محمد سعيد إبراهيم', rank: 'جندي', company: 'السرية الثانية', unit: 'الوحدة التجريبية', status: 'out', version: 1, national_id: '29801011234568', phone: '', address: '', archived: false, details: {} },
  { id: '33333333-3333-4333-8333-333333333333', military_no: '555000111', name: 'خالد عبد الله يوسف', rank: 'عريف', company: 'السرية الأولى', unit: 'الوحدة التجريبية', status: 'in', version: 2, national_id: '29701011234569', phone: '', address: '', archived: false, details: {} },
];

export const OUTLET_FIXTURES: Outlet[] = [{ id: 'o-canteen-1', kind: 'canteen', name: 'الكانتين الرئيسي', disabled: false, sort_order: 0 }, { id: 'o-buffet-1', kind: 'buffet', name: 'البوفيه', disabled: false, sort_order: 0 }];

export function createCatalog(role: Role, outlets: Outlet[] = structuredClone(OUTLET_FIXTURES)): Catalog {
  const admin = role === 'admin';
  const reports = [
    { id: 'soldiers', title: 'قائمة العسكريين', short: 'العسكريون', hint: 'بحث بالاسم أو الرقم العسكري والسرية.', filters: { fromTo: false, company: true, q: true, outlet: false }, columns: [['name', 'الاسم'], ['military_no', 'الرقم العسكري'], ['status', 'الحالة']] as [string, string][] },
    { id: 'gate', title: 'حركات البوابة', short: 'البوابة', hint: 'خروج ودخول مرتبط بالتصاريح.', filters: { fromTo: true, company: true, q: true, outlet: false }, columns: [['name', 'العسكري'], ['kind', 'الحركة'], ['at', 'الوقت']] as [string, string][] },
    { id: 'canteen', title: 'حركات الكانتين', short: 'الكانتين', hint: 'مشتريات وتصحيحات الكانتين.', filters: { fromTo: true, company: true, q: true, outlet: true, outletKind: 'canteen' as const }, columns: [['name', 'العسكري'], ['at', 'الوقت'], ['amount_cents', 'المبلغ']] as [string, string][] },
    { id: 'buffet', title: 'حركات البوفيه', short: 'البوفيه', hint: 'مثل الكانتين لكن للبوفيه.', filters: { fromTo: true, company: true, q: true, outlet: true, outletKind: 'buffet' as const }, columns: [['name', 'العسكري'], ['at', 'الوقت'], ['amount_cents', 'المبلغ']] as [string, string][] },
  ];
  return {
    exitReasons: ['إجازة اعتيادية', 'إجازة عارضة', 'علاج بالمستشفى', 'مأمورية رسمية', 'كشف طبي'],
    soldierGrades: ['مجند', 'متطوع', 'ضابط صف', 'ضابط'],
    soldierRanks: ['عسكري', 'عريف', 'رقيب'],
    fitnessTypes: { 'جري 3 كم': 'ثانية', ضغط: 'مرة' },
    reports: role === 'clerk' ? reports.filter((r) => r.id === 'canteen' || r.id === 'buffet') : reports,
    outlets: { canteen: outlets.filter((o) => o.kind === 'canteen' && !o.disabled), buffet: outlets.filter((o) => o.kind === 'buffet' && !o.disabled) },
    outletsAll: admin ? outlets : null,
    visitorCategories: [{ id: 'c1', name: 'زائر عادي', tier: 'normal', disabled: false, sort_order: 0 }, { id: 'c2', name: 'ضابط', tier: 'admin', disabled: false, sort_order: 1 }],
    visitorCategoriesAll: admin ? [{ id: 'c1', name: 'زائر عادي', tier: 'normal', disabled: false, sort_order: 0 }, { id: 'c2', name: 'ضابط', tier: 'admin', disabled: false, sort_order: 1 }] : null,
    settings: { unitName: 'الوحدة التجريبية', parentFormation: 'المنطقة', extraReasons: [], paper: 'A4', margins: 'normal', printer: '', labelPrinter: '', receiptPrinter: '', labelWidthMm: 89, labelHeightMm: 102, receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 1, receiptFontPt: 11, receiptLineHeight: 1.4, receiptBold: true, receiptShowLogo: true, receiptLogoMm: 20, receiptHeightMode: 'auto', receiptHeightMm: 150, receiptCopies: 1, receiptFooter: '', receiptTopFeedMm: 2, receiptBottomFeedMm: 8, silentPrint: true, showLogo: false, logo: null, version: 1, autoBackup: true, autoBackupIntervalHours: 24, backupRetentionDays: 30 },
  };
}

/** Builds a stateful fake bridge. */
export function createFakeDesktop(options: FakeOptions = {}): FakeDesktop {
  const role = options.role ?? 'admin';
  const kind = options.kind ?? 'internal';
  const session: Session = { user: { name: role === 'admin' ? 'مدير النظام' : role === 'gate' ? 'مناوب البوابة' : 'كاشير الكانتين', username: role, role }, kind, installation: 'منشأة تجريبية' };
  const outlets = structuredClone(OUTLET_FIXTURES);
  const savedSettings: Record<string, unknown> = {};
  const catalog = () => {
    const c = createCatalog(role, outlets);
    return {
      ...c,
      exitReasons: (savedSettings.exitReasons as string[] | undefined) ?? c.exitReasons,
      soldierGrades: (savedSettings.soldierGrades as string[] | undefined) ?? c.soldierGrades,
      soldierRanks: (savedSettings.soldierRanks as string[] | undefined) ?? c.soldierRanks,
      settings: { ...c.settings, ...savedSettings } as Catalog['settings'],
    };
  };
  const state = {
    soldiers: structuredClone(SOLDIER_FIXTURES),
    permits: [] as Permit[],
    visitors: [{ id: 'v1', name: 'زائر تجريبي', badge_no: 'V-0001', phone: '0100', organization: 'شركة', disabled: false, category_name: 'زائر عادي', category_tier: 'normal' as const }] as Visitor[],
    backups: [{ id: `${uuid()}.mab`, createdAt: '2026-10-20T09:00:00.000Z', size: 245760 }] as BackupItem[],
  };
  const visitorCards: VisitorCard[] = Array.from({ length: 24 }, (_, i) => ({ cardNo: i + 1, openVisit: null }));
  const personnelRecords: PersonnelRecord[] = [];
  const fake: FakeDesktop = {
    calls: [], documents: [], testPrints: [], excelFiles: [], nextImport: null, outlets, state, failures: { ...(options.failures ?? {}) },
    info: async () => ok<AppInfo>({ deviceId: 'dev-1', fingerprint: 'ab:cd', machineId: 'MACHINE-001', serverUrl: 'https://127.0.0.1:8443', caImported: true, version: '0.3.0', labMode: true, standaloneMode: false, playMode: false, loginHintPath: null, ...options.info }),
    copyText: async () => ok(true),
    configure: async () => ok(null),
    importCA: async () => ok(true),
    importBundledCA: async () => ok(null),
    exportDevice: async () => ok(true),
    network: async () => ok({ role: 'local' as const, sharing: false, addresses: [], hostname: null, pairingCode: null }),
    setNetworkRole: async () => ok(true),
    pair: async (arg) => ok({ serverUrl: `https://${arg.address}:8443` }),
    login: async (c) => (options.failLogin || !c.password ? fail('اسم المستخدم أو كلمة المرور غير صحيحة', 401) : ok(session)),
    logout: async () => ok(null),
    qr: async () => ok(`data:image/png;base64,${PNG}`),
    qrVisitor: async () => ok(`data:image/png;base64,${PNG}`),
    printers: async () => ok([{ name: 'Printer-1', displayName: 'طابعة المكتب', isDefault: true }, { name: 'XP-246B', displayName: 'XPrinter XP-246B' }, { name: 'XP-90', displayName: 'XPrinter XP-90' }]),
    testPrint: async (arg) => { fake.testPrints.push(arg); return ok(true); },
    document: async (arg) => { fake.documents.push(arg); return ok(true); },
    exportReport: async () => ok(true),
    excelExport: async (arg) => { fake.excelFiles.push({ kind: 'export', arg }); return ok(true); },
    excelTemplate: async (arg) => { fake.excelFiles.push({ kind: 'template', arg }); return ok(true); },
    excelImport: async () => ok(fake.nextImport),
    pickAttachment: async () => ok({ name: 'photo.png', mime: 'image/png', content: PNG }),
    saveAttachment: async () => ok(true),
    saveBackup: async () => ok(true),
    importBackup: async () => ok(null),
    previewLegacy: async () => ok({ valid: true, counts: { soldiers: 3 }, warnings: [], errors: [] }),
    applyLegacy: async () => ok(null),
    request: async (method, path, data, requestId) => {
      fake.calls.push({ method, path, data, requestId });
      const [route, query = ''] = path.split('?');
      const failure = fake.failures[`${method} ${route}`];
      if (failure) return fail(failure.error, failure.status);
      const params = new URLSearchParams(query);
      const body = (data ?? {}) as Record<string, unknown>;
      if (method === 'GET') {
        switch (route) {
          case '/api/catalog': return ok(catalog());
          case '/api/dashboard': return role === 'admin' ? ok(dashboardFixture(Number(params.get('days') ?? 7))) : fail('غير مصرح', 403);
          case '/api/summary': return ok({ outside: String(state.permits.filter((p) => !p.returned_at && !p.voided).length), late: '0' });
          case '/api/permits': return ok({ permits: state.permits });
          case '/api/soldiers': {
            const q = params.get('q') ?? '';
            const archived = params.get('archived') === 'true';
            return ok({ soldiers: state.soldiers.filter((s) => !!s.archived === archived && (!q || s.name.includes(q) || s.military_no.includes(q))), serverTime: new Date().toISOString() });
          }
          case '/api/soldier': {
            const s = state.soldiers.find((x) => x.id === params.get('id'));
            return s ? ok({ soldier: s, attachments: [] }) : fail('العسكري غير موجود', 404);
          }
          case '/api/gate/soldier': {
            const s = state.soldiers.find((x) => x.military_no === params.get('militaryNo'));
            return s ? ok({ soldier: s, photos: [{ id: 'att-1', kind: 'photo', mime: 'image/png' }] }) : fail('لا يوجد عسكري بهذا الرقم', 404);
          }
          case '/api/visitor-cards': return ok({ cards: visitorCards });
          case '/api/visitor-visits': return ok({ visits: [] });
          case '/api/soldier/records': return ok({ records: personnelRecords.filter(r => r.soldier_id === params.get('soldierId')) });
          case '/api/gate/visitor-card': return ok(visitorCards.find(c => c.cardNo === Number(params.get('cardNo'))));
          case '/api/gate/visitor': return ok({ visitor: { ...state.visitors[0], category_id: 'c1', category_disabled: false }, openVisit: null });
          case '/api/attachment': return ok({ id: 'att-1', mime: 'image/png', content: PNG });
          case '/api/visitors': return ok({ visitors: state.visitors });
          case '/api/admin/users': return ok({ users: [{ id: 'u1', username: 'admin', name: 'مدير النظام', role: 'admin', disabled: false }, { id: 'u2', username: 'gate1', name: 'مناوب', role: 'gate', disabled: false }] });
          case '/api/audit': return ok({ rows: [{ at: new Date().toISOString(), username: 'مدير النظام', action: 'soldier.create', device_id: 'dev-1', entity_id: state.soldiers[0].id }] });
          case '/api/canteen': return ok({ transactions: [], totalCents: 0, month: params.get('month'), outletId: params.get('outletId') });
          case '/api/fitness': return ok({ records: [] });
          case '/api/backups': return ok({ backups: state.backups, schedule: { autoBackup: true, autoBackupIntervalHours: 24, backupRetentionDays: 30, lastAutoBackupAt: '2026-10-20T09:00:00.000Z', nextDueAt: '2026-10-21T09:00:00.000Z', lastSkipReason: null, running: false } });
          case '/api/backup/preview': return ok({ schema: 3, counts: { users: 2, soldiers: 3, permits: 5 } });
          case '/api/reports': return ok({ type: params.get('type'), from: params.get('from'), to: params.get('to'), rows: state.soldiers.map((s) => ({ ...s })), summary: { rows: state.soldiers.length, inside: 2, outside: 1, archived: 0 }, totalCents: null });
          case '/api/reports/daily': return ok(dailyFixture(params.get('date') ?? ''));
          case '/api/reports/build': return ok(analyticFixture(params));
          default: return fail(`مسار غير معروف: ${route}`, 404);
        }
      }
      switch (route) {
        case '/api/soldier/records': {
          const index = personnelRecords.findIndex(r => r.id === body.id);
          const row: PersonnelRecord = { id: index < 0 ? uuid() : String(body.id), soldier_id: String(body.soldierId),
            category: body.category as PersonnelRecord['category'], title: String(body.title), record_date: String(body.recordDate),
            end_date: body.endDate ? String(body.endDate) : null, reference: String(body.reference || ''), details: String(body.details || ''),
            version: index < 0 ? 1 : personnelRecords[index].version + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          if (index < 0) personnelRecords.push(row); else personnelRecords[index] = row;
          return ok(row);
        }
        case '/api/soldier/records/delete': {
          const index = personnelRecords.findIndex(r => r.id === body.id && r.soldier_id === body.soldierId);
          if (index < 0) return fail('Not found', 404);
          personnelRecords.splice(index, 1);
          return ok({ id: body.id });
        }
        case '/api/gate/visitor-card': {
          const d = data as { cardNo: number; action: string; visitId?: string; name: string; nationalId: string; phone: string; organization: string; notes: string; purpose: string };
          const card = visitorCards.find(c => c.cardNo === d.cardNo)!;
          if (d.action === 'in') {
            if (card.openVisit) return fail('البطاقة مستخدمة', 409);
            card.openVisit = { id: uuid(), purpose: d.purpose, check_in: new Date().toISOString(), visitor: {
              name: d.name, national_id: d.nationalId, phone: d.phone, organization: d.organization, notes: d.notes, category: { name: 'زائر عادي' },
            } };
          } else {
            if (!card.openVisit || card.openVisit.id !== d.visitId) return fail('تغيرت الزيارة', 409);
            card.openVisit = null;
          }
          return ok({ cardNo: card.cardNo });
        }
        case '/api/soldiers': {
          const s: Soldier = { id: uuid(), military_no: String(body.militaryNo), name: String(body.name), rank: String(body.rank), military_rank: String(body.militaryRank ?? ''), company: String(body.company), unit: String(body.unit), sub_unit: String(body.subUnit ?? ''), status: 'in', version: 1, national_id: String(body.nationalId), archived: false, details: body.details as Soldier['details'] };
          state.soldiers.push(s);
          return ok({ id: s.id });
        }
        case '/api/gate': {
          const s = state.soldiers.find((x) => x.id === body.soldierId);
          if (!s) return fail('العسكري غير موجود', 404);
          if (body.kind === 'exit') {
            const permit: Permit = { id: uuid(), no: state.permits.length + 1, soldier_id: s.id, reason: String(body.reason), exit_at: new Date().toISOString(), expected_return: String(body.expectedReturn), returned_at: null, voided: false, name: s.name, military_no: s.military_no, rank: s.rank, company: s.company };
            state.permits.unshift(permit);
            s.status = 'out';
            return ok<GateMovementResult>({ id: permit.id, no: permit.no, returned_at: null });
          }
          const open = state.permits.find((p) => p.soldier_id === s.id && !p.returned_at);
          if (open) open.returned_at = new Date().toISOString();
          s.status = 'in';
          return ok<GateMovementResult>({ id: open?.id ?? uuid(), no: open?.no, returned_at: open?.returned_at });
        }
        case '/api/settings': {
          const width = Number(body.receiptWidthMm ?? 80);
          if (Number(body.receiptPrintableWidthMm ?? 72) > width) return fail('منطقة الطباعة يجب ألا تتجاوز عرض الورق', 400);
          Object.assign(savedSettings, body, { version: Number(body.version ?? 1) + 1 });
          return ok({ ok: true });
        }
        case '/api/outlets': {
          const o: Outlet = { id: uuid(), kind: body.kind as Outlet['kind'], name: String(body.name), disabled: false, sort_order: outlets.length };
          outlets.push(o);
          return ok({ id: o.id });
        }
        case '/api/outlets/update': {
          const o = outlets.find((x) => x.id === body.id);
          if (!o) return fail('نقطة البيع غير موجودة', 404);
          if (typeof body.name === 'string') o.name = body.name;
          if (typeof body.disabled === 'boolean') o.disabled = body.disabled;
          return ok({ id: o.id });
        }
        case '/api/outlets/delete': {
          const i = outlets.findIndex((x) => x.id === body.id);
          if (i < 0) return fail('نقطة البيع غير موجودة', 404);
          if (outlets.filter((x) => x.kind === outlets[i].kind && !x.disabled).length <= 1 && !outlets[i].disabled) return fail('لا يمكن حذف آخر نقطة بيع نشطة', 409);
          outlets.splice(i, 1);
          return ok({ id: String(body.id) });
        }
        case '/api/soldiers/import': case '/api/visitors/import': case '/api/fitness/import': case '/api/canteen/import': {
          const rows = (body.rows as Record<string, unknown>[]) ?? [];
          const errors = rows.flatMap((r, i) => (r.name === 'خطأ' || r.militaryNo === 'bad' ? [{ row: i + 1, message: 'بيانات غير صالحة' }] : []));
          return ok({ created: rows.length - errors.length, skipped: 0, errors });
        }
        case '/api/backup/restore':
          return body.confirm === 'RESTORE' && body.password === 'admin-pass' ? ok({ ok: true }) : fail('أدخل كلمة مرور المسؤول وأكد الاستعادة', 400);
        case '/api/backup/create': state.backups.unshift({ id: `${uuid()}.mab`, createdAt: new Date().toISOString(), size: 1000 }); return ok({ id: 'x', createdAt: new Date().toISOString() });
        default: return ok({ ok: true, id: uuid() });
      }
    },
  };
  return fake;
}

export function dashboardFixture(days: number): DashboardData {
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.UTC(2026, 9, 21 - (days - 1 - i))).toISOString().slice(0, 10));
  const food = (k: number) => ({ todayCents: 12500 * k, rangeCents: 250000 * k, previousCents: 200000 * k, byDay: dates.map((date, i) => ({ date, cents: 1000 * k * (i % 5) })), byOutlet: [{ name: 'الكانتين الرئيسي', cents: 150000 * k }, { name: 'كانتين 2', cents: 100000 * k }] });
  return {
    range: { days, from: dates[0], to: dates[dates.length - 1] },
    soldiers: { total: 120, inside: 90, outside: 30, late: 4, archived: 2 },
    byCompany: [{ company: 'السرية الأولى', count: 60 }, { company: 'السرية الثانية', count: 60 }],
    gate: {
      today: { exits: 12, entries: 9 }, total: 220, previousTotal: 180,
      byDay: dates.map((date, i) => ({ date, exits: 5 + (i % 4), entries: 4 + (i % 3) })),
      byReason: [{ reason: 'إجازة اعتيادية', count: 40 }, { reason: 'علاج بالمستشفى', count: 10 }],
      recent: [{ at: new Date().toISOString(), kind: 'exit', name: 'أحمد محمود علي حسن', military_no: '123456789', reason: 'إجازة اعتيادية' }],
    },
    visitors: { today: 6, inside: 2, total: 55, previousTotal: 40, byDay: dates.map((date, i) => ({ date, count: i % 6 })), byCategory: [{ category: 'زائر عادي', count: 40 }, { category: 'ضابط', count: 15 }] },
    food: { canteen: food(1), buffet: food(2) },
    fitness: { records: 14, byType: [{ type: 'جري 3 كم', count: 9 }, { type: 'ضغط', count: 5 }] },
  };
}

function analyticFixture(params: URLSearchParams) {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? from;
  const topics = (params.get('topics') ?? 'gate').split(',');
  return {
    title: 'تقرير الوحدة المفصل', subject: { type: params.get('subject') ?? 'unit', label: 'الوحدة كلها' },
    from, to, days: 1, previous: params.get('compare') ? { from, to } : null,
    generatedAt: new Date().toISOString(), generatedBy: 'مدير النظام', unit: { name: 'الوحدة التجريبية', parentFormation: '' }, topics,
    summary: [{ label: 'حركات البوابة والتصاريح — مرات الخروج', value: 4, previous: 2 }],
    exceptions: [{ title: 'متأخرون عن موعد العودة', columns: [{ key: 'name', label: 'العسكري' }], rows: [{ name: 'أحمد محمود علي حسن' }] }],
    profile: null,
    sections: topics.map((id) => ({
      id, title: id === 'gate' ? 'حركات البوابة والتصاريح' : id,
      kpis: [{ label: 'مرات الخروج', value: 4, previous: 2 }],
      tables: [{ title: 'حسب سبب الخروج', columns: [{ key: 'reason', label: 'السبب' }, { key: 'count', label: 'مرات', type: 'number', total: true }], rows: [{ reason: 'إجازة', count: 4 }] }],
    })),
  };
}

function dailyFixture(date: string) {
  return {
    date, generatedAt: new Date().toISOString(), unit: { name: 'الوحدة التجريبية', parentFormation: '' },
    snapshot: { soldiers: { total: 3, inside: 2, outside: 1, archived: 0, byCompany: [{ company: 'السرية الأولى', count: 2 }, { company: 'السرية الثانية', count: 1 }] }, permits: { activeOutside: 1, late: 0 }, outlets: { canteen: 1, buffet: 1 } },
    activity: {
      gate: { entries: 1, exits: 2, total: 3, byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, entries: hour === 9 ? 1 : 0, exits: hour === 8 ? 2 : 0 })), byReason: [{ reason: 'إجازة اعتيادية', count: 2 }], recent: [] },
      visitors: { checkIns: 1, checkOuts: 0, stillInside: 1, byCategory: [{ category: 'زائر عادي', count: 1 }], recent: [] },
      canteen: { transactions: 0, totalCents: 0, reversals: 0, outlets: [], recent: [] },
      buffet: { transactions: 0, totalCents: 0, reversals: 0, outlets: [], recent: [] },
      fitness: { records: 0, byType: [], recent: [] },
    },
    audit: [],
  };
}

/** Installs the fake on `window.desktop` (dev-only). */
export function installMockDesktop(options?: FakeOptions): FakeDesktop {
  const fake = createFakeDesktop(options);
  window.desktop = fake;
  return fake;
}
