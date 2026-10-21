import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';

/** Lists, report types, outlets and settings needed by most pages (role-dependent). */
export function useCatalog() {
  const { session } = useAuth();
  return useQuery({ queryKey: ['catalog'], queryFn: api.catalog, enabled: Boolean(session), staleTime: 60_000 });
}

/** Gate summary (outside / late), refreshed every 10 seconds. */
export function useSummary() {
  const { session } = useAuth();
  return useQuery({ queryKey: ['summary'], queryFn: api.summary, enabled: Boolean(session), refetchInterval: 10_000 });
}

/** Latest 200 permits, refreshed every 10 seconds. */
export function usePermits() {
  const { session } = useAuth();
  return useQuery({ queryKey: ['permits'], queryFn: api.permits, enabled: Boolean(session), refetchInterval: 10_000 });
}
