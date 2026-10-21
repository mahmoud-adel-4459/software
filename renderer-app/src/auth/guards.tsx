import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canOpen, homePath } from './nav';

/** Redirects to /login when signed out. */
export function ProtectedRoute() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Redirects to the role's home page when the current path is not allowed for the session. */
export function RequireAccess() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!canOpen(session, pathname)) return <Navigate to={homePath(session)} replace />;
  return <Outlet />;
}

/** Hides children unless the session satisfies `when` (no disabled controls for forbidden actions). */
export function Can({ when, children }: { when: boolean; children: React.ReactNode }) {
  return when ? <>{children}</> : null;
}
