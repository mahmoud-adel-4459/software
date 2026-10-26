import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';
import '@/features/settings/SettingsPage';

it('edits a former fixed reason, adds more than two reasons and saves the full list', async () => {
  const fake = await renderApp('/settings');
  const heading = await screen.findByRole('heading', { name: 'أسباب الخروج' });
  const section = () => within(screen.getByRole('heading', { name: heading.textContent! }).closest('.MuiCard-root') as HTMLElement);
  await userEvent.click(section().getByText('إجازة اعتيادية'));
  fireEvent.change(section().getByLabelText('تعديل سبب الخروج'), { target: { value: 'سبب معدل' } });
  await userEvent.click(section().getByRole('button', { name: 'حفظ التعديل' }));
  await waitFor(() => expect(section().queryByText('إجازة اعتيادية')).toBeNull());
  await userEvent.click(section().getByText('إجازة عارضة'));
  await userEvent.keyboard('{Delete}');
  await waitFor(() => expect(section().queryByText('إجازة عارضة')).toBeNull());
  for (const reason of ['سبب إضافي أول', 'سبب إضافي ثاني', 'سبب إضافي ثالث']) {
    fireEvent.change(section().getByLabelText('سبب خروج جديد'), { target: { value: reason } });
    await userEvent.click(section().getByRole('button', { name: 'إضافة سبب' }));
    await waitFor(() => expect(section().getByLabelText('سبب خروج جديد')).toHaveValue(''));
    expect(section().getByText(reason)).toBeInTheDocument();
  }
  expect(screen.queryByRole('button', { name: 'حفظ أسباب الخروج' })).toBeNull();
  await waitFor(() => expect(fake.calls.some(c => c.path === '/api/settings')).toBe(true));
  const body = fake.calls.filter(c => c.path === '/api/settings').at(-1)!.data as { exitReasons: string[] };
  expect(body.exitReasons).toEqual(expect.arrayContaining(['سبب معدل', 'سبب إضافي أول', 'سبب إضافي ثاني', 'سبب إضافي ثالث']));
  expect(body.exitReasons).not.toContain('إجازة اعتيادية');
  // Navigating to the gate must fetch the saved list, without a second save or an app restart.
  await userEvent.click(screen.getByRole('link', { name: 'البوابة' }));
  await userEvent.type(await screen.findByLabelText('الرقم العسكري'), '123456789{Enter}');
  expect(await screen.findByRole('radio', { name: /سبب معدل/ })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /إجازة اعتيادية/ })).toBeNull();
}, 60_000);
