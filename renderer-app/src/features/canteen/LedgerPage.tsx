import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import SumIcon from '@mui/icons-material/PaymentsOutlined';
import ListIcon from '@mui/icons-material/FormatListNumberedOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import type { LedgerTransaction, OutletKind, Soldier } from '@/api/types';
import { KpiCard, PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { DocButtons } from '@/components/DocButtons';
import { SelectField } from '@/components/Fields';
import { ConfirmDialog, RowActions, ToneChip } from '@/components/interactive';
import { SoldierLookup } from '@/components/SoldierLookup';
import { cash, formatDateTime, monthNow, OUTLET_LABELS, parseCents } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { ExcelButtons } from '@/components/ExcelButtons';
import { CANTEEN_IMPORT, sheetWorkbook } from '@/lib/excel';
import { OutletManager } from './OutletManager';
import { useAuth } from '@/auth/AuthContext';

/** Canteen/buffet ledger: outlet, soldier, purchase, monthly statement, receipts and reversals. */
export function LedgerPage({ kind }: { kind: OutletKind }) {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const outlets = catalog.data?.outlets[kind] ?? [];
  const [outletPick, setOutletPick] = useState('');
  const outletId = outletPick || outlets[0]?.id || '';
  const [soldier, setSoldier] = useState<Soldier | null>(null);
  const [month, setMonth] = useState(monthNow());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [reversing, setReversing] = useState<LedgerTransaction | null>(null);
  const [reason, setReason] = useState('');
  const label = OUTLET_LABELS[kind];
  const { isAdmin } = useAuth();

  const ledger = useQuery({
    queryKey: ['ledger', soldier?.id, month, outletId],
    queryFn: () => api.ledger({ soldierId: soldier!.id, month, outletId }),
    enabled: Boolean(soldier && outletId),
  });
  const rows = ledger.data?.transactions ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ledger'] });

  const purchase = useIdempotentPost<{ soldierId: string; outletId: string; amountCents: number; notes: string }, { id: string }>('/api/canteen', {
    onSuccess: async (res) => {
      setAmount('');
      setNotes('');
      notify.success('تم تسجيل المشتريات');
      if (res?.id) {
        try {
          await api.document({ type: 'canteen', id: res.id, mode: 'print' });
        } catch (error) {
          notify.error(`تم حفظ العملية، لكن تعذرت الطباعة: ${errorMessage(error)}. أعد طباعة الإيصال من قائمة العمليات بدون تسجيل المبلغ مرة أخرى.`);
        }
      }
      await refresh();
    },
    onError: notify.apiError,
  });
  const reverse = useIdempotentPost<{ id: string; reason: string }>('/api/canteen/reverse', {
    onSuccess: async () => {
      setReversing(null);
      setReason('');
      notify.success('تم عكس العملية');
      await refresh();
    },
    onError: notify.apiError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseCents(amount.trim());
    if (!cents) return notify.error('أدخل مبلغًا موجبًا بدقة قرشين');
    purchase.mutate({ soldierId: soldier!.id, outletId, amountCents: cents, notes });
  };
  const columns: Column<LedgerTransaction>[] = [
    { field: 'at', headerName: 'التاريخ', width: 170, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'amount_cents', headerName: 'المبلغ', width: 130, renderCell: (c) => <b className="num">{cash(c.value)}</b> },
    { field: 'notes', headerName: 'ملاحظات', flex: 1, minWidth: 160 },
    { field: 'reversed_by', headerName: 'الحالة', width: 150, sortable: false, renderCell: (c) => c.row.reversal_of ? <ToneChip tone="info" label="حركة عكسية" /> : c.row.reversed_by ? <ToneChip tone="neutral" label="تم عكسها" /> : <ToneChip tone="success" label="سارية" /> },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[
      { label: 'معاينة الإيصال', icon: ReceiptIcon, onClick: () => void api.document({ type: 'canteen', id: c.row.id, mode: 'preview' }).catch(notify.apiError) },
      { label: 'طباعة الإيصال', icon: ReceiptIcon, onClick: () => void api.document({ type: 'canteen', id: c.row.id, mode: 'print' }).then(() => notify.success('تم إرسال الطباعة')).catch(notify.apiError) },
      { label: 'عكس العملية', icon: UndoIcon, danger: true, hidden: !(c.row.amount_cents > 0 && !c.row.reversed_by && !c.row.reversal_of), onClick: () => setReversing(c.row) },
    ]} /> },
  ];

  return (
    <>
      <PageHeader title={kind === 'buffet' ? 'البوفيه' : 'الكانتين'} description="تسجيل المشتريات، إيصال، كشف شهري، وعكس العمليات — لكل نقطة بيع على حدة."
        actions={<ExcelButtons importSpec={isAdmin ? CANTEEN_IMPORT : undefined} build={soldier && outletId ? () => sheetWorkbook(`${label}-${month}`, `${label} ${month}`, [{ header: 'التاريخ', key: 'at', width: 22 }, { header: 'المبلغ (ج.م)', key: 'amount' }, { header: 'ملاحظات', key: 'notes', width: 30 }, { header: 'الحالة', key: 'state' }],
          rows.map((t) => ({ at: formatDateTime(t.at), amount: t.amount_cents / 100, notes: t.notes, state: t.reversal_of ? 'حركة عكسية' : t.reversed_by ? 'تم عكسها' : 'سارية' }))) : undefined} />} />
      {isAdmin && <OutletManager kind={kind} />}
      {outlets.length ? (
        <SelectField label={label} value={outletId} onChange={setOutletPick} options={outlets.map((o) => ({ value: o.id, label: o.name }))} />
      ) : (
        <Alert severity="warning">{kind === 'buffet' ? 'لا يوجد بوفيه — أضف بوفيه من الإعدادات (مسؤول).' : 'لا يوجد كانتين — أضف كانتين من الإعدادات (مسؤول).'}</Alert>
      )}
      <div style={{ height: 16 }} />
      <SoldierLookup selected={soldier} onSelect={setSoldier} />
      {outletId && (
        <SectionCard title={`كشف حساب ال${label} الشهري`} subtitle="اختر العسكري والشهر ثم معاينة أو طباعة أو حفظ PDF">
          <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <TextField label="شهر الحساب" type="month" value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 220 }} />
          </Stack>
          {soldier ? (
            <DocButtons doc={{ type: 'canteen-statement', soldierId: soldier.id, month, outletId }} />
          ) : (
            <Alert severity="info">اختر العسكري من البحث أعلاه لتظهر أزرار معاينة وطباعة كشف الحساب.</Alert>
          )}
        </SectionCard>
      )}
      {soldier && outletId && (
        <>
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}><KpiCard label="إجمالي مشتريات الشهر" value={cash(ledger.data?.totalCents ?? 0)} icon={SumIcon} loading={ledger.isPending} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><KpiCard label="عدد العمليات" value={rows.length} icon={ListIcon} tone="blue" loading={ledger.isPending} /></Grid>
          </Grid>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12 }}>
              <SectionCard title="تسجيل مشتريات">
                <Stack component="form" onSubmit={submit} spacing={2} noValidate>
                  <TextField label="المبلغ بالجنيه" value={amount} onChange={(e) => setAmount(e.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal', dir: 'ltr' } }} />
                  <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button type="submit" variant="contained" loading={purchase.isPending}>تسجيل المشتريات</Button>
                </Stack>
              </SectionCard>
            </Grid>
          </Grid>
          <SectionCard title="العمليات" noPadding>
            <DataTable rows={rows} columns={columns} loading={ledger.isFetching} emptyText="لا توجد عمليات في هذا الشهر" emptyHint="سجّل مشتريات جديدة من النموذج أعلاه." />
          </SectionCard>
        </>
      )}
      <ConfirmDialog open={Boolean(reversing)} title="عكس العملية" tone="danger" confirmLabel="عكس العملية" loading={reverse.isPending} confirmDisabled={!reason.trim()}
        message={reversing ? `ستُسجَّل حركة عكسية بقيمة ${cash(reversing.amount_cents)}. لا يمكن عكس العملية مرتين.` : ''}
        onClose={() => setReversing(null)} onConfirm={() => reversing && reverse.mutate({ id: reversing.id, reason })}>
        <TextField label="سبب التصحيح" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
    </>
  );
}
