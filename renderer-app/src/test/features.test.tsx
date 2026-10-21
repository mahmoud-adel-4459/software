import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mapImportRows, normalizeHeader, chunk, submitInChunks, VISITOR_IMPORT, SOLDIER_IMPORT } from '@/lib/excel';
import { renderApp } from './harness';

const SOLDIER_ID = '11111111-1111-4111-8111-111111111111';

describe('QR flows', () => {
  it('soldier list: preview calls desktop.qr(id) and shows a big crisp image', async () => {
    const fake = await renderApp('/soldiers');
    const qr = vi.spyOn(fake, 'qr');
    await screen.findByText('أحمد محمود علي حسن');
    await userEvent.click((await screen.findAllByRole('button', { name: 'إجراءات' }))[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'معاينة QR' }));
    const dialog = await screen.findByRole('dialog');
    const img = await within(dialog).findByAltText('QR');
    expect(qr).toHaveBeenCalledWith(SOLDIER_ID);
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(img).toHaveStyle({ width: '300px', imageRendering: 'pixelated' });
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'طباعة' })[0]);
    await waitFor(() => expect(fake.documents[0]).toMatchObject({ type: 'qr', ids: [SOLDIER_ID], copies: 1, mode: 'print' }));
  });

  it('shows an error instead of a blank box when the QR channel fails', async () => {
    const fake = await renderApp('/soldiers');
    fake.qr = async () => ({ ok: false, error: 'تعذر إنشاء QR', status: 500 });
    await screen.findByText('أحمد محمود علي حسن');
    await userEvent.click((await screen.findAllByRole('button', { name: 'إجراءات' }))[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'معاينة QR' }));
    expect(await screen.findByText('تعذر إنشاء QR')).toBeInTheDocument();
  });

  it('visitors: QR preview prints through the label printer via desktop.document (no window.print)', async () => {
    const fake = await renderApp('/visitors');
    const qrVisitor = vi.spyOn(fake, 'qrVisitor');
    const print = vi.fn();
    window.print = print;
    await screen.findByText('زائر تجريبي');
    await userEvent.click((await screen.findAllByRole('button', { name: 'إجراءات' }))[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'QR الزائر' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('QR');
    expect(qrVisitor).toHaveBeenCalledWith('v1');
    expect(await within(dialog).findByTestId('label-printer-note')).toHaveTextContent('89×102');
    await userEvent.click(within(dialog).getByRole('button', { name: 'طباعة' }));
    await waitFor(() => expect(fake.documents).toHaveLength(1));
    expect(fake.documents[0]).toEqual({ type: 'visitor-qr', ids: ['v1'], copies: 1, mode: 'print' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'معاينة' }));
    await waitFor(() => expect(fake.documents).toHaveLength(2));
    expect(fake.documents[1]).toMatchObject({ type: 'visitor-qr', mode: 'preview' });
    expect(print).not.toHaveBeenCalled();
  });

  it('settings: printing section lists printers and sends test prints', async () => {
    const fake = await renderApp('/settings');
    await screen.findByText('الطباعة');
    await userEvent.click(await screen.findByRole('button', { name: /طباعة اختبارية — ملصق/ }));
    await userEvent.click(screen.getByRole('button', { name: /طباعة اختبارية — إيصال/ }));
    await waitFor(() => expect(fake.testPrints).toHaveLength(2));
    expect(fake.testPrints).toEqual([{ kind: 'label' }, { kind: 'receipt' }]);
    expect(screen.getAllByText('مقاس الملصق').length).toBeGreaterThan(0);
  });

  it('settings: receipt card presets, validation, live preview, save and calibration', async () => {
    const fake = await renderApp('/settings');
    const c = within(await screen.findByTestId('receipt-card'));
    const input = (label: string) => c.getByLabelText(label) as HTMLInputElement;
    expect(input('عرض الورق').value).toBe('80');
    expect(input('منطقة الطباعة').value).toBe('72');
    // 58 mm preset fills the numbers and the preview follows
    await userEvent.click(c.getByRole('combobox', { name: 'إعداد جاهز' }));
    await userEvent.click(await screen.findByRole('option', { name: 'ورق 58 مم' }));
    await waitFor(() => expect(input('عرض الورق').value).toBe('58'));
    expect([input('منطقة الطباعة').value, input('الهامش الجانبي').value, input('حجم الخط').value]).toEqual(['48', '1', '10']);
    expect(c.getByTestId('receipt-preview')).toHaveTextContent('الورق 58 مم');
    expect(c.getByTestId('receipt-preview')).toHaveTextContent('المحتوى 46 مم');
    // printable wider than the paper is rejected and nothing is saved
    await userEvent.clear(input('منطقة الطباعة'));
    await userEvent.type(input('منطقة الطباعة'), '70');
    await userEvent.click(c.getByRole('button', { name: 'حفظ' }));
    expect(await c.findByText('منطقة الطباعة يجب ألا تتجاوز عرض الورق')).toBeInTheDocument();
    expect(fake.calls.filter((x) => x.path === '/api/settings')).toHaveLength(0);
    // valid values + footer + fixed height save every receipt key
    await userEvent.clear(input('منطقة الطباعة'));
    await userEvent.type(input('منطقة الطباعة'), '50');
    await userEvent.type(c.getByLabelText('نص أسفل الإيصال'), 'شكرًا لكم');
    expect(c.getByTestId('receipt-preview')).toHaveTextContent('شكرًا لكم');
    await userEvent.click(c.getByRole('button', { name: 'ثابت' }));
    await userEvent.clear(input('الارتفاع الثابت'));
    await userEvent.type(input('الارتفاع الثابت'), '200');
    await userEvent.click(c.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(fake.calls.filter((x) => x.path === '/api/settings')).toHaveLength(1));
    expect(fake.calls.find((x) => x.path === '/api/settings')!.data).toMatchObject({
      receiptWidthMm: 58, receiptPrintableWidthMm: 50, receiptMarginMm: 1, receiptFontPt: 10, receiptLineHeight: 1.4, receiptBold: true,
      receiptShowLogo: true, receiptLogoMm: 20, receiptHeightMode: 'fixed', receiptHeightMm: 200, receiptCopies: 1, receiptFooter: 'شكرًا لكم',
      receiptTopFeedMm: 2, receiptBottomFeedMm: 8,
    });
    // calibration and preview go through the receipt test print
    await userEvent.click(c.getByRole('button', { name: 'طباعة معايرة' }));
    await userEvent.click(c.getByRole('button', { name: 'معاينة' }));
    await waitFor(() => expect(fake.testPrints).toHaveLength(2));
    expect(fake.testPrints).toEqual([{ kind: 'receipt' }, { kind: 'receipt', mode: 'preview' }]);
  });

  it('printing page: bulk selection sends type/ids/copies/mode to desktop.document', async () => {
    const fake = await renderApp('/printing');
    await screen.findAllByText('أحمد محمود علي حسن');
    const boxes = await screen.findAllByRole('checkbox');
    await userEvent.click(boxes[1]); // first row (0 = select all)
    await userEvent.click(screen.getAllByRole('button', { name: 'طباعة المختار' }).at(-1)!);
    await waitFor(() => expect(fake.documents).toHaveLength(1));
    expect(fake.documents[0]).toEqual({ type: 'qr', ids: [SOLDIER_ID], copies: 1, mode: 'print' });
  });
});

