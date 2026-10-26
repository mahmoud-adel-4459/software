import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';

it('saves the memo formation and two signatures with the current unit settings', async () => {
  const fake = await renderApp('/settings');
  const formation = await screen.findByRole('textbox', { name: 'التشكيل أعلى الورقة' });
  fireEvent.change(formation, { target: { value: 'قيادة الاختبار' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم الموقّع يمينًا' }), { target: { value: 'الموقّع الأول' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'اسم الموقّع يسارًا' }), { target: { value: 'الموقّع الثاني' } });
  await userEvent.click(screen.getByRole('button', { name: 'حفظ تصميم المذكرة' }));
  await waitFor(() => expect(fake.calls.some((call) => call.path === '/api/settings' && call.method === 'POST')).toBe(true));
  expect(fake.calls.find((call) => call.path === '/api/settings' && call.method === 'POST')?.data).toMatchObject({ memoFormation: 'قيادة الاختبار', memoRightName: 'الموقّع الأول', memoLeftName: 'الموقّع الثاني', paper: 'A4' });
}, 60000);
