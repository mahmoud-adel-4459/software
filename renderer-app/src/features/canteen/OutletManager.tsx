import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import StoreIcon from '@mui/icons-material/StorefrontOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import type { Outlet, OutletKind } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { ExcelButtons } from '@/components/ExcelButtons';
import { ConfirmDialog } from '@/components/interactive';
import { sheetWorkbook } from '@/lib/excel';
import { OUTLET_LABELS } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { tokens } from '@/theme/tokens';

/** Admin-only add / edit / delete of the outlets of one kind (canteen or buffet), shown on the ledger page. */
export function OutletManager({ kind }: { kind: OutletKind }) {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const label = OUTLET_LABELS[kind];
  const outlets = (catalog.data?.outletsAll ?? catalog.data?.outlets[kind] ?? []).filter((o) => o.kind === kind);
  const [editing, setEditing] = useState<Outlet | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Outlet | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog'] });

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError('');
    try {
      await api.outletDelete(deleting.id);
      notify.success(`تم حذف ${label}`);
      setDeleting(null);
      await refresh();
    } catch (e) {
      setDeleteError(`${errorMessage(e)} — يمكنك تعطيل نقطة البيع بدلًا من حذفها.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={`إدارة ${kind === 'buffet' ? 'البوفيهات' : 'الكانتينات'}`}
      subtitle="إضافة وتعديل وحذف نقاط البيع (للمسؤول فقط)"
      icon={StoreIcon}
      action={
        <Stack direction="row" spacing={1}>
          <ExcelButtons build={() => sheetWorkbook(`${label}-نقاط-البيع`, `نقاط ${label}`, [{ header: 'الاسم', key: 'name', width: 30 }, { header: 'النوع', key: 'kind' }, { header: 'الحالة', key: 'state' }],
            outlets.map((o) => ({ name: o.name, kind: label, state: o.disabled ? 'معطل' : 'نشط' })))} />
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>إضافة</Button>
        </Stack>
      }
    >
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
        {outlets.length === 0 && <Alert severity="info">لا توجد نقاط بيع بعد — أضف أول {label}.</Alert>}
        {outlets.map((o) => (
          <Chip
            key={o.id}
            label={`${o.name}${o.disabled ? ' (معطل)' : ''}`}
            variant="outlined"
            sx={{ height: 40, pl: 0.5, opacity: o.disabled ? 0.65 : 1, borderColor: o.disabled ? tokens.border : tokens.gold, '& .MuiChip-label': { fontWeight: 600 } }}
            icon={<StoreIcon />}
            deleteIcon={<DeleteIcon aria-label={`حذف ${o.name}`} />}
            onDelete={() => { setDeleteError(''); setDeleting(o); }}
            onClick={() => setEditing(o)}
            avatar={undefined}
            aria-label={`تعديل ${o.name}`}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mt: 1, color: tokens.textSecondary, alignItems: 'center' }}>
        <EditIcon sx={{ fontSize: 14 }} /><span style={{ fontSize: 12 }}>اضغط على الاسم للتعديل أو أيقونة السلة للحذف.</span>
      </Stack>
      {editing && <OutletDialog kind={kind} outlet={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog open={Boolean(deleting)} title={`حذف ${label}`} tone="danger" confirmLabel="حذف" loading={busy}
        message={deleting ? <>سيُحذف «{deleting.name}» نهائيًا. لا يمكن الحذف إذا كانت له عمليات أو كان آخر نقطة بيع نشطة أو الافتراضية.</> : ''}
        onClose={() => setDeleting(null)} onConfirm={() => void remove()}>
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
      </ConfirmDialog>
    </SectionCard>
  );
}

function OutletDialog({ kind, outlet, onClose, onSaved }: { kind: OutletKind; outlet: Outlet | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const label = OUTLET_LABELS[kind];
  const [name, setName] = useState(outlet?.name ?? '');
  const [disabled, setDisabled] = useState(outlet?.disabled ?? false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return notify.error('أدخل اسم نقطة البيع');
    setBusy(true);
    try {
      if (outlet) {
        const body: { id: string; name?: string; disabled?: boolean } = { id: outlet.id };
        if (trimmed !== outlet.name) body.name = trimmed;
        if (disabled !== outlet.disabled) body.disabled = disabled;
        await api.outletUpdate(body);
      } else {
        await api.outletCreate({ kind, name: trimmed });
      }
      notify.success(outlet ? 'تم حفظ التعديل' : `تمت إضافة ${label}`);
      await onSaved();
      onClose();
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" component="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <DialogTitle>{outlet ? `تعديل ${label}` : `إضافة ${label}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={`اسم ${label}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {outlet && <FormControlLabel control={<Switch checked={disabled} onChange={(_e, c) => setDisabled(c)} />} label="تعطيل نقطة البيع" />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button type="submit" variant="contained" loading={busy}>حفظ</Button>
      </DialogActions>
    </Dialog>
  );
}