describe('Excel header mapping', () => {
  it('normalizes case, spaces, hamza and diacritics', () => {
    expect(normalizeHeader(' Military  No ')).toBe(normalizeHeader('militaryNo'));
    expect(normalizeHeader('الاسم')).toBe(normalizeHeader('ألاسم'));
    expect(normalizeHeader('رقم_السلاح')).toBe(normalizeHeader('رقم السلاح'));
  });
  it('accepts Arabic headers or key names, reports unknown/missing and drops empty rows', () => {
    const m = mapImportRows({ fileName: 'x.xlsx', headers: ['الاسم', 'CATEGORYNAME', 'عمود غريب'], rows: [{ 'الاسم': ' سامي ', CATEGORYNAME: 'ضابط', 'عمود غريب': 1 }, { 'الاسم': null, CATEGORYNAME: null, 'عمود غريب': null }] }, VISITOR_IMPORT);
    expect(m.rows).toEqual([{ name: 'سامي', categoryName: 'ضابط' }]);
    expect(m.unknownHeaders).toEqual(['عمود غريب']);
    expect(m.missingRequired).toEqual([]);
    const s = mapImportRows({ fileName: 'x', headers: ['name'], rows: [{ name: 'a' }] }, SOLDIER_IMPORT);
    expect(s.missingRequired.map((f) => f.key)).toEqual(['militaryNo']);
  });
  it('chunks to <=1000 rows with a request id per chunk and offsets error rows', async () => {
    expect(chunk(Array.from({ length: 2500 }, (_, i) => i)).map((c) => c.length)).toEqual([1000, 1000, 500]);
    const ids: string[] = [];
    const res = await submitInChunks(Array.from({ length: 1500 }, () => ({})), async (rows, id) => {
      ids.push(id);
      return { created: rows.length - 1, skipped: 0, errors: [{ row: 2, message: 'x' }] };
    });
    expect(new Set(ids).size).toBe(2);
    expect(res).toEqual({ created: 1498, skipped: 0, errors: [{ row: 2, message: 'x' }, { row: 1002, message: 'x' }] });
  });
});

