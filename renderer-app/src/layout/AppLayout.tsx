import ChevronIcon from '@mui/icons-material/ChevronRightOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/MenuOutlined';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import WifiOffIcon from '@mui/icons-material/WifiOffOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { navSections } from '@/auth/nav';
import { CommandPalette } from '@/components/CommandPalette';
import { VisitorPassAlert } from '@/features/visitor-passes/shared';
import { ROLE_LABELS } from '@/lib/format';
import { tokens } from '@/theme/tokens';
import { Logo, SIDEBAR_COLLAPSED, SIDEBAR_WIDTH, SidebarContent } from './Sidebar';
import { NavigationBackButton } from './NavigationBackButton';

const COLLAPSE_KEY = 'ma.sidebar.collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Sidebar + sticky blurred header (breadcrumb, Ctrl+K, refresh, account) + animated page outlet. */
export function AppLayout() {
  const { session, logout, deviceRejected } = useAuth();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const wide = useMediaQuery('(min-width:1200px)');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const sections = navSections(session);
  const crumb = sections
    .map((s) => ({ section: s.label, item: s.items.find((i) => i.to === pathname) }))
    .find((x) => x.item) ?? (pathname.startsWith('/soldiers/') ? { section: 'السجل', item: { label: 'ملف عسكري' } } : null);
  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100%', bgcolor: tokens.bg }}>
      {wide && (
        <Box component="aside" sx={{ width, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', transition: 'width .2s' }}>
          <SidebarContent collapsed={collapsed} />
        </Box>
      )}
      {!wide && (
        <Drawer anchor="right" open={drawer} onClose={() => setDrawer(false)} slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH } } }}>
          <SidebarContent collapsed={false} onNavigate={() => setDrawer(false)} />
        </Drawer>
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box component="header" className="print-hide" sx={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 1.5, md: 3 }, height: 64, bgcolor: tokens.headerBlur, backdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${tokens.border}` }}>
          <IconButton aria-label="طي القائمة" onClick={wide ? toggle : () => setDrawer(true)} sx={{ border: `1px solid ${tokens.border}`, bgcolor: tokens.surface, boxShadow: tokens.shadow.sm }}>
            <MenuIcon />
          </IconButton>
          <NavigationBackButton session={session} />
          {!wide && <Logo collapsed />}
          <Stack direction="row" spacing={0.5} aria-label="مسار الصفحة" sx={{ alignItems: 'center', flex: 1, minWidth: 0, color: tokens.textSecondary }}>
            <Typography variant="body2" noWrap>منظومة شؤون الوحدة الداخلية</Typography>
            {crumb && (
              <>
                <ChevronIcon sx={{ fontSize: 18, transform: 'scaleX(-1)' }} />
                <Typography variant="body2" noWrap>{crumb.section}</Typography>
                <ChevronIcon sx={{ fontSize: 18, transform: 'scaleX(-1)' }} />
                <Typography variant="body2" noWrap sx={{ fontWeight: 800, color: tokens.text }}>{crumb.item?.label}</Typography>
              </>
            )}
          </Stack>
          <VisitorPassAlert session={session} />
          {deviceRejected && <Chip size="small" icon={<WifiOffIcon />} label="جهاز غير معتمد" sx={{ bgcolor: tokens.redSoft, color: tokens.redInk }} />}
          <Button onClick={() => setPalette(true)} startIcon={<SearchIcon />} sx={{ display: { xs: 'none', md: 'inline-flex' }, width: 300, justifyContent: 'flex-start', bgcolor: tokens.surface, border: `1px solid ${tokens.border}`, color: tokens.textTertiary, boxShadow: tokens.shadow.sm, '&:hover': { bgcolor: tokens.surface } }}>
            <Box sx={{ flex: 1, textAlign: 'start' }}>بحث سريع…</Box>
            <Box component="kbd" sx={{ px: 0.75, border: `1px solid ${tokens.border}`, borderRadius: '4px', fontSize: 11, direction: 'ltr' }}>Ctrl K</Box>
          </Button>
          <IconButton aria-label="تحديث البيانات" onClick={() => void queryClient.invalidateQueries()} sx={{ border: `1px solid ${tokens.border}`, bgcolor: tokens.surface, boxShadow: tokens.shadow.sm }}>
            <RefreshIcon className={fetching ? 'spin-sweep' : undefined} />
          </IconButton>
          <IconButton aria-label="الحساب" onClick={(e) => setMenu(e.currentTarget)} sx={{ p: 0.5 }}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: tokens.primary, fontSize: 15 }}>{session?.user.name.slice(0, 1)}</Avatar>
          </IconButton>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>{session?.user.name}</Typography>
              <Typography variant="caption">{session ? `${ROLE_LABELS[session.user.role]} · @${session.user.username}` : ''}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={() => void logout()} sx={{ color: tokens.redInk }}>
              <ListItemIcon sx={{ color: 'inherit' }}><LogoutIcon fontSize="small" /></ListItemIcon>
              تسجيل الخروج
            </MenuItem>
          </Menu>
        </Box>
        <Box component="main" sx={{ flex: 1, p: { xs: 1.5, sm: 2.5, md: 3.5, lg: 4 } }}>
          {/* Enter-only transition: an exit phase would mount the routed page twice and lose its state. */}
          <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
            <Outlet />
          </motion.div>
        </Box>
      </Box>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </Box>
  );
}
