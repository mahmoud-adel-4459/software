import { zodResolver } from '@hookform/resolvers/zod';
import AutoFixIcon from '@mui/icons-material/AutoFixHighOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import AdminIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import GateIcon from '@mui/icons-material/MeetingRoomOutlined';
import CartIcon from '@mui/icons-material/ShoppingCartOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/endpoints';
import { post } from '@/api/client';
import type { Role, UserRow } from '@/api/types';
import { KpiCard, PageHeader } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RhfText } from '@/components/Fields';
import { RowActions, ToneChip } from '@/components/interactive';
import { ROLE_LABELS } from '@/lib/format';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';
import { ExcelButtons } from '@/components/ExcelButtons';
import { sheetWorkbook } from '@/lib/excel';

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'gate', label: 'مناوب بوابة', hint: 'تسجيل خروج ودخول العسكري والزوار — من جهاز البوابة أو الداخلي.' },
  { id: 'clerk', label: 'كاشير', hint: 'الكانتين والبوفيه وتقاريرهم فقط — بدون عسكريين أو إعدادات.' },
  { id: 'admin', label: 'مسؤول النظام', hint: 'صلاحية كاملة: عسكريون، نسخ، مستخدمون، وإعدادات الوحدة.' },
];

const CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
/** Random 14-character password (no look-alike characters). */
export function generatePassword(): string {
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => CHARS[n % CHARS.length]).join('');
}

const createSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,40}$/, 'اسم المستخدم: 3–40 حرفًا (حروف إنجليزية، أرقام، . _ -)'),
  name: z.string().trim().min(2, 'أدخل الاسم المعروض (حرفان على الأقل)'),
  password: z.string().min(12, 'كلمة المرور 12 حرفًا على الأقل').max(256),
  role: z.enum(['admin', 'gate', 'clerk']),
});
const editSchema = z.object({
  name: z.string().trim().min(2, 'أدخل الاسم المعروض (حرفان على الأقل)'),
  password: z.string().refine((v) => v === '' || v.length >= 12, 'كلمة المرور الجديدة 12 حرفًا على الأقل'),
  role: z.enum(['admin', 'gate', 'clerk']),
  disabled: z.boolean(),
});

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <Box role="radiogroup" aria-label="الدور والصلاحيات" sx={{ display: 'grid', gap: 1 }}>
      {ROLES.map((r) => (
        <Box key={r.id} component="label" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, cursor: 'pointer', borderRadius: `${tokens.radius}px`, border: `1.5px solid ${value === r.id ? tokens.primary : tokens.border}`, bgcolor: value === r.id ? tokens.primaryLight : tokens.surface }}>
          <Radio size="small" checked={value === r.id} onChange={() => onChange(r.id)} sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': r.label } }} />
          <Box><Typography sx={{ fontWeight: 700 }}>{r.label}</Typography><Typography variant="caption">{r.hint}</Typography></Box>
        </Box>
      ))}
    </Box>
  );
}

