import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { homePath } from '@/auth/nav';
import { RhfText } from '@/components/Fields';
import { BrandMark } from '@/components/Brand';
import { BRAND_NAME, BRAND_SUBTITLE } from '@/lib/brand';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';
import { ConnectionPanel } from './ConnectionPanel';

const schema = z.object({
  username: z.string().trim().min(1, 'أدخل اسم المستخدم'),
  password: z.string().min(1, 'أدخل كلمة المرور'),
});
type Values = z.infer<typeof schema>;

/** Sign-in screen with the server connection settings below it. */
export function LoginPage() {
  const { session, login, notice, clearNotice, deviceRejected } = useAuth();
  const navigate = useNavigate();
  const info = useQuery({ queryKey: ['info'], queryFn: api.info });
  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  if (session) return <Navigate to={homePath(session)} replace />;

  const submit = handleSubmit(async (v) => {
    try {
      const s = await login(v.username, v.password);
      clearNotice();
      navigate(homePath(s), { replace: true });
    } catch (e) {
      notify.apiError(e);
    }
  });

  return (
    <Box sx={{ minHeight: '100%', display: 'grid', placeItems: 'center', p: 2, py: 4, background: `linear-gradient(160deg, ${tokens.navyDeep} 0%, ${tokens.navyMid} 45%, ${tokens.sidebarFrom} 100%)` }}>
      <Box sx={{ width: '100%', maxWidth: 520 }}>
        <Stack spacing={1.5} sx={{ alignItems: 'center', mb: 3, textAlign: 'center' }}>
          <BrandMark size={240} glow />
          <Typography variant="h1" component="h1" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{BRAND_NAME}</Typography>
          <Box aria-hidden sx={{ width: 120, height: 3, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${tokens.gold}, ${tokens.goldLight}, ${tokens.gold}, transparent)` }} />
          <Typography variant="body2" sx={{ color: tokens.goldLight, fontWeight: 600 }}>{BRAND_SUBTITLE}</Typography>
        </Stack>
        <Card sx={{ p: 4, borderTop: `3px solid ${tokens.gold}` }}>
          {notice && <Alert severity="warning" sx={{ mb: 2 }}>{notice}</Alert>}
          {deviceRejected && <Alert severity="error" sx={{ mb: 2 }}>جهاز غير معتمد — هذا الجهاز غير مدرج في الترخيص.</Alert>}
          <Stack component="form" spacing={2} onSubmit={submit} noValidate>
            <RhfText control={control} name="username" label="اسم المستخدم" autoFocus autoComplete="username" />
            <RhfText control={control} name="password" label="كلمة المرور" type="password" autoComplete="current-password" />
            <Button type="submit" variant="contained" size="large" loading={formState.isSubmitting}>تسجيل الدخول</Button>
            <Typography variant="caption" color="text.secondary">
              {info.data?.playMode ? 'بيانات تجريبية (3 عسكريين). كلمة المرور في play-login.txt' : 'يحدد الخادم صلاحيات المستخدم والجهاز. لا توجد كلمة مرور افتراضية.'}
            </Typography>
          </Stack>
        </Card>
        {info.data && <ConnectionPanel info={info.data} />}
      </Box>
    </Box>
  );
}
