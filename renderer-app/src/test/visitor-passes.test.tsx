import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';
import { parseGateScan } from '@/lib/soldierProfile';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const digits = (prefix: string) => prefix + BigInt('0x' + ID.replaceAll('-', '')).toString().padStart(39, '0');

it('tells a printed visitor pass apart from a visitor badge', () => {
  expect(parseGateScan(digits('88'))).toEqual({ kind: 'visitor-pass', id: ID });
  expect(parseGateScan(digits('99'))).toEqual({ kind: 'visitor', id: ID });
});

it('gate sends a visitor request to the unit', async () => {
  const fake = await renderApp('/gate/visitors', { role: 'gate', kind: 'gate' });
  fireEvent.change(await screen.findByRole('textbox', { name: /اسم الزائر/ }), { target: { value: 'زائر بالتصريح' } });
  fireEvent.change(screen.getByLabelText('الرقم القومي (اختياري)'), { target: { value: '٣٠١٠١٠١٠١٠١٠١١' } });
  fireEvent.change(screen.getByRole('textbox', { name: /الشخص المطلوب زيارته/ }), { target: { value: 'قائد الوحدة' } });
  fireEvent.change(screen.getByRole('textbox', { name: /سبب الزيارة/ }), { target: { value: 'مقابلة' } });
  await userEvent.click(screen.getByRole('combobox', { name: /فئة الزائر/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'زائر عادي' }));
  await userEvent.click(screen.getByRole('button', { name: /إرسال الطلب إلى الوحدة/ }));
  await waitFor(() => expect(fake.calls.some(c => c.method === 'POST' && c.path === '/api/gate/visitor-passes')).toBe(true));
  const call = fake.calls.find(c => c.method === 'POST' && c.path === '/api/gate/visitor-passes')!;
  expect(call.data).toMatchObject({ name: 'زائر بالتصريح', nationalId: '30101010101011', host: 'قائد الوحدة', purpose: 'مقابلة' });
  expect(call.requestId).toBeTruthy();
  const posted = fake.calls.indexOf(call);
  await waitFor(() => expect(fake.calls.slice(posted).some(c => c.method === 'GET' && c.path === '/api/visitor-passes')).toBe(true));
});

it('unit approves a pending request and the pass is printed', async () => {
  const fake = await renderApp('/visitor-passes');
  await fake.request('POST', '/api/gate/visitor-passes', { name: 'زائر معلق', categoryId: 'c1', purpose: 'تسليم', host: '' }, crypto.randomUUID());
  await userEvent.click(await screen.findByRole('button', { name: 'تحديث البيانات' }));
  await userEvent.click(await screen.findByRole('button', { name: /اعتماد وطباعة التصريح/ }));
  await waitFor(() => expect(fake.documents.some(d => d.type === 'visitor-pass')).toBe(true));
  const decide = fake.calls.find(c => c.method === 'POST' && c.path === '/api/visitor-passes/decide')!;
  expect(decide.data).toMatchObject({ decision: 'approve' });
  expect(fake.documents.find(d => d.type === 'visitor-pass')).toMatchObject({ id: (decide.data as { id: string }).id, mode: 'print' });
});