describe('Excel import / export flows', () => {
  it('visitors: pick file, preview, submit, result with downloadable errors', async () => {
    const fake = await renderApp('/visitors');
    fake.nextImport = { fileName: 'v.xlsx', headers: ['الاسم', 'الفئة', 'الهاتف'], rows: [{ 'الاسم': 'زائر ١', 'الفئة': 'زائر عادي', 'الهاتف': '010' }, { 'الاسم': 'خطأ', 'الفئة': 'ضابط', 'الهاتف': null }] };
    await userEvent.click(await screen.findByRole('button', { name: 'استيراد Excel' }));
    expect(await screen.findByText('2 صفًا للاستيراد')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'معاينة الصفوف' })).getByText('زائر ١')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'استيراد 2 صفًا' }));
    expect(await screen.findByText('تمت إضافة 1')).toBeInTheDocument();
    const call = fake.calls.find((c) => c.path === '/api/visitors/import')!;
    expect(call.method).toBe('POST');
    expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.data).toEqual({ rows: [{ name: 'زائر ١', categoryName: 'زائر عادي', phone: '010' }, { name: 'خطأ', categoryName: 'ضابط', phone: null }] });
    expect(screen.getByText('بيانات غير صالحة')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تنزيل الأخطاء Excel' }));
    await waitFor(() => expect(fake.excelFiles.at(-1)?.arg.sheets[0].rows).toEqual([{ row: 2, message: 'بيانات غير صالحة' }]));
  });

  it('cancelled file picker does nothing; template has Arabic headers and one sample row', async () => {
    const fake = await renderApp('/soldiers');
    await screen.findByText('أحمد محمود علي حسن');
    await userEvent.click(screen.getByRole('button', { name: 'استيراد Excel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'تحميل القالب' }));
    await waitFor(() => expect(fake.excelFiles).toHaveLength(1));
    const sheet = fake.excelFiles[0].arg.sheets[0];
    expect(fake.excelFiles[0].kind).toBe('template');
    expect(sheet.columns.map((c) => c.header)).toContain('الرقم العسكري');
    expect(sheet.rows).toHaveLength(1);
  });

  it('soldiers export sends Arabic headers and the visible rows', async () => {
    const fake = await renderApp('/soldiers');
    await screen.findByText('أحمد محمود علي حسن');
    await userEvent.click(screen.getByRole('button', { name: 'تصدير Excel' }));
    await waitFor(() => expect(fake.excelFiles).toHaveLength(1));
    const { arg } = fake.excelFiles[0];
    expect(arg.sheets[0].columns.map((c) => c.header).slice(0, 3)).toEqual(['الاسم', 'الرقم العسكري', 'الرتبة']);
    expect(arg.sheets[0].rows[0]).toMatchObject({ name: 'أحمد محمود علي حسن', military_no: '123456789', status: 'داخل الوحدة' });
  });
});

describe('outlet management', () => {
  it('admin adds, renames and deletes; a 409 shows the server message and suggests disabling', async () => {
    const fake = await renderApp('/canteen');
    await userEvent.click(await screen.findByRole('button', { name: 'إضافة' }));
    fireEvent.change(await screen.findByLabelText('اسم كانتين'), { target: { value: 'كانتين الضباط' } });
    await userEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(fake.calls.find((c) => c.path === '/api/outlets')?.data).toEqual({ kind: 'canteen', name: 'كانتين الضباط' }));
    await userEvent.click(await screen.findByRole('button', { name: 'تعديل كانتين الضباط' }));
    fireEvent.change(await screen.findByLabelText('اسم كانتين'), { target: { value: 'الضباط' } });
    await userEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(fake.calls.find((c) => c.path === '/api/outlets/update')?.data).toMatchObject({ name: 'الضباط' }));

    fake.failures['POST /api/outlets/delete'] = { status: 409, error: 'لا يمكن حذف نقطة بيع لها عمليات' };
    const chip = (await screen.findByText('الضباط')).closest('.MuiChip-root')!;
    fireEvent.click(chip.querySelector('svg[aria-label="حذف الضباط"]')!);
    await userEvent.click(await screen.findByRole('button', { name: 'حذف' }));
    expect(await screen.findByText(/لا يمكن حذف نقطة بيع لها عمليات — يمكنك تعطيل/)).toBeInTheDocument();

    delete fake.failures['POST /api/outlets/delete'];
    await userEvent.click(screen.getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(screen.queryByText('الضباط')).toBeNull());
  });

  it('clerk sees no management buttons', async () => {
    await renderApp('/canteen', { role: 'clerk' });
    await screen.findByRole('heading', { name: 'الكانتين', level: 1 });
    expect(screen.queryByRole('button', { name: 'إضافة' })).toBeNull();
  });
});

