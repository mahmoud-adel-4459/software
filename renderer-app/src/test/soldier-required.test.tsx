import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import defaults from '../../../tests/fixtures/complete-soldier.json';
import { DETAIL_FIELDS } from '@/lib/soldierProfile';
import { renderApp } from './harness';

it('requires every field and all four photos, then saves them in one request', async () => {
  const fake = await renderApp('/soldiers/new');
  await screen.findByRole('heading', { name: 'إضافة عسكري', level: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'حفظ العسكري' }));
  expect(await screen.findByText('رقم الهاتف مطلوب')).toBeInTheDocument();
  expect(fake.calls.some((call) => call.method === 'POST')).toBe(false);
  expect(screen.getByText('الرتبة مطلوبة')).toBeInTheDocument();
  const basics = [['name', 'الاسم الرباعي'], ['militaryNo', 'الرقم العسكري'], ['nationalId', 'الرقم القومي'], ['company', 'السرية'], ['unit', 'الوحدة'], ['phone', 'رقم الهاتف'], ['address', 'العنوان المدني']] as const;
  await act(async () => {
    for (const [key, label] of basics) fireEvent.change(screen.getByLabelText(new RegExp(`^${label}\\s*\\*?$`)), { target: { value: defaults[key] } });
    for (const [key, label] of Object.entries(DETAIL_FIELDS)) fireEvent.change(screen.getByLabelText(new RegExp(`^${label}\\s*\\*?$`)), { target: { value: defaults.details[key as keyof typeof defaults.details] } });
    fireEvent.change(screen.getByLabelText('الوحدة الفرعية'), { target: { value: 'الفصيلة الثانية' } });
  });
  // Grade and rank are picked from the lists managed in Settings.
  for (const [label, choice] of [['الدرجة', 'مجند'], ['الرتبة', 'عريف']] as const) {
    await userEvent.click(screen.getByRole('combobox', { name: new RegExp(`^${label}`) }));
    await userEvent.click(await screen.findByRole('option', { name: choice }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'حفظ العسكري' }));
  expect(await screen.findByText(/الصور الناقصة:/)).toBeInTheDocument();
  expect(fake.calls.some((call) => call.method === 'POST')).toBe(false);
  for (const photo of defaults.photos) {
    fake.pickAttachment = async () => ({ ok: true, data: photo });
    const slot = document.querySelector(`[data-photo-kind="${photo.kind}"]`) as HTMLElement;
    await userEvent.click(within(slot).getByRole('button', { name: 'اختيار' }));
    await within(slot).findByRole('img');
  }
  await userEvent.click(screen.getByRole('button', { name: 'حفظ العسكري' }));
  await waitFor(() => expect(fake.calls.filter((call) => call.method === 'POST' && call.path === '/api/soldiers')).toHaveLength(1));
  expect(fake.calls.find((call) => call.path === '/api/soldiers' && call.method === 'POST')?.data).toMatchObject({ rank: 'مجند', militaryRank: 'عريف', subUnit: 'الفصيلة الثانية', phone: defaults.phone, address: defaults.address, details: defaults.details, photos: defaults.photos });
  expect(fake.calls.some((call) => call.path === '/api/attachments')).toBe(false);
}, 60000);
