import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';
import '@/features/soldiers/SoldierProfilePage';

it('adds and edits a medical order directly inside the soldier file', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const fake = await renderApp(`/soldiers/${id}`);
  await userEvent.click(await screen.findByRole('tab', { name: /^الأوامر الطبية/ }));
  const add = await screen.findByRole('button', { name: 'إضافة سجل' });
  await waitFor(() => expect(add).toBeEnabled());
  await userEvent.click(add);
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByRole('textbox', { name: /البيان/ }), { target: { value: 'راحة طبية' } });
  fireEvent.change(dialog.getByLabelText(/التاريخ \/ بداية المدة/), { target: { value: '2026-10-22' } });
  fireEvent.change(dialog.getByLabelText('تاريخ النهاية (اختياري)'), { target: { value: '2026-10-24' } });
  fireEvent.change(dialog.getByLabelText('التفاصيل والملاحظات'), { target: { value: 'تعليمات الطبيب' } });
  await userEvent.click(dialog.getByRole('button', { name: 'حفظ السجل' }));
  expect(await screen.findByText('راحة طبية')).toBeInTheDocument();
  const call = fake.calls.find(c => c.method === 'POST' && c.path === '/api/soldier/records')!;
  expect(call.data).toMatchObject({ soldierId: id, category: 'medical', recordDate: '2026-10-22', endDate: '2026-10-24', details: 'تعليمات الطبيب' });
  expect(call.requestId).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'إجراءات' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'عرض وتعديل السجل' }));
  const edit = within(await screen.findByRole('dialog'));
  expect(edit.getByLabelText('التفاصيل والملاحظات')).toHaveValue('تعليمات الطبيب');
  fireEvent.change(edit.getByRole('textbox', { name: /البيان/ }), { target: { value: 'راحة طبية معدلة' } });
  await userEvent.click(edit.getByRole('button', { name: 'حفظ السجل' }));
  expect(await screen.findByText('راحة طبية معدلة')).toBeInTheDocument();
}, 60_000);

it('adds the unit security officer report under its own section', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const fake = await renderApp(`/soldiers/${id}`);
  await userEvent.click(await screen.findByRole('tab', { name: /^تقرير ضابط أمن الوحدة/ }));
  const add = screen.getByRole('button', { name: 'إضافة سجل' });
  await waitFor(() => expect(add).toBeEnabled());
  await userEvent.click(add);
  const form = within(await screen.findByRole('dialog'));
  fireEvent.change(form.getByRole('textbox', { name: /البيان/ }), { target: { value: 'تقرير متابعة' } });
  fireEvent.change(form.getByLabelText(/التاريخ \/ بداية المدة/), { target: { value: '2026-10-22' } });
  fireEvent.change(form.getByLabelText('نص تقرير ضابط أمن الوحدة'), { target: { value: 'نص التقرير وملاحظات الضابط' } });
  await userEvent.click(form.getByRole('button', { name: 'حفظ السجل' }));
  expect(await screen.findByText('تقرير متابعة')).toBeInTheDocument();
  expect(fake.calls.find(c => c.method === 'POST' && c.path === '/api/soldier/records')?.data)
    .toMatchObject({ soldierId: id, category: 'security_report', details: 'نص التقرير وملاحظات الضابط' });
}, 60_000);
