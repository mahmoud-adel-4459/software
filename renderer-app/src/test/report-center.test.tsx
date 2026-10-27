import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from './harness';

it('builds an analytic report, exports a multi-sheet Excel and prints it on a chosen external printer', async () => {
  const fake = await renderApp('/report-center');
  await screen.findByRole('heading', { name: 'مركز التقارير', level: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'لا شيء' }));
  await userEvent.click(screen.getByRole('button', { name: 'البوابة والتصاريح' }));
  await userEvent.click(screen.getByRole('button', { name: 'إنشاء التقرير' }));

  expect(await screen.findByText('الملخص التنفيذي')).toBeInTheDocument();
  const build = fake.calls.find((c) => c.method === 'GET' && c.path.startsWith('/api/reports/build'))!;
  expect(build.path).toContain('subject=unit');
  expect(build.path).toContain('topics=gate');
  expect(build.path).toContain('compare=1');
  expect(screen.getByText(/متأخرون عن موعد العودة: 1/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(fake.excelFiles).toHaveLength(1));
  const sheets = fake.excelFiles[0]!.arg.sheets;
  expect(sheets[0]!.name).toBe('الملخص');
  const reasons = sheets.find((s) => s.name.includes('حسب سبب الخروج'))!;
  expect(reasons.columns.find((c) => c.key === 'count')).toMatchObject({ format: 'number', total: 'sum' });

  await userEvent.click(screen.getByRole('button', { name: 'طباعة…' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('combobox', { name: /الطابعة/ }));
  await userEvent.click(await screen.findByRole('option', { name: /طابعة المكتب/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'طباعة' }));
  await waitFor(() => expect(fake.documents.some((d) => d.type === 'analytic-report' && d.mode === 'print')).toBe(true));
  const printed = fake.documents.find((d) => d.type === 'analytic-report' && d.mode === 'print')!;
  expect(printed).toMatchObject({ printer: 'Printer-1', printCopies: 1, query: { subject: 'unit', topics: 'gate', compare: '1' } });
}, 60000);
