import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { motion } from 'motion/react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { navSections } from '@/auth/nav';
import { BrandMark } from '@/components/Brand';
import { BRAND_SHORT } from '@/lib/brand';
import { ROLE_LABELS } from '@/lib/format';
import { tokens } from '@/theme/tokens';

export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_COLLAPSED = 84;

/** Brand mark + wordmark. */
export function Logo({ collapsed, subtitle }: { collapsed?: boolean; subtitle?: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: collapsed ? 0 : 1, justifyContent: collapsed ? 'center' : 'flex-start' }}>
      <BrandMark size={collapsed ? 44 : 46} />
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: tokens.onDark, fontWeight: 700, lineHeight: 1.2 }}>{BRAND_SHORT}</Typography>
          <Typography noWrap sx={{ color: tokens.textOnDarkFaint, fontSize: 11 }}>{subtitle}</Typography>
        </Box>
      )}
    </Stack>
  );
}

/** Dark green sidebar with an animated active indicator; collapses to icons. */
export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { session, logout } = useAuth();
  const { pathname } = useLocation();
  const sections = navSections(session);
  const activeKey =
    sections.flatMap((s) => s.items).find((i) => pathname === i.to)?.key ??
    (pathname.startsWith('/soldiers/') ? 'soldiers' : undefined);
  return (
    <Stack sx={{ height: '100%', background: `linear-gradient(180deg, ${tokens.sidebarFrom}, ${tokens.sidebarTo})`, color: tokens.textOnDarkMuted }}>
      <Box sx={{ p: 2, pt: 2.5 }}>
        <Logo collapsed={collapsed} subtitle={session?.installation} />
      </Box>
      <Box component="nav" aria-label="القائمة الرئيسية" sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
        {sections.map((section) => (
          <Box key={section.label} sx={{ mb: 1.5 }}>
            {collapsed ? (
              <Box sx={{ height: 1, bgcolor: tokens.glassOnDark, my: 1.5 }} />
            ) : (
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: tokens.textOnDarkFaint, px: 1.5, py: 1 }}>{section.label}</Typography>
            )}
            {section.items.map((item) => {
              const active = activeKey === item.key;
              const Icon = item.icon;
              const link = (
                <NavLink
                  key={item.key}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  style={{ textDecoration: 'none', position: 'relative', display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: collapsed ? 0 : '0 12px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: tokens.radius, color: active ? tokens.onDark : tokens.textOnDarkMuted, marginBottom: 2 }}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      style={{ position: 'absolute', inset: 0, borderRadius: tokens.radius, background: tokens.navy700, boxShadow: tokens.shadow.activeNav, border: `1px solid ${tokens.glassOnDark}` }}
                    />
                  )}
                  {active && <span aria-hidden style={{ position: 'absolute', insetBlock: 8, insetInlineStart: 0, width: 3, borderRadius: 3, background: tokens.gold }} />}
                  <Icon sx={{ fontSize: 21, position: 'relative', color: active ? tokens.goldLight : undefined }} />
                  {!collapsed && <span style={{ position: 'relative', fontSize: 14, fontWeight: active ? 700 : 500 }}>{item.label}</span>}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={item.key} title={item.label} placement="left">
                  {link}
                </Tooltip>
              ) : (
                link
              );
            })}
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.5, m: 1.5, borderRadius: `${tokens.radius}px`, bgcolor: tokens.glassOnDark, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: tokens.navy600, color: tokens.onDark, fontSize: 15 }}>{session?.user.name.slice(0, 1)}</Avatar>
        {!collapsed && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ color: tokens.onDark, fontSize: 13, fontWeight: 700 }}>{session?.user.name}</Typography>
            <Typography noWrap sx={{ color: tokens.textOnDarkFaint, fontSize: 11 }}>
              {session ? `${ROLE_LABELS[session.user.role]} · ${session.kind === 'gate' ? 'جهاز البوابة' : 'الجهاز الداخلي'}` : ''}
            </Typography>
          </Box>
        )}
        {!collapsed && (
          <Tooltip title="تسجيل الخروج">
            <IconButton aria-label="تسجيل الخروج" onClick={() => void logout()} sx={{ color: tokens.textOnDarkMuted }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
}
