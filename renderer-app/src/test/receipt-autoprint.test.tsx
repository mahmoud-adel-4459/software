import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './harness';

describe('purchase receipt printing', () => {
  for (const route of ['/canteen', '/buffet']) {
    it(`${route}: prints the saved transaction immediately without preview`, async () => {
      const fake = await renderApp(route, { role: 'clerk' });
      await userEvent.click(await screen.findByRole('button', { name: 'اسكان كود العسكري' }));
      const scan = screen.getByRole('textbox', { name: 'الرقم العسكري' });
      await userEvent.type(scan, '123456789{Enter}');
      const amount = await screen.findByRole('textbox', { name: 'المبلغ بالجنيه' });
      fireEvent.change(amount, { target: { value: '12.50' } });
      await userEvent.click(screen.getByRole('button', { name: 'تسجيل المشتريات' }));
      await waitFor(() => expect(fake.documents).toHaveLength(1));
      expect(fake.documents[0]).toMatchObject({ type: 'canteen', mode: 'print' });
      expect(fake.documents[0]).toHaveProperty('id', expect.any(String));
      expect(fake.calls.filter((call) => call.method === 'POST' && call.path === '/api/canteen')).toHaveLength(1);
    }, 60000);
  }
  it('keeps the saved purchase when printing fails and offers reprinting instead of resubmission', async () => {
    const fake = await renderApp('/canteen', { role: 'clerk' });
    fake.document = async () => ({ ok: false, error: 'printer offline' });
    await userEvent.click(await screen.findByRole('button', { name: 'اسكان كود العسكري' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'الرقم العسكري' }), '123456789{Enter}');
    const amount = await screen.findByRole('textbox', { name: 'المبلغ بالجنيه' });
    fireEvent.change(amount, { target: { value: '12.50' } });
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل المشتريات' }));
    expect(await screen.findByText(/تم حفظ العملية، لكن تعذرت الطباعة/)).toBeInTheDocument();
    expect(amount).toHaveValue('');
    expect(fake.calls.filter((call) => call.method === 'POST' && call.path === '/api/canteen')).toHaveLength(1);
  }, 60000);
});
