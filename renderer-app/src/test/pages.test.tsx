import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './harness';

const fill = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('login', () => {
  it('signs in and lands on the role home page', async () => {
    const fake = await renderApp('/login', { signedOut: true, role: 'clerk' });
    fill(await screen.findByLabelText('اسم المستخدم'), 'clerk');
    fill(screen.getByLabelText('كلمة المرور'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect(await screen.findByRole('heading', { name: 'الكانتين', level: 1 })).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === '/api/catalog')).toBe(true);
  });

  it('redirects signed-out users to /login', async () => {
    await renderApp('/soldiers', { signedOut: true });
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  });
});

describe('role based layout', () => {
  it('clerk cannot open admin pages and sees a reduced menu', async () => {
    await renderApp('/users', { role: 'clerk' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'الكانتين', level: 1 })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: 'القائمة الرئيسية' });
    expect(within(nav).queryByText('المستخدمون')).toBeNull();
    expect(within(nav).getByText('البوفيه')).toBeInTheDocument();
  });
});

describe('gate station', () => {
  it('scan -> exit with reason/return -> entry', async () => {
    const fake = await renderApp('/gate', { role: 'gate', kind: 'gate' });
    const field = await screen.findByLabelText('الرقم العسكري');
    expect(field).toHaveFocus();
    await userEvent.type(field, '١٢٣٤٥٦٧٨٩{Enter}'); // Arabic-Indic digits from a wedge scanner
    expect(await screen.findByText('إذن خروج')).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path.startsWith('/api/gate/soldier'))?.path).toContain('militaryNo=123456789');

    await userEvent.click(await screen.findByLabelText(/إجازة اعتيادية/));
    fireEvent.change(screen.getByLabelText(/يوم العودة/), { target: { value: '2030-01-02' } });
    fireEvent.change(screen.getByLabelText(/وقت العودة/), { target: { value: '09:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الخروج وإصدار الإذن' }));

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'POST' && c.path === '/api/gate')).toBe(true));
    const post = fake.calls.find((c) => c.method === 'POST' && c.path === '/api/gate')!;
    expect(post.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.data).toMatchObject({ kind: 'exit', reason: 'إجازة اعتيادية', soldierId: '11111111-1111-4111-8111-111111111111' });
    expect(Date.parse((post.data as { expectedReturn: string }).expectedReturn)).toBeGreaterThan(0);

    expect(await screen.findByText('إذن دخول')).toBeInTheDocument(); // soldier is now outside
    expect(await screen.findByText(/آخر إذن #1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل العودة الآن' }));
    await waitFor(() => expect(fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/gate')).toHaveLength(2));
    expect(fake.calls.filter((c) => c.path === '/api/gate')[1].data).toMatchObject({ kind: 'entry' });
  });

  it('rejects exit submission without a reason', async () => {
    const fake = await renderApp('/gate', { role: 'gate', kind: 'gate' });
    await userEvent.type(await screen.findByLabelText('الرقم العسكري'), '123456789{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'تأكيد الخروج وإصدار الإذن' }));
    expect(fake.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('soldiers', () => {
  it('lists soldiers and creates a new one with idempotent request id', async () => {
    const fake = await renderApp('/soldiers');
    expect(await screen.findByText('أحمد محمود علي حسن')).toBeInTheDocument();
    expect(screen.getByText('محمد سعيد إبراهيم')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'إضافة عسكري' }));
    fill(await screen.findByLabelText('الاسم الرباعي'), 'سامي حسن علي');
    fill(screen.getByLabelText('الرقم العسكري'), '777888999');
    fill(screen.getByLabelText('الرقم القومي'), '29901011234999');
    fill(screen.getByLabelText('السرية'), 'السرية الثالثة');
    await userEvent.click(screen.getByRole('button', { name: 'حفظ العسكري' }));

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(true));
    const post = fake.calls.find((c) => c.path === '/api/soldiers' && c.method === 'POST')!;
    expect(post.data).toMatchObject({ name: 'سامي حسن علي', militaryNo: '777888999', nationalId: '29901011234999', rank: 'جندي' });
    expect(post.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('سامي حسن علي')).toBeInTheDocument(); // back on the list
  });

  it('validates the military and national numbers before posting', async () => {
    const fake = await renderApp('/soldiers/new');
    fill(await screen.findByLabelText('الاسم الرباعي'), 'اسم');
    fill(screen.getByLabelText('الرقم العسكري'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'حفظ العسكري' }));
    expect(await screen.findByText('الرقم العسكري من 6 إلى 30 رقمًا')).toBeInTheDocument();
    expect(await screen.findByText('الرقم القومي 14 رقمًا')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('backups restore confirmation', () => {
  it('requires the admin password AND typing RESTORE before restoring', async () => {
    const fake = await renderApp('/backups');
    await screen.findByText('النسخ المتاحة');
    await userEvent.click(await screen.findByRole('button', { name: 'إجراءات' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'استعادة' }));

    const restore = await screen.findByRole('button', { name: 'استعادة النسخة المحددة' });
    await screen.findByText('soldiers'); // preview counts loaded
    expect(restore).toBeDisabled();
    fill(screen.getByLabelText('كلمة مرور المسؤول'), 'admin-pass');
    expect(restore).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/اكتب RESTORE/), 'restore');
    expect(restore).toBeDisabled(); // case sensitive
    await userEvent.clear(screen.getByLabelText(/اكتب RESTORE/));
    await userEvent.type(screen.getByLabelText(/اكتب RESTORE/), 'RESTORE');
    expect(restore).toBeEnabled();

    await userEvent.click(restore);
    await waitFor(() => expect(fake.calls.some((c) => c.path === '/api/backup/restore')).toBe(true));
    expect(fake.calls.find((c) => c.path === '/api/backup/restore')!.data).toMatchObject({ password: 'admin-pass', confirm: 'RESTORE' });
    // restoring signs everybody out
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  });

  it('shows KPI cards for last backup, schedule, size and status', async () => {
    await renderApp('/backups');
    expect(await screen.findByText('آخر نسخة')).toBeInTheDocument();
    expect(screen.getByText('النسخة التالية (تقريبي)')).toBeInTheDocument();
    expect(screen.getByText(/الحجم الكلي/)).toBeInTheDocument();
    expect(screen.getByText('حالة الجدولة')).toBeInTheDocument();
    expect(await screen.findByText('يعمل في الخلفية')).toBeInTheDocument();
  });
});