/** Accounts: KPIs by role, table, create/edit dialog with role cards and a password generator. */
export function UsersPage() {
  const users = useQuery({ queryKey: ['users'], queryFn: api.users });
  const [dialog, setDialog] = useState<UserRow | 'new' | null>(null);
  const list = users.data ?? [];
  const count = (r: Role) => list.filter((u) => u.role === r && !u.disabled).length;
  const columns: Column<UserRow>[] = [
    { field: 'username', headerName: 'اسم الدخول', width: 170, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 180 },
    { field: 'role', headerName: 'الدور', width: 130, renderCell: (c) => <ToneChip tone={c.row.role === 'admin' ? 'success' : c.row.role === 'clerk' ? 'warning' : 'neutral'} label={ROLE_LABELS[c.row.role]} icon={false} /> },
    { field: 'disabled', headerName: 'الحالة', width: 120, renderCell: (c) => <ToneChip tone={c.row.disabled ? 'neutral' : 'success'} label={c.row.disabled ? 'معطّل' : 'نشط'} /> },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[{ label: 'إدارة الحساب', icon: EditIcon, onClick: () => setDialog(c.row) }]} /> },
  ];
  return (
    <>
      <PageHeader title="المستخدمون" description="أنشئ حسابًا، اختر دورًا واضحًا، وسلّم بيانات الدخول لصاحبها."
        actions={<>
          <ExcelButtons build={() => sheetWorkbook('المستخدمون', 'المستخدمون', [{ header: 'اسم الدخول', key: 'username' }, { header: 'الاسم', key: 'name', width: 30 }, { header: 'الدور', key: 'role' }, { header: 'الحالة', key: 'state' }], list.map((u) => ({ username: u.username, name: u.name, role: ROLE_LABELS[u.role], state: u.disabled ? 'معطّل' : 'نشط' })))} />
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setDialog('new')}>حساب جديد</Button>
        </>} />
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="نشط — بوابة" value={count('gate')} icon={GateIcon} tone="blue" loading={users.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="نشط — كاشير" value={count('clerk')} icon={CartIcon} tone="amber" loading={users.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="نشط — مسؤول" value={count('admin')} icon={AdminIcon} tone="green" loading={users.isPending} /></Grid>
      </Grid>
      <Paper variant="outlined"><DataTable rows={list} columns={columns} loading={users.isFetching} onRowClick={setDialog} emptyText="لا توجد حسابات" /></Paper>
      <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>على جهاز البوابة: حتى المسؤول يرى شاشة البوابة فقط. الجهاز الداخلي يفتح القوائم حسب الدور.</Typography>
      {dialog && <UserDialog user={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const reqId = useRef<{ key: string; id: string } | null>(null);
  const [show, setShow] = useState(false);
  const schema = user ? editSchema : createSchema;
  const { control, handleSubmit, setValue, formState } = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema) as never,
    defaultValues: user ? { name: user.name, password: '', role: user.role, disabled: user.disabled } : { username: '', name: '', password: '', role: 'gate' },
  });
  const submit = handleSubmit(async (v) => {
    const body: Record<string, unknown> = user
      ? { id: user.id, name: String(v.name).trim(), role: v.role, disabled: Boolean(v.disabled), ...(v.password ? { password: v.password } : {}) }
      : { username: String(v.username).trim(), name: String(v.name).trim(), password: v.password, role: v.role };
    const key = JSON.stringify(body);
    if (reqId.current?.key !== key) reqId.current = { key, id: crypto.randomUUID() };
    try {
      const res = await post<{ username?: string; role: Role }>(user ? '/api/users/update' : '/api/admin/users', body, reqId.current.id);
      reqId.current = null;
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      notify.success(user ? 'تم تحديث الحساب' : `تم إنشاء حساب «${res.username}» — ${ROLE_LABELS[res.role]}`);
      onClose();
    } catch (e) {
      notify.apiError(e);
    }
  });
  const gen = () => {
    setValue('password', generatePassword(), { shouldValidate: true });
    setShow(true);
    notify.info('تم اقتراح كلمة مرور — انسخها قبل الحفظ');
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" component="form" onSubmit={submit}>
      <DialogTitle>{user ? `تعديل: ${user.username}` : 'حساب جديد'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!user && <RhfText control={control as never} name="username" label="اسم الدخول (username)" slotProps={{ htmlInput: { dir: 'ltr' } }} />}
          <RhfText control={control as never} name="name" label="الاسم المعروض في النظام" />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <RhfText control={control as never} name="password" label={user ? 'كلمة مرور جديدة (اتركها فارغة بدون تغيير)' : 'كلمة المرور'} type={show ? 'text' : 'password'} autoComplete="new-password" helperText="12 حرفًا على الأقل" slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <Tooltip title="اقتراح كلمة مرور"><IconButton aria-label="اقتراح كلمة مرور" onClick={gen}><AutoFixIcon /></IconButton></Tooltip>
          </Stack>
          <Controller control={control} name="role" render={({ field }) => <RolePicker value={field.value as Role} onChange={field.onChange} />} />
          {user && <Controller control={control} name="disabled" render={({ field }) => <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(_e, c) => field.onChange(c)} />} label="تعطيل الحساب (لا يستطيع تسجيل الدخول)" />} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose}>إلغاء</Button>
        <Button type="submit" variant="contained" loading={formState.isSubmitting}>{user ? 'حفظ التعديلات' : 'إنشاء الحساب'}</Button>
      </DialogActions>
    </Dialog>
  );
}
