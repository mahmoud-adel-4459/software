import SearchIcon from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { allowedItems } from '@/auth/nav';
import { tokens } from '@/theme/tokens';

/** Ctrl+K: jump to any allowed page or run a quick action. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const entries = useMemo((): { key: string; label: string; hint: string; icon: React.ElementType; run: () => void }[] => {
    const pages = allowedItems(session).map((i) => ({ key: i.key, label: i.label, hint: i.hint, icon: i.icon, run: () => navigate(i.to) }));
    return [...pages, { key: 'refresh', label: 'تحديث البيانات', hint: 'إعادة جلب كل القوائم المفتوحة', icon: RefreshIcon, run: () => void queryClient.invalidateQueries() }];
  }, [session, navigate, queryClient]);
  const shown = entries.filter((e) => !q.trim() || `${e.label} ${e.hint}`.includes(q.trim()));
  const go = (run: () => void) => {
    onClose();
    run();
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: '12vh' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.border}` }}>
        <SearchIcon sx={{ color: tokens.textTertiary }} />
        <InputBase
          autoFocus
          fullWidth
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) go(shown[0].run);
          }}
          placeholder="انتقل إلى صفحة أو نفّذ إجراءً…"
          inputProps={{ 'aria-label': 'بحث سريع' }}
        />
      </Box>
      <List sx={{ maxHeight: 360, overflowY: 'auto', py: 0.5 }}>
        {shown.map((e) => (
          <ListItemButton key={e.key} onClick={() => go(e.run)}>
            <ListItemIcon sx={{ minWidth: 40, color: tokens.primary }}>
              <e.icon />
            </ListItemIcon>
            <ListItemText primary={e.label} secondary={e.hint} />
          </ListItemButton>
        ))}
        {!shown.length && <Box sx={{ p: 3, textAlign: 'center', color: tokens.textSecondary }}>لا توجد نتائج</Box>}
      </List>
    </Dialog>
  );
}
