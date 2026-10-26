import ArrowIcon from '@mui/icons-material/ArrowForwardOutlined';
import Button from '@mui/material/Button';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { Session } from '@/api/types';
import { canOpen, homePath } from '@/auth/nav';

interface Visit { key: string; path: string }

/** Tracks navigation inside the signed-in layout so Back never returns to the login screen. */
export function NavigationBackButton({ session }: { session: Session | null }) {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[]>([{ key: location.key, path: location.pathname + location.search }]);
  useEffect(() => {
    setVisits(previous => {
      const current = { key: location.key, path: location.pathname + location.search };
      if (previous.at(-1)?.key === current.key) return previous;
      const index = previous.findIndex(visit => visit.key === current.key);
      if (action === 'POP') return index >= 0 ? previous.slice(0, index + 1) : [current];
      if (action === 'REPLACE') return [...previous.slice(0, -1), current];
      return [...previous, current];
    });
  }, [location.key, location.pathname, location.search, action]);
  const fallback = location.pathname.startsWith('/soldiers/') ? '/soldiers' : homePath(session);
  const previous = visits.at(-2);
  const canGoBack = Boolean(previous && canOpen(session, previous.path.split('?')[0]));
  const back = () => {
    if (canGoBack) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <Button variant="tonal" size="small" startIcon={<ArrowIcon />} onClick={back}
      disabled={!canGoBack && location.pathname === fallback}
      sx={{ flexShrink: 0, minWidth: 85 }}>
      رجوع
    </Button>
  );
}
