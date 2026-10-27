import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Slide, ToastContainer } from 'react-toastify';
import { api } from '@/api/endpoints';
import type { Session } from '@/api/types';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ProtectedRoute, RequireAccess } from '@/auth/guards';
import { homePath } from '@/auth/nav';
import { AppLayout } from '@/layout/AppLayout';
import { ThemeRegistry } from '@/theme/ThemeRegistry';
import { LoginPage } from '@/features/login/LoginPage';
import { SetupWizard, setupRequired } from '@/features/login/SetupWizard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lazy(() => loader().then((m) => ({ default: m[name] as ComponentType<any> })));

const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const GatePage = page(() => import('@/features/gate/GatePage'), 'GatePage');
const MovementsPage = page(() => import('@/features/gate/MovementsPage'), 'MovementsPage');
const SoldiersPage = page(() => import('@/features/soldiers/SoldiersPage'), 'SoldiersPage');
const SoldierProfilePage = page(() => import('@/features/soldiers/SoldierProfilePage'), 'SoldierProfilePage');
const SoldierFormPage = page(() => import('@/features/soldiers/SoldierFormPage'), 'SoldierFormPage');
const VisitorsPage = page(() => import('@/features/visitors/VisitorsPage'), 'VisitorsPage');
const LedgerPage = page(() => import('@/features/canteen/LedgerPage'), 'LedgerPage');
const FitnessPage = page(() => import('@/features/fitness/FitnessPage'), 'FitnessPage');
const ReportsPage = page(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const DailyReportPage = page(() => import('@/features/reports/DailyReportPage'), 'DailyReportPage');
const ReportCenterPage = page(() => import('@/features/reports/ReportCenterPage'), 'ReportCenterPage');
const PrintingPage = page(() => import('@/features/printing/PrintingPage'), 'PrintingPage');
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const UsersPage = page(() => import('@/features/users/UsersPage'), 'UsersPage');
const BackupsPage = page(() => import('@/features/backups/BackupsPage'), 'BackupsPage');
const ImportPage = page(() => import('@/features/import/ImportPage'), 'ImportPage');
const AuditPage = page(() => import('@/features/audit/AuditPage'), 'AuditPage');

function Loading() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
      <CircularProgress />
    </Box>
  );
}

function Home() {
  const { session } = useAuth();
  return <Navigate to={homePath(session)} replace />;
}

/** All routes (HashRouter-compatible; pages load lazily). */
export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route element={<RequireAccess />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/gate" element={<GatePage />} />
              <Route path="/movements" element={<MovementsPage />} />
              <Route path="/soldiers" element={<SoldiersPage />} />
              <Route path="/soldiers/new" element={<SoldierFormPage />} />
              <Route path="/soldiers/:id" element={<SoldierProfilePage />} />
              <Route path="/soldiers/:id/edit" element={<SoldierFormPage />} />
              <Route path="/visitors" element={<VisitorsPage />} />
              <Route path="/canteen" element={<LedgerPage kind="canteen" />} />
              <Route path="/buffet" element={<LedgerPage kind="buffet" />} />
              <Route path="/fitness" element={<FitnessPage />} />
              <Route path="/daily-report" element={<DailyReportPage />} />
              <Route path="/report-center" element={<ReportCenterPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/printing" element={<PrintingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/backups" element={<BackupsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Home />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 }, mutations: { retry: 0 } } });
}

/** Theme + data + auth + toasts around any router (tests pass a MemoryRouter). */
export function Providers({ children, client, router, session }: { children: ReactNode; client?: QueryClient; router?: (c: ReactNode) => ReactNode; session?: Session | null }) {
  const qc = useMemo(() => client ?? createQueryClient(), [client]);
  const wrap = router ?? ((c: ReactNode) => <HashRouter>{c}</HashRouter>);
  return (
    <ThemeRegistry>
      <QueryClientProvider client={qc}>
        <AuthProvider initial={session ?? null}>{wrap(children)}</AuthProvider>
        <ToastContainer nonce={document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content} position="top-left" rtl autoClose={3500} transition={Slide} closeOnClick pauseOnFocusLoss={false} />
      </QueryClientProvider>
    </ThemeRegistry>
  );
}

/** Boot: reads app info, shows the first-run wizard when needed, otherwise the routes. */
export function Boot() {
  const info = useQuery({ queryKey: ['info'], queryFn: api.info, retry: false });
  const [done, setDone] = useState(false);
  if (info.isPending) return <Loading />;
  if (info.isError) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography variant="h4">{info.error.message}</Typography>
      </Box>
    );
  }
  if (!done && setupRequired(info.data)) return <SetupWizard info={info.data} onDone={() => setDone(true)} />;
  return <AppRoutes />;
}

export function App() {
  return (
    <Providers>
      <Boot />
    </Providers>
  );
}
