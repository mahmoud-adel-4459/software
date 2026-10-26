import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';
import { parseGateScan } from '@/lib/soldierProfile';

it('recognizes precisely 24 reusable visitor card codes without confusing soldier numbers', () => {
  for (let cardNo = 1; cardNo <= 24; cardNo++) expect(parseGateScan(String(cardNo))).toEqual({ kind: 'visitor-card', cardNo });
  expect(parseGateScan('٢٤')).toEqual({ kind: 'visitor-card', cardNo: 24 });
  expect(parseGateScan('000001')).toEqual({ kind: 'soldier', militaryNo: '000001' });
  expect(parseGateScan('25').kind).toBe('soldier');
});

it('scans a free card, enters a visitor, checks out and starts a fresh blank visit', async () => {
  const fake = await renderApp('/gate', { role: 'gate', kind: 'gate' });
  const scan = async () => userEvent.type(await screen.findByLabelText('الرقم العسكري'), '١{Enter}');
  await scan();
  fireEvent.change(await screen.findByRole('textbox', { name: /اسم الزائر/ }), { target: { value: 'زائر أول' } });
  fireEvent.change(screen.getByLabelText('الرقم القومي (اختياري)'), { target: { value: '٣٠١٠١٠١٠١٠١٠١١' } });
  fireEvent.change(screen.getByRole('textbox', { name: /سبب الزيارة/ }), { target: { value: 'تسليم أوراق' } });
  await userEvent.click(screen.getByRole('combobox', { name: /فئة الزائر/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'زائر عادي' }));
  await userEvent.click(screen.getByRole('button', { name: 'تسجيل دخول الزائر' }));
  await waitFor(() => expect(fake.calls.some(c => c.method === 'POST' && c.path === '/api/gate/visitor-card')).toBe(true));
  const first = fake.calls.find(c => c.method === 'POST' && c.path === '/api/gate/visitor-card')!;
  expect(first.data).toMatchObject({ cardNo: 1, action: 'in', name: 'زائر أول', nationalId: '30101010101011' });
  expect(first.requestId).toBeTruthy();
  await scan();
  expect(await screen.findByText('زائر أول')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /اسم الزائر/ })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'تسجيل خروج الزائر وإتاحة البطاقة' }));
  await screen.findByLabelText('الرقم العسكري');
  const checkout = fake.calls.filter(c => c.method === 'POST' && c.path === '/api/gate/visitor-card')[1];
  expect(checkout.data).toMatchObject({ cardNo: 1, action: 'out', visitId: expect.any(String) });
  await scan();
  expect(await screen.findByRole('textbox', { name: /اسم الزائر/ })).toHaveValue('');
  expect(screen.getByLabelText('الرقم القومي (اختياري)')).toHaveValue('');
});

it('prints all 24 cards in order and can print one replacement', async () => {
  const fake = await renderApp('/visitors');
  const title = await screen.findByText('بطاقات الزوار من 1 إلى 24');
  const section = title.closest('.MuiCard-root') ?? title.parentElement!.parentElement!;
  const buttons = within(section as HTMLElement).getAllByRole('button', { name: 'طباعة' });
  expect(buttons).toHaveLength(1);
  await userEvent.click(buttons[0]);
  expect(fake.documents[0]).toMatchObject({ type: 'visitor-cards', cardNos: Array.from({ length: 24 }, (_, i) => i + 1), mode: 'print' });
  await userEvent.click(screen.getByRole('combobox', { name: 'البطاقات المطلوب طباعتها' }));
  await userEvent.click(await screen.findByRole('option', { name: /^بطاقة 1$/ }));
  await userEvent.click(buttons[0]);
  expect(fake.documents[1]).toMatchObject({ type: 'visitor-cards', cardNos: [1], mode: 'print' });
});