describe('dashboard and brand', () => {
  it('admin lands on the dashboard with hero, KPIs and range tabs', async () => {
    const fake = await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'الرئيسية', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('الموقف الحالي للوحدة')).toBeInTheDocument();
    await waitFor(() => expect(fake.calls.find((c) => c.path.startsWith('/api/dashboard'))?.path).toContain('days=7'));
    await userEvent.click(screen.getByRole('tab', { name: '30 يومًا' }));
    await waitFor(() => expect(fake.calls.some((c) => c.path.includes('days=30'))).toBe(true));
    expect(await screen.findByText('آخر الحركات')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تصدير Excel' }));
    await waitFor(() => expect(fake.excelFiles[0].arg.sheets.map((s) => s.name)).toEqual(['ملخص', 'حركة البوابة', 'المبيعات']));
  });

  it('clerk never reaches the dashboard', async () => {
    const fake = await renderApp('/', { role: 'clerk' });
    expect(await screen.findByRole('heading', { name: 'الكانتين', level: 1 })).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path.startsWith('/api/dashboard'))).toBe(false);
  });

  it('login page shows the official emblem', async () => {
    await renderApp('/login', { signedOut: true });
    const img = await screen.findByAltText('شعار منظومة شؤون الوحدة الداخلية');
    expect(img.getAttribute('src')).toMatch(/logo\.(png|jpg)$/);
    expect(screen.getByText('نظام إدارة متكامل · القوات المسلحة المصرية')).toBeInTheDocument();
  });
});
